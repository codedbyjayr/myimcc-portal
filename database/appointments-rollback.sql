-- =====================================================================
-- MyIMCC Portal -- rollback of appointments.sql
--
-- WARNING: dropping the table destroys every consultation request, including
-- the history staff rely on to see who asked for what and when. Take a backup
-- first. This is only appropriate for tearing the feature back out entirely.
-- =====================================================================

-- The notification trigger inserts into messages, so it must go first.
DROP TRIGGER IF EXISTS trg_appointments_notify ON public.appointments;
DROP FUNCTION IF EXISTS public.appointments_notify_helpdesk();

-- The time validation trigger depends on manila_time_text, so it goes before
-- that function is dropped.
DROP TRIGGER IF EXISTS trg_appointments_validate_times ON public.appointments;
DROP FUNCTION IF EXISTS public.appointments_validate_times();

DROP TRIGGER IF EXISTS trg_appointments_touch ON public.appointments;
DROP FUNCTION IF EXISTS public.appointments_touch();

DROP TABLE IF EXISTS public.appointments;

-- These are generic enough that another feature may already be using them.
-- CASCADE would take that feature's objects with it, so they are only removed
-- when nothing else depends on them.
DROP FUNCTION IF EXISTS public.manila_now();
DROP FUNCTION IF EXISTS public.manila_time_text(TIMESTAMPTZ);

-- The messages rows the trigger created are left in place. They are ordinary
-- messages in a table that also holds real correspondence, and the schema has
-- no way to tell a booking notice from a person-written one, so deleting them
-- by pattern risks removing genuine messages. They are harmless once the
-- feature is gone: they read as a student asking for a consultation.
