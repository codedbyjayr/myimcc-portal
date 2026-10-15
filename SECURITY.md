# Security Policy

## System and Scope

MyIMCC Portal is a role-based academic portal for students, teachers, deans, registrars, staff, and administrators. It serves browser-based HTML and JavaScript pages and uses Supabase Auth and PostgreSQL through the Supabase Data API. Repository code also includes Supabase Edge Functions, database migrations and policies, and a local test portal connected to a separate test project.

The repository documents two deployment patterns: static hosting on Vercel or similar services, and static hosting on a Raspberry Pi behind Nginx and an ngrok HTTPS tunnel. Which of these are currently live is unverified. Assess both documented paths when relevant. The local test portal and its Supabase project are separate from production; test-only fixtures and setup files are not production data, but defects in shared code or test isolation remain in scope.

## Threat Model and Trust Boundaries

- Browser requests, URL parameters, form fields, local storage, and client-side state are attacker-controlled. Client route guards and hidden or disabled controls are usability measures, not authorization boundaries.
- The Supabase URL and anon key are public client configuration. They must grant only the operations allowed by database privileges, Row Level Security (RLS), and function authorization.
- Authenticated users may attempt to access another student's records, act outside their role or department, or call the Supabase API directly while bypassing the UI.
- Supabase Auth identity and verified database-side role, account status, and active state are the basis for authorization. Changes to enrollment, grades, attendance, clearances, billing, faculty assignments, and user roles require server-side authorization.
- Edge Functions, database functions, triggers, migrations, deployment configuration, and secrets form privileged boundaries. Service-role keys and third-party API credentials must remain server-side and must not be committed or returned to browsers.
- The test project contains fictional accounts and data. It must remain isolated from the main project, and test reset/setup operations must not affect production records.

## Security Invariants

- Every exposed table containing protected or personal data has appropriate privileges and RLS policies; access is limited to the authenticated user's identity and authorized role, department, or assigned class.
- Authorization is enforced by PostgreSQL policies or trusted server-side code, including for writes and RPC/Edge Function calls; a page-level guard alone is insufficient.
- Only approved, active accounts with the required role and any required MFA assurance may perform privileged actions. Enrollment decisions, academic record changes, staff assignments, and administrative operations must not be forgeable by ordinary users.
- Role and ownership checks use the authenticated identity and trusted database records, not caller-supplied role, student, instructor, or reviewer identifiers without validation.
- Privileged database functions use a safe search path, restrict execution grants, and validate their caller and arguments. Triggers and functions must not silently bypass required authorization or erase records needed for academic history.
- Production and test Supabase project configuration, sessions, credentials, and data remain separate. Test-only server paths must fail closed if the test project configuration is missing or points elsewhere.
- Secrets are not exposed in client bundles, generated environment configuration, logs, repository history, or public artifacts. Public anon configuration is not a secret, but must not be treated as authority to bypass RLS.
- Responses and logs avoid unnecessary disclosure of student personal information, authentication material, or secret values.

## Reportable Findings and Severity Context

Report a vulnerability when a realistic attacker or unauthorized account can cross a trust boundary or violate an invariant. Examples include cross-student or cross-role data access, unauthorized mutation or approval, account/role takeover, exposure of secrets or sensitive records, production/test data crossover, unsafe privileged functions, and deployment misconfiguration that enables those impacts.

Assess severity using practical reachability, required account or role, affected data and number of users, and the consequences for academic records or account control. A UI-only restriction is not a compensating control when the corresponding API or database operation remains reachable. A control documented in source or tests is not evidence that the deployed system enforces it.

## Out of Scope, Exclusions, and Accepted Risk

No vulnerability class or application component is excluded by this policy. No accepted risk or suppression is established here. Do not treat fictional test data, a required login, an anon key, a client-side check, or an unverified deployment setting as grounds to suppress a reachable security finding. Report non-security reliability or usability issues separately unless they enable a security impact.

## Known Limitations and Compensating Controls

- The repository describes both Vercel and Raspberry Pi/ngrok deployment options but does not establish which is currently live or how each environment is configured. Confirm actual exposure, redirect allowlists, secrets, headers, and deployed Edge Functions before making deployment-specific conclusions.
- The local test environment documentation says hosted Edge Functions, OAuth provider settings, Storage objects, and Realtime publication configuration were not copied. Features depending on those services are not fully end-to-end tested in that environment.
- Automated tests and SQL checks cover selected workflows and policies; they do not prove that every production table, policy, function, secret, or provider setting is correctly configured. Verify relevant deployed state when assessing those controls.
