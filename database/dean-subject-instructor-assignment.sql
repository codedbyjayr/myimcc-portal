-- =====================================================================
-- MyIMCC Portal — Dean Subject-Instructor Assignment Migration
--
-- Provides:
-- 1. Table schema & indexes for public.teacher_assignments
-- 2. RPC get_subject_instructor_options() for listing eligible instructors
-- 3. Atomic RPC save_course_offering_with_instructor() for creating & updating
--    course offerings with synchronised teacher_assignments
-- 4. DB trigger to ensure course_offerings.instructor_id and
--    teacher_assignments.teacher_id never drift out of sync
--
-- Security:
-- - All functions are SECURITY DEFINER with fixed safe search_path
-- - Full table qualification (public.*)
-- - Strict role verification: caller must be approved active dean
-- - Instructor verification: selected instructor must be approved active teacher/faculty
-- - Granted only to authenticated; revoked from anon and public
-- =====================================================================

-- ── 1. Ensure teacher_assignments table and unique constraint exist ──
CREATE TABLE IF NOT EXISTS public.teacher_assignments (
  id SERIAL PRIMARY KEY,
  teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  offering_id INTEGER NOT NULL REFERENCES public.course_offerings(id) ON DELETE CASCADE,
  academic_year TEXT NOT NULL,
  semester TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Ensure instructor_id column exists on course_offerings
ALTER TABLE public.course_offerings
  ADD COLUMN IF NOT EXISTS instructor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Unique slot index to support ON CONFLICT upsert
CREATE UNIQUE INDEX IF NOT EXISTS uq_teacher_assignments_slot
  ON public.teacher_assignments (teacher_id, offering_id, academic_year, semester);

CREATE INDEX IF NOT EXISTS idx_teacher_assignments_offering_active
  ON public.teacher_assignments (offering_id, is_active);

CREATE INDEX IF NOT EXISTS idx_teacher_assignments_teacher_active
  ON public.teacher_assignments (teacher_id, is_active);

ALTER TABLE public.teacher_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Deans and teachers read teacher_assignments" ON public.teacher_assignments;
CREATE POLICY "Deans and teachers read teacher_assignments" ON public.teacher_assignments
  FOR SELECT TO authenticated
  USING (
    teacher_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid())
        AND role IN ('dean', 'admin', 'registrar')
        AND status = 'approved'
    )
  );

DROP POLICY IF EXISTS "Deans and admin manage teacher_assignments" ON public.teacher_assignments;
CREATE POLICY "Deans and admin manage teacher_assignments" ON public.teacher_assignments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid())
        AND role IN ('dean', 'admin')
        AND status = 'approved'
    )
  );

-- ── 2. RPC get_subject_instructor_options ─────────────────────────────
-- Returns approved, active teacher or faculty profiles.
-- Accessible only by approved, active deans.
CREATE OR REPLACE FUNCTION public.get_subject_instructor_options()
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  role TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
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

  IF v_caller_role != 'dean' OR v_caller_status != 'approved' OR NOT v_caller_active THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.id, p.full_name, p.role
  FROM public.profiles p
  WHERE p.role IN ('teacher', 'faculty')
    AND p.status = 'approved'
    AND COALESCE(p.is_active, true) = true
  ORDER BY p.full_name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_subject_instructor_options FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_subject_instructor_options FROM anon;
GRANT EXECUTE ON FUNCTION public.get_subject_instructor_options TO authenticated;

-- ── 3. RPC save_course_offering_with_instructor ───────────────────────
-- Creates or updates a course offering and its active instructor assignment
-- in an atomic transaction.
CREATE OR REPLACE FUNCTION public.save_course_offering_with_instructor(
  p_offering_id INTEGER DEFAULT NULL,
  p_code TEXT DEFAULT NULL,
  p_title TEXT DEFAULT NULL,
  p_units NUMERIC DEFAULT 3.0,
  p_program TEXT DEFAULT NULL,
  p_year INTEGER DEFAULT 1,
  p_semester TEXT DEFAULT NULL,
  p_school_year TEXT DEFAULT NULL,
  p_schedule TEXT DEFAULT NULL,
  p_instructor_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
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

  IF v_caller_role != 'dean' OR v_caller_status != 'approved' OR NOT v_caller_active THEN
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

  IF v_instructor_role NOT IN ('teacher', 'faculty') OR v_instructor_status != 'approved' OR NOT v_instructor_active THEN
    RAISE EXCEPTION 'Selected instructor is not an approved active teacher or faculty member';
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
$$;

REVOKE ALL ON FUNCTION public.save_course_offering_with_instructor FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_course_offering_with_instructor FROM anon;
GRANT EXECUTE ON FUNCTION public.save_course_offering_with_instructor TO authenticated;

-- ── 4. Trigger to maintain consistency on direct writes ───────────────
CREATE OR REPLACE FUNCTION public.sync_teacher_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
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
$$;

DROP TRIGGER IF EXISTS trg_sync_teacher_assignment ON public.course_offerings;
CREATE TRIGGER trg_sync_teacher_assignment
  AFTER INSERT OR UPDATE OF instructor_id, school_year, semester
  ON public.course_offerings
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_teacher_assignment();

REVOKE EXECUTE ON FUNCTION public.sync_teacher_assignment() FROM anon;
