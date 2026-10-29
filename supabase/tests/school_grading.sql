-- Run against an isolated database after the school_grade_entry migration.
BEGIN;
DO $test$
DECLARE
 student uuid := gen_random_uuid();
 teacher uuid := gen_random_uuid();
 offering integer;
 grade uuid;
 history uuid;
 r public.grades;
 v numeric;
BEGIN
 ASSERT public.calculate_equivalent(98)=1.10;
 INSERT INTO auth.users(id,email) VALUES(student,'grade-student@example.invalid'),(teacher,'grade-teacher@example.invalid');
 INSERT INTO public.profiles(id,email,full_name,role,status,is_active)
 VALUES(student,'grade-student@example.invalid','Grade Student','student','approved',true),
 (teacher,'grade-teacher@example.invalid','Grade Teacher','teacher','approved',true)
 ON CONFLICT(id) DO UPDATE SET role=excluded.role,status='approved',is_active=true;
 INSERT INTO public.course_offerings(code,title,units,school_year,semester)
 VALUES('GRADE-CHECK','Grade check',3,'2998-2999','1st Semester') RETURNING id INTO offering;
 INSERT INTO public.enrollments(student_id,offering_id,status) VALUES(student,offering,'enrolled');
 INSERT INTO public.teacher_assignments(teacher_id,offering_id,is_active) VALUES(teacher,offering,true);
 PERFORM set_config('request.jwt.claim.sub',teacher::text,true);
 PERFORM set_config('request.jwt.claims',json_build_object('sub',teacher,'role','authenticated')::text,true);
 INSERT INTO public.grades(student_id,offering_id,prelim,midterm)
 VALUES(student,offering,1.1,2.1) RETURNING id INTO grade;
 SELECT * INTO r FROM public.grades WHERE id=grade;
 ASSERT r.equivalent IS NULL AND r.remark='Pending';
 ASSERT r.ai_predicted_equivalent=1.60 AND r.prediction_method='equal-period-mean-v1' AND r.predicted_at IS NOT NULL;
 UPDATE public.grades SET final=1.0,equivalent=5,remark='Failed' WHERE id=grade;
 SELECT * INTO r FROM public.grades WHERE id=grade;
 ASSERT r.final=1 AND r.equivalent=5 AND r.remark='Failed';
 ASSERT r.ai_predicted_equivalent IS NULL AND r.predicted_at IS NULL;
 SELECT id INTO history FROM public.grade_history WHERE grade_id=grade AND change_type='before_update' ORDER BY created_at DESC LIMIT 1;
 ASSERT (SELECT ai_predicted_equivalent=1.6 AND final IS NULL AND grade_scale='school' FROM public.grade_history WHERE id=history);
 PERFORM public.revert_grade(history,'Check reverting pending school grades');
 SELECT * INTO r FROM public.grades WHERE id=grade;
 ASSERT r.final IS NULL AND r.grade_scale='school' AND r.ai_predicted_equivalent=1.6;
 UPDATE public.grades SET final=4,equivalent=4 WHERE id=grade;
 ASSERT (SELECT remark='Conditional' FROM public.grades WHERE id=grade);
 UPDATE public.grades SET final=5,equivalent=5 WHERE id=grade;
 ASSERT (SELECT remark='Failed' FROM public.grades WHERE id=grade);
 FOREACH v IN ARRAY ARRAY[0,1.11,3.5,4.5,98,'NaN'::numeric] LOOP
   BEGIN
     UPDATE public.grades SET final=v WHERE id=grade;
     RAISE EXCEPTION 'Invalid grade % was accepted',v;
   EXCEPTION WHEN check_violation THEN NULL;
   END;
 END LOOP;
 UPDATE public.grades SET prelim=NULL,midterm=NULL,semifinal=NULL,final=NULL,equivalent=NULL WHERE id=grade;
 ASSERT (SELECT equivalent IS NULL AND ai_predicted_equivalent IS NULL AND remark='Pending' FROM public.grades WHERE id=grade);
 BEGIN
   UPDATE public.grades SET final=1,equivalent=NULL WHERE id=grade;
   RAISE EXCEPTION 'Missing Equivalent accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 BEGIN
   UPDATE public.grades SET final=NULL,equivalent=2 WHERE id=grade;
   RAISE EXCEPTION 'Equivalent without Final accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 UPDATE public.grades SET final=1,equivalent=2.5 WHERE id=grade;
 ASSERT (SELECT final=1 AND equivalent=2.5 AND remark='Passed' FROM public.grades WHERE id=grade);
 UPDATE public.grades SET equivalent=2.75 WHERE id=grade;
 SELECT id INTO history FROM public.grade_history WHERE grade_id=grade AND final=1 AND equivalent=2.5 ORDER BY created_at DESC LIMIT 1;
 ASSERT history IS NOT NULL;
 PERFORM public.revert_grade(history,'Restore manually encoded Equivalent');
 ASSERT (SELECT final=1 AND equivalent=2.5 FROM public.grades WHERE id=grade);
 FOREACH v IN ARRAY ARRAY[0,1.11,3.5,4.5,98,'NaN'::numeric] LOOP
   BEGIN
     UPDATE public.grades SET equivalent=v WHERE id=grade;
     RAISE EXCEPTION 'Invalid Equivalent % was accepted',v;
   EXCEPTION WHEN check_violation THEN NULL;
   END;
 END LOOP;
 -- Reversion is the only permitted write of historical percentage records.
 PERFORM set_config('app.grade_change_type','revert',true);
 UPDATE public.grades SET grade_scale='percentage',final=98,equivalent=1.25,remark='Passed' WHERE id=grade;
 PERFORM set_config('app.grade_change_type','',true);
 BEGIN
   UPDATE public.grades SET final=99 WHERE id=grade;
   RAISE EXCEPTION 'Legacy record was modified';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 ASSERT (SELECT final=98 AND equivalent=1.25 FROM public.grades WHERE id=grade);
 PERFORM set_config('request.jwt.claim.sub',student::text,true);
 PERFORM set_config('request.jwt.claims',json_build_object('sub',student,'role','authenticated')::text,true);
 BEGIN
   PERFORM public.revert_grade(history,'Unauthorized');
   RAISE EXCEPTION 'Student reverted a grade';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END;
$test$;
ROLLBACK;
