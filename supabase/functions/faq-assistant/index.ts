import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { errorMessage } from '../_shared/errors.ts';

// ─────────────────────────────────────────────────────────────────────
// Grounded FAQ assistant
//
// This used to answer from a hardcoded FAQ_KNOWLEDGE_BASE array and
// report the model itself as a citation:
//
//     sources: [{ category: 'Groq AI Assistant' }]
//
// Presenting a language model as a source is a fabricated citation, and
// the hardcoded answers drifted out of date (they still described a
// "Pay Now" button the portal does not have). Answers are now retrieved
// from the real faq_articles table, and `sources` only ever contains rows
// that actually exist in that table.
// ─────────────────────────────────────────────────────────────────────

const EMBEDDING_DIM = 384;
const MATCH_COUNT = 5;
const SIMILARITY_THRESHOLD = 0.5;

// Lazy-loaded MiniLM encoder. 384 dims, matching the vector(384) column
// and match_faq_articles() signature in database/supabase-schema-v3-rag.sql.
let encoderPromise: Promise<(text: string) => Promise<number[]>> | null = null;

async function getEncoder() {
  if (!encoderPromise) {
    encoderPromise = (async () => {
      const { pipeline, env } = await import(
        'https://esm.sh/@xenova/transformers@2.17.2'
      );
      env.allowLocalModels = false;
      const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
      return async (text: string): Promise<number[]> => {
        const output = await extractor(text, { pooling: 'mean', normalize: true });
        return Array.from(output.data as Float32Array);
      };
    })().catch((err) => {
      console.error('embedding model unavailable, falling back to keyword search', err);
      encoderPromise = null;
      throw err;
    });
  }
  return encoderPromise;
}

async function embed(text: string): Promise<number[] | null> {
  try {
    const encode = await getEncoder();
    const vector = await encode(text);
    return vector.length === EMBEDDING_DIM ? vector : null;
  } catch {
    return null;
  }
}

interface FaqRow {
  id: string;
  category: string;
  question: string;
  answer: string;
  keywords: string | null;
  similarity: number | null;
}

async function semanticSearch(
  supabase: any,
  question: string,
  vector: number[],
): Promise<FaqRow[] | null> {
  const { data, error } = await supabase.rpc('match_faq_articles', {
    query_embedding: vector,
    match_count: MATCH_COUNT,
    match_threshold: SIMILARITY_THRESHOLD,
  });

  if (error) {
    console.error('match_faq_articles failed', error);
    return null;
  }
  return (data ?? []) as FaqRow[];
}

// Keyword fallback. Still reads the real table, so a citation is still a
// real article. It just matches on text instead of meaning, which is
// narrower and therefore returns fewer rows.
async function keywordSearch(
  supabase: any,
  question: string,
): Promise<FaqRow[]> {
  const terms = question
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2)
    .slice(0, 8);

  if (terms.length === 0) return [];

  const orFilter = terms.map((t) => `question.ilike.%${t}%,keywords.ilike.%${t}%`).join(',');
  const { data, error } = await supabase
    .from('faq_articles')
    .select('id,category,question,answer,keywords')
    .eq('is_active', true)
    .or(orFilter)
    .limit(MATCH_COUNT);

  if (error) {
    console.error('faq keyword search failed', error);
    return [];
  }

  return ((data ?? []) as FaqRow[]).map((row) => ({ ...row, similarity: null }));
}

function buildContext(rows: FaqRow[]): string {
  return rows
    .map(
      (row, index) =>
        `[${index + 1}] (${row.category}) Q: ${row.question}\nA: ${row.answer}`,
    )
    .join('\n\n');
}

// Only rows that exist in faq_articles become citations. No model name,
// no category invented from the question text.
function buildSources(rows: FaqRow[]) {
  return rows.map((row) => ({
    id: row.id,
    category: row.category,
    question: row.question,
    ...(row.similarity !== null ? { similarity: Number(row.similarity.toFixed(3)) } : {}),
  }));
}

// The bot is a self-service tool for "how do I..." questions about the portal
// and the school. It is not a channel to a person: when it cannot answer, the
// client offers a consultation booking instead, which is what actually reaches
// staff. Telling the student to email the Registrar would route around the
// queue that staff are notified through.
const NO_ANSWER =
  'I could not find a published answer to that. This assistant covers how the ' +
  'portal and school processes work. If it is about your own records or ' +
  'something only staff can decide, book a consultation and a member of the ' +
  'Registrar\'s Office will get back to you.';

// The line between what the portal can answer and what needs a person.
//
// A question about the PROCESS is answerable from a published article even when
// it mentions grades or the clinic: "how do I check my grades" and "how do I get
// a medical certificate" are both navigation, and an article can legitimately
// describe both. A question about the student's OWN record, or one needing a
// decision, is not: "my grade is wrong" and "I want to appeal" need a person.
//
// That distinction is the whole design, so it is stated once and applied
// explicitly rather than left to emerge from word lists.
const NAVIGATION = new RegExp(
  '^\\s*(how (do|can|would) i|how to|where (do|can) i|what(\'| i)s the (way|process|step)|'
  + 'steps? to|is there a way to|can i (still|also))',
  'i'
);

// Named so a refusal can be grouped later. A run of refusals sharing one name
// means either an article needs writing for that topic, or the rule is too
// broad and is turning away questions the portal could answer.
//
// exemptNavigation means the rule does not fire on a how-to question. Rules
// that decide a person's status never carry it, because a published article
// should not be the place a dismissal or an appeal is settled.
const OUT_OF_SCOPE_RULES: Array<{
  name: string;
  re: RegExp;
  exemptNavigation?: boolean;
}> = [
  {
    // Asking what a value IS, rather than how to see it.
    name: 'own_record_value',
    re: /\b(my|our)\s+(final\s+|computed\s+|running\s+)?(grade|grades|score|scores|gpa|transcript|balance|account status)\b/i,
    exemptNavigation: true,
  },
  {
    name: 'own_account',
    re: /\b(what|whats|how much)\b[^?]*\b(grade|gpa|balance|owed|refund|shut down|enrolled)\b/i,
    exemptNavigation: true,
  },
  {
    // A personal medical matter, not the process of obtaining a certificate,
    // which the clinic's article can perfectly well describe.
    name: 'medical_record',
    re: /\b(my|our)\s+(diagnosis|result|results|condition|prescription|sick leave|medication)\b/i,
  },
  {
    name: 'disciplinary',
    re: /\b(dismiss|expel|expulsion|suspension|appeal|disciplinary|scholarship|grant)\b/i,
  },
  {
    // Dropping the trailing "my|mine" requirement here: it was meant to
    // confirm the student is talking about their own record, but it made the
    // rule so strict that "can I cancel my enrolled subject" slipped through,
    // since the object of the sentence comes after the possessive. A
    // cancel/drop plus a subject is a record change either way.
    // "how do I cancel a subject" stays answerable, because that is a process
    // question an article can legitimately describe.
    name: 'enrolment_change',
    re: /\b(cancel|change|drop|transfer|shift)\b[^?]*\b(enroll\w*|subject|course|schedule)\b/i,
    exemptNavigation: true,
  },
  {
    // "urgently" does not match \burgent\b, because there is no word boundary
    // before the trailing "ly". That is the word students actually use.
    name: 'urgent',
    re: /\burgen(t|cy|tly)\b|\basap\b|\bimmediate(ly)?\b|\bemergency\b/i,
  },
  {
    name: 'complaint',
    re: /\b(complain|complaint|grievance)\b/i,
  },
];

function matchScope(question: string): string | null {
  const isNavigation = NAVIGATION.test(question);
  for (const rule of OUT_OF_SCOPE_RULES) {
    if (!rule.re.test(question)) continue;
    if (rule.exemptNavigation && isNavigation) continue;
    return rule.name;
  }
  return null;
}

function isOutOfScope(question: string): boolean {
  return matchScope(question) !== null;
}

// ── Audit trail ───────────────────────────────────────────────────────
// chat_logs exists in the schema and was never written to, so there was no
// record of what the assistant was asked or what it answered. That matters
// for a portal that must not give wrong guidance about fees or deadlines: if
// a student acts on a bad answer, this is the only way to find out what was
// said.
//
// The user id is taken from the verified session, never from the request body.
// A client-supplied user_id would let anyone write a question into another
// student's log, which is the one thing an audit trail must not allow.
async function resolveCallerId(
  supabase: any,
  req: Request,
): Promise<string | null> {
  try {
    const header = req.headers.get('Authorization') || '';
    const token = header.replace(/^Bearer\s+/i, '').trim();
    if (!token) return null;

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user?.id) return null;
    return data.user.id as string;
  } catch (error) {
    console.warn('could not resolve caller:', errorMessage(error));
    return null;
  }
}

async function logExchange(
  supabase: any,
  question: string,
  answer: string,
  sources: unknown,
  resolved: boolean,
  userId: string | null,
  extra: Record<string, unknown> = {},
): Promise<void> {
  try {
    await supabase.from('chat_logs').insert({
      user_id: userId,
      user_message: question.slice(0, 2000),
      bot_response: answer.slice(0, 4000),
      // The table has no resolved column, so the outcome rides along inside
      // the existing sources JSON rather than needing an ALTER on a live table.
      sources: { resolved, ...extra, articles: sources },
    });
  } catch (error) {
    console.warn('chat_logs insert failed:', errorMessage(error));
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const { message, history } = await req.json();
    const question = (message || '').trim();
    if (!question) {
      return json({ answer: NO_ANSWER, sources: [], resolved: false });
    }

    // The service role key is required because match_faq_articles() is
    // granted to `authenticated`, and an end user's JWT would otherwise
    // be rejected for a public FAQ table.
    //
    // Built before the scope check, not after: a refusal is the most
    // interesting thing in the log, because a run of refusals on the same
    // topic is the signal that an article is missing.
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    if (!supabaseKey || !supabaseUrl) {
      return json({ error: 'FAQ assistant is not configured' }, 500);
    }

    const { createClient } = await import(
      'https://esm.sh/@supabase/supabase-js@2.45.4'
    );
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });

    // Verified server-side so the audit log is attributable and unforgeable.
    const callerId = await resolveCallerId(supabase, req);

    // Personal records, medical matters and anything urgent are not
    // self-service. Rejected before retrieval so no article is used to answer
    // them, and logged so the school can see what it is being asked.
    if (isOutOfScope(question)) {
      const refusal =
        'That is not something I can answer from published articles, because it ' +
        'concerns your own record or needs a person\'s decision. Book a ' +
        'consultation and a member of the Registrar\'s Office will handle it.';

      await logExchange(supabase, question, refusal, [], false, callerId, {
        refused: true,
        // Which rule fired, so a topic can be grouped in review without
        // re-reading every question.
        scope: matchScope(question) ?? 'unknown',
      });

      return json({ answer: refusal, sources: [], resolved: false, outOfScope: true });
    }

    const vector = await embed(question);
    let rows = vector ? await semanticSearch(supabase, question, vector) : null;
    if (!rows) rows = await keywordSearch(supabase, question);

    if (rows.length === 0) {
      // No article matched. Logged too: these are the questions the published
      // content does not cover, which is the list of articles to write.
      await logExchange(supabase, question, NO_ANSWER, [], false, callerId, {
        refused: false,
        scope: 'no_match',
      });
      return json({ answer: NO_ANSWER, sources: [], resolved: false });
    }

    const groqApiKey = Deno.env.get('GROQ_API_KEY');
    if (!groqApiKey) {
      // No model configured. Return the retrieved articles themselves
      // rather than composing an ungrounded answer.
      const answer = buildContext(rows);
      await logExchange(supabase, question, answer, buildSources(rows), true, callerId);
      return json({ answer, sources: buildSources(rows), resolved: true });
    }

    const systemPrompt = `You are the MyIMCC Portal assistant for Iligan Medical Center College.

Answer ONLY from the ARTICLES section below. These are the institution's published
answers and are the only content you may rely on.

Rules:
- If the articles do not cover the question, say that you could not find a published
  answer and suggest booking a consultation. Do not speculate.
- Never state fees, dates, deadlines, schedules, grade rules or contact details that
  are not written in the articles.
- Do not invent or guess. If the articles are ambiguous, say so and suggest booking
  a consultation.
- Do not describe an online payment button or online payment flow. Payments are
  recorded by Cashier staff.
- You may quote an article and label it, for example "According to the Billing
  handbook article: ...".
- Keep answers concise, in markdown, using **bold** sparingly.

ARTICLES:
${buildContext(rows)}`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...(Array.isArray(history) ? history : []),
      { role: 'user', content: question },
    ];

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages,
        temperature: 0.2,
      }),
    });

    const aiData = await res.json();
    const answer = aiData?.choices?.[0]?.message?.content;

    if (!answer) {
      return json({ error: 'FAQ assistant did not return an answer' }, 502);
    }

    // A model that says it cannot help must not be recorded as an answer the
    // bot gave. The refusal wording is the model's own, so detect it rather
    // than assuming a non-empty reply means the student was helped.
    const lowered = answer.toLowerCase();
    const gaveUp =
      lowered.includes('could not find a published') ||
      lowered.includes('book a consultation') ||
      lowered.includes('do not have that information') ||
      lowered.includes("don't have that information");

    const sources = buildSources(rows);
    await logExchange(supabase, question, answer, sources, !gaveUp, callerId);

    // sources are the retrieved articles, never the model.
    return json({ answer, sources, resolved: !gaveUp });
  } catch (error) {
    return json({ error: errorMessage(error) }, 500);
  }
});
