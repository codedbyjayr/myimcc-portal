import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { embedFaq } from '../_shared/faq-embedding.ts';

// Maintenance only: never expose the service-role credential in a browser.
serve(async (req) => {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!key || req.headers.get('Authorization') !== `Bearer ${key}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (req.method !== 'POST') return Response.json({ error: 'Only POST is allowed' }, { status: 405 });
  try {
    const client = createClient(Deno.env.get('SUPABASE_URL')!, key, { auth: { persistSession: false } });
    const { data: rows, error } = await client.from('faq_articles')
      .select('id,category,question,answer,keywords').eq('is_active', true)
      .is('embedding', null).order('id').limit(10);
    if (error) throw error;
    let indexed = 0;
    for (const row of rows ?? []) {
      const embedding = await embedFaq(`${row.category}\n${row.question}\n${row.answer}\n${row.keywords ?? ''}`);
      // Do not attach an old embedding if staff edited the article during inference.
      const { data, error: updateError } = await client.from('faq_articles').update({ embedding })
        .eq('id', row.id).eq('category', row.category).eq('question', row.question)
        .eq('answer', row.answer).is('embedding', null)
        .filter('keywords', row.keywords === null ? 'is' : 'eq', row.keywords)
        .select('id');
      if (updateError) throw updateError;
      indexed += data?.length ?? 0;
    }
    return Response.json({ indexed });
  } catch {
    console.error('faq_reindex_failed');
    return Response.json({ error: 'FAQ indexing failed; completed rows are retained for retry' }, { status: 500 });
  }
});
