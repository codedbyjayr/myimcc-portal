-- Drop existing grade policies
DROP POLICY IF EXISTS "Teachers can view own grades" ON grades;
DROP POLICY IF EXISTS "Students can view own grades" ON grades;
DROP POLICY IF EXISTS "Admin can view all grades" ON grades;

-- Create new RLS policies for teacher grading
-- Teachers can insert grades for their assigned subjects
CREATE POLICY "Teachers can insert grades for assigned subjects" ON grades
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM teacher_assignments ta
      WHERE ta.teacher_id = auth.uid()
      AND ta.offering_id = grades.offering_id
      AND ta.is_active = true
    )
  );

-- Teachers can update grades for their assigned subjects
CREATE POLICY "Teachers can update grades for assigned subjects" ON grades
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM teacher_assignments ta
      WHERE ta.teacher_id = auth.uid()
      AND ta.offering_id = grades.offering_id
      AND ta.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM teacher_assignments ta
      WHERE ta.teacher_id = auth.uid()
      AND ta.offering_id = grades.offering_id
      AND ta.is_active = true
    )
  );

-- Teachers can view grades for their assigned subjects
CREATE POLICY "Teachers can view grades for assigned subjects" ON grades
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM teacher_assignments ta
      WHERE ta.teacher_id = auth.uid()
      AND ta.offering_id = grades.offering_id
      AND ta.is_active = true
    )
  );

-- Students can view their own grades
CREATE POLICY "Students can view own grades" ON grades
  FOR SELECT USING (
    student_id = auth.uid()
  );

-- Admin can view all grades
CREATE POLICY "Admin can view all grades" ON grades
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Dean can view all grades
CREATE POLICY "Dean can view all grades" ON grades
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'dean'
    )
  );

-- Dean can update any grades
CREATE POLICY "Dean can update any grades" ON grades
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'dean'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'dean'
    )
  );
