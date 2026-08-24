-- =====================================================================
-- MyIMCC Portal — Faculty & Dean Subject Management & Grading Migration
-- Run this in Supabase SQL Editor
-- =====================================================================

-- 1. Ensure `instructor_id` column exists on `course_offerings`
ALTER TABLE course_offerings 
  ADD COLUMN IF NOT EXISTS instructor_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- 2. Ensure `prelim` and `semifinal` columns exist on `grades`
ALTER TABLE grades 
  ADD COLUMN IF NOT EXISTS prelim NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS semifinal NUMERIC(5,2);

-- 3. Ensure role check constraint on `profiles` supports 'teacher' and 'dean'
DO $$ 
BEGIN
  ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
  ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
    CHECK (role IN ('student', 'teacher', 'faculty', 'dean', 'staff', 'admin'));
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- 4. Enable RLS on course_offerings (if not already enabled)
ALTER TABLE course_offerings ENABLE ROW LEVEL SECURITY;

-- 5. Course Offerings Policies: Allow faculty, teachers, deans, and admins to INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS "Faculty and admin insert offerings" ON course_offerings;
CREATE POLICY "Faculty and admin insert offerings" ON course_offerings
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('teacher', 'faculty', 'dean', 'admin')
    )
  );

DROP POLICY IF EXISTS "Faculty and admin update offerings" ON course_offerings;
CREATE POLICY "Faculty and admin update offerings" ON course_offerings
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('teacher', 'faculty', 'dean', 'admin')
    )
  );

DROP POLICY IF EXISTS "Faculty and admin delete offerings" ON course_offerings;
CREATE POLICY "Faculty and admin delete offerings" ON course_offerings
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('teacher', 'faculty', 'dean', 'admin')
    )
  );

-- 6. Grades Policies: Ensure faculty, teachers, deans, and admins can INSERT and UPDATE grades
DROP POLICY IF EXISTS "Faculty insert grades" ON grades;
CREATE POLICY "Faculty insert grades" ON grades
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('teacher', 'faculty', 'dean', 'admin')
    )
  );

DROP POLICY IF EXISTS "Faculty update grades" ON grades;
CREATE POLICY "Faculty update grades" ON grades
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('teacher', 'faculty', 'dean', 'admin')
    )
  );

DROP POLICY IF EXISTS "Faculty read all grades" ON grades;
CREATE POLICY "Faculty read all grades" ON grades
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('teacher', 'faculty', 'dean', 'admin')
    )
    OR student_id = auth.uid()
  );
