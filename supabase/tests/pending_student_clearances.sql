-- Run with psql -v ON_ERROR_STOP=1 after the pending clearances migration.
-- Signup, enrollment and staff-decision fixtures are all rolled back.
BEGIN;
CREATE TEMP TABLE clearance_test_student AS SELECT gen_random_uuid() AS id;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.initialize_student_clearances(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.initialize_student_clearances(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.initialize_student_clearances(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Clearance initializer must be callable only by the service role';
  END IF;
END;
$$;

INSERT INTO auth.users (id, email, raw_user_meta_data)
SELECT id, id::text || '@imcc.edu.ph', '{}'::jsonb FROM clearance_test_student;

DO $$
DECLARE
  student uuid := (SELECT id FROM clearance_test_student);
BEGIN
  IF (SELECT count(*) FROM public.clearance_departments) < 3 THEN
    RAISE EXCEPTION 'Test needs at least three clearance departments';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clearance_departments WHERE code='registrar') THEN
    RAISE EXCEPTION 'Registrar clearance department must be configured';
  END IF;
  IF (SELECT count(*) FROM public.clearances WHERE student_id=student)
     <> (SELECT count(*) FROM public.clearance_departments)
     OR EXISTS (SELECT 1 FROM public.clearances WHERE student_id=student
                AND (status IS DISTINCT FROM 'pending' OR cleared_at IS NOT NULL
                     OR note IS NOT NULL OR officer_name IS NOT NULL)) THEN
    RAISE EXCEPTION 'Signup must create pending requirements without approval claims';
  END IF;
END;
$$;

UPDATE public.clearances SET status='cleared', note='Staff verified',
  officer_name='Test reviewer', cleared_at=now()
WHERE student_id=(SELECT id FROM clearance_test_student)
  AND department_code=(SELECT code FROM public.clearance_departments ORDER BY code LIMIT 1);

UPDATE public.clearances SET status='action_required', note='Outstanding requirement',
  officer_name='Test reviewer', cleared_at=NULL
WHERE student_id=(SELECT id FROM clearance_test_student)
  AND department_code=(SELECT code FROM public.clearance_departments ORDER BY code LIMIT 1 OFFSET 1);

CREATE TEMP TABLE clearance_test_snapshot AS
SELECT * FROM public.clearances WHERE student_id=(SELECT id FROM clearance_test_student);

SELECT public.initialize_student_clearances(id) FROM clearance_test_student;
SELECT public.initialize_student_clearances(id) FROM clearance_test_student;

DO $$
BEGIN
  IF EXISTS (SELECT * FROM clearance_test_snapshot EXCEPT
             SELECT * FROM public.clearances WHERE student_id=(SELECT id FROM clearance_test_student))
     OR (SELECT count(*) FROM public.clearances WHERE student_id=(SELECT id FROM clearance_test_student))
        <> (SELECT count(*) FROM clearance_test_snapshot) THEN
    RAISE EXCEPTION 'Repeated initialization changed an existing clearance';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.course_offerings) THEN
    RAISE EXCEPTION 'Test needs an existing course offering';
  END IF;
END;
$$;

INSERT INTO public.enrollments (student_id,offering_id,status)
SELECT id,(SELECT id FROM public.course_offerings ORDER BY id LIMIT 1),'enrolled'
FROM clearance_test_student;

DO $$
BEGIN
  IF EXISTS (SELECT * FROM clearance_test_snapshot EXCEPT
             SELECT * FROM public.clearances WHERE student_id=(SELECT id FROM clearance_test_student))
     OR (SELECT count(*) FROM public.clearances WHERE student_id=(SELECT id FROM clearance_test_student))
        <> (SELECT count(*) FROM clearance_test_snapshot) THEN
    RAISE EXCEPTION 'Enrollment changed existing clearance decisions';
  END IF;
END;
$$;

-- Repair a missing requirement without resetting an approval or a hold.
DELETE FROM public.clearances
WHERE student_id=(SELECT id FROM clearance_test_student)
  AND department_code=(SELECT code FROM public.clearance_departments ORDER BY code LIMIT 1 OFFSET 2);
SELECT public.initialize_student_clearances(id) FROM clearance_test_student;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.clearances WHERE student_id=(SELECT id FROM clearance_test_student))
     <> (SELECT count(*) FROM clearance_test_snapshot)
     OR EXISTS (SELECT 1 FROM public.clearances
                WHERE student_id=(SELECT id FROM clearance_test_student)
                  AND department_code=(SELECT code FROM public.clearance_departments ORDER BY code LIMIT 1 OFFSET 2)
                  AND (status IS DISTINCT FROM 'pending' OR cleared_at IS NOT NULL OR note IS NOT NULL))
     OR EXISTS (SELECT * FROM clearance_test_snapshot
                WHERE department_code<>(SELECT code FROM public.clearance_departments ORDER BY code LIMIT 1 OFFSET 2)
                EXCEPT SELECT * FROM public.clearances WHERE student_id=(SELECT id FROM clearance_test_student)) THEN
    RAISE EXCEPTION 'Repair must add only a pending requirement and preserve staff decisions';
  END IF;
END;
$$;
ROLLBACK;
