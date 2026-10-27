CREATE OR REPLACE FUNCTION public.revert_grade(p_history_id uuid, p_reason text DEFAULT 'Reverted to previous version'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_hist record;
  v_grade record;
  v_user_id uuid;
  v_user_role text;
  v_previous_change_type text;
  v_previous_reason text;
BEGIN
  v_user_id := (SELECT auth.uid());
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF public.is_mfa_compliant() IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Complete MFA before reverting grades' USING ERRCODE = '42501';
  END IF;

  SELECT p.role INTO v_user_role
  FROM public.profiles p
  WHERE p.id = v_user_id
    AND p.status = 'approved'
    AND p.is_active IS TRUE;

  IF NOT FOUND OR v_user_role NOT IN ('teacher', 'faculty', 'dean', 'admin') THEN
    RAISE EXCEPTION 'Approved faculty access required' USING ERRCODE = '42501';
  END IF;

  SELECT h.* INTO v_hist
  FROM public.grade_history h
  WHERE h.id = p_history_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Grade history record not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_user_role <> 'admin' AND NOT EXISTS (
    SELECT 1 FROM public.teacher_assignments ta
    WHERE ta.teacher_id = v_user_id
      AND ta.offering_id = v_hist.offering_id
      AND ta.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'Active assignment required for this course offering' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.enrollments e
    WHERE e.student_id = v_hist.student_id
      AND e.offering_id = v_hist.offering_id
  ) THEN
    RAISE EXCEPTION 'Matching enrollment required to revert this grade' USING ERRCODE = '42501';
  END IF;

  SELECT g.* INTO v_grade
  FROM public.grades g
  WHERE g.id = v_hist.grade_id
    AND g.student_id IS NOT DISTINCT FROM v_hist.student_id
    AND g.offering_id IS NOT DISTINCT FROM v_hist.offering_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Matching grade record not found' USING ERRCODE = 'P0002';
  END IF;

  v_previous_change_type := pg_catalog.current_setting('app.grade_change_type', true);
  v_previous_reason := pg_catalog.current_setting('app.grade_change_reason', true);
  PERFORM pg_catalog.set_config('app.grade_change_type', 'revert', true);
  PERFORM pg_catalog.set_config('app.grade_change_reason', COALESCE(p_reason, 'Reverted to previous version'), true);

  UPDATE public.grades g
  SET grade_scale = v_hist.grade_scale, prelim = v_hist.prelim,
      midterm = v_hist.midterm,
      semifinal = v_hist.semifinal,
      final = v_hist.final,
      equivalent = v_hist.equivalent,
      remark = v_hist.remark,
      graded_by = v_user_id,
      graded_at = pg_catalog.clock_timestamp()
  WHERE g.id = v_hist.grade_id
  RETURNING g.* INTO v_grade;

  PERFORM pg_catalog.set_config('app.grade_change_type', COALESCE(v_previous_change_type, ''), true);
  PERFORM pg_catalog.set_config('app.grade_change_reason', COALESCE(v_previous_reason, ''), true);

  RETURN pg_catalog.to_jsonb(v_grade);
END;
$function$;
