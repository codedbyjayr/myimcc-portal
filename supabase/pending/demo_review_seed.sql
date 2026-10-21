-- Keep the existing Admin UI contracts scoped to the review schema.
CREATE FUNCTION imcc_review.set_user_role(target_id uuid,new_role text) RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT imcc_review.admin_set_profile_access(target_id,new_role,NULL); $$;
CREATE FUNCTION imcc_review.set_user_approval(target_id uuid,approved boolean,approved_role text DEFAULT NULL) RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT imcc_review.admin_set_profile_access(target_id,approved_role,CASE WHEN approved THEN 'approved' ELSE 'rejected' END); $$;
CREATE FUNCTION imcc_review.set_user_active(target_id uuid,active boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF NOT imcc_review.is_admin() OR NOT imcc_review.is_mfa_compliant() THEN RAISE EXCEPTION 'Active demo Admin required' USING ERRCODE='42501'; END IF;
 UPDATE imcc_review.profiles SET is_active=active WHERE id=target_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Demo account not found' USING ERRCODE='P0002'; END IF;
END $$;
REVOKE ALL ON FUNCTION imcc_review.set_user_role(uuid,text),imcc_review.set_user_approval(uuid,boolean,text),imcc_review.set_user_active(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION imcc_review.set_user_role(uuid,text),imcc_review.set_user_approval(uuid,boolean,text),imcc_review.set_user_active(uuid,boolean) TO authenticated;

-- Only the server-side provisioning path can register freshly created demo users.
CREATE FUNCTION public.configure_demo_review(p_accounts jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item record; student uuid; instructor uuid; dean uuid; offering integer;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server only' USING ERRCODE='42501'; END IF;
 PERFORM id FROM imcc_review_private.control WHERE id FOR UPDATE;
 IF (SELECT accounts FROM imcc_review_private.control WHERE id)<>'{}'::jsonb THEN RAISE EXCEPTION 'Already configured'; END IF;
 IF jsonb_typeof(p_accounts)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(p_accounts))<>7 THEN RAISE EXCEPTION 'Invalid demo accounts'; END IF;
 FOR item IN SELECT key,value FROM jsonb_each(p_accounts) LOOP
   IF item.key NOT IN ('student','faculty','dean','admin','registrar','staff','pending') OR length(item.value->>'password')<32
     OR NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=(item.value->>'id')::uuid
       AND u.email=item.value->>'email' AND u.email LIKE 'review.'||item.key||'.%@example.invalid'
       AND u.raw_app_meta_data->>'imcc_review'='true') THEN RAISE EXCEPTION 'Only new review identities are allowed'; END IF;
   IF EXISTS(SELECT 1 FROM public.profiles WHERE id=(item.value->>'id')::uuid AND (role<>'student' OR status<>'onboarding')) THEN
     RAISE EXCEPTION 'Existing school identities cannot be registered';
   END IF;
   UPDATE public.profiles SET is_active=false WHERE id=(item.value->>'id')::uuid;
   INSERT INTO imcc_review.profiles(id,email,full_name,role,status,is_active,program,year_level,section,student_no)
   VALUES((item.value->>'id')::uuid,item.value->>'email','DEMO '||initcap(item.key),
     CASE item.key WHEN 'faculty' THEN 'teacher' WHEN 'pending' THEN 'student' ELSE item.key END,
     CASE item.key WHEN 'pending' THEN 'pending' ELSE 'approved' END,true,'BSIT','1st Year','DEMO','DEMO-'||upper(item.key));
 END LOOP;
 student:=(p_accounts->'student'->>'id')::uuid;
 instructor:=(p_accounts->'faculty'->>'id')::uuid;
 dean:=(p_accounts->'dean'->>'id')::uuid;
 INSERT INTO imcc_review.courses(code,title,year_level,semester,lec_units,lab_units)
 VALUES('DEMO101','Demo Introduction to Computing',1,1,3,0),('DEMO102','Demo Academic Writing',1,1,3,0);
 INSERT INTO imcc_review.course_offerings(code,title,units,program,year,semester,school_year,instructor_id,instructor_name,schedule,enrollment_open)
 VALUES('DEMO101','Demo Introduction to Computing',3,'BSIT',1,'1st Semester','2026-2027',instructor,'DEMO Faculty','Mon 09:00–10:30',true) RETURNING id INTO offering;
 INSERT INTO imcc_review.enrollments(student_id,offering_id,status) VALUES(student,offering,'enrolled');
 INSERT INTO imcc_review.grades(student_id,offering_id,prelim,midterm,grade_scale) VALUES(student,offering,1.5,1.75,'school');
 INSERT INTO imcc_review.course_offerings(code,title,units,program,year,semester,school_year,instructor_id,instructor_name,schedule,enrollment_open)
 VALUES('DEMO102','Demo Academic Writing',3,'BSIT',1,'1st Semester','2026-2027',dean,'DEMO Dean','Tue 09:00–10:30',true) RETURNING id INTO offering;
 INSERT INTO imcc_review.enrollments(student_id,offering_id,status) VALUES(student,offering,'enrolled');
 INSERT INTO imcc_review.course_offerings(code,title,units,program,year,semester,school_year,enrollment_open)
 VALUES('DEMO-SUM','Demo Summer Elective',3,'BSIT',1,'Summer','2026-2027',true);
 INSERT INTO imcc_review.clearances(student_id,department_code,department_name,status)
 VALUES(student,'LIB','Demo Library','pending'),(student,'REG','Demo Registrar','pending');
 INSERT INTO imcc_review.announcements(content) VALUES('DEMO REVIEW: all records in this workspace are fictional.');
 UPDATE imcc_review_private.control SET accounts=p_accounts-'pending' WHERE id;
END $$;
REVOKE ALL ON FUNCTION public.configure_demo_review(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.configure_demo_review(jsonb) TO service_role;
