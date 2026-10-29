-- Store the office/college separately so existing role routing remains compatible.
ALTER TABLE public.profiles ADD COLUMN role_department text;
ALTER TABLE imcc_review.profiles ADD COLUMN role_department text;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_department_check CHECK (
  role_department IS NULL OR
  (role='staff' AND role_department IN ('Guidance','Cashier','DSA','Laboratory/Nursing Arts/Cybershack','Library','Medical Clinic/Dental','Property Custodian','ROTC/CWTS')) OR
  (role='dean' AND role_department IN ('CCS','CBA','CAS','CNM','CED','CCSJE','CHTM','CMT','CRT'))
);
CREATE OR REPLACE FUNCTION public.admin_set_profile_access(p_profile_id uuid,p_role text DEFAULT NULL,p_status text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  base_role text := split_part(p_role,':',1);
  department text := nullif(split_part(p_role,':',2),'');
BEGIN
  IF public.is_admin() IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Active admin access required' USING ERRCODE='42501';
  END IF;
  IF (p_role IS NULL AND p_status IS NULL)
     OR (p_role IS NOT NULL AND (base_role NOT IN ('student','faculty','teacher','staff','admin','dean','registrar')
       OR array_length(string_to_array(p_role,':'),1)>2
       OR (position(':' IN p_role)>0 AND department IS NULL)))
     OR (p_status IS NOT NULL AND p_status NOT IN ('approved','pending','rejected','onboarding')) THEN
    RAISE EXCEPTION 'Invalid role or status' USING ERRCODE='22023';
  END IF;
  IF department IS NOT NULL AND NOT (
    (base_role='staff' AND department IN ('Guidance','Cashier','DSA','Laboratory/Nursing Arts/Cybershack','Library','Medical Clinic/Dental','Property Custodian','ROTC/CWTS')) OR
    (base_role='dean' AND department IN ('CCS','CBA','CAS','CNM','CED','CCSJE','CHTM','CMT','CRT'))
  ) THEN
    RAISE EXCEPTION 'Invalid role department' USING ERRCODE='22023';
  END IF;
  UPDATE public.profiles SET role=coalesce(base_role,role),
    role_department=CASE WHEN p_role IS NULL THEN role_department ELSE department END,
    status=coalesce(p_status,status),updated_at=now() WHERE id=p_profile_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found' USING ERRCODE='P0002'; END IF;
END;
$$;

ALTER TABLE imcc_review.profiles ADD CONSTRAINT profiles_role_department_check CHECK (
  role_department IS NULL OR
  (role='staff' AND role_department IN ('Guidance','Cashier','DSA','Laboratory/Nursing Arts/Cybershack','Library','Medical Clinic/Dental','Property Custodian','ROTC/CWTS')) OR
  (role='dean' AND role_department IN ('CCS','CBA','CAS','CNM','CED','CCSJE','CHTM','CMT','CRT'))
);
CREATE OR REPLACE FUNCTION imcc_review.admin_set_profile_access(p_profile_id uuid,p_role text DEFAULT NULL,p_status text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  base_role text := split_part(p_role,':',1);
  department text := nullif(split_part(p_role,':',2),'');
BEGIN
  IF imcc_review.is_admin() IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Active admin access required' USING ERRCODE='42501';
  END IF;
  IF (p_role IS NULL AND p_status IS NULL)
     OR (p_role IS NOT NULL AND (base_role NOT IN ('student','faculty','teacher','staff','admin','dean','registrar')
       OR array_length(string_to_array(p_role,':'),1)>2
       OR (position(':' IN p_role)>0 AND department IS NULL)))
     OR (p_status IS NOT NULL AND p_status NOT IN ('approved','pending','rejected','onboarding')) THEN
    RAISE EXCEPTION 'Invalid role or status' USING ERRCODE='22023';
  END IF;
  IF department IS NOT NULL AND NOT (
    (base_role='staff' AND department IN ('Guidance','Cashier','DSA','Laboratory/Nursing Arts/Cybershack','Library','Medical Clinic/Dental','Property Custodian','ROTC/CWTS')) OR
    (base_role='dean' AND department IN ('CCS','CBA','CAS','CNM','CED','CCSJE','CHTM','CMT','CRT'))
  ) THEN
    RAISE EXCEPTION 'Invalid role department' USING ERRCODE='22023';
  END IF;
  UPDATE imcc_review.profiles SET role=coalesce(base_role,role),
    role_department=CASE WHEN p_role IS NULL THEN role_department ELSE department END,
    status=coalesce(p_status,status),updated_at=now() WHERE id=p_profile_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found' USING ERRCODE='P0002'; END IF;
END;
$$;

CREATE FUNCTION private.guard_role_department() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE allowed boolean;
BEGIN
  IF (TG_OP='INSERT' AND NEW.role_department IS NULL)
     OR (TG_OP='UPDATE' AND NEW.role_department IS NOT DISTINCT FROM OLD.role_department)
     OR auth.uid() IS NULL THEN RETURN NEW; END IF;
  EXECUTE format('SELECT %I.is_admin()',TG_TABLE_SCHEMA) INTO allowed;
  IF allowed IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Only an admin can assign a role department' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.guard_role_department() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_role_department BEFORE INSERT OR UPDATE OF role_department ON public.profiles
FOR EACH ROW EXECUTE FUNCTION private.guard_role_department();
CREATE TRIGGER guard_role_department BEFORE INSERT OR UPDATE OF role_department ON imcc_review.profiles
FOR EACH ROW EXECUTE FUNCTION private.guard_role_department();
