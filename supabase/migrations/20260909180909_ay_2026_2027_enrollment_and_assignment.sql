-- Active academic year 2026-2027
UPDATE academic_years SET is_active = false WHERE is_active = true;
INSERT INTO academic_years (label, start_date, end_date, is_active)
SELECT 'AY 2026-2027', '2026-08-01', '2027-07-31', true
WHERE NOT EXISTS (SELECT 1 FROM academic_years WHERE label = 'AY 2026-2027');
UPDATE academic_years
SET start_date = '2026-08-01', end_date = '2027-07-31', is_active = true
WHERE label = 'AY 2026-2027';

UPDATE academic_terms
SET name = '1st Semester 2026-2027'
WHERE is_active = true;

-- Normalize school-year strings so enrollment filters match offerings
UPDATE course_offerings
SET school_year = replace(replace(school_year, E'\u2013', '-'), E'\u2014', '-')
WHERE school_year IS NOT NULL;
UPDATE student_semesters
SET school_year = replace(replace(school_year, E'\u2013', '-'), E'\u2014', '-')
WHERE school_year IS NOT NULL;
UPDATE misc_fees
SET school_year = replace(replace(school_year, E'\u2013', '-'), E'\u2014', '-')
WHERE school_year IS NOT NULL;

-- Students may create/update their own term row after they enroll
DROP POLICY IF EXISTS "Students insert own semesters" ON student_semesters;
CREATE POLICY "Students insert own semesters" ON student_semesters
  FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS "Students update own semesters" ON student_semesters;
CREATE POLICY "Students update own semesters" ON student_semesters
  FOR UPDATE TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

CREATE OR REPLACE FUNCTION public.sync_student_term_on_enroll()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  off RECORD;
  subj_count int;
  total_units numeric;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = NEW.student_id AND p.role = 'student'
  ) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO off FROM course_offerings WHERE id = NEW.offering_id;
  IF off IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)::int, COALESCE(SUM(co.units), 0)
  INTO subj_count, total_units
  FROM enrollments e
  JOIN course_offerings co ON co.id = e.offering_id
  WHERE e.student_id = NEW.student_id
    AND e.status = 'enrolled';

  UPDATE student_semesters
  SET is_current = false
  WHERE student_id = NEW.student_id;

  INSERT INTO student_semesters (
    student_id, school_year, semester, is_current, units_enrolled, subjects_enrolled
  ) VALUES (
    NEW.student_id, off.school_year, off.semester, true, total_units, subj_count
  )
  ON CONFLICT (student_id, school_year, semester)
  DO UPDATE SET
    is_current = true,
    units_enrolled = EXCLUDED.units_enrolled,
    subjects_enrolled = EXCLUDED.subjects_enrolled;

  PERFORM public.initialize_student_clearances(NEW.student_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_student_term_on_enroll ON enrollments;
CREATE TRIGGER trg_sync_student_term_on_enroll
AFTER INSERT ON enrollments
FOR EACH ROW
EXECUTE FUNCTION public.sync_student_term_on_enroll();
