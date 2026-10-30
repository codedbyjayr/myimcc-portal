BEGIN;
SELECT set_config('request.jwt.claims','{}',true);
INSERT INTO public.courses(code,title,program,year_level,semester,lec_units)
VALUES('TEST-STAFF-4','Staff clearance test curriculum','BSIT',4,1,3);
UPDATE imcc_review_private.control SET enabled_until=now()+interval '1 hour',retired=false;
-- The runner tested retirement earlier; restore test access inside this rollback.
GRANT USAGE ON SCHEMA imcc_review,imcc_review_private TO authenticated;
GRANT EXECUTE ON FUNCTION imcc_review.is_admin(),imcc_review.is_mfa_compliant(),imcc_review.get_clearance_workspace(),imcc_review_private.get_clearance_workspace() TO authenticated;
CREATE TEMP TABLE staff_office_ids(kind text,id uuid);
INSERT INTO staff_office_ids VALUES ('staff',gen_random_uuid()),('student',gen_random_uuid()),('admin',gen_random_uuid());
INSERT INTO auth.users(id,email) SELECT id,'staff-office-'||id||'@example.invalid' FROM staff_office_ids;
GRANT SELECT ON staff_office_ids TO authenticated;
DO $$ DECLARE s text; BEGIN
 FOR s IN SELECT unnest(ARRAY['public','imcc_review']) LOOP
  EXECUTE format('INSERT INTO %I.profiles(id,email,full_name,role,status,is_active,role_department,year_level)
    SELECT id,''staff-office-''||id||''@example.invalid'',kind,kind,''approved'',true,CASE WHEN kind=''staff'' THEN ''Guidance'' END,''4th Year''
    FROM staff_office_ids ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role,status=''approved'',is_active=true,role_department=EXCLUDED.role_department,year_level=EXCLUDED.year_level',s);
  EXECUTE format('INSERT INTO %I.clearances(student_id,department_code,department_name,status)
    SELECT id,code,initcap(code),''pending'' FROM staff_office_ids CROSS JOIN unnest(ARRAY[''guidance'',''library'']) code WHERE kind=''student''
    ON CONFLICT(student_id,department_code) DO UPDATE SET status=''pending''',s);
 END LOOP;
END $$;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',id,'role','authenticated','aal','aal2')::text,true) FROM staff_office_ids WHERE kind='staff';
SET LOCAL ROLE authenticated;
DO $$ DECLARE s text; affected integer; BEGIN
 FOR s IN SELECT unnest(ARRAY['public','imcc_review']) LOOP
  EXECUTE format('SELECT count(*) FROM %I.get_clearance_workspace() WHERE student_id=(SELECT id FROM staff_office_ids WHERE kind=''student'') AND department_code=''library'' AND profiles->>''year_level''=''4th Year''',s) INTO affected;
  IF affected<>1 THEN RAISE EXCEPTION 'Other office context or student year is missing'; END IF;
  EXECUTE format('UPDATE %I.clearances SET status=''cleared'' WHERE student_id=(SELECT id FROM staff_office_ids WHERE kind=''student'') AND department_code=''library''',s);
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>0 THEN RAISE EXCEPTION 'Guidance changed Library clearance'; END IF;
  EXECUTE format('UPDATE %I.clearances SET status=''cleared'' WHERE student_id=(SELECT id FROM staff_office_ids WHERE kind=''student'') AND department_code=''guidance''',s);
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 THEN RAISE EXCEPTION 'Guidance cannot approve own clearance'; END IF;
  BEGIN
   EXECUTE format('UPDATE %I.clearances SET department_code=''outside-office'' WHERE student_id=(SELECT id FROM staff_office_ids WHERE kind=''student'') AND department_code=''guidance''',s);
   RAISE EXCEPTION 'Staff moved a clearance outside their office';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  EXECUTE format('DELETE FROM %I.clearances WHERE student_id=(SELECT id FROM staff_office_ids WHERE kind=''student'') AND department_code=''library''',s);
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>0 THEN RAISE EXCEPTION 'Guidance deleted Library clearance'; END IF;
 END LOOP;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
UPDATE public.profiles SET role_department=NULL WHERE id=(SELECT id FROM staff_office_ids WHERE kind='staff');
UPDATE imcc_review.profiles SET role_department=NULL WHERE id=(SELECT id FROM staff_office_ids WHERE kind='staff');
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',id,'role','authenticated','aal','aal2')::text,true) FROM staff_office_ids WHERE kind='staff';
SET LOCAL ROLE authenticated;
DO $$ DECLARE s text; affected integer; BEGIN
 FOR s IN SELECT unnest(ARRAY['public','imcc_review']) LOOP
  EXECUTE format('UPDATE %I.clearances SET status=''pending'' WHERE student_id=(SELECT id FROM staff_office_ids WHERE kind=''student'')',s);
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>0 THEN RAISE EXCEPTION 'Unassigned staff changed a clearance'; END IF;
 END LOOP;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',id,'role','authenticated','aal','aal2')::text,true) FROM staff_office_ids WHERE kind='admin';
SET LOCAL ROLE authenticated;
DO $$ DECLARE s text; affected integer; BEGIN
 FOR s IN SELECT unnest(ARRAY['public','imcc_review']) LOOP
  EXECUTE format('UPDATE %I.clearances SET status=''cleared'' WHERE student_id=(SELECT id FROM staff_office_ids WHERE kind=''student'') AND department_code=''library''',s);
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 THEN RAISE EXCEPTION 'Admin lost clearance access'; END IF;
 END LOOP;
END $$;
RESET ROLE;
ROLLBACK;
