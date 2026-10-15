-- Test project only; fixtures and semester trigger effects roll back.
BEGIN;
INSERT INTO public.course_offerings(code,title,units,school_year,semester,schedule)
VALUES ('GROUP-PENDING','Grouping pending subject',3,'2998-2999','1st Semester','Mon 09:00-10:30'),
       ('GROUP-ENROLLED','Grouping enrolled subject',1.5,'2998-2999','1st Semester','Wed 11:00-12:30'),
       ('GROUP-OTHER-TERM','Other term subject',9,'2998-2999','2nd Semester',NULL);
INSERT INTO public.enrollments(student_id,offering_id,status)
SELECT p.id,o.id,'enrolled' FROM public.profiles p CROSS JOIN public.course_offerings o
WHERE p.email='student.demo@imcc.edu.ph' AND o.code IN ('GROUP-ENROLLED','GROUP-OTHER-TERM') AND o.school_year='2998-2999';
SELECT set_config('request.jwt.claims',json_build_object('sub',id,'role','authenticated','aal','aal1')::text,true) FROM public.profiles WHERE email='student.demo@imcc.edu.ph';
SET LOCAL ROLE authenticated;
INSERT INTO public.enrollment_requests(student_id,offering_id)
SELECT auth.uid(),id FROM public.course_offerings WHERE code='GROUP-PENDING' AND school_year='2998-2999';
DO $$ BEGIN
 IF public.list_enrollment_requests()<>'[]'::jsonb THEN RAISE EXCEPTION 'Student can see reviewer queue'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims',json_build_object('sub',id,'role','authenticated','aal','aal1')::text,true) FROM public.profiles WHERE email='dean.demo@imcc.edu.ph';
SET LOCAL ROLE authenticated;
DO $$ DECLARE item jsonb; BEGIN
 SELECT v INTO item FROM jsonb_array_elements(public.list_enrollment_requests()) v WHERE v->>'code'='GROUP-PENDING';
 IF item IS NULL THEN RAISE EXCEPTION 'Pending request missing'; END IF;
 IF item->>'student_name'<>'Demo Student' OR item->>'program'<>'BSIT' OR item->>'year_level'<>'1st Year' OR item->>'section'<>'TEST-1A' THEN RAISE EXCEPTION 'Student context missing'; END IF;
 IF item->>'student_id' IS NULL OR item->>'schedule'<>'Mon 09:00-10:30' OR (item->>'units')::numeric<>3 THEN RAISE EXCEPTION 'Subject context missing'; END IF;
 IF (item->>'enrolled_units')::numeric<>1.5 THEN RAISE EXCEPTION 'Enrolled total includes other terms or is wrong'; END IF;
 IF jsonb_array_length(item->'enrolled_courses')<>1 OR item->'enrolled_courses'->0->>'code'<>'GROUP-ENROLLED' THEN RAISE EXCEPTION 'Enrolled subjects missing or wrong term'; END IF;
 PERFORM public.review_enrollment_request((item->>'id')::uuid,'approved',NULL);
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.list_enrollment_requests()) v WHERE v->>'code'='GROUP-PENDING') THEN RAISE EXCEPTION 'Approved subject still pending'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims',json_build_object('sub',id,'role','authenticated','aal','aal1')::text,true) FROM public.profiles WHERE email='teacher.demo@imcc.edu.ph';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF public.list_enrollment_requests()<>'[]'::jsonb THEN RAISE EXCEPTION 'Teacher can see reviewer queue'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
