CREATE OR REPLACE FUNCTION public.get_subject_instructor_options()
 RETURNS TABLE(id uuid, full_name text, role text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_caller_role TEXT;
  v_caller_status TEXT;
  v_caller_active BOOLEAN;
BEGIN
  -- Verify caller is authenticated and is an approved, active dean
  SELECT p.role, p.status, COALESCE(p.is_active, true)
  INTO v_caller_role, v_caller_status, v_caller_active
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF v_caller_role IS DISTINCT FROM 'dean' OR v_caller_status IS DISTINCT FROM 'approved' OR v_caller_active IS NOT TRUE THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.id, p.full_name, p.role
  FROM public.profiles p
  WHERE (p.role IN ('teacher', 'faculty') OR (p.role='dean' AND p.id=auth.uid()))
    AND p.status = 'approved'
    AND COALESCE(p.is_active, true) = true
  ORDER BY p.full_name ASC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_course_offering_with_instructor(p_offering_id integer DEFAULT NULL::integer, p_code text DEFAULT NULL::text, p_title text DEFAULT NULL::text, p_units numeric DEFAULT 3.0, p_program text DEFAULT NULL::text, p_year integer DEFAULT 1, p_semester text DEFAULT NULL::text, p_school_year text DEFAULT NULL::text, p_schedule text DEFAULT NULL::text, p_instructor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_caller_id UUID;
  v_caller_role TEXT;
  v_caller_status TEXT;
  v_caller_active BOOLEAN;
  v_instructor_name TEXT;
  v_instructor_role TEXT;
  v_instructor_status TEXT;
  v_instructor_active BOOLEAN;
  v_offering_id INTEGER;
  v_result JSONB;
BEGIN
  -- 1. Authentication check
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 2. Authorization check: caller must be approved active dean
  SELECT p.role, p.status, COALESCE(p.is_active, true)
  INTO v_caller_role, v_caller_status, v_caller_active
  FROM public.profiles p
  WHERE p.id = v_caller_id;

  IF v_caller_role IS DISTINCT FROM 'dean' OR v_caller_status IS DISTINCT FROM 'approved' OR v_caller_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Access denied: only approved active deans can assign instructors to course offerings';
  END IF;

  -- 3. Instructor eligibility check: must be approved active teacher or faculty
  IF p_instructor_id IS NULL THEN
    RAISE EXCEPTION 'An eligible instructor must be selected';
  END IF;

  SELECT p.full_name, p.role, p.status, COALESCE(p.is_active, true)
  INTO v_instructor_name, v_instructor_role, v_instructor_status, v_instructor_active
  FROM public.profiles p
  WHERE p.id = p_instructor_id;

  IF v_instructor_name IS NULL THEN
    RAISE EXCEPTION 'Selected instructor profile not found';
  END IF;

  IF NOT (v_instructor_role IN ('teacher', 'faculty') OR (v_instructor_role='dean' AND p_instructor_id=v_caller_id)) OR v_instructor_status IS DISTINCT FROM 'approved' OR v_instructor_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Select an approved active teacher, faculty member, or yourself';
  END IF;

  -- Validate essential offering fields
  IF p_code IS NULL OR TRIM(p_code) = '' THEN
    RAISE EXCEPTION 'Subject code is required';
  END IF;
  IF p_title IS NULL OR TRIM(p_title) = '' THEN
    RAISE EXCEPTION 'Course title is required';
  END IF;

  -- 4. Insert or Update course_offerings
  IF p_offering_id IS NULL THEN
    INSERT INTO public.course_offerings (
      code,
      title,
      units,
      program,
      year,
      semester,
      school_year,
      schedule,
      instructor_id,
      instructor_name
    )
    VALUES (
      TRIM(p_code),
      TRIM(p_title),
      COALESCE(p_units, 3.0),
      p_program,
      COALESCE(p_year, 1),
      COALESCE(p_semester, '1st Semester'),
      COALESCE(p_school_year, '2026-2027'),
      p_schedule,
      p_instructor_id,
      v_instructor_name
    )
    RETURNING id INTO v_offering_id;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.course_offerings WHERE id = p_offering_id) THEN
      RAISE EXCEPTION 'Course offering % not found', p_offering_id;
    END IF;

    UPDATE public.course_offerings
    SET
      code = TRIM(p_code),
      title = TRIM(p_title),
      units = COALESCE(p_units, 3.0),
      program = p_program,
      year = COALESCE(p_year, 1),
      semester = COALESCE(p_semester, '1st Semester'),
      school_year = COALESCE(p_school_year, '2026-2027'),
      schedule = p_schedule,
      instructor_id = p_instructor_id,
      instructor_name = v_instructor_name
    WHERE id = p_offering_id;

    v_offering_id := p_offering_id;

    -- Deactivate prior active assignments for this offering
    UPDATE public.teacher_assignments
    SET is_active = false
    WHERE offering_id = v_offering_id;
  END IF;

  -- 5. Upsert active assignment in teacher_assignments
  INSERT INTO public.teacher_assignments (
    teacher_id,
    offering_id,
    academic_year,
    semester,
    is_active,
    assigned_by
  )
  VALUES (
    p_instructor_id,
    v_offering_id,
    COALESCE(p_school_year, '2026-2027'),
    COALESCE(p_semester, '1st Semester'),
    true,
    v_caller_id
  )
  ON CONFLICT (teacher_id, offering_id, academic_year, semester)
  DO UPDATE SET
    is_active = true,
    assigned_by = v_caller_id,
    updated_at = now();

  -- Return the saved offering with latest data
  SELECT to_jsonb(co.*) INTO v_result
  FROM public.course_offerings co
  WHERE co.id = v_offering_id;

  RETURN v_result;
END;
$function$;
