# Actual-user pilot and developer preview

## Developer dashboard preview

Only the verified account `jlm33405@imcc.edu.ph` receives the **View as role** selector
in `/admin/admin-dashboard.html`. It must remain an approved, active admin and complete
MFA. Configure `SUPABASE_URL` and `SUPABASE_ANON_KEY` on the Vercel server to match
the frontend's project. No service-role key is needed. Missing configuration
denies access. Other admin accounts are not granted this feature.

After deployment, select Student, Faculty, Dean, Registrar or Staff in the admin
header. The original dashboard runs inside the existing admin page, keeping its
HTML, styles, scripts and saved theme. Select **Admin** or **Back to Admin** to
restore the normal admin workspace. There is no separate viewer page.

The original dashboard loads real data through the developer's existing admin
permissions. It does not impersonate a person or change roles. Student and
faculty queries scoped to the current account may be empty if the admin has no
enrollment or teaching assignments. This is not the same as viewing another
student's account or verifying their permissions.

The sandbox receives no real access token and cannot access the parent page.
Its Supabase reads are relayed to `/api/developer-preview`. Every request checks
the developer's identity, MFA, approval and active admin status. The server uses
the caller's JWT, never a service-role key. Only GET requests to the project's
PostgREST tables/views and four dashboard read RPCs are forwarded. PostgREST
executes GET in a read-only transaction; write methods, Auth/Storage/Edge Function
calls, other RPCs and external targets are blocked. Direct frame networking and
forms are blocked by its content security policy. Realtime is disabled in the
view. Switch roles or reopen it to refresh data. Buttons that save or submit
cannot write and may show a read-only error. External navigation and sign-out
controls inside the frame are disabled; use the main admin header to exit.

This grants no new database privileges. The developer's ordinary admin session
still has its existing permissions outside the viewer. The viewer is not a way
to test another role's database permissions.

The local test server does not run Vercel API functions. Check the developer
viewer using Vercel's development server or a review deployment with the server
configuration above, not the static local test server.

Run `node api/developer-preview.test.mjs` for the server access checks and
`node scripts/test-portal.test.mjs` for test-login isolation. For browser checks,
run `node scripts/role-preview-browser.test.mjs` using an existing Playwright
installation and Microsoft Edge. If Playwright is outside this project's module
path, set `PLAYWRIGHT_MODULE` to its `index.mjs` file URL. The browser check uses
local mocked authentication and never signs in to production.

## Actual users

Recruit a small group of real students, faculty, a dean, registrar and staff.
Each person uses an individual account and their genuine assigned role. Do not
share the developer login or grant admin just to make testing easier.

For practice submissions, use a separate review deployment and test database.
Configure its frontend and server to use the same test project; verify the
project identity before admitting users. Configure institutional Google sign-in,
the review URL's OAuth redirects, required MFA, and the hosted services used by
the pilot. Those services were not all copied to the existing test project.
Use the normal sign-in, role-request and approval flow. Check identity and role
before approval. Admin access is assigned by an existing administrator.

The localhost test portal also accepts any individual test account email and
password. The account must already exist in the test project's Auth and have an
approved, active profile. It does not create accounts or bypass approval/MFA
policies. Run `npm run test:portal`; it remains bound to this computer only.

If the school needs submissions to become official records, agree on that
production pilot separately with the adviser and responsible offices. Do not
reset those records or copy practice submissions into production.

## Acceptance checklist

Record the role, steps, expected result, actual result and screenshot for each
issue. Use fictional academic/financial records in the review environment.

- Student: request enrollment, check schedule, view released grades, check billing
  and clearance, request a consultation, read/reply to office messages.
- Faculty: see only assigned classes, check the roster, save grades and submit
  them for review. Verify another faculty account cannot change those grades.
- Dean: review enrollment, assign faculty and review submitted grades within
  the intended department scope.
- Registrar: review enrollment, manage offerings, handle consultations and reply
  to messages within the intended access rules.
- Staff: process authorized clearance tasks; check forbidden roles and records
  remain inaccessible.
- Admin: approve the intended roles, suspend and restore a tester, and verify
  ordinary users cannot perform those operations.
- Developer: the five role views load permitted data and keep their real design;
  Admin restores the actual admin workspace. Writes are rejected. A different admin, inactive account and session without
  MFA are refused by `/api/developer-preview`.

Retest fixes with the same steps. Before defense, rehearse the approved release
with prepared records. Reset only disposable test records. Before production,
verify migrations, backups, hosted services and recovery steps for that release.
