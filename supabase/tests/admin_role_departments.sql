-- Fictional identities and all role changes roll back.
BEGIN;
SELECT set_config('request.jwt.claims','{}',true);
UPDATE imcc_review_private.control SET enabled_until=now()+interval '1 hour',retired=false;
CREATE TEMP TABLE role_department_test_ids(kind text,id uuid);
INSERT INTO role_department_test_ids VALUES ('admin',gen_random_uuid()),('staff',gen_random_uuid()),('target',gen_random_uuid());
INSERT INTO auth.users(id,email,raw_user_meta_data)
SELECT id,'role-department-'||id||'@example.invalid',jsonb_build_object('full_name','Role department test') FROM role_department_test_ids;
DO $$
DECLARE s text; caller uuid; target uuid; choice text; actual_role text; actual_department text;
BEGIN
 FOR s IN SELECT unnest(ARRAY['public','imcc_review']) LOOP
  EXECUTE format('INSERT INTO %I.profiles(id,email,full_name,role,status,is_active)
    SELECT id,''role-department-''||id||''@example.invalid'',''Role department test'',CASE WHEN kind=''admin'' THEN ''admin'' ELSE ''staff'' END,''approved'',true
    FROM role_department_test_ids ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role,status=''approved'',is_active=true',s);
 END LOOP;
 SELECT id INTO caller FROM role_department_test_ids WHERE kind='admin';
 SELECT id INTO target FROM role_department_test_ids WHERE kind='target';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',caller,'role','authenticated','aal','aal2')::text,true);
 FOR s IN SELECT unnest(ARRAY['public','imcc_review']) LOOP
  FOREACH choice IN ARRAY ARRAY['staff:Guidance','staff:Cashier','staff:DSA','staff:Laboratory/Nursing Arts/Cybershack','staff:Library','staff:Medical Clinic/Dental','staff:Property Custodian','staff:ROTC/CWTS',
    'dean:CCS','dean:CBA','dean:CAS','dean:CNM','dean:CED','dean:CCSJE','dean:CHTM','dean:CMT','dean:CRT'] LOOP
   EXECUTE format('SELECT %I.set_user_role($1,$2)',s) USING target,choice;
   EXECUTE format('SELECT role,role_department FROM %I.profiles WHERE id=$1',s) INTO actual_role,actual_department USING target;
   IF actual_role<>split_part(choice,':',1) OR actual_department IS DISTINCT FROM split_part(choice,':',2) THEN RAISE EXCEPTION 'Assignment did not persist: %',choice; END IF;
  END LOOP;
  EXECUTE format('SELECT %I.set_user_approval($1,true,$2)',s) USING target,'staff:Library';
  EXECUTE format('SELECT role_department FROM %I.profiles WHERE id=$1 AND status=''approved''',s) INTO actual_department USING target;
  IF actual_department IS DISTINCT FROM 'Library' THEN RAISE EXCEPTION 'Approval lost department'; END IF;
  EXECUTE format('SELECT %I.set_user_role($1,$2)',s) USING target,'teacher';
  EXECUTE format('SELECT role_department FROM %I.profiles WHERE id=$1',s) INTO actual_department USING target;
  IF actual_department IS NOT NULL THEN RAISE EXCEPTION 'Legacy role change must clear department'; END IF;
  BEGIN
   EXECUTE format('SELECT %I.set_user_role($1,$2)',s) USING target,'student:Library';
   RAISE EXCEPTION 'Invalid department accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 END LOOP;
 SELECT id INTO caller FROM role_department_test_ids WHERE kind='staff';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',caller,'role','authenticated','aal','aal2')::text,true);
 FOR s IN SELECT unnest(ARRAY['public','imcc_review']) LOOP
  BEGIN
   EXECUTE format('SELECT %I.set_user_role($1,$2)',s) USING target,'dean:CCS';
   RAISE EXCEPTION 'Non-admin assignment accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
   EXECUTE format('UPDATE %I.profiles SET role_department=''CCS'' WHERE id=$1',s) USING target;
   RAISE EXCEPTION 'Direct non-admin department change accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 END LOOP;
END $$;
ROLLBACK;
