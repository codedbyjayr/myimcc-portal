-- Academic details are self-service during setup; later changes stay with the admin.
CREATE FUNCTION private.validate_student_academic_profile() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF NEW.program IS DISTINCT FROM OLD.program OR NEW.year_level IS DISTINCT FROM OLD.year_level THEN
    IF auth.uid() IS NOT NULL AND public.is_admin() IS DISTINCT FROM TRUE AND
       (auth.uid() IS DISTINCT FROM OLD.id OR OLD.status NOT IN ('onboarding','pending') OR OLD.is_active IS DISTINCT FROM TRUE) THEN
      RAISE EXCEPTION 'Only an admin can change academic details after account approval' USING ERRCODE='42501';
    END IF;
  END IF;
  IF NEW.requested_role='student' OR
     NEW.program IS DISTINCT FROM OLD.program OR NEW.year_level IS DISTINCT FROM OLD.year_level THEN
    IF NEW.year_level IS NULL OR NEW.year_level NOT IN ('1st Year','2nd Year','3rd Year','4th Year') OR
       NEW.program IS NULL OR NOT EXISTS (
         SELECT 1 FROM public.courses c WHERE c.program=NEW.program
           AND c.year_level=array_position(ARRAY['1st Year','2nd Year','3rd Year','4th Year'],NEW.year_level)
       ) THEN
      RAISE EXCEPTION 'Choose a valid curriculum program and year level' USING ERRCODE='22023';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.validate_student_academic_profile() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER validate_student_academic_profile BEFORE UPDATE OF program,year_level,requested_role ON public.profiles
FOR EACH ROW EXECUTE FUNCTION private.validate_student_academic_profile();
GRANT UPDATE(program,year_level) ON public.profiles TO authenticated;
