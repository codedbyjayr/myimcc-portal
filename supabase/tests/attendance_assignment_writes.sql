-- Run with psql -v ON_ERROR_STOP=1 after the attendance assignment migration.
-- All fixtures and writes are rolled back.
BEGIN;
CREATE TEMP TABLE attendance_test_ids AS
SELECT gen_random_uuid() AS teacher, gen_random_uuid() AS student,
       gen_random_uuid() AS admin,
       (SELECT id FROM public.course_offerings ORDER BY id LIMIT 1) AS own_offering,
       (SELECT id FROM public.course_offerings ORDER BY id LIMIT 1 OFFSET 1) AS other_offering;
GRANT SELECT ON attendance_test_ids TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM attendance_test_ids WHERE own_offering IS NULL OR other_offering IS NULL) THEN
    RAISE EXCEPTION 'Test needs two existing course offerings';
  END IF;
END;
$$;

INSERT INTO auth.users(id,email,raw_user_meta_data)
SELECT id,id::text || '@imcc.edu.ph','{}'::jsonb
FROM attendance_test_ids,LATERAL unnest(ARRAY[teacher,student,admin]) AS users(id);
UPDATE public.profiles p SET role=CASE WHEN p.id=i.teacher THEN 'teacher'
  WHEN p.id=i.admin THEN 'admin' ELSE 'student' END,
  status='approved',is_active=true
FROM attendance_test_ids i WHERE p.id IN(i.teacher,i.student,i.admin);

INSERT INTO public.teacher_assignments(teacher_id,offering_id,academic_year,semester,is_active)
SELECT teacher,own_offering,'attendance-test','1st Semester',true FROM attendance_test_ids;
INSERT INTO public.attendance(student_id,offering_id,date,status)
SELECT student,other_offering,'2099-01-01','present' FROM attendance_test_ids;

CREATE FUNCTION pg_temp.assert_attendance_blocked(target_offering integer) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  changed integer;
BEGIN
  UPDATE public.attendance SET status='absent'
  WHERE student_id=(SELECT student FROM attendance_test_ids) AND offering_id=target_offering;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>0 THEN RAISE EXCEPTION 'Unauthorized attendance update succeeded'; END IF;
  DELETE FROM public.attendance
  WHERE student_id=(SELECT student FROM attendance_test_ids) AND offering_id=target_offering;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>0 THEN RAISE EXCEPTION 'Unauthorized attendance delete succeeded'; END IF;
  BEGIN
    INSERT INTO public.attendance(student_id,offering_id,date,status)
    SELECT student,target_offering,'2099-01-02','absent' FROM attendance_test_ids;
    RAISE EXCEPTION 'Unauthorized attendance insert succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.attendance(student_id,offering_id,date,status)
    SELECT student,target_offering,'2099-01-01','absent' FROM attendance_test_ids
    ON CONFLICT(student_id,offering_id,date) DO UPDATE SET status=EXCLUDED.status;
    RAISE EXCEPTION 'Unauthorized attendance upsert succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION pg_temp.assert_attendance_blocked(integer) TO authenticated;

SELECT set_config('request.jwt.claims',jsonb_build_object('sub',teacher,'role','authenticated','aal','aal2')::text,true)
FROM attendance_test_ids;
SET LOCAL ROLE authenticated;
INSERT INTO public.attendance(student_id,offering_id,date,status)
SELECT student,own_offering,'2099-01-01','present' FROM attendance_test_ids
ON CONFLICT(student_id,offering_id,date) DO UPDATE SET status=EXCLUDED.status;
INSERT INTO public.attendance(student_id,offering_id,date,status)
SELECT student,own_offering,'2099-01-01','late' FROM attendance_test_ids
ON CONFLICT(student_id,offering_id,date) DO UPDATE SET status=EXCLUDED.status;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.attendance a,attendance_test_ids i
                 WHERE a.student_id=i.student AND a.offering_id=i.own_offering AND a.status='late') THEN
    RAISE EXCEPTION 'Assigned teacher upsert failed';
  END IF;
  BEGIN
    UPDATE public.attendance SET offering_id=(SELECT other_offering FROM attendance_test_ids),date='2099-01-03'
    WHERE student_id=(SELECT student FROM attendance_test_ids) AND offering_id=(SELECT own_offering FROM attendance_test_ids);
    RAISE EXCEPTION 'Teacher moved attendance into another class';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
SELECT pg_temp.assert_attendance_blocked(other_offering) FROM attendance_test_ids;
SELECT pg_temp.assert_attendance_blocked(NULL);
RESET ROLE;

UPDATE public.profiles SET role='faculty' WHERE id=(SELECT teacher FROM attendance_test_ids);
SET LOCAL ROLE authenticated;
DO $$
DECLARE changed integer;
BEGIN
  UPDATE public.attendance SET status='present'
  WHERE student_id=(SELECT student FROM attendance_test_ids) AND offering_id=(SELECT own_offering FROM attendance_test_ids);
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>1 THEN RAISE EXCEPTION 'Assigned faculty update failed'; END IF;
  DELETE FROM public.attendance
  WHERE student_id=(SELECT student FROM attendance_test_ids) AND offering_id=(SELECT own_offering FROM attendance_test_ids);
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>1 THEN RAISE EXCEPTION 'Assigned faculty delete failed'; END IF;
END;
$$;
INSERT INTO public.attendance(student_id,offering_id,date,status)
SELECT student,own_offering,'2099-01-01','present' FROM attendance_test_ids;
SELECT pg_temp.assert_attendance_blocked(other_offering) FROM attendance_test_ids;
RESET ROLE;

UPDATE public.teacher_assignments SET is_active=false WHERE teacher_id=(SELECT teacher FROM attendance_test_ids);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_attendance_blocked(own_offering) FROM attendance_test_ids;
RESET ROLE;
UPDATE public.teacher_assignments SET is_active=true WHERE teacher_id=(SELECT teacher FROM attendance_test_ids);
UPDATE public.profiles SET is_active=false WHERE id=(SELECT teacher FROM attendance_test_ids);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_attendance_blocked(own_offering) FROM attendance_test_ids;
RESET ROLE;
UPDATE public.profiles SET is_active=true,status='pending' WHERE id=(SELECT teacher FROM attendance_test_ids);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_attendance_blocked(own_offering) FROM attendance_test_ids;
RESET ROLE;

SELECT set_config('request.jwt.claims',jsonb_build_object('sub',admin,'role','authenticated','aal','aal2')::text,true)
FROM attendance_test_ids;
SET LOCAL ROLE authenticated;
DO $$
DECLARE changed integer;
BEGIN
  UPDATE public.attendance SET status='excused'
  WHERE student_id=(SELECT student FROM attendance_test_ids) AND offering_id=(SELECT other_offering FROM attendance_test_ids);
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>1 THEN RAISE EXCEPTION 'Administrator attendance access failed'; END IF;
END;
$$;
RESET ROLE;
UPDATE public.profiles SET role='dean' WHERE id=(SELECT admin FROM attendance_test_ids);
SET LOCAL ROLE authenticated;
DO $$
DECLARE changed integer;
BEGIN
  UPDATE public.attendance SET status='late'
  WHERE student_id=(SELECT student FROM attendance_test_ids) AND offering_id=(SELECT other_offering FROM attendance_test_ids);
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>1 THEN RAISE EXCEPTION 'Dean attendance access failed'; END IF;
END;
$$;
RESET ROLE;
ROLLBACK;
