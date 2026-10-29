-- Keep opening enrollment and notifying students in the same transaction.
CREATE OR REPLACE FUNCTION private.set_enrollment_term(p_school_year text,p_semester text,p_open boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE was_open boolean;
BEGIN
  IF p_open IS NULL OR NOT public.is_mfa_compliant() OR NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role IN ('dean','admin','registrar') AND p.status='approved' AND p.is_active IS TRUE
  ) THEN RAISE EXCEPTION 'Active term manager access required' USING ERRCODE='42501'; END IF;
  IF p_school_year IS NULL OR p_school_year !~ '^[0-9]{4}-[0-9]{4}$'
    OR split_part(p_school_year,'-',2)::integer <> split_part(p_school_year,'-',1)::integer + 1
    OR p_semester IS NULL OR p_semester NOT IN ('1st Semester','2nd Semester','Summer')
  THEN RAISE EXCEPTION 'Choose a valid school year and enrollment term' USING ERRCODE='22023'; END IF;

  -- Serialize changes to the same term so concurrent opens send only one notice.
  PERFORM id FROM public.course_offerings WHERE school_year=p_school_year AND semester=p_semester ORDER BY id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Create subject offerings for this term first' USING ERRCODE='P0002'; END IF;
  SELECT bool_or(enrollment_open) INTO was_open FROM public.course_offerings WHERE school_year=p_school_year AND semester=p_semester;
  UPDATE public.course_offerings SET enrollment_open=p_open
    WHERE school_year=p_school_year AND semester=p_semester AND enrollment_open IS DISTINCT FROM p_open;
  IF p_open AND NOT was_open THEN
    INSERT INTO public.activities(student_id,description)
      SELECT id,format('Enrollment is now open for %s, %s. Go to Enrollment / Advising to select your subjects.',p_semester,p_school_year)
      FROM public.profiles WHERE role='student' AND status='approved' AND is_active IS TRUE;
  END IF;
END;
$$;
