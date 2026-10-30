BEGIN;
DO $$ DECLARE target text; content text; amount integer; BEGIN
 FOR target IN SELECT unnest(ARRAY['public','imcc_review']) LOOP
  EXECUTE format('SELECT answer FROM %I.faq_articles WHERE question=''How do I enroll in courses?'' AND is_active',target) INTO content;
  IF content IS NULL OR content NOT LIKE '%Enroll Now%' OR content NOT LIKE '%pending request%' THEN RAISE EXCEPTION 'Enrollment guide does not explain pending approval'; END IF;
  EXECUTE format('SELECT count(*) FROM %I.faq_articles WHERE is_active AND answer ILIKE ANY(ARRAY[''%%Proceed to Fee Review%%'',''%%within one week%%'',''%%within two weeks%%'',''%%₱1,200%%'',''%%automatically logged in%%''])',target) INTO amount;
  IF amount<>0 THEN RAISE EXCEPTION 'Obsolete workflow or unsupported policy remains'; END IF;
  EXECUTE format('SELECT answer FROM %I.faq_articles WHERE question=''How do I check my grades?'' AND is_active',target) INTO content;
  IF content IS NULL OR content NOT LIKE '%Semester%' OR content NOT LIKE '%Grade Estimate%' THEN RAISE EXCEPTION 'Missing practical grade guide'; END IF;
  EXECUTE format('SELECT answer FROM %I.faq_articles WHERE question=''How do I get my Certificate of Registration?'' AND is_active',target) INTO content;
  IF content IS NULL OR content NOT LIKE '%Print Certificate%' OR content NOT LIKE '%pending selections%' THEN RAISE EXCEPTION 'Missing practical COR guide'; END IF;
  EXECUTE format('SELECT count(*) FROM (SELECT question FROM %I.faq_articles WHERE question IN (''How do I check my grades?'',''How do I get my Certificate of Registration?'') GROUP BY question HAVING count(*)>1) duplicates',target) INTO amount;
  IF amount<>0 THEN RAISE EXCEPTION 'Duplicate student guides'; END IF;
 END LOOP;
END $$;
ROLLBACK;
