-- =====================================================================
-- MyIMCC Portal — Grant Table & Sequence Privileges and RLS Fixes
-- Enables teachers and deans to input/update grades, attendance,
-- course offerings, announcements, and assignments.
-- =====================================================================

-- 1. Grant table, sequence, and routine privileges to authenticated
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;

GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO authenticated;

-- 2. Ensure RLS Policies for grades
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

-- 3. Ensure Deans can manage class announcements
DROP POLICY IF EXISTS "Faculty write own announcements" ON public.class_announcements;
CREATE POLICY "Faculty write own announcements"
  ON public.class_announcements FOR ALL TO authenticated
  USING (
    author_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role IN ('dean', 'admin')
    )
  );

-- 4. Ensure Staff, Dean, and Admin can insert clearances
DROP POLICY IF EXISTS "Staff dean admin insert clearances" ON public.clearances;
CREATE POLICY "Staff dean admin insert clearances"
  ON public.clearances FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role IN ('staff', 'registrar', 'dean', 'admin')
    )
  );

-- 5. Revoke anon execution on internal security definer trigger functions
REVOKE EXECUTE ON FUNCTION public.sync_teacher_assignment() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_grade_calculations() FROM anon;
REVOKE EXECUTE ON FUNCTION public.auto_create_student_semester() FROM anon;
