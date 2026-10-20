-- ============================================================
-- 1. Enable RLS Policies for course_offerings (Dean & Admin manage)
-- ============================================================
DROP POLICY IF EXISTS "Staff and Dean manage course_offerings" ON public.course_offerings;
CREATE POLICY "Staff and Dean manage course_offerings" ON public.course_offerings
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = ANY (ARRAY['dean'::text, 'admin'::text, 'teacher'::text, 'faculty'::text, 'staff'::text])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = ANY (ARRAY['dean'::text, 'admin'::text, 'teacher'::text, 'faculty'::text, 'staff'::text])
  ));

-- ============================================================
-- 2. Enable RLS Policies for grades (Teachers, Faculty, Dean, Admin)
-- ============================================================
DROP POLICY IF EXISTS "Faculty insert grades" ON public.grades;
CREATE POLICY "Faculty insert grades" ON public.grades
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = ANY (ARRAY['teacher'::text, 'faculty'::text, 'dean'::text, 'admin'::text])
  ));

DROP POLICY IF EXISTS "Faculty update grades" ON public.grades;
CREATE POLICY "Faculty update grades" ON public.grades
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = ANY (ARRAY['teacher'::text, 'faculty'::text, 'dean'::text, 'admin'::text])
  ));

DROP POLICY IF EXISTS "Faculty delete grades" ON public.grades;
CREATE POLICY "Faculty delete grades" ON public.grades
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = ANY (ARRAY['teacher'::text, 'faculty'::text, 'dean'::text, 'admin'::text])
  ));

DROP POLICY IF EXISTS "Faculty read all grades" ON public.grades;
CREATE POLICY "Faculty read all grades" ON public.grades
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = ANY (ARRAY['teacher'::text, 'faculty'::text, 'dean'::text, 'admin'::text, 'staff'::text])
  ));
