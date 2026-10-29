CREATE TABLE public.enrollment_terms (
  school_year text NOT NULL CHECK (school_year ~ '^[0-9]{4}-[0-9]{4}$' AND split_part(school_year,'-',2)::integer=split_part(school_year,'-',1)::integer+1),
  semester text NOT NULL CHECK (semester IN ('1st Semester','2nd Semester','Summer')),
  is_open boolean NOT NULL DEFAULT false,
  PRIMARY KEY (school_year,semester)
);
ALTER TABLE public.enrollment_terms ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.enrollment_terms FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.enrollment_terms TO authenticated;
CREATE POLICY enrollment_terms_read ON public.enrollment_terms FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.status='approved' AND p.is_active IS TRUE));

-- Preserve existing term status without opening enrollment or sending notices.
INSERT INTO public.enrollment_terms(school_year,semester,is_open)
 SELECT school_year,semester,bool_or(enrollment_open) FROM public.course_offerings GROUP BY school_year,semester;
INSERT INTO public.enrollment_terms(school_year,semester)
 SELECT translate(substring(label from '[0-9]{4}[-–—][0-9]{4}'),'–—','--'),semester
 FROM public.academic_years CROSS JOIN unnest(ARRAY['1st Semester','2nd Semester','Summer']) semester
 WHERE label ~ '[0-9]{4}[-–—][0-9]{4}' ON CONFLICT DO NOTHING;

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

  INSERT INTO public.enrollment_terms(school_year,semester) VALUES(p_school_year,p_semester) ON CONFLICT DO NOTHING;
  -- The term row serializes concurrent opens even when no offerings exist.
  SELECT is_open INTO was_open FROM public.enrollment_terms WHERE school_year=p_school_year AND semester=p_semester FOR UPDATE;
  UPDATE public.enrollment_terms SET is_open=p_open WHERE school_year=p_school_year AND semester=p_semester;
  UPDATE public.course_offerings SET enrollment_open=p_open
    WHERE school_year=p_school_year AND semester=p_semester AND enrollment_open IS DISTINCT FROM p_open;
  IF p_open AND NOT was_open THEN
    INSERT INTO public.activities(student_id,description)
      SELECT id,format('Enrollment is now open for %s, %s. Go to Enrollment / Advising to select your subjects.',p_semester,p_school_year)
      FROM public.profiles WHERE role='student' AND status='approved' AND is_active IS TRUE;
  END IF;
END;
$$;

CREATE FUNCTION private.apply_enrollment_term() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  NEW.enrollment_open:=coalesce((SELECT is_open FROM public.enrollment_terms WHERE school_year=NEW.school_year AND semester=NEW.semester),NEW.enrollment_open);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.apply_enrollment_term() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER z_apply_enrollment_term BEFORE INSERT OR UPDATE OF school_year,semester ON public.course_offerings
 FOR EACH ROW EXECUTE FUNCTION private.apply_enrollment_term();

CREATE OR REPLACE FUNCTION private.get_enrollment_workspace() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT public.is_mfa_compliant() OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role IN ('dean','admin','registrar','staff') AND p.status='approved' AND p.is_active IS TRUE) THEN RAISE EXCEPTION 'Active enrollment reviewer access required' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object(
    'groups',coalesce((SELECT jsonb_agg(to_jsonb(g) ORDER BY g.student_name,g.school_year,g.semester) FROM (
      SELECT e.student_id,p.full_name AS student_name,coalesce(p.student_no,p.id_number) AS student_no,p.year_level,o.school_year,o.semester,sum(o.units) AS units,l.locked_at
      FROM public.enrollments e JOIN public.profiles p ON p.id=e.student_id JOIN public.course_offerings o ON o.id=e.offering_id
      LEFT JOIN public.enrollment_locks l ON l.student_id=e.student_id AND l.school_year=o.school_year AND l.semester=o.semester
      WHERE e.status='enrolled' GROUP BY e.student_id,p.full_name,p.student_no,p.id_number,p.year_level,o.school_year,o.semester,l.locked_at
    ) g),'[]'::jsonb),
    'terms',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.school_year DESC,t.semester) FROM (
      WITH years AS (
        SELECT school_year FROM public.enrollment_terms UNION SELECT school_year FROM public.course_offerings
        UNION SELECT translate(substring(label from '[0-9]{4}[-–—][0-9]{4}'),'–—','--') FROM public.academic_years WHERE label ~ '[0-9]{4}[-–—][0-9]{4}'
      ), offerings AS (SELECT school_year,semester,bool_or(enrollment_open) AS is_open FROM public.course_offerings GROUP BY school_year,semester)
      SELECT y.school_year,s.semester,coalesce(e.is_open,o.is_open,false) AS is_open
      FROM years y CROSS JOIN unnest(ARRAY['1st Semester','2nd Semester','Summer']) s(semester)
      LEFT JOIN public.enrollment_terms e ON e.school_year=y.school_year AND e.semester=s.semester
      LEFT JOIN offerings o ON o.school_year=y.school_year AND o.semester=s.semester
    ) t),'[]'::jsonb)
  );
END;
$$;

DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.enrollment_terms;
 END IF;
END $$;
