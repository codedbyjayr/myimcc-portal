# Temporary role testing on the main project

The main project now has an isolated `imcc_review` schema with fictional records and copies of the actual role, enrollment and grading rules. New adviser screens are served under `/review-assets/`. Normal school screens, records and role permissions retain their current release.

## Main-project review

1. Sign in with your existing developer Admin account and complete MFA.
2. Choose a role under **View as role**, then click **Try selected role (demo)**.
3. On first use, the server creates separate demo identities and fictional records. Their school-facing profiles stay inactive and unapproved; only their review profiles receive the selected roles.
4. The heading changes to **DEMO ONLY**. Switch roles with the same picker to follow the enrollment and grading flow. Changes persist in the review area between roles.
5. Click **Return to read-only**, **Back to Admin**, or sign out inside the demo to leave it.

The frame receives no production token, demo password or actual demo token. Its server handler fixes every request to the review schema. Private credentials are only available to the server through a verified developer-only function. The database enforces the copied role rules.

Review access opens for two hours after starting it. Each role session lasts at most 30 minutes. Expiry restores Admin and blocks further requests. Only your active developer Admin account with MFA can open another review window.

Suggested review order: Dean (records, subjects and Summer setup), Student (request enrollment and inspect year filters), Dean (approve and finalize enrollment), Faculty (notifications, manual Equivalent and grade locking), Admin (approve DEMO Pending, change its role and revoke access).

The fixtures contain Student, Instructor, Dean, Admin, Registrar, Staff, one pending account, two enrolled subjects and an unassigned Summer subject. No school records are copied.

After review, apply `supabase/pending/retire_demo_review.sql`. This prevents restarting, expires the window and revokes access to both review schemas, including through previously issued demo tokens. Reloading Admin hides the demo button. It deletes no records or databases; later cleanup needs an inventory and backup review.

The generated deployment artifact is `supabase/pending/20261021173916_temporary_demo_review.sql`, built by `scripts/build-demo-review.mjs`. The SQL isolation check is `supabase/tests/demo_review_isolation.sql` and rolls its fixtures back. Local API/browser checks cover fixed-schema requests, opaque sessions and return to read-only.

## Previous separate test-project portal

The localhost portal below remains available for the paused test project. It is not needed for the main-project review.

After you restore the existing Supabase test project (`ycziiezfrwnzouilutum`), run this from the project folder in PowerShell:

```powershell
$env:TEST_PORTAL_UNTIL = (Get-Date).ToUniversalTime().AddHours(2).ToString('o')
npm run test:portal
```

The portal is disabled without a future deadline, accepts at most 24 hours, and listens only on your computer. No connection to the test database is made by starting the server.

In your developer admin dashboard, choose a role and click **Test selected role (local)**. Alternatively open `http://localhost:3080/test-login?role=dean`. Sign in using an approved, active **test account of that role**. Instructor accepts the existing `teacher` or `faculty` role. No passwords are embedded and no role is impersonated. Production login stays in its original tab, with separate test session storage.

Repeat with each role's own test account. Each account gets its normal database permissions and working dashboard. Return to the test login to change accounts. Keep fictional test records only.

Suggested review order:

1. Dean: browse student records, add/search subjects without an instructor, assign faculty, review enrollment and term settings.
2. Instructor: check enrollment notifications and class rosters, enter manual equivalents, finalize grades, confirm locked grades reject edits.
3. Student: request enrollment including Summer, review classes/clearance, filter grades and evaluation by year.
4. Admin: approve/deactivate test accounts and confirm each role sees only its own authorized actions.

The adviser database migration must also be applied **to the restored test project** before testing its new locks, notifications, and term behavior. This implementation does not apply it or provision test accounts.

## Finish the demonstration

Sign out of the test account, close the test tab, stop the local server with Ctrl+C, and remove its activation variable:

```powershell
Remove-Item Env:TEST_PORTAL_UNTIL
```

Your developer role preview remains read-only throughout. At the deadline, the local server stops serving portal content and loaded pages attempt a local test sign-out and return to login. This is a temporary local UI window, not database-level token revocation: issued Supabase access tokens can remain valid until their own expiry. For complete retirement, revoke test sessions/deactivate test accounts in the test project after the demonstration. Background/suspended tabs may process the timer late.

No production permissions, records, or databases are deleted. Database cleanup needs a separate inventory and backup review.
