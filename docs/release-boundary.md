# Production and developer review releases

Normal role URLs and the read-only Admin data preview use the current production
`public` database contract. They must not use the pending adviser functions or
columns. The preview uses the Admin's own permissions and assignments; it does
not verify another role's access.

Use **Try selected role (demo)** to review the new student records, manual
Equivalent, grade locking and enrollment finalization workflows. These pages
and their shared scripts live under `/review-assets/`. The existing server
broker fixes their requests to `imcc_review`; their direct Supabase bootstrap
throws rather than connecting to school data. The review identity helper must
be released with the review dashboard, including `IMCC.fetchAll`.

The Dean accreditation checklist and timetable conflict card remain removed.
School records and database permissions are unchanged by this repair.

## Required release checks

Run `npm ci`, `npm test`, `npm run check:release`, `npm run check:edge` and
`npm run check:edge:parse` on the exact release commit. Vercel builds and Docker
publication run the boundary check. It requires no database credentials and
makes no database changes. It blocks known pending adviser contracts in normal
screens, and rejects review pages that load school assets or missing local
assets. It is a scoped source check, not proof that a live database supports
every endpoint.

With the existing Playwright installation, run
`node scripts/role-preview-browser.test.mjs`. This serves the actual production
and review asset trees separately. Read-only requests reject review-only RPCs,
and startup errors fail the test. Simulated API responses do not establish
hosted role permissions.

## Later promotion

Keep `supabase/pending/20261021111506_adviser_requirements.sql` pending until
approved. Validate its SQL tests in an approved isolated target. Then verify
actual approved role accounts, including forbidden actions, locked records,
failed saves and mobile grading. The paused test project is not changed by
this release.

Promote the database migration, matching screens, shared assets and updated
compatibility checks together in a separate release. Replace the boundary's
review-only contract restrictions only after verifying those contracts on the
target. There is no `portal_release_ready` marker in the current database;
this release does not claim or rely on one.
