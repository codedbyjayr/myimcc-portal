-- Upgrade existing isolated review schemas; newly rebuilt reviews already include this contract.
DO $$
DECLARE fn regprocedure;
BEGIN
 IF to_regclass('imcc_review.course_offerings') IS NULL OR to_regclass('imcc_review.enrollment_terms') IS NOT NULL THEN RETURN; END IF;
 CREATE TABLE imcc_review.enrollment_terms (LIKE public.enrollment_terms INCLUDING ALL);
 ALTER TABLE imcc_review.enrollment_terms ENABLE ROW LEVEL SECURITY;
 REVOKE ALL ON imcc_review.enrollment_terms FROM PUBLIC,anon,authenticated;
 GRANT SELECT ON imcc_review.enrollment_terms TO authenticated;
 CREATE POLICY enrollment_terms_read ON imcc_review.enrollment_terms FOR SELECT TO authenticated
  USING (EXISTS(SELECT 1 FROM imcc_review.profiles p WHERE p.id=(SELECT auth.uid()) AND p.status='approved' AND p.is_active IS TRUE));
 CREATE POLICY review_expiry ON imcc_review.enrollment_terms AS RESTRICTIVE FOR ALL TO authenticated
  USING (imcc_review.is_mfa_compliant()) WITH CHECK (imcc_review.is_mfa_compliant());
 INSERT INTO imcc_review.enrollment_terms(school_year,semester,is_open)
  SELECT school_year,semester,bool_or(enrollment_open) FROM imcc_review.course_offerings GROUP BY school_year,semester;
 INSERT INTO imcc_review.enrollment_terms(school_year,semester)
  SELECT translate(substring(label from '[0-9]{4}[-–—][0-9]{4}'),'–—','--'),semester
  FROM imcc_review.academic_years CROSS JOIN unnest(ARRAY['1st Semester','2nd Semester','Summer']) semester
  WHERE label ~ '[0-9]{4}[-–—][0-9]{4}' ON CONFLICT DO NOTHING;
 FOREACH fn IN ARRAY ARRAY['private.set_enrollment_term(text,text,boolean)'::regprocedure,'private.get_enrollment_workspace()'::regprocedure,'private.apply_enrollment_term()'::regprocedure] LOOP
  EXECUTE replace(replace(pg_get_functiondef(fn),'public.','imcc_review.'),'private.','imcc_review_private.');
 END LOOP;
 REVOKE ALL ON FUNCTION imcc_review_private.apply_enrollment_term() FROM PUBLIC,anon,authenticated;
 CREATE TRIGGER z_apply_enrollment_term BEFORE INSERT OR UPDATE OF school_year,semester ON imcc_review.course_offerings
  FOR EACH ROW EXECUTE FUNCTION imcc_review_private.apply_enrollment_term();
END;
$$;
