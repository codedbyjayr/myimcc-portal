-- Production migration: promote role workflows verified in the isolated test project.
-- No demo accounts, test rows, or assistant/Edge Function changes are included.

-- Source: supabase\migrations\20261015144016_enrollment_request_approval.sql
-- Students request; approved active staff/deans finalize through the existing review RPC.
CREATE TABLE public.enrollment_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 student_id uuid NOT NULL REFERENCES public.profiles(id),
 offering_id integer NOT NULL REFERENCES public.course_offerings(id),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now(),
 reviewed_by uuid REFERENCES public.profiles(id),
 reviewed_at timestamptz,
 review_note text CHECK (char_length(review_note)<=1000),
 cancelled_at timestamptz
);
CREATE UNIQUE INDEX enrollment_requests_pending_unique ON public.enrollment_requests(student_id,offering_id) WHERE status='pending';
CREATE INDEX enrollment_requests_offering_idx ON public.enrollment_requests(offering_id);
CREATE INDEX enrollment_requests_reviewer_idx ON public.enrollment_requests(reviewed_by);
ALTER TABLE public.enrollment_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.enrollment_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.enrollment_requests TO authenticated;
GRANT ALL ON public.enrollment_requests TO service_role;
CREATE POLICY students_read_requests ON public.enrollment_requests FOR SELECT TO authenticated USING (student_id=(SELECT auth.uid()));
CREATE POLICY students_submit_requests ON public.enrollment_requests FOR INSERT TO authenticated WITH CHECK (
 student_id=(SELECT auth.uid()) AND status='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL
 AND review_note IS NULL AND cancelled_at IS NULL
 AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.role='student' AND p.status='approved' AND p.is_active IS TRUE)
 AND NOT EXISTS(SELECT 1 FROM public.enrollments e WHERE e.student_id=(SELECT auth.uid()) AND e.offering_id=enrollment_requests.offering_id AND e.status IN ('enrolled','completed'))
);
CREATE POLICY requests_mfa ON public.enrollment_requests AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.is_mfa_compliant())) WITH CHECK ((SELECT public.is_mfa_compliant()));
GRANT USAGE ON SCHEMA private TO authenticated;
CREATE OR REPLACE FUNCTION private.review_enrollment_request(p_request_id uuid, p_decision text, p_review_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_request public.enrollment_requests%ROWTYPE;
  v_student_eligible boolean;
  v_enrollment_id uuid;
BEGIN
  IF v_actor IS NULL OR NOT public.is_mfa_compliant() THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_decision IS NULL OR p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Decision must be approved or rejected' USING ERRCODE = '22023';
  END IF;

  IF p_review_note IS NOT NULL AND pg_catalog.char_length(p_review_note) > 1000 THEN
    RAISE EXCEPTION 'Review note must be 1000 characters or fewer' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = v_actor
      AND p.role = ANY (ARRAY['admin', 'dean', 'registrar', 'staff'])
      AND p.status = 'approved'
      AND p.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'Approved active enrollment reviewer access required' USING ERRCODE = '42501';
  END IF;

  SELECT r.*
  INTO v_request
  FROM public.enrollment_requests r
  WHERE r.id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Enrollment request not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending requests can be reviewed' USING ERRCODE = '55000';
  END IF;

  IF p_decision = 'approved' THEN
    PERFORM 1
    FROM public.profiles p
    WHERE p.id = v_request.student_id
    FOR UPDATE;

    SELECT EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = v_request.student_id
        AND p.role = 'student'
        AND p.status = 'approved'
        AND p.is_active IS TRUE
    )
    INTO v_student_eligible;

    IF v_student_eligible IS NOT TRUE THEN
      RAISE EXCEPTION 'Student is no longer approved and active' USING ERRCODE = '42501';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.enrollments e
      WHERE e.student_id = v_request.student_id
        AND e.offering_id = v_request.offering_id
        AND e.status IN ('enrolled', 'completed')
    ) THEN
      RAISE EXCEPTION 'Student already has an enrolled or completed record for this offering' USING ERRCODE = '23505';
    END IF;

    INSERT INTO public.enrollments (student_id, offering_id, status)
    VALUES (v_request.student_id, v_request.offering_id, 'enrolled')
    RETURNING id INTO v_enrollment_id;
  END IF;

  UPDATE public.enrollment_requests r
  SET status = p_decision,
      reviewed_by = v_actor,
      reviewed_at = pg_catalog.now(),
      review_note = p_review_note
  WHERE r.id = v_request.id;

  RETURN pg_catalog.jsonb_build_object(
    'request_id', v_request.id,
    'status', p_decision,
    'enrollment_id', v_enrollment_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION private.list_enrollment_requests() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.created_at),'[]'::jsonb) FROM (
 SELECT r.id,r.created_at,p.full_name AS student_name,p.student_no,o.code,o.title,o.school_year,o.semester
 FROM public.enrollment_requests r JOIN public.profiles p ON p.id=r.student_id JOIN public.course_offerings o ON o.id=r.offering_id
 WHERE r.status='pending' AND public.is_mfa_compliant() AND EXISTS (
 SELECT 1 FROM public.profiles actor WHERE actor.id=(SELECT auth.uid()) AND actor.role IN ('dean','admin','staff','registrar') AND actor.status='approved' AND actor.is_active IS TRUE)
 ) q;
$$;
CREATE OR REPLACE FUNCTION public.list_enrollment_requests() RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT private.list_enrollment_requests(); $$;
REVOKE ALL ON FUNCTION private.list_enrollment_requests(),public.list_enrollment_requests() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.list_enrollment_requests(),public.list_enrollment_requests() TO authenticated;


-- Source: supabase\migrations\20261015150353_enrollment_review_student_groups.sql
-- Enrich the existing reviewer-only queue without widening table access.
CREATE OR REPLACE FUNCTION private.list_enrollment_requests() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH pending AS (
   SELECT r.* FROM public.enrollment_requests r
   WHERE r.status='pending' AND public.is_mfa_compliant() AND EXISTS (
     SELECT 1 FROM public.profiles actor WHERE actor.id=(SELECT auth.uid())
       AND actor.role IN ('dean','admin','staff','registrar')
       AND actor.status='approved' AND actor.is_active IS TRUE)
 ), enrolled AS (
   SELECT e.student_id,o.school_year,o.semester,sum(o.units) AS enrolled_units,
     jsonb_agg(jsonb_build_object('code',o.code,'title',o.title,'schedule',o.schedule,'units',o.units) ORDER BY o.code,o.id) AS enrolled_courses
   FROM public.enrollments e JOIN public.course_offerings o ON o.id=e.offering_id
   WHERE e.status='enrolled' AND e.student_id IN (SELECT student_id FROM pending)
   GROUP BY e.student_id,o.school_year,o.semester
 )
 SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.created_at,q.id),'[]'::jsonb) FROM (
   SELECT r.id,r.created_at,r.student_id,p.full_name AS student_name,p.student_no,p.program,p.year_level,p.section,
     o.code,o.title,o.school_year,o.semester,o.schedule,o.units,
     coalesce(e.enrolled_units,0) AS enrolled_units,coalesce(e.enrolled_courses,'[]'::jsonb) AS enrolled_courses
   FROM pending r JOIN public.profiles p ON p.id=r.student_id JOIN public.course_offerings o ON o.id=r.offering_id
   LEFT JOIN enrolled e ON e.student_id=r.student_id AND e.school_year=o.school_year AND e.semester=o.semester
 ) q;
$$;
REVOKE ALL ON FUNCTION private.list_enrollment_requests() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.list_enrollment_requests() TO authenticated;


-- Source: supabase\migrations\20261015152431_dean_self_teaching.sql
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


-- Source: supabase\migrations\20261015154210_assignment_managers_and_rosters.sql
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


-- Source: supabase\migrations\20261015155745_test_roster_course_access.sql
-- Protect instructor selection at the database boundary; deans use the existing save RPC.
CREATE OR REPLACE FUNCTION private.prevent_teacher_assignment_edits() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_role text; v_active boolean;
BEGIN
 IF auth.uid() IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' THEN RETURN NEW; END IF;
 SELECT p.role,p.status='approved' AND p.is_active IS TRUE INTO v_role,v_active FROM public.profiles p WHERE p.id=auth.uid();
 IF v_active IS NOT TRUE THEN RAISE EXCEPTION 'Approved active account required' USING ERRCODE='42501'; END IF;
 IF v_role IN ('teacher','faculty') AND
   (NEW.instructor_id IS DISTINCT FROM OLD.instructor_id OR NEW.instructor_name IS DISTINCT FROM OLD.instructor_name) THEN
   RAISE EXCEPTION 'Only deans and admins can change subject instructors' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER prevent_teacher_assignment_edits
BEFORE UPDATE OF instructor_id,instructor_name ON public.course_offerings
FOR EACH ROW EXECUTE FUNCTION private.prevent_teacher_assignment_edits();

-- Keep a student's course list and request policy consistent with their active program/year.
DROP POLICY students_submit_requests ON public.enrollment_requests;
CREATE POLICY students_submit_requests ON public.enrollment_requests FOR INSERT TO authenticated WITH CHECK (
 student_id=(SELECT auth.uid()) AND status='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL
 AND review_note IS NULL AND cancelled_at IS NULL
 AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.role='student' AND p.status='approved' AND p.is_active IS TRUE
   AND EXISTS(SELECT 1 FROM public.course_offerings o WHERE o.id=enrollment_requests.offering_id
     AND (o.program IS NULL OR o.program=p.program)
     AND (o.year IS NULL OR o.year=CASE WHEN btrim(coalesce(p.year_level,'')) ~ '^[1-4]' THEN substring(btrim(p.year_level) from 1 for 1)::integer
       WHEN lower(p.year_level) LIKE 'first%' THEN 1 WHEN lower(p.year_level) LIKE 'second%' THEN 2
       WHEN lower(p.year_level) LIKE 'third%' THEN 3 WHEN lower(p.year_level) LIKE 'fourth%' THEN 4 END)))
 AND NOT EXISTS(SELECT 1 FROM public.enrollments e WHERE e.student_id=(SELECT auth.uid()) AND e.offering_id=enrollment_requests.offering_id AND e.status IN ('enrolled','completed'))
);

-- Prevent the existing cascading foreign keys from silently erasing academic records.
CREATE OR REPLACE FUNCTION private.prevent_used_offering_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.enrollments WHERE offering_id=OLD.id)
 OR EXISTS(SELECT 1 FROM public.enrollment_requests WHERE offering_id=OLD.id)
 OR EXISTS(SELECT 1 FROM public.grades WHERE offering_id=OLD.id)
 OR EXISTS(SELECT 1 FROM public.attendance WHERE offering_id=OLD.id) THEN
   RAISE EXCEPTION 'Cannot delete a subject offering with student enrollment, requests, grades, or attendance. Unassign or archive it instead.' USING ERRCODE='23503';
 END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER prevent_used_offering_delete BEFORE DELETE ON public.course_offerings
FOR EACH ROW EXECUTE FUNCTION private.prevent_used_offering_delete();

-- Keep the pending queue unchanged; expose decision history only to active enrollment reviewers.
CREATE OR REPLACE FUNCTION private.list_enrollment_request_history(p_status text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH visible AS (
   SELECT r.* FROM public.enrollment_requests r
   WHERE r.status IN ('pending','approved','rejected')
     AND (p_status='all' OR r.status=p_status)
     AND public.is_mfa_compliant() AND EXISTS (
       SELECT 1 FROM public.profiles actor WHERE actor.id=(SELECT auth.uid())
         AND actor.role IN ('dean','admin','staff','registrar')
         AND actor.status='approved' AND actor.is_active IS TRUE)
 ), enrolled AS (
   SELECT e.student_id,o.school_year,o.semester,sum(o.units) AS enrolled_units,
     jsonb_agg(jsonb_build_object('code',o.code,'title',o.title,'schedule',o.schedule,'units',o.units) ORDER BY o.code,o.id) AS enrolled_courses
   FROM public.enrollments e JOIN public.course_offerings o ON o.id=e.offering_id
   WHERE e.status='enrolled' AND e.student_id IN (SELECT student_id FROM visible)
   GROUP BY e.student_id,o.school_year,o.semester
 )
 SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.created_at DESC,q.id),'[]'::jsonb) FROM (
   SELECT r.id,r.created_at,r.status,r.review_note,r.reviewed_at,
     r.student_id,p.full_name AS student_name,p.student_no,p.program,p.year_level,p.section,
     o.code,o.title,o.school_year,o.semester,o.schedule,o.units,
     coalesce(e.enrolled_units,0) AS enrolled_units,coalesce(e.enrolled_courses,'[]'::jsonb) AS enrolled_courses
   FROM visible r JOIN public.profiles p ON p.id=r.student_id
   JOIN public.course_offerings o ON o.id=r.offering_id
   LEFT JOIN enrolled e ON e.student_id=r.student_id AND e.school_year=o.school_year AND e.semester=o.semester
 ) q;
$$;
CREATE OR REPLACE FUNCTION public.list_enrollment_request_history(p_status text DEFAULT 'pending')
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT CASE WHEN p_status IN ('pending','approved','rejected','all')
   THEN private.list_enrollment_request_history(p_status) ELSE '[]'::jsonb END;
$$;
REVOKE ALL ON FUNCTION private.list_enrollment_request_history(text),public.list_enrollment_request_history(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.list_enrollment_request_history(text),public.list_enrollment_request_history(text) TO authenticated;
