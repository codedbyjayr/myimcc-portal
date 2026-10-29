BEGIN;
SELECT set_config('request.jwt.claims','{}',true);
INSERT INTO auth.users(id,email) VALUES
 ('18000000-0000-0000-0000-000000000001','empty-term-registrar@example.invalid'),
 ('18000000-0000-0000-0000-000000000002','empty-term-student@example.invalid');
INSERT INTO public.profiles(id,email,full_name,role,status,is_active) VALUES
 ('18000000-0000-0000-0000-000000000001','empty-term-registrar@example.invalid','Term Registrar','registrar','approved',true),
 ('18000000-0000-0000-0000-000000000002','empty-term-student@example.invalid','Term Student','student','approved',true)
 ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role,status=EXCLUDED.status,is_active=true;
INSERT INTO public.academic_years(label,is_active) VALUES('AY 2090-2091',false);
SELECT set_config('request.jwt.claims','{"sub":"18000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE term text; BEGIN
 IF (SELECT count(*) FROM jsonb_array_elements(public.get_enrollment_workspace()->'terms') t WHERE t->>'school_year'='2090-2091')<>3 THEN RAISE EXCEPTION 'Empty academic year must list all three terms'; END IF;
 FOREACH term IN ARRAY ARRAY['1st Semester','2nd Semester','Summer'] LOOP
  PERFORM public.set_enrollment_term('2090-2091',term,true);
  PERFORM public.set_enrollment_term('2090-2091',term,true);
 END LOOP;
 IF (SELECT count(*) FROM jsonb_array_elements(public.get_enrollment_workspace()->'terms') t WHERE t->>'school_year'='2090-2091' AND (t->>'is_open')::boolean)<>3 THEN RAISE EXCEPTION 'Empty terms did not open'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.course_offerings WHERE school_year='2090-2091') THEN RAISE EXCEPTION 'Opening terms invented subjects'; END IF;
 IF (SELECT count(*) FROM public.activities WHERE student_id='18000000-0000-0000-0000-000000000002' AND description LIKE 'Enrollment is now open for %, 2090-2091.%')<>3 THEN RAISE EXCEPTION 'Empty term notices missing or duplicated'; END IF;
END $$;

-- Subjects published later follow the term state.
SELECT set_config('request.jwt.claims','{}',true);
INSERT INTO public.course_offerings(code,title,units,year,school_year,semester) VALUES('EMPTY-OPEN','Later open subject',3,1,'2090-2091','1st Semester');
DO $$ BEGIN
 IF NOT (SELECT enrollment_open FROM public.course_offerings WHERE code='EMPTY-OPEN') THEN RAISE EXCEPTION 'Later subject did not inherit open status'; END IF;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"18000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
SELECT public.set_enrollment_term('2090-2091','1st Semester',false);
SELECT public.set_enrollment_term('2090-2091','2nd Semester',false);
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
INSERT INTO public.course_offerings(code,title,units,year,school_year,semester,enrollment_open) VALUES('EMPTY-CLOSED','Later closed subject',3,1,'2090-2091','1st Semester',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.course_offerings WHERE school_year='2090-2091' AND enrollment_open) THEN RAISE EXCEPTION 'Closed term allowed open subjects'; END IF;
END $$;

-- The saved empty-term status also rolls back if notification delivery fails.
CREATE FUNCTION pg_temp.reject_empty_term_notice() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Test notification failure' USING ERRCODE='23514'; END $$;
CREATE TRIGGER test_reject_empty_term_notice BEFORE INSERT ON public.activities FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_empty_term_notice();
SELECT set_config('request.jwt.claims','{"sub":"18000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM public.set_enrollment_term('2090-2091','2nd Semester',true); RAISE EXCEPTION 'Notification error swallowed'; EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF (SELECT is_open FROM public.enrollment_terms WHERE school_year='2090-2091' AND semester='2nd Semester') THEN RAISE EXCEPTION 'Empty term opening survived notification failure'; END IF;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"18000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.enrollment_terms WHERE school_year='2090-2091' AND semester='Summer' AND is_open) THEN RAISE EXCEPTION 'Student cannot read open empty terms'; END IF;
 BEGIN UPDATE public.enrollment_terms SET is_open=false; RAISE EXCEPTION 'Student changed enrollment terms'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.set_enrollment_term('2090-2091','Summer',false); RAISE EXCEPTION 'Student used manager RPC'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
