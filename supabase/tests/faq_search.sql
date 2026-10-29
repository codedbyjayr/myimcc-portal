-- Run after faq_search_and_content. All test records roll back.
BEGIN;
DO $test$
DECLARE
  article_id uuid;
  values real[] := array_fill(0::real, ARRAY[384]);
  test_vector extensions.vector;
BEGIN
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'match_faq_articles') <> 1 THEN
    RAISE EXCEPTION 'FAQ RPC must have one signature';
  END IF;
  IF has_function_privilege('anon', 'public.match_faq_articles(extensions.vector,integer,double precision)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous FAQ RPC execution must be denied';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.match_faq_articles(extensions.vector,integer,double precision)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated FAQ RPC execution must be allowed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.faq_articles WHERE is_active AND answer ILIKE '%Pay Now%') THEN
    RAISE EXCEPTION 'Obsolete payment instructions remain';
  END IF;
  values[1] := 1;
  test_vector := values::extensions.vector;
  INSERT INTO public.faq_articles(category, question, answer, keywords, embedding)
  VALUES ('Test', 'FAQ vector regression check', 'Original answer', 'regression', test_vector)
  RETURNING id INTO article_id;
  IF NOT EXISTS (SELECT 1 FROM public.match_faq_articles(
      query_embedding => test_vector, match_count => 5, match_threshold => 0.99) f WHERE f.id = article_id) THEN
    RAISE EXCEPTION 'Named-argument vector retrieval failed';
  END IF;
  UPDATE public.faq_articles SET answer = 'Updated answer' WHERE id = article_id;
  IF EXISTS (SELECT 1 FROM public.faq_articles WHERE id = article_id AND embedding IS NOT NULL) THEN
    RAISE EXCEPTION 'Content edits must invalidate embeddings';
  END IF;
  UPDATE public.faq_articles SET embedding = test_vector WHERE id = article_id;
  UPDATE public.faq_articles SET keywords = 'updated regression' WHERE id = article_id;
  IF EXISTS (SELECT 1 FROM public.faq_articles WHERE id = article_id AND embedding IS NOT NULL) THEN
    RAISE EXCEPTION 'Keyword edits must invalidate embeddings';
  END IF;
END;
$test$;
ROLLBACK;
