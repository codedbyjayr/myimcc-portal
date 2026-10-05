-- =====================================================================
-- MyIMCC Portal -- rollback of messaging-qa.sql
--
-- WARNING: this restores the permissive "Users send messages" policy, which
-- lets any signed-in user file a message against any profile id, including
-- another student's. It reinstates the student-to-student channel that
-- messaging-qa.sql closed. Use only to recover from a bad deploy.
-- =====================================================================

-- Restore the original unrestricted send policy.
DROP POLICY IF EXISTS "Students may write only to staffed offices" ON public.messages;
DROP POLICY IF EXISTS "Students may ask the help desk" ON public.messages;
DROP POLICY IF EXISTS "Staff may send to any approved user" ON public.messages;

CREATE POLICY "Users send messages" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid());

-- Drop the topic-restricting send helper and the queued-question columns.
DROP FUNCTION IF EXISTS public.helpdesk_recipient_id();

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_topic_check;
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_body_not_blank;
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_subject_length;
ALTER TABLE public.messages DROP COLUMN IF EXISTS topic;

DROP INDEX IF EXISTS public.messages_recipient_created_idx;
DROP INDEX IF EXISTS public.messages_sender_created_idx;
DROP INDEX IF EXISTS public.messages_unread_idx;

-- Note: timetable-integrity.sql is intentionally NOT rolled back here. Its
-- validation trigger only rejects conflicting meetings, and its policies
-- grant registrar/admin the write access needed to publish a schedule.
-- Reverting it would return the timetable to read-only, which is not a
-- working state. Revert the trigger only if it is blocking a legitimate
-- import, and do so by dropping trg_timetable_validate.
