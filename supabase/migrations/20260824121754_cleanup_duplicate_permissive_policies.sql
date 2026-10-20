-- Clean up duplicate policies on activities
DROP POLICY IF EXISTS "Students view own activities" ON activities;
DROP POLICY IF EXISTS "Users can read own activities" ON activities;
DROP POLICY IF EXISTS "allow_authenticated_select" ON activities;

-- Clean up duplicate policies on announcements
DROP POLICY IF EXISTS "Authenticated users read announcements" ON announcements;
DROP POLICY IF EXISTS "allow_authenticated_select" ON announcements;

-- Clean up duplicate policies on attendance
DROP POLICY IF EXISTS "Students view own attendance" ON attendance;
DROP POLICY IF EXISTS "allow_authenticated_select" ON attendance;
DROP POLICY IF EXISTS "Teachers read handled attendance" ON attendance;
DROP POLICY IF EXISTS "Teachers update handled attendance" ON attendance;

-- Clean up duplicate policies on billing_summary
DROP POLICY IF EXISTS "Students view own billing summary" ON billing_summary;
DROP POLICY IF EXISTS "allow_authenticated_select" ON billing_summary;

-- Clean up duplicate policies on clearances
DROP POLICY IF EXISTS "Students view own clearances" ON clearances;
DROP POLICY IF EXISTS "Users can read own clearances" ON clearances;
DROP POLICY IF EXISTS "Students can update own clearances" ON clearances;
DROP POLICY IF EXISTS "allow_authenticated_select" ON clearances;

-- Clean up duplicate policies on course_offerings
DROP POLICY IF EXISTS "Allow read access to course_offerings" ON course_offerings;
DROP POLICY IF EXISTS "Authenticated users read course offerings" ON course_offerings;
DROP POLICY IF EXISTS "Staff and Dean manage course_offerings" ON course_offerings;
DROP POLICY IF EXISTS "allow_authenticated_select" ON course_offerings;

-- Clean up duplicate policies on enrollments
DROP POLICY IF EXISTS "Students view own enrollments" ON enrollments;
DROP POLICY IF EXISTS "Users can read own enrollments" ON enrollments;
DROP POLICY IF EXISTS "Students can insert own enrollments" ON enrollments;
DROP POLICY IF EXISTS "allow_authenticated_select" ON enrollments;

-- Clean up duplicate policies on faculty_evaluations
DROP POLICY IF EXISTS "Students can delete own evaluation" ON faculty_evaluations;
DROP POLICY IF EXISTS "Students can insert faculty evaluations" ON faculty_evaluations;
DROP POLICY IF EXISTS "Students can submit own evaluation" ON faculty_evaluations;
DROP POLICY IF EXISTS "Students can update own evaluation" ON faculty_evaluations;
DROP POLICY IF EXISTS "Students can view own evaluation only" ON faculty_evaluations;
DROP POLICY IF EXISTS "allow_authenticated_select" ON faculty_evaluations;
CREATE POLICY "Students manage own evaluations" ON faculty_evaluations
  FOR ALL TO authenticated
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);

-- Clean up duplicate policies on grades
DROP POLICY IF EXISTS "Dean read handled grades" ON grades;
DROP POLICY IF EXISTS "Dean update handled grades" ON grades;
DROP POLICY IF EXISTS "Faculty delete grades" ON grades;
DROP POLICY IF EXISTS "Students view own grades" ON grades;
DROP POLICY IF EXISTS "Teachers read handled grades" ON grades;
DROP POLICY IF EXISTS "Teachers update handled grades" ON grades;
DROP POLICY IF EXISTS "Users can read own grades" ON grades;
DROP POLICY IF EXISTS "allow_authenticated_select" ON grades;

-- Clean up duplicate policies on installments
DROP POLICY IF EXISTS "Students view own installments" ON installments;
DROP POLICY IF EXISTS "Students can update own installments" ON installments;
DROP POLICY IF EXISTS "allow_authenticated_select" ON installments;

-- Clean up duplicate policies on student_semesters
DROP POLICY IF EXISTS "Students view own semesters" ON student_semesters;
DROP POLICY IF EXISTS "Users can read own semesters" ON student_semesters;
DROP POLICY IF EXISTS "allow_authenticated_select" ON student_semesters;

-- Clean up duplicate policies on transactions
DROP POLICY IF EXISTS "Students view own transactions" ON transactions;
DROP POLICY IF EXISTS "allow_authenticated_select" ON transactions;

-- Clean up duplicate policies on academic_terms / academic_years
DROP POLICY IF EXISTS "allow_authenticated_select" ON academic_terms;
DROP POLICY IF EXISTS "allow_authenticated_select" ON academic_years;
DROP POLICY IF EXISTS "allow_authenticated_select" ON clearance_departments;
DROP POLICY IF EXISTS "allow_authenticated_select" ON clearance_status;
DROP POLICY IF EXISTS "allow_authenticated_select" ON cor_signatories;
DROP POLICY IF EXISTS "allow_authenticated_select" ON courses;
DROP POLICY IF EXISTS "allow_authenticated_select" ON deadlines;
DROP POLICY IF EXISTS "allow_authenticated_select" ON departments;
DROP POLICY IF EXISTS "allow_authenticated_select" ON enrollment_items;
DROP POLICY IF EXISTS "allow_authenticated_select" ON faq_articles;
DROP POLICY IF EXISTS "allow_authenticated_select" ON messages;
DROP POLICY IF EXISTS "allow_authenticated_select" ON misc_fees;
DROP POLICY IF EXISTS "allow_authenticated_select" ON rooms;
DROP POLICY IF EXISTS "allow_authenticated_select" ON sections;
DROP POLICY IF EXISTS "allow_authenticated_select" ON sso_links;
DROP POLICY IF EXISTS "allow_authenticated_select" ON students;
DROP POLICY IF EXISTS "allow_authenticated_select" ON system_settings;
DROP POLICY IF EXISTS "allow_authenticated_select" ON timetable;
DROP POLICY IF EXISTS "allow_authenticated_select" ON user_mfa;
