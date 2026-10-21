-- Production promotion: existing percentages remain unchanged pending school review.
BEGIN;
ALTER TABLE public.grades ADD COLUMN grade_scale text NOT NULL DEFAULT 'percentage' CHECK (grade_scale IN ('percentage','school'));
ALTER TABLE public.grades ALTER COLUMN grade_scale SET DEFAULT 'school';
ALTER TABLE public.grades ADD COLUMN prediction_method text, ADD COLUMN predicted_at timestamptz;
ALTER TABLE public.grade_history ADD COLUMN grade_scale text NOT NULL DEFAULT 'percentage',
 ADD COLUMN ai_predicted_equivalent numeric(5,2), ADD COLUMN prediction_method text, ADD COLUMN predicted_at timestamptz;
ALTER TABLE public.grades DROP CONSTRAINT grades_remark_check;
ALTER TABLE public.grades ADD CONSTRAINT grades_remark_check CHECK (remark IN ('Passed','Failed','Pending','Dropped','Conditional'));

-- Only the explicitly confirmed legacy correction; stored records are not rewritten.
CREATE OR REPLACE FUNCTION public.calculate_equivalent(percentage numeric) RETURNS numeric
LANGUAGE plpgsql SET search_path = '' AS $function$
BEGIN
 IF percentage IS NULL THEN RETURN NULL; END IF;
 RETURN CASE WHEN percentage=98 THEN 1.10
 WHEN percentage>=96 THEN 1.00 WHEN percentage>=94 THEN 1.25
 WHEN percentage>=92 THEN 1.50 WHEN percentage>=89 THEN 1.75
 WHEN percentage>=86 THEN 2.00 WHEN percentage>=83 THEN 2.25
 WHEN percentage>=80 THEN 2.50 WHEN percentage>=76 THEN 2.75
 WHEN percentage>=75 THEN 3.00 ELSE 5.00 END;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_grade_calculations() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
 v numeric;
 v_estimate numeric;
BEGIN
 IF NEW.grade_scale = 'percentage' THEN
   IF TG_OP = 'INSERT' OR coalesce(pg_catalog.current_setting('app.grade_change_type',true),'') <> 'revert' THEN
     RAISE EXCEPTION 'Legacy percentage records require school review before editing' USING ERRCODE = '23514';
   END IF;
 ELSE
   FOREACH v IN ARRAY ARRAY[NEW.prelim,NEW.midterm,NEW.semifinal,NEW.final] LOOP
     IF v IS NOT NULL AND NOT (v = ANY(ARRAY[1,1.1,1.2,1.25,1.3,1.4,1.5,1.6,1.7,1.75,1.8,1.9,2,2.1,2.2,2.25,2.3,2.4,2.5,2.6,2.7,2.75,2.8,2.9,3,4,5]::numeric[])) THEN
       RAISE EXCEPTION 'Invalid school grade: %',v USING ERRCODE = '23514';
     END IF;
   END LOOP;
   NEW.equivalent := NEW.final;
   NEW.remark := CASE WHEN NEW.remark = 'Dropped' THEN 'Dropped' WHEN NEW.final IS NULL THEN 'Pending' WHEN NEW.final = 4 THEN 'Conditional' WHEN NEW.final <= 3 THEN 'Passed' ELSE 'Failed' END;
 END IF;

 NEW.ai_predicted_grade := NULL;
 NEW.ai_predicted_equivalent := NULL;
 NEW.prediction_method := NULL;
 NEW.predicted_at := NULL;
 IF NEW.grade_scale = 'school' AND NEW.final IS NULL AND NEW.remark <> 'Dropped' THEN
   SELECT round(avg(x),2) INTO v_estimate FROM unnest(ARRAY[NEW.prelim,NEW.midterm,NEW.semifinal]) x WHERE x IS NOT NULL AND x <> 4;
   IF v_estimate IS NOT NULL THEN
     NEW.ai_predicted_equivalent := v_estimate;
     NEW.prediction_method := 'equal-period-mean-v1';
     NEW.predicted_at := pg_catalog.clock_timestamp();
   END IF;
 END IF;
 NEW.graded_by := coalesce(auth.uid(),NEW.graded_by);
 NEW.graded_at := pg_catalog.clock_timestamp();
 RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.archive_grade_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id UUID;
  v_change_type TEXT;
  v_reason TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    v_user_id := COALESCE(NEW.graded_by, OLD.graded_by);
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.prelim IS DISTINCT FROM NEW.prelim OR
       OLD.midterm IS DISTINCT FROM NEW.midterm OR
       OLD.semifinal IS DISTINCT FROM NEW.semifinal OR
       OLD.final IS DISTINCT FROM NEW.final OR
       OLD.equivalent IS DISTINCT FROM NEW.equivalent OR
       OLD.remark IS DISTINCT FROM NEW.remark OR OLD.grade_scale IS DISTINCT FROM NEW.grade_scale OR OLD.ai_predicted_equivalent IS DISTINCT FROM NEW.ai_predicted_equivalent THEN
      v_change_type := NULLIF(pg_catalog.current_setting('app.grade_change_type', true), '');
      v_reason := NULLIF(pg_catalog.current_setting('app.grade_change_reason', true), '');
      INSERT INTO public.grade_history (
        grade_id, student_id, offering_id,
        prelim, midterm, semifinal, final, equivalent, remark,
        grade_scale, ai_predicted_equivalent, prediction_method, predicted_at, changed_by, change_type, reason, created_at
      ) VALUES (
        OLD.id, OLD.student_id, OLD.offering_id,
        OLD.prelim, OLD.midterm, OLD.semifinal, OLD.final, OLD.equivalent, OLD.remark,
        OLD.grade_scale, OLD.ai_predicted_equivalent, OLD.prediction_method, OLD.predicted_at, v_user_id, COALESCE(v_change_type, 'before_update'), v_reason, pg_catalog.clock_timestamp()
      );
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO public.grade_history (
      grade_id, student_id, offering_id,
      prelim, midterm, semifinal, final, equivalent, remark,
      grade_scale, ai_predicted_equivalent, prediction_method, predicted_at, changed_by, change_type, created_at
    ) VALUES (
      NEW.id, NEW.student_id, NEW.offering_id,
      NEW.prelim, NEW.midterm, NEW.semifinal, NEW.final, NEW.equivalent, NEW.remark,
      NEW.grade_scale, NEW.ai_predicted_equivalent, NEW.prediction_method, NEW.predicted_at, v_user_id, 'initial_entry', pg_catalog.clock_timestamp()
    );
  END IF;

  RETURN NEW;
END;
$function$;

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

CREATE OR REPLACE VIEW public.v_grade_history WITH (security_invoker = true) AS
SELECT gh.id,gh.grade_id,gh.student_id,st.full_name AS student_name,st.student_no,
 gh.offering_id,co.code AS course_code,co.title AS course_title,
 gh.prelim,gh.midterm,gh.semifinal,gh.final,gh.equivalent,gh.remark,gh.changed_by,
 cb.full_name AS changed_by_name,gh.change_type,gh.reason,gh.created_at,
 gh.grade_scale,gh.ai_predicted_equivalent,gh.prediction_method,gh.predicted_at
FROM public.grade_history gh
LEFT JOIN public.profiles st ON gh.student_id=st.id
LEFT JOIN public.course_offerings co ON gh.offering_id=co.id
LEFT JOIN public.profiles cb ON gh.changed_by=cb.id;
COMMIT;
