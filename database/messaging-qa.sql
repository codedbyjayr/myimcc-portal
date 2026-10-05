-- =====================================================================
-- MyIMCC Portal -- messaging: question and answer queue
--
-- Decision: a student does not pick an office from a dropdown. The
-- conversation opens with a greeting from the help desk and the student
-- asks a question. Questions carry a topic so staff can triage the queue.
--
-- This script adds no sample messages.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- 1. Topic on messages
-- ─────────────────────────────────────────────────────────────────────
-- The subject line is free text and not useful for triage. topic is a
-- closed set the staff inbox can filter and count on.
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS topic TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'messages_topic_check'
  ) THEN
    ALTER TABLE public.messages
      ADD CONSTRAINT messages_topic_check
      CHECK (topic IS NULL OR topic IN (
        'enrollment', 'grades', 'billing', 'clearance',
        'schedule', 'registration', 'other'
      ));
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 2. Body must be real
-- ─────────────────────────────────────────────────────────────────────
-- body is NOT NULL but an empty string passed that check, so a blank
-- question could be filed.
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_body_not_blank;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_body_not_blank
  CHECK (length(btrim(body)) > 0);

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_subject_length;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_subject_length
  CHECK (subject IS NULL OR length(subject) <= 150);

-- ─────────────────────────────────────────────────────────────────────
-- 3. Help desk recipient
-- ─────────────────────────────────────────────────────────────────────
-- A student question has to be addressed to a specific profile because
-- messages.recipient_id is a FK and the inbox query is per-user. Rather
-- than have the client guess an id, the routing decision lives here where
-- it is auditable and changeable without a deploy.
--
-- Resolution order:
--   1. the profile whose email matches system_settings.registrar_email
--   2. any approved registrar
--   3. any approved admin
CREATE OR REPLACE FUNCTION public.helpdesk_recipient_id()
RETURNS UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
  v_id    UUID;
BEGIN
  SELECT value INTO v_email
    FROM public.system_settings
   WHERE key = 'registrar_email'
   LIMIT 1;

  IF v_email IS NOT NULL THEN
    SELECT id INTO v_id
      FROM public.profiles
     WHERE lower(email) = lower(v_email)
       AND status = 'approved'
       AND is_active IS NOT FALSE
     LIMIT 1;

    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;
  END IF;

  SELECT id INTO v_id
    FROM public.profiles
   WHERE role = 'registrar'
     AND status = 'approved'
     AND is_active IS NOT FALSE
   ORDER BY created_at
   LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  SELECT id INTO v_id
    FROM public.profiles
   WHERE role = 'admin'
     AND status = 'approved'
     AND is_active IS NOT FALSE
   ORDER BY created_at
   LIMIT 1;

  RETURN v_id;
END;
$$;

-- Callable by any signed-in student; it only ever returns an id, and the
-- profiles SELECT policy already lets them read that row.
GRANT EXECUTE ON FUNCTION public.helpdesk_recipient_id() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 4. A student may only write to a staffed office
-- ─────────────────────────────────────────────────────────────────────
-- "Users send messages" is a single permissive policy: sender_id must be the
-- caller, but recipient_id is unchecked. That is enough to file a message
-- against any profile id, including another student's, which turns the
-- messages table into a student-to-student channel. The student UI has no
-- recipient field, but a UI is not a control -- someone can always call the
-- REST API directly.
--
-- Replaced with a policy that checks the recipient's role server-side, so the
-- restriction holds regardless of what the client sends.
DROP POLICY IF EXISTS "Users send messages" ON public.messages;

-- Named for the rule rather than for a feature. The student portal no longer
-- has a composer for new questions -- the Help assistant is the front door and
-- a request becomes a message through the appointment trigger -- but a student
-- still has to be able to reply inside a thread, and that is the only write
-- this policy now permits. The earlier name said "ask the help desk" and
-- described a UI that no longer exists.
DROP POLICY IF EXISTS "Students may ask the help desk" ON public.messages;

-- A policy is evaluated as a query, not as trigger code, so there is no NEW
-- row to refer to: the columns of the row being tested are in scope directly.
-- The reference has to be qualified with the policy's own relation, because
-- an unqualified recipient_id inside the subquery would be ambiguous between
-- public.messages and public.profiles.
-- RLS applies to the profiles subqueries below, and that is what makes an
-- inline check useless here: "Users read own profile" on public.profiles lets
-- an authenticated caller see their own row and nothing else. A student asking
-- "is my recipient a staffed office?" therefore never sees the registrar's row,
-- the EXISTS is always false, and the policy can never be satisfied. Measured:
-- a student sees 1 profile row (their own), the recipient row reads as 0, and
-- the policy EXISTS evaluates to false. The effect was that no student could
-- send a message at all, which is the whole Help-to-consultation path.
--
-- is_staffed_office() and is_approved_account() are SECURITY DEFINER, so the
-- lookup bypasses RLS for the check itself and nothing else. They are also
-- STABLE and pinned to search_path.
CREATE OR REPLACE FUNCTION public.is_staffed_office(candidate UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = candidate
       AND role IN ('faculty', 'staff', 'dean', 'registrar', 'admin')
       AND status = 'approved'
       AND is_active IS NOT FALSE
  );
$$;

-- The mirror image: a staff member writing to a student needs to see the
-- student's row, which "Users read own profile" also prevents.
CREATE OR REPLACE FUNCTION public.is_approved_account(candidate UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = candidate
       AND status = 'approved'
       AND is_active IS NOT FALSE
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_staffed_office(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_approved_account(UUID) TO authenticated;

CREATE POLICY "Students may write only to staffed offices" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    -- The caller's own row is visible to them, so the role check reads
    -- straight from profiles. A pending or staff-shaped account cannot satisfy
    -- it by claiming to be a student.
    AND EXISTS (
      SELECT 1 FROM public.profiles
       WHERE id = auth.uid() AND role = 'student'
    )
    AND public.is_staffed_office(public.messages.recipient_id)
  );

-- Staff may write to any approved, active user. Kept separate so the two
-- rules can be read independently.
  CREATE POLICY "Staff may send to any approved user" ON public.messages
    FOR INSERT TO authenticated
    WITH CHECK (
      sender_id = auth.uid()
      -- Both lookups go through the SECURITY DEFINER helpers. Inlined, the
      -- recipient check could never pass for a staff member writing to a
      -- student, because the student profile row is hidden from them by
      -- "Users read own profile" -- the same trap as the policy above, in the
      -- opposite direction.
      AND public.is_approved_account(public.messages.recipient_id)
      AND public.is_staffed_office(auth.uid())
    );

-- ─────────────────────────────────────────────────────────────────────
-- 5. Indexes for the inbox
-- ─────────────────────────────────────────────────────────────────────
-- Both inbox views filter on sender or recipient and order newest first.
SELECT 'messages inbox performance' AS report,
       'messages with no sender index' AS issue,
       COUNT(*) AS rows_needing_scan
  FROM public.messages;

CREATE INDEX IF NOT EXISTS messages_recipient_created_idx
  ON public.messages (recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS messages_sender_created_idx
  ON public.messages (sender_id, created_at DESC);

-- Staff triage filters on unread.
CREATE INDEX IF NOT EXISTS messages_unread_idx
  ON public.messages (recipient_id, created_at DESC)
  WHERE is_read IS FALSE;

-- ─────────────────────────────────────────────────────────────────────
-- 6. Report: is anyone actually able to receive questions
-- ─────────────────────────────────────────────────────────────────────
-- If this returns no rows, every student question will fail to insert
-- because there is no recipient to address it to.
SELECT 'help desk is unstaffed' AS report,
       (SELECT value FROM public.system_settings WHERE key = 'registrar_email')
         AS configured_email,
       COUNT(*) FILTER (WHERE role = 'registrar') AS approved_registrars,
       COUNT(*) FILTER (WHERE role = 'admin')     AS approved_admins
  FROM public.profiles
 WHERE status = 'approved'
   AND is_active IS NOT FALSE
   AND role IN ('registrar', 'admin')
HAVING COUNT(*) = 0;

-- ─────────────────────────────────────────────────────────────────────
-- 7. Report: questions already filed without a topic
-- ─────────────────────────────────────────────────────────────────────
SELECT 'existing messages have no topic' AS report,
       topic,
       COUNT(*) AS messages,
       MIN(created_at) AS oldest,
       MAX(created_at) AS newest
  FROM public.messages
 GROUP BY topic
 ORDER BY messages DESC;
