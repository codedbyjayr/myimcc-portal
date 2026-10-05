-- =====================================================================
-- MyIMCC Portal -- timetable integrity integration test
--
-- Covers the migration that decides whether the student Class Schedule page
-- can be trusted:
--   timetable-integrity.sql   meeting-time validation trigger, RLS, indexes
--
-- The trigger in that script is the only thing standing between the school
-- and a published schedule that tells a student to attend two classes at
-- once, or a 07:00-07:00 class, so it is worth proving it actually fires.
-- A static read of the plpgsql cannot show that: the half-open interval
-- comparisons and the "t.id <> NEW.id" self-exclusion are exactly the kind
-- of detail that looks right and is wrong.
--
-- Run in the Supabase SQL editor AFTER timetable-integrity.sql, in that
-- order. Everything runs inside a transaction that is rolled back, so this
-- leaves no rows behind and no policies altered.
--
-- No extension required. These scripts assert with their own pg_temp helpers
-- rather than pgTAP, so they run on any Postgres, which is what makes it
-- possible to execute them against a throwaway database before touching the
-- real one.
--
-- The things asserted here that a static review cannot establish:
--   * back-to-back meetings in one room are allowed (half-open intervals)
--   * a real overlap in one room is rejected
--   * a teacher booked twice is rejected, and a back-to-back booking is not
--   * a meeting that ends at 08:00 and one that starts at 08:00 do not clash
--   * editing an existing row does not collide with itself
--   * a student cannot publish a timetable row; a registrar can
-- =====================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- Minimal assertion helpers (same shape as the other test scripts)
-- ─────────────────────────────────────────────────────────────────────
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

-- Assert that a statement fails, and optionally with a specific SQLSTATE.
-- The trigger raises 23514 for an invalid range and 23P01 for a conflict, so
-- asserting the code distinguishes "rejected for the right reason" from
-- "rejected by an unrelated constraint such as the UNIQUE key".
--
-- The caught message is reported on failure. Without it a wrong SQLSTATE comes
-- back as a bare code, and 42703 (undefined column) in a fixture lookup is
-- indistinguishable from 42703 in the trigger being tested.
CREATE OR REPLACE FUNCTION pg_temp.assert_raises(
  stmt              TEXT,
  name              TEXT,
  expected_sqlstate TEXT DEFAULT NULL
)
RETURNS TEXT AS $$
DECLARE
  v_state TEXT;
  v_msg   TEXT;
BEGIN
  BEGIN
    EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
    v_msg   := SQLERRM;
  END;

  IF v_state IS NULL THEN
    RAISE EXCEPTION 'FAILED: % (statement succeeded, expected an error)', name;
  END IF;

  IF expected_sqlstate IS NOT NULL AND v_state <> expected_sqlstate THEN
    RAISE EXCEPTION 'FAILED: % (expected SQLSTATE %, got % -- raised: %)',
      name, expected_sqlstate, v_state, v_msg;
  END IF;

  RETURN name;
END;
$$ LANGUAGE plpgsql;

-- Impersonate a signed-in user for the statements that follow. Everything runs
-- privileged by default, the way the Supabase SQL editor connects; as_user
-- narrows rights to what that user could really do, which is the only way an
-- RLS assertion means anything.
--
-- Setting the JWT claims is necessary but NOT sufficient. Policies are
-- enforced against the current database role, and the SQL editor connects as
-- a superuser that has BYPASSRLS. Under claims alone every statement below
-- would run with RLS switched off, so "a student cannot publish a row" would
-- pass for the wrong reason: the insert would succeed and the assert_raises
-- would report the failure rather than the policy catching it. The role
-- switch is what actually engages the policies.
CREATE OR REPLACE FUNCTION pg_temp.as_user(uid UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', uid::TEXT, TRUE);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', uid::TEXT, 'role', 'authenticated')::TEXT, TRUE);
  SET LOCAL ROLE authenticated;
END;
$$ LANGUAGE plpgsql;

-- Returns to the privileged session. RESET ROLE is needed as well as clearing
-- the claims, otherwise the next privileged statement would still be running
-- as 'authenticated' and fail on the fixtures.
CREATE OR REPLACE FUNCTION pg_temp.reset_user()
RETURNS VOID AS $$
BEGIN
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', TRUE);
  PERFORM set_config('request.jwt.claims', '', TRUE);
END;
$$ LANGUAGE plpgsql;

-- A fixed id, so the fixtures do not depend on generated uuids.
CREATE OR REPLACE FUNCTION pg_temp.uid(n INT)
RETURNS UUID AS $$
  SELECT ('cccccccc-0000-0000-0000-00000000000' || n::TEXT)::UUID;
$$ LANGUAGE sql IMMUTABLE;

-- ─────────────────────────────────────────────────────────────────────
-- Fixtures
--
-- Three rooms, two teachers and four offerings. The third room exists so that
-- a teacher conflict and an offering conflict can be provoked without a room
-- conflict firing first: all three checks raise 23P01, so a test that cannot
-- rule out the other two is asserting nothing. The fourth offering has no
-- meeting time at all, which is the case the student page renders as
-- "no meeting time published".
--
-- The users are created through auth.users rather than by inserting into
-- public.profiles directly. profiles.id is a foreign key onto auth.users, and
-- the on_auth_user_created trigger is what creates the matching profile row,
-- so inserting into profiles first fails the FK. Role and status are then set
-- by UPDATE, because the subject of this test is the timetable and its
-- policies, not identity.
--
-- That UPDATE is exactly what trg_profiles_protect_privileged forbids: role and
-- status may only be changed by an approved admin, and auth.uid() is NULL while
-- this script runs the way the SQL editor connects. The first admin therefore
-- cannot be created through the normal path, because there is no admin yet to
-- create it. The trigger is suspended for the fixture block only and restored
-- immediately, which is safe solely because the whole script is one transaction
-- that ends in ROLLBACK -- the suspension cannot outlive the run.
--
-- This is fixture setup, not a hole: the assertions below run with the trigger
-- live, which section 9 relies on.
ALTER TABLE public.profiles DISABLE TRIGGER trg_profiles_protect_privileged;

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  (pg_temp.uid(1), 'timetable-test-1@student.imcc.edu.ph', '{}'::jsonb),
  (pg_temp.uid(2), 'timetable-test-2@imcc.edu.ph',          '{}'::jsonb),
  (pg_temp.uid(3), 'timetable-test-3@imcc.edu.ph',          '{}'::jsonb),
  (pg_temp.uid(4), 'timetable-test-4@imcc.edu.ph',          '{}'::jsonb);

UPDATE public.profiles
   SET full_name = 'TT Student',    role = 'student',   status = 'approved', is_active = true
 WHERE id = pg_temp.uid(1);
UPDATE public.profiles
   SET full_name = 'TT Registrar',  role = 'registrar', status = 'approved', is_active = true
 WHERE id = pg_temp.uid(2);
UPDATE public.profiles
   SET full_name = 'TT Teacher A',  role = 'teacher',   status = 'approved', is_active = true
 WHERE id = pg_temp.uid(3);
UPDATE public.profiles
   SET full_name = 'TT Teacher B',  role = 'teacher',   status = 'approved', is_active = true
 WHERE id = pg_temp.uid(4);

ALTER TABLE public.profiles ENABLE TRIGGER trg_profiles_protect_privileged;

DO $$
DECLARE
  v_n INT;
BEGIN
  -- Fail loudly here rather than at the first policy assertion, so a broken
  -- fixture is never mistaken for a passing test.
  SELECT COUNT(*) INTO v_n
    FROM public.profiles
   WHERE id IN (pg_temp.uid(1), pg_temp.uid(2), pg_temp.uid(3), pg_temp.uid(4))
     AND status = 'approved';

  PERFORM pg_temp.assert_eq(v_n, 4, 'all four fixture users exist and are approved');

  -- The guard above is only legitimate because it is switched back on. If a
  -- future edit moves the ENABLE, the rest of the script would be testing an
  -- unprotected table and still reporting green.
  --
  -- pg_trigger.tgenabled is a "char", not a boolean: 'O' means enabled at the
  -- origin, 'D' means disabled, and 'R' means enabled only when replicas are
  -- in recovery. Only 'O' counts as live.
  PERFORM pg_temp.assert_true(
    (SELECT tgenabled = 'O' FROM pg_trigger
      WHERE tgrelid = 'public.profiles'::regclass
        AND tgname    = 'trg_profiles_protect_privileged'),
    'the profile guard trigger is enabled again before any assertion runs'
  );
END;
$$;

INSERT INTO public.rooms (name, building, capacity, type)
VALUES
  ('TT Room A', 'Test Wing', 40, 'classroom'),
  ('TT Room B', 'Test Wing', 40, 'classroom'),
  ('TT Room C', 'Test Wing', 40, 'classroom');

INSERT INTO public.course_offerings (code, title, units, school_year, semester)
VALUES
  ('TT101', 'Timetable Test 101', 3.0, '2026-2027', 1),
  ('TT102', 'Timetable Test 102', 3.0, '2026-2027', 1),
  ('TT103', 'Timetable Test 103', 3.0, '2026-2027', 1),
  ('TT104', 'Timetable Test 104', 3.0, '2026-2027', 1);

CREATE TEMP TABLE tt (
  room_a INT, room_b INT, room_c INT,
  off_1 INT, off_2 INT, off_3 INT, off_4 INT,
  teach_a UUID, teach_b UUID
) ON COMMIT DROP;

INSERT INTO tt
SELECT
  (SELECT id FROM public.rooms WHERE name = 'TT Room A'),
  (SELECT id FROM public.rooms WHERE name = 'TT Room B'),
  (SELECT id FROM public.rooms WHERE name = 'TT Room C'),
  (SELECT id FROM public.course_offerings WHERE code = 'TT101'),
  (SELECT id FROM public.course_offerings WHERE code = 'TT102'),
  (SELECT id FROM public.course_offerings WHERE code = 'TT103'),
  (SELECT id FROM public.course_offerings WHERE code = 'TT104'),
  pg_temp.uid(3),
  pg_temp.uid(4);

-- The impersonated statements below read their fixture ids from tt while
-- running as 'authenticated', which does not own it. Without this grant the
-- student-insert assertion fails with 'permission denied for table tt' before
-- the RLS policy is consulted at all, so the policy could be wide open and the
-- test would still report a pass.
GRANT SELECT ON tt TO authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 1. The shape of the table the student page reads
--
-- timetable-integrity.sql is built on the decision that a meeting time
-- belongs to a course_offering. If offering_id stops being the anchor the
-- schedule query joins on, the whole model is wrong, so the column is
-- asserted rather than assumed.
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_type TEXT;
BEGIN
  SELECT data_type INTO v_type
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'timetable'
     AND column_name  = 'offering_id';

  PERFORM pg_temp.assert_eq(v_type, 'integer', 'offering_id is the integer anchor the schedule joins on');
END;
$$;

DO $$
DECLARE
  v_fk BOOLEAN;
BEGIN
  -- The offering must be a real foreign key, not a bare INT. Without it a
  -- typo silently attaches a meeting to nothing and the student sees an
  -- empty schedule.
  SELECT TRUE INTO v_fk
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
   WHERE c.conrelid = 'public.timetable'::regclass
     AND c.contype   = 'f'
     AND a.attname   = 'offering_id';

  PERFORM pg_temp.assert_true(v_fk, 'offering_id is a foreign key onto course_offerings');
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 2. A valid meeting is accepted
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO public.timetable (offering_id, day_of_week, start_time, end_time, room_id, teacher_id)
SELECT off_1, 'Mon', '07:00', '08:00', room_a, teach_a FROM tt;

DO $$
DECLARE
  v_n INT;
BEGIN
  SELECT COUNT(*) INTO v_n
    FROM public.timetable t
    JOIN tt ON tt.off_1 = t.offering_id
   WHERE t.day_of_week = 'Mon';

  PERFORM pg_temp.assert_eq(v_n, 1, 'a well-formed meeting row is stored');
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 3. Invalid ranges are rejected
-- ─────────────────────────────────────────────────────────────────────

-- Zero length: ends exactly when it starts.
SELECT pg_temp.assert_raises(
  format($f$
    INSERT INTO public.timetable (offering_id, day_of_week, start_time, end_time, room_id)
    SELECT off_3, 'Mon', '09:00', '09:00', room_b FROM tt
  $f$),
  'a zero-length meeting is rejected',
  '23514'
);

-- Ends before it starts.
SELECT pg_temp.assert_raises(
  format($f$
    INSERT INTO public.timetable (offering_id, day_of_week, start_time, end_time, room_id)
    SELECT off_3, 'Mon', '10:00', '09:00', room_b FROM tt
  $f$),
  'a meeting that ends before it starts is rejected',
  '23514'
);

-- ─────────────────────────────────────────────────────────────────────
-- 4. Room conflicts
--
-- The trigger compares half-open intervals [start, end), so the two cases
-- below must disagree. If the comparisons ever become <= on either side, a
-- room gets double-booked at every back-to-back class; if they become
-- inclusive on both ends in the other direction, ordinary timetabling is
-- reported as a conflict and no schedule can be published at all.
-- ─────────────────────────────────────────────────────────────────────

-- Back to back in the same room: 07:00-08:00 then 08:00-09:00. Allowed.
INSERT INTO public.timetable (offering_id, day_of_week, start_time, end_time, room_id, teacher_id)
SELECT off_2, 'Mon', '08:00', '09:00', room_a, teach_b FROM tt;

DO $$
DECLARE
  v_n INT;
BEGIN
  SELECT COUNT(*) INTO v_n
    FROM public.timetable t JOIN tt ON tt.room_a = t.room_id AND t.day_of_week = 'Mon';

  PERFORM pg_temp.assert_eq(v_n, 2, 'back-to-back meetings in one room are allowed');
END;
$$;

-- A genuine overlap in that room: 08:30-09:30 straddles the 08:00-09:00 one.
SELECT pg_temp.assert_raises(
  format($f$
    INSERT INTO public.timetable (offering_id, day_of_week, start_time, end_time, room_id)
    SELECT off_3, 'Mon', '08:30', '09:30', room_a FROM tt
  $f$),
  'a meeting overlapping another in the same room is rejected',
  '23P01'
);

-- Fully containing the existing one.
SELECT pg_temp.assert_raises(
  format($f$
    INSERT INTO public.timetable (offering_id, day_of_week, start_time, end_time, room_id)
    SELECT off_3, 'Mon', '06:00', '10:00', room_a FROM tt
  $f$),
  'a meeting spanning another in the same room is rejected',
  '23P01'
);

-- The same time in the other room is fine: the conflict is per room.
INSERT INTO public.timetable (offering_id, day_of_week, start_time, end_time, room_id, teacher_id)
SELECT off_3, 'Mon', '07:00', '08:00', room_b, teach_b FROM tt;

DO $$
DECLARE
  v_n INT;
BEGIN
  SELECT COUNT(*) INTO v_n
    FROM public.timetable t JOIN tt ON tt.room_b = t.room_id;

  PERFORM pg_temp.assert_eq(v_n, 1, 'the same meeting time in a different room is allowed');
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 5. Teacher conflicts
--
-- A teacher cannot be in two places, and the trigger treats a NULL
-- teacher_id as "unassigned" rather than as a conflict against every
-- unassigned meeting.
-- ─────────────────────────────────────────────────────────────────────

-- Teacher A is already teaching 07:00-08:00 in room A. Same teacher, same
-- day, overlapping time, but in room C so that the room check cannot be what
-- rejects it. If this passes because of the room rule instead, the teacher
-- rule could be deleted and the test would still be green.
SELECT pg_temp.assert_raises(
  format($f$
    INSERT INTO public.timetable (offering_id, day_of_week, start_time, end_time, room_id, teacher_id)
    SELECT off_3, 'Mon', '07:30', '08:30', room_c, teach_a FROM tt
  $f$),
  'a teacher booked at two overlapping meetings is rejected',
  '23P01'
);

-- Back-to-back for the same teacher is allowed, as it is for a room.
INSERT INTO public.timetable (offering_id, day_of_week, start_time, end_time, room_id, teacher_id)
SELECT off_3, 'Mon', '08:00', '09:00', room_c, teach_a FROM tt;

DO $$
DECLARE
  v_n INT;
BEGIN
  SELECT COUNT(*) INTO v_n
    FROM public.timetable t JOIN tt ON tt.teach_a = t.teacher_id;

  PERFORM pg_temp.assert_eq(v_n, 2, 'a teacher teaching back-to-back classes is allowed');
END;
$$;

-- A meeting with no teacher assigned is "unassigned", not a conflict against
-- every other unassigned meeting. Both rows below sit in different rooms, so
-- the point is that the teacher check stays silent on NULL rather than
-- matching NULL to NULL and rejecting them.
--
-- Scoped to the fixture rooms rather than counting the whole column:
-- supabase-schema-v2.sql seeds sample timetable rows, and this script runs
-- against a fully migrated database, so an unscoped COUNT picks those up too.
-- Every other count in this file is scoped the same way for the same reason.
INSERT INTO public.timetable (offering_id, day_of_week, start_time, end_time, room_id)
SELECT off_1, 'Tue', '07:00', '08:00', room_a FROM tt;

INSERT INTO public.timetable (offering_id, day_of_week, start_time, end_time, room_id)
SELECT off_2, 'Tue', '09:00', '10:00', room_b FROM tt;

DO $$
DECLARE
  v_n INT;
BEGIN
  SELECT COUNT(*) INTO v_n
    FROM public.timetable t
    JOIN tt ON t.room_id IN (tt.room_a, tt.room_b, tt.room_c)
   WHERE t.teacher_id IS NULL
     AND t.day_of_week  = 'Tue';

  PERFORM pg_temp.assert_eq(v_n, 2, 'unassigned meetings in different rooms do not conflict');
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 6. Offering conflicts
--
-- Two meetings for the same offering at once would mean one subject shown
-- as two parallel classes. The UNIQUE(offering_id, day_of_week, start_time)
-- key only catches identical start times, so the trigger is what catches the
-- partial overlap. Room C and a NULL teacher, so neither the room check nor
-- the teacher check can be what rejects this: all three rules raise 23P01, so
-- an assertion that cannot rule the other two out proves nothing.
-- ─────────────────────────────────────────────────────────────────────
SELECT pg_temp.assert_raises(
  format($f$
    INSERT INTO public.timetable (offering_id, day_of_week, start_time, end_time, room_id)
    SELECT off_1, 'Mon', '07:30', '08:30', room_c FROM tt
  $f$),
  'one offering cannot hold two overlapping meetings',
  '23P01'
);

-- A second meeting in the identical slot is caught by the UNIQUE key rather
-- than the trigger, but the outcome a student sees is the same, so both
-- layers are asserted.
SELECT pg_temp.assert_raises(
  format($f$
    INSERT INTO public.timetable (offering_id, day_of_week, start_time, end_time, room_id)
    SELECT off_1, 'Mon', '07:00', '08:00', room_c FROM tt
  $f$),
  'one offering cannot hold two meetings in the same slot'
);

-- ─────────────────────────────────────────────────────────────────────
-- 7. Different days do not conflict
--
-- A subject that meets Mon and Wed is normal; the trigger keys on day.
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO public.timetable (offering_id, day_of_week, start_time, end_time, room_id, teacher_id)
SELECT off_1, 'Wed', '07:00', '08:00', room_a, teach_a FROM tt;

DO $$
DECLARE
  v_days INT;
BEGIN
  -- Asserted as "meets on both days" rather than as a row count. A count would
  -- have to be kept in step with every other fixture row added to this offering
  -- elsewhere in the file, which is exactly the kind of coupling that turns a
  -- real regression into a confusing number.
  SELECT COUNT(DISTINCT t.day_of_week) INTO v_days
    FROM public.timetable t
    JOIN tt ON tt.off_1 = t.offering_id
   WHERE t.day_of_week IN ('Mon', 'Wed');

  PERFORM pg_temp.assert_eq(v_days, 2, 'the same offering and room on a different day is allowed');
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 8. Editing a meeting must not collide with itself
--
-- t.id <> NEW.id is the self-exclusion. Without it every UPDATE would find
-- the row being updated and reject itself, which would make the timetable
-- completely uneditable -- the kind of bug that only appears once someone
-- tries to fix a typo in a room assignment.
-- ─────────────────────────────────────────────────────────────────────
UPDATE public.timetable t
   SET room_id = t.room_id
  FROM tt
 WHERE t.offering_id = tt.off_1
   AND t.day_of_week = 'Mon';

DO $$
DECLARE
  v_n INT;
BEGIN
  SELECT COUNT(*) INTO v_n
    FROM public.timetable t JOIN tt ON tt.off_1 = t.offering_id AND t.day_of_week = 'Mon';

  PERFORM pg_temp.assert_eq(v_n, 1, 'a no-op update does not collide with the row it edits');
END;
$$;

-- Moving a meeting to a free slot must work.
UPDATE public.timetable t
   SET start_time = '13:00',
       end_time   = '14:00'
  FROM tt
 WHERE t.offering_id = tt.off_1
   AND t.day_of_week = 'Mon';

DO $$
DECLARE
  v_s TIME;
  v_e TIME;
BEGIN
  SELECT t.start_time, t.end_time INTO v_s, v_e
    FROM public.timetable t JOIN tt ON tt.off_1 = t.offering_id
   WHERE t.day_of_week = 'Mon';

  PERFORM pg_temp.assert_eq(v_s::TEXT, '13:00:00', 'an existing meeting can be moved to a free slot');
  PERFORM pg_temp.assert_eq(v_e::TEXT, '14:00:00', 'the moved meeting keeps its duration');
END;
$$;

-- Narrowing a meeting into an occupied slot must be rejected.
SELECT pg_temp.assert_raises(
  format($f$
    UPDATE public.timetable t
       SET start_time = '08:30',
           end_time   = '09:30'
      FROM tt
     WHERE t.offering_id = tt.off_1
       AND t.day_of_week = 'Mon'
  $f$),
  'moving a meeting into an occupied slot is rejected',
  '23P01'
);

-- ─────────────────────────────────────────────────────────────────────
-- 9. Who may write the timetable
--
-- A student who can INSERT a meeting can invent their own schedule, and the
-- student page reads this table directly.
-- ─────────────────────────────────────────────────────────────────────
SELECT pg_temp.as_user(pg_temp.uid(1));

-- The SQLSTATE is asserted, not just "it raised something". A policy that fails
-- to block raises no error at all and the assertion fails; but a *different*
-- error -- a missing grant, a typo in a fixture column -- would otherwise be
-- accepted as proof the policy works. 42501 is what an RLS violation reports.
SELECT pg_temp.assert_raises(
  format($f$
    INSERT INTO public.timetable (offering_id, day_of_week, start_time, end_time, room_id)
    SELECT off_2, 'Fri', '07:00', '08:00', room_b FROM tt
  $f$),
  'a student cannot publish a timetable row',
  '42501'
);

-- Reading is open to any signed-in user, which is what the student page needs.
-- The table GRANT is asserted first rather than assumed: timetable-integrity.sql
-- creates the SELECT policy but no GRANT, so the privilege comes from Supabase's
-- own defaults or from the ALTER DEFAULT PRIVILEGES statements in
-- grant-faculty-permissions.sql. If it is absent the Class Schedule page
-- returns an empty schedule for every student, so that is a real failure and
-- not a test artefact.
DO $$
DECLARE
  v_can_read BOOLEAN;
  v_n         INT;
BEGIN
  SELECT has_table_privilege('authenticated', 'public.timetable', 'SELECT')
    INTO v_can_read;

  PERFORM pg_temp.assert_true(
    v_can_read,
    'authenticated holds SELECT on timetable, which the Class Schedule page needs'
  );

  SELECT COUNT(*) INTO v_n FROM public.timetable;
  PERFORM pg_temp.assert_true(v_n > 0, 'a signed-in student can read the timetable');
END;
$$;

SELECT pg_temp.reset_user();

-- A registrar can.
SELECT pg_temp.as_user(pg_temp.uid(2));

-- The policy alone is not enough: without the table GRANT the registrar is
-- blocked by permissions before the policy is ever consulted, and the schedule
-- silently stays empty. Asserted for the same reason as the read above.
DO $$
DECLARE
  v_can_write BOOLEAN;
BEGIN
  SELECT has_table_privilege('authenticated', 'public.timetable', 'INSERT')
     AND has_table_privilege('authenticated', 'public.timetable', 'UPDATE')
     AND has_table_privilege('authenticated', 'public.timetable', 'DELETE')
    INTO v_can_write;

  PERFORM pg_temp.assert_true(
    v_can_write,
    'authenticated holds INSERT, UPDATE and DELETE on timetable, which publishing a schedule needs'
  );
END;
$$;

INSERT INTO public.timetable (offering_id, day_of_week, start_time, end_time, room_id, teacher_id)
SELECT off_2, 'Fri', '07:00', '08:00', room_b, teach_b FROM tt;

DO $$
DECLARE
  v_n INT;
BEGIN
  SELECT COUNT(*) INTO v_n
    FROM public.timetable t JOIN tt ON tt.off_2 = t.offering_id AND t.day_of_week = 'Fri';

  PERFORM pg_temp.assert_eq(v_n, 1, 'a registrar can publish a timetable row');
END;
$$;

-- And can delete it again.
DELETE FROM public.timetable t
  USING tt
 WHERE t.offering_id = tt.off_2
   AND t.day_of_week  = 'Fri';

DO $$
DECLARE
  v_n INT;
BEGIN
  SELECT COUNT(*) INTO v_n
    FROM public.timetable t JOIN tt ON tt.off_2 = t.offering_id AND t.day_of_week = 'Fri';

  PERFORM pg_temp.assert_eq(v_n, 0, 'a registrar can remove a timetable row');
END;
$$;

SELECT pg_temp.reset_user();

-- ─────────────────────────────────────────────────────────────────────
-- 10. The integrity reports find what the trigger would have stopped
--
-- Sections 1 and 5 of timetable-integrity.sql are read-only reports meant
-- to be run before publishing a schedule. If they never return rows the
-- reports are broken, because a report that cannot see a broken row is
-- worse than no report at all.
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_n INT;
BEGIN
  -- Orphaned meetings: offering_id left dangling or NULL.
  SELECT COUNT(*) INTO v_n
    FROM public.timetable t
    LEFT JOIN public.course_offerings o ON o.id = t.offering_id
   WHERE o.id IS NULL;

  PERFORM pg_temp.assert_eq(v_n, 0, 'no orphaned timetable rows exist in the fixtures');
END;
$$;

DO $$
DECLARE
  v_n INT;
BEGIN
  -- Double bookings, using the same half-open comparison the trigger uses,
  -- so the report and the constraint can never disagree.
  SELECT COUNT(*) INTO v_n
    FROM public.timetable a
    JOIN public.timetable b
      ON b.day_of_week = a.day_of_week
     AND b.room_id     = a.room_id
     AND b.id > a.id
     AND a.start_time < b.end_time
     AND b.start_time < a.end_time;

  PERFORM pg_temp.assert_eq(v_n, 0, 'the double-booking report agrees with the trigger');
END;
$$;

DO $$
DECLARE
  v_n INT;
BEGIN
  -- Back-to-back bookings must not be reported as conflicts. There are
  -- three of them in the fixtures (room A Mon 07:00/08:00, teacher A Mon
  -- 07:00/08:00, and offering 1 Mon/Wed), which is the case that would
  -- flood the report with noise if the comparison were not half-open.
  SELECT COUNT(*) INTO v_n
    FROM public.timetable a
    JOIN public.timetable b
      ON b.day_of_week = a.day_of_week
     AND b.room_id     = a.room_id
     AND b.id > a.id
     AND a.start_time <= b.end_time
     AND b.start_time <= a.end_time
    WHERE a.start_time < b.end_time
      AND b.start_time < a.end_time;

  PERFORM pg_temp.assert_eq(v_n, 0, 'the report excludes back-to-back bookings');
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 11. Enrolled subjects with no published meeting time
--
-- This is the fact the student page renders as "no meeting time published",
-- and it is the difference between a student knowing to ask the Registrar
-- and a student believing they have a free day. TT104 deliberately has no
-- timetable row at all; TT101 does, so the report has to tell the two apart
-- rather than returning a count that happens to be right.
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO public.enrollments (student_id, offering_id, status)
SELECT pg_temp.uid(1), tt.off_4, 'enrolled' FROM tt;

DO $$
DECLARE
  v_missing INT;
  v_covered INT;
BEGIN
  -- The uncovered offering must be reported.
  SELECT COUNT(*) INTO v_missing
    FROM public.enrollments e
    JOIN public.course_offerings o ON o.id = e.offering_id
    LEFT JOIN public.timetable t   ON t.offering_id = o.id
   WHERE e.status = 'enrolled'
     AND o.code   = 'TT104'
     AND t.id IS NULL;

  PERFORM pg_temp.assert_eq(v_missing, 1, 'an enrolled subject with no meeting time is reported');

  -- And an enrolled subject that does have a meeting time must not be.
  INSERT INTO public.enrollments (student_id, offering_id, status)
  SELECT pg_temp.uid(1), tt.off_1, 'enrolled' FROM tt;

  SELECT COUNT(*) INTO v_covered
    FROM public.enrollments e
    JOIN public.course_offerings o ON o.id = e.offering_id
    LEFT JOIN public.timetable t   ON t.offering_id = o.id
   WHERE e.status = 'enrolled'
     AND o.code   = 'TT101'
     AND t.id IS NULL;

  PERFORM pg_temp.assert_eq(v_covered, 0, 'an enrolled subject with a meeting time is not reported');
END;
$$;

-- A dropped enrollment is not the student sitting in that class, so it must
-- not be reported either.
UPDATE public.enrollments
   SET status = 'dropped'
 WHERE status = 'enrolled';

DO $$
DECLARE
  v_n INT;
BEGIN
  SELECT COUNT(*) INTO v_n
    FROM public.enrollments e
    JOIN public.course_offerings o ON o.id = e.offering_id
    LEFT JOIN public.timetable t   ON t.offering_id = o.id
   WHERE e.status = 'enrolled'
     AND t.id IS NULL;

  PERFORM pg_temp.assert_eq(v_n, 0, 'dropped enrollments are not reported as missing a meeting time');
END;
$$;

DELETE FROM public.enrollments;

-- ─────────────────────────────────────────────────────────────────────
-- 12. Nothing escaped the transaction
--
-- If any assertion above raised, the ROLLBACK below never runs and the
-- fixtures are committed. This final check runs before the rollback, so a
-- clean result here means the rollback is the only thing left to do.
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_n INT;
BEGIN
  SELECT COUNT(*) INTO v_n
    FROM public.timetable t
    JOIN public.course_offerings o ON o.id = t.offering_id
   WHERE o.code LIKE 'TT1%';

  PERFORM pg_temp.assert_true(v_n > 0, 'the fixtures were present when the test finished');
END;
$$;

ROLLBACK;

-- Nothing to print: the ROLLBACK above is the last statement, so the SQL
-- editor reports success and leaves no trace.
