BEGIN;
SELECT set_config('request.jwt.claims','{}',true);
INSERT INTO auth.users(id,email) VALUES
 ('19000000-0000-0000-0000-000000000001','curriculum-registrar@example.invalid'),
 ('19000000-0000-0000-0000-000000000002','curriculum-student@example.invalid'),
 ('19000000-0000-0000-0000-000000000003','curriculum-dean@example.invalid'),
 ('19000000-0000-0000-0000-000000000004','curriculum-teacher@example.invalid');
INSERT INTO public.profiles(id,email,full_name,role,status,is_active,program,year_level)
 SELECT id,email,'Curriculum test',CASE right(id::text,1) WHEN '1' THEN 'registrar' WHEN '2' THEN 'student' WHEN '3' THEN 'dean' ELSE 'teacher' END,
 'approved',true,'BSIT','4th Year' FROM auth.users WHERE id::text LIKE '19000000-%'
 ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role,status='approved',is_active=true,program='BSIT',year_level='4th Year';
INSERT INTO public.courses(code,title,year_level,semester,lec_units,lab_units,program) VALUES
 ('SA 101','Systems Administration and Maintenance',4,1,2,1,'BSIT'),
 ('IAS 102','Information Assurance and Security 2',4,1,2,1,'BSIT'),
 ('CAP 102','Capstone Project and Research 2',4,1,2,1,'BSIT'),
 ('SIA 102','Systems Integration and Architecture 2',4,1,2,1,'BSIT'),
 ('PRAC 101','IT Practicum',4,2,0,6,'BSIT'),
 ('CURR-SUM','Approved summer subject',4,3,3,0,'BSIT'),
 ('CURR-UNMAPPED','Unmapped subject',4,1,3,0,NULL),
 ('CURR-BSN','Other program subject',1,1,3,0,'BSN');
INSERT INTO public.course_offerings(code,title,units,program,year,semester,school_year,schedule,instructor_id)
 VALUES('IAS 102','Existing offering',3,'BSIT',4,'1st Semester','2088-2089','MWF 09:00-10:00','19000000-0000-0000-0000-000000000004');
SELECT set_config('request.jwt.claims','{"sub":"19000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
SELECT public.set_enrollment_term('2088-2089','1st Semester',true);
SELECT public.set_enrollment_term('2088-2089','1st Semester',true);
RESET ROLE;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.course_offerings WHERE school_year='2088-2089' AND program='BSIT')<>4
 OR (SELECT sum(units) FROM public.course_offerings WHERE school_year='2088-2089' AND program='BSIT')<>12 THEN RAISE EXCEPTION 'Wrong semester subjects or duplicated publication'; END IF;
 IF EXISTS(SELECT 1 FROM public.course_offerings WHERE school_year='2088-2089' AND code IN ('PRAC 101','CURR-SUM','CURR-UNMAPPED')) THEN RAISE EXCEPTION 'Published wrong semester or unmapped curriculum'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.course_offerings WHERE school_year='2088-2089' AND code='IAS 102' AND title='Existing offering' AND schedule='MWF 09:00-10:00' AND instructor_id='19000000-0000-0000-0000-000000000004') THEN RAISE EXCEPTION 'Existing offering overwritten'; END IF;
 IF EXISTS(SELECT 1 FROM public.course_offerings WHERE school_year='2088-2089' AND code='SA 101' AND (instructor_id IS NOT NULL OR schedule IS NOT NULL)) THEN RAISE EXCEPTION 'Invented a teacher or schedule'; END IF;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"19000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.enrollment_requests(student_id,offering_id)
 SELECT auth.uid(),id FROM public.course_offerings WHERE school_year='2088-2089' AND code='SA 101';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.enrollments WHERE student_id=auth.uid()) THEN RAISE EXCEPTION 'Request bypassed dean approval'; END IF;
 BEGIN PERFORM public.set_enrollment_term('2088-2089','Summer',true); RAISE EXCEPTION 'Student opened term'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"19000000-0000-0000-0000-000000000003","role":"authenticated","aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
SELECT public.review_enrollment_request((r->>'id')::uuid,'approved',NULL)
 FROM jsonb_array_elements(public.list_enrollment_request_history('pending')) r
 WHERE r->>'student_id'='19000000-0000-0000-0000-000000000002';
SELECT public.save_course_offering_with_instructor(id,code,title,units,program,year,semester,school_year,'TTh 09:00-10:00','19000000-0000-0000-0000-000000000004')
 FROM public.course_offerings WHERE school_year='2088-2089' AND code='SA 101';
SELECT public.set_enrollment_term('2088-2089','1st Semester',false);
SELECT public.set_enrollment_term('2088-2089','1st Semester',true);
SELECT public.set_enrollment_term('2088-2089','2nd Semester',true);
SELECT public.set_enrollment_term('2088-2089','Summer',true);
RESET ROLE;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.enrollments WHERE student_id='19000000-0000-0000-0000-000000000002' AND status='enrolled')<>1 THEN RAISE EXCEPTION 'Approval did not enroll student'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.teacher_assignments a JOIN public.course_offerings o ON o.id=a.offering_id WHERE o.school_year='2088-2089' AND o.code='SA 101' AND a.teacher_id='19000000-0000-0000-0000-000000000004' AND a.is_active) THEN RAISE EXCEPTION 'Teacher assignment missing'; END IF;
 IF (SELECT count(*) FROM public.course_offerings WHERE school_year='2088-2089' AND program='BSIT')<>6 THEN RAISE EXCEPTION 'Reopening duplicated or missing other term subjects'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.course_offerings WHERE school_year='2088-2089' AND code='SA 101' AND schedule='TTh 09:00-10:00' AND instructor_id='19000000-0000-0000-0000-000000000004') THEN RAISE EXCEPTION 'Reopening overwrote dean assignment'; END IF;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"19000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
SELECT public.set_enrollment_term('2088-2089','2nd Semester',false);
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"19000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN INSERT INTO public.enrollment_requests(student_id,offering_id) SELECT auth.uid(),id FROM public.course_offerings WHERE school_year='2088-2089' AND code='PRAC 101'; RAISE EXCEPTION 'Student requested closed subject'; EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
END $$;
RESET ROLE;
-- Publication and term opening roll back together if the notice cannot be saved.
CREATE FUNCTION pg_temp.reject_curriculum_notice() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Test notice failure' USING ERRCODE='23514'; END $$;
CREATE TRIGGER test_reject_curriculum_notice BEFORE INSERT ON public.activities FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_curriculum_notice();
SELECT set_config('request.jwt.claims','{"sub":"19000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM public.set_enrollment_term('2087-2088','1st Semester',true); RAISE EXCEPTION 'Notice failure ignored'; EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.course_offerings WHERE school_year='2087-2088') OR EXISTS(SELECT 1 FROM public.enrollment_terms WHERE school_year='2087-2088' AND is_open) THEN RAISE EXCEPTION 'Failed opening left published subjects'; END IF;
END $$;
ROLLBACK;
