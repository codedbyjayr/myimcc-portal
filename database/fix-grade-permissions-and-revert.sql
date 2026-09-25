-- =====================================================================
-- MyIMCC Portal — Fix Faculty & Dean Grade Permissions, Calculations & Revert
-- Applied to Supabase project dusiokpfmkhutptomrqg
-- =====================================================================

-- 1. Table and sequence permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;

GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO authenticated;

-- 2. Improved grade calculation trigger function
CREATE OR REPLACE FUNCTION public.update_grade_calculations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  -- Sync grade fields and percentage fields:
  IF TG_OP = 'UPDATE' THEN
    IF NEW.prelim IS DISTINCT FROM OLD.prelim THEN
      NEW.prelim_percentage := NEW.prelim;
    ELSIF NEW.prelim_percentage IS DISTINCT FROM OLD.prelim_percentage THEN
      NEW.prelim := NEW.prelim_percentage;
    END IF;

    IF NEW.midterm IS DISTINCT FROM OLD.midterm THEN
      NEW.midterm_percentage := NEW.midterm;
    ELSIF NEW.midterm_percentage IS DISTINCT FROM OLD.midterm_percentage THEN
      NEW.midterm := NEW.midterm_percentage;
    END IF;

    IF NEW.semifinal IS DISTINCT FROM OLD.semifinal THEN
      NEW.semifinal_percentage := NEW.semifinal;
    ELSIF NEW.semifinal_percentage IS DISTINCT FROM OLD.semifinal_percentage THEN
      NEW.semifinal := NEW.semifinal_percentage;
    END IF;

    IF NEW.final IS DISTINCT FROM OLD.final THEN
      NEW.final_percentage := NEW.final;
    ELSIF NEW.final_percentage IS DISTINCT FROM OLD.final_percentage THEN
      NEW.final := NEW.final_percentage;
    END IF;
  ELSE
    -- INSERT case
    IF NEW.prelim IS NOT NULL AND NEW.prelim_percentage IS NULL THEN
      NEW.prelim_percentage := NEW.prelim;
    ELSIF NEW.prelim_percentage IS NOT NULL AND NEW.prelim IS NULL THEN
      NEW.prelim := NEW.prelim_percentage;
    END IF;

    IF NEW.midterm IS NOT NULL AND NEW.midterm_percentage IS NULL THEN
      NEW.midterm_percentage := NEW.midterm;
    ELSIF NEW.midterm_percentage IS NOT NULL AND NEW.midterm IS NULL THEN
      NEW.midterm := NEW.midterm_percentage;
    END IF;

    IF NEW.semifinal IS NOT NULL AND NEW.semifinal_percentage IS NULL THEN
      NEW.semifinal_percentage := NEW.semifinal;
    ELSIF NEW.semifinal_percentage IS NOT NULL AND NEW.semifinal IS NULL THEN
      NEW.semifinal := NEW.semifinal_percentage;
    END IF;

    IF NEW.final IS NOT NULL AND NEW.final_percentage IS NULL THEN
      NEW.final_percentage := NEW.final;
    ELSIF NEW.final_percentage IS NOT NULL AND NEW.final IS NULL THEN
      NEW.final := NEW.final_percentage;
    END IF;
  END IF;

  -- Calculate average percentage from all non-null periods
  NEW.average_percentage := (
    COALESCE(NEW.prelim_percentage, 0) + 
    COALESCE(NEW.midterm_percentage, 0) + 
    COALESCE(NEW.semifinal_percentage, 0) + 
    COALESCE(NEW.final_percentage, 0)
  ) / NULLIF(
    (CASE WHEN NEW.prelim_percentage IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN NEW.midterm_percentage IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN NEW.semifinal_percentage IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN NEW.final_percentage IS NOT NULL THEN 1 ELSE 0 END), 0
  );
  
  -- Calculate equivalent & remark from average
  IF NEW.average_percentage IS NOT NULL THEN
    NEW.computed_equivalent := calculate_equivalent(NEW.average_percentage);
    NEW.computed_remark := calculate_remark(NEW.average_percentage);

    IF NEW.equivalent IS NULL OR TG_OP = 'UPDATE' THEN
      NEW.equivalent := NEW.computed_equivalent;
    END IF;
  END IF;

  -- Calculate final passing remark
  IF NEW.final IS NULL THEN
    NEW.remark := 'Pending';
  ELSIF NEW.computed_equivalent IS NOT NULL AND NEW.computed_equivalent <= 3.00 THEN
    NEW.remark := 'Passed';
  ELSIF NEW.equivalent IS NOT NULL AND NEW.equivalent <= 3.00 THEN
    NEW.remark := 'Passed';
  ELSE
    NEW.remark := 'Failed';
  END IF;

  -- Audit fields
  NEW.graded_by := COALESCE(auth.uid(), NEW.graded_by);
  NEW.graded_at := now();

  RETURN NEW;
END;
$function$;

-- 3. Robust RLS for grades
DROP POLICY IF EXISTS "Faculty insert grades" ON public.grades;
CREATE POLICY "Faculty insert grades"
  ON public.grades FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role IN ('teacher', 'faculty', 'dean', 'admin')
    )
  );

DROP POLICY IF EXISTS "Faculty update grades" ON public.grades;
CREATE POLICY "Faculty update grades"
  ON public.grades FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role IN ('teacher', 'faculty', 'dean', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role IN ('teacher', 'faculty', 'dean', 'admin')
    )
  );

DROP POLICY IF EXISTS "Faculty and admin delete grades" ON public.grades;
CREATE POLICY "Faculty and admin delete grades"
  ON public.grades FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role IN ('dean', 'admin')
    )
  );

-- 4. Robust RLS for grade_history
DROP POLICY IF EXISTS "Faculty and admin view grade history" ON public.grade_history;
CREATE POLICY "Faculty and admin view grade history"
  ON public.grade_history FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role IN ('teacher', 'faculty', 'dean', 'admin', 'registrar', 'staff')
    )
    OR student_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "Faculty and admin insert grade history" ON public.grade_history;
CREATE POLICY "Faculty and admin insert grade history"
  ON public.grade_history FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role IN ('teacher', 'faculty', 'dean', 'admin')
    )
  );

DROP POLICY IF EXISTS "Faculty and admin update grade history" ON public.grade_history;
CREATE POLICY "Faculty and admin update grade history"
  ON public.grade_history FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role IN ('teacher', 'faculty', 'dean', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role IN ('teacher', 'faculty', 'dean', 'admin')
    )
  );

DROP POLICY IF EXISTS "Dean and admin delete grade history" ON public.grade_history;
CREATE POLICY "Dean and admin delete grade history"
  ON public.grade_history FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role IN ('dean', 'admin')
    )
  );

-- 5. Enrollments permissions
DROP POLICY IF EXISTS "Faculty and admin manage enrollments" ON public.enrollments;
CREATE POLICY "Faculty and admin manage enrollments"
  ON public.enrollments FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role IN ('teacher', 'faculty', 'dean', 'admin', 'registrar', 'staff')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role IN ('teacher', 'faculty', 'dean', 'admin', 'registrar', 'staff')
    )
  );

-- 6. Clearances permissions
DROP POLICY IF EXISTS "Clearance manage policy" ON public.clearances;
CREATE POLICY "Clearance manage policy"
  ON public.clearances FOR ALL TO authenticated
  USING (
    (student_id = (SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role IN ('teacher', 'faculty', 'staff', 'registrar', 'dean', 'admin')
    )
  );

DROP POLICY IF EXISTS "Staff faculty dean admin manage clearance_status" ON public.clearance_status;
CREATE POLICY "Staff faculty dean admin manage clearance_status"
  ON public.clearance_status FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role IN ('teacher', 'faculty', 'staff', 'registrar', 'dean', 'admin')
    )
  );

-- 7. View with joined student and editor details
DROP VIEW IF EXISTS public.v_grade_history;
CREATE VIEW public.v_grade_history
WITH (security_invoker = true)
AS
SELECT 
  gh.id,
  gh.grade_id,
  gh.student_id,
  st.full_name AS student_name,
  st.student_no,
  gh.offering_id,
  co.code AS course_code,
  co.title AS course_title,
  gh.prelim,
  gh.midterm,
  gh.semifinal,
  gh.final,
  gh.equivalent,
  gh.remark,
  gh.changed_by,
  cb.full_name AS changed_by_name,
  gh.change_type,
  gh.reason,
  gh.created_at
FROM public.grade_history gh
LEFT JOIN public.profiles st ON gh.student_id = st.id
LEFT JOIN public.course_offerings co ON gh.offering_id = co.id
LEFT JOIN public.profiles cb ON gh.changed_by = cb.id;

GRANT SELECT ON public.v_grade_history TO authenticated, anon;

-- 8. Stored procedure for atomic grade revert
CREATE OR REPLACE FUNCTION public.revert_grade(
  p_history_id UUID,
  p_reason TEXT DEFAULT 'Reverted to previous version'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_hist record;
  v_grade record;
  v_user_id UUID;
  v_user_role TEXT;
BEGIN
  v_user_id := auth.uid();
  
  -- Check user permissions
  SELECT role INTO v_user_role FROM public.profiles WHERE id = v_user_id;
  IF v_user_role NOT IN ('teacher', 'faculty', 'dean', 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: only faculty, deans, and admins can revert grades.';
  END IF;

  -- Fetch history record
  SELECT * INTO v_hist FROM public.grade_history WHERE id = p_history_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Grade history record % not found.', p_history_id;
  END IF;

  -- Update grade with historical values (will trigger archive of current state)
  UPDATE public.grades
  SET prelim = v_hist.prelim,
      midterm = v_hist.midterm,
      semifinal = v_hist.semifinal,
      final = v_hist.final,
      equivalent = v_hist.equivalent,
      remark = v_hist.remark,
      graded_by = v_user_id,
      graded_at = now()
  WHERE id = v_hist.grade_id
  RETURNING * INTO v_grade;

  -- Annotate the newly created archive record with the revert reason
  UPDATE public.grade_history
  SET reason = p_reason,
      change_type = 'revert'
  WHERE grade_id = v_hist.grade_id
    AND created_at = (SELECT max(created_at) FROM public.grade_history WHERE grade_id = v_hist.grade_id);

  RETURN to_jsonb(v_grade);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.revert_grade(UUID, TEXT) TO authenticated;
