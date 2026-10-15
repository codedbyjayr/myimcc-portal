ALTER POLICY "Faculty write attendance" ON public.attendance
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.status = 'approved' AND p.is_active IS TRUE
      AND (
        p.role IN ('admin', 'dean')
        OR (p.role IN ('teacher', 'faculty') AND EXISTS (
          SELECT 1 FROM public.teacher_assignments ta
          WHERE ta.teacher_id = p.id
            AND ta.offering_id = attendance.offering_id
            AND ta.is_active IS TRUE
        ))
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.status = 'approved' AND p.is_active IS TRUE
      AND (
        p.role IN ('admin', 'dean')
        OR (p.role IN ('teacher', 'faculty') AND EXISTS (
          SELECT 1 FROM public.teacher_assignments ta
          WHERE ta.teacher_id = p.id
            AND ta.offering_id = attendance.offering_id
            AND ta.is_active IS TRUE
        ))
      )
  )
);
