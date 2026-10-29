-- Fictional fixtures only. Run in a disposable database, never production.
BEGIN;
SELECT set_config('request.jwt.claims','{}',true);
CREATE TEMP TABLE boundary_ids(kind text,id uuid);
INSERT INTO boundary_ids VALUES
 ('student','20000000-0000-0000-0000-000000000001'),
 ('teacher','20000000-0000-0000-0000-000000000002'),
 ('other_teacher','20000000-0000-0000-0000-000000000003'),
 ('admin','20000000-0000-0000-0000-000000000004'),
 ('pending','20000000-0000-0000-0000-000000000005');
GRANT SELECT ON boundary_ids TO authenticated,service_role;
INSERT INTO auth.users(id,email,raw_user_meta_data)
SELECT id,kind||'@example.invalid','{}' FROM boundary_ids;
INSERT INTO public.profiles(id,email,full_name,role,status,is_active,program,year_level)
SELECT id,kind||'@example.invalid',kind,CASE WHEN kind IN ('pending','student') THEN 'student' WHEN kind='other_teacher' THEN 'teacher' ELSE kind END,
 CASE WHEN kind='pending' THEN 'onboarding' ELSE 'approved' END,true,'BSIT','1st Year' FROM boundary_ids
ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role,status=EXCLUDED.status,is_active=true;
CREATE TEMP TABLE boundary_offerings(kind text,id integer);
GRANT SELECT ON boundary_offerings TO authenticated;
WITH inserted AS (
 INSERT INTO public.course_offerings(code,title,units,program,year,school_year,semester,instructor_id,instructor_name,enrollment_open)
 SELECT 'BOUND-'||kind,kind,3,'BSIT',1,'2097-2098','1st Semester',id,kind,true FROM boundary_ids WHERE kind IN ('teacher','other_teacher') RETURNING id,title
) INSERT INTO boundary_offerings SELECT title,id FROM inserted;
INSERT INTO public.enrollments(student_id,offering_id,status)
SELECT s.id,o.id,'enrolled' FROM boundary_ids s,boundary_offerings o WHERE s.kind='student' AND o.kind='teacher';
INSERT INTO public.enrollments(student_id,offering_id,status)
SELECT s.id,o.id,'completed' FROM boundary_ids s,boundary_offerings o WHERE s.kind='pending' AND o.kind='other_teacher';
INSERT INTO public.attendance(student_id,offering_id,date,status)
SELECT e.student_id,e.offering_id,'2097-08-01','present' FROM public.enrollments e
WHERE e.offering_id IN (SELECT id FROM boundary_offerings);
INSERT INTO public.clearances(student_id,department_code,department_name,status)
SELECT id,'BOUND','Boundary department','pending' FROM boundary_ids WHERE kind='student';
INSERT INTO public.grades(student_id,offering_id,grade_scale,final,equivalent)
SELECT s.id,o.id,'school',2,2 FROM boundary_ids s,boundary_offerings o WHERE s.kind='student' AND o.kind='teacher';
CREATE TEMP TABLE boundary_history AS SELECT id FROM public.grade_history WHERE student_id=(SELECT id FROM boundary_ids WHERE kind='student');
GRANT SELECT ON boundary_history TO authenticated;

-- Eight complete meetings exceed the old 300-mark frontend limit.
CREATE TEMP TABLE history_students AS SELECT md5('history-student-'||n)::uuid id FROM generate_series(1,39) n;
INSERT INTO auth.users(id,email,raw_user_meta_data) SELECT id,id||'@example.invalid','{}' FROM history_students;
UPDATE public.profiles p SET status='approved',is_active=true FROM history_students s WHERE p.id=s.id;
INSERT INTO public.enrollments(student_id,offering_id,status)
SELECT s.id,o.id,'enrolled' FROM history_students s,boundary_offerings o WHERE o.kind='teacher';
INSERT INTO public.attendance(student_id,offering_id,date,status)
SELECT s.id,o.id,'2097-09-01'::date+d,'present'
FROM (SELECT id FROM history_students UNION ALL SELECT id FROM boundary_ids WHERE kind='student') s,
 boundary_offerings o,generate_series(0,7) d WHERE o.kind='teacher';
INSERT INTO public.clearances(student_id,department_code,department_name,status)
SELECT s.id,'PAGED-'||n,'Paged department','pending' FROM boundary_ids s,generate_series(1,1206) n WHERE s.kind='student';

-- Onboarding grants do not grant self-approval.
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',id,'role','authenticated','aal','aal2')::text,true) FROM boundary_ids WHERE kind='pending';
SET LOCAL ROLE authenticated;
UPDATE public.profiles SET requested_role='teacher',id_number='BOUND-ID',updated_at=now() WHERE id=auth.uid();
DO $$ BEGIN
 IF (SELECT status FROM public.profiles WHERE id=auth.uid())<>'pending' THEN RAISE EXCEPTION 'Onboarding did not submit'; END IF;
 BEGIN UPDATE public.profiles SET role='admin' WHERE id=auth.uid(); RAISE EXCEPTION 'Self-promotion allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.set_user_role(auth.uid(),'admin'); RAISE EXCEPTION 'Non-admin role RPC allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claims',jsonb_build_object('sub',id,'role','authenticated','aal','aal2')::text,true) FROM boundary_ids WHERE kind='admin';
SET LOCAL ROLE authenticated;
SELECT public.set_user_approval((SELECT id FROM boundary_ids WHERE kind='pending'),true,'registrar');
SELECT public.set_user_active((SELECT id FROM boundary_ids WHERE kind='pending'),false);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=(SELECT id FROM boundary_ids WHERE kind='pending') AND role='registrar' AND is_active=false) THEN RAISE EXCEPTION 'Suspension lost role'; END IF;
 BEGIN PERFORM public.set_user_active(auth.uid(),NULL); RAISE EXCEPTION 'NULL active accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
SELECT public.set_user_active((SELECT id FROM boundary_ids WHERE kind='pending'),true);
DO $$ BEGIN
 BEGIN
  INSERT INTO public.attendance(student_id,offering_id,date,status)
  SELECT s.id,o.id,'2097-08-02','present' FROM boundary_ids s,boundary_offerings o WHERE s.kind='student' AND o.kind='other_teacher';
  RAISE EXCEPTION 'Attendance accepted without enrollment';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 BEGIN
  UPDATE public.attendance SET offering_id=(SELECT id FROM boundary_offerings WHERE kind='other_teacher')
  WHERE student_id=(SELECT id FROM boundary_ids WHERE kind='student');
  RAISE EXCEPTION 'Attendance moved to an unenrolled class';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
END $$;
UPDATE public.attendance SET status='excused' WHERE student_id=(SELECT id FROM boundary_ids WHERE kind='pending');
RESET ROLE;

-- Enrolled students can evaluate their instructor, not arbitrary instructors/terms.
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',id,'role','authenticated','aal','aal2')::text,true) FROM boundary_ids WHERE kind='student';
SET LOCAL ROLE authenticated;
INSERT INTO public.faculty_evaluations(student_id,instructor_id,instructor_name,school_year,semester,teaching_clarity,knowledge,availability,fairness,punctuality)
SELECT auth.uid(),id,'teacher','2097-2098','1st Semester',5,5,5,5,5 FROM boundary_ids WHERE kind='teacher';
DO $$ BEGIN
 BEGIN
  INSERT INTO public.faculty_evaluations(student_id,instructor_id,instructor_name,school_year,semester,teaching_clarity,knowledge,availability,fairness,punctuality)
  SELECT auth.uid(),id,'other','2097-2098','1st Semester',5,5,5,5,5 FROM boundary_ids WHERE kind='other_teacher';
  RAISE EXCEPTION 'Unenrolled evaluation accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  INSERT INTO public.faculty_evaluations(student_id,instructor_id,instructor_name,school_year,semester,teaching_clarity,knowledge,availability,fairness,punctuality)
  SELECT auth.uid(),id,'teacher','2096-2097','1st Semester',5,5,5,5,5 FROM boundary_ids WHERE kind='teacher';
  RAISE EXCEPTION 'Wrong-term evaluation accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  INSERT INTO public.messages(sender_id,recipient_id,body) VALUES(auth.uid(),auth.uid(),'unapproved channel');
  RAISE EXCEPTION 'Student-to-student message accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
INSERT INTO public.messages(sender_id,recipient_id,body)
SELECT auth.uid(),id,'Office question' FROM boundary_ids WHERE kind='teacher';
RESET ROLE;

-- Teachers retain assigned attendance and anonymous summaries, not identified evaluations.
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',id,'role','authenticated','aal','aal2')::text,true) FROM boundary_ids WHERE kind='teacher';
SET LOCAL ROLE authenticated;
DO $$ DECLARE affected integer; BEGIN
 BEGIN PERFORM public.get_clearance_workspace(); RAISE EXCEPTION 'Teacher read clearance workspace'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF (SELECT count(*) FROM public.attendance WHERE date='2097-08-01')<>1 THEN RAISE EXCEPTION 'Attendance scope incorrect'; END IF;
 IF (SELECT count(*) FROM public.get_attendance_history(ARRAY(SELECT id FROM boundary_offerings)) WHERE date>='2097-09-01' AND present=40)<>8 THEN
  RAISE EXCEPTION 'Attendance totals were truncated or unauthorized classes included';
 END IF;
 IF EXISTS(SELECT 1 FROM public.get_attendance_history(ARRAY(SELECT id FROM boundary_offerings)) WHERE offering_id=(SELECT id FROM boundary_offerings WHERE kind='other_teacher')) THEN
  RAISE EXCEPTION 'Attendance summary bypassed assignment access';
 END IF;
 IF EXISTS(SELECT 1 FROM public.get_attendance_history(ARRAY[]::integer[])) THEN RAISE EXCEPTION 'Empty class selection returned history'; END IF;
 IF EXISTS(SELECT 1 FROM public.faculty_evaluations WHERE school_year='2097-2098') THEN RAISE EXCEPTION 'Teacher read student identities'; END IF;
 IF (SELECT count(*) FROM public.instructor_evaluation_summary WHERE school_year='2097-2098' AND total_evaluations=1)<>1 THEN RAISE EXCEPTION 'Teacher lost summary'; END IF;
 UPDATE public.enrollments SET status='dropped' WHERE student_id=(SELECT id FROM boundary_ids WHERE kind='student');
 GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>0 THEN RAISE EXCEPTION 'Teacher modified enrollments'; END IF;
 BEGIN UPDATE public.messages SET body='rewritten' WHERE recipient_id=auth.uid(); RAISE EXCEPTION 'Recipient altered message'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
UPDATE public.messages SET is_read=true,read_at=now() WHERE recipient_id=auth.uid();
RESET ROLE;

-- A verified MFA factor requires AAL2 even through owner-privileged functions.
SELECT set_config('request.jwt.claims','{}',true);
INSERT INTO auth.mfa_factors(id,user_id,status) SELECT gen_random_uuid(),id,'verified' FROM boundary_ids WHERE kind='admin';
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',id,'role','authenticated','aal','aal1')::text,true) FROM boundary_ids WHERE kind='admin';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM public.admin_set_profile_access((SELECT id FROM boundary_ids WHERE kind='pending'),'admin',NULL); RAISE EXCEPTION 'AAL1 admin changed access'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF EXISTS(SELECT 1 FROM public.enrollments) OR EXISTS(SELECT 1 FROM public.faculty_evaluations) OR EXISTS(SELECT 1 FROM public.teacher_assignments) THEN
  RAISE EXCEPTION 'AAL1 admin read MFA-protected records';
 END IF;
 BEGIN
  INSERT INTO public.enrollments(student_id,offering_id,status)
  SELECT s.id,o.id,'enrolled' FROM boundary_ids s,boundary_offerings o WHERE s.kind='student' AND o.kind='other_teacher';
  RAISE EXCEPTION 'AAL1 admin wrote enrollment';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.revert_grade((SELECT id FROM boundary_history LIMIT 1),'MFA test');
  RAISE EXCEPTION 'AAL1 admin reverted grade';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',id,'role','authenticated','aal','aal2')::text,true) FROM boundary_ids WHERE kind='admin';
SET LOCAL ROLE authenticated;
SELECT public.set_user_role((SELECT id FROM boundary_ids WHERE kind='pending'),'staff');
RESET ROLE;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',id,'role','authenticated','aal','aal2')::text,true) FROM boundary_ids WHERE kind='pending';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.get_clearance_workspace() c WHERE c.department_code='BOUND' AND c.profiles->>'full_name'='student') THEN
  RAISE EXCEPTION 'Staff cannot see clearance display fields';
 END IF;
 IF (SELECT count(*) FROM (SELECT c.id FROM public.get_clearance_workspace() c WHERE c.department_code LIKE 'PAGED-%' ORDER BY c.id LIMIT 500 OFFSET 1000) page)<>206 THEN
  RAISE EXCEPTION 'Clearance workspace cannot page beyond 1,000 rows';
 END IF;
 IF EXISTS(SELECT 1 FROM public.profiles WHERE id=(SELECT id FROM boundary_ids WHERE kind='student')) THEN
  RAISE EXCEPTION 'Clearance workspace broadened profile access';
 END IF;
END $$;
RESET ROLE;

-- The limiter is shared across workers and callable only by the service role.
SET LOCAL ROLE service_role;
DO $$ DECLARE i integer; uid uuid; BEGIN
 SELECT id INTO uid FROM boundary_ids WHERE kind='student';
 FOR i IN 1..10 LOOP IF NOT public.consume_faq_request(uid) THEN RAISE EXCEPTION 'Request allowance rejected'; END IF; END LOOP;
 IF public.consume_faq_request(uid) THEN RAISE EXCEPTION 'Rate limit bypassed'; END IF;
END $$;
RESET ROLE;
UPDATE private.faq_rate_limits SET window_start=now()-interval '2 minutes';
SET LOCAL ROLE service_role;
DO $$ BEGIN IF NOT public.consume_faq_request((SELECT id FROM boundary_ids WHERE kind='student')) THEN RAISE EXCEPTION 'Rate window did not reset'; END IF; END $$;
RESET ROLE;
DO $$ BEGIN
 IF has_function_privilege('authenticated','public.consume_faq_request(uuid)','execute') THEN RAISE EXCEPTION 'Caller can bypass limiter attribution'; END IF;
 IF has_function_privilege('anon','public.get_attendance_history(integer[])','execute') THEN RAISE EXCEPTION 'Anonymous attendance summary exposed'; END IF;
 IF public.portal_release_ready() IS DISTINCT FROM 'semester-v3' THEN RAISE EXCEPTION 'Release contract incomplete'; END IF;
END $$;
ROLLBACK;
