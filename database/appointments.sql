-- =====================================================================
-- MyIMCC Portal -- appointment requests
--
-- Flow: the help bot answers what it can from published articles. When it
-- cannot, the student books a consultation and staff are notified.
--
-- Two tables are involved on purpose:
--   appointments -- the scheduling state (when, mode, status, who is handling it)
--   messages     -- the conversation, which is the only in-app notification
--                   channel staff already have
--
-- No office hours, availability grid or slot table is created here. Nothing in
-- the schema records when the Registrar's Office is actually open, and
-- publishing made-up hours would be worse than asking the student for a
-- preference and letting staff confirm it.
--
-- Times are stored as timestamptz. The school is in Asia/Manila (UTC+8, no
-- daylight saving), so a student's "9:00 AM" is an absolute instant, not a
-- wall-clock string. That is what makes it sortable, comparable, and possible
-- to detect two staff double-booking the same slot. The browser converts the
-- student's local input to an instant (see shared/datetime.js) and converts
-- back for display, so no PHP-side guesswork is involved.
-- =====================================================================

-- The current instant, for staff queries and reports.
--
-- Deliberately NOT "now() AT TIME ZONE 'Asia/Manila'". That expression returns
-- a naive timestamp, and coercing it back to timestamptz stamps the Manila wall
-- clock as if it were UTC -- eight hours in the future. An instant is already
-- timezone-aware, so it needs no conversion. Use manila_time_text() below to
-- render one for a human.
CREATE OR REPLACE FUNCTION public.manila_now()
RETURNS TIMESTAMPTZ
LANGUAGE sql STABLE
AS $$
  SELECT now();
$$;

GRANT EXECUTE ON FUNCTION public.manila_now() TO authenticated;

-- Render an instant as a Manila wall clock, for notification text and reports.
CREATE OR REPLACE FUNCTION public.manila_time_text(value TIMESTAMPTZ)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $$
  SELECT to_char(value AT TIME ZONE 'Asia/Manila', 'Dy, DD Mon YYYY HH12:MI AM')
$$;

GRANT EXECUTE ON FUNCTION public.manila_time_text(TIMESTAMPTZ) TO authenticated;

CREATE TABLE IF NOT EXISTS public.appointments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who asked. ON DELETE CASCADE because a deleted profile should not leave
  -- orphan requests behind in the staff queue.
  student_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Why the bot could not help. Closed set, so staff can filter the queue.
  topic          text NOT NULL,

  -- What the student asked the bot, if they copied it. Optional: they may
  -- prefer to describe the problem only here.
  question       text,

  -- The student's requested time, as an absolute instant. A preference, not a
  -- booking: staff confirm or propose a new time.
  preferred_at   timestamptz NOT NULL,

  mode           text NOT NULL DEFAULT 'in_person'
                 CHECK (mode IN ('in_person', 'online', 'phone')),

  notes          text,

  -- pending -> confirmed -> completed, with declined/cancelled as exits.
  -- A student may only cancel while pending, enforced in RLS below.
  status         text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'confirmed', 'declined',
                                   'completed', 'cancelled', 'no_show')),

  -- Which staff member took it. NULL while unassigned, which is the normal
  -- state for a fresh request.
  assigned_to    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Staff reply with the confirmed time once they have checked availability.
  -- NULL means "not confirmed", and is what the student sees as a request
  -- rather than an arrangement.
  scheduled_at   timestamptz,

  staff_note     text,

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT appointments_topic_check CHECK (topic IN (
    'enrollment', 'grades', 'billing', 'clearance',
    'schedule', 'registration', 'other'
  )),

  -- A request for a moment that has already passed is always a mistake and
  -- silently pollutes the staff queue. Checked in a trigger rather than a
  -- CHECK constraint so the error can name the school-local time that was
  -- actually submitted, which is otherwise very hard to debug.
  --
  -- Named appointments_mode_not_blank_check, not appointments_mode_check: an
  -- unnamed column CHECK on mode above is auto-named appointments_mode_check
  -- by Postgres, so claiming that name here collided with it and the whole
  -- migration failed with 'check constraint appointments_mode_check already
  -- exists' before any of the policies below were created.
  CONSTRAINT appointments_mode_not_blank_check CHECK (mode <> ''),
  CONSTRAINT appointments_notes_length CHECK (notes IS NULL OR length(notes) <= 2000),
  CONSTRAINT appointments_question_length CHECK (question IS NULL OR length(question) <= 2000)
);

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────
-- 1. Read access
-- ─────────────────────────────────────────────────────────────────────
-- Students see only their own requests. Staff see the whole queue.
DROP POLICY IF EXISTS "Students read own appointments" ON public.appointments;
CREATE POLICY "Students read own appointments" ON public.appointments
  FOR SELECT TO authenticated
  USING (
    student_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid()
         AND p.status = 'approved'
         AND p.is_active IS NOT FALSE
         AND p.role IN ('faculty', 'staff', 'dean', 'registrar', 'admin')
    )
  );

-- ─────────────────────────────────────────────────────────────────────
-- 2. Who may request
-- ─────────────────────────────────────────────────────────────────────
-- A student may open a request, and may only do so as themselves. A fresh
-- request is always pending and unassigned: the client cannot pre-assign it
-- to a staff member or mark it confirmed, which would let a student forge
-- "your appointment is confirmed".
DROP POLICY IF EXISTS "Students request appointments" ON public.appointments;
CREATE POLICY "Students request appointments" ON public.appointments
  FOR INSERT TO authenticated
  WITH CHECK (
    student_id = auth.uid()
    AND status = 'pending'
    AND assigned_to IS NULL
    AND scheduled_at IS NULL
    AND staff_note IS NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid()
         AND p.status = 'approved'
         AND p.is_active IS NOT FALSE
         AND p.role = 'student'
    )
  );

-- Staff may also raise a request on a student's behalf, e.g. walking a
-- student through the portal at the counter. Same pending-only rule.
DROP POLICY IF EXISTS "Staff request appointments for students" ON public.appointments;
CREATE POLICY "Staff request appointments for students" ON public.appointments
  FOR INSERT TO authenticated
  WITH CHECK (
    status = 'pending'
    AND assigned_to IS NULL
    AND scheduled_at IS NULL
    AND staff_note IS NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid()
         AND p.status = 'approved'
         AND p.is_active IS NOT FALSE
         AND p.role IN ('faculty', 'staff', 'dean', 'registrar', 'admin')
    )
  );

-- ─────────────────────────────────────────────────────────────────────
-- 3. Updates
-- ─────────────────────────────────────────────────────────────────────
-- A student may only withdraw a request, and only while it is still pending.
-- If staff already confirmed it, cancelling silently would break the
-- agreement, so the student has to let staff decline it instead.
DROP POLICY IF EXISTS "Students cancel own pending appointments" ON public.appointments;
CREATE POLICY "Students cancel own pending appointments" ON public.appointments
  FOR UPDATE TO authenticated
  USING (
    student_id = auth.uid()
    AND status = 'pending'
  )
  WITH CHECK (
    student_id = auth.uid()
    AND status = 'cancelled'
  );

-- Staff control the scheduling outcome. separated from the student rule so
-- each can be read on its own.
DROP POLICY IF EXISTS "Staff manage appointments" ON public.appointments;
CREATE POLICY "Staff manage appointments" ON public.appointments
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid()
         AND p.status = 'approved'
         AND p.is_active IS NOT FALSE
         AND p.role IN ('faculty', 'staff', 'dean', 'registrar', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid()
         AND p.status = 'approved'
         AND p.is_active IS NOT FALSE
         AND p.role IN ('faculty', 'staff', 'dean', 'registrar', 'admin')
    )
  );

-- ─────────────────────────────────────────────────────────────────────
-- 4. Staff handle it
-- ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Staff delete appointments" ON public.appointments;
CREATE POLICY "Staff delete appointments" ON public.appointments
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid()
         AND p.status = 'approved'
         AND p.is_active IS NOT FALSE
         AND p.role IN ('faculty', 'staff', 'dean', 'registrar', 'admin')
    )
  );

-- A student may not delete. Cancelling keeps the history staff rely on.

-- ─────────────────────────────────────────────────────────────────────
-- 5. Keep updated_at honest
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.appointments_touch()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_appointments_touch ON public.appointments;
CREATE TRIGGER trg_appointments_touch
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.appointments_touch();

-- ─────────────────────────────────────────────────────────────────────
-- 6. Times must make sense
-- ─────────────────────────────────────────────────────────────────────
-- Neither the requested nor the confirmed time may be in the past. That is
-- the whole of the rule, and it is deliberately that small.
--
-- An earlier check was tried here and removed: "the confirmed time cannot be
-- before the time the student asked for". It is a reasonable-sounding rule
-- that blocks ordinary work. A student asks for next week because that is when
-- they thought the office was open, and the registrar routinely offers
-- something sooner. Rejecting that at the database leaves staff staring at a
-- constraint error with no way to proceed, and it encodes a scheduling policy
-- that nobody agreed to. If the school later wants a same-day cut-off or a
-- minimum notice period, that is a real business rule and belongs here
-- deliberately, with the registrar's sign-off, not as a side effect.
--
-- The error names the Manila wall clock. A student who typed "14:00" and got
-- "must be in the future" would have no way to tell that the server read it
-- as 06:00 UTC.
CREATE OR REPLACE FUNCTION public.appointments_validate_times()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.preferred_at <= now() THEN
    RAISE EXCEPTION
      'the requested time (%, Manila) has already passed', public.manila_time_text(NEW.preferred_at)
      USING ERRCODE = '22007';
  END IF;

  IF NEW.scheduled_at IS NOT NULL AND NEW.scheduled_at <= now() THEN
    RAISE EXCEPTION
      'the confirmed time (%, Manila) has already passed', public.manila_time_text(NEW.scheduled_at)
      USING ERRCODE = '22007';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_appointments_validate_times ON public.appointments;
CREATE TRIGGER trg_appointments_validate_times
  BEFORE INSERT OR UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.appointments_validate_times();

-- ─────────────────────────────────────────────────────────────────────
-- 7. Notify staff
-- ─────────────────────────────────────────────────────────────────────
-- The registrar already watches the messages table, and it already carries an
-- unread badge, so a request is announced there. Done in a trigger so the
-- notification cannot be skipped by a client that forgets to send it.
--
-- SECURITY DEFINER because the inserting student satisfies
-- "Students may write only to staffed offices" only for the help desk
-- recipient, not for an arbitrary one, and the routing helper is SECURITY
-- DEFINER itself. Without this the trigger's insert would be evaluated against
-- the calling student's rights and rejected, because the trigger fires inside
-- the student's INSERT.
CREATE OR REPLACE FUNCTION public.appointments_notify_helpdesk()
RETURNS TRIGGER AS $$
DECLARE
  v_desk UUID := public.helpdesk_recipient_id();
  v_student RECORD;
  v_subject TEXT;
  v_body TEXT;
BEGIN
  IF v_desk IS NULL THEN
    -- Nobody can receive it. Do not silently drop the request; the report at
    -- the end of this file will show the queue is unstaffed.
    RAISE WARNING
      'appointment request % not announced: no active registrar or admin account',
      NEW.id;
    RETURN NEW;
  END IF;

  SELECT full_name, student_no, email INTO v_student
    FROM public.profiles
   WHERE id = NEW.student_id;

  v_subject := 'Consultation request: ' || NEW.topic;

  -- Every time in this text is labelled Manila, so staff reading the
  -- notification and the appointment row see the same wall clock.
  v_body :=
    'A student requested a consultation.' || E'\n\n'
    || 'Student: '   || coalesce(v_student.full_name, 'Unknown') || E'\n'
    || 'ID number: '  || coalesce(v_student.student_no, v_student.email, 'Not recorded') || E'\n'
    || 'Topic: '      || NEW.topic || E'\n'
    || 'Requested: '  || public.manila_time_text(NEW.preferred_at) || ' Manila' || E'\n'
    || 'Mode: '       || replace(NEW.mode, '_', ' ') || E'\n'
    || coalesce('Student''s question: ' || NEW.question || E'\n', '')
    || coalesce('Notes: ' || NEW.notes || E'\n', '')
    || E'\nConfirm the time from the Appointments list, then reply here. '
    || 'All times are Manila time.';

  INSERT INTO public.messages (sender_id, recipient_id, subject, topic, body)
  VALUES (NEW.student_id, v_desk, v_subject, NEW.topic, v_body);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_appointments_notify ON public.appointments;
CREATE TRIGGER trg_appointments_notify
  AFTER INSERT ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.appointments_notify_helpdesk();

-- ─────────────────────────────────────────────────────────────────────
-- 8. Indexes
-- ─────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS appointments_student_idx
  ON public.appointments (student_id, created_at DESC);

-- The staff queue is almost always "pending, soonest first".
CREATE INDEX IF NOT EXISTS appointments_queue_idx
  ON public.appointments (preferred_at)
  WHERE status = 'pending';

-- ─────────────────────────────────────────────────────────────────────
-- 9. Reports
-- ─────────────────────────────────────────────────────────────────────

-- If this returns a row, requests are being stored but nobody is told about
-- them, because the trigger above raised a warning instead of sending.
SELECT 'appointment requests exist but nobody is notified' AS report,
       (SELECT value FROM public.system_settings WHERE key = 'registrar_email')
         AS configured_email,
       COUNT(*) AS unannounced_requests
  FROM public.appointments
 WHERE status = 'pending'
   AND public.helpdesk_recipient_id() IS NULL
HAVING COUNT(*) > 0;

-- The staff work queue, soonest request first. Every time is rendered in
-- Manila so the report and the portal cannot disagree.
SELECT a.id,
       a.topic,
       a.status,
       replace(a.mode, '_', ' ') AS mode,
       public.manila_time_text(a.preferred_at) AS requested,
       a.preferred_at,
       -- NULL when unconfirmed. manila_time_text(NULL) is NULL, so no CASE
       -- is needed just to skip a null row.
       public.manila_time_text(a.scheduled_at) AS confirmed,
       a.scheduled_at,
       a.created_at,
       p.full_name AS student,
       coalesce(p.student_no, p.id_number) AS identifier,
       s.full_name AS assigned_to
  FROM public.appointments a
  JOIN public.profiles p ON p.id = a.student_id
  LEFT JOIN public.profiles s ON s.id = a.assigned_to
 WHERE a.status IN ('pending', 'confirmed')
 ORDER BY (a.status = 'pending') DESC,
          COALESCE(a.scheduled_at, a.preferred_at),
          a.created_at;

-- Two requests competing for the same Manila slot. Not an error -- a student
-- may change their mind and both may end up at the counter -- but staff need
-- to see it before confirming, which is the whole reason the time is stored
-- as a comparable instant rather than as text.
SELECT 'students competing for one slot' AS report,
       public.manila_time_text(a.preferred_at) AS slot_manila,
       a.preferred_at,
       COUNT(*) AS requests,
       string_agg(coalesce(p.full_name, 'Unknown') || ' (' || a.topic || ')', ', ' ORDER BY p.full_name)
         AS students
  FROM public.appointments a
  JOIN public.profiles p ON p.id = a.student_id
 WHERE a.status = 'pending'
 GROUP BY a.preferred_at
HAVING COUNT(*) > 1
 ORDER BY a.preferred_at;

