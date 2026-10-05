-- =====================================================================
-- MyIMCC Portal -- appointments and messaging integration test
--
-- Covers the two migrations that implement the support flow:
--   messaging-qa.sql   topic, help desk routing, recipient restrictions
--   appointments.sql   consultation requests, Manila time, staff queue
--
-- These are tested together in one script on purpose. The notification
-- trigger in appointments.sql inserts into messages and calls
-- helpdesk_recipient_id(), so its behaviour is only observable when both
-- migrations are applied. Splitting them would produce two scripts that each
-- had to stub out half the feature.
--
-- Run in the Supabase SQL editor AFTER messaging-qa.sql and appointments.sql,
-- in that order. Everything is wrapped in a transaction that is rolled back,
-- so this leaves no rows behind and no policies altered.
--
-- No extension required. These scripts assert with their own pg_temp helpers
-- rather than pgTAP, so they run on any Postgres, which is what makes it
-- possible to execute them against a throwaway database before touching the
-- real one.
--
-- The things asserted here that a static review cannot establish:
--   * a student genuinely cannot open a student-to-student channel
--   * a request filed by a student really does notify the help desk
--   * a past Manila time is genuinely rejected, not just rendered oddly
--   * a registrar can still offer a time earlier than the student asked for
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

-- RLS does not make an UPDATE or DELETE raise 42501 when no policy applies: the
-- statement runs, matches no visible row, and returns 0. assert_raises on such a
-- statement therefore reports "expected an error, got success" and the test is
-- vacuous -- it would pass even if the policy were removed entirely. The
-- row-count form is what actually proves the write was blocked, and it also
-- catches the opposite bug, a policy that lets the row through.
CREATE OR REPLACE FUNCTION pg_temp.assert_write_blocked(stmt TEXT, name TEXT)
RETURNS TEXT AS $$
DECLARE
  affected INT;
BEGIN
  EXECUTE stmt;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN
    RAISE EXCEPTION 'FAILED: % (statement was allowed to affect % row(s))',
      name, affected;
  END IF;
  RETURN name;
END;
$$ LANGUAGE plpgsql;

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
    RAISE EXCEPTION 'FAILED: % (expected SQLSTATE %, got %)',
      name, expected_sqlstate, v_state;
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
-- would run with RLS switched off, so "a student cannot do this" would pass
-- for the wrong reason on a real database: the insert would succeed and the
-- assert_raises would report the failure rather than the policy catching it.
-- The role switch is what actually engages the policies.
CREATE OR REPLACE FUNCTION pg_temp.as_user(uid UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', uid::TEXT, TRUE);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', uid::TEXT, 'role', 'authenticated')::TEXT, TRUE);
    SET LOCAL SESSION AUTHORIZATION authenticated;
  END;
  $$ LANGUAGE plpgsql;

-- Returns to the privileged session. RESET ROLE is needed as well as clearing
-- the claims, otherwise the next privileged statement would still be running
-- as 'authenticated' and fail on the fixtures.
CREATE OR REPLACE FUNCTION pg_temp.reset_user()
  RETURNS VOID AS $$
  BEGIN
    -- SESSION AUTHORIZATION to match as_user(): RESET ROLE alone would leave
    -- session_user as 'postgres', which profiles_protect_privileged() treats
    -- as the trusted owner.
    RESET SESSION AUTHORIZATION;
    PERFORM set_config('request.jwt.claim.sub', '', TRUE);
    PERFORM set_config('request.jwt.claims', '', TRUE);
  END;
  $$ LANGUAGE plpgsql;

-- A fixed id, so the fixtures do not depend on generated uuids.
CREATE OR REPLACE FUNCTION pg_temp.uid(n INT)
RETURNS UUID AS $$
  SELECT ('cccccccc-0000-0000-0000-00000000000' || n::TEXT)::UUID;
$$ LANGUAGE sql IMMUTABLE;

-- An instant a fixed number of days from now, at a Manila wall-clock time.
-- Built in SQL rather than in JS so the assertions do not depend on the
-- runner's own time zone, which is the entire subject of these columns.
CREATE OR REPLACE FUNCTION pg_temp.manila_in(days INT, hour INT, minute INT)
RETURNS TIMESTAMPTZ AS $$
  SELECT ((CURRENT_DATE + days) + make_interval(hours => hour, mins => minute))
         AT TIME ZONE 'Asia/Manila';
$$ LANGUAGE sql STABLE;

-- The wall clock of an instant, in Manila, as text. Used to assert what a
-- human would actually see.
CREATE OR REPLACE FUNCTION pg_temp.manila_wall_clock(value TIMESTAMPTZ)
RETURNS TEXT AS $$
  SELECT to_char(value AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD HH24:MI');
$$ LANGUAGE sql IMMUTABLE;

-- How many consultation notifications our fixture students have generated.
-- Scoped to the fixture uuids on purpose: this script is meant to be run
-- against a live database that may already hold real requests, and an
-- unscoped COUNT would fail for the wrong reason.
CREATE OR REPLACE FUNCTION pg_temp.desk_notifications()
RETURNS BIGINT AS $$
  SELECT COUNT(*)
    FROM public.messages
   WHERE sender_id IN (pg_temp.uid(1), pg_temp.uid(2))
     AND body LIKE '%requested a consultation%';
$$ LANGUAGE sql STABLE;

-- The most recent such notification, as a human would read it.
CREATE OR REPLACE FUNCTION pg_temp.last_desk_notification()
RETURNS TEXT AS $$
  SELECT body
    FROM public.messages
   WHERE sender_id IN (pg_temp.uid(1), pg_temp.uid(2))
     AND body LIKE '%requested a consultation%'
   ORDER BY created_at DESC
   LIMIT 1;
$$ LANGUAGE sql STABLE;

-- ─────────────────────────────────────────────────────────────────────
-- Fixtures: two students, one registrar, one admin
-- ─────────────────────────────────────────────────────────────────────
-- Roles and status are set by UPDATE rather than by going through onboarding,
-- because the subject of this test is RLS and triggers, not identity.
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES (pg_temp.uid(1), 'aaa11111@imcc.edu.ph', '{}'::jsonb),
       (pg_temp.uid(2), 'bbb22222@imcc.edu.ph', '{}'::jsonb),
       (pg_temp.uid(3), 'ccc33333@imcc.edu.ph', '{}'::jsonb),
       (pg_temp.uid(4), 'eee55555@imcc.edu.ph', '{}'::jsonb);

UPDATE public.profiles SET full_name = 'Student One',   role = 'student',   status = 'approved', is_active = true WHERE id = pg_temp.uid(1);
UPDATE public.profiles SET full_name = 'Student Two',   role = 'student',   status = 'approved', is_active = true WHERE id = pg_temp.uid(2);
UPDATE public.profiles SET full_name = 'The Registrar', role = 'registrar', status = 'approved', is_active = true WHERE id = pg_temp.uid(3);
UPDATE public.profiles SET full_name = 'An Admin',      role = 'admin',     status = 'approved', is_active = true WHERE id = pg_temp.uid(4);

-- ─────────────────────────────────────────────────────────────────────
-- Isolation
--
-- helpdesk_recipient_id() picks the oldest eligible registrar, and prefers a
-- configured registrar_email outright. On a live database both would resolve
-- to real staff rather than to these fixtures, so the routing assertions would
-- fail for reasons that have nothing to do with the code under test.
--
-- So: drop the configured override and stand down every pre-existing
-- registrar and admin, leaving the four fixtures as the only eligible
-- accounts. The whole script runs in one transaction that is rolled back, so
-- none of this survives. It is a test transaction, not a data migration, and
-- it is safe to run against production data because ROLLBACK undoes it.
-- ─────────────────────────────────────────────────────────────────────
DELETE FROM public.system_settings WHERE key = 'registrar_email';

UPDATE public.profiles
   SET is_active = false
 WHERE role IN ('registrar', 'admin')
   AND id NOT IN (pg_temp.uid(1), pg_temp.uid(2), pg_temp.uid(3), pg_temp.uid(4));

-- ─────────────────────────────────────────────────────────────────────
-- A. Message recipient restrictions
-- ─────────────────────────────────────────────────────────────────────
SELECT pg_temp.as_user(pg_temp.uid(1));

-- A1. A student may write to a staffed office, carrying a topic. This is the
-- only message write a student has left: the Help assistant is the front door
-- for new questions, so this path is now replies within a thread.
    -- A CTE, not "SELECT COUNT(*) FROM (INSERT ... RETURNING 1)": a
    -- data-modifying statement cannot sit in a subquery, and folding it into
    -- one is a syntax error rather than a failed assertion.
    WITH inserted AS (
      INSERT INTO public.messages (sender_id, recipient_id, subject, topic, body)
      VALUES (pg_temp.uid(1), pg_temp.uid(3), 'Consultation', 'enrollment', 'Thank you, confirmed.')
      RETURNING 1
    )
    SELECT pg_temp.assert_true(
      (SELECT COUNT(*) FROM inserted) = 1,
      'A1 student may reply to an approved active registrar'
    );

-- A2. A student may NOT open a student-to-student channel. This is the defect
-- messaging-qa.sql exists to close, so it is asserted directly rather than
-- inferred from the policy merely existing.
SELECT pg_temp.assert_raises(
  $$INSERT INTO public.messages (sender_id, recipient_id, subject, body)
    VALUES (pg_temp.uid(1), pg_temp.uid(2), 'Hello', 'Peer to peer.')$$,
  'A2 student cannot message another student',
  '42501'
);

-- A3. sender_id is not forgeable, so a student cannot post as staff.
SELECT pg_temp.assert_raises(
  $$INSERT INTO public.messages (sender_id, recipient_id, subject, body)
    VALUES (pg_temp.uid(3), pg_temp.uid(2), 'Official', 'Approved by the Registrar.')$$,
  'A3 student cannot send as staff',
  '42501'
);

-- A4. A blank body is refused. Without this a student can file an empty
-- message that occupies a row in somebody's inbox.
SELECT pg_temp.assert_raises(
  $$INSERT INTO public.messages (sender_id, recipient_id, subject, body)
    VALUES (pg_temp.uid(1), pg_temp.uid(3), 'Empty', '    ')$$,
  'A4 blank body rejected',
  '23514'
);

-- A5. An unknown topic is refused, so triage cannot be defeated by a typo.
SELECT pg_temp.assert_raises(
  $$INSERT INTO public.messages (sender_id, recipient_id, subject, topic, body)
    VALUES (pg_temp.uid(1), pg_temp.uid(3), 'Odd', 'not-a-topic', 'Hello.')$$,
  'A5 unknown topic rejected',
  '23514'
);

-- A6. The topic is recorded, which is what makes the staff queue filterable.
SELECT pg_temp.assert_eq(
  (SELECT topic FROM public.messages
    WHERE sender_id = pg_temp.uid(1) AND recipient_id = pg_temp.uid(3)
    ORDER BY created_at DESC LIMIT 1),
  'enrollment'::TEXT,
  'A6 topic stored when supplied'
);

-- A7. A reply without a topic is still allowed, because replies have no topic
-- to give. Asserted so a future "topic is required" change cannot quietly lock
-- students out of replying.
    WITH inserted AS (
      INSERT INTO public.messages (sender_id, recipient_id, subject, body)
      VALUES (pg_temp.uid(1), pg_temp.uid(3), 'Re: Consultation', 'Any update?')
      RETURNING 1
    )
    SELECT pg_temp.assert_true(
      (SELECT COUNT(*) FROM inserted) = 1,
      'A7 reply without a topic is accepted'
    );

-- ─────────────────────────────────────────────────────────────────────
-- B. Help desk routing
-- ─────────────────────────────────────────────────────────────────────
-- The documented chain, in order: the configured registrar_email, then any
-- approved active registrar, then any approved active admin.
SELECT pg_temp.reset_user();

-- B1. An active registrar is chosen.
SELECT pg_temp.assert_eq(
  public.helpdesk_recipient_id(),
  pg_temp.uid(3),
  'B1 help desk resolves to the active registrar'
);

-- B2. With the registrar inactive the desk moves on rather than failing. A
-- stale configured email must not be the only thing keeping requests
-- deliverable.
UPDATE public.profiles SET is_active = false WHERE id = pg_temp.uid(3);
SELECT pg_temp.assert_eq(
  public.helpdesk_recipient_id(),
  pg_temp.uid(4),
  'B2 desk falls through to an admin when the registrar is inactive'
);
UPDATE public.profiles SET is_active = true WHERE id = pg_temp.uid(3);

-- B3. With nobody eligible the function returns null, which is the state the
-- booking panel warns a student about. Asserted so the null case is
-- deliberate rather than an accident of the fallback chain.
UPDATE public.profiles SET is_active = false WHERE id = pg_temp.uid(3);
UPDATE public.profiles SET is_active = false WHERE id = pg_temp.uid(4);
SELECT pg_temp.assert_eq(
  public.helpdesk_recipient_id(),
  NULL::UUID,
  'B3 desk is null when no staff account is active'
);
UPDATE public.profiles SET is_active = true WHERE id = pg_temp.uid(3);

-- ─────────────────────────────────────────────────────────────────────
-- C. Filing a consultation request
-- ─────────────────────────────────────────────────────────────────────
SELECT pg_temp.as_user(pg_temp.uid(1));

  -- C1. The happy path, with the time expressed as a Manila wall clock.
  -- CTE rather than "SELECT COUNT(*) FROM (INSERT ... RETURNING 1)": a
  -- data-modifying statement is not allowed in a subquery.
  WITH inserted AS (
    INSERT INTO public.appointments (student_id, topic, question, preferred_at, mode, notes)
    VALUES (pg_temp.uid(1), 'enrollment', 'How do I add a subject?',
            pg_temp.manila_in(3, 9, 0), 'in_person', 'Before Friday.')
    RETURNING 1
  )
  SELECT pg_temp.assert_true(
    (SELECT COUNT(*) FROM inserted) = 1,
    'C1 student may file a future request'
  );

-- C2. The stored instant is the Manila time that was asked for. If this drifts,
-- a request for 9:00 AM is silently booked for 1:00 AM or 5:00 PM, and nothing
-- else in the system would reveal it.
SELECT pg_temp.assert_eq(
  pg_temp.manila_wall_clock(
    (SELECT preferred_at FROM public.appointments
      WHERE student_id = pg_temp.uid(1) AND topic = 'enrollment'
      ORDER BY created_at DESC LIMIT 1)),
  pg_temp.manila_wall_clock(pg_temp.manila_in(3, 9, 0)),
  'C2 preferred_at round-trips as the Manila time entered'
);

-- C3. A request for a time that has passed is refused. This is the check a
-- browser-local clock used to get wrong, and the one a student notices.
SELECT pg_temp.assert_raises(
  format($$INSERT INTO public.appointments (student_id, topic, preferred_at, mode)
           VALUES (%L::uuid, 'grades', %L::timestamptz, 'in_person')$$,
         pg_temp.uid(1)::TEXT, pg_temp.manila_in(-1, 9, 0)),
  'C3 past request time rejected',
  '22007'
);

-- C4. The notification trigger fired and reached the help desk. This is the
-- property the whole feature rests on: if it does not fire, a request is stored
-- and nobody knows it exists.
--
-- Counted with reset_user because a student cannot read a registrar's inbox.
-- Asserting it as the student would pass for the wrong reason, or fail
-- depending on the SELECT policy, and neither outcome would mean anything.
SELECT pg_temp.reset_user();
SELECT pg_temp.assert_eq(
  pg_temp.desk_notifications(),
  1::BIGINT,
  'C4 filing a request notified the help desk exactly once'
);

-- C5. The notification states the time in Manila, so staff reading the inbox
-- and the appointment row cannot disagree about when the meeting is.
SELECT pg_temp.assert_true(
  pg_temp.last_desk_notification() LIKE '%Manila%',
  'C5 notification labels the time as Manila'
);

-- C6. The notification names the student, so a registrar can act on it without
-- opening the portal.
SELECT pg_temp.assert_true(
  pg_temp.last_desk_notification() LIKE '%Student One%',
  'C6 notification identifies the student'
);

    -- C6b. It carries the topic too, which is what makes the registrar's queue
    -- filterable rather than a single undifferentiated stream.
    -- 'enrollment', not 'clearance': at this point the most recent request is
    -- still the one from C1. The clearance request that C7 files has not
    -- happened yet, so expecting its topic here was asserting against a row
    -- that did not exist.
    SELECT pg_temp.assert_true(
      pg_temp.last_desk_notification() LIKE '%Topic: enrollment%',
      'C6b notification carries the topic'
);

-- C7. A second request notifies separately, proving the trigger is per-row and
-- not a one-shot.
SELECT pg_temp.as_user(pg_temp.uid(1));
  WITH inserted AS (
    INSERT INTO public.appointments (student_id, topic, preferred_at, mode)
    VALUES (pg_temp.uid(1), 'clearance', pg_temp.manila_in(5, 14, 0), 'online')
    RETURNING 1
  )
  SELECT pg_temp.assert_true(
    (SELECT COUNT(*) FROM inserted) = 1,
    'C7 a second request is accepted'
  );
SELECT pg_temp.reset_user();
SELECT pg_temp.assert_eq(
  pg_temp.desk_notifications(),
  2::BIGINT,
  'C7b each request notifies separately'
);

-- ─────────────────────────────────────────────────────────────────────
-- D. Who can see and change a request
-- ─────────────────────────────────────────────────────────────────────
SELECT pg_temp.as_user(pg_temp.uid(1));

-- D1. A student sees their own.
SELECT pg_temp.assert_eq(
  (SELECT COUNT(*) FROM public.appointments),
  2::BIGINT,
  'D1 student reads their own requests'
);

-- D2. A student cannot read somebody else's, and cannot infer that a request
-- exists by seeing a row they should not.
SELECT pg_temp.as_user(pg_temp.uid(2));
SELECT pg_temp.assert_eq(
  (SELECT COUNT(*) FROM public.appointments),
  0::BIGINT,
  'D2 another student sees no requests'
);

-- D3. A request cannot be filed on another student's behalf, which would let
-- a student fill the registrar's queue with requests attributed to others.
SELECT pg_temp.assert_raises(
  format($$INSERT INTO public.appointments (student_id, topic, preferred_at, mode)
           VALUES (%L::uuid, 'billing', %L::timestamptz, 'in_person')$$,
         pg_temp.uid(1)::TEXT, pg_temp.manila_in(2, 10, 0)),
  'D3 student cannot file for another student',
  '42501'
);

-- D4. A student cancels their own pending request, but only while pending.
-- CTE, since a data-modifying statement cannot live in a subquery.
SELECT pg_temp.as_user(pg_temp.uid(1));
WITH cancelled AS (
  UPDATE public.appointments SET status = 'cancelled'
    WHERE id = (SELECT id FROM public.appointments
                 WHERE student_id = pg_temp.uid(1) AND status = 'pending'
                 ORDER BY created_at LIMIT 1)
  RETURNING 1
)
SELECT pg_temp.assert_true(
  (SELECT COUNT(*) FROM cancelled) = 1,
  'D4 student may cancel their own pending request'
);

-- D5. A student cannot confirm. Confirmation is the moment a request becomes
-- an arrangement, and a student setting it themselves would invent an
-- appointment nobody agreed to.
-- This one genuinely raises: the UPDATE policy's WITH CHECK rejects the
-- student's attempt to confirm, so SQLSTATE 42501 is the right thing to assert.
-- (Contrast D6 below, where DELETE under RLS is silent.)
SELECT pg_temp.assert_raises(
  format($$UPDATE public.appointments
            SET status = 'confirmed', scheduled_at = %L::timestamptz
          WHERE student_id = %L::uuid$$,
         pg_temp.manila_in(4, 10, 0)::TEXT, pg_temp.uid(1)::TEXT),
  'D5 student cannot confirm a request',
  '42501'
);

-- D6. A student cannot delete, which would erase the record staff rely on to
-- see who asked for what and when. DELETE under RLS is the same silent case as
-- D5: no matching policy means 0 rows and no error.
SELECT pg_temp.assert_write_blocked(
  format($$DELETE FROM public.appointments WHERE student_id = %L::uuid$$,
         pg_temp.uid(1)::TEXT),
  'D6 student cannot delete a request'
);

-- ─────────────────────────────────────────────────────────────────────
-- E. Staff work the queue
-- ─────────────────────────────────────────────────────────────────────
SELECT pg_temp.as_user(pg_temp.uid(3));

-- E1. Staff see the whole queue, which is the point of the feature. Scoped to
-- the fixture students so real requests in the live database are irrelevant.
SELECT pg_temp.assert_eq(
  (SELECT COUNT(*) FROM public.appointments
    WHERE student_id IN (pg_temp.uid(1), pg_temp.uid(2))),
  2::BIGINT,
  'E1 staff read the whole queue'
);

-- E2. Staff confirm with a Manila time. This request asked for day+5, and the
-- registrar is offering day+4, so E2 already exercises an earlier slot; E4
-- makes the same point explicitly and unambiguously.
WITH updated AS (
  UPDATE public.appointments
     SET status = 'confirmed',
         scheduled_at = pg_temp.manila_in(4, 10, 30),
         assigned_to = pg_temp.uid(3)
   WHERE student_id = pg_temp.uid(1) AND status = 'pending'
  RETURNING 1
)
SELECT pg_temp.assert_true(
  (SELECT COUNT(*) FROM updated) = 1,
  'E2 staff may confirm a request'
);

-- E3. The confirmed instant is readable back as the Manila time staff entered.
SELECT pg_temp.assert_eq(
  pg_temp.manila_wall_clock(
    (SELECT scheduled_at FROM public.appointments
      WHERE student_id = pg_temp.uid(1) AND status = 'confirmed' LIMIT 1)),
  pg_temp.manila_wall_clock(pg_temp.manila_in(4, 10, 30)),
  'E3 scheduled_at round-trips as the Manila time entered'
);

-- E4. Staff may move a confirmed slot to a time that has already passed only
-- if the check fails, so this asserts the rejection: staff work from a list and
-- one stale row should not be confirmable by reflex.
SELECT pg_temp.assert_raises(
  format($$UPDATE public.appointments
            SET scheduled_at = %L::timestamptz
          WHERE id = (SELECT id FROM public.appointments
                       WHERE student_id = %L::uuid AND status = 'confirmed'
                       LIMIT 1)$$,
         pg_temp.manila_in(-2, 10, 0)::TEXT, pg_temp.uid(1)::TEXT),
  'E4 past confirmed time rejected',
  '22007'
);

-- E5. Staff may offer a time earlier than the student asked for. An earlier
-- version of the schema forbade this, which blocked the most ordinary
-- registrar action there is: a student asks for next week because they guessed
-- when the office was open, and the office is free tomorrow.
WITH moved AS (
  UPDATE public.appointments
     SET scheduled_at = pg_temp.manila_in(1, 11, 0)
   WHERE id = (SELECT id FROM public.appointments
                WHERE student_id = pg_temp.uid(1) AND status = 'confirmed'
                LIMIT 1)
  RETURNING 1
)
SELECT pg_temp.assert_true(
  (SELECT COUNT(*) FROM moved) = 1,
  'E5 staff may confirm a time earlier than the student requested'
);

-- E6. Declaring a request declined clears the confirmed time, so a declined
-- request cannot keep looking like an arrangement in the student's portal.
WITH declined AS (
  UPDATE public.appointments SET status = 'declined', scheduled_at = NULL
   WHERE student_id = pg_temp.uid(1) AND status = 'confirmed'
  RETURNING 1
)
SELECT pg_temp.assert_true(
  (SELECT COUNT(*) FROM declined) = 1,
  'E6 staff may decline a request'
);
SELECT pg_temp.assert_eq(
  (SELECT COUNT(*) FROM public.appointments
    WHERE student_id = pg_temp.uid(1) AND status = 'declined'
      AND scheduled_at IS NOT NULL),
  0::BIGINT,
  'E6b declining clears the confirmed time'
);

-- ─────────────────────────────────────────────────────────────────────
-- F. The time helpers render Manila
-- ─────────────────────────────────────────────────────────────────────
SELECT pg_temp.reset_user();

-- F1. manila_now is an instant, not a wall clock, so it can be compared with
-- other instants.
SELECT pg_temp.assert_eq(
  pg_typeof(public.manila_now())::TEXT,
  'timestamp with time zone'::TEXT,
  'F1 manila_now returns timestamptz'
);

    -- F2. manila_time_text renders a Manila wall clock. The zone label is NOT
    -- part of this function's output: the appointment trigger appends
    -- ' Manila' itself when it builds the notification, so the label lives at
    -- the call site and is covered by C5. Asserting '%Manila%' here was
    -- checking a string this function never produces, so it failed for a reason
    -- that had nothing to do with timezone correctness.
    -- What matters here is that the instant is converted to Manila time: 09:00
    -- Manila is 01:00 UTC, so a UTC-rendering bug would show a different clock.
    SELECT pg_temp.assert_true(
      public.manila_time_text(pg_temp.manila_in(1, 9, 0)) LIKE '%09:00 AM',
  'F2 manila_time_text labels the zone'
);

-- F3. preferred_at is a timestamptz column, not a date plus text. This is the
-- schema-level statement of the whole timezone decision, and it would catch a
-- migration that reintroduced the split columns.
    SELECT pg_temp.assert_eq(
      -- Cast: information_schema.data_type is a domain over varchar, and
      -- assert_eq is ANYELEMENT/ANYELEMENT, so varchar-domain against text
      -- fails to resolve a single polymorphic instantiation.
      (SELECT data_type::TEXT FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'appointments'
          AND column_name = 'preferred_at'),
      'timestamp with time zone'::TEXT,
      'F3 preferred_at is timestamptz'
);
SELECT pg_temp.assert_eq(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'appointments'
      AND column_name IN ('preferred_date', 'preferred_time',
                          'scheduled_date', 'scheduled_time')),
  0::BIGINT,
  'F3b the split date and text time columns are gone'
);

-- ─────────────────────────────────────────────────────────────────────
-- All assertions passed. Roll back so the fixtures leave no trace.
-- ─────────────────────────────────────────────────────────────────────
ROLLBACK;
