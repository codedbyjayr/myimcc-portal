import { readFile } from 'node:fs/promises';

// Reuse the exact application SQL, with a separate namespace and no school rows.
export async function buildDemoReview() {
  const files = ['test-environment/schema.sql',
    'migrations/20261015164009_production_role_workflows.sql',
    'migrations/20261021035015_production_school_grading.sql',
    'migrations/20261021040134_exact_school_grade_scale.sql',
    'pending/20261021111506_adviser_requirements.sql'];
  const sources = await Promise.all(files.map(file => readFile(new URL('../supabase/' + file, import.meta.url), 'utf8')));
  const sql = sources.join('\n').replace(/^CREATE TRIGGER on_auth_user_created[^\n]*\n/gm, '')
    .replace(/^CREATE EXTENSION[^\n]*\n/gm, '').replace(/^(BEGIN|COMMIT);\s*$/gm, '')
    .replace(/\bpublic\b/g, 'imcc_review').replace(/\bprivate\b/g, 'imcc_review_private')
    .replace(/^SET (check_function_bodies|search_path)/gm,'SET LOCAL $1');
  const seed = await readFile(new URL('../supabase/pending/demo_review_seed.sql',import.meta.url),'utf8');
  return `BEGIN;
CREATE SCHEMA imcc_review;
${sql}
SET LOCAL search_path=imcc_review,extensions,pg_catalog;
ALTER FUNCTION imcc_review.set_updated_at() SET search_path='';
ALTER TABLE imcc_review.profiles DROP CONSTRAINT profiles_role_check;
ALTER TABLE imcc_review.profiles ADD CONSTRAINT profiles_role_check CHECK(role IN ('student','faculty','teacher','staff','admin','dean','registrar'));
CREATE TABLE imcc_review_private.control (id boolean PRIMARY KEY DEFAULT true CHECK(id), enabled_until timestamptz, retired boolean NOT NULL DEFAULT false, accounts jsonb NOT NULL DEFAULT '{}', ticket_secret text NOT NULL DEFAULT encode(extensions.gen_random_bytes(32),'hex'));
INSERT INTO imcc_review_private.control(id) VALUES(true);
REVOKE ALL ON imcc_review_private.control FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION imcc_review.is_mfa_compliant() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM imcc_review_private.control WHERE enabled_until>now() AND NOT retired)
 AND EXISTS(SELECT 1 FROM imcc_review.profiles WHERE id=auth.uid() AND is_active IS TRUE AND status='approved');
$$;
CREATE OR REPLACE FUNCTION imcc_review.is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT imcc_review.is_mfa_compliant() AND EXISTS(SELECT 1 FROM imcc_review.profiles
 WHERE id=auth.uid() AND role='admin' AND status='approved' AND is_active IS TRUE);
$$;
DO $$ DECLARE t record; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='imcc_review' LOOP
   EXECUTE format('ALTER TABLE imcc_review.%I ENABLE ROW LEVEL SECURITY',t.tablename);
   EXECUTE format('CREATE POLICY review_expiry ON imcc_review.%I AS RESTRICTIVE FOR ALL TO authenticated USING (imcc_review.is_mfa_compliant()) WITH CHECK (imcc_review.is_mfa_compliant())',t.tablename);
 END LOOP;
 FOR t IN SELECT viewname FROM pg_views WHERE schemaname='imcc_review' LOOP
   EXECUTE format('ALTER VIEW imcc_review.%I SET (security_invoker=true)',t.viewname);
 END LOOP;
END $$;
REVOKE ALL ON SCHEMA imcc_review,imcc_review_private FROM PUBLIC,anon;
REVOKE ALL ON ALL TABLES IN SCHEMA imcc_review FROM PUBLIC,anon;
REVOKE TRUNCATE,TRIGGER,REFERENCES ON ALL TABLES IN SCHEMA imcc_review FROM authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA imcc_review,imcc_review_private FROM PUBLIC,anon;

CREATE FUNCTION public.developer_demo_status(p_enable boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE deadline timestamptz;
BEGIN
 IF auth.jwt()->>'aal' IS DISTINCT FROM 'aal2' OR NOT EXISTS(
   SELECT 1 FROM public.profiles p JOIN auth.users u ON u.id=p.id
   WHERE p.id=auth.uid() AND lower(u.email)='jlm33405@imcc.edu.ph' AND u.email_confirmed_at IS NOT NULL
   AND p.role='admin' AND p.status='approved' AND p.is_active IS TRUE
 ) THEN RAISE EXCEPTION 'Verified developer admin and MFA required' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM imcc_review_private.control WHERE retired) THEN RETURN jsonb_build_object('available',false); END IF;
 SELECT enabled_until INTO deadline FROM imcc_review_private.control WHERE id FOR UPDATE;
 IF p_enable AND (deadline IS NULL OR deadline<=now()) THEN
   deadline:=now()+interval '2 hours';
   UPDATE imcc_review_private.control SET enabled_until=deadline WHERE id;
 END IF;
 RETURN jsonb_build_object('available',true,'expiresAt',deadline,'accounts',(
   SELECT accounts FROM imcc_review_private.control WHERE id),'ticketSecret',(
   SELECT ticket_secret FROM imcc_review_private.control WHERE id));
END $$;
REVOKE ALL ON FUNCTION public.developer_demo_status(boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.developer_demo_status(boolean) TO authenticated;
${seed}
COMMIT;`;
}
