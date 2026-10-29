BEGIN;
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.get_registrar_clearance_workspace()', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.get_registrar_clearance_workspace()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Registrar clearance queue must be available only to authenticated users';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.role = 'student' AND NOT EXISTS (
      SELECT 1 FROM public.clearances c WHERE c.student_id = p.id AND c.department_code = 'registrar'
    )
  ) THEN
    RAISE EXCEPTION 'Every existing student must have a Registrar clearance row';
  END IF;
END;
$$;
ROLLBACK;
