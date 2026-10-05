-- =====================================================================
-- MyIMCC Portal -- security hardening Phase 0b integration test
--
-- Verifies the student self-service financial writes are closed:
--   clearances   a student could mark any department cleared
--   installments a student could mark their own tuition paid
--
-- Companion to test-security-hardening-phase0a.sql, which covers identity.
--
-- Run in the Supabase SQL editor AFTER security-hardening-phase0b.sql.
-- Everything is wrapped in a transaction that is rolled back, so this
-- leaves no rows behind and no policies altered.
--
-- No extension required. Asserts with its own pg_temp helpers rather than pgTAP, so it runs on any Postgres.
-- =====================================================================

BEGIN;


-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Minimal assertion helpers
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- assert_raises(sql, name, sqlstate) - expected_sqlstate of NULL means
-- "any exception".
CREATE OR REPLACE FUNCTION pg_temp.assert_raises(
  stmt   TEXT,
  name   TEXT,
  expected_sqlstate TEXT DEFAULT NULL
)
RETURNS TEXT AS $$
DECLARE
  v_state TEXT;
BEGIN
  BEGIN
    EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
  END;

  IF v_state IS NULL THEN
    RAISE EXCEPTION 'FAILED: % (statement succeeded, expected an error)', name;
  END IF;

  IF expected_sqlstate IS NOT NULL AND v_state <> expected_sqlstate THEN
    RAISE EXCEPTION 'FAILED: % (expected SQLSTATE %, got %: %)',
      name, expected_sqlstate, v_state, v_state;
  END IF;

  RETURN name;
END;
$$ LANGUAGE plpgsql;

-- RLS denial of an UPDATE or DELETE is silent.
--
-- Postgres does not raise for a row that a policy hides: the statement simply
-- matches nothing and reports "0 rows affected". So assert_raises is the wrong
-- tool here. Asserting an exception would have pushed towards loosening the
-- policy until something finally threw, when the behaviour under test was
-- already correct.
--
-- This asserts the observable effect instead: the write reached no rows. The
-- corresponding positive test (staff CAN clear the same row) is what proves the
-- statement matches the right row, so "0 rows" here means blocked, not
-- mis-targeted.
CREATE OR REPLACE FUNCTION pg_temp.assert_update_blocked(stmt TEXT, name TEXT)
RETURNS VOID AS $$
DECLARE
  v_rows INT;
BEGIN
  EXECUTE stmt;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN
    RAISE EXCEPTION 'FAILED: % (the write was blocked by policy, but it still changed % row(s))',
      name, v_rows;
  END IF;
  RAISE NOTICE 'ok %', name;
END;
$$ LANGUAGE plpgsql;

-- Run the rest of the script as this user id.
--
-- SET LOCAL ROLE is the part that actually matters. Setting the JWT claims
-- alone changes nothing, because this script connects as a superuser and
-- superusers bypass RLS outright: every statement would keep running as
-- postgres and every "X cannot do Y" assertion would pass for the wrong
-- reason -- or, as it did, fail because the denied write was in fact allowed.
-- The claims supply auth.uid(), which is what the policies compare against.
CREATE OR REPLACE FUNCTION pg_temp.as_user(uid UUID, label TEXT)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', uid::TEXT, TRUE);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', uid::TEXT, 'role', 'authenticated')::TEXT, TRUE);
  -- SESSION AUTHORIZATION rather than SET ROLE, so session_user stops being
  -- 'postgres'. profiles_protect_privileged() trusts the owner session, and
  -- SET ROLE does not change session_user, so a SET ROLE-only harness leaves
  -- the owner bootstrap active for every impersonated user.
  SET LOCAL SESSION AUTHORIZATION authenticated;
END;
$$ LANGUAGE plpgsql;

-- Back to owner rights, for inserting fixtures. Without this, once as_user()
-- has switched roles the remaining setup would run as the impersonated user
-- and fail on permissions.
CREATE OR REPLACE FUNCTION pg_temp.reset_user()
RETURNS VOID AS $$
BEGIN
  RESET SESSION AUTHORIZATION;
  PERFORM set_config('request.jwt.claim.sub', '', TRUE);
  PERFORM set_config('request.jwt.claims', '', TRUE);
END;
$$ LANGUAGE plpgsql;

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Fixture: one approved student, two departments
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- mint requires the pgcrypto functions the schema already uses.
CREATE OR REPLACE FUNCTION pg_temp.uid(n INT)
RETURNS UUID AS $$
  SELECT ('cccccccc-0000-0000-0000-00000000000' || n::TEXT)::UUID;
$$ LANGUAGE sql IMMUTABLE;

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES (pg_temp.uid(1), 'abc12345@imcc.edu.ph', '{}'::jsonb);

-- Approve the student directly, bypassing the onboarding trigger: this test
-- is about RLS on the financial tables, not about identity.
UPDATE public.profiles
   SET role = 'student', status = 'approved', is_active = true
 WHERE id = pg_temp.uid(1);

-- department_name and due_date are NOT NULL in the schema.
INSERT INTO public.clearances (student_id, department_code, department_name, status)
VALUES (pg_temp.uid(1), 'library',  'Library',  'pending'),
       (pg_temp.uid(1), 'cashier',  'Cashier',  'action_required');

INSERT INTO public.installments (student_id, name, amount, due_date, status)
VALUES (pg_temp.uid(1), 'First Installment', 5000.00, CURRENT_DATE, 'pending');

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- A. A student may read their own rows
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
SELECT pg_temp.as_user(pg_temp.uid(1), 'student');

SELECT pg_temp.assert_eq(
  (SELECT COUNT(*) FROM public.clearances
    WHERE student_id = pg_temp.uid(1) AND status = 'pending'),
  1::BIGINT,
  'A1 student can read own clearance rows'
);

SELECT pg_temp.assert_eq(
  (SELECT COUNT(*) FROM public.installments WHERE student_id = pg_temp.uid(1)),
  1::BIGINT,
  'A2 student can read own installments'
);

SELECT pg_temp.assert_eq(
  (SELECT COUNT(*) FROM public.transactions WHERE student_id = pg_temp.uid(1)),
  0::BIGINT,
  'A3 student can read own transactions (none yet)'
);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- B. A student must NOT be able to clear their own clearance
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- The original defect: "Clearance manage policy" was FOR ALL with
-- USING (student_id = auth.uid() OR <staff>), so the student's own branch
-- permitted the UPDATE.
SELECT pg_temp.assert_update_blocked(
  $$UPDATE public.clearances
       SET status = 'cleared', cleared_at = now()
     WHERE student_id = pg_temp.uid(1) AND department_code = 'library'$$,
  'B1 student cannot mark their own clearance cleared'
);

SELECT pg_temp.assert_eq(
  (SELECT status FROM public.clearances
    WHERE student_id = pg_temp.uid(1) AND department_code = 'library'),
  'pending'::TEXT,
  'B2 clearance row unchanged after refused update'
);

-- Bulk update across every department must fail too.
SELECT pg_temp.assert_update_blocked(
  $$UPDATE public.clearances
       SET status = 'cleared', cleared_at = now()
     WHERE student_id = pg_temp.uid(1)$$,
  'B3 student cannot bulk-clear every department'
);

-- A student must not be able to set the attesting officer either.
SELECT pg_temp.assert_update_blocked(
  $$UPDATE public.clearances
       SET officer_name = 'self'
     WHERE student_id = pg_temp.uid(1) AND department_code = 'library'$$,
  'B4 student cannot forge officer_name'
);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- C. A student must NOT be able to settle their own tuition
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- The original defect: "Students update own installments" was
-- FOR UPDATE USING (student_id = auth.uid()). Combined with the portal's
-- Pay Now button this let a student zero their balance, which in turn
-- removed the cashier's reason to withhold clearance.
SELECT pg_temp.assert_update_blocked(
  $$UPDATE public.installments
       SET status = 'paid', paid_at = now()
     WHERE student_id = pg_temp.uid(1)$$,
  'C1 student cannot mark their own installment paid'
);

SELECT pg_temp.assert_update_blocked(
  $$UPDATE public.installments
       SET amount = 0
     WHERE student_id = pg_temp.uid(1)$$,
  'C2 student cannot zero their own amount'
);

SELECT pg_temp.assert_update_blocked(
  $$UPDATE public.installments
       SET or_number = 'FAKE-001'
     WHERE student_id = pg_temp.uid(1)$$,
  'C3 student cannot forge a receipt number'
);

SELECT pg_temp.assert_eq(
  (SELECT status FROM public.installments WHERE student_id = pg_temp.uid(1)),
  'pending'::TEXT,
  'C4 installment still pending after refused updates'
);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- D. A student must NOT be able to fabricate transactions
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
SELECT pg_temp.assert_raises(
  $$INSERT INTO public.transactions
       (student_id, description, channel, amount)
     VALUES (pg_temp.uid(1), 'fabricated payment', 'online', 5000.00)$$,
  'D1 student cannot insert a transaction',
  '42501'
);

SELECT pg_temp.assert_eq(
  (SELECT COUNT(*) FROM public.transactions WHERE student_id = pg_temp.uid(1)),
  0::BIGINT,
  'D2 no transaction was created'
);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- E. Staff can still do the job
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
SELECT pg_temp.reset_user();

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES (pg_temp.uid(2), 'cashier.staff@imcc.edu.ph', '{}'::jsonb);

UPDATE public.profiles
   SET role = 'staff', status = 'approved', is_active = true
 WHERE id = pg_temp.uid(2);

SELECT pg_temp.as_user(pg_temp.uid(2), 'staff');

-- The whole point of the migration: staff must still be able to work.
UPDATE public.clearances
   SET status = 'cleared', cleared_at = now(), officer_name = 'Cashier'
 WHERE student_id = pg_temp.uid(1) AND department_code = 'library';

SELECT pg_temp.assert_eq(
  (SELECT status FROM public.clearances
    WHERE student_id = pg_temp.uid(1) AND department_code = 'library'),
  'cleared'::TEXT,
  'E1 staff CAN clear a student clearance'
);

UPDATE public.installments
   SET status = 'paid', paid_at = now(), or_number = 'OR-2024-0001'
 WHERE student_id = pg_temp.uid(1);

SELECT pg_temp.assert_eq(
  (SELECT status FROM public.installments WHERE student_id = pg_temp.uid(1)),
  'paid'::TEXT,
  'E2 staff CAN record a payment'
);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- F. An unapproved staff-shaped account has no access either
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- The Phase 0b policies check status='approved' AND is_active, so an
-- account with role='staff' but status='pending' is still refused. This
-- is the case that a role-only check would miss.
SELECT pg_temp.reset_user();

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES (pg_temp.uid(3), 'pending.staff@imcc.edu.ph', '{}'::jsonb);

UPDATE public.profiles
   SET role = 'staff', status = 'pending', is_active = false
 WHERE id = pg_temp.uid(3);

SELECT pg_temp.as_user(pg_temp.uid(3), 'unapproved staff');

SELECT pg_temp.assert_update_blocked(
  $$UPDATE public.clearances
       SET status = 'cleared', cleared_at = now()
     WHERE student_id = pg_temp.uid(1) AND department_code = 'cashier'$$,
  'F1 unapproved staff cannot clear'
);

SELECT pg_temp.assert_update_blocked(
  $$UPDATE public.installments
       SET status = 'paid', paid_at = now()
     WHERE student_id = pg_temp.uid(1)$$,
  'F2 unapproved staff cannot record payment'
);

    -- Read with the student's own rights, not as the pending account. RLS
    -- hides the clearance from uid 3 entirely, so asserting here as uid 3
    -- compared NULL against 'action_required' and said nothing about the hold
    -- surviving. The student legitimately sees their own row.
    SELECT pg_temp.as_user(pg_temp.uid(1), 'student reading own clearance');

    SELECT pg_temp.assert_eq(
      (SELECT status FROM public.clearances
        WHERE student_id = pg_temp.uid(1) AND department_code = 'cashier'),
      'action_required'::TEXT,
      'F3 cashier hold still in place'
    );

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- G. A suspended approved account loses access
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Suspending the account is owner work: is_active is deliberately not a
-- granted column, so no authenticated role can write it.
SELECT pg_temp.reset_user();

UPDATE public.profiles SET is_active = false WHERE id = pg_temp.uid(2);

SELECT pg_temp.as_user(pg_temp.uid(2), 'suspended staff');

SELECT pg_temp.assert_update_blocked(
  $$UPDATE public.clearances
        SET status = 'cleared', cleared_at = now()
      WHERE student_id = pg_temp.uid(1) AND department_code = 'cashier'$$,
  'G1 suspended staff cannot clear'
);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- H. A recipient may only mark a message read, never rewrite it
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- "Users update own messages" was FOR UPDATE USING (recipient_id =
-- auth.uid()) with no column restriction, so the recipient could rewrite
-- sender_id, recipient_id, subject and body.
SELECT pg_temp.reset_user();

INSERT INTO public.messages (sender_id, recipient_id, subject, body)
VALUES (pg_temp.uid(2), pg_temp.uid(1), 'Final exam schedule',
        'The final exam begins 2026-05-20 at 8:00 AM.');

SELECT pg_temp.as_user(pg_temp.uid(1), 'student recipient');

-- Marking as read is the one legitimate write.
UPDATE public.messages
   SET is_read = true, read_at = now()
 WHERE recipient_id = pg_temp.uid(1);

SELECT pg_temp.assert_eq(
  (SELECT is_read FROM public.messages
    WHERE sender_id = pg_temp.uid(2) AND recipient_id = pg_temp.uid(1)),
  true,
  'H1 recipient CAN mark a message read'
);

-- Rewriting an official registrar notice must fail.
--
-- These three are blocked by the column-level grant in
-- security-hardening-phase0a.sql, which lets authenticated update is_read and
-- read_at on messages and nothing else. So they raise "permission denied"
-- rather than quietly matching zero rows, and they are asserted as raising.
-- The defence is the grant; the row-scoping policy is not what stops them.
SELECT pg_temp.assert_raises(
    $$UPDATE public.messages
         SET body = 'Exam cancelled, no need to study.'
       WHERE recipient_id = pg_temp.uid(1)$$,
    'H2 recipient cannot rewrite message body',
    '42501'
  );

SELECT pg_temp.assert_raises(
    $$UPDATE public.messages
         SET subject = 'Anything you like'
       WHERE recipient_id = pg_temp.uid(1)$$,
    'H3 recipient cannot rewrite message subject',
    '42501'
  );

-- Re-pointing a message at somebody else is also a rewrite.
SELECT pg_temp.assert_raises(
    $$UPDATE public.messages
         SET sender_id = pg_temp.uid(1)
       WHERE recipient_id = pg_temp.uid(1)$$,
    'H4 recipient cannot forge the sender',
    '42501'
  );

SELECT pg_temp.assert_eq(
  (SELECT body FROM public.messages
    WHERE sender_id = pg_temp.uid(2) AND recipient_id = pg_temp.uid(1)),
  'The final exam begins 2026-05-20 at 8:00 AM.'::TEXT,
  'H5 official message text unchanged'
);

-- A student must not be able to insert a message appearing to come from
-- the Registrar.
SELECT pg_temp.assert_raises(
  $$INSERT INTO public.messages (sender_id, recipient_id, subject, body)
    VALUES (pg_temp.uid(2), pg_temp.uid(1), 'Forged', 'Approved by the Registrar.')$$,
  'H6 student cannot send as staff',
  '42501'
);

    -- I. Structural: no staff-gated financial policy may rely on role alone
--
-- F1 above cannot catch a role-only UPDATE policy on its own, and the reason
-- is worth recording. Postgres applies SELECT policies when it locates the
-- rows an UPDATE will touch, so with "Staff read all clearances" dropped a
-- pending staff account sees zero rows and the UPDATE matches zero rows. The
-- weak policy is masked by a stricter policy on the same table rather than
-- defeated by it, and F1 passes. Re-adding the role-only policy was verified
-- not to fail this suite.
--
-- RLS policies are permissive and OR together, so one role-only policy is
-- enough to reopen the table, and masking depends on policy combination rather
-- than on any single policy being correct. So assert the definitions directly:
-- anything staff-gated must also require an approved, active account, whether
-- it says so inline or through is_staff_class()/is_admin().
DO $$
DECLARE
  v_bad TEXT;
BEGIN
  SELECT string_agg(format('%I (cmd=%I)', policyname, cmd), ', ')
    INTO v_bad
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('clearances', 'installments', 'transactions')
     AND policyname LIKE 'Staff%'
     AND coalesce(qual, '') NOT LIKE '%status%'
     AND coalesce(qual, '') NOT LIKE '%is_staff_class%'
     AND coalesce(qual, '') NOT LIKE '%is_admin%'
     AND coalesce(with_check, '') NOT LIKE '%status%'
     AND coalesce(with_check, '') NOT LIKE '%is_staff_class%'
     AND coalesce(with_check, '') NOT LIKE '%is_admin%';

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION
      'FAILED: staff-gated financial policy without an approval check: %', v_bad;
  END IF;

  RAISE NOTICE 'ok I1 every staff-gated financial policy also requires approval';
END;
$$;

    SELECT pg_temp.as_user(pg_temp.uid(2), 'staff');
    -- to_regprocedure, not "public.messages_protect_content IS NOT NULL":
    -- the latter reads as a column reference and does not parse. Matching on
    -- proname alone would also accept a same-named function in another
    -- schema, so the signature is pinned to public and no arguments.
    SELECT pg_temp.assert_true(
      to_regprocedure('public.messages_protect_content()') IS NOT NULL,
      'H7 guard function installed'
);

-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
-- All assertions passed. Roll back so the fixtures leave no trace.
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
ROLLBACK;
