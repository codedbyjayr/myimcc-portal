CREATE OR REPLACE FUNCTION public.initialize_student_clearances(target_student_id uuid DEFAULT NULL::uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF target_student_id IS NULL THEN
    target_student_id := auth.uid();
  END IF;

  IF target_student_id IS NULL THEN
    RETURN;
  END IF;

  -- Initialization creates requirements; only staff can approve them.
  INSERT INTO public.clearances (student_id, department_code, department_name, icon, status)
  SELECT target_student_id, cd.code, cd.name, cd.icon, 'pending'
  FROM public.clearance_departments cd
  ON CONFLICT (student_id, department_code) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.initialize_student_clearances(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.initialize_student_clearances(uuid) TO service_role;
