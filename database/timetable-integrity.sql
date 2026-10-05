-- =====================================================================
-- MyIMCC Portal -- timetable integrity (per-offering model)
--
-- Decision: a meeting time belongs to a course_offering, not to a section.
-- timetable.offering_id is therefore the anchor, which is what the student
-- Class Schedule reads (enrollments -> timetable -> course_offerings).
--
-- This script adds no timetable rows. It validates the ones that exist and
-- reports the ones that cannot be trusted.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- 1. Report first: what is already wrong
-- ─────────────────────────────────────────────────────────────────────
-- Run these before applying the constraints below. If they return rows,
-- the timetable cannot be published to students yet, because every one of
-- these cases produces a wrong or empty schedule.

-- Meetings pointing at an offering that does not exist. The seed in
-- supabase-schema-v2.sql used literal offering_id 1, 2, 3, which only line
-- up with the intended subjects on a brand-new database where SERIAL
-- happens to start at 1. On a live database those ids belong to whatever
-- offerings were created first, so the sample schedule is attached to the
-- wrong subjects.
SELECT 'timetable rows with no offering' AS report,
       t.id,
       t.offering_id,
       t.day_of_week,
       t.start_time,
       t.end_time
  FROM public.timetable t
  LEFT JOIN public.course_offerings o ON o.id = t.offering_id
 WHERE o.id IS NULL
 ORDER BY t.offering_id, t.id;

-- Meetings pointing at a room that no longer exists.
SELECT 'timetable rows with no room' AS report,
       t.id,
       t.offering_id,
       t.room_id
  FROM public.timetable t
  LEFT JOIN public.rooms r ON r.id = t.room_id
 WHERE t.room_id IS NOT NULL
   AND r.id IS NULL
 ORDER BY t.id;

-- Meetings with no teacher assigned. A student cannot tell who to see.
SELECT 'timetable rows with no teacher' AS report,
       t.id,
       t.offering_id,
       t.day_of_week,
       t.start_time
  FROM public.timetable t
 WHERE t.teacher_id IS NULL
 ORDER BY t.offering_id, t.id;

-- Ended before it started, or zero length.
SELECT 'timetable rows with invalid times' AS report,
       t.id,
       t.offering_id,
       t.day_of_week,
       t.start_time,
       t.end_time
  FROM public.timetable t
 WHERE t.end_time <= t.start_time
 ORDER BY t.id;

  -- Two classes meeting at the same time in the same room.
  --
  -- This has to compare time ranges, not just count rows per day. A room used
  -- for 07:00-08:00 and again for 10:00-11:00 on the same day is normal
  -- timetabling, and grouping by day/room alone reports every one of those as
  -- a double booking, which buries the real conflicts in noise.
  --
  -- Half-open intervals [start, end): a class ending at 08:00 and one starting
  -- at 08:00 do not overlap, so the test is strict on both ends. That matches
  -- the trigger, so this report and the constraint never disagree.
  SELECT 'double-booked room' AS report,
         a.day_of_week,
         a.room_id,
         r.name AS room_name,
         a.id AS first_id,
         b.id AS second_id,
         GREATEST(a.start_time, b.start_time) AS overlapping_from,
         LEAST(a.end_time, b.end_time) AS overlapping_to
    FROM public.timetable a
    JOIN public.timetable b
      ON b.day_of_week = a.day_of_week
     AND b.room_id = a.room_id
     AND b.id > a.id
     AND a.start_time < b.end_time
     AND b.start_time < a.end_time
    JOIN public.rooms r ON r.id = a.room_id
   ORDER BY a.day_of_week, a.room_id, overlapping_from;

-- ─────────────────────────────────────────────────────────────────────
-- 2. Valid meeting times
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.timetable_validate()
RETURNS TRIGGER AS $$
DECLARE
  -- One variable per check, deliberately.
  --
  -- These used to share a single v_conflict RECORD, which broke as soon as two
  -- checks ran in the same statement: the offering check assigned it four
  -- columns, the room check then reassigned it to two, and the room branch's
  -- own message referenced v_conflict.start_time. Postgres raised
  --   record "v_conflict" has no field "start_time"   (SQLSTATE 42703)
  -- instead of the intended 23P01, so the most common conflict of all -- a
  -- room double-booked against a class that does not clash on offering --
  -- failed with a plpgsql error whose message named nothing useful. The insert
  -- was still refused, so this was never a hole in the constraint, but every
  -- client keying on 23P01 would have misread it, and the registrar would have
  -- been shown a message about a field rather than a booked room.
  v_conflict_offering RECORD;
  v_conflict_room     RECORD;
  v_conflict_teacher  RECORD;
BEGIN
  IF NEW.end_time <= NEW.start_time THEN
    RAISE EXCEPTION
      'meeting must end after it starts (got % to %)',
      NEW.start_time, NEW.end_time
      USING ERRCODE = '23514';
  END IF;

  -- One offering cannot hold two meetings at once. This is the direct
  -- consequence of modelling time per-offering.
  SELECT t.id, t.day_of_week, t.start_time, t.end_time
    INTO v_conflict_offering
    FROM public.timetable t
   WHERE t.offering_id = NEW.offering_id
     AND t.day_of_week  = NEW.day_of_week
     AND t.id <> NEW.id
     AND t.start_time < NEW.end_time
     AND t.end_time   > NEW.start_time
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'offering % already meets % %-% on this day',
      NEW.offering_id, NEW.day_of_week,
      v_conflict_offering.start_time, v_conflict_offering.end_time
      USING ERRCODE = '23P01';
  END IF;

  -- A room cannot host two classes at once.
  IF NEW.room_id IS NOT NULL THEN
    SELECT t.id, t.offering_id, t.start_time, t.end_time
      INTO v_conflict_room
      FROM public.timetable t
     WHERE t.room_id     = NEW.room_id
       AND t.day_of_week = NEW.day_of_week
       AND t.id <> NEW.id
       AND t.start_time < NEW.end_time
       AND t.end_time   > NEW.start_time
     LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION
        'room % is already booked % %-% (offering %)',
        NEW.room_id, NEW.day_of_week,
        v_conflict_room.start_time, v_conflict_room.end_time,
        v_conflict_room.offering_id
        USING ERRCODE = '23P01';
    END IF;
  END IF;

  -- A teacher cannot teach two classes at once.
  IF NEW.teacher_id IS NOT NULL THEN
    SELECT t.id, t.offering_id, t.start_time, t.end_time
      INTO v_conflict_teacher
      FROM public.timetable t
     WHERE t.teacher_id  = NEW.teacher_id
       AND t.day_of_week = NEW.day_of_week
       AND t.id <> NEW.id
       AND t.start_time < NEW.end_time
       AND t.end_time   > NEW.start_time
     LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION
        'teacher % already teaches % %-% (offering %)',
        NEW.teacher_id, NEW.day_of_week,
        v_conflict_teacher.start_time, v_conflict_teacher.end_time,
        v_conflict_teacher.offering_id
        USING ERRCODE = '23P01';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_timetable_validate ON public.timetable;
CREATE TRIGGER trg_timetable_validate
  BEFORE INSERT OR UPDATE ON public.timetable
  FOR EACH ROW EXECUTE FUNCTION public.timetable_validate();

-- ─────────────────────────────────────────────────────────────────────
-- 3. Who may write the timetable
-- ─────────────────────────────────────────────────────────────────────
-- Nothing granted staff UPDATE on timetable, so without a policy the
-- schedule is effectively read-only and nobody can publish it. Registrars
-- and admins get full control; everyone else keeps read access.
DROP POLICY IF EXISTS "Authenticated read timetable" ON public.timetable;
CREATE POLICY "Authenticated read timetable" ON public.timetable
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Registrar manage timetable" ON public.timetable;
CREATE POLICY "Registrar manage timetable" ON public.timetable
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid()
         AND p.status = 'approved'
         AND p.is_active IS NOT FALSE
         AND p.role IN ('registrar', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid()
         AND p.status = 'approved'
         AND p.is_active IS NOT FALSE
         AND p.role IN ('registrar', 'admin')
    )
  );

-- ─────────────────────────────────────────────────────────────────────
-- 4. Indexes for the schedule query
-- ─────────────────────────────────────────────────────────────────────
-- The student schedule filters timetable by a list of offering ids. Without
-- an index that is a sequential scan of the whole table per student.
CREATE INDEX IF NOT EXISTS timetable_offering_day_idx
  ON public.timetable (offering_id, day_of_week, start_time);

CREATE INDEX IF NOT EXISTS timetable_room_day_idx
  ON public.timetable (room_id, day_of_week);

CREATE INDEX IF NOT EXISTS timetable_teacher_day_idx
  ON public.timetable (teacher_id, day_of_week)
  WHERE teacher_id IS NOT NULL;

-- enrollments is scanned by student for every schedule, grade and billing
-- page. It has a UNIQUE(student_id, offering_id), which already covers
-- this, so nothing extra is needed here.

-- ─────────────────────────────────────────────────────────────────────
-- 5. Which enrolled subjects will show no meeting time
-- ─────────────────────────────────────────────────────────────────────
-- The student page reports these as "no meeting time published". This
-- query is the staff-side version of the same fact.
SELECT 'enrolled subjects with no timetable row' AS report,
       e.student_id,
       p.full_name,
       p.student_no,
       o.id AS offering_id,
       o.code,
       o.title
  FROM public.enrollments e
  JOIN public.profiles p          ON p.id = e.student_id
  JOIN public.course_offerings o  ON o.id = e.offering_id
  LEFT JOIN public.timetable t    ON t.offering_id = o.id
 WHERE e.status = 'enrolled'
   AND t.id IS NULL
 ORDER BY p.full_name, o.code;
