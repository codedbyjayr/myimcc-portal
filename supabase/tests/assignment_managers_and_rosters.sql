-- Test project only. Permission checks and grade/attendance writes all roll back.
BEGIN;
CREATE TEMP TABLE roster_ids AS SELECT gen_random_uuid() AS dean,gen_random_uuid() AS teacher,gen_random_uuid() AS other_teacher,gen_random_uuid() AS student,gen_random_uuid() AS other_student,NULL::integer AS offering,NULL::integer AS other_offering;
GRANT SELECT ON roster_ids TO authenticated;
INSERT INTO auth.users(id,email,raw_user_meta_data) SELECT id,id::text || '@imcc.edu.ph','{}'::jsonb FROM roster_ids,LATERAL unnest(ARRAY[dean,teacher,other_teacher,student,other_student]) ids(id);
UPDATE public.profiles p SET status='approved',is_active=true,role=CASE WHEN p.id=i.dean THEN 'dean' WHEN p.id IN(i.teacher,i.other_teacher) THEN 'teacher' ELSE 'student' END,full_name=CASE WHEN p.id=i.student THEN 'Roster Student' ELSE p.full_name END FROM roster_ids i WHERE p.id IN(i.dean,i.teacher,i.other_teacher,i.student,i.other_student);
WITH o AS (INSERT INTO public.course_offerings(code,title,units,school_year,semester,instructor_id) SELECT 'ROSTER-A','Roster fixture',3,'2997-2998','1st Semester',teacher FROM roster_ids RETURNING id) UPDATE roster_ids SET offering=(SELECT id FROM o);
WITH o AS (INSERT INTO public.course_offerings(code,title,units,school_year,semester,instructor_id) SELECT 'ROSTER-B','Other roster fixture',3,'2997-2998','1st Semester',other_teacher FROM roster_ids RETURNING id) UPDATE roster_ids SET other_offering=(SELECT id FROM o);
INSERT INTO public.enrollments(student_id,offering_id,status) SELECT student,offering,'enrolled' FROM roster_ids UNION ALL SELECT other_student,other_offering,'enrolled' FROM roster_ids;
SELECT set_config('request.jwt.claims',json_build_object('sub',teacher,'role','authenticated','aal','aal1')::text,true) FROM roster_ids;
SET LOCAL ROLE authenticated;
DO $$ DECLARE i record; changed integer; person jsonb; BEGIN
 SELECT * INTO i FROM roster_ids;
 IF (SELECT count(*) FROM public.get_class_roster(i.offering))<>1 THEN RAISE EXCEPTION 'Assigned teacher roster missing'; END IF;
 SELECT profiles INTO person FROM public.get_class_roster(i.offering);
 IF person->>'full_name'<>'Roster Student' OR (SELECT count(*) FROM jsonb_object_keys(person))<>4 OR person ? 'email' THEN RAISE EXCEPTION 'Roster fields incorrect or excessive'; END IF;
 IF EXISTS(SELECT 1 FROM public.get_class_roster(i.other_offering)) OR EXISTS(SELECT 1 FROM public.get_dean_student_directory()) THEN RAISE EXCEPTION 'Teacher sees another scope'; END IF;
 IF EXISTS(SELECT 1 FROM public.profiles WHERE id=i.student) THEN RAISE EXCEPTION 'Full student profile exposed'; END IF;
 UPDATE public.course_offerings SET instructor_id=i.teacher WHERE id=i.other_offering; GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>0 THEN RAISE EXCEPTION 'Teacher stole offering'; END IF;
 UPDATE public.course_offerings SET instructor_id=NULL WHERE id=i.offering; GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>0 THEN RAISE EXCEPTION 'Teacher unassigned subject'; END IF;
 UPDATE public.course_offerings SET semester='2nd Semester' WHERE id=i.offering; GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>0 THEN RAISE EXCEPTION 'Teacher changed assignment through term'; END IF;
 DELETE FROM public.course_offerings WHERE id=i.offering; GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>0 THEN RAISE EXCEPTION 'Teacher deleted offering'; END IF;
 BEGIN
  INSERT INTO public.course_offerings(code,title,school_year,instructor_id) VALUES('FORBIDDEN','Must fail','2997-2998',i.teacher);
  RAISE EXCEPTION 'Teacher created subject';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 UPDATE public.teacher_assignments SET teacher_id=i.teacher WHERE offering_id=i.other_offering; GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>0 THEN RAISE EXCEPTION 'Teacher stole assignment directly'; END IF;
 INSERT INTO public.grades(student_id,offering_id,prelim,graded_by) VALUES(i.student,i.offering,85,auth.uid());
 INSERT INTO public.attendance(student_id,offering_id,date,status,marked_by) VALUES(i.student,i.offering,'2997-01-01','present',auth.uid());
 BEGIN
  INSERT INTO public.grades(student_id,offering_id,prelim,graded_by) VALUES(i.other_student,i.other_offering,85,auth.uid());
  RAISE EXCEPTION 'Teacher graded another class';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims',json_build_object('sub',dean,'role','authenticated','aal','aal1')::text,true) FROM roster_ids;
SET LOCAL ROLE authenticated;
DO $$ DECLARE i record; changed integer; BEGIN
 SELECT * INTO i FROM roster_ids;
 IF NOT EXISTS(SELECT 1 FROM public.get_dean_student_directory() WHERE id=i.student) OR (SELECT count(*) FROM public.get_class_roster(i.other_offering))<>1 THEN RAISE EXCEPTION 'Dean student access missing'; END IF;
 IF EXISTS(SELECT 1 FROM public.profiles WHERE id=i.student) THEN RAISE EXCEPTION 'Dean received full profiles'; END IF;
 UPDATE public.course_offerings SET instructor_id=i.other_teacher WHERE id=i.offering; GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>1 THEN RAISE EXCEPTION 'Dean reassignment blocked'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims',json_build_object('sub',teacher,'role','authenticated','aal','aal1')::text,true) FROM roster_ids;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.get_class_roster((SELECT offering FROM roster_ids))) THEN RAISE EXCEPTION 'Previous teacher retained roster access'; END IF;
END $$;
RESET ROLE;
UPDATE public.profiles SET is_active=false WHERE id=(SELECT dean FROM roster_ids);
SELECT set_config('request.jwt.claims',json_build_object('sub',dean,'role','authenticated','aal','aal1')::text,true) FROM roster_ids;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.get_dean_student_directory()) OR EXISTS(SELECT 1 FROM public.get_class_roster((SELECT offering FROM roster_ids))) THEN RAISE EXCEPTION 'Inactive dean retained access'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims',json_build_object('sub',student,'role','authenticated','aal','aal1')::text,true) FROM roster_ids;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.get_dean_student_directory()) OR EXISTS(SELECT 1 FROM public.get_class_roster((SELECT offering FROM roster_ids))) THEN RAISE EXCEPTION 'Student can read staff roster'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF has_function_privilege('anon','public.get_class_roster(integer)','EXECUTE') OR has_function_privilege('anon','public.get_dean_student_directory()','EXECUTE') THEN RAISE EXCEPTION 'Anonymous RPC access granted'; END IF;
END $$;
ROLLBACK;
