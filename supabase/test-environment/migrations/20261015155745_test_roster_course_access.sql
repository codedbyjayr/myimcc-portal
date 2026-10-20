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
