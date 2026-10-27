import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { errorMessage } from '../_shared/errors.ts';
import { embedFaq } from '../_shared/faq-embedding.ts';

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

const MATCH_COUNT = 5;
const SIMILARITY_THRESHOLD = 0.5;

async function embed(text: string): Promise<number[] | null> {
  try { return await embedFaq(text); }
  catch { console.warn('faq_embedding_unavailable'); return null; }
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
    .filter((t) => t.length > 2 && !['how', 'what', 'where', 'can', 'the', 'for', 'and', 'that', 'this', 'with', 'does', 'are', 'you', 'your', 'about', 'there'].includes(t))
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
    const { error } = await supabase.from('chat_logs').insert({
      user_id: userId,
      user_message: question.slice(0, 2000),
      bot_response: answer.slice(0, 4000),
      // The table has no resolved column, so the outcome rides along inside
      // the existing sources JSON rather than needing an ALTER on a live table.
      sources: { resolved, ...extra, articles: sources },
    });
    if (error) console.warn('faq_audit_write_failed', { code: error.code });
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
    if (req.method !== 'POST') return json({ error: 'Only POST is allowed' }, 405);
    const raw = await req.text();
    if (raw.length > 24000) return json({ error: 'Request too large' }, 413);
    let body;
    try { body = JSON.parse(raw); } catch { return json({ error: 'Invalid JSON' }, 400); }
    if (!body || typeof body.message !== 'string' || body.message.length > 1000) {
      return json({ error: 'Message must be text of at most 1000 characters' }, 400);
    }
    const history = body.history ?? [];
    if (!Array.isArray(history) || history.length > 10 || history.some(turn =>
      !turn || !['user', 'assistant'].includes(turn.role) || typeof turn.content !== 'string'
      || turn.content.length > (turn.role === 'user' ? 1000 : 1500))) {
      return json({ error: 'Invalid conversation history' }, 400);
    }
    const question = body.message.trim();
    if (!question) {
      return json({ answer: NO_ANSWER, sources: [], resolved: false });
    }

    // Service role is used only for published FAQ retrieval and attributable audit writes.
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
    if (!callerId) return json({ error: 'Sign in to use the assistant' }, 401);
    const { data: profile, error: profileError } = await supabase.from('profiles')
      .select('status,is_active').eq('id', callerId).single();
    if (profileError || profile?.status !== 'approved' || profile?.is_active !== true) {
      return json({ error: 'An approved active account is required' }, 403);
    }

    const { data: allowed, error: limitError } = await supabase.rpc('consume_faq_request', { p_user_id: callerId });
    if (limitError) return json({ error: 'The assistant is temporarily unavailable' }, 503);
    if (allowed !== true) return json({ error: 'Too many questions. Please retry in one minute.' }, 429);

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

    const followUp = /\b(that|those|it|them|there)\b/i.test(question);
    const previous = [...history].reverse().find(turn => turn.role === 'user');
    const searchQuestion = followUp && previous ? previous.content + '\n' + question : question;
    const vector = await embed(searchQuestion);
    let rows = vector ? await semanticSearch(supabase, vector) : null;
    if (!rows?.length) rows = await keywordSearch(supabase, searchQuestion);

    if (rows.length === 0) {
      // No article matched. Logged too: these are the questions the published
      // content does not cover, which is the list of articles to write.
      await logExchange(supabase, question, NO_ANSWER, [], false, callerId, {
        refused: false,
        scope: 'no_match',
      });
      return json({ answer: NO_ANSWER, sources: [], resolved: false });
    }

    const articleReply = async (reason: string) => {
      console.warn('faq_provider_fallback', { reason });
      const answer = buildContext(rows!);
      const sources = buildSources(rows!);
      await logExchange(supabase, question, answer, sources, true, callerId, { provider: 'articles', reason });
      return json({ answer, sources, resolved: true, provider: 'articles' });
    };
    const groqApiKey = Deno.env.get('GROQ_API_KEY');
    if (!groqApiKey) return articleReply('not_configured');

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
      ...history.map(({ role, content }) => ({ role, content })),
      { role: 'user', content: question },
    ];

    let answer: string;
    try {
      const model = Deno.env.get('GROQ_MODEL') || 'openai/gpt-oss-20b';
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        signal: AbortSignal.timeout(15000),
        method: 'POST',
        headers: {
          Authorization: `Bearer ${groqApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_completion_tokens: 1200,
          ...(model.startsWith('openai/gpt-oss-') ? { reasoning_effort: 'low', include_reasoning: false } : {}),
          messages,
          temperature: 0.2,
        }),
      });
  
      if (!res.ok) return articleReply('http_' + res.status);
      const aiData = await res.json();
      const content = aiData?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) return articleReply('empty_response');
      answer = content;
    } catch {
      return articleReply('request_failed');
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
    await logExchange(supabase, question, answer, sources, !gaveUp, callerId, { provider: 'groq' });

    // sources are the retrieved articles, never the model.
    return json({ answer, sources, resolved: !gaveUp, provider: 'groq' });
  } catch (error) {
    console.error('faq-assistant request failed:', errorMessage(error));
    return json({ error: 'Internal server error' }, 500);
  }
});
