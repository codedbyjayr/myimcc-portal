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
