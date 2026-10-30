BEGIN;
SELECT set_config('request.jwt.claims','{}',true);
INSERT INTO public.courses(code,title,program,year_level,semester,lec_units)
VALUES('TEST-ACADEMIC-4','Academic setup test subject','BSIT',4,1,3);
INSERT INTO auth.users(id,email) VALUES
 ('12000000-0000-0000-0000-000000000001','academic-profile@example.invalid'),
 ('12000000-0000-0000-0000-000000000002','academic-other@example.invalid');
INSERT INTO public.profiles(id,email,full_name,role,status,is_active,program,year_level)
VALUES ('12000000-0000-0000-0000-000000000001','academic-profile@example.invalid','Academic profile','student','onboarding',true,'BSIT',NULL),
 ('12000000-0000-0000-0000-000000000002','academic-other@example.invalid','Other profile','student','onboarding',true,'BSIT',NULL)
ON CONFLICT(id) DO UPDATE SET status='onboarding',is_active=true;
SELECT set_config('request.jwt.claims','{"sub":"12000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN
  UPDATE public.profiles SET requested_role='student',id_number='TEST-ACADEMIC' WHERE id=auth.uid();
  RAISE EXCEPTION 'Missing year accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  UPDATE public.profiles SET program='UNKNOWN',year_level='4th Year' WHERE id=auth.uid();
  RAISE EXCEPTION 'Unknown program accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  UPDATE public.profiles SET year_level='bad year' WHERE id=auth.uid();
  RAISE EXCEPTION 'Invalid year accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 UPDATE public.profiles SET program='BSIT',year_level='4th Year',requested_role='student',id_number='TEST-ACADEMIC' WHERE id=auth.uid();
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND program='BSIT' AND year_level='4th Year' AND status='pending') THEN
  RAISE EXCEPTION 'Setup did not save academic details with access request';
 END IF;
 UPDATE public.profiles SET year_level='4th Year' WHERE id='12000000-0000-0000-0000-000000000002';
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.profiles WHERE id='12000000-0000-0000-0000-000000000002' AND year_level IS NOT NULL) THEN
  RAISE EXCEPTION 'Another student profile was changed';
 END IF;
END $$;
UPDATE public.profiles SET status='approved' WHERE id='12000000-0000-0000-0000-000000000001';
SELECT set_config('request.jwt.claims','{"sub":"12000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN
  UPDATE public.profiles SET year_level='1st Year' WHERE id=auth.uid();
  RAISE EXCEPTION 'Approved student changed academic year';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 UPDATE public.profiles SET phone='123' WHERE id=auth.uid();
END $$;
RESET ROLE;
ROLLBACK;
