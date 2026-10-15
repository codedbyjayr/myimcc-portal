-- Run with psql -v ON_ERROR_STOP=1 after the instructor ID migration.
-- All fixtures and profile changes are rolled back.
BEGIN;
CREATE TEMP TABLE evaluation_test_ids AS
SELECT gen_random_uuid() AS teacher_a, gen_random_uuid() AS teacher_b,
       gen_random_uuid() AS student, gen_random_uuid() AS admin;
GRANT SELECT ON evaluation_test_ids TO authenticated;

INSERT INTO auth.users (id, email, raw_user_meta_data)
SELECT id, id::text || '@imcc.edu.ph', '{}'::jsonb
FROM evaluation_test_ids,
LATERAL unnest(ARRAY[teacher_a, teacher_b, student, admin]) AS ids(id);

UPDATE public.profiles p
SET role = CASE WHEN p.id = i.student THEN 'student'
                WHEN p.id = i.admin THEN 'admin' ELSE 'teacher' END,
    status = 'approved', is_active = true, full_name = 'Same Name Identity Test'
FROM evaluation_test_ids i
WHERE p.id IN (i.teacher_a, i.teacher_b, i.student, i.admin);

SELECT set_config('request.jwt.claims', jsonb_build_object('sub',student,'role','authenticated','aal','aal2')::text, true)
FROM evaluation_test_ids;
SET LOCAL ROLE authenticated;
INSERT INTO public.faculty_evaluations
  (student_id, instructor_id, instructor_name, school_year, semester,
   teaching_clarity, knowledge, availability, fairness, punctuality)
SELECT student, id, 'Same Name Identity Test', 'identity-test', '1st Semester', 5,5,5,5,5
FROM evaluation_test_ids, LATERAL unnest(ARRAY[teacher_a,teacher_b]) AS teachers(id);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.faculty_evaluations
      (student_id,instructor_id,instructor_name,school_year,semester,
       teaching_clarity,knowledge,availability,fairness,punctuality)
    SELECT student,teacher_a,'Renamed','identity-test','1st Semester',5,5,5,5,5
    FROM evaluation_test_ids;
    RAISE EXCEPTION 'Duplicate instructor/term was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END;
$$;
RESET ROLE;

SELECT set_config('request.jwt.claims', jsonb_build_object('sub',teacher_a,'role','authenticated','aal','aal2')::text, true)
FROM evaluation_test_ids;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.faculty_evaluations WHERE school_year='identity-test') <> 1
     OR EXISTS (SELECT 1 FROM public.faculty_evaluations e, evaluation_test_ids i
                WHERE e.school_year='identity-test' AND e.instructor_id=i.teacher_b)
     OR (SELECT count(*) FROM public.instructor_evaluation_summary WHERE school_year='identity-test') <> 1 THEN
    RAISE EXCEPTION 'Same-name teacher isolation failed';
  END IF;
END;
$$;

UPDATE public.profiles SET full_name='Renamed Identity Test' WHERE id=(SELECT teacher_a FROM evaluation_test_ids);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.faculty_evaluations WHERE school_year='identity-test') <> 1
     OR (SELECT count(*) FROM public.instructor_evaluation_summary WHERE school_year='identity-test') <> 1 THEN
    RAISE EXCEPTION 'Renaming lost legitimate evaluation access';
  END IF;
END;
$$;
UPDATE public.profiles SET full_name='Same Name Identity Test' WHERE id=(SELECT teacher_a FROM evaluation_test_ids);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.faculty_evaluations e, evaluation_test_ids i
             WHERE e.school_year='identity-test' AND e.instructor_id=i.teacher_b) THEN
    RAISE EXCEPTION 'Name impersonation disclosed another teacher evaluation';
  END IF;
END;
$$;
RESET ROLE;

SELECT set_config('request.jwt.claims', jsonb_build_object('sub',teacher_b,'role','authenticated','aal','aal2')::text, true)
FROM evaluation_test_ids;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.faculty_evaluations WHERE school_year='identity-test') <> 1
     OR EXISTS (SELECT 1 FROM public.instructor_evaluation_summary s, evaluation_test_ids i
                WHERE s.school_year='identity-test' AND s.instructor_id=i.teacher_a) THEN
    RAISE EXCEPTION 'Second teacher isolation failed';
  END IF;
END;
$$;
RESET ROLE;
UPDATE public.profiles SET is_active=false WHERE id=(SELECT teacher_b FROM evaluation_test_ids);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.faculty_evaluations WHERE school_year='identity-test')
     OR EXISTS (SELECT 1 FROM public.instructor_evaluation_summary WHERE school_year='identity-test') THEN
    RAISE EXCEPTION 'Inactive teacher retained evaluation access';
  END IF;
END;
$$;
RESET ROLE;

SELECT set_config('request.jwt.claims', jsonb_build_object('sub',admin,'role','authenticated','aal','aal2')::text, true)
FROM evaluation_test_ids;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.faculty_evaluations WHERE school_year='identity-test') <> 2
     OR (SELECT count(*) FROM public.instructor_evaluation_summary WHERE school_year='identity-test') <> 2 THEN
    RAISE EXCEPTION 'Administrator access or same-name grouping failed';
  END IF;
END;
$$;
RESET ROLE;
ROLLBACK;
