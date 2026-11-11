import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { buildDemoReview } from './build-demo-review.mjs';

// Test tools only: npm install --prefix .temp/adviser-db --no-save --package-lock=false @electric-sql/pglite@0.5.11 @electric-sql/pglite-pgvector@0.0.12
const moduleUrl = process.env.PGLITE_MODULE || pathToFileURL(`${process.cwd()}/.temp/adviser-db/node_modules/@electric-sql/pglite/dist/index.js`).href;
const { PGlite } = await import(moduleUrl);
const { uuid_ossp } = await import(new URL('./contrib/uuid_ossp.js', moduleUrl));
const { pgcrypto } = await import(new URL('./contrib/pgcrypto.js', moduleUrl));
const { vector } = await import(new URL('../../pglite-pgvector/dist/index.js', moduleUrl));
const db = new PGlite({ extensions: { uuid_ossp, pgcrypto, vector } });
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
  const baseline = await readFile(new URL('../supabase/test-environment/schema.sql', import.meta.url), 'utf8');
  await run('Existing portal schema', baseline);
  // The snapshot predates the five role-workflow increments promoted in this migration.
  await run('Existing role workflows', await readFile(new URL('../supabase/migrations/20261015164009_production_role_workflows.sql', import.meta.url), 'utf8'));
  await run('Existing school grading', await readFile(new URL('../supabase/migrations/20261021035015_production_school_grading.sql', import.meta.url), 'utf8'));
  await run('Existing school scale', await readFile(new URL('../supabase/migrations/20261021040134_exact_school_grade_scale.sql', import.meta.url), 'utf8'));
  await run('Production manual school equivalents', await readFile(new URL('../supabase/migrations/20261023002020_manual_school_equivalent.sql', import.meta.url), 'utf8'));
  await run('Reproduce pre-release revert MFA bypass', await readFile(new URL('../supabase/tests/grade_revert_mfa.sql', import.meta.url), 'utf8'));
  await run('Revert MFA guard', await readFile(new URL('../supabase/migrations/20261027120911_grade_revert_mfa_guard.sql', import.meta.url), 'utf8'));
  await db.exec("SELECT set_config('test.expect_mfa_block','on',false);");
  await run('Revert MFA rejection and legitimate controls', await readFile(new URL('../supabase/tests/grade_revert_mfa.sql', import.meta.url), 'utf8'));
  await run('Legacy assigned-term fixture', `
    INSERT INTO auth.users(id,email) VALUES('11000000-0000-0000-0000-000000000099','normalization-teacher@example.invalid');
    INSERT INTO public.profiles(id,email,full_name,role,status,is_active) VALUES('11000000-0000-0000-0000-000000000099','normalization-teacher@example.invalid','Normalization Teacher','teacher','approved',true)
    ON CONFLICT(id) DO UPDATE SET role='teacher',status='approved',is_active=true;
    INSERT INTO public.course_offerings(code,title,units,year,semester,school_year,instructor_id)
    VALUES('NORM101','Legacy assigned term',3,1,'2nd Semester','2095–2096','11000000-0000-0000-0000-000000000099');
  `);
  await run('Ordered backend release', await readFile(new URL('../supabase/migrations/20261027131814_backend_semester_release.sql', import.meta.url), 'utf8'));
  await run('Prevent repeat term enrollment', await readFile(new URL('../supabase/migrations/20261029063928_prevent_repeat_term_enrollment.sql', import.meta.url), 'utf8'));
  await run('Enrollment opening notifications', await readFile(new URL('../supabase/migrations/20261029114553_enrollment_open_notifications.sql', import.meta.url), 'utf8'));
  await run('Enrollment opening notification regression', await readFile(new URL('../supabase/tests/enrollment_open_notifications.sql', import.meta.url), 'utf8'));
  await run('Independent enrollment terms', await readFile(new URL('../supabase/migrations/20261029124809_independent_enrollment_terms.sql', import.meta.url), 'utf8'));
  await run('Empty enrollment terms regression', await readFile(new URL('../supabase/tests/independent_enrollment_terms.sql', import.meta.url), 'utf8'));
  await run('Publish curriculum when terms open', await readFile(new URL('../supabase/migrations/20261029221247_publish_curriculum_on_term_open.sql', import.meta.url), 'utf8'));
  await run('Repeat term enrollment boundary', await readFile(new URL('../supabase/tests/repeat_term_enrollment.sql', import.meta.url), 'utf8'));
  await run('Assigned-term normalization retains one assignment', `DO $$ BEGIN
    IF (SELECT count(*) FROM public.teacher_assignments WHERE teacher_id='11000000-0000-0000-0000-000000000099')<>1
       OR NOT EXISTS(SELECT 1 FROM public.teacher_assignments WHERE teacher_id='11000000-0000-0000-0000-000000000099' AND academic_year='2095-2096' AND is_active)
    THEN RAISE EXCEPTION 'Normalization duplicated or deactivated the existing assignment'; END IF;
  END $$;`);
  await run('FAQ vector retrieval and content invalidation', await readFile(new URL('../supabase/tests/faq_search.sql', import.meta.url), 'utf8'));
  await run('Backend boundary regression', await readFile(new URL('../supabase/tests/backend_access_controls.sql', import.meta.url), 'utf8'));
  await run('Semester integrity regression', await readFile(new URL('../supabase/tests/semester_integrity.sql', import.meta.url), 'utf8'));
  await run('Attendance assignment and enrollment regression', await readFile(new URL('../supabase/tests/attendance_assignment_writes.sql', import.meta.url), 'utf8'));
  await run('Evaluation anonymity and stable instructor identity', await readFile(new URL('../supabase/tests/faculty_evaluation_identity.sql', import.meta.url), 'utf8'));
  const demo = await buildDemoReview();
  await run('Isolated review schema',demo);
  await run('Independent enrollment terms in the review schema', await readFile(new URL('../supabase/migrations/20261029125355_review_enrollment_term_parity.sql', import.meta.url), 'utf8'));
  await run('Registrar demo clearance workspace', await readFile(new URL('../supabase/migrations/20261106000702_registrar_clearance_demo.sql', import.meta.url), 'utf8'));
  // The local generator copied this RPC from public before the hosted demo had it.
  await run('Match the deployed demo migration baseline', `
    DROP FUNCTION imcc_review.publish_summer_offering(integer, text, text);
    DROP FUNCTION imcc_review_private.publish_summer_offering(integer, text, text);
  `);
  await run('Frontend release readiness', await readFile(new URL('../supabase/migrations/20261108140909_frontend_release_readiness.sql', import.meta.url), 'utf8'));
  await run('Frontend gate rejects the old Summer RPCs as anon', `
    SET ROLE anon;
    DO $$ BEGIN
      IF public.portal_frontend_release_ready() IS NOT NULL THEN
        RAISE EXCEPTION 'Frontend gate accepted the old Summer RPCs';
      END IF;
    END $$;
    RESET ROLE;
  `);
  await run('Registrar Summer publishing', await readFile(new URL('../supabase/migrations/20261106065351_registrar_summer_publishing.sql', import.meta.url), 'utf8'));
  await run('Frontend gate accepts the updated Summer RPCs as anon', `
    SET ROLE anon;
    DO $$ BEGIN
      IF public.portal_frontend_release_ready() IS DISTINCT FROM 'registrar-summer-v1' THEN
        RAISE EXCEPTION 'Frontend gate rejected the updated Summer RPCs';
      END IF;
    END $$;
    RESET ROLE;
  `);
  const adviserRegression = await readFile(new URL('../supabase/tests/adviser_requirements.sql',import.meta.url),'utf8');
  await run('Adviser role and workflow regression', adviserRegression);
  await run('Enable local review fixtures',"UPDATE imcc_review_private.control SET enabled_until=now()+interval '1 hour';");
  const regression = adviserRegression.replace(/\bpublic\b/g,'imcc_review').replace(/\bprivate\b/g,'imcc_review_private');
  await run('Review uses actual role and workflow rules',regression);
  await run('Demo provisioning, school-record isolation and expiry',await readFile(new URL('../supabase/tests/demo_review_isolation.sql',import.meta.url),'utf8'));
  await run('Retire review access',await readFile(new URL('../supabase/pending/retire_demo_review.sql',import.meta.url),'utf8'));
  await run('Retirement revokes previously issued identities',`DO $$ BEGIN
    IF has_schema_privilege('authenticated','imcc_review','USAGE') OR has_schema_privilege('authenticated','imcc_review_private','USAGE')
      OR NOT EXISTS(SELECT 1 FROM imcc_review_private.control WHERE retired AND enabled_until IS NULL)
    THEN RAISE EXCEPTION 'Demo retirement did not revoke access'; END IF;
  END $$;`);
  await run('Approved BSIT curriculum', await readFile(new URL('../supabase/migrations/20261029170737_align_bsit_curriculum.sql', import.meta.url), 'utf8'));
  await run('Admin role departments', await readFile(new URL('../supabase/migrations/20261029172328_admin_role_departments.sql', import.meta.url), 'utf8'));
  await run('Admin role department regression', await readFile(new URL('../supabase/tests/admin_role_departments.sql', import.meta.url), 'utf8'));
  await run('Curriculum enrollment workflow', await readFile(new URL('../supabase/tests/term_curriculum.sql', import.meta.url), 'utf8'));
  await run('Student academic profile validation', await readFile(new URL('../supabase/migrations/20261030024242_student_academic_profile.sql', import.meta.url), 'utf8'));
  await run('Student academic setup and access regression', await readFile(new URL('../supabase/tests/student_academic_profile.sql', import.meta.url), 'utf8'));
  await run('Staff clearance offices', await readFile(new URL('../supabase/migrations/20261030031305_staff_clearance_offices.sql', import.meta.url), 'utf8'));
  await run('Staff clearance office regression', await readFile(new URL('../supabase/tests/staff_clearance_offices.sql', import.meta.url), 'utf8'));
  await run('FAQ guidance refresh', await readFile(new URL('../supabase/migrations/20261030033520_faq_guidance_refresh.sql', import.meta.url), 'utf8'));
  await run('FAQ guide content regression', await readFile(new URL('../supabase/tests/faq_guidance.sql', import.meta.url), 'utf8'));
} catch (error) {
  if (!process.exitCode) { console.error(error.message); process.exitCode = 1; }
} finally { await db.close(); }
