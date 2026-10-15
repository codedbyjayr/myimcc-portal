-- Read-only assertions for the dummy setup. Run only in the test project.
DO $$
BEGIN
  IF (SELECT count(*) FROM public.profiles
      WHERE status='approved' AND is_active IS TRUE AND
        ((email='student.demo@imcc.edu.ph' AND role='student')
         OR (email='teacher.demo@imcc.edu.ph' AND role='teacher')
         OR (email='dean.demo@imcc.edu.ph' AND role='dean'))) <> 3 THEN
    RAISE EXCEPTION 'Dummy account approval or role is incorrect';
  END IF;
  IF (SELECT count(*) FROM public.enrollments e JOIN public.profiles p ON p.id=e.student_id
      JOIN public.course_offerings co ON co.id=e.offering_id
      WHERE p.email='student.demo@imcc.edu.ph' AND co.code IN ('TEST101','TEST102') AND e.status='enrolled') <> 0 THEN
    RAISE EXCEPTION 'Dummy student must start without enrolled classes';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.teacher_assignments ta JOIN public.profiles p ON p.id=ta.teacher_id
                 JOIN public.course_offerings co ON co.id=ta.offering_id
                 WHERE p.email='teacher.demo@imcc.edu.ph' AND co.code='TEST101' AND ta.is_active IS TRUE) THEN
    RAISE EXCEPTION 'Dummy teacher must be assigned TEST101';
  END IF;
  IF (SELECT count(*) FROM public.clearances c JOIN public.profiles p ON p.id=c.student_id
      WHERE p.email='student.demo@imcc.edu.ph' AND c.status='pending' AND c.cleared_at IS NULL) <> 3 THEN
    RAISE EXCEPTION 'Dummy clearances should start pending';
  END IF;
END;
$$;
