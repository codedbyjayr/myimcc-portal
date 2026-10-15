-- Run with psql -v ON_ERROR_STOP=1 after the active assignment managers migration.
-- All account, offering and assignment fixtures are rolled back.
BEGIN;
CREATE TEMP TABLE assignment_test_ids AS
SELECT gen_random_uuid() AS manager, gen_random_uuid() AS teacher, NULL::integer AS offering;
GRANT SELECT ON assignment_test_ids TO authenticated;
INSERT INTO auth.users(id,email,raw_user_meta_data)
SELECT id,id::text || '@imcc.edu.ph','{}'::jsonb
FROM assignment_test_ids,LATERAL unnest(ARRAY[manager,teacher]) AS users(id);
UPDATE public.profiles p SET role=CASE WHEN p.id=i.manager THEN 'dean' ELSE 'teacher' END,
  status='approved',is_active=true
FROM assignment_test_ids i WHERE p.id IN(i.manager,i.teacher);
WITH offering AS (
  INSERT INTO public.course_offerings(code,title,units,program,year,semester,school_year,instructor_id)
  SELECT 'POLICY-' || teacher::text,'Assignment policy test',3,'BSIT',1,'1st Semester','2099-2100',teacher
  FROM assignment_test_ids RETURNING id
)
UPDATE assignment_test_ids SET offering=(SELECT id FROM offering);

CREATE FUNCTION pg_temp.check_assignment_access(allowed boolean) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  changed integer;
  expected integer := CASE WHEN allowed THEN 1 ELSE 0 END;
  ids record := (SELECT i FROM assignment_test_ids i);
  new_offering integer;
BEGIN
  UPDATE public.teacher_assignments SET is_active=true
  WHERE teacher_id=ids.teacher AND offering_id=ids.offering;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>expected THEN RAISE EXCEPTION 'Assignment update permission mismatch'; END IF;
  DELETE FROM public.teacher_assignments WHERE teacher_id=ids.teacher AND offering_id=ids.offering;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>expected THEN RAISE EXCEPTION 'Assignment delete permission mismatch'; END IF;
  BEGIN
    INSERT INTO public.teacher_assignments(teacher_id,offering_id,academic_year,semester,is_active)
    VALUES(ids.teacher,ids.offering,'2099-2100','1st Semester',true);
    IF NOT allowed THEN RAISE EXCEPTION 'Inactive manager inserted an assignment'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    IF allowed THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO public.teacher_assignments(teacher_id,offering_id,academic_year,semester,is_active)
    VALUES(ids.teacher,ids.offering,'2099-2100','1st Semester',true)
    ON CONFLICT(teacher_id,offering_id,academic_year,semester) DO UPDATE SET is_active=true;
    IF NOT allowed THEN RAISE EXCEPTION 'Inactive manager upserted an assignment'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    IF allowed THEN RAISE; END IF;
  END;

  BEGIN
    UPDATE public.course_offerings SET instructor_id=ids.teacher WHERE id=ids.offering;
    GET DIAGNOSTICS changed=ROW_COUNT;
    IF NOT allowed AND changed<>0 THEN RAISE EXCEPTION 'Inactive account changed assignments through offering update'; END IF;
    IF allowed AND changed<>1 THEN RAISE EXCEPTION 'Active manager offering update failed'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    IF allowed THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO public.course_offerings(code,title,units,program,year,semester,school_year,instructor_id)
    VALUES('POLICY-' || gen_random_uuid()::text,'Assignment policy insert test',3,'BSIT',1,'1st Semester','2099-2100',ids.teacher)
    RETURNING id INTO new_offering;
    IF NOT allowed THEN RAISE EXCEPTION 'Inactive account created an assignment through offering insert'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    IF allowed THEN RAISE; END IF;
  END;
  DELETE FROM public.course_offerings WHERE id=CASE WHEN allowed THEN new_offering ELSE ids.offering END;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>expected THEN RAISE EXCEPTION 'Offering deletion permission mismatch'; END IF;

  IF allowed AND (SELECT role FROM public.profiles WHERE id=ids.manager)='dean' THEN
    PERFORM public.save_course_offering_with_instructor(
      p_offering_id=>ids.offering,p_code=>'POLICY-' || ids.teacher::text,
      p_title=>'Assignment policy test',p_program=>'BSIT',p_school_year=>'2099-2100',
      p_semester=>'1st Semester',p_instructor_id=>ids.teacher);
  END IF;

  IF NOT allowed THEN
    BEGIN
      PERFORM public.save_course_offering_with_instructor(
        p_offering_id=>ids.offering, p_code=>'POLICY-RPC',p_title=>'RPC test',p_instructor_id=>ids.teacher);
      RAISE EXCEPTION 'Inactive account changed assignments through RPC';
    EXCEPTION
      WHEN insufficient_privilege THEN NULL;
      WHEN raise_exception THEN
        IF SQLERRM NOT LIKE 'Access denied:%' THEN RAISE; END IF;
    END;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.check_assignment_access(boolean) TO authenticated;

DO $$
DECLARE
  manager_role text;
  ids record := (SELECT i FROM assignment_test_ids i);
BEGIN
  FOR manager_role IN SELECT unnest(ARRAY['dean','admin']) LOOP
    UPDATE public.profiles SET role=manager_role,status='approved',is_active=true WHERE id=ids.manager;
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ids.manager,'role','authenticated','aal','aal2')::text,true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM pg_temp.check_assignment_access(true);
    EXECUTE 'RESET ROLE';
    UPDATE public.profiles SET is_active=false WHERE id=ids.manager;
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM pg_temp.check_assignment_access(false);
    EXECUTE 'RESET ROLE';
    UPDATE public.profiles SET is_active=true,status='pending' WHERE id=ids.manager;
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM pg_temp.check_assignment_access(false);
    EXECUTE 'RESET ROLE';
  END LOOP;
END;
$$;
ROLLBACK;
