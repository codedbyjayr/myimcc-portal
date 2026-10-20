ALTER TABLE public.faculty_evaluations
  ADD COLUMN instructor_id uuid REFERENCES public.profiles(id);

LOCK TABLE public.profiles IN SHARE MODE;

-- Never guess when a historical name identifies zero or multiple instructors.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.faculty_evaluations e
    WHERE (SELECT count(*) FROM public.profiles p
           WHERE p.full_name = e.instructor_name
             AND p.role IN ('teacher', 'faculty', 'dean')) <> 1
  ) THEN
    RAISE EXCEPTION 'Resolve unmatched or ambiguous evaluation instructor names before migrating';
  END IF;
END;
$$;

UPDATE public.faculty_evaluations e
SET instructor_id = p.id
FROM public.profiles p
WHERE p.full_name = e.instructor_name
  AND p.role IN ('teacher', 'faculty', 'dean');

ALTER TABLE public.faculty_evaluations
  ALTER COLUMN instructor_id SET NOT NULL,
  DROP CONSTRAINT faculty_evaluations_student_id_instructor_name_school_year__key,
  ADD CONSTRAINT faculty_evaluations_student_instructor_term_key
    UNIQUE (student_id, instructor_id, school_year, semester);

CREATE INDEX idx_faculty_evaluations_instructor_id
  ON public.faculty_evaluations(instructor_id);

ALTER POLICY "Teachers view own evaluations" ON public.faculty_evaluations
  USING (
    instructor_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role IN ('teacher', 'faculty', 'dean')
        AND p.status = 'approved' AND p.is_active IS TRUE
    )
  );

-- Retain the existing display columns; identity also separates same-name teachers.
CREATE OR REPLACE VIEW public.instructor_evaluation_summary
WITH (security_invoker = true) AS
SELECT max(instructor_name) AS instructor_name, school_year, semester,
  count(*)::integer AS total_evaluations,
  round(avg(teaching_clarity), 2) AS avg_teaching_clarity,
  round(avg(knowledge), 2) AS avg_knowledge,
  round(avg(availability), 2) AS avg_availability,
  round(avg(fairness), 2) AS avg_fairness,
  round(avg(punctuality), 2) AS avg_punctuality,
  round(avg((teaching_clarity + knowledge + availability + fairness + punctuality)::numeric / 5.0), 2) AS avg_overall,
  instructor_id
FROM public.faculty_evaluations
GROUP BY instructor_id, school_year, semester;
