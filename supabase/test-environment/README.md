# Local test portal

Run from the repository root:

```powershell
npm run test:portal
```

Open http://localhost:3080. Stop with Ctrl+C. The server binds only to this computer.

Enter your individual approved test account email and password. The following existing demo accounts are offered as suggestions:

| Account | Role |
| --- | --- |
| student.demo@imcc.edu.ph | Student |
| teacher.demo@imcc.edu.ph | Teacher |
| dean.demo@imcc.edu.ph | Dean |

Passwords are not stored in the source code. This local login uses Supabase password authentication and the normal portal role guards. It does not need Google OAuth configuration.

Real participants can use individual accounts for any existing role after those
accounts are created and approved in the test project. This login creates no
accounts and grants no roles. See [the pilot checklist](../../docs/pilot-testing.md)
for hosted adviser testing and the separate developer-only dashboard viewer.

The server pins the database to `ycziiezfrwnzouilutum`, rejects missing test configuration, and uses a separate browser session key. It never reads the root `.env` or serves config, database, or script files. Every dashboard displays a TEST PORTAL label. The main Vercel deployment keeps its existing configuration.

Test data includes TEST101 (Demo Teacher), TEST102 (Demo Dean), class schedules and three pending clearances. The student demo can submit subjects for enrollment; sign in as Demo Dean and open Enrollment Requests to approve or reject them. Units appear after approval. To return the demo student to a clean enrollment state, run `reset-student-enrollment.sql` against the test project. It clears only that student's TEST101/TEST102 requests, enrollments, grades, attendance, and demo balance/installment data; it keeps the accounts and unrelated test records.

Checks:

```powershell
node scripts/test-portal.test.mjs
```

`check.sql` validates the seeded accounts and class data in the test database. `schema.sql`, `catalog.sql`, and `accounts.sql` record the setup already applied there. Do not apply them to the main database or rerun the seeds over records you want to retain.

The test database includes the enrollment, roster access, instructor assignment, eligibility, and reviewer-history fixes listed below. Hosted Edge Functions, OAuth provider settings, Storage objects, and Realtime publication configuration were not copied. Their features need separate setup before end-to-end testing.

When recreating this environment, apply ../migrations/20261015144016_enrollment_request_approval.sql and ../migrations/20261015150353_enrollment_review_student_groups.sql after schema.sql. check.sql checks the initial state before requests.

Also apply ../migrations/20261015152431_dean_self_teaching.sql to let the signed-in dean select themselves as an instructor. Verify with node faculty/dean-self-teaching.test.mjs and supabase/tests/dean_self_teaching.sql (the SQL test rolls back).

Apply ../migrations/20261015154210_assignment_managers_and_rosters.sql and ../migrations/20261015155745_test_roster_course_access.sql for scoped student rosters, program/year enrollment checks, protected academic records, and reviewer history. `supabase/tests/test_only_audit_fixes.sql` checks these test-only rules and rolls back its fixtures.
