-- Students request; approved active staff/deans finalize through the existing review RPC.
CREATE TABLE public.enrollment_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 student_id uuid NOT NULL REFERENCES public.profiles(id),
 offering_id integer NOT NULL REFERENCES public.course_offerings(id),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now(),
 reviewed_by uuid REFERENCES public.profiles(id),
 reviewed_at timestamptz,
 review_note text CHECK (char_length(review_note)<=1000),
 cancelled_at timestamptz
);
CREATE UNIQUE INDEX enrollment_requests_pending_unique ON public.enrollment_requests(student_id,offering_id) WHERE status='pending';
CREATE INDEX enrollment_requests_offering_idx ON public.enrollment_requests(offering_id);
CREATE INDEX enrollment_requests_reviewer_idx ON public.enrollment_requests(reviewed_by);
ALTER TABLE public.enrollment_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.enrollment_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.enrollment_requests TO authenticated;
GRANT ALL ON public.enrollment_requests TO service_role;
CREATE POLICY students_read_requests ON public.enrollment_requests FOR SELECT TO authenticated USING (student_id=(SELECT auth.uid()));
CREATE POLICY students_submit_requests ON public.enrollment_requests FOR INSERT TO authenticated WITH CHECK (
 student_id=(SELECT auth.uid()) AND status='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL
 AND review_note IS NULL AND cancelled_at IS NULL
 AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.role='student' AND p.status='approved' AND p.is_active IS TRUE)
 AND NOT EXISTS(SELECT 1 FROM public.enrollments e WHERE e.student_id=(SELECT auth.uid()) AND e.offering_id=enrollment_requests.offering_id AND e.status IN ('enrolled','completed'))
);
CREATE POLICY requests_mfa ON public.enrollment_requests AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.is_mfa_compliant())) WITH CHECK ((SELECT public.is_mfa_compliant()));
GRANT USAGE ON SCHEMA private TO authenticated;
CREATE OR REPLACE FUNCTION private.review_enrollment_request(p_request_id uuid, p_decision text, p_review_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_request public.enrollment_requests%ROWTYPE;
  v_student_eligible boolean;
  v_enrollment_id uuid;
BEGIN
  IF v_actor IS NULL OR NOT public.is_mfa_compliant() THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_decision IS NULL OR p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Decision must be approved or rejected' USING ERRCODE = '22023';
  END IF;

  IF p_review_note IS NOT NULL AND pg_catalog.char_length(p_review_note) > 1000 THEN
    RAISE EXCEPTION 'Review note must be 1000 characters or fewer' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = v_actor
      AND p.role = ANY (ARRAY['admin', 'dean', 'registrar', 'staff'])
      AND p.status = 'approved'
      AND p.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'Approved active enrollment reviewer access required' USING ERRCODE = '42501';
  END IF;

  SELECT r.*
  INTO v_request
  FROM public.enrollment_requests r
  WHERE r.id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Enrollment request not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending requests can be reviewed' USING ERRCODE = '55000';
  END IF;

  IF p_decision = 'approved' THEN
    PERFORM 1
    FROM public.profiles p
    WHERE p.id = v_request.student_id
    FOR UPDATE;

    SELECT EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = v_request.student_id
        AND p.role = 'student'
        AND p.status = 'approved'
        AND p.is_active IS TRUE
    )
    INTO v_student_eligible;

    IF v_student_eligible IS NOT TRUE THEN
      RAISE EXCEPTION 'Student is no longer approved and active' USING ERRCODE = '42501';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.enrollments e
      WHERE e.student_id = v_request.student_id
        AND e.offering_id = v_request.offering_id
        AND e.status IN ('enrolled', 'completed')
    ) THEN
      RAISE EXCEPTION 'Student already has an enrolled or completed record for this offering' USING ERRCODE = '23505';
    END IF;

    INSERT INTO public.enrollments (student_id, offering_id, status)
    VALUES (v_request.student_id, v_request.offering_id, 'enrolled')
    RETURNING id INTO v_enrollment_id;
  END IF;

  UPDATE public.enrollment_requests r
  SET status = p_decision,
      reviewed_by = v_actor,
      reviewed_at = pg_catalog.now(),
      review_note = p_review_note
  WHERE r.id = v_request.id;

  RETURN pg_catalog.jsonb_build_object(
    'request_id', v_request.id,
    'status', p_decision,
    'enrollment_id', v_enrollment_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION private.list_enrollment_requests() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.created_at),'[]'::jsonb) FROM (
 SELECT r.id,r.created_at,p.full_name AS student_name,p.student_no,o.code,o.title,o.school_year,o.semester
 FROM public.enrollment_requests r JOIN public.profiles p ON p.id=r.student_id JOIN public.course_offerings o ON o.id=r.offering_id
 WHERE r.status='pending' AND public.is_mfa_compliant() AND EXISTS (
 SELECT 1 FROM public.profiles actor WHERE actor.id=(SELECT auth.uid()) AND actor.role IN ('dean','admin','staff','registrar') AND actor.status='approved' AND actor.is_active IS TRUE)
 ) q;
$$;
CREATE OR REPLACE FUNCTION public.list_enrollment_requests() RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT private.list_enrollment_requests(); $$;
REVOKE ALL ON FUNCTION private.list_enrollment_requests(),public.list_enrollment_requests() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.list_enrollment_requests(),public.list_enrollment_requests() TO authenticated;
