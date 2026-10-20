-- 1. Add policies for enrollment_items
DROP POLICY IF EXISTS "Authenticated read enrollment_items" ON enrollment_items;
CREATE POLICY "Authenticated read enrollment_items" ON enrollment_items
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Students insert enrollment_items" ON enrollment_items;
CREATE POLICY "Students insert enrollment_items" ON enrollment_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM enrollments e
      WHERE e.id = enrollment_items.enrollment_id
      AND e.student_id = (SELECT auth.uid())
    )
  );

-- 2. Add policies for user_mfa
DROP POLICY IF EXISTS "Users read own mfa" ON user_mfa;
CREATE POLICY "Users read own mfa" ON user_mfa
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users update own mfa" ON user_mfa;
CREATE POLICY "Users update own mfa" ON user_mfa
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users insert own mfa" ON user_mfa;
CREATE POLICY "Users insert own mfa" ON user_mfa
  FOR INSERT TO authenticated
  WITH CHECK (id = (SELECT auth.uid()));

-- 3. Change initialize_student_clearances to SECURITY INVOKER
CREATE OR REPLACE FUNCTION public.initialize_student_clearances(target_student_id uuid DEFAULT auth.uid())
 RETURNS void
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Default to calling user if not specified
  IF target_student_id IS NULL THEN
    target_student_id := auth.uid();
  END IF;

  -- Insert default clearance rows if none exist
  IF NOT EXISTS (SELECT 1 FROM public.clearances WHERE student_id = target_student_id) THEN
    INSERT INTO public.clearances (student_id, department_code, department_name, officer_name, icon, status, note)
    VALUES
      (target_student_id, 'cashier',    'Cashier / Finance',       'Ms. Maria Clara',      '💳', 'action_required', 'Pending clearance balance'),
      (target_student_id, 'library',    'University Library',      'Mr. Jose Rizal',       '📚', 'cleared',         'No pending library holds'),
      (target_student_id, 'dean',       'College Dean',            'Dr. Santiago Alvarez', '🎓', 'cleared',         'Academic clearance verified'),
      (target_student_id, 'guidance',   'Guidance Office',         'Ms. Leonor Rivera',    '💬', 'cleared',         'Guidance record cleared'),
      (target_student_id, 'laboratory', 'Laboratory / Cybershack', 'Mr. Juan Luna',       '🔬', 'cleared',         'No unreturned equipment');
  END IF;
END;
$function$;
