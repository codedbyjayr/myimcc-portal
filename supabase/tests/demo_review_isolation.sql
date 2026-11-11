BEGIN;
SET LOCAL search_path=public,extensions;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
CREATE TEMP TABLE review_test_accounts AS
 SELECT role,('20000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid id,
 'review.'||role||'.fixture@example.invalid' email
 FROM unnest(ARRAY['student','faculty','dean','admin','registrar','staff','pending']) WITH ORDINALITY t(role,n);
INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data)
 SELECT id,email,jsonb_build_object('full_name','DEMO '||role),'{"imcc_review":true}'::jsonb FROM review_test_accounts;
SELECT public.configure_demo_review((SELECT jsonb_object_agg(role,jsonb_build_object('id',id,'email',email,'password',repeat('x',40))) FROM review_test_accounts));
UPDATE imcc_review_private.control SET enabled_until=now()+interval '1 hour';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.profiles WHERE id IN (SELECT id FROM review_test_accounts) AND (role<>'student' OR is_active)) THEN RAISE EXCEPTION 'Demo accounts received real school privileges'; END IF;
 IF EXISTS(SELECT 1 FROM public.course_offerings WHERE code LIKE 'DEMO%') THEN RAISE EXCEPTION 'Demo courses entered real tables'; END IF;
 IF EXISTS(SELECT 1 FROM public.enrollments WHERE student_id IN (SELECT id FROM review_test_accounts)) THEN RAISE EXCEPTION 'Demo enrollment entered real tables'; END IF;
 IF (SELECT count(*) FROM imcc_review.profiles)<>7 THEN RAISE EXCEPTION 'Missing fictional profiles'; END IF;
 IF (SELECT count(*) FROM imcc_review.instructor_notifications)<>2 THEN RAISE EXCEPTION 'Demo enrollment notification missing'; END IF;
 IF EXISTS(SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace JOIN pg_class r ON r.oid=c.confrelid JOIN pg_namespace rn ON rn.oid=r.relnamespace WHERE n.nspname='imcc_review' AND rn.nspname='public') THEN RAISE EXCEPTION 'Demo foreign key crosses into school records'; END IF;
END $$;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',id,'role','authenticated','aal','aal2')::text,true) FROM review_test_accounts WHERE role='dean';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF jsonb_array_length(imcc_review.list_student_records())<>2 THEN RAISE EXCEPTION 'Demo Dean cannot view fictional students'; END IF;
 BEGIN PERFORM imcc_review.get_registrar_clearance_workspace(); RAISE EXCEPTION 'Demo Dean read Registrar clearances'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.admin_set_profile_access(auth.uid(),'admin',null); RAISE EXCEPTION 'Demo Dean gained real account management'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',id,'role','authenticated','aal','aal2')::text,true) FROM review_test_accounts WHERE role='registrar';
SET LOCAL ROLE authenticated;
DO $$ DECLARE published jsonb; BEGIN
 published:=imcc_review.publish_summer_offering(
   (SELECT id FROM imcc_review.course_offerings WHERE code LIKE 'DEMO%' ORDER BY id LIMIT 1),
   '2097-2098', 'Demo schedule'
 );
 IF NOT EXISTS (
   SELECT 1 FROM imcc_review.course_offerings
   WHERE id=(published->>'id')::integer AND semester='Summer' AND school_year='2097-2098'
     AND schedule='Demo schedule' AND instructor_id IS NULL AND NOT enrollment_open
 ) THEN RAISE EXCEPTION 'Demo Registrar could not publish an isolated Summer offering'; END IF;
 IF NOT EXISTS (
   SELECT 1 FROM imcc_review.get_registrar_clearance_workspace()
   WHERE student_id='20000000-0000-0000-0000-000000000001'
     AND department_code='REG' AND profiles->>'full_name'='DEMO Student'
     AND clearances @> '[{"department_code":"LIB"}]'::jsonb
 ) THEN RAISE EXCEPTION 'Demo Registrar clearance workspace missing fictional student or office'; END IF;
 UPDATE imcc_review.clearances SET status='cleared', cleared_at=now()
 WHERE student_id='20000000-0000-0000-0000-000000000001' AND department_code='REG' AND status='pending';
 IF NOT EXISTS (SELECT 1 FROM imcc_review.get_registrar_clearance_workspace() WHERE department_code='REG' AND status='cleared')
 THEN RAISE EXCEPTION 'Demo Registrar cannot clear the fictional requirement'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM public.course_offerings WHERE code LIKE 'DEMO%' OR (semester='Summer' AND school_year='2097-2098'))
 THEN RAISE EXCEPTION 'Demo Summer offering entered real tables'; END IF;
END $$;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',id,'role','authenticated','aal','aal2')::text,true) FROM review_test_accounts WHERE role='admin';
SET LOCAL ROLE authenticated;
SELECT imcc_review.set_user_approval((SELECT id FROM imcc_review.profiles WHERE full_name='DEMO Pending'),true,'student');
SELECT imcc_review.set_user_role((SELECT id FROM imcc_review.profiles WHERE full_name='DEMO Pending'),'registrar');
SELECT imcc_review.set_user_active((SELECT id FROM imcc_review.profiles WHERE full_name='DEMO Pending'),false);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM imcc_review.profiles WHERE full_name='DEMO Pending' AND role='registrar' AND status='approved' AND NOT is_active) THEN RAISE EXCEPTION 'Demo Admin account workflow failed'; END IF;
END $$;
RESET ROLE;
UPDATE imcc_review_private.control SET enabled_until=now()-interval '1 minute';
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',id,'role','authenticated','aal','aal2')::text,true) FROM review_test_accounts WHERE role='admin';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM imcc_review.course_offerings) THEN RAISE EXCEPTION 'Expired review can read data'; END IF;
 BEGIN PERFORM imcc_review.publish_summer_offering(1,'2097-2098',NULL); RAISE EXCEPTION 'Expired review can publish Summer offerings'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM imcc_review.get_registrar_clearance_workspace(); RAISE EXCEPTION 'Expired review read Registrar clearances'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM imcc_review.set_enrollment_term('2026-2027','Summer',true); RAISE EXCEPTION 'Expired review can mutate enrollment'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
