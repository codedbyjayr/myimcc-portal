-- 1. Index unindexed foreign keys
CREATE INDEX IF NOT EXISTS idx_course_offerings_instructor_id ON public.course_offerings (instructor_id);

-- 2. Fix Function Search Paths and Access Privileges
DO $$ 
BEGIN
  -- match_faq_articles
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'match_faq_articles') THEN
    ALTER FUNCTION public.match_faq_articles SET search_path = public, pg_temp;
  END IF;

  -- handle_new_user
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'handle_new_user') THEN
    REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
    ALTER FUNCTION public.handle_new_user() SET search_path = public, pg_temp;
  END IF;

  -- handle_new_sso_user
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'handle_new_sso_user') THEN
    REVOKE EXECUTE ON FUNCTION public.handle_new_sso_user() FROM PUBLIC, anon, authenticated;
    ALTER FUNCTION public.handle_new_sso_user() SET search_path = public, pg_temp;
  END IF;

  -- initialize_student_clearances
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'initialize_student_clearances') THEN
    REVOKE EXECUTE ON FUNCTION public.initialize_student_clearances(uuid) FROM anon;
    ALTER FUNCTION public.initialize_student_clearances(uuid) SET search_path = public, pg_temp;
  END IF;

  -- is_admin
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_admin') THEN
    REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
    ALTER FUNCTION public.is_admin() SET search_path = public, pg_temp;
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- 3. Optimize RLS Policies to use (SELECT auth.uid()) instead of auth.uid() directly

-- course_offerings
DROP POLICY IF EXISTS "Faculty and admin insert offerings" ON course_offerings;
CREATE POLICY "Faculty and admin insert offerings" ON course_offerings
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (SELECT auth.uid()) 
      AND role IN ('teacher', 'faculty', 'dean', 'admin')
    )
  );

DROP POLICY IF EXISTS "Faculty and admin update offerings" ON course_offerings;
CREATE POLICY "Faculty and admin update offerings" ON course_offerings
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (SELECT auth.uid()) 
      AND role IN ('teacher', 'faculty', 'dean', 'admin')
    )
  );

DROP POLICY IF EXISTS "Faculty and admin delete offerings" ON course_offerings;
CREATE POLICY "Faculty and admin delete offerings" ON course_offerings
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (SELECT auth.uid()) 
      AND role IN ('teacher', 'faculty', 'dean', 'admin')
    )
  );

-- grades
DROP POLICY IF EXISTS "Faculty insert grades" ON grades;
CREATE POLICY "Faculty insert grades" ON grades
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (SELECT auth.uid()) 
      AND role IN ('teacher', 'faculty', 'dean', 'admin')
    )
  );

DROP POLICY IF EXISTS "Faculty update grades" ON grades;
CREATE POLICY "Faculty update grades" ON grades
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (SELECT auth.uid()) 
      AND role IN ('teacher', 'faculty', 'dean', 'admin')
    )
  );

DROP POLICY IF EXISTS "Faculty read all grades" ON grades;
CREATE POLICY "Faculty read all grades" ON grades
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (SELECT auth.uid()) 
      AND role IN ('teacher', 'faculty', 'dean', 'admin')
    )
    OR student_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "Students view own grades" ON grades;
CREATE POLICY "Students view own grades" ON grades
  FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid()));

-- profiles
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
CREATE POLICY "Users can read own profile" ON profiles
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "authenticated_select_profiles" ON profiles;
DROP POLICY IF EXISTS "authenticated_update_profiles" ON profiles;

-- student_semesters
DROP POLICY IF EXISTS "Students view own semesters" ON student_semesters;
CREATE POLICY "Students view own semesters" ON student_semesters
  FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid()));

-- enrollments
DROP POLICY IF EXISTS "Students can insert own enrollments" ON enrollments;
CREATE POLICY "Students can insert own enrollments" ON enrollments
  FOR INSERT TO authenticated
  WITH CHECK (student_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Students view own enrollments" ON enrollments;
CREATE POLICY "Students view own enrollments" ON enrollments
  FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid()));

-- transactions
DROP POLICY IF EXISTS "Students view own transactions" ON transactions;
CREATE POLICY "Students view own transactions" ON transactions
  FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid()));

-- installments
DROP POLICY IF EXISTS "Students can update own installments" ON installments;
CREATE POLICY "Students can update own installments" ON installments
  FOR UPDATE TO authenticated
  USING (student_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Students view own installments" ON installments;
CREATE POLICY "Students view own installments" ON installments
  FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid()));

-- billing_summary
DROP POLICY IF EXISTS "Students view own billing summary" ON billing_summary;
CREATE POLICY "Students view own billing summary" ON billing_summary
  FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid()));

-- clearances
DROP POLICY IF EXISTS "Students can update own clearances" ON clearances;
CREATE POLICY "Students can update own clearances" ON clearances
  FOR UPDATE TO authenticated
  USING (student_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Students view own clearances" ON clearances;
CREATE POLICY "Students view own clearances" ON clearances
  FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid()));

-- announcements
DROP POLICY IF EXISTS "Teachers write announcements" ON announcements;
CREATE POLICY "Teachers write announcements" ON announcements
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (SELECT auth.uid()) 
      AND role IN ('teacher', 'faculty', 'staff', 'admin', 'dean', 'registrar')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (SELECT auth.uid()) 
      AND role IN ('teacher', 'faculty', 'staff', 'admin', 'dean', 'registrar')
    )
  );

-- attendance
DROP POLICY IF EXISTS "Faculty read all attendance" ON attendance;
CREATE POLICY "Faculty read all attendance" ON attendance
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (SELECT auth.uid()) 
      AND role IN ('faculty', 'teacher', 'staff', 'admin', 'dean')
    )
  );

DROP POLICY IF EXISTS "Faculty write attendance" ON attendance;
CREATE POLICY "Faculty write attendance" ON attendance
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (SELECT auth.uid()) 
      AND role IN ('faculty', 'teacher', 'admin', 'dean')
    )
  );

-- messages
DROP POLICY IF EXISTS "Users read own messages" ON messages;
CREATE POLICY "Users read own messages" ON messages
  FOR SELECT TO authenticated
  USING (sender_id = (SELECT auth.uid()) OR recipient_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users send messages" ON messages;
CREATE POLICY "Users send messages" ON messages
  FOR INSERT TO authenticated
  WITH CHECK (sender_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users update own messages" ON messages;
CREATE POLICY "Users update own messages" ON messages
  FOR UPDATE TO authenticated
  USING (recipient_id = (SELECT auth.uid()));

-- sso_links
DROP POLICY IF EXISTS "Admins write sso_links" ON sso_links;
CREATE POLICY "Admins write sso_links" ON sso_links
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (SELECT auth.uid()) 
      AND role = 'admin'
    )
  );

-- class_announcements
DROP POLICY IF EXISTS "Faculty read all class announcements" ON class_announcements;
CREATE POLICY "Faculty read all class announcements" ON class_announcements
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (SELECT auth.uid()) 
      AND role IN ('faculty', 'teacher', 'admin', 'dean')
    )
  );

DROP POLICY IF EXISTS "Faculty write own announcements" ON class_announcements;
CREATE POLICY "Faculty write own announcements" ON class_announcements
  FOR ALL TO authenticated
  USING (
    author_id = (SELECT auth.uid()) OR EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = (SELECT auth.uid()) 
      AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Students read class announcements" ON class_announcements;
CREATE POLICY "Students read class announcements" ON class_announcements
  FOR SELECT TO authenticated
  USING (
    is_active = true AND EXISTS (
      SELECT 1 FROM enrollments e 
      WHERE e.student_id = (SELECT auth.uid()) 
      AND e.offering_id = class_announcements.offering_id
    )
  );
