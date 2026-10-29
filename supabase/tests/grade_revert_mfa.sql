BEGIN;
SELECT set_config('request.jwt.claims','{}',true);
INSERT INTO auth.users(id,email) VALUES
 ('11000000-0000-0000-0000-000000000001','mfa-admin@example.invalid'),
 ('11000000-0000-0000-0000-000000000002','mfa-student@example.invalid'),
 ('11000000-0000-0000-0000-000000000003','mfa-teacher@example.invalid');
INSERT INTO public.profiles(id,email,full_name,role,status,is_active) SELECT id,email,'MFA test',
 CASE WHEN email LIKE 'mfa-admin%' THEN 'admin' WHEN email LIKE 'mfa-teacher%' THEN 'teacher' ELSE 'student' END,'approved',true FROM auth.users WHERE email LIKE 'mfa-%@example.invalid'
 ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role,status='approved',is_active=true;
INSERT INTO auth.mfa_factors(id,user_id,status) VALUES('11000000-0000-0000-0000-000000000004','11000000-0000-0000-0000-000000000001','verified');
CREATE TEMP TABLE mfa_offering AS WITH row AS (
 INSERT INTO public.course_offerings(code,title,units,program,year,semester,school_year) VALUES('MFA101','MFA regression',3,'BSIT',1,'Summer','2096-2097') RETURNING id
) SELECT id FROM row;
INSERT INTO public.enrollments(student_id,offering_id,status) SELECT '11000000-0000-0000-0000-000000000002',id,'enrolled' FROM mfa_offering;
INSERT INTO public.grades(student_id,offering_id,grade_scale,final,equivalent) SELECT '11000000-0000-0000-0000-000000000002',id,'school',1.5,2.75 FROM mfa_offering;
UPDATE public.grades SET final=2,equivalent=2.5 WHERE offering_id=(SELECT id FROM mfa_offering);
CREATE TEMP TABLE mfa_history AS SELECT id FROM public.grade_history WHERE offering_id=(SELECT id FROM mfa_offering) AND change_type='initial_entry';
GRANT SELECT ON mfa_history,mfa_offering TO authenticated;
SET LOCAL ROLE authenticated;
DO $$ DECLARE claims jsonb; result jsonb; BEGIN
 FOR claims IN SELECT jsonb_build_object('sub','11000000-0000-0000-0000-000000000001','role','authenticated') || extra FROM (VALUES('{"aal":"aal1"}'::jsonb),('{}'::jsonb)) states(extra) LOOP
  PERFORM set_config('request.jwt.claims',claims::text,true);
  IF current_setting('test.expect_mfa_block',true)='on' THEN
   BEGIN PERFORM public.revert_grade((SELECT id FROM mfa_history LIMIT 1),'MFA denial'); RAISE EXCEPTION 'MFA bypass'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  ELSE
   result:=public.revert_grade((SELECT id FROM mfa_history LIMIT 1),'Before guard reproduction');
   IF (result->>'final')::numeric<>1.5 THEN RAISE EXCEPTION 'Old bypass not reproduced'; END IF;
  END IF;
 END LOOP;
 PERFORM set_config('request.jwt.claims','{"sub":"11000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
 IF current_setting('test.expect_mfa_block',true)='on' AND (SELECT final FROM public.grades WHERE offering_id=(SELECT id FROM mfa_offering))<>2 THEN RAISE EXCEPTION 'Rejected revert changed grades'; END IF;
 IF current_setting('test.expect_mfa_block',true)='on' AND (SELECT count(*) FROM public.grade_history WHERE offering_id=(SELECT id FROM mfa_offering))<>2 THEN RAISE EXCEPTION 'Rejected revert changed history'; END IF;
 result:=public.revert_grade((SELECT id FROM mfa_history LIMIT 1),'Authorized control');
 IF (result->>'final')::numeric<>1.5 OR (result->>'equivalent')::numeric<>2.75 THEN RAISE EXCEPTION 'Authorized revert changed values'; END IF;
 PERFORM set_config('request.jwt.claims','{"sub":"11000000-0000-0000-0000-000000000003","role":"authenticated","aal":"aal2"}',true);
 BEGIN PERFORM public.revert_grade((SELECT id FROM mfa_history LIMIT 1),'Unassigned teacher'); RAISE EXCEPTION 'Unassigned teacher reverted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('request.jwt.claims','{}',true);
 BEGIN PERFORM public.revert_grade((SELECT id FROM mfa_history LIMIT 1),'Anonymous'); RAISE EXCEPTION 'Anonymous revert'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DELETE FROM auth.mfa_factors WHERE user_id='11000000-0000-0000-0000-000000000001';
SELECT set_config('request.jwt.claims','{"sub":"11000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
SELECT public.revert_grade((SELECT id FROM mfa_history LIMIT 1),'Existing no-factor policy');
RESET ROLE;
ROLLBACK;
