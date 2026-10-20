-- ============================================================
-- 1. Helper function to initialize clearances for a student
-- ============================================================
CREATE OR REPLACE FUNCTION public.initialize_student_clearances(target_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
$$;

-- ============================================================
-- 2. Update handle_new_user trigger to auto-create clearances
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  v_role := COALESCE(NULLIF(NEW.raw_user_meta_data->>'role',''), 'student');
  
  INSERT INTO public.profiles (id, email, status, role, program)
  VALUES (
    NEW.id,
    NEW.email,
    'onboarding',
    v_role,
    'BSIT'
  )
  ON CONFLICT (id) DO UPDATE
  SET program = COALESCE(public.profiles.program, 'BSIT');

  -- If student, initialize clearances
  IF v_role = 'student' THEN
    PERFORM public.initialize_student_clearances(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 3. Populate clearances for all existing students missing them
-- ============================================================
INSERT INTO public.clearances (student_id, department_code, department_name, officer_name, icon, status, note)
SELECT p.id, d.code, d.name, d.officer, d.icon, d.status, d.note
FROM public.profiles p
CROSS JOIN (
  VALUES
    ('cashier',    'Cashier / Finance',       'Ms. Maria Clara',      '💳', 'action_required', 'Pending clearance balance'),
    ('library',    'University Library',      'Mr. Jose Rizal',       '📚', 'cleared',         'No pending library holds'),
    ('dean',       'College Dean',            'Dr. Santiago Alvarez', '🎓', 'cleared',         'Academic clearance verified'),
    ('guidance',   'Guidance Office',         'Ms. Leonor Rivera',    '💬', 'cleared',         'Guidance record cleared'),
    ('laboratory', 'Laboratory / Cybershack', 'Mr. Juan Luna',       '🔬', 'cleared',         'No unreturned equipment')
) AS d(code, name, officer, icon, status, note)
WHERE p.role = 'student'
  AND NOT EXISTS (
    SELECT 1 FROM public.clearances c WHERE c.student_id = p.id
  );

-- Update any profiles where program is NULL to default to 'BSIT'
UPDATE public.profiles
SET program = 'BSIT'
WHERE program IS NULL;

-- ============================================================
-- 4. Ensure RLS policies for clearances allow insert/update
-- ============================================================
DROP POLICY IF EXISTS "Students insert own clearances" ON public.clearances;
CREATE POLICY "Students insert own clearances" ON public.clearances
  FOR INSERT WITH CHECK (student_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Students update own clearances" ON public.clearances;
CREATE POLICY "Students update own clearances" ON public.clearances
  FOR UPDATE USING (student_id = (SELECT auth.uid()));

-- Grant execute on initialize_student_clearances to authenticated users
GRANT EXECUTE ON FUNCTION public.initialize_student_clearances(uuid) TO authenticated;
