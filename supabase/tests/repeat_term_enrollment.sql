BEGIN;
SET LOCAL search_path = public, extensions;
SELECT set_config('request.jwt.claims', '{}', true);
INSERT INTO auth.users(id, email) VALUES ('29000000-0000-0000-0000-000000000001', 'repeat-enrollment@example.invalid');
INSERT INTO public.profiles(id,email,full_name,role,status,is_active,program,year_level)
VALUES ('29000000-0000-0000-0000-000000000001','repeat-enrollment@example.invalid','Enrollment Check','student','approved',true,'BSIT','1st Year')
ON CONFLICT(id) DO UPDATE SET role='student',status='approved',is_active=true,program='BSIT',year_level='1st Year';
CREATE TEMP TABLE repeat_offerings(kind text, id integer);
WITH rows AS (
  INSERT INTO public.course_offerings(code,title,units,year,semester,school_year,enrollment_open)
  VALUES ('REPEAT-OLD','Existing subject',3,1,'1st Semester','2091-2092',true),
         ('REPEAT-SAME','Another subject',3,1,'1st Semester','2091-2092',true),
         ('REPEAT-NEXT','Next semester',3,1,'2nd Semester','2091-2092',true),
         ('REPEAT-YEAR','Next year',3,1,'1st Semester','2092-2093',true)
  RETURNING code,id
) INSERT INTO repeat_offerings SELECT code,id FROM rows;
INSERT INTO public.enrollments(student_id,offering_id,status)
SELECT '29000000-0000-0000-0000-000000000001',id,'enrolled' FROM repeat_offerings WHERE kind='REPEAT-OLD';
GRANT SELECT ON repeat_offerings TO authenticated;
SELECT set_config('request.jwt.claims','{"sub":"29000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    INSERT INTO public.enrollment_requests(student_id,offering_id)
    SELECT auth.uid(),id FROM repeat_offerings WHERE kind='REPEAT-SAME';
    RAISE EXCEPTION 'Repeat semester enrollment was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
INSERT INTO public.enrollment_requests(student_id,offering_id)
SELECT auth.uid(),id FROM repeat_offerings WHERE kind IN ('REPEAT-NEXT','REPEAT-YEAR');
RESET ROLE;
UPDATE public.enrollments SET status='completed' WHERE student_id='29000000-0000-0000-0000-000000000001';
-- Exercise legacy school-year punctuation without changing existing production data.
ALTER TABLE public.course_offerings DISABLE TRIGGER USER;
UPDATE public.course_offerings SET school_year='2091–2092' WHERE id=(SELECT id FROM repeat_offerings WHERE kind='REPEAT-SAME');
ALTER TABLE public.course_offerings ENABLE TRIGGER USER;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    INSERT INTO public.enrollment_requests(student_id,offering_id)
    SELECT auth.uid(),id FROM repeat_offerings WHERE kind='REPEAT-SAME';
    RAISE EXCEPTION 'Completed semester or legacy year punctuation bypassed the guard';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
UPDATE public.enrollments SET status='dropped' WHERE student_id='29000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
INSERT INTO public.enrollment_requests(student_id,offering_id)
SELECT auth.uid(),id FROM repeat_offerings WHERE kind='REPEAT-SAME';
ROLLBACK;
