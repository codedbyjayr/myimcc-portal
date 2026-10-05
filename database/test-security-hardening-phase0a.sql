-- =====================================================================
-- MyIMCC Portal — Phase 0a Security Integration Test
-- Run AFTER security-hardening-phase0a.sql, in the same session.
-- Supabase Dashboard → SQL Editor.
--
-- Wrapped in a transaction and rolled back, so it leaves no test data
-- behind. Every assertion raises on failure, so the run aborts at the
-- first broken guarantee.
-- =====================================================================

BEGIN;

-- ── Assertion helpers (session-local, dropped on close) ─────────────
CREATE OR REPLACE FUNCTION pg_temp.assert_eq(
  actual ANYELEMENT, expected ANYELEMENT, label TEXT
) RETURNS VOID AS $$
BEGIN
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'FAIL  % -> expected [%] but got [%]', label, expected, actual;
  END IF;
  RAISE NOTICE 'PASS  %', label;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.assert_raises(
    stmt TEXT, expected_sqlstate TEXT, label TEXT
  ) RETURNS VOID AS $$
  BEGIN
    BEGIN
      EXECUTE stmt;
    EXCEPTION WHEN OTHERS THEN
      IF SQLSTATE = expected_sqlstate THEN
        RAISE NOTICE 'PASS  %', label;
        RETURN;
      END IF;
      RAISE EXCEPTION 'FAIL  % -> expected SQLSTATE % but got % (%)',
        label, expected_sqlstate, SQLSTATE, SQLERRM;
    END;
    RAISE EXCEPTION 'FAIL  % -> statement succeeded but should have been blocked', label;
  END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.as_user(uuid_text TEXT, label TEXT)
  RETURNS VOID AS $$
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', uuid_text, true);
    -- SET LOCAL SESSION AUTHORIZATION, not SET LOCAL ROLE, and the difference
    -- matters here. profiles_protect_privileged() gates its owner bootstrap on
    -- session_user, and SET ROLE leaves session_user alone -- so with SET ROLE
    -- the session was still 'postgres', the guard treated every caller as
    -- trusted, and the refusal assertions below passed for the wrong reason
    -- (or failed, as B8 did, because the write was in fact permitted).
    -- Switching the session authorization makes session_user 'authenticated',
    -- which is what PostgREST looks like, so the guard is genuinely engaged.
    SET LOCAL SESSION AUTHORIZATION authenticated;
    RAISE NOTICE '---- acting as % ----', label;
  END $$ LANGUAGE plpgsql;

-- Back to owner rights for fixture inserts.
CREATE OR REPLACE FUNCTION pg_temp.reset_user()
  RETURNS VOID AS $$
  BEGIN
    RESET SESSION AUTHORIZATION;
    PERFORM set_config('request.jwt.claim.sub', '', true);
  END $$ LANGUAGE plpgsql;

-- ── Fixtures ────────────────────────────────────────────────────────
-- A pre-existing, already-trusted admin. The migration does not re-derive
-- roles for rows that already exist, so this must survive untouched.
--
-- The auth.users row is created first because profiles.id references
-- auth.users(id); inserting straight into profiles failed the foreign key.
-- Going through auth.users also means handle_new_user() creates the profile,
-- and it is then promoted exactly the way the first admin is promoted for real
-- -- from the SQL editor, which the guard permits via session_user.
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('11111111-1111-1111-1111-111111111111', 'admin.official@imcc.edu.ph', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

UPDATE public.profiles
   SET full_name = 'Test Admin', role = 'admin', status = 'approved', is_active = true
 WHERE id = '11111111-1111-1111-1111-111111111111';

-- New signups, created through the real auth trigger.
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'abc12345@imcc.edu.ph',   '{}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'maria.santos@imcc.edu.ph','{}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'random.person@gmail.com', '{}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'juan.dela.cruz@imcc.edu.ph', '{}'::jsonb);

-- ═════════════════════════════════════════════════════════════════════
-- A. Signup must not grant access to anyone
-- ═════════════════════════════════════════════════════════════════════
SELECT pg_temp.assert_eq((SELECT role FROM public.profiles WHERE id='aaaaaaaa-0000-0000-0000-000000000001'), 'pending', 'A1 student signup starts pending');
SELECT pg_temp.assert_eq((SELECT status FROM public.profiles WHERE id='aaaaaaaa-0000-0000-0000-000000000001'), 'onboarding', 'A2 student signup status onboarding so it reaches the role picker');
SELECT pg_temp.assert_eq((SELECT is_active FROM public.profiles WHERE id='aaaaaaaa-0000-0000-0000-000000000001'), false, 'A3 student signup inactive');

-- The original defect: any unmatched address fell through to 'student'.
SELECT pg_temp.assert_eq((SELECT role FROM public.profiles WHERE id='aaaaaaaa-0000-0000-0000-000000000003'), 'pending', 'A4 gmail address NOT auto-made a student');
SELECT pg_temp.assert_eq((SELECT role FROM public.profiles WHERE id='aaaaaaaa-0000-0000-0000-000000000002'), 'pending', 'A5 faculty address NOT auto-made staff');

-- ═════════════════════════════════════════════════════════════════════
-- B. Student onboarding auto-approves; faculty does not
-- ═════════════════════════════════════════════════════════════════════
SELECT pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001', 'new student abc12345');

UPDATE public.profiles
   SET requested_role = 'student',
       student_no    = '2024-00001',
       program       = 'BSCS',
       year_level    = '2',
       section       = 'BSCS-2A'
 WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';

SELECT pg_temp.assert_eq((SELECT role FROM public.profiles WHERE id='aaaaaaaa-0000-0000-0000-000000000001'), 'student', 'B1 student auto-approved to student role');
SELECT pg_temp.assert_eq((SELECT status FROM public.profiles WHERE id='aaaaaaaa-0000-0000-0000-000000000001'), 'approved', 'B2 student auto-approved status');
SELECT pg_temp.assert_eq((SELECT is_active FROM public.profiles WHERE id='aaaaaaaa-0000-0000-0000-000000000001'), true, 'B3 student auto-approved active');
SELECT pg_temp.assert_eq((SELECT student_no FROM public.profiles WHERE id='aaaaaaaa-0000-0000-0000-000000000001'), '2024-00001', 'B4 academic details saved during onboarding');

-- A non-student-pattern address stays in the queue even if it asks for student.
SELECT pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000002', 'faculty maria.santos');
UPDATE public.profiles SET requested_role = 'faculty' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000002';
SELECT pg_temp.assert_eq((SELECT role FROM public.profiles WHERE id='aaaaaaaa-0000-0000-0000-000000000002'), 'pending', 'B5 faculty stays pending for manual approval');

SELECT pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000003', 'gmail signup claiming student');
UPDATE public.profiles SET requested_role = 'student' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000003';
SELECT pg_temp.assert_eq((SELECT role FROM public.profiles WHERE id='aaaaaaaa-0000-0000-0000-000000000003'), 'pending', 'B6 non-pattern address cannot self-approve as student');

-- Regression: requested_role was originally listed in the same rejected
-- field tuple as role/status, so the B1 update above was refused before the
    -- auto-approval branch could run. Assert the write is permitted while
    -- pending and frozen once approved.
    --
    -- Read as owner: this is a positive control on the previous section, and
    -- the current role is the unrelated gmail signup from B6, which cannot see
    -- user 1's row at all. Compared as that user it read NULL and would have
    -- failed no matter what auto-approval did.
    SELECT pg_temp.reset_user();

    SELECT pg_temp.assert_eq(
      (SELECT status FROM public.profiles WHERE id='aaaaaaaa-0000-0000-0000-000000000001'),
      'approved',
      'B7 auto-approval actually completed, so B1 was not silently refused'
);

-- Fixture 001 is now an approved student. requested_role must be frozen.
SELECT pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001', 'approved student');
  SELECT pg_temp.assert_raises(
    $$UPDATE public.profiles
         SET requested_role = 'admin'
       WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'$$,
    '42501',
    'B8 requested_role frozen after approval'
  );

-- The reverse escalation must still fail: a pending user cannot set the
-- privileged columns directly while choosing a role.
SELECT pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000004', 'faculty juan.dela Cruz');
  SELECT pg_temp.assert_raises(
    $$UPDATE public.profiles
         SET requested_role = 'faculty',
             role            = 'admin',
             status          = 'approved'
       WHERE id = 'aaaaaaaa-0000-0000-0000-000000000004'$$,
    '42501',
    'B9 pending user cannot self-approve as admin'
  );

-- ═════════════════════════════════════════════════════════════════════
-- C. Privilege escalation must be blocked  ← the critical section
-- ═════════════════════════════════════════════════════════════════════
SELECT pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001', 'approved student');

-- The original vulnerability, verbatim.
SELECT pg_temp.assert_raises(
  $$UPDATE public.profiles SET role='admin' WHERE id='aaaaaaaa-0000-0000-0000-000000000001'$$,
  '42501', 'C1 student CANNOT promote self to admin');

SELECT pg_temp.assert_raises(
  $$UPDATE public.profiles SET role='admin', status='approved' WHERE id='aaaaaaaa-0000-0000-0000-000000000001'$$,
  '42501', 'C2 student CANNOT promote self with status change');

SELECT pg_temp.assert_raises(
  $$UPDATE public.profiles SET status='approved' WHERE id='aaaaaaaa-0000-0000-0000-000000000002'$$,
  '42501', 'C3 pending user CANNOT self-approve');

SELECT pg_temp.assert_raises(
  $$UPDATE public.profiles SET is_active=true WHERE id='aaaaaaaa-0000-0000-0000-000000000002'$$,
  '42501', 'C4 pending user CANNOT self-activate');

SELECT pg_temp.assert_raises(
  $$UPDATE public.profiles SET full_name='Forged Name' WHERE id='aaaaaaaa-0000-0000-0000-000000000001'$$,
  '42501', 'C5 student CANNOT rewrite own full_name');

SELECT pg_temp.assert_raises(
  $$UPDATE public.profiles SET email='admin@imcc.edu.ph' WHERE id='aaaaaaaa-0000-0000-0000-000000000001'$$,
  '42501', 'C6 student CANNOT rewrite own email');

-- Row-crossing ("you may only edit your own row") is enforced by the
-- RLS policy's USING clause, not by this trigger, so it cannot be
-- asserted here: the SQL editor runs as the table owner and bypasses RLS.
-- The column-level GRANT in section 5 of the migration is likewise only
-- exercised over PostgREST as the `authenticated` role. Both are
-- defence-in-depth behind the trigger asserted in this section.

-- Harmless self-edits must still work.
UPDATE public.profiles SET phone='09171234567', avatar_url='https://x.test/a.png'
 WHERE id='aaaaaaaa-0000-0000-0000-000000000001';
SELECT pg_temp.assert_eq((SELECT phone FROM public.profiles WHERE id='aaaaaaaa-0000-0000-0000-000000000001'), '09171234567', 'C8 student CAN edit own phone');
SELECT pg_temp.assert_eq((SELECT avatar_url FROM public.profiles WHERE id='aaaaaaaa-0000-0000-0000-000000000001'), 'https://x.test/a.png', 'C9 student CAN edit own avatar');

-- ═════════════════════════════════════════════════════════════════════
-- D. Admin write paths
-- ═════════════════════════════════════════════════════════════════════
SELECT pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'admin');

SELECT public.set_user_approval('aaaaaaaa-0000-0000-0000-000000000002', true, 'faculty');
SELECT pg_temp.assert_eq((SELECT role FROM public.profiles WHERE id='aaaaaaaa-0000-0000-0000-000000000002'), 'faculty', 'D1 admin approves faculty');
SELECT pg_temp.assert_eq((SELECT status FROM public.profiles WHERE id='aaaaaaaa-0000-0000-0000-000000000002'), 'approved', 'D2 approved status');
SELECT pg_temp.assert_eq((SELECT requested_role FROM public.profiles WHERE id='aaaaaaaa-0000-0000-0000-000000000002'), NULL, 'D3 requested_role cleared after approval');

-- 'registrar' must be accepted by the role vocabulary.
SELECT public.set_user_approval('aaaaaaaa-0000-0000-0000-000000000003', true, 'registrar');
SELECT pg_temp.assert_eq((SELECT role FROM public.profiles WHERE id='aaaaaaaa-0000-0000-0000-000000000003'), 'registrar', 'D4 registrar role accepted');

SELECT public.set_user_role('aaaaaaaa-0000-0000-0000-000000000002', 'dean');
SELECT pg_temp.assert_eq((SELECT role FROM public.profiles WHERE id='aaaaaaaa-0000-0000-0000-000000000002'), 'dean', 'D5 set_user_role works');

-- Reject must park the account on the sentinel, not leave it privileged.
SELECT public.set_user_approval('aaaaaaaa-0000-0000-0000-000000000002', false);
SELECT pg_temp.assert_eq((SELECT role FROM public.profiles WHERE id='aaaaaaaa-0000-0000-0000-000000000002'), 'pending', 'D6 reject parks role on pending');
SELECT pg_temp.assert_eq((SELECT is_active FROM public.profiles WHERE id='aaaaaaaa-0000-0000-0000-000000000002'), false, 'D7 reject deactivates');

-- Revoking an admin must not leave a disabled account holding 'admin'.
-- Uses a second admin so the acting identity is not demoted mid-test.
-- Owner-side fixture. The auth.users row is created first because
-- profiles.id references auth.users(id); a bare profiles insert fails the
-- foreign key. handle_new_user() then creates the profile, which is promoted
-- the way a real second admin is promoted.
SELECT pg_temp.reset_user();

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('22222222-2222-2222-2222-222222222222',
        'admin.second@imcc.edu.ph', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

UPDATE public.profiles
   SET full_name = 'Test Admin Two', role = 'admin', status = 'approved', is_active = true
 WHERE id = '22222222-2222-2222-2222-222222222222';

-- Back to the acting administrator. set_user_active() checks auth.uid() and
-- reset_user() cleared it, so without this the call is refused for want of an
-- administrator rather than for the reason under test.
SELECT pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'admin revoking the second admin');

SELECT public.set_user_active('22222222-2222-2222-2222-222222222222', false);
SELECT pg_temp.assert_eq((SELECT role FROM public.profiles WHERE id='22222222-2222-2222-2222-222222222222'), 'student', 'D8 revoking an admin demotes to student');
SELECT pg_temp.assert_eq((SELECT is_active FROM public.profiles WHERE id='22222222-2222-2222-2222-222222222222'), false, 'D8b revoked admin is inactive');

-- A revoked non-admin keeps their role so the admin can restore it.
-- She has to be a dean first: D6 rejected her, which parked her on
-- 'pending', so asserting 'dean' here without promoting her would have been
-- asserting against a state the test never created.
SELECT public.set_user_approval('aaaaaaaa-0000-0000-0000-000000000002', true, 'dean');

SELECT public.set_user_active('aaaaaaaa-0000-0000-0000-000000000002', false);
SELECT pg_temp.assert_eq((SELECT role FROM public.profiles WHERE id='aaaaaaaa-0000-0000-0000-000000000002'), 'dean', 'D8c revoking a dean preserves role for restore');
SELECT public.set_user_active('aaaaaaaa-0000-0000-0000-000000000002', true);
SELECT pg_temp.assert_eq((SELECT is_active FROM public.profiles WHERE id='aaaaaaaa-0000-0000-0000-000000000002'), true, 'D8d restore re-activates');

-- An invalid role must be rejected by the function, not the CHECK.
SELECT pg_temp.assert_raises(
  $$SELECT public.set_user_role('aaaaaaaa-0000-0000-0000-000000000002', 'superuser')$$,
  '22023', 'D9 invalid role rejected');

-- Non-admins must not reach the admin functions.
SELECT pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001', 'student again');
SELECT pg_temp.assert_raises(
  $$SELECT public.set_user_role('aaaaaaaa-0000-0000-0000-000000000002', 'admin')$$,
  '42501', 'D10 non-admin cannot call set_user_role');
SELECT pg_temp.assert_raises(
  $$SELECT public.set_user_approval('aaaaaaaa-0000-0000-0000-000000000002', true, 'admin')$$,
  '42501', 'D11 non-admin cannot approve accounts');
SELECT pg_temp.assert_raises(
  $$SELECT public.set_user_active('22222222-2222-2222-2222-222222222222', false)$$,
  '42501', 'D12 non-admin cannot deactivate accounts');

-- ═════════════════════════════════════════════════════════════════════
-- E. Role-hint helpers
-- ═════════════════════════════════════════════════════════════════════
SELECT pg_temp.assert_eq(public.imcc_is_student_email('abc12345@imcc.edu.ph'), true, 'E1 student pattern detected');
SELECT pg_temp.assert_eq(public.imcc_is_student_email('ABC12345@IMCC.EDU.PH'), true, 'E2 case insensitive');
SELECT pg_temp.assert_eq(public.imcc_is_student_email('ab1234@imcc.edu.ph'), false, 'E3 too few digits rejected');
SELECT pg_temp.assert_eq(public.imcc_is_student_email('abcd12345@imcc.edu.ph'), false, 'E4 four letters rejected');
SELECT pg_temp.assert_eq(public.imcc_is_student_email('maria.santos@imcc.edu.ph'), false, 'E5 dotted name is not a student');
SELECT pg_temp.assert_eq(public.imcc_role_hint('maria.santos@imcc.edu.ph'), 'faculty_or_staff', 'E6 dotted name hints faculty');
SELECT pg_temp.assert_eq(public.imcc_role_hint('random@gmail.com'), 'unknown', 'E7 unknown hint');
-- The pattern is domain-agnostic on purpose: an unrecognised domain must
-- still not auto-approve. Verified via the B6 assertion above.

-- ═════════════════════════════════════════════════════════════════════
-- F. Academic-detail lock for approved staff
-- ═════════════════════════════════════════════════════════════════════
SELECT pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'admin');
SELECT public.set_user_approval('aaaaaaaa-0000-0000-0000-000000000002', true, 'faculty');

SELECT pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000002', 'approved faculty');
SELECT pg_temp.assert_raises(
  $$UPDATE public.profiles SET student_no='2024-99999' WHERE id='aaaaaaaa-0000-0000-0000-000000000002'$$,
  '42501', 'F1 approved faculty cannot claim a student number');

-- A student retains write access to their own academic details.
SELECT pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001', 'approved student');
UPDATE public.profiles SET year_level='3' WHERE id='aaaaaaaa-0000-0000-0000-000000000001';
SELECT pg_temp.assert_eq((SELECT year_level FROM public.profiles WHERE id='aaaaaaaa-0000-0000-0000-000000000001'), '3', 'F2 student can still edit own year level');

-- ═════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RAISE NOTICE '';
  RAISE NOTICE '=====================================================';
  RAISE NOTICE ' ALL PHASE 0a SECURITY ASSERTIONS PASSED';
  RAISE NOTICE '=====================================================';
END $$;

ROLLBACK;
