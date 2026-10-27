# Adviser requirements implementation

The adviser changes are now available in the main project's isolated demo review area. Normal school tables, role permissions and student/faculty screens retain their previous release. See `docs/temporary-role-testing.md` for access and retirement instructions. The school-table migration below remains pending; it was applied only to the separately named review schema.

## Database promotion

The release requires `supabase/migrations/20261027020245_backend_semester_release.sql`.
It includes the adviser prerequisites and access controls in dependency order. Apply it to
an isolated review database first, then run `supabase/tests/adviser_requirements.sql`.
That test creates fictional fixtures and rolls them back. Do not run the full
`supabase/test-environment/schema.sql` snapshot against an existing database.

The pending migration expects the existing role workflows and school grading
migrations through `20261021040134_exact_school_grade_scale.sql`. The separate
pending FAQ work is not part of this release. Promote this migration and frontend
together: the new controls require the new columns, tables, and RPCs.

Vercel builds and Docker publication now run `npm run check:release`. Configure
`SUPABASE_URL` and `SUPABASE_ANON_KEY` for that deployment's target. The check
requires the `semester-v3` contract installed by
`supabase/migrations/20261027020245_backend_semester_release.sql`;
missing configuration, failed requests and an older database block publication.
See `docs/backend-release.md` for backup prerequisites and the complete validation order.
For manually built Docker images, run the same check against the runtime target
before replacing the running container. Do not point a review deployment at
production to make the check pass.

First validate locally with `node scripts/test-adviser-db.mjs`, then apply the
pending migration to an approved isolated target and run its SQL regression test.
Only after release approval, apply that same migration to production, run the
release check against production, and deploy the frontend. The marker is public
version metadata only; it grants no access to school records. This implementation
does not itself apply the migration or publish a deployment.

No historical grades, enrollments, budgets, or timetable rows are deleted.
Financial Oversight and the separate timetable screens are removed from the UI.
Subject schedule text remains available for enrollment advising and class details.

## Behavior

- Enrollment / Advising is first in Student and Dean navigation and available to
  Admin, Registrar, and Staff. Reviewers approve or reject each subject, then
  **Finalize Enrollment** for a student and term. Pending requests must be resolved.
- Finalization freezes enrollment additions, changes, and removals for that term.
  Used offerings cannot be moved to another term. Subject details cannot be changed
  underneath a finalized enrollment. An instructor may still be assigned later.
- **Lock Grades** finalizes a complete class. Every enrolled student needs saved
  Final and Equivalent grades, and pending enrollment requests must be resolved.
  Edits, deletions, and history reverts are rejected by the database after locking.
  Normal users, including Admins, have no unlock action. A reopening workflow was
  not requested; any exceptional correction needs a separately reviewed change.
- Equivalent is entered manually using the existing school grade scale. It is
  required with Final and drives the passing remark and GWA. Legacy percentage
  records retain their existing review restrictions and stored values.
- Add Subject searches the existing curriculum by code or title and shows units,
  year, semester, and prerequisites. Instructor selection is optional. Assignment
  eligibility and the atomic assignment trigger remain enforced in the database.
- An active enrollment creates an in-app instructor notification. Assigning an
  instructor later also notifies them about the existing roster. Notifications
  are private to that instructor and can be marked read. Refresh loads new items.
- Dean **View Records** provides student information, enrollment, grades, clearance,
  attendance, payments, and installments. Student Compliance uses the same
  independently scrolling list/detail layout as My Classes. Existing graduation
  readiness, accreditation, and appeal controls remain in its expandable panel.
- Student Grades and Faculty Evaluation include a year-level filter. Grades retain
  semester selection. Faculty evaluations are restricted to the displayed current
  term and selected subject year; unmatched previous content is cleared.
- Deans create Summer subject offerings. Dean, Admin, or Registrar can open or
  close a term in Enrollment / Advising. Students select among open terms,
  including Summer. Prospectus fallback and grade sorting recognize Summer.
- Student, Instructor, and Dean checks reject inactive or unapproved accounts.
  Existing Admin role management remains the authority for account assignments.
  Developer preview stays read-only; it does not test another user's permissions.

## Reproducible local checks

```powershell
npm test
npm install --prefix .temp/adviser-db --no-save --package-lock=false @electric-sql/pglite@0.5.10
node scripts/test-adviser-db.mjs
```

The optional test runtime is inside ignored `.temp`; it is not an application
dependency. The SQL runner loads the existing schema with a local Auth shim and
omits unrelated FAQ vector storage/indexes. It executes real PostgreSQL rules,
triggers, and role permissions; it does not verify hosted Auth, Realtime, or
simultaneous network transactions.

With an existing Playwright installation and Microsoft Edge:

```powershell
$env:PLAYWRIGHT_MODULE = '<file URL of the existing playwright/index.mjs>'
node scripts/grading-workspace.browser.test.mjs
node scripts/adviser-workflows.browser.test.mjs
node scripts/role-preview-browser.test.mjs
```

Browser checks use fictional local authentication and API responses. Screenshots
are written to `.temp/grading-layout` and `.temp/adviser-layout`.

## Review-environment acceptance

Use separate approved accounts, as described in `docs/pilot-testing.md`.

| Role | Allowed | Must be blocked |
| --- | --- | --- |
| Student | Request subjects in an open Summer term; filter own grades/evaluations | Direct approval, finalization, grade writes, Dean records, instructor notifications |
| Instructor | View assigned roster; enter manual Equivalent; lock a complete class; read own notifications | Another instructor's class or notifications; changes after grade lock |
| Dean | Create unassigned subjects; assign eligible instructors; view records/clearance; finalize enrollment | Invalid instructor assignment; silent unlocking; changes to finalized records |
| Admin | Manage account roles; review enrollment; view records; manage enrollment terms | Silent unlocking or modifications to finalized records |

Also check inactive accounts, incomplete grades, pending requests, failed saves,
small screens, and a stale browser attempting a write after another user locks.
Hosted migration application and real-account sign-in remain separate release checks.
