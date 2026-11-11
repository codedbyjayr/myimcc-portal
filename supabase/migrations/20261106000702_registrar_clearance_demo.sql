-- The existing demo fixture uses REG. All records and authorization stay in the review schemas.
CREATE OR REPLACE FUNCTION imcc_review_private.get_registrar_clearance_workspace()
RETURNS TABLE (
  id uuid,
  student_id uuid,
  department_code text,
  department_name text,
  status text,
  note text,
  cleared_at timestamptz,
  profiles jsonb,
  clearances jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF imcc_review.is_mfa_compliant() IS DISTINCT FROM TRUE OR NOT EXISTS (
    SELECT 1 FROM imcc_review.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('registrar', 'admin')
      AND p.status = 'approved' AND p.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'Approved active Registrar access and MFA required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT c.id, c.student_id, c.department_code, c.department_name, c.status, c.note, c.cleared_at,
    jsonb_build_object('student_no', p.student_no, 'full_name', p.full_name,
      'program', p.program, 'year_level', p.year_level),
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('department_code', d.department_code,
        'department_name', d.department_name, 'status', d.status, 'note', d.note,
        'cleared_at', d.cleared_at) ORDER BY d.department_name)
      FROM imcc_review.clearances d WHERE d.student_id = c.student_id
    ), '[]'::jsonb)
  FROM imcc_review.clearances c
  JOIN imcc_review.profiles p ON p.id = c.student_id
  WHERE c.department_code = 'REG' AND p.role = 'student'
  ORDER BY p.full_name, p.student_no;
END;
$$;

CREATE OR REPLACE FUNCTION imcc_review.get_registrar_clearance_workspace()
RETURNS TABLE (
  id uuid,
  student_id uuid,
  department_code text,
  department_name text,
  status text,
  note text,
  cleared_at timestamptz,
  profiles jsonb,
  clearances jsonb
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$ SELECT * FROM imcc_review_private.get_registrar_clearance_workspace(); $$;

REVOKE ALL ON FUNCTION imcc_review_private.get_registrar_clearance_workspace() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION imcc_review.get_registrar_clearance_workspace() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION imcc_review_private.get_registrar_clearance_workspace() TO authenticated;
GRANT EXECUTE ON FUNCTION imcc_review.get_registrar_clearance_workspace() TO authenticated;
