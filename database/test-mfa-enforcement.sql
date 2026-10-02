-- =====================================================================
-- MyIMCC Portal — Integration Test for Database MFA Enforcement
--
-- Validates:
-- 1. Restrictive RLS enforcement on sensitive student records
--    (grades, clearances, billing_summary, installments, etc.)
-- 2. Safe Opt-in Rollout:
--    - Users WITHOUT a verified MFA factor continue accessing their data at AAL1.
--    - Users WITH a verified MFA factor are BLOCKED at AAL1 and REQUIRE AAL2.
-- 3. Role tests: Student, Faculty, and Admin access under both AAL1 & AAL2.
-- 4. Unblocked public/reference data & profiles access during sign-in.
-- =====================================================================

BEGIN;

-- ── 1. Test Harness Assertions ───────────────────────────────────────
CREATE OR REPLACE FUNCTION pg_temp.assert_true(cond BOOLEAN, name TEXT)
RETURNS TEXT AS $$
BEGIN
  IF cond IS NOT TRUE THEN
    RAISE EXCEPTION 'FAILED: %', name;
  END IF;
  RETURN name;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.assert_false(cond BOOLEAN, name TEXT)
RETURNS TEXT AS $$
BEGIN
  IF cond IS NOT FALSE THEN
    RAISE EXCEPTION 'FAILED: % (expected false, got %)', name, cond;
  END IF;
  RETURN name;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.assert_eq(got ANYELEMENT, want ANYELEMENT, name TEXT)
RETURNS TEXT AS $$
BEGIN
  IF got IS DISTINCT FROM want THEN
    RAISE EXCEPTION 'FAILED: % (expected %, got %)', name, want, got;
  END IF;
  RETURN name;
END;
$$ LANGUAGE plpgsql;

-- Helper to impersonate user with specific AAL level
CREATE OR REPLACE FUNCTION pg_temp.as_user_aal(uid UUID, aal TEXT DEFAULT 'aal1')
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', uid::TEXT, TRUE);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', uid::TEXT, 'role', 'authenticated', 'aal', aal)::TEXT,
    TRUE
  );
  SET LOCAL SESSION AUTHORIZATION authenticated;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.reset_user()
RETURNS VOID AS $$
BEGIN
  RESET SESSION AUTHORIZATION;
  PERFORM set_config('request.jwt.claim.sub', '', TRUE);
  PERFORM set_config('request.jwt.claims', '', TRUE);
END;
$$ LANGUAGE plpgsql;

-- ── 2. Create Fixtures ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pg_temp.uid(n INT) RETURNS UUID AS $$
  SELECT ('eeeeeeee-0000-0000-0000-00000000000' || n::TEXT)::UUID;
$$ LANGUAGE sql;

-- Make sure auth.mfa_factors exists in test context
CREATE TABLE IF NOT EXISTS auth.mfa_factors (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  factor_type text NOT NULL,
  status      text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  secret      text
);

-- Users:
-- 1: Student Alice (No MFA)
-- 2: Student Bob (Verified MFA)
-- 3: Faculty Dr. Cruz (No MFA)
-- 4: Faculty Prof. Santos (Verified MFA)
-- 5: Admin Boss (Verified MFA)
INSERT INTO auth.users (id, email) VALUES
  (pg_temp.uid(1), 'alice.student@imcc.edu.ph'),
  (pg_temp.uid(2), 'bob.student@imcc.edu.ph'),
  (pg_temp.uid(3), 'cruz.faculty@imcc.edu.ph'),
  (pg_temp.uid(4), 'santos.faculty@imcc.edu.ph'),
  (pg_temp.uid(5), 'boss.admin@imcc.edu.ph')
ON CONFLICT (id) DO NOTHING;

-- Populate profiles (trigger or direct insert)
INSERT INTO public.profiles (id, full_name, email, role, status, is_active) VALUES
  (pg_temp.uid(1), 'Alice Student', 'alice.student@imcc.edu.ph', 'student', 'approved', true),
  (pg_temp.uid(2), 'Bob Student', 'bob.student@imcc.edu.ph', 'student', 'approved', true),
  (pg_temp.uid(3), 'Dr. Cruz', 'cruz.faculty@imcc.edu.ph', 'faculty', 'approved', true),
  (pg_temp.uid(4), 'Prof. Santos', 'santos.faculty@imcc.edu.ph', 'faculty', 'approved', true),
  (pg_temp.uid(5), 'Admin Boss', 'boss.admin@imcc.edu.ph', 'admin', 'approved', true)
ON CONFLICT (id) DO UPDATE SET
  role = EXCLUDED.role,
  status = EXCLUDED.status,
  is_active = EXCLUDED.is_active;

-- Enroll Bob, Prof. Santos, and Admin Boss in MFA
INSERT INTO auth.mfa_factors (id, user_id, factor_type, status) VALUES
  (gen_random_uuid(), pg_temp.uid(2), 'totp', 'verified'),
  (gen_random_uuid(), pg_temp.uid(4), 'totp', 'verified'),
  (gen_random_uuid(), pg_temp.uid(5), 'totp', 'verified');

-- Fixture course offering
INSERT INTO public.course_offerings (id, course_code, course_name, units, faculty_id) VALUES
  (pg_temp.uid(10), 'CS101', 'Intro to CS', 3, pg_temp.uid(3)),
  (pg_temp.uid(11), 'CS102', 'Data Structures', 3, pg_temp.uid(4))
ON CONFLICT (id) DO NOTHING;

-- Fixture grades for Alice and Bob
INSERT INTO public.grades (id, student_id, course_offering_id, prelim_grade, midterm_grade, final_grade) VALUES
  (pg_temp.uid(20), pg_temp.uid(1), pg_temp.uid(10), 1.25, 1.5, 1.25),
  (pg_temp.uid(21), pg_temp.uid(2), pg_temp.uid(11), 1.75, 2.0, 1.75)
ON CONFLICT (id) DO NOTHING;

-- Fixture billing summaries
INSERT INTO public.billing_summary (id, student_id, total_assessed, total_paid, remaining_balance) VALUES
  (pg_temp.uid(30), pg_temp.uid(1), 15000, 5000, 10000),
  (pg_temp.uid(31), pg_temp.uid(2), 15000, 15000, 0)
ON CONFLICT (id) DO NOTHING;

-- ── 3. Run Assertions ────────────────────────────────────────────────

-- ── Test Suite A: Student Alice (No MFA factor enrolled) ──────────────
-- In opt-in rollout, unverified users MUST continue accessing their records at AAL1
DO $$
DECLARE
  v_cnt INT;
BEGIN
  PERFORM pg_temp.as_user_aal(pg_temp.uid(1), 'aal1');

  -- Alice can read her own grades
  SELECT COUNT(*) INTO v_cnt FROM public.grades WHERE student_id = pg_temp.uid(1);
  PERFORM pg_temp.assert_eq(v_cnt, 1, 'Alice without MFA reads own grades at AAL1');

  -- Alice can read her own billing summary
  SELECT COUNT(*) INTO v_cnt FROM public.billing_summary WHERE student_id = pg_temp.uid(1);
  PERFORM pg_temp.assert_eq(v_cnt, 1, 'Alice without MFA reads own billing at AAL1');

  -- Alice can read profiles & course offerings (sign-in & public reference data)
  SELECT COUNT(*) INTO v_cnt FROM public.profiles WHERE id = pg_temp.uid(1);
  PERFORM pg_temp.assert_eq(v_cnt, 1, 'Alice reads own profile at AAL1');

  PERFORM pg_temp.reset_user();
END $$;

-- ── Test Suite B: Student Bob (Verified MFA factor enrolled) ───────────
-- Enrolled users MUST NOT access sensitive student records at AAL1
DO $$
DECLARE
  v_cnt INT;
BEGIN
  -- Bob at AAL1: blocked from sensitive records by restrictive policy
  PERFORM pg_temp.as_user_aal(pg_temp.uid(2), 'aal1');

  SELECT COUNT(*) INTO v_cnt FROM public.grades WHERE student_id = pg_temp.uid(2);
  PERFORM pg_temp.assert_eq(v_cnt, 0, 'Bob with MFA blocked from grades at AAL1');

  SELECT COUNT(*) INTO v_cnt FROM public.billing_summary WHERE student_id = pg_temp.uid(2);
  PERFORM pg_temp.assert_eq(v_cnt, 0, 'Bob with MFA blocked from billing at AAL1');

  -- But Bob CAN still read profile (needed during login & MFA challenge)
  SELECT COUNT(*) INTO v_cnt FROM public.profiles WHERE id = pg_temp.uid(2);
  PERFORM pg_temp.assert_eq(v_cnt, 1, 'Bob reads own profile at AAL1 before MFA challenge');

  -- Bob at AAL2: fully allowed access to sensitive records
  PERFORM pg_temp.as_user_aal(pg_temp.uid(2), 'aal2');

  SELECT COUNT(*) INTO v_cnt FROM public.grades WHERE student_id = pg_temp.uid(2);
  PERFORM pg_temp.assert_eq(v_cnt, 1, 'Bob with MFA reads own grades at AAL2');

  SELECT COUNT(*) INTO v_cnt FROM public.billing_summary WHERE student_id = pg_temp.uid(2);
  PERFORM pg_temp.assert_eq(v_cnt, 1, 'Bob with MFA reads own billing at AAL2');

  PERFORM pg_temp.reset_user();
END $$;

-- ── Test Suite C: Faculty Access ─────────────────────────────────────
DO $$
DECLARE
  v_cnt INT;
BEGIN
  -- Dr. Cruz (No MFA): can access student grades for their course at AAL1
  PERFORM pg_temp.as_user_aal(pg_temp.uid(3), 'aal1');
  SELECT COUNT(*) INTO v_cnt FROM public.grades WHERE course_offering_id = pg_temp.uid(10);
  PERFORM pg_temp.assert_eq(v_cnt, 1, 'Dr. Cruz (no MFA) views course grades at AAL1');

  -- Prof. Santos (With MFA): blocked at AAL1
  PERFORM pg_temp.as_user_aal(pg_temp.uid(4), 'aal1');
  SELECT COUNT(*) INTO v_cnt FROM public.grades WHERE course_offering_id = pg_temp.uid(11);
  PERFORM pg_temp.assert_eq(v_cnt, 0, 'Prof. Santos (with MFA) blocked from grades at AAL1');

  -- Prof. Santos at AAL2: allowed
  PERFORM pg_temp.as_user_aal(pg_temp.uid(4), 'aal2');
  SELECT COUNT(*) INTO v_cnt FROM public.grades WHERE course_offering_id = pg_temp.uid(11);
  PERFORM pg_temp.assert_eq(v_cnt, 1, 'Prof. Santos (with MFA) views course grades at AAL2');

  PERFORM pg_temp.reset_user();
END $$;

-- ── Test Suite D: Admin Access ───────────────────────────────────────
DO $$
DECLARE
  v_cnt INT;
BEGIN
  -- Admin Boss (With MFA): blocked from sensitive student records at AAL1
  PERFORM pg_temp.as_user_aal(pg_temp.uid(5), 'aal1');
  SELECT COUNT(*) INTO v_cnt FROM public.grades;
  PERFORM pg_temp.assert_eq(v_cnt, 0, 'Admin Boss (with MFA) blocked from student grades at AAL1');

  -- Admin Boss at AAL2: allowed
  PERFORM pg_temp.as_user_aal(pg_temp.uid(5), 'aal2');
  SELECT COUNT(*) INTO v_cnt FROM public.grades;
  PERFORM pg_temp.assert_true(v_cnt >= 2, 'Admin Boss (with MFA) manages student grades at AAL2');

  PERFORM pg_temp.reset_user();
END $$;

ROLLBACK;
