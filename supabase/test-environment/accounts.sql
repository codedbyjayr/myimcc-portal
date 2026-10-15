-- Test project only: ycziiezfrwnzouilutum. Existing passwords are not changed.
DO $$
BEGIN
  IF (SELECT count(*) FROM auth.users) <> 3
     OR (SELECT count(*) FROM auth.users WHERE email IN
       ('student.demo@imcc.edu.ph','teacher.demo@imcc.edu.ph','dean.demo@imcc.edu.ph')
       AND email_confirmed_at IS NOT NULL) <> 3 THEN
    RAISE EXCEPTION 'Expected exactly three confirmed dummy users in the test project';
  END IF;
END;
$$;

UPDATE public.profiles
SET role=CASE email WHEN 'teacher.demo@imcc.edu.ph' THEN 'teacher'
                    WHEN 'dean.demo@imcc.edu.ph' THEN 'dean' ELSE 'student' END,
    full_name=CASE email WHEN 'teacher.demo@imcc.edu.ph' THEN 'Demo Teacher'
                        WHEN 'dean.demo@imcc.edu.ph' THEN 'Demo Dean' ELSE 'Demo Student' END,
    status='approved',is_active=true,requested_role=NULL,program='BSIT'
WHERE email IN ('student.demo@imcc.edu.ph','teacher.demo@imcc.edu.ph','dean.demo@imcc.edu.ph');
UPDATE public.profiles SET student_no='TEST-0001',year_level='1st Year',section='TEST-1A'
WHERE email='student.demo@imcc.edu.ph';

UPDATE public.course_offerings co
SET instructor_id=p.id,instructor_name=p.full_name,
    schedule=CASE co.code WHEN 'TEST101' THEN 'Mon 09:00-10:30' ELSE 'Wed 11:00-12:30' END
FROM public.profiles p
WHERE (co.code='TEST101' AND p.email='teacher.demo@imcc.edu.ph')
   OR (co.code='TEST102' AND p.email='dean.demo@imcc.edu.ph');

INSERT INTO public.timetable(offering_id,day_of_week,start_time,end_time,room_id,teacher_id)
SELECT co.id,CASE co.code WHEN 'TEST101' THEN 'Mon' ELSE 'Wed' END,
       CASE co.code WHEN 'TEST101' THEN '09:00'::time ELSE '11:00'::time END,
       CASE co.code WHEN 'TEST101' THEN '10:30'::time ELSE '12:30'::time END,
       r.id,co.instructor_id
FROM public.course_offerings co CROSS JOIN public.rooms r
WHERE co.code IN ('TEST101','TEST102') AND r.name='TEST-101'
ON CONFLICT(offering_id,day_of_week,start_time) DO NOTHING;

-- Students start without enrollments, grades, attendance or fictional balances.

INSERT INTO public.grading_scale(equivalent,percentage_min,percentage_max,description,category,is_passing)
VALUES (1,96,100,'Excellent','Excellent',true),(1.25,94,95.99,'Excellent','Excellent',true),
(1.5,92,93.99,'Very good','Very good',true),(1.75,89,91.99,'Very good','Very good',true),
(2,86,88.99,'Good','Good',true),(2.25,83,85.99,'Good','Good',true),
(2.5,80,82.99,'Satisfactory','Satisfactory',true),(2.75,76,79.99,'Satisfactory','Satisfactory',true),
(3,75,75.99,'Passing','Passing',true),(5,0,74.99,'Failed','Failed',false)
ON CONFLICT(equivalent) DO NOTHING;

