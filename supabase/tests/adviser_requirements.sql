-- Run after the pending adviser migration in an isolated database. Fixtures roll back.
BEGIN;
SET LOCAL search_path=public,extensions;
SELECT set_config('request.jwt.claims','{}',true);
CREATE TEMP TABLE adviser_ids(role text,id uuid);
INSERT INTO adviser_ids VALUES
 ('student','10000000-0000-0000-0000-000000000001'),
 ('teacher','10000000-0000-0000-0000-000000000002'),
 ('dean','10000000-0000-0000-0000-000000000003'),
 ('admin','10000000-0000-0000-0000-000000000004'),
 ('other_teacher','10000000-0000-0000-0000-000000000005');
INSERT INTO auth.users(id,email,raw_user_meta_data) SELECT id,'adviser-'||role||'@example.invalid',jsonb_build_object('full_name','Adviser '||role) FROM adviser_ids;
INSERT INTO public.profiles(id,email,full_name,role,status,is_active,program,year_level)
SELECT id,'adviser-'||role||'@example.invalid','Adviser '||role,CASE WHEN role='other_teacher' THEN 'teacher' ELSE role END,'approved',true,'BSIT','1st Year' FROM adviser_ids
ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role,status='approved',is_active=true,program='BSIT',year_level='1st Year';
CREATE TEMP TABLE adviser_offerings(kind text,id integer);
GRANT SELECT ON adviser_ids TO authenticated;
GRANT SELECT,INSERT ON adviser_offerings TO authenticated;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',id,'role','authenticated','aal','aal2')::text,true) FROM adviser_ids WHERE role='dean';
SET LOCAL ROLE authenticated;
INSERT INTO adviser_offerings SELECT 'summer',(public.save_course_offering_with_instructor(NULL,'ADVSUM','Summer subject',3,'BSIT',1,'Summer','2098-2099',NULL,NULL)->>'id')::integer;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.teacher_assignments WHERE offering_id=(SELECT id FROM adviser_offerings WHERE kind='summer') AND is_active) THEN RAISE EXCEPTION 'Unassigned subject created an active assignment'; END IF;
END $$;
SELECT public.save_course_offering_with_instructor((SELECT id FROM adviser_offerings WHERE kind='summer'),'ADVSUM','Summer subject',3,'BSIT',1,'Summer','2098-2099',NULL,(SELECT id FROM adviser_ids WHERE role='teacher'));
INSERT INTO adviser_offerings SELECT 'first',(public.save_course_offering_with_instructor(NULL,'ADVFIRST','First semester subject',3,'BSIT',1,'1st Semester','2098-2099',NULL,NULL)->>'id')::integer;
SELECT public.set_enrollment_term('2098-2099','Summer',true);
SELECT public.set_enrollment_term('2098-2099','1st Semester',true);
RESET ROLE;

-- Students can request, but cannot finalize enrollment, lock grades, or view another record.
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',id,'role','authenticated','aal','aal2')::text,true) FROM adviser_ids WHERE role='student';
SET LOCAL ROLE authenticated;
INSERT INTO public.enrollment_requests(student_id,offering_id) SELECT auth.uid(),id FROM adviser_offerings;
DO $$ BEGIN
 BEGIN PERFORM public.get_student_record(auth.uid()); RAISE EXCEPTION 'Student read dean records'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.lock_class_grades((SELECT id FROM adviser_offerings LIMIT 1)); RAISE EXCEPTION 'Student locked grades'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.finalize_enrollment(auth.uid(),'2098-2099','Summer'); RAISE EXCEPTION 'Student finalized enrollment'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF (SELECT count(*) FROM public.instructor_notifications)<>0 THEN RAISE EXCEPTION 'Student read instructor notifications'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',id,'role','authenticated','aal','aal2')::text,true) FROM adviser_ids WHERE role='dean';
SET LOCAL ROLE authenticated;
SELECT public.review_enrollment_request((r->>'id')::uuid,'approved',NULL) FROM jsonb_array_elements(public.list_enrollment_request_history('pending')) r WHERE r->>'student_id'=(SELECT id::text FROM adviser_ids WHERE role='student');
SELECT public.save_course_offering_with_instructor((SELECT id FROM adviser_offerings WHERE kind='first'),'ADVFIRST','First semester subject',3,'BSIT',1,'1st Semester','2098-2099',NULL,(SELECT id FROM adviser_ids WHERE role='teacher'));
DO $$ BEGIN
 IF (SELECT count(*) FROM jsonb_array_elements(public.get_enrollment_workspace()->'groups') g WHERE g->>'student_id'=(SELECT id::text FROM adviser_ids WHERE role='student'))<>2 THEN RAISE EXCEPTION 'Terms were merged'; END IF;
 IF jsonb_array_length(public.get_student_record((SELECT id FROM adviser_ids WHERE role='student'))->'enrollments')<>2 THEN RAISE EXCEPTION 'Dean records incomplete'; END IF;
END $$;
SELECT public.finalize_enrollment((SELECT id FROM adviser_ids WHERE role='student'),'2098-2099','Summer');
DO $$ BEGIN
 BEGIN UPDATE public.enrollments SET status='dropped' WHERE offering_id=(SELECT id FROM adviser_offerings WHERE kind='summer'); RAISE EXCEPTION 'Locked enrollment changed'; EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
 BEGIN DELETE FROM public.enrollments WHERE offering_id=(SELECT id FROM adviser_offerings WHERE kind='summer'); RAISE EXCEPTION 'Locked enrollment deleted'; EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
 BEGIN UPDATE public.course_offerings SET units=4 WHERE id=(SELECT id FROM adviser_offerings WHERE kind='summer'); RAISE EXCEPTION 'Locked subject units changed'; EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.student_semesters WHERE student_id=(SELECT id FROM adviser_ids WHERE role='student') AND school_year='2098-2099' AND units_enrolled<>3) THEN RAISE EXCEPTION 'Units leaked across semesters'; END IF;
 IF (SELECT count(*) FROM public.instructor_notifications WHERE recipient_id=(SELECT id FROM adviser_ids WHERE role='teacher'))<>2 THEN RAISE EXCEPTION 'Enrollment notifications missing or duplicated'; END IF;
END $$;

-- Assigned teachers can save manual equivalents and finalize complete classes.
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',id,'role','authenticated','aal','aal2')::text,true) FROM adviser_ids WHERE role='teacher';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM public.lock_class_grades((SELECT id FROM adviser_offerings WHERE kind='summer')); RAISE EXCEPTION 'Incomplete class locked'; EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
END $$;
INSERT INTO public.grades(student_id,offering_id,final,equivalent,grade_scale)
SELECT (SELECT id FROM adviser_ids WHERE role='student'),id,1.5,2.75,'school' FROM adviser_offerings WHERE kind='summer';
DO $$ BEGIN
 IF (SELECT equivalent FROM public.grades WHERE offering_id=(SELECT id FROM adviser_offerings WHERE kind='summer'))<>2.75 THEN RAISE EXCEPTION 'Manual Equivalent overwritten'; END IF;
 BEGIN UPDATE public.grades SET equivalent=3.5 WHERE offering_id=(SELECT id FROM adviser_offerings WHERE kind='summer'); RAISE EXCEPTION 'Invalid Equivalent accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
SELECT public.lock_class_grades((SELECT id FROM adviser_offerings WHERE kind='summer'));
DO $$ BEGIN
 BEGIN UPDATE public.grades SET equivalent=1 WHERE offering_id=(SELECT id FROM adviser_offerings WHERE kind='summer'); RAISE EXCEPTION 'Locked grade updated'; EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
 BEGIN PERFORM public.revert_grade((SELECT id FROM public.grade_history WHERE offering_id=(SELECT id FROM adviser_offerings WHERE kind='summer') LIMIT 1),'test'); RAISE EXCEPTION 'Locked grade reverted'; EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
 UPDATE public.instructor_notifications SET read_at=now();
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claims',jsonb_build_object('sub',id,'role','authenticated','aal','aal2')::text,true) FROM adviser_ids WHERE role='other_teacher';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.instructor_notifications)<>0 THEN RAISE EXCEPTION 'Other instructor read notifications'; END IF;
 BEGIN PERFORM public.lock_class_grades((SELECT id FROM adviser_offerings WHERE kind='first')); RAISE EXCEPTION 'Other instructor locked class'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',id,'role','authenticated','aal','aal2')::text,true) FROM adviser_ids WHERE role='admin';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF jsonb_array_length(public.list_student_records())<1 THEN RAISE EXCEPTION 'Admin cannot list students'; END IF;
 PERFORM public.get_student_record((SELECT id FROM adviser_ids WHERE role='student'));
 BEGIN UPDATE public.course_offerings SET grades_locked=false WHERE id=(SELECT id FROM adviser_offerings WHERE kind='summer'); RAISE EXCEPTION 'Finalization silently reversed'; EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
END $$;
SELECT public.set_enrollment_term('2098-2099','Summer',false);
RESET ROLE;
ROLLBACK;
