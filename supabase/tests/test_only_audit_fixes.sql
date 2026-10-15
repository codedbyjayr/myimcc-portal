-- Test project only. All fixture rows are rolled back.
BEGIN;
CREATE TEMP TABLE audit_fix_ids AS
SELECT (SELECT id FROM public.profiles WHERE email='student.demo@imcc.edu.ph') AS student,
       (SELECT id FROM public.profiles WHERE email='dean.demo@imcc.edu.ph') AS dean,
       NULL::integer AS eligible, NULL::integer AS wrong_program, NULL::integer AS wrong_year;
INSERT INTO public.course_offerings(code,title,program,year,units,school_year,semester)
VALUES ('AUDIT-ELIGIBLE','Eligible fixture','BSIT',1,3,'2997-2998','1st Semester') RETURNING id;
UPDATE audit_fix_ids SET eligible=currval('public.course_offerings_id_seq');
INSERT INTO public.course_offerings(code,title,program,year,units,school_year,semester)
VALUES ('AUDIT-PROGRAM','Wrong program fixture','BSCS',1,3,'2997-2998','1st Semester') RETURNING id;
UPDATE audit_fix_ids SET wrong_program=currval('public.course_offerings_id_seq');
INSERT INTO public.course_offerings(code,title,program,year,units,school_year,semester)
VALUES ('AUDIT-YEAR','Wrong year fixture','BSIT',2,3,'2997-2998','1st Semester') RETURNING id;
UPDATE audit_fix_ids SET wrong_year=currval('public.course_offerings_id_seq');
GRANT SELECT ON audit_fix_ids TO authenticated;

SELECT set_config('request.jwt.claims',json_build_object('sub',student,'role','authenticated','aal','aal1')::text,true) FROM audit_fix_ids;
SET LOCAL ROLE authenticated;
DO $$ DECLARE i record; BEGIN
  SELECT * INTO i FROM audit_fix_ids;
  INSERT INTO public.enrollment_requests(student_id,offering_id) VALUES(i.student,i.eligible);
  BEGIN
    INSERT INTO public.enrollment_requests(student_id,offering_id) VALUES(i.student,i.wrong_program);
    RAISE EXCEPTION 'Wrong-program request unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.enrollment_requests(student_id,offering_id) VALUES(i.student,i.wrong_year);
    RAISE EXCEPTION 'Wrong-year request unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

INSERT INTO public.enrollment_requests(student_id,offering_id,status,reviewed_by,reviewed_at,review_note)
SELECT student,eligible,'rejected',dean,now(),'Missing prerequisite' FROM audit_fix_ids;
SELECT set_config('request.jwt.claims',json_build_object('sub',dean,'role','authenticated','aal','aal1')::text,true) FROM audit_fix_ids;
SET LOCAL ROLE authenticated;
DO $$ DECLARE found jsonb; BEGIN
  SELECT value INTO found FROM jsonb_array_elements(public.list_enrollment_request_history('rejected')) AS items(value)
  WHERE value->>'code'='AUDIT-ELIGIBLE';
  IF found->>'review_note'<>'Missing prerequisite' THEN RAISE EXCEPTION 'Rejected request history or reason missing'; END IF;
END $$;
RESET ROLE;

DO $$ DECLARE offering integer; BEGIN
  SELECT eligible INTO offering FROM audit_fix_ids;
  BEGIN
    DELETE FROM public.course_offerings WHERE id=offering;
    RAISE EXCEPTION 'Offering with enrollment request was deleted';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  IF NOT EXISTS(SELECT 1 FROM public.course_offerings WHERE id=offering) THEN
    RAISE EXCEPTION 'Delete guard did not preserve the offering';
  END IF;
END $$;
ROLLBACK;
