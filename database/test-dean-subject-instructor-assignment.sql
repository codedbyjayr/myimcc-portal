-- =====================================================================
-- MyIMCC Portal — Test Dean Subject-Instructor Assignment
--
-- Tests:
-- 1. get_subject_instructor_options authorization & filtering
-- 2. save_course_offering_with_instructor validation & authorization
-- 3. Atomic create offering + active teacher_assignment
-- 4. Atomic edit offering: deactivates previous assignment, creates/upserts new
-- 5. Strict consistency between course_offerings.instructor_id and
--    teacher_assignments.teacher_id
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(cond BOOLEAN, name TEXT)
RETURNS VOID AS $$
BEGIN
  IF cond IS NOT TRUE THEN
    RAISE EXCEPTION 'FAILED: %', name;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.assert_false(cond BOOLEAN, name TEXT)
RETURNS VOID AS $$
BEGIN
  IF cond IS NOT FALSE THEN
    RAISE EXCEPTION 'FAILED: % (expected false)', name;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.assert_eq(got TEXT, want TEXT, name TEXT)
RETURNS VOID AS $$
BEGIN
  IF got IS DISTINCT FROM want THEN
    RAISE EXCEPTION 'FAILED: % (got %, want %)', name, got, want;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ── 1. Create Test Fixture Profiles ───────────────────────────────────
DO $$
DECLARE
  v_dean_id UUID := '00000000-0000-0000-0000-000000000001';
  v_teacher1_id UUID := '00000000-0000-0000-0000-000000000002';
  v_teacher2_id UUID := '00000000-0000-0000-0000-000000000003';
  v_student_id UUID := '00000000-0000-0000-0000-000000000004';
  v_pending_teacher_id UUID := '00000000-0000-0000-0000-000000000005';
  v_offering_res JSONB;
  v_offering_id INT;
  v_count INT;
  v_ta_teacher_id UUID;
  v_ta_is_active BOOLEAN;
  v_ta_assigned_by UUID;
  v_caught BOOLEAN;
BEGIN
  -- Insert dummy profiles
  INSERT INTO public.profiles (id, full_name, email, role, status, is_active)
  VALUES
    (v_dean_id, 'Dr. Dean Test', 'dean.test@imcc.edu.ph', 'dean', 'approved', true),
    (v_teacher1_id, 'Prof. Teacher One', 'teacher1.test@imcc.edu.ph', 'teacher', 'approved', true),
    (v_teacher2_id, 'Prof. Teacher Two', 'teacher2.test@imcc.edu.ph', 'faculty', 'approved', true),
    (v_student_id, 'Student Test', 'student.test@imcc.edu.ph', 'student', 'approved', true),
    (v_pending_teacher_id, 'Pending Teacher', 'pending.teacher@imcc.edu.ph', 'teacher', 'pending', true)
  ON CONFLICT (id) DO NOTHING;

  -- ── Test 1: get_subject_instructor_options returns only eligible profiles
  -- Set session auth to dean
  PERFORM set_config('request.jwt.claim.sub', v_dean_id::text, true);

  SELECT COUNT(*) INTO v_count
  FROM public.get_subject_instructor_options()
  WHERE id IN (v_teacher1_id, v_teacher2_id);

  PERFORM pg_temp.assert_true(v_count = 2, 'Eligible teachers and faculty are returned by RPC');

  SELECT COUNT(*) INTO v_count
  FROM public.get_subject_instructor_options()
  WHERE id IN (v_dean_id, v_student_id, v_pending_teacher_id);

  PERFORM pg_temp.assert_true(v_count = 0, 'Dean, student, and pending teacher are excluded from instructor options');

  -- ── Test 2: Ineligible instructor rejected by save_course_offering_with_instructor
  v_caught := false;
  BEGIN
    PERFORM public.save_course_offering_with_instructor(
      NULL, 'TEST101', 'Test Offering Ineligible', 3.0, 'BSIT', 1, '1st Semester', '2026-2027', 'MWF 8-9', v_dean_id
    );
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  PERFORM pg_temp.assert_true(v_caught, 'Assigning a dean as instructor is rejected');

  -- ── Test 3: Create course offering with eligible instructor
  v_offering_res := public.save_course_offering_with_instructor(
    NULL, 'TEST101', 'Test Offering 1', 3.0, 'BSIT', 1, '1st Semester', '2026-2027', 'MWF 8-9', v_teacher1_id
  );

  v_offering_id := (v_offering_res->>'id')::INT;
  PERFORM pg_temp.assert_true(v_offering_id IS NOT NULL, 'Offering ID generated');

  -- Verify course_offerings row
  SELECT instructor_id::text, instructor_name INTO v_ta_teacher_id, v_ta_assigned_by
  FROM public.course_offerings
  WHERE id = v_offering_id;

  PERFORM pg_temp.assert_eq(v_ta_teacher_id, v_teacher1_id::text, 'course_offerings.instructor_id matches teacher 1');
  PERFORM pg_temp.assert_eq(v_ta_assigned_by::text, 'Prof. Teacher One', 'course_offerings.instructor_name matches full_name');

  -- Verify teacher_assignments row
  SELECT teacher_id, is_active, assigned_by
  INTO v_ta_teacher_id, v_ta_is_active, v_ta_assigned_by
  FROM public.teacher_assignments
  WHERE offering_id = v_offering_id AND is_active = true;

  PERFORM pg_temp.assert_true(v_ta_is_active, 'teacher_assignment is active');
  PERFORM pg_temp.assert_eq(v_ta_teacher_id::text, v_teacher1_id::text, 'teacher_assignments.teacher_id matches instructor_id');
  PERFORM pg_temp.assert_eq(v_ta_assigned_by::text, v_dean_id::text, 'assigned_by set to caller dean');

  -- ── Test 4: Update offering to new teacher (atomic reassignment)
  v_offering_res := public.save_course_offering_with_instructor(
    v_offering_id, 'TEST101', 'Test Offering 1 (Updated)', 3.0, 'BSIT', 1, '1st Semester', '2026-2027', 'MWF 8-9', v_teacher2_id
  );

  -- Verify course_offerings updated
  SELECT instructor_id::text INTO v_ta_teacher_id
  FROM public.course_offerings
  WHERE id = v_offering_id;

  PERFORM pg_temp.assert_eq(v_ta_teacher_id, v_teacher2_id::text, 'course_offerings updated to teacher 2');

  -- Verify old assignment is deactivated
  SELECT is_active INTO v_ta_is_active
  FROM public.teacher_assignments
  WHERE offering_id = v_offering_id AND teacher_id = v_teacher1_id;

  PERFORM pg_temp.assert_false(v_ta_is_active, 'Prior assignment to teacher 1 was deactivated');

  -- Verify new assignment is active
  SELECT is_active, assigned_by INTO v_ta_is_active, v_ta_assigned_by
  FROM public.teacher_assignments
  WHERE offering_id = v_offering_id AND teacher_id = v_teacher2_id;

  PERFORM pg_temp.assert_true(v_ta_is_active, 'New assignment to teacher 2 is active');
  PERFORM pg_temp.assert_eq(v_ta_assigned_by::text, v_dean_id::text, 'assigned_by recorded from dean');

  -- Verify only ONE active assignment exists for this offering
  SELECT COUNT(*) INTO v_count
  FROM public.teacher_assignments
  WHERE offering_id = v_offering_id AND is_active = true;

  PERFORM pg_temp.assert_true(v_count = 1, 'Exactly one active assignment exists for the offering');

END;
$$;

ROLLBACK;
