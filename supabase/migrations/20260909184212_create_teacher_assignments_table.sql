CREATE TABLE teacher_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  offering_id INTEGER REFERENCES course_offerings(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES profiles(id),
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,
  academic_year TEXT DEFAULT '2026-2027',
  semester TEXT DEFAULT '1st Semester',
  UNIQUE(teacher_id, offering_id, academic_year, semester)
);

-- Enable RLS
ALTER TABLE teacher_assignments ENABLE ROW LEVEL SECURITY;

-- Policy: Dean can manage all assignments
CREATE POLICY "Dean can manage all assignments" ON teacher_assignments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'dean'
    )
  );

-- Policy: Teachers can view their own assignments
CREATE POLICY "Teachers can view own assignments" ON teacher_assignments
  FOR SELECT USING (
    teacher_id = auth.uid()
  );

-- Policy: Admin can view all assignments
CREATE POLICY "Admin can view all assignments" ON teacher_assignments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );
