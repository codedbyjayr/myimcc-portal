import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';

const FAQ_KNOWLEDGE_BASE = [
    {
        category: 'Enrollment',
        keywords: ['enroll', 'register', 'subjects', 'units', 'add course'],
        answer: 'To enroll in subjects, navigate to the **Enrollment** tab, select your preferred course offerings, ensure there are no schedule conflicts, and click **Confirm Enrollment**.',
    },
    {
        category: 'Billing',
        keywords: ['balance', 'pay', 'tuition', 'installment', 'or number', 'payment'],
        answer: 'View tuition breakdowns and outstanding balances under **Billing & History**. Pending payments can be settled directly by clicking **Pay Now** on any installment card.',
    },
    {
        category: 'Grades',
        keywords: ['grade', 'gwa', 'midterm', 'final', 'ai prediction', 'prospectus'],
        answer: 'Your term grades and AI-predicted outcomes are displayed under **Grades & Evaluation**. Click **View Degree Prospectus** to track overall curriculum completion.',
    },
    {
        category: 'Clearance',
        keywords: ['clearance', 'department', 'sign', 'hold', 'cashier', 'library'],
        answer: 'Online clearance status is updated in real time under **Online Clearance**. If an action item exists (e.g., Cashier balance), clicking the prompt directs you to the necessary step.',
    },
];

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { message, history } = await req.json();
        const query = (message || '').toLowerCase();

        // Fetch Groq API Key from Supabase secrets
        const groqApiKey = Deno.env.get('GROQ_API_KEY');

        if (groqApiKey) {
            const systemPrompt = `You are the MyIMCC Portal AI Assistant. Provide helpful, precise answers about university enrollment, billing, grades, clearance, and campus logistics. Keep answers short and formatted with markdown bold text where applicable.`;

            const messages = [
                { role: 'system', content: systemPrompt },
                ...(history || []),
                { role: 'user', content: message },
            ];

            // Call Groq API endpoint
            const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${groqApiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'llama-3.3-70b-versatile', // Fast, high-accuracy Groq model
                    messages,
                    temperature: 0.3,
                }),
            });

            const aiData = await res.json();
            if (aiData.choices && aiData.choices[0]) {
                return new Response(
                    JSON.stringify({
                        answer: aiData.choices[0].message.content,
                        sources: [{ category: 'Groq AI Assistant' }],
                    }),
                    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }
        }

        // Fallback: Knowledge Base Pattern Matching
        const matched = FAQ_KNOWLEDGE_BASE.filter((faq) =>
            faq.keywords.some((kw) => query.includes(kw))
        );

        if (matched.length > 0) {
            const answer = matched.map((m) => m.answer).join('\n\n');
            const sources = matched.map((m) => ({ category: m.category }));

            return new Response(
                JSON.stringify({ answer, sources }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        return new Response(
            JSON.stringify({
                answer: 'I could not find an exact match for your request. You may check your **Dashboard**, or contact support at **support@imcc.edu.ph** for further assistance.',
                sources: [],
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});