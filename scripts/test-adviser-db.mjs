import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { buildDemoReview } from './build-demo-review.mjs';

// Optional test runtime only: npm install --prefix .temp/adviser-db --no-save --package-lock=false @electric-sql/pglite@0.5.10
const moduleUrl = process.env.PGLITE_MODULE || pathToFileURL(`${process.cwd()}/.temp/adviser-db/node_modules/@electric-sql/pglite/dist/index.js`).href;
const { PGlite } = await import(moduleUrl);
const { uuid_ossp } = await import(new URL('./contrib/uuid_ossp.js', moduleUrl));
const { pgcrypto } = await import(new URL('./contrib/pgcrypto.js', moduleUrl));
const db = new PGlite({ extensions: { uuid_ossp, pgcrypto } });
async function run(label, sql) {
  try { await db.exec(sql); console.log(label + ': passed'); }
  catch (error) { console.error(label + ': ' + error.message + (error.where ? '\n' + error.where : '')); process.exitCode = 1; throw error; }
}
try {
  await run('Supabase auth test shim', `
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA extensions;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb DEFAULT '{}',raw_app_meta_data jsonb DEFAULT '{}');
    CREATE TABLE auth.mfa_factors(id uuid,user_id uuid,status text);
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb); $$;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (auth.jwt()->>'sub')::uuid; $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT coalesce(auth.jwt()->>'role',''); $$;
    CREATE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS $$ SELECT auth.jwt()->>'email'; $$;
    GRANT USAGE ON SCHEMA auth,public,extensions TO anon,authenticated,service_role;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon,authenticated,service_role;
  `);
  // FAQ vector storage is unrelated to these workflows. No FAQ query is executed here.
  let baseline = await readFile(new URL('../supabase/test-environment/schema.sql', import.meta.url), 'utf8');
  baseline = baseline.replace(/CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;/g, '').replace(/^CREATE INDEX[^\n]*USING hnsw[^\n]*\n/gm, '').replace(/\bvector(?:\(384\))?/g, 'text');
  await run('Existing portal schema', baseline);
  // The snapshot predates the five role-workflow increments promoted in this migration.
  await run('Existing role workflows', await readFile(new URL('../supabase/migrations/20261015164009_production_role_workflows.sql', import.meta.url), 'utf8'));
  await run('Existing school grading', await readFile(new URL('../supabase/migrations/20261021035015_production_school_grading.sql', import.meta.url), 'utf8'));
  await run('Existing school scale', await readFile(new URL('../supabase/migrations/20261021040134_exact_school_grade_scale.sql', import.meta.url), 'utf8'));
  await run('Adviser migration', await readFile(new URL('../supabase/pending/20261021111506_adviser_requirements.sql', import.meta.url), 'utf8'));
  await run('Adviser role and workflow regression', await readFile(new URL('../supabase/tests/adviser_requirements.sql', import.meta.url), 'utf8'));
  let demo = await buildDemoReview();
  demo = demo.replace(/^CREATE INDEX[^\n]*USING hnsw[^\n]*\n/gm,'').replace(/\bvector(?:\(384\))?/g,'text');
  await run('Isolated review schema',demo);
  await run('Enable local review fixtures',"UPDATE imcc_review_private.control SET enabled_until=now()+interval '1 hour';");
  const regression = (await readFile(new URL('../supabase/tests/adviser_requirements.sql',import.meta.url),'utf8'))
    .replace(/\bpublic\b/g,'imcc_review').replace(/\bprivate\b/g,'imcc_review_private');
  await run('Review uses actual role and workflow rules',regression);
  await run('Demo provisioning, school-record isolation and expiry',await readFile(new URL('../supabase/tests/demo_review_isolation.sql',import.meta.url),'utf8'));
  await run('Retire review access',await readFile(new URL('../supabase/pending/retire_demo_review.sql',import.meta.url),'utf8'));
  await run('Retirement revokes previously issued identities',`DO $$ BEGIN
    IF has_schema_privilege('authenticated','imcc_review','USAGE') OR has_schema_privilege('authenticated','imcc_review_private','USAGE')
      OR NOT EXISTS(SELECT 1 FROM imcc_review_private.control WHERE retired AND enabled_until IS NULL)
    THEN RAISE EXCEPTION 'Demo retirement did not revoke access'; END IF;
  END $$;`);
} catch (error) {
  if (!process.exitCode) { console.error(error.message); process.exitCode = 1; }
} finally { await db.close(); }
