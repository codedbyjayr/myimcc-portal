-- ============================================================
-- MIGRATION: Fix Security & Performance Advisor Issues
-- ============================================================

-- ============================================================
-- PART 1: Fix function_search_path_mutable (SECURITY)
-- ============================================================

-- 1a. handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, status, role)
  VALUES (
    NEW.id,
    NEW.email,
    'onboarding',
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'role',''), 'student')
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- 1b. handle_new_sso_user
CREATE OR REPLACE FUNCTION public.handle_new_sso_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  user_role TEXT;
  user_domain TEXT;
BEGIN
  user_domain := split_part(NEW.email, '@', 2);

  IF user_domain = 'student.school.edu' OR user_domain = 'imcc.edu.ph' THEN
    user_role := 'Student';
  ELSIF user_domain = 'faculty.school.edu' THEN
    user_role := 'Faculty';
  ELSIF user_domain = 'admin.school.edu' THEN
    user_role := 'Admin';
  ELSE
    RAISE EXCEPTION 'Unauthorized Access - Institutional Email Required';
  END IF;

  INSERT INTO public.students (email, first_name, last_name, role)
  VALUES (
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'first_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    user_role
  )
  ON CONFLICT (email) DO UPDATE
  SET role = EXCLUDED.role;

  RETURN NEW;
END;
$$;

-- 1c. match_faq_articles (SET search_path = public so vector operators resolve)
CREATE OR REPLACE FUNCTION public.match_faq_articles(
  query_embedding public.vector,
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id uuid,
  category text,
  question text,
  answer text,
  keywords text,
  similarity float
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    f.id,
    f.category,
    f.question,
    f.answer,
    f.keywords,
    1 - (f.embedding <=> query_embedding) AS similarity
  FROM public.faq_articles f
  WHERE f.is_active = true
    AND f.embedding IS NOT NULL
    AND 1 - (f.embedding <=> query_embedding) > match_threshold
  ORDER BY f.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- 1d. is_admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
      AND status = 'approved'
  );
END;
$$;

-- 1e. seed_student_demo_data
CREATE OR REPLACE FUNCTION public.seed_student_demo_data(target_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_sa101  BIGINT;
  v_ias102 BIGINT;
  v_cap102 BIGINT;
  v_sia102 BIGINT;
BEGIN
  SELECT id INTO v_sa101  FROM public.course_offerings WHERE code = 'SA 101' LIMIT 1;
  SELECT id INTO v_ias102 FROM public.course_offerings WHERE code = 'IAS 102' LIMIT 1;
  SELECT id INTO v_cap102 FROM public.course_offerings WHERE code = 'CAP 102' LIMIT 1;
  SELECT id INTO v_sia102 FROM public.course_offerings WHERE code = 'SIA 102' LIMIT 1;

  UPDATE public.profiles
  SET
    student_no = '2023-00189',
    year_level = '4th Year',
    program    = 'BSIT',
    section    = 'BSIT-4A'
  WHERE id = target_student_id;

  DELETE FROM public.student_semesters WHERE student_id = target_student_id;
  INSERT INTO public.student_semesters (student_id, school_year, semester, is_current, gwa, units_enrolled, subjects_enrolled, balance)
  VALUES (target_student_id, '2026-2027', '1st Semester', true, 1.25, 12, 4, 6500.00);

  DELETE FROM public.enrollments WHERE student_id = target_student_id;
  IF v_sa101  IS NOT NULL THEN INSERT INTO public.enrollments (student_id, offering_id, status) VALUES (target_student_id, v_sa101, 'enrolled'); END IF;
  IF v_ias102 IS NOT NULL THEN INSERT INTO public.enrollments (student_id, offering_id, status) VALUES (target_student_id, v_ias102, 'enrolled'); END IF;
  IF v_cap102 IS NOT NULL THEN INSERT INTO public.enrollments (student_id, offering_id, status) VALUES (target_student_id, v_cap102, 'enrolled'); END IF;
  IF v_sia102 IS NOT NULL THEN INSERT INTO public.enrollments (student_id, offering_id, status) VALUES (target_student_id, v_sia102, 'enrolled'); END IF;

  DELETE FROM public.grades WHERE student_id = target_student_id;
  IF v_sa101 IS NOT NULL THEN
    INSERT INTO public.grades (student_id, offering_id, midterm, final, equivalent, ai_predicted_grade, ai_predicted_equivalent, remark)
    VALUES (target_student_id, v_sa101, 91.00, NULL, 1.50, '92.50', 1.25, 'Passed');
  END IF;
  IF v_ias102 IS NOT NULL THEN
    INSERT INTO public.grades (student_id, offering_id, midterm, final, equivalent, ai_predicted_grade, ai_predicted_equivalent, remark)
    VALUES (target_student_id, v_ias102, 94.00, NULL, 1.25, '95.00', 1.00, 'Passed');
  END IF;
  IF v_cap102 IS NOT NULL THEN
    INSERT INTO public.grades (student_id, offering_id, midterm, final, equivalent, ai_predicted_grade, ai_predicted_equivalent, remark)
    VALUES (target_student_id, v_cap102, 89.00, NULL, 1.75, '91.00', 1.50, 'Passed');
  END IF;
  IF v_sia102 IS NOT NULL THEN
    INSERT INTO public.grades (student_id, offering_id, midterm, final, equivalent, ai_predicted_grade, ai_predicted_equivalent, remark)
    VALUES (target_student_id, v_sia102, 93.00, NULL, 1.25, '94.00', 1.25, 'Passed');
  END IF;

  DELETE FROM public.clearances WHERE student_id = target_student_id;
  INSERT INTO public.clearances (student_id, department_code, department_name, officer_name, status, note, icon) VALUES
  (target_student_id, 'cashier',  'Cashier / Finance',  'Ms. Maria Clara',      'action_required', 'Pending balance of P6,500.00',              '💳'),
  (target_student_id, 'library',  'University Library', 'Mr. Jose Rizal',       'cleared',         'No pending library holds',                  '📚'),
  (target_student_id, 'dean',     'College Dean',       'Dr. Santiago Alvarez', 'cleared',         'Capstone 1 pre-requisite verified',         '🎓'),
  (target_student_id, 'guidance', 'Guidance Office',    'Ms. Leonor Rivera',    'cleared',         '4th Year status verified',                  '💬');

  DELETE FROM public.activities WHERE student_id = target_student_id;
  INSERT INTO public.activities (student_id, description, color) VALUES
  (target_student_id, 'Enrolled in 4th Year 1st Semester subjects (12 units)', '#E7338A'),
  (target_student_id, 'Capstone 2 enrollment verified (Pre-requisite CAP 101 cleared)', '#10B981');
END;
$$;

-- ============================================================
-- PART 2: Fix anon/authenticated SECURITY DEFINER exposure
-- ============================================================

-- Trigger functions should not be callable via RPC
REVOKE EXECUTE ON FUNCTION public.handle_new_sso_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
-- is_admin: revoke anon (only authenticated + RLS contexts need it)
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;

-- get_user_role: switch to SECURITY INVOKER - no elevated privilege needed
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- ============================================================
-- PART 3: Fix auth_rls_initplan (PERFORMANCE)
-- Wrap auth.uid() / auth.jwt() in (SELECT ...) - evaluated once per query
-- ============================================================

-- activities
DROP POLICY IF EXISTS "Students read own activities" ON public.activities;
CREATE POLICY "Students read own activities" ON public.activities
  FOR SELECT USING (student_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Students view own activities" ON public.activities;
CREATE POLICY "Students view own activities" ON public.activities
  FOR SELECT USING ((SELECT auth.uid()) = student_id);

DROP POLICY IF EXISTS "Users can read own activities" ON public.activities;
CREATE POLICY "Users can read own activities" ON public.activities
  FOR SELECT USING ((SELECT auth.uid()) = student_id);

-- attendance
DROP POLICY IF EXISTS "Students read own attendance" ON public.attendance;
CREATE POLICY "Students read own attendance" ON public.attendance
  FOR SELECT USING (student_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Students view own attendance" ON public.attendance;
CREATE POLICY "Students view own attendance" ON public.attendance
  FOR SELECT USING ((SELECT auth.uid()) = student_id);

-- billing_summary
DROP POLICY IF EXISTS "Students read own billing" ON public.billing_summary;
CREATE POLICY "Students read own billing" ON public.billing_summary
  FOR SELECT USING (student_id = (SELECT auth.uid()));

-- clearances
DROP POLICY IF EXISTS "Users can read own clearances" ON public.clearances;
CREATE POLICY "Users can read own clearances" ON public.clearances
  FOR SELECT USING ((SELECT auth.uid()) = student_id);

DROP POLICY IF EXISTS "Students read own clearance" ON public.clearances;
CREATE POLICY "Students read own clearance" ON public.clearances
  FOR SELECT USING (student_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Staff read all clearances" ON public.clearances;
CREATE POLICY "Staff read all clearances" ON public.clearances
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = ANY (ARRAY['staff'::text, 'admin'::text])
  ));

DROP POLICY IF EXISTS "Staff update clearances" ON public.clearances;
CREATE POLICY "Staff update clearances" ON public.clearances
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = ANY (ARRAY['staff'::text, 'admin'::text])
  ));

-- clearance_status
DROP POLICY IF EXISTS "Students view own clearance" ON public.clearance_status;
CREATE POLICY "Students view own clearance" ON public.clearance_status
  FOR SELECT USING (student_id IN (
    SELECT students.id FROM public.students
    WHERE students.email = (SELECT auth.jwt() ->> 'email')
  ));

-- departments
DROP POLICY IF EXISTS "Admins write departments" ON public.departments;
CREATE POLICY "Admins write departments" ON public.departments
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'admin'::text
  ));

-- academic_years
DROP POLICY IF EXISTS "Admins write academic_years" ON public.academic_years;
CREATE POLICY "Admins write academic_years" ON public.academic_years
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'admin'::text
  ));

-- enrollments
DROP POLICY IF EXISTS "Users can read own enrollments" ON public.enrollments;
CREATE POLICY "Users can read own enrollments" ON public.enrollments
  FOR SELECT USING ((SELECT auth.uid()) = student_id);

DROP POLICY IF EXISTS "Students read own enrollments" ON public.enrollments;
CREATE POLICY "Students read own enrollments" ON public.enrollments
  FOR SELECT USING (student_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Students insert own enrollments" ON public.enrollments;
CREATE POLICY "Students insert own enrollments" ON public.enrollments
  FOR INSERT WITH CHECK (student_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Students update own enrollments" ON public.enrollments;
CREATE POLICY "Students update own enrollments" ON public.enrollments
  FOR UPDATE USING (student_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Staff read all enrollments" ON public.enrollments;
CREATE POLICY "Staff read all enrollments" ON public.enrollments
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = ANY (ARRAY['faculty'::text, 'staff'::text, 'admin'::text])
  ));

-- grades
DROP POLICY IF EXISTS "Users can read own grades" ON public.grades;
CREATE POLICY "Users can read own grades" ON public.grades
  FOR SELECT USING ((SELECT auth.uid()) = student_id);

DROP POLICY IF EXISTS "Students read own grades" ON public.grades;
CREATE POLICY "Students read own grades" ON public.grades
  FOR SELECT USING (student_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Faculty read all grades" ON public.grades;
CREATE POLICY "Faculty read all grades" ON public.grades
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = ANY (ARRAY['faculty'::text, 'admin'::text])
  ));

DROP POLICY IF EXISTS "Faculty update grades" ON public.grades;
CREATE POLICY "Faculty update grades" ON public.grades
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = ANY (ARRAY['faculty'::text, 'admin'::text])
  ));

-- installments
DROP POLICY IF EXISTS "Students read own installments" ON public.installments;
CREATE POLICY "Students read own installments" ON public.installments
  FOR SELECT USING (student_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Students update own installments" ON public.installments;
CREATE POLICY "Students update own installments" ON public.installments
  FOR UPDATE USING (student_id = (SELECT auth.uid()));

-- student_semesters
DROP POLICY IF EXISTS "Users can read own semesters" ON public.student_semesters;
CREATE POLICY "Users can read own semesters" ON public.student_semesters
  FOR SELECT USING ((SELECT auth.uid()) = student_id);

DROP POLICY IF EXISTS "Students read own semesters" ON public.student_semesters;
CREATE POLICY "Students read own semesters" ON public.student_semesters
  FOR SELECT USING (student_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Admins read all semesters" ON public.student_semesters;
CREATE POLICY "Admins read all semesters" ON public.student_semesters
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'admin'::text
  ));

-- students
DROP POLICY IF EXISTS "Students view own profile" ON public.students;
CREATE POLICY "Students view own profile" ON public.students
  FOR SELECT USING (email = (SELECT auth.jwt() ->> 'email'));

-- transactions
DROP POLICY IF EXISTS "Students read own transactions" ON public.transactions;
CREATE POLICY "Students read own transactions" ON public.transactions
  FOR SELECT USING (student_id = (SELECT auth.uid()));

-- rooms
DROP POLICY IF EXISTS "Admins write rooms" ON public.rooms;
CREATE POLICY "Admins write rooms" ON public.rooms
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'admin'::text
  ));

-- sections
DROP POLICY IF EXISTS "Admins write sections" ON public.sections;
CREATE POLICY "Admins write sections" ON public.sections
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'admin'::text
  ));

-- timetable
DROP POLICY IF EXISTS "Admins write timetable" ON public.timetable;
CREATE POLICY "Admins write timetable" ON public.timetable
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'admin'::text
  ));

-- ============================================================
-- PART 4: Fix unindexed_foreign_keys (PERFORMANCE)
-- Add covering indexes for all FK columns without one
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_activities_student_id         ON public.activities          (student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_marked_by          ON public.attendance          (marked_by);
CREATE INDEX IF NOT EXISTS idx_attendance_offering_id        ON public.attendance          (offering_id);
CREATE INDEX IF NOT EXISTS idx_attendance_timetable_id       ON public.attendance          (timetable_id);
CREATE INDEX IF NOT EXISTS idx_chat_logs_user_id             ON public.chat_logs           (user_id);
CREATE INDEX IF NOT EXISTS idx_class_announcements_author_id ON public.class_announcements (author_id);
CREATE INDEX IF NOT EXISTS idx_class_announcements_offering  ON public.class_announcements (offering_id);
CREATE INDEX IF NOT EXISTS idx_clearance_status_dept_id      ON public.clearance_status    (department_id);
CREATE INDEX IF NOT EXISTS idx_clearance_status_student_id   ON public.clearance_status    (student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_offering_id       ON public.enrollments         (offering_id);
CREATE INDEX IF NOT EXISTS idx_grades_offering_id            ON public.grades              (offering_id);
CREATE INDEX IF NOT EXISTS idx_installments_student_id       ON public.installments        (student_id);
CREATE INDEX IF NOT EXISTS idx_messages_recipient_id         ON public.messages            (recipient_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id            ON public.messages            (sender_id);
CREATE INDEX IF NOT EXISTS idx_sections_academic_year_id     ON public.sections            (academic_year_id);
CREATE INDEX IF NOT EXISTS idx_sections_adviser_id           ON public.sections            (adviser_id);
CREATE INDEX IF NOT EXISTS idx_system_settings_updated_by    ON public.system_settings     (updated_by);
CREATE INDEX IF NOT EXISTS idx_timetable_room_id             ON public.timetable           (room_id);
CREATE INDEX IF NOT EXISTS idx_timetable_teacher_id          ON public.timetable           (teacher_id);
CREATE INDEX IF NOT EXISTS idx_transactions_student_id       ON public.transactions        (student_id);
