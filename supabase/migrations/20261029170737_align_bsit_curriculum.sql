-- Keep the BSIT catalog aligned with the approved 51-subject, 150-unit curriculum.
LOCK TABLE public.courses, public.course_offerings IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.course_offerings
    WHERE upper(trim(code)) IN ('ENG 101','MATH 101','PROG 101','PROG 102','OS 101','SEC 101','PROJ 101','WEB 102','AI 101')
  ) THEN
    RAISE EXCEPTION 'Extra curriculum subjects have offerings; review their records before removing them';
  END IF;

  DELETE FROM public.courses
  WHERE code IN ('ENG 101','MATH 101','PROG 101','PROG 102','OS 101','SEC 101','PROJ 101','WEB 102','AI 101');
END $$;
