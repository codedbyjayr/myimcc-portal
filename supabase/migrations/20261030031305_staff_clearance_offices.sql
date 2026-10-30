-- Apply the same office boundary to school data and isolated review data.
DO $migration$
DECLARE target text; private_schema text;
  ddl text := $ddl$
CREATE OR REPLACE FUNCTION private.staff_clearance_department() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $fn$
 SELECT CASE to_jsonb(p)->>'role_department'
   WHEN 'Guidance' THEN 'guidance' WHEN 'Cashier' THEN 'cashier' WHEN 'DSA' THEN 'dsa'
   WHEN 'Laboratory/Nursing Arts/Cybershack' THEN 'laboratory' WHEN 'Library' THEN 'library'
   WHEN 'Medical Clinic/Dental' THEN 'medical_dental' WHEN 'Property Custodian' THEN 'property_custodian'
   WHEN 'ROTC/CWTS' THEN 'rotc_cwts' END
 FROM public.profiles p WHERE p.id=auth.uid() AND p.role='staff' AND p.status='approved' AND p.is_active IS TRUE;
$fn$;
REVOKE ALL ON FUNCTION private.staff_clearance_department() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.staff_clearance_department() TO authenticated;

DROP POLICY IF EXISTS staff_clearance_office ON public.clearances;
CREATE POLICY staff_clearance_office ON public.clearances AS RESTRICTIVE FOR ALL TO authenticated
USING (NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.role='staff')
 OR department_code=(SELECT private.staff_clearance_department()))
WITH CHECK (NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.role='staff')
 OR department_code=(SELECT private.staff_clearance_department()));

CREATE OR REPLACE FUNCTION private.get_clearance_workspace()
RETURNS TABLE(id uuid,student_id uuid,department_code text,department_name text,officer_name text,icon text,
 status text,note text,cleared_at timestamptz,created_at timestamptz,profiles jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 IF public.is_mfa_compliant() IS DISTINCT FROM TRUE OR NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role IN ('staff','admin') AND p.status='approved' AND p.is_active IS TRUE
 ) THEN RAISE EXCEPTION 'Approved active clearance staff and MFA required' USING ERRCODE='42501'; END IF;
 -- Other offices are visible for context, but table writes stay office-scoped.
 RETURN QUERY SELECT c.id,c.student_id,c.department_code,c.department_name,c.officer_name,c.icon,c.status,c.note,c.cleared_at,c.created_at,
  jsonb_build_object('student_no',p.student_no,'full_name',p.full_name,'program',p.program,'year_level',p.year_level)
 FROM public.clearances c JOIN public.profiles p ON p.id=c.student_id
 WHERE p.role='student' ORDER BY c.created_at DESC,c.id;
END;
$fn$;
  $ddl$;
BEGIN
 FOR target IN SELECT DISTINCT unnest(ARRAY['public','imcc_review']) LOOP
  private_schema := CASE target WHEN 'public' THEN 'private' ELSE 'imcc_review_private' END;
  EXECUTE replace(replace(ddl,'public.',target||'.'),'private.',private_schema||'.');
 END LOOP;
END;
$migration$;
