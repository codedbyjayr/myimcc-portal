-- Keep later semesters available; an existing enrollment closes student intake for its term.
CREATE POLICY requests_once_per_term ON public.enrollment_requests
AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (NOT EXISTS (
  SELECT 1
  FROM public.enrollments e
  JOIN public.course_offerings enrolled ON enrolled.id = e.offering_id
  JOIN public.course_offerings requested ON requested.id = enrollment_requests.offering_id
  WHERE e.student_id = (SELECT auth.uid())
    AND e.status IN ('enrolled', 'completed')
    AND enrolled.semester = requested.semester
    AND translate(enrolled.school_year, '–—', '--') = translate(requested.school_year, '–—', '--')
));
