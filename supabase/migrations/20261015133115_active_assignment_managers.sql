-- Existing assignment sync and save functions already write this column.
ALTER TABLE public.teacher_assignments ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

DROP POLICY "Deans and admin manage teacher_assignments" ON public.teacher_assignments;

-- Deleting an offering also deletes its assignments through the foreign key.
ALTER POLICY "Faculty and admin delete offerings" ON public.course_offerings
USING (EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.id = (SELECT auth.uid())
    AND p.role IN ('teacher', 'faculty', 'dean', 'admin')
    AND p.status = 'approved' AND p.is_active IS TRUE
));

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
         AND p.role IN ('teacher', 'faculty', 'dean', 'admin')
         AND p.status = 'approved' AND p.is_active IS TRUE
     ) THEN
    RAISE EXCEPTION 'Approved active account required to change assignments' USING ERRCODE = '42501';
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
