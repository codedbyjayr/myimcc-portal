-- Restrictive policies also cover any remaining permissive offering-write policies.
CREATE POLICY offering_insert_managers ON public.course_offerings AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.role IN ('dean','admin') AND p.status='approved' AND p.is_active IS TRUE));
CREATE POLICY offering_update_managers ON public.course_offerings AS RESTRICTIVE FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.role IN ('dean','admin') AND p.status='approved' AND p.is_active IS TRUE)) WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.role IN ('dean','admin') AND p.status='approved' AND p.is_active IS TRUE));
CREATE POLICY offering_delete_managers ON public.course_offerings AS RESTRICTIVE FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.role IN ('dean','admin') AND p.status='approved' AND p.is_active IS TRUE));
CREATE OR REPLACE FUNCTION public.sync_teacher_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  -- The trigger runs with owner privileges, so RLS cannot enforce caller activation here.
  IF auth.uid() IS NOT NULL
     AND auth.role() IS DISTINCT FROM 'service_role'
     AND NOT EXISTS (
       SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid()
         AND p.role IN ('dean', 'admin')
         AND p.status = 'approved' AND p.is_active IS TRUE
     ) THEN
    RAISE EXCEPTION 'Approved active dean or admin required to change assignments' USING ERRCODE = '42501';
  END IF;

  IF NEW.instructor_id IS NULL THEN
    UPDATE public.teacher_assignments
    SET is_active = false
    WHERE offering_id = NEW.id;
  ELSE
    -- Deactivate previous assignments that don't match the new instructor
    UPDATE public.teacher_assignments
    SET is_active = false
    WHERE offering_id = NEW.id
      AND (
        teacher_id IS DISTINCT FROM NEW.instructor_id
        OR academic_year IS DISTINCT FROM NEW.school_year
        OR semester IS DISTINCT FROM NEW.semester
      );

    -- Upsert active assignment
    INSERT INTO public.teacher_assignments (
      teacher_id,
      offering_id,
      academic_year,
      semester,
      is_active,
      assigned_by
    )
    VALUES (
      NEW.instructor_id,
      NEW.id,
      COALESCE(NEW.school_year, '2026-2027'),
      COALESCE(NEW.semester, '1st Semester'),
      true,
      auth.uid()
    )
    ON CONFLICT (teacher_id, offering_id, academic_year, semester)
    DO UPDATE SET
      is_active = true,
      assigned_by = COALESCE(auth.uid(), public.teacher_assignments.assigned_by),
      updated_at = now();
  END IF;

  RETURN NEW;
END;
$function$;
CREATE FUNCTION private.get_class_roster(p_offering_id integer)
RETURNS TABLE(student_id uuid,profiles jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT e.student_id,jsonb_build_object('id',p.id,'full_name',p.full_name,'student_no',p.student_no,'id_number',p.id_number)
 FROM public.enrollments e JOIN public.profiles p ON p.id=e.student_id
 WHERE e.offering_id=p_offering_id AND e.status='enrolled'
 AND public.is_mfa_compliant() AND EXISTS (
   SELECT 1 FROM public.profiles actor WHERE actor.id=(SELECT auth.uid())
   AND actor.status='approved' AND actor.is_active IS TRUE
   AND (actor.role IN ('dean','admin') OR (actor.role IN ('teacher','faculty') AND EXISTS (
     SELECT 1 FROM public.teacher_assignments ta WHERE ta.teacher_id=actor.id AND ta.offering_id=p_offering_id AND ta.is_active IS TRUE))))
 ORDER BY p.full_name,p.id;
$$;
CREATE FUNCTION public.get_class_roster(p_offering_id integer)
RETURNS TABLE(student_id uuid,profiles jsonb)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT * FROM private.get_class_roster(p_offering_id); $$;
CREATE FUNCTION private.get_dean_student_directory()
RETURNS TABLE(id uuid,full_name text,program text,year_level text,role text,status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT p.id,p.full_name,p.program,p.year_level,p.role,p.status FROM public.profiles p
 WHERE p.role='student' AND p.status='approved' AND public.is_mfa_compliant()
 AND EXISTS(SELECT 1 FROM public.profiles actor WHERE actor.id=(SELECT auth.uid())
   AND actor.role IN ('dean','admin') AND actor.status='approved' AND actor.is_active IS TRUE)
 ORDER BY p.full_name,p.id;
$$;
CREATE FUNCTION public.get_dean_student_directory()
RETURNS TABLE(id uuid,full_name text,program text,year_level text,role text,status text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT * FROM private.get_dean_student_directory(); $$;
GRANT USAGE ON SCHEMA private TO authenticated;
REVOKE ALL ON FUNCTION private.get_class_roster(integer), public.get_class_roster(integer), private.get_dean_student_directory(), public.get_dean_student_directory() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.get_class_roster(integer), public.get_class_roster(integer), private.get_dean_student_directory(), public.get_dean_student_directory() TO authenticated;
