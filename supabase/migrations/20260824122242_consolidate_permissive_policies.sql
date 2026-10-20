-- courses
DROP POLICY IF EXISTS "Public read courses" ON courses;
DROP POLICY IF EXISTS "Allow read access to courses" ON courses;
CREATE POLICY "Public read courses" ON courses FOR SELECT USING (true);

-- deadlines
DROP POLICY IF EXISTS "Authenticated users read deadlines" ON deadlines;
DROP POLICY IF EXISTS "Anyone can read deadlines" ON deadlines;
CREATE POLICY "Public read deadlines" ON deadlines FOR SELECT USING (true);

-- departments
DROP POLICY IF EXISTS "Authenticated read departments" ON departments;
DROP POLICY IF EXISTS "Admins write departments" ON departments;
CREATE POLICY "Authenticated read departments" ON departments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins write departments" ON departments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'admin'));

-- academic_years
DROP POLICY IF EXISTS "Authenticated read academic_years" ON academic_years;
DROP POLICY IF EXISTS "Admins write academic_years" ON academic_years;
CREATE POLICY "Authenticated read academic_years" ON academic_years FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins write academic_years" ON academic_years FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'admin'));

-- clearances
DROP POLICY IF EXISTS "Staff read all clearances" ON clearances;
DROP POLICY IF EXISTS "Students read own clearance" ON clearances;
DROP POLICY IF EXISTS "Registrar update clearances" ON clearances;
DROP POLICY IF EXISTS "Staff update clearances" ON clearances;
DROP POLICY IF EXISTS "Students update own clearances" ON clearances;

CREATE POLICY "Clearances select policy" ON clearances FOR SELECT TO authenticated
  USING (
    student_id = (SELECT auth.uid()) 
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.role IN ('staff', 'registrar', 'dean', 'admin'))
  );

CREATE POLICY "Clearances update policy" ON clearances FOR UPDATE TO authenticated
  USING (
    student_id = (SELECT auth.uid()) 
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.role IN ('staff', 'registrar', 'dean', 'admin'))
  )
  WITH CHECK (
    student_id = (SELECT auth.uid()) 
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.role IN ('staff', 'registrar', 'dean', 'admin'))
  );

-- enrollments
DROP POLICY IF EXISTS "Registrar read enrollments" ON enrollments;
DROP POLICY IF EXISTS "Staff read all enrollments" ON enrollments;
DROP POLICY IF EXISTS "Students read own enrollments" ON enrollments;

CREATE POLICY "Enrollments select policy" ON enrollments FOR SELECT TO authenticated
  USING (
    student_id = (SELECT auth.uid()) 
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.role IN ('faculty', 'teacher', 'staff', 'registrar', 'dean', 'admin'))
  );

-- chat_logs
DROP POLICY IF EXISTS "Admins read all chat_logs" ON chat_logs;
DROP POLICY IF EXISTS "Users read own chat_logs" ON chat_logs;
CREATE POLICY "Chat logs select policy" ON chat_logs FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid()) 
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'admin')
  );

-- system_settings
DROP POLICY IF EXISTS "Admins write settings" ON system_settings;
DROP POLICY IF EXISTS "Dean read system settings" ON system_settings;
DROP POLICY IF EXISTS "Dean write system settings" ON system_settings;
DROP POLICY IF EXISTS "Authenticated read settings" ON system_settings;

CREATE POLICY "System settings read policy" ON system_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "System settings write policy" ON system_settings FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.role IN ('admin', 'dean')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.role IN ('admin', 'dean')));
