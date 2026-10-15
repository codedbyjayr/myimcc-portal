-- Test fixture correction only. Run once on ycziiezfrwnzouilutum, before manual requests.
BEGIN;
DO $$ BEGIN
 IF (SELECT count(*) FROM auth.users) <> 3 OR
    (SELECT count(*) FROM auth.users WHERE email IN ('student.demo@imcc.edu.ph','teacher.demo@imcc.edu.ph','dean.demo@imcc.edu.ph')) <> 3 THEN
   RAISE EXCEPTION 'Expected the three dummy accounts only';
 END IF;
END $$;
DELETE FROM public.grades WHERE student_id=(SELECT id FROM public.profiles WHERE email='student.demo@imcc.edu.ph') AND offering_id IN (SELECT id FROM public.course_offerings WHERE code IN ('TEST101','TEST102'));
DELETE FROM public.attendance WHERE student_id=(SELECT id FROM public.profiles WHERE email='student.demo@imcc.edu.ph') AND offering_id IN (SELECT id FROM public.course_offerings WHERE code IN ('TEST101','TEST102'));
DELETE FROM public.enrollment_requests WHERE student_id=(SELECT id FROM public.profiles WHERE email='student.demo@imcc.edu.ph') AND offering_id IN (SELECT id FROM public.course_offerings WHERE code IN ('TEST101','TEST102'));
DELETE FROM public.enrollments WHERE student_id=(SELECT id FROM public.profiles WHERE email='student.demo@imcc.edu.ph') AND offering_id IN (SELECT id FROM public.course_offerings WHERE code IN ('TEST101','TEST102'));
DELETE FROM public.installments WHERE student_id=(SELECT id FROM public.profiles WHERE email='student.demo@imcc.edu.ph') AND name='Demo tuition installment';
UPDATE public.billing_summary SET balance=0 WHERE student_id=(SELECT id FROM public.profiles WHERE email='student.demo@imcc.edu.ph');
UPDATE public.student_semesters SET units_enrolled=0,subjects_enrolled=0,balance=0,gwa=NULL WHERE student_id=(SELECT id FROM public.profiles WHERE email='student.demo@imcc.edu.ph');
COMMIT;
