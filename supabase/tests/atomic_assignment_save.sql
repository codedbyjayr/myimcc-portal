-- Test project only. Existing demo assignments are restored by ROLLBACK.
BEGIN;
SELECT set_config('request.jwt.claims',json_build_object('sub',id,'role','authenticated','aal','aal1')::text,true) FROM public.profiles WHERE email='dean.demo@imcc.edu.ph';
-- Resolve fixture identities before RLS; the dean cannot read other profiles directly.
SELECT set_config('test.assignment_teacher',id::text,true) FROM public.profiles WHERE email='teacher.demo@imcc.edu.ph';
SET LOCAL ROLE authenticated;
DO $$ DECLARE subject_id integer; actor uuid := auth.uid(); teacher uuid := current_setting('test.assignment_teacher')::uuid; BEGIN
 SELECT id INTO STRICT subject_id FROM public.course_offerings WHERE code='TEST101' AND school_year='2026-2027' AND semester='1st Semester';
 UPDATE public.course_offerings SET instructor_id=actor,instructor_name='Demo Dean' WHERE id=subject_id;
 IF (SELECT count(*) FROM public.teacher_assignments WHERE offering_id=subject_id AND is_active)<>1 OR NOT EXISTS(SELECT 1 FROM public.teacher_assignments WHERE offering_id=subject_id AND teacher_id=actor AND is_active) THEN RAISE EXCEPTION 'Reassignment did not atomically activate new instructor and deactivate old'; END IF;
 UPDATE public.course_offerings SET instructor_id=NULL,instructor_name=NULL WHERE id=subject_id;
 IF EXISTS(SELECT 1 FROM public.teacher_assignments WHERE offering_id=subject_id AND is_active) THEN RAISE EXCEPTION 'Unassignment left active access'; END IF;
 UPDATE public.course_offerings SET instructor_id=teacher,instructor_name='Demo Teacher' WHERE id=subject_id;
 BEGIN
  UPDATE public.course_offerings SET instructor_id=gen_random_uuid(),instructor_name='Invalid instructor' WHERE id=subject_id;
  RAISE EXCEPTION 'Invalid instructor unexpectedly saved';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 IF NOT EXISTS(SELECT 1 FROM public.course_offerings WHERE id=subject_id AND instructor_id=teacher AND instructor_name='Demo Teacher') THEN RAISE EXCEPTION 'Failed save changed subject'; END IF;
 IF (SELECT count(*) FROM public.teacher_assignments WHERE offering_id=subject_id AND is_active)<>1 OR NOT EXISTS(SELECT 1 FROM public.teacher_assignments WHERE offering_id=subject_id AND teacher_id=teacher AND is_active) THEN RAISE EXCEPTION 'Failed save changed teacher access'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
