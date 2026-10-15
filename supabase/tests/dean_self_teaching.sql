-- Test project only. All fixtures, assignments and role changes roll back.
BEGIN;
CREATE TEMP TABLE self_teaching_ids AS SELECT gen_random_uuid() AS other_dean,
 (SELECT id FROM public.profiles WHERE email='dean.demo@imcc.edu.ph') AS dean,
 (SELECT id FROM public.profiles WHERE email='teacher.demo@imcc.edu.ph') AS teacher;
INSERT INTO auth.users(id,email,raw_user_meta_data) SELECT other_dean,other_dean::text || '@imcc.edu.ph','{}'::jsonb FROM self_teaching_ids;
UPDATE public.profiles SET role='dean',status='approved',is_active=true WHERE id=(SELECT other_dean FROM self_teaching_ids);
GRANT SELECT ON self_teaching_ids TO authenticated;
SELECT set_config('request.jwt.claims',json_build_object('sub',dean,'role','authenticated','aal','aal1')::text,true) FROM self_teaching_ids;
SET LOCAL ROLE authenticated;
DO $$ DECLARE ids record; saved jsonb; offering integer; BEGIN
 SELECT * INTO ids FROM self_teaching_ids;
 IF NOT EXISTS(SELECT 1 FROM public.get_subject_instructor_options() WHERE id=ids.dean) THEN RAISE EXCEPTION 'Own dean missing from options'; END IF;
 IF EXISTS(SELECT 1 FROM public.get_subject_instructor_options() WHERE id=ids.other_dean) THEN RAISE EXCEPTION 'Other dean exposed as self option'; END IF;
 saved:=public.save_course_offering_with_instructor(p_code=>'SELF-TEST',p_title=>'Self teaching check',p_school_year=>'2999-3000',p_instructor_id=>ids.dean);
 offering:=(saved->>'id')::integer;
 IF saved->>'instructor_id'<>ids.dean::text THEN RAISE EXCEPTION 'Self assignment failed on create'; END IF;
 PERFORM public.save_course_offering_with_instructor(p_offering_id=>offering,p_code=>'SELF-TEST',p_title=>'Self teaching check',p_school_year=>'2999-3000',p_instructor_id=>ids.teacher);
 PERFORM public.save_course_offering_with_instructor(p_offering_id=>offering,p_code=>'SELF-TEST',p_title=>'Self teaching check',p_school_year=>'2999-3000',p_instructor_id=>ids.dean);
 IF (SELECT count(*) FROM public.teacher_assignments WHERE offering_id=offering AND is_active)<>1 OR NOT EXISTS(SELECT 1 FROM public.teacher_assignments WHERE offering_id=offering AND teacher_id=ids.dean AND is_active) THEN RAISE EXCEPTION 'Self reassignment not synchronized'; END IF;
 BEGIN
  PERFORM public.save_course_offering_with_instructor(p_offering_id=>offering,p_code=>'SELF-TEST',p_title=>'Self teaching check',p_school_year=>'2999-3000',p_instructor_id=>ids.other_dean);
  RAISE EXCEPTION 'Other dean unexpectedly accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM<>'Select an approved active teacher, faculty member, or yourself' THEN RAISE; END IF;
 END;
END $$;
RESET ROLE;
UPDATE public.profiles SET is_active=false WHERE id=(SELECT dean FROM self_teaching_ids);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.get_subject_instructor_options()) THEN RAISE EXCEPTION 'Inactive dean sees options'; END IF;
 BEGIN
  PERFORM public.save_course_offering_with_instructor(p_code=>'INACTIVE',p_title=>'Must fail',p_instructor_id=>auth.uid());
  RAISE EXCEPTION 'Inactive dean unexpectedly saved';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM<>'Access denied: only approved active deans can assign instructors to course offerings' THEN RAISE; END IF;
 END;
END $$;
RESET ROLE;
ROLLBACK;
