// supabase/functions/faq-assistant/index.ts
// MyIMCC Portal — RAG-Powered FAQ Chatbot (FREE VERSION)
//
// Uses:
//   - @xenova/transformers for embeddings (FREE, runs inside Edge Function, no API key)
//   - Groq Llama 3.3 70B for answer generation (FREE tier)
//   - Supabase pgvector for similarity search (FREE, built into Supabase)
//
// No OpenAI API key required. No external embedding API. Zero cost.
//
// Deploy: supabase functions deploy faq-assistant
// Secrets: supabase secrets set GROQ_API_KEY=***

/// <reference lib="deno.ns" />
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY")!;
const GROQ_MODEL = Deno.env.get("GROQ_MODEL") || "llama-3.3-70b-versatile";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Built-in Supabase AI model (runs directly in runtime with 0 MB bundle size)
const model = new Supabase.ai.Session("gte-small");

// Helper function to generate 384-dimensional embeddings
async function generateEmbedding(text: string): Promise<number[]> {
  const output = await model.run(text, {
    mean_pool: true,
    normalize: true,
  });
  return Array.from(output as Float32Array);
}



interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface FaqArticle {
  id: string;
  category: string;
  question: string;
  answer: string;
  keywords: string;
  similarity: number;
}

Deno.serve(async (req: Request) => {
  // ── CORS ─────────────────────────────────────────────────────────
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const body = await req.json();
    const { message, history, userId } = body as {
      message: string;
      history?: ChatMessage[];
      userId?: string;
    };

    // ── Handle reindex action (admin only) ──────────────────────────
    if (body.action === "reindex") {
      return await reindexEmbeddings();
    }

    if (!message || typeof message !== "string") {
      return jsonResponse({ error: "Message is required" }, 400);
    }

    // ── 1. Generate embedding for the user's question ───────────────
    const queryEmbedding = await generateEmbedding(message);

    // ── 2. Semantic search via pgvector ──────────────────────────────
    const { data: faqResults, error: searchError } = await supabase.rpc(
      "match_faq_articles",
      {
        query_embedding: queryEmbedding,
        match_count: 5,
        match_threshold: 0.5,
      }
    );

    if (searchError) {
      console.warn("Vector search error:", searchError);
    }

    const faqs = (faqResults as FaqArticle[]) || [];

    // ── 3. Fallback to keyword search if no vector matches ───────────
    const finalFaqs = faqs.length > 0 ? faqs : await keywordSearch(message);

    // ── 4. Build grounded system prompt ──────────────────────────────
    const faqContext = finalFaqs.length > 0
      ? finalFaqs.map((f, i) =>
        `[${i + 1}] Q: ${f.question}\n    A: ${f.answer}\n    Category: ${f.category}\n    Relevance: ${((f.similarity || 0) * 100).toFixed(1)}%`
      ).join("\n\n")
      : "No specific FAQ articles found. Provide a general helpful response and suggest contacting the appropriate office.";

    const systemPrompt = `You are the MyIMCC Portal FAQ Assistant for Iligan Medical Center College. You help students, faculty, and staff with questions about enrollment, billing, grades, clearance, attendance, and portal usage.

INSTRUCTIONS:
- Use ONLY the FAQ context below to answer questions. This is a RAG (Retrieval-Augmented Generation) system.
- If the retrieved context answers the question, provide a clear, concise answer.
- If the question is NOT covered by the context, say: "I don't have information about that in my FAQ database. Please contact support@imcc.edu.ph for technical issues or registrar@imcc.edu.ph for academic matters."
- Never make up policies, deadlines, or procedures not in the context.
- Be friendly, concise, and accurate. Use bullet points for multi-step answers.
- If the user asks about something outside school portal topics, politely redirect them to portal-related questions.

RETRIEVED FAQ CONTEXT (from vector similarity search):
${faqContext}

SUPPORT CONTACTS:
- Technical issues: support@imcc.edu.ph
- Academic/Registrar: registrar@imcc.edu.ph
- Billing/Finance: finance@imcc.edu.ph`;

    // ── 5. Call Groq API ─────────────────────────────────────────────
    const messages = [
      { role: "system", content: systemPrompt },
      ...(history || []).slice(-6),
      { role: "user", content: message },
    ];

    let answer: string;
    let groqUsed = false;

    try {
      const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages,
          temperature: 0.3,
          max_tokens: 500,
        }),
      });

      if (groqResponse.ok) {
        const groqData = await groqResponse.json();
        answer = groqData.choices?.[0]?.message?.content || "I could not generate a response. Please try again.";
        groqUsed = true;
      } else {
        throw new Error(`Groq API ${groqResponse.status}`);
      }
    } catch (groqError) {
      console.error("Groq API error:", groqError);
      // ── Fallback: return best matching FAQ directly ──────────────
      answer = finalFaqs.length > 0
        ? `${finalFaqs[0].answer}\n\n*(Note: AI generation is temporarily unavailable. Showing closest FAQ match. For more help, contact support@imcc.edu.ph)*`
        : "I'm having trouble connecting to my AI backend. For immediate assistance, please contact the Registrar's Office at registrar@imcc.edu.ph or IT Support at support@imcc.edu.ph.";
    }

    // ── 6. Log conversation ──────────────────────────────────────────
    if (userId) {
      try {
        await supabase.from("chat_logs").insert({
          user_id: userId,
          user_message: message,
          bot_response: answer,
          sources: finalFaqs.map(f => ({
            category: f.category,
            question: f.question,
            similarity: f.similarity,
          })),
        });
      } catch (logErr) {
        console.warn("Chat log insert failed:", logErr);
      }
    }

    // ── 7. Return answer with sources ────────────────────────────────
    return jsonResponse({
      answer,
      sources: finalFaqs.map(f => ({
        category: f.category,
        question: f.question,
        similarity: parseFloat((f.similarity || 0).toFixed(3)),
      })),
      groq_used: groqUsed,
      retrieval_method: finalFaqs.length > 0 ? "vector" : "none",
    });

  } catch (err) {
    console.error("FAQ assistant error:", err);
    return jsonResponse({
      answer: "I encountered an error processing your request. Please try again or contact support@imcc.edu.ph.",
      sources: [],
    }, 500);
  }
});

// ── Keyword-based fallback retrieval ─────────────────────────────────
async function keywordSearch(question: string): Promise<FaqArticle[]> {
  const { data: allFaqs } = await supabase
    .from("faq_articles")
    .select("id, category, question, answer, keywords")
    .eq("is_active", true);

  if (!allFaqs || allFaqs.length === 0) return [];

  const questionLower = question.toLowerCase();
  const scored = allFaqs.map((faq) => {
    const keywords = (faq.keywords || "").toLowerCase().split(",").map(k => k.trim());
    const keywordScore = keywords.filter(k => questionLower.includes(k)).length;
    const questionWords = faq.question.toLowerCase().split(/\s+/);
    const titleScore = questionWords.filter(w => w.length > 3 && questionLower.includes(w)).length;
    return { ...faq, similarity: (keywordScore * 2 + titleScore) / Math.max(keywords.length + questionWords.length, 1) };
  })
    .filter(f => f.similarity > 0)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5);

  return scored as FaqArticle[];
}

// ── Reindex: Generate embeddings for all FAQ articles ────────────────
// Call with: { "action": "reindex" }
// No API key needed — embeddings are generated locally via Xenova
async function reindexEmbeddings() {
  const { data: faqs, error } = await supabase
    .from("faq_articles")
    .select("id, question, answer, keywords")
    .eq("is_active", true)
    .is("embedding", null);

  if (error || !faqs) {
    return jsonResponse({ error: "Failed to fetch FAQ articles" }, 500);
  }

  let indexed = 0;
  for (const faq of faqs) {
    const text = `${faq.question} ${faq.answer} ${faq.keywords || ""}`;
    const embedding = await generateEmbedding(text);
    await supabase
      .from("faq_articles")
      .update({ embedding })
      .eq("id", faq.id);
    indexed++;
  }

  return jsonResponse({
    success: true,
    message: `Indexed ${indexed} of ${faqs.length} FAQ articles using free local embeddings (Xenova all-MiniLM-L6-v2)`,
    total_faqs: faqs.length,
    indexed,
    embedding_model: "Xenova/all-MiniLM-L6-v2 (384 dims, free, no API key)",
  });
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
