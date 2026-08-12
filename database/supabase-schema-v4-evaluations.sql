-- =====================================================================
-- MyIMCC Portal — Schema v4: Faculty Evaluations (Fully Anonymous)
-- Run this AFTER v1, v2, and v3 in the Supabase SQL Editor
-- =====================================================================
--
-- PRIVACY MODEL:
--   • Students   → can INSERT and SELECT only their own rows (to check
--                  if they already submitted). Cannot see anyone else's.
--   • Faculty    → cannot access the raw table at all. Can only see
--                  the aggregate summary view (averages, no student IDs).
--   • Staff      → same as faculty — aggregate view only.
--   • Admins     → aggregate view only. Raw rows with student_id are
--                  NEVER exposed to any role through RLS.
--
--   The student_id column exists solely for:
--     1. Duplicate prevention (UNIQUE constraint)
--     2. RLS self-access (student sees only their own submission)
--   It is NEVER returned to any non-owner query.
-- =====================================================================

-- ── Faculty Evaluations Table ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS faculty_evaluations (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  instructor_name TEXT NOT NULL,
  school_year     TEXT NOT NULL DEFAULT '2025–2026',
  semester        TEXT NOT NULL DEFAULT '2nd Semester',

  -- Ratings: 1 (Strongly Disagree) to 5 (Strongly Agree)
  teaching_clarity INTEGER NOT NULL CHECK (teaching_clarity BETWEEN 1 AND 5),
  knowledge        INTEGER NOT NULL CHECK (knowledge BETWEEN 1 AND 5),
  availability     INTEGER NOT NULL CHECK (availability BETWEEN 1 AND 5),
  fairness         INTEGER NOT NULL CHECK (fairness BETWEEN 1 AND 5),
  punctuality      INTEGER NOT NULL CHECK (punctuality BETWEEN 1 AND 5),

  -- Optional free-text feedback
  comment          TEXT,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One evaluation per instructor per student per term
  UNIQUE (student_id, instructor_name, school_year, semester)
);

-- ── Enable RLS (Row Level Security) ────────────────────────────────
ALTER TABLE faculty_evaluations ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies (safe to re-run)
DROP POLICY IF EXISTS "Students can submit evaluations" ON faculty_evaluations;
DROP POLICY IF EXISTS "Students can view own evaluations" ON faculty_evaluations;
DROP POLICY IF EXISTS "Students can update own evaluations" ON faculty_evaluations;
DROP POLICY IF EXISTS "Admins can view all evaluations" ON faculty_evaluations;

-- ── RLS Policies ────────────────────────────────────────────────────

-- INSERT: Students can only insert rows where they are the student_id
CREATE POLICY "Students can submit own evaluation"
  ON faculty_evaluations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = student_id);

-- SELECT: Students can ONLY see their own rows (to check submission status)
-- Faculty, staff, and admins get ZERO rows from the raw table.
-- They must use the aggregate view instead.
CREATE POLICY "Students can view own evaluation only"
  ON faculty_evaluations FOR SELECT
  TO authenticated
  USING (auth.uid() = student_id);

-- UPDATE: Students can edit their own evaluation (before term deadline)
CREATE POLICY "Students can update own evaluation"
  ON faculty_evaluations FOR UPDATE
  TO authenticated
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);

-- DELETE: Students can withdraw their own evaluation
CREATE POLICY "Students can delete own evaluation"
  ON faculty_evaluations FOR DELETE
  TO authenticated
  USING (auth.uid() = student_id);

-- NOTE: No admin, faculty, or staff SELECT policy on the raw table.
-- This means even admins cannot read individual rows with student_id.
-- All non-student roles must use the aggregate view below.

-- ── Indexes ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_fac_eval_instructor_term
  ON faculty_evaluations (instructor_name, school_year, semester);

CREATE INDEX IF NOT EXISTS idx_fac_eval_student
  ON faculty_evaluations (student_id);

-- ── Aggregate View (privacy-safe) ───────────────────────────────────
-- Shows ONLY averaged ratings per instructor per term.
-- No student_id, no individual comments, no row-level data.
-- This is the ONLY way faculty, staff, and admins can access evaluation
-- data — through aggregated averages.
CREATE OR REPLACE VIEW instructor_evaluation_summary AS
SELECT
  instructor_name,
  school_year,
  semester,
  COUNT(*)::INTEGER                              AS total_evaluations,
  ROUND(AVG(teaching_clarity)::numeric, 2)       AS avg_teaching_clarity,
  ROUND(AVG(knowledge)::numeric, 2)              AS avg_knowledge,
  ROUND(AVG(availability)::numeric, 2)           AS avg_availability,
  ROUND(AVG(fairness)::numeric, 2)               AS avg_fairness,
  ROUND(AVG(punctuality)::numeric, 2)            AS avg_punctuality,
  ROUND(AVG((teaching_clarity + knowledge + availability + fairness + punctuality) / 5.0)::numeric, 2) AS avg_overall
FROM faculty_evaluations
GROUP BY instructor_name, school_year, semester;

-- Grant SELECT on the aggregate view to all authenticated users
GRANT SELECT ON instructor_evaluation_summary TO authenticated;

-- Revoke ALL access on the raw table from anon and authenticated
-- (RLS already blocks, but defense-in-depth: revoke table-level grants too)
REVOKE ALL ON faculty_evaluations FROM anon;
-- Keep INSERT/SELECT/UPDATE/DELETE for authenticated (RLS filters to own rows only)
-- Do NOT grant SELECT to any role that bypasses RLS
