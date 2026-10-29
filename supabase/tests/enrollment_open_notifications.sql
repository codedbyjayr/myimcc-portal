-- Isolated fixtures only; no notifications or enrollment changes survive this test.
BEGIN;
SELECT set_config('request.jwt.claims','{}',true);
CREATE TEMP TABLE term_notice_users(id uuid,role text,status text,active boolean);
INSERT INTO term_notice_users VALUES
 ('17000000-0000-0000-0000-000000000001','registrar','approved',true),
 ('17000000-0000-0000-0000-000000000002','student','approved',true),
 ('17000000-0000-0000-0000-000000000003','student','approved',true),
 ('17000000-0000-0000-0000-000000000004','student','approved',false),
 ('17000000-0000-0000-0000-000000000005','student','pending',true),
 ('17000000-0000-0000-0000-000000000006','teacher','approved',true);
INSERT INTO auth.users(id,email) SELECT id,id||'@example.invalid' FROM term_notice_users;
INSERT INTO public.profiles(id,email,full_name,role,status,is_active)
 SELECT id,id||'@example.invalid','Term notice test',role,status,active FROM term_notice_users
 ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role,status=EXCLUDED.status,is_active=EXCLUDED.is_active;
INSERT INTO auth.mfa_factors(id,user_id,status) VALUES('17000000-0000-0000-0000-000000000010','17000000-0000-0000-0000-000000000001','verified');
INSERT INTO public.course_offerings(code,title,units,year,semester,school_year,enrollment_open)
 SELECT 'NOTICE-'||semester,'Term notice subject',3,1,semester,'2094-2095',false
 FROM unnest(ARRAY['1st Semester','2nd Semester','Summer']) semester;

SELECT set_config('request.jwt.claims','{"sub":"17000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE term text; BEGIN
 FOREACH term IN ARRAY ARRAY['1st Semester','2nd Semester','Summer'] LOOP
  PERFORM public.set_enrollment_term('2094-2095',term,true);
  PERFORM public.set_enrollment_term('2094-2095',term,true);
 END LOOP;
 BEGIN PERFORM public.set_enrollment_term('2094-2095','Winter',true); RAISE EXCEPTION 'Invalid semester accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.set_enrollment_term('2094-2094','Summer',true); RAISE EXCEPTION 'Invalid year accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.set_enrollment_term('2093-2094','Summer',true); RAISE EXCEPTION 'Missing offerings accepted'; EXCEPTION WHEN no_data_found THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.course_offerings WHERE school_year='2094-2095' AND NOT enrollment_open) THEN RAISE EXCEPTION 'Term failed to open'; END IF;
 IF (SELECT count(*) FROM public.activities WHERE description LIKE 'Enrollment is now open for %, 2094-2095.%') <> 6 THEN RAISE EXCEPTION 'Opening must notify each approved active student exactly once per term'; END IF;
 IF EXISTS(SELECT 1 FROM public.activities a JOIN term_notice_users u ON u.id=a.student_id WHERE a.description LIKE 'Enrollment is now open for %, 2094-2095.%' AND (u.role<>'student' OR u.status<>'approved' OR NOT u.active)) THEN RAISE EXCEPTION 'Wrong audience notified'; END IF;
END $$;

-- Closing sends nothing; reopening creates one new notice per active student.
SET LOCAL ROLE authenticated;
SELECT public.set_enrollment_term('2094-2095','Summer',false);
RESET ROLE;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.activities WHERE description LIKE 'Enrollment is now open for %, 2094-2095.%') <> 6 THEN RAISE EXCEPTION 'Closing sent notices'; END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT public.set_enrollment_term('2094-2095','Summer',true);
RESET ROLE;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.activities WHERE description LIKE 'Enrollment is now open for %, 2094-2095.%') <> 8 THEN RAISE EXCEPTION 'Reopening did not notify students'; END IF;
END $$;

-- Students cannot manage terms and can read only their own notices.
SELECT set_config('request.jwt.claims','{"sub":"17000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM public.set_enrollment_term('2094-2095','Summer',false); RAISE EXCEPTION 'Student changed a term'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF (SELECT count(*) FROM public.activities WHERE description LIKE 'Enrollment is now open for %, 2094-2095.%') <> 4 THEN RAISE EXCEPTION 'Student cannot read their own notices'; END IF;
 IF EXISTS(SELECT 1 FROM public.activities WHERE student_id<>auth.uid()) THEN RAISE EXCEPTION 'Student read another student notices'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"17000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM public.set_enrollment_term('2094-2095','Summer',false); RAISE EXCEPTION 'Registrar bypassed MFA'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

-- A failed notification insert must roll back opening the term.
SELECT set_config('request.jwt.claims','{"sub":"17000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
SELECT public.set_enrollment_term('2094-2095','Summer',false);
RESET ROLE;
CREATE FUNCTION pg_temp.reject_term_notice() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Test notification failure' USING ERRCODE='23514'; END $$;
CREATE TRIGGER test_reject_term_notice BEFORE INSERT ON public.activities FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_term_notice();
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM public.set_enrollment_term('2094-2095','Summer',true); RAISE EXCEPTION 'Notification failure ignored'; EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.course_offerings WHERE school_year='2094-2095' AND semester='Summer' AND enrollment_open) THEN RAISE EXCEPTION 'Opening survived failed notification'; END IF;
 IF (SELECT count(*) FROM public.activities WHERE description LIKE 'Enrollment is now open for %, 2094-2095.%') <> 8 THEN RAISE EXCEPTION 'Partial notifications survived failure'; END IF;
END $$;
ROLLBACK;
