-- =====================================================================
-- MyIMCC Portal — Faculty, Teacher & Dean Database Fixes
-- Complete migration to ensure all features across Dean and Faculty dashboards work flawlessly.
-- =====================================================================

-- 1. Add missing columns to Dean management tables
ALTER TABLE public.department_budgets ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.grant_funding ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.appeals ADD COLUMN IF NOT EXISTS requested_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 2. Deactivate rogue duplicate active teacher assignments (e.g. Dean assigned to other teachers' classes)
UPDATE public.teacher_assignments ta
SET is_active = false
FROM public.course_offerings co
WHERE ta.offering_id = co.id
  AND ta.teacher_id != co.instructor_id
  AND ta.is_active = true;

-- 3. Robust teacher assignment sync trigger function
CREATE OR REPLACE FUNCTION public.sync_teacher_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  -- If instructor is unassigned, deactivate assignments for this offering
  IF NEW.instructor_id IS NULL THEN
    UPDATE public.teacher_assignments
    SET is_active = false
    WHERE offering_id = NEW.id;
  ELSE
    -- Deactivate any previous active assignments that do not match the new instructor
    UPDATE public.teacher_assignments
    SET is_active = false
    WHERE offering_id = NEW.id 
      AND (teacher_id IS DISTINCT FROM NEW.instructor_id OR academic_year IS DISTINCT FROM NEW.school_year OR semester IS DISTINCT FROM NEW.semester);

    -- Upsert active assignment for the new instructor
    INSERT INTO public.teacher_assignments (teacher_id, offering_id, academic_year, semester, is_active, assigned_by)
    VALUES (NEW.instructor_id, NEW.id, NEW.school_year, NEW.semester, true, auth.uid())
    ON CONFLICT (teacher_id, offering_id, academic_year, semester)
    DO UPDATE SET 
      is_active = true,
      assigned_by = COALESCE(auth.uid(), public.teacher_assignments.assigned_by);
  END IF;

  RETURN NEW;
END;
$function$;

-- 4. Upgrade update_grade_calculations trigger function on grades table
CREATE OR REPLACE FUNCTION public.update_grade_calculations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  -- Bi-directional sync between standard grade fields and percentage fields:
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

    IF NEW.equivalent IS NULL THEN
      NEW.equivalent := NEW.computed_equivalent;
    END IF;
  END IF;

  -- Calculate final passing remark
  IF NEW.remark IS NULL OR NEW.remark = '' OR NEW.remark = 'Pending' THEN
    IF NEW.final IS NULL THEN
      NEW.remark := 'Pending';
    ELSIF NEW.computed_equivalent IS NOT NULL AND NEW.computed_equivalent <= 3.00 THEN
      NEW.remark := 'Passed';
    ELSIF NEW.equivalent IS NOT NULL AND NEW.equivalent <= 3.00 THEN
      NEW.remark := 'Passed';
    ELSE
      NEW.remark := 'Failed';
    END IF;
  END IF;

  -- Audit fields
  IF NEW.graded_by IS NULL THEN
    NEW.graded_by := auth.uid();
  END IF;
  IF NEW.graded_at IS NULL THEN
    NEW.graded_at := now();
  END IF;

  RETURN NEW;
END;
$function$;

-- 5. RLS policies for faculty_evaluations
DROP POLICY IF EXISTS "Deans and admins view all evaluations" ON public.faculty_evaluations;
CREATE POLICY "Deans and admins view all evaluations" ON public.faculty_evaluations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid())
        AND role IN ('dean', 'admin')
        AND status = 'approved'
    )
  );

DROP POLICY IF EXISTS "Teachers view own evaluations" ON public.faculty_evaluations;
CREATE POLICY "Teachers view own evaluations" ON public.faculty_evaluations
  FOR SELECT TO authenticated
  USING (
    instructor_name = (
      SELECT full_name FROM public.profiles
      WHERE id = (SELECT auth.uid())
        AND status = 'approved'
    )
  );

DROP POLICY IF EXISTS "Deans and admins manage evaluations" ON public.faculty_evaluations;
CREATE POLICY "Deans and admins manage evaluations" ON public.faculty_evaluations
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid())
        AND role IN ('dean', 'admin')
        AND status = 'approved'
    )
  );

-- 6. Performance-optimized RLS policies on Dean tables
DROP POLICY IF EXISTS "Dean admin manage department_budgets" ON public.department_budgets;
CREATE POLICY "Dean admin manage department_budgets" ON public.department_budgets
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role IN ('dean', 'admin')
    )
  );

DROP POLICY IF EXISTS "Dean admin manage grant_funding" ON public.grant_funding;
CREATE POLICY "Dean admin manage grant_funding" ON public.grant_funding
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role IN ('dean', 'admin')
    )
  );

DROP POLICY IF EXISTS "Dean admin manage faculty_notes" ON public.faculty_notes;
CREATE POLICY "Dean admin manage faculty_notes" ON public.faculty_notes
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role IN ('dean', 'admin')
    )
  );

DROP POLICY IF EXISTS "Dean admin manage accreditation_checklist" ON public.accreditation_checklist;
CREATE POLICY "Dean admin manage accreditation_checklist" ON public.accreditation_checklist
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role IN ('dean', 'admin')
    )
  );

DROP POLICY IF EXISTS "Dean admin manage appeals" ON public.appeals;
CREATE POLICY "Dean admin manage appeals" ON public.appeals
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role IN ('dean', 'admin')
    )
  );

-- 7. Courses management for Deans and Admins
DROP POLICY IF EXISTS "Deans and admins manage courses" ON public.courses;
CREATE POLICY "Deans and admins manage courses" ON public.courses
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role IN ('dean', 'admin')
    )
  );

-- 8. Recreate teacher_subject_students view with full grade columns
DROP VIEW IF EXISTS public.teacher_subject_students;
CREATE VIEW public.teacher_subject_students
WITH (security_invoker = true)
AS
SELECT 
  ta.teacher_id,
  p.full_name AS teacher_name,
  co.id AS offering_id,
  co.code AS course_code,
  co.title AS course_title,
  e.student_id,
  st.full_name AS student_name,
  st.student_no,
  st.email AS student_email,
  st.year_level,
  st.section,
  e.status AS enrollment_status,
  e.enrolled_at,
  g.id AS grade_id,
  g.prelim,
  g.midterm,
  g.semifinal,
  g.final,
  g.equivalent,
  g.remark,
  g.prelim_percentage,
  g.midterm_percentage,
  g.semifinal_percentage,
  g.final_percentage,
  g.average_percentage,
  g.computed_equivalent,
  g.computed_remark,
  g.graded_by,
  g.graded_at
FROM public.teacher_assignments ta
JOIN public.profiles p ON ta.teacher_id = p.id
JOIN public.course_offerings co ON ta.offering_id = co.id
JOIN public.enrollments e ON co.id = e.offering_id
JOIN public.profiles st ON e.student_id = st.id
LEFT JOIN public.grades g ON e.student_id = g.student_id AND e.offering_id = g.offering_id
WHERE ta.is_active = true 
  AND st.role = 'student' 
  AND st.status = 'approved';

GRANT SELECT ON public.teacher_subject_students TO authenticated;
