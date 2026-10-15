-- Run on the TEST project only. All writes roll back, including approvals.
BEGIN;
SELECT set_config('request.jwt.claims',json_build_object('sub',id,'role','authenticated','aal','aal1')::text,true) FROM public.profiles WHERE email='student.demo@imcc.edu.ph';
SET LOCAL ROLE authenticated;
INSERT INTO public.enrollment_requests(student_id,offering_id)
SELECT auth.uid(),id FROM public.course_offerings WHERE code IN ('TEST101','TEST102');
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.enrollments WHERE student_id=auth.uid()) THEN RAISE EXCEPTION 'Requests must not enroll'; END IF;
 BEGIN
  INSERT INTO public.enrollments(student_id,offering_id,status) SELECT auth.uid(),id,'enrolled' FROM public.course_offerings WHERE code='TEST101';
  RAISE EXCEPTION 'Student direct enrollment allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  INSERT INTO public.enrollment_requests(student_id,offering_id,status) SELECT auth.uid(),id,'approved' FROM public.course_offerings WHERE code='TEST101';
  RAISE EXCEPTION 'Student self approval allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  INSERT INTO public.enrollment_requests(student_id,offering_id) SELECT auth.uid(),id FROM public.course_offerings WHERE code='TEST101';
  RAISE EXCEPTION 'Duplicate pending request allowed';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 PERFORM set_config('test.approve_request',(SELECT r.id::text FROM public.enrollment_requests r JOIN public.course_offerings o ON o.id=r.offering_id WHERE o.code='TEST101'),true);
 PERFORM set_config('test.reject_request',(SELECT r.id::text FROM public.enrollment_requests r JOIN public.course_offerings o ON o.id=r.offering_id WHERE o.code='TEST102'),true);
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims',json_build_object('sub',id,'role','authenticated','aal','aal1')::text,true) FROM public.profiles WHERE email='teacher.demo@imcc.edu.ph';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.enrollment_requests)<>0 THEN RAISE EXCEPTION 'Other user sees student requests'; END IF;
 IF public.list_enrollment_requests()<>'[]'::jsonb THEN RAISE EXCEPTION 'Teacher sees review queue'; END IF;
 BEGIN
  PERFORM public.review_enrollment_request(current_setting('test.approve_request')::uuid,'approved',NULL);
  RAISE EXCEPTION 'Teacher approved enrollment';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims',json_build_object('sub',id,'role','authenticated','aal','aal1')::text,true) FROM public.profiles WHERE email='dean.demo@imcc.edu.ph';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF jsonb_array_length(public.list_enrollment_requests())<>2 THEN RAISE EXCEPTION 'Dean queue missing requests'; END IF;
 PERFORM public.review_enrollment_request(current_setting('test.approve_request')::uuid,'approved',NULL);
 PERFORM public.review_enrollment_request(current_setting('test.reject_request')::uuid,'rejected',NULL);
 BEGIN
  PERFORM public.review_enrollment_request(current_setting('test.approve_request')::uuid,'approved',NULL);
  RAISE EXCEPTION 'Double approval allowed';
 EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.enrollments e JOIN public.profiles p ON p.id=e.student_id WHERE p.email='student.demo@imcc.edu.ph' AND e.status='enrolled')<>1 THEN RAISE EXCEPTION 'Approval must create exactly one enrollment'; END IF;
 IF (SELECT units_enrolled FROM public.student_semesters s JOIN public.profiles p ON p.id=s.student_id WHERE p.email='student.demo@imcc.edu.ph' AND s.is_current)<>3 THEN RAISE EXCEPTION 'Approved units not reflected'; END IF;
END $$;
ROLLBACK;
