BEGIN;

CREATE OR REPLACE FUNCTION private.publish_summer_offering(
  p_source_offering_id integer, p_school_year text, p_schedule text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE result jsonb;
BEGIN
  IF public.is_mfa_compliant() IS DISTINCT FROM TRUE OR NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('dean', 'admin', 'registrar')
      AND status = 'approved' AND is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'Active registrar, dean, or admin access required' USING ERRCODE = '42501';
  END IF;

  IF p_school_year IS NULL OR p_school_year !~ '^[0-9]{4}[-–—][0-9]{4}$' THEN
    RAISE EXCEPTION 'Enter a school year such as 2026-2027' USING ERRCODE = '23514';
  END IF;
  IF left(p_school_year, 4)::integer + 1 <> right(p_school_year, 4)::integer THEN
    RAISE EXCEPTION 'School year must contain consecutive years' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.course_offerings (code, title, units, program, year, semester, school_year, schedule, is_major)
  SELECT code, title, units, program, year, 'Summer', translate(p_school_year, '–—', '--'), nullif(btrim(p_schedule), ''), is_major
  FROM public.course_offerings
  WHERE id = p_source_offering_id AND year BETWEEN 1 AND 4 AND units > 0
  RETURNING to_jsonb(course_offerings) INTO result;
  IF result IS NULL THEN
    RAISE EXCEPTION 'Choose an existing subject with a valid year level and units' USING ERRCODE = 'P0002';
  END IF;
  RETURN result;
END;
$$;

-- Demo authorization and offering writes stay in the review schemas.
CREATE OR REPLACE FUNCTION imcc_review_private.publish_summer_offering(
  p_source_offering_id integer, p_school_year text, p_schedule text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE result jsonb;
BEGIN
  IF imcc_review.is_mfa_compliant() IS DISTINCT FROM TRUE OR NOT EXISTS (
    SELECT 1 FROM imcc_review.profiles
    WHERE id = auth.uid() AND role IN ('dean', 'admin', 'registrar')
      AND status = 'approved' AND is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'Active registrar, dean, or admin access required' USING ERRCODE = '42501';
  END IF;

  IF p_school_year IS NULL OR p_school_year !~ '^[0-9]{4}[-–—][0-9]{4}$' THEN
    RAISE EXCEPTION 'Enter a school year such as 2026-2027' USING ERRCODE = '23514';
  END IF;
  IF left(p_school_year, 4)::integer + 1 <> right(p_school_year, 4)::integer THEN
    RAISE EXCEPTION 'School year must contain consecutive years' USING ERRCODE = '23514';
  END IF;

  INSERT INTO imcc_review.course_offerings (code, title, units, program, year, semester, school_year, schedule, is_major)
  SELECT code, title, units, program, year, 'Summer', translate(p_school_year, '–—', '--'), nullif(btrim(p_schedule), ''), is_major
  FROM imcc_review.course_offerings
  WHERE id = p_source_offering_id AND year BETWEEN 1 AND 4 AND units > 0
  RETURNING to_jsonb(course_offerings) INTO result;
  IF result IS NULL THEN
    RAISE EXCEPTION 'Choose an existing subject with a valid year level and units' USING ERRCODE = 'P0002';
  END IF;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION imcc_review.publish_summer_offering(
  p_source_offering_id integer, p_school_year text, p_schedule text DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT imcc_review_private.publish_summer_offering(p_source_offering_id, p_school_year, p_schedule); $$;

REVOKE ALL ON FUNCTION imcc_review_private.publish_summer_offering(integer, text, text),
  imcc_review.publish_summer_offering(integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION imcc_review_private.publish_summer_offering(integer, text, text),
  imcc_review.publish_summer_offering(integer, text, text) TO authenticated;

COMMIT;
