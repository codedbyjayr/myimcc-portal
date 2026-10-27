-- Isolated runner only. All fictional records roll back.
BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('27000000-0000-0000-0000-000000000001','semester-student@example.invalid'),
 ('27000000-0000-0000-0000-000000000002','semester-dean@example.invalid');
INSERT INTO public.profiles(id,email,full_name,role,status,is_active,program,year_level) VALUES
 ('27000000-0000-0000-0000-000000000001','semester-student@example.invalid','Semester Student','student','approved',true,'BSIT','1st Year'),
 ('27000000-0000-0000-0000-000000000002','semester-dean@example.invalid','Semester Dean','dean','approved',true,'BSIT','1st Year')
ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role,status='approved',is_active=true;
SELECT set_config('request.jwt.claims','{"sub":"27000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
CREATE TEMP TABLE semester_offerings(kind text,id integer);
WITH o AS (INSERT INTO public.course_offerings(code,title,units,year,semester,school_year,enrollment_open) VALUES
 ('SEM-SUM','Summer',3,1,'Summer','2097–2098',true),
 ('SEM-FIRST','First',3.5,1,'1st Semester','2097-2098',true),
 ('SEM-SECOND','Second',1.5,1,'2nd Semester','2097—2098',true) RETURNING id,code)
INSERT INTO semester_offerings SELECT code,id FROM o;
INSERT INTO public.enrollments(student_id,offering_id,status)
SELECT '27000000-0000-0000-0000-000000000001',id,'enrolled' FROM semester_offerings WHERE kind='SEM-SUM';
INSERT INTO public.enrollments(student_id,offering_id,status)
SELECT '27000000-0000-0000-0000-000000000001',id,'enrolled' FROM semester_offerings WHERE kind='SEM-FIRST';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.course_offerings WHERE id IN (SELECT id FROM semester_offerings) AND school_year<>'2097-2098') THEN RAISE EXCEPTION 'School year not normalized'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.student_semesters WHERE student_id='27000000-0000-0000-0000-000000000001' AND semester='1st Semester' AND school_year='2097-2098' AND units_enrolled=3.5 AND subjects_enrolled=1) THEN RAISE EXCEPTION 'Fractional or per-semester totals incorrect'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.student_semesters WHERE student_id='27000000-0000-0000-0000-000000000001' AND semester='Summer' AND is_current) THEN RAISE EXCEPTION 'Historical enrollment moved current term backwards'; END IF;
END $$;
UPDATE public.enrollments SET status='dropped' WHERE offering_id=(SELECT id FROM semester_offerings WHERE kind='SEM-FIRST');
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.student_semesters WHERE student_id='27000000-0000-0000-0000-000000000001' AND semester='1st Semester' AND school_year='2097-2098' AND units_enrolled=0 AND subjects_enrolled=0) THEN RAISE EXCEPTION 'Removing enrollment left stale totals'; END IF;
END $$;
UPDATE public.enrollments SET status='enrolled',offering_id=(SELECT id FROM semester_offerings WHERE kind='SEM-SECOND') WHERE offering_id=(SELECT id FROM semester_offerings WHERE kind='SEM-FIRST');
UPDATE public.course_offerings SET units=2.5 WHERE id=(SELECT id FROM semester_offerings WHERE kind='SEM-SECOND');
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.student_semesters WHERE student_id='27000000-0000-0000-0000-000000000001' AND semester='2nd Semester' AND school_year='2097-2098' AND units_enrolled=2.5 AND subjects_enrolled=1) THEN RAISE EXCEPTION 'Moving enrollment or changing units left stale totals'; END IF;
END $$;
DELETE FROM public.enrollments WHERE offering_id=(SELECT id FROM semester_offerings WHERE kind='SEM-SECOND');
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.student_semesters WHERE student_id='27000000-0000-0000-0000-000000000001' AND semester='2nd Semester' AND school_year='2097-2098' AND units_enrolled=0 AND subjects_enrolled=0) THEN RAISE EXCEPTION 'Deleting enrollment left stale totals'; END IF;
 IF public.portal_release_ready() IS DISTINCT FROM 'semester-v3' THEN RAISE EXCEPTION 'Semester release check failed'; END IF;
 IF has_function_privilege('authenticated','private.refresh_enrollment_totals(uuid)','EXECUTE') THEN RAISE EXCEPTION 'Student can call internal recalculation'; END IF;
END $$;
ROLLBACK;
