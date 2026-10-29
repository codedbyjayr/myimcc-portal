# Backend release

## Curriculum publication when enrollment opens

`20261029221247_publish_curriculum_on_term_open.sql` is applied to Supabase.
Opening an enrollment term publishes missing catalog subjects for that semester,
using each subject's program, year, lecture plus lab units, and prerequisites.
The supplied 51-subject curriculum is mapped to BSIT. New catalog rows must have
`courses.program` set before automatic publication; unmapped rows are skipped.
Summer publishes only catalog rows explicitly marked semester 3, or offerings
staff publish separately. It does not copy regular-semester subjects automatically.

Existing offerings, schedules, and instructors are preserved. New offerings have
no assigned teacher or schedule. Students submit requests; the existing dean
review and instructor-assignment actions complete enrollment and teaching loads.
Opening, publication, and notices commit together; repeated opens add no duplicate
subjects. Publication also repaired the already-open 2026–2027 first semester:
27 BSIT subjects across four years, including four subjects / 12 units in year 4.

`npm run test:db` covers publication by semester and program, requests, dean approval,
teacher assignment, closing/reopening, existing-offering preservation, access checks,
and rollback on notification failure. Signed-in production screens were not checked.

## Enrollment opening notifications

`20261029114553_enrollment_open_notifications.sql` is applied to Supabase.
The existing Enrollment / Advising → Enrollment term settings controls open or
close 1st Semester, 2nd Semester, and Summer for a school year with subject offerings.
Opening a closed term inserts an activity for every active, approved student;
the existing student notification bell receives these activities through Realtime
and its refresh fallback. Opening an already-open term sends no duplicate notice.
Closing sends no notice; reopening sends a new notice. The update and notices
commit together, and concurrent changes to the same term serialize on its offerings.
Existing Registrar/Dean/Admin and MFA checks remain in place. No email is sent.

Verification: `npm run test:db` covers all three terms, duplicate opens, closing,
reopening, recipient filtering, student visibility, access checks, and rollback
when notification insertion fails. No real term was opened during deployment.

## Earlier backend release

The backend release is `supabase/migrations/20261027131814_backend_semester_release.sql`.
It combines the five previously unapplied scripts in one transaction, in dependency
order: school-year normalization, adviser workflows, access controls, semester
totals, then FAQ retrieval/content. The 34 original production migrations are unchanged.
This migration is applied to production. The complete production archive was
restored into an isolated Supabase PostgreSQL 17 container before promotion;
all 68 public/Auth table checksums and public policies, functions, RLS and
sequence state matched. Protected school/Auth checksums remained unchanged
after promotion; semester-total mismatches are zero.

The independent authorization-only migration
`20261027120911_grade_revert_mfa_guard.sql` is already applied to production.
It adds a fail-closed MFA check inside grade reversion without rewriting grades.
It preserves the existing policy for accounts without verified MFA factors.
Both migrations are recorded in production and local filenames match their
recorded versions. The academic migration normalizes instructor assignments before
offerings so the existing synchronization trigger reuses canonical assignments.

The FAQ assistant and service-only reindexer are deployed. The indexer verifies
service credentials through Supabase Auth's admin endpoint instead of comparing
them to one runtime key string. All 24 active articles were indexed. Hosted
anonymous/invalid-token rejection and the database's 10-per-minute limit passed.
Matching frontend assets are still local; GitHub and Vercel were not published.

Grade entry saves only edited students. Existing rows use the original server
`graded_at` as an atomic update condition; new rows use INSERT so a concurrent
creation fails instead of overwriting. A conflict keeps local edits and asks the
user to reload the class. Unassigned deans can inspect classes and history but
cannot edit or revert from the oversight view; active assignment is checked on
the server before enabling those controls. Admin access is preserved.

## Summer enrollment

Registrar, dean and admin accounts can publish an existing subject as a Summer
offering from the registrar Prospectus page. This preserves its code, units,
year level, program and GE/major classification. It does not copy old enrollments,
grades or instructor assignments. A new Summer term starts closed; offerings added
to an existing term follow that term's enrollment status. The dean assigns the
instructor, and a registrar/dean/admin explicitly manages term opening from
Enrollment Requests. Summer retakes do not waive prerequisites for later subjects.

Semester and year-level filters apply to registrar subject/student lists,
enrollment reviews and finalization groups, dean assignments, and teacher/dean
class pickers. Student lists use the student's current year level; subject lists
use the subject's year. Use All year levels for students retaking earlier subjects.
Teachers can lock their assigned classes; deans/admins can lock classes they manage.
The database requires saved Final and Equivalent values for all enrolled students,
rejects pending enrollment requests, and blocks later grade edits and reverts.

## Local checks

Run `npm run test:backend`, `npm run test:db`, and `npm run check:edge` for the
backend-only snapshot. Run `npm test` on the complete workspace before the frontend release.
CI includes the existing isolated PGlite database
runner. It tests SQL authorization and workflows with fictional accounts and
local Auth shims; it does not prove hosted OAuth, HTTP, Realtime, or provider health.
The runner now loads the pgvector extension, applies the actual FAQ migration,
and executes `supabase/tests/faq_search.sql`, including named-argument retrieval
and embedding invalidation. CI installs the pinned test tools listed in the runner.

The database runner verifies onboarding and admin contracts, MFA denial and AAL2
success, enrollment and attendance scope, evaluation enrollment checks and
anonymous teacher summaries, message recipient restrictions, read-state updates,
and the shared FAQ limit. Existing dean/admin evaluation maintenance access is
retained, subject to MFA; instructor access is through the aggregate summary.
Attendance writes require a matching enrollment; existing historical rows are
not rewritten. Staff clearance display uses an authorized workspace RPC returning
only the student number, name, and program needed by that page. The same backend
rules and updated frontend assets are included in the isolated demo build.
The existing opt-in MFA rule remains: an account with no verified factor can
still use the portal. Enforcing mandatory enrollment is a separate policy change.

## Backup and restore

Save the production session-pooler PostgreSQL URL as `SUPABASE_DB_URL` in the
ignored `.env` file. Keep credentials out of terminal arguments and chat. Set
`PG_DUMP` and `PG_RESTORE` to PostgreSQL 17 client executable paths if absent from
PATH, then run `npm run backup`. Archives and failure summaries are saved under
the ignored `database/backups/` directory. A readable archive is not a successful
restore: restore it to a fresh isolated Supabase-compatible database and verify
records, policies, functions, sequences, and authorization before promotion.
Never restore over production or the paused test project.

`node scripts/test-backup-restore.mjs` separately tests the real archive/restore
toolchain using synthetic local data. Set `PG_BIN` to an installed PostgreSQL
binary directory, or use the existing Windows tools under `.temp/full-audit/`.
It binds only loopback, verifies typed values, sequence continuation and RLS, and
stops its local server. This is not a backup of production.

The saved Management API token and CLI login returned 401 during this run. A
working database URL is needed for a fresh production dump; alternatively a valid
Management API token permits checking existing platform backup metadata. SQL MCP
access alone does not establish that a recoverable backup exists.

Confirm platform backup retention and keep a recovery copy outside this PC.
Database archives exclude hosted service settings and Storage file contents.

## Promotion order

1. Verify production backup restoration and preserve a pre-change data checksum.
2. Reconcile live migration history; recovered migrations are history, not new work.
3. From the backend release branch, run `supabase db push --linked --dry-run`.
   This completed release should now list no pending migrations. Stop if any
   recorded or unrelated migration appears. Check that the
   linked project is `dusiokpfmkhutptomrqg` before proceeding. If CLI login is
   unavailable, use the connected Supabase tools instead: compare the recorded
   migration history against the 36 preserved local files, then apply only a
   reviewed forward migration with `apply_migration` after backup/restore verification.
4. After recovery verification, run `supabase db push --linked`. Never apply the
   baseline snapshot or demo seed there. Unique-key conflicts abort the transaction;
   inspect conflicting school records before retrying. The migration does not merge
   records. Existing grade/history values and billing balances must be unchanged;
   school-year spelling and enrollment summaries intentionally change.
5. Run `npm run deploy:backend:functions`. It loads the local environment, requires
   `portal_release_ready() = semester-v3`, and only then deploys `faq-assistant`
   followed by `faq-reindex` to the project identified by `SUPABASE_URL`.
   It stops on failure. CLI authentication is separate from the database password.
   Neither this command nor `git push` applies database migrations automatically.
   With connected tools, first query `public.portal_release_ready()` and require
   `semester-v3`; then deploy the two functions in that same order using their local
   sources and shared imports, with JWT verification disabled at the gateway.
   Both handlers enforce caller authorization internally. CLI login is not needed
   for the connected-tool path; PostgreSQL backup access is still required.
6. Verify hosted anonymous rejection, approved-user answers, rate limiting, provider
   fallback and retrieval. Check `GROQ_API_KEY`/model configuration on the host.
   Run the service-only reindexer in batches until no articles remain unindexed;
   never put its credential in a browser. Confirm the old frontend's core reads
   still work before ending backend maintenance.
7. Release matching frontend assets separately and verify real approved accounts through
   onboarding, account approval/suspension, enrollment, grade save/lock, evaluations,
   and failed-read/retry flows. Check separate first/second/Summer terms, closed-term
   subject visibility, cancelled term switches with unsaved grades, and registrar
   assignment/removal within a selected semester. Recheck existing grade and history
   checksums; enrollment summaries and school-year formatting intentionally change.

Keep frontend, preview assets and browser changes out of the backend commit.
Preserve their local files for the later frontend release. The backend branch
only runs backend checks in CI and cannot publish the Docker image. Its Vercel
Git deployment is disabled explicitly. Do not merge into `main` until
the intended database passes `npm run check:release`; keep the frontend build guard.
Credentials, recovery archives and operator evidence stay in ignored local paths.
