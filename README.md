# 🎓 MyIMCC Portal — Capstone Project

> **Iligan Medical Center College (IMCC)** — Modern Unified School Portal System  
> An intelligent, role-based academic portal bridging performance tracking, administrative automation, and AI-assisted workflows.

---

## 📌 Overview

The **MyIMCC Portal** is a Capstone project engineered to modernize and streamline institutional workflows for students, faculty, department deans, registrars, and campus administrators.

Built with modern web standards, Supabase (PostgreSQL with Row Level Security), and AI integration via Groq LLM edge functions, the system centralizes enrollment, grading, curriculum review, clearance processing, billing ledgers, and student inquiries into a unified, secure digital campus.

---

## 🚀 Key Features by User Role

### 👨‍🎓 Student Portal (`/student`)
- **Academic Dashboard**: Real-time snapshot of current enrolled units, GPA summary, academic standing, and school announcements.
- **Class Schedules**: Weekly timetable view read from the real `timetable` table, with room assignments and instructor info.
- **Grades & Evaluation**: Transparent view of midterm and final grades per subject once verified and released.
- **Enrollment & Prospectus**: Interactive course curriculum tracking and subject offering intake.
- **Billing & Account Ledger**: Fee assessment and payment history as recorded by Cashier staff. There is no student-side payment action; the portal does not present a button that does not exist.
- **Clearance Tracker**: Multi-department clearance sign-off statuses (Library, Dean, Accounting, Registrar).
- **Faculty Evaluation**: End-of-term instructor and subject evaluation forms.
- **Help Assistant**: A chatbot that answers from published articles only, cites which article it used, and refuses personal, medical or urgent matters. When it cannot help, the student books a consultation instead of writing to a person.
- **Consultation Requests**: The student proposes a topic, a Manila-time slot and a meeting mode; the Registrar's Office confirms the time and replies.

#### Support flow: one front door

The student portal has exactly one way to reach a person, and it is deliberate:

1. The **Help assistant** answers what the published articles cover.
2. Anything it cannot answer becomes a **consultation request**, which a database trigger turns into a message to the help desk. Staff are notified even if a client forgets to.
3. **Messages** is correspondence only. There is deliberately no composer for new questions, so a student cannot open a second, untracked conversation that bypasses the articles staff maintain.

The database enforces step 3 rather than trusting the UI: `messages` RLS lets a student insert only to an approved, active staff account, so a student-to-student channel stays closed even if someone calls the REST API directly. The policy is named for the rule, not the feature: `Students may write only to staffed offices`. Replies within a thread are what it now permits.

Two things follow from the trigger design, and both are handled in the UI. If no registrar or admin account is active, a request is still stored but nobody is notified, so the booking panel warns the student rather than letting them wait on a message that was never sent. And the student portal checks the help desk independently of the inbox, because both load lazily on first visit and a student who opens Help before Messages must not be told the office is unstaffed when it is not.

### 👨‍🏫 Faculty / Teacher Portal (`/faculty`)
- **Class Load Management**: View assigned teaching sections, schedule matrix, and course descriptions.
- **Student Masterlists**: Filterable rosters with contact details and enrollment statuses.
- **Digital Grading Sheet**: Input Midterm and Final grades, compute transmuted marks, and flag incomplete/dropped statuses.
- **Grade History & Audit Logs**: Version history tracking for any updated scores before final dean submission.

### 🏛️ Dean Portal (`/faculty/dean-dashboard.html`)
- **Department Oversight**: Department-wide statistics on student counts, faculty workloads, and active courses.
- **Curriculum & Course Offerings**: Manage department prospectus, curriculum prerequisites, and term schedules.
- **Grade Review & Approval**: Review submitted grade sheets with powers to approve or request revisions/reversions.
- **Faculty Assignment**: Assign subjects and schedule sections to department instructors.
- **Faculty Evaluation Analytics**: Aggregated student evaluation metrics and feedback reports.

### 📋 Registrar & Staff Portal (`/staff`)
- **Student Subject Prospectus**: Assign prospectus subjects and custom subject offers to students (`registrar-dashboard.html`).
- **Enrollment Validation**: Cross-check student records, validate prerequisites, and finalize enrollment.
- **Clearance Administration**: Departmental clearance approvals, hold placements, and clearing queues.

### 🛡️ Administrator Portal (`/admin`)
- **System Overview**: High-level platform health, active users, and system alerts.
- **User & Role Management**: Manage user profiles, role assignments (Student, Faculty, Dean, Registrar, Staff, Admin), and onboarding approvals.
- **Audit Logging**: Comprehensive log of security events, administrative updates, and grade submissions.

---

## 🔐 Security & Identity Architecture

- **Single Sign-On (SSO)**: Google OAuth integration restricted to authorized institutional email domains (e.g., `@imcc.edu.ph`).
- **Two-Factor Authentication (TOTP MFA)**: Multi-Factor Authentication via Supabase Auth elevating session security from AAL1 to AAL2.
- **Onboarding Guard**: Automatic redirection of unverified accounts to role selection and administrator approval queues (`/onboarding`).
- **Row-Level Security (RLS)**: Strict database-level isolation policies in PostgreSQL guaranteeing users only access data permitted by their verified role and identity.
- **Client Route Guards**: Centralized `authGuard.js` protecting client routes and preventing unauthorized role navigation.

---

## 🛠️ Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend** | HTML5, CSS3, Modern JavaScript (ES Modules, Vanilla JS) |
| **Styling & UI** | Custom Responsive Design Tokens, Glassmorphism, Print CSS (`@media print`) |
| **Authentication** | Supabase Auth (Google OAuth SSO + TOTP Multi-Factor Authentication) |
| **Backend / Database** | Supabase (PostgreSQL, Cloud-hosted) with Row Level Security (RLS) & Triggers |
| **AI Assistant** | Supabase Edge Functions (Deno / TypeScript) + Groq API (`llama-3.3-70b-versatile`) |
| **Deployment / Infra** | Docker, Nginx, Portainer, Ngrok, Raspberry Pi 4, Vercel |
| **Automation** | Node.js backup scripts (`scripts/backup-supabase.js`) |

---

## 📂 Project Structure

```plaintext
myimcc-portal/
├── index.html                    # Root routing entry point (handles OAuth redirects)
├── auth/
│   ├── login.html                # SSO + TOTP MFA authentication portal
│   ├── login.css                 # Login styling and responsive modal layouts
│   └── login.js                  # Supabase OAuth & MFA verification flow
├── student/
│   ├── dashboard.html            # Main student academic & self-service dashboard
│   ├── dashboard.css             # Student portal styling & dashboard themes
│   ├── dashboard.js              # Student features (grades, billing, clearance, AI chat)
│   └── cor.html                  # Official Certificate of Registration (COR) printable view
├── faculty/
│   ├── teacher-dashboard.html    # Faculty teaching loads & grade entry interface
│   ├── teacher-dashboard.js      # Grade computation, history, and submission logic
│   ├── dean-dashboard.html       # Department dean curriculum & approval portal
│   ├── dean-dashboard.js         # Dean analytics, grade verification, and faculty assignments
│   └── sharedstyle.css           # Unified design tokens for faculty & academic portals
├── staff/
│   ├── registrar-dashboard.html  # Registrar portal for offering subjects & prospectus
│   ├── registrar-dashboard.css   # Registrar layout styling
│   ├── registrar-dashboard.js    # Subject assignment & student enrollment operations
│   └── staff-dashboard.html      # General staff clearance & request processing
├── admin/
│   ├── admin-dashboard.html      # System administration dashboard
│   └── admin-dashboard.js        # User approval, database metrics, and configuration
├── onboarding/
│   ├── select-role.html          # New user role selection interface
│   ├── select-role.js            # Role request submission
│   └── awaiting-approval.html    # Pending account verification notice
├── shared/
│   ├── authGuard.js              # Session & role-based route protection
│   ├── supabase-config.js        # Supabase client initialization & constants
│   ├── loading.js / .css         # Global animated loader components
│   ├── portal.css                # Base portal styles & CSS variables
│   └── rwd.css                   # Responsive web design utilities & media queries
├── database/
│   ├── supabase-schema.sql       # Baseline database schema, tables & RLS policies
│   ├── supabase-schema-v2.sql    # Extended institutional tables & clearance rules
│   ├── supabase-schema-v3-rag.sql# AI vector/FAQ data structures
│   ├── supabase-schema-v4-evaluations.sql # Faculty evaluation schemas
│   └── backups/                  # Automated database dump snapshots
├── supabase/
│   ├── config.toml               # Supabase CLI project configuration
│   └── functions/
│       ├── faq-assistant/        # AI Groq chatbot Edge Function
│       ├── mfa-enroll/           # TOTP enrollment function
│       └── mfa-verify/           # TOTP challenge & verification function
├── scripts/
│   └── backup-supabase.js        # Automated Supabase schema & table backup script
├── config/
│   ├── .env.example              # Environment variable template
│   └── docker-compose.yml        # Docker compose configuration (Portainer + Ngrok)
└── docs/
    ├── production-guide.md       # Comprehensive Raspberry Pi & production deployment manual
    └── readme.md                 # Supplementary deployment notes
```

---

## ⚡ Getting Started (Local Development)

### 1. Clone & Setup Configuration
Clone the repository and set up your environment variables:
```bash
git clone https://github.com/your-username/myimcc-portal.git
cd myimcc-portal
```

Configure your Supabase credentials in `shared/supabase-config.js`:
```javascript
const SUPABASE_URL = "https://your-project-id.supabase.co";
const SUPABASE_ANON_KEY = "your-anon-key";
```

### 2. Configure Database & Migrations
1. Navigate to your [Supabase Dashboard](https://supabase.com/dashboard).
2. Open the **SQL Editor**.
3. Run the schema migrations located under `database/` in sequential order:
   - `database/supabase-schema.sql`
   - `database/supabase-schema-v2.sql`
   - `database/supabase-schema-v3-rag.sql`
   - `database/supabase-schema-v4-evaluations.sql`
4. Run the security migrations. These are required; without them the portal ships with the privilege defects fixed by these files:
   - `database/security-hardening-phase0a.sql` - identity, approval and role
   - `database/security-hardening-phase0b.sql` - clearance, installments, transactions and message content
   - `database/timetable-integrity.sql` - per-offering meeting validation and registrar write access for the Class Schedule
   - `database/messaging-qa.sql` - message `topic`, help desk routing, and the student-to-student block
   - `database/appointments.sql` - consultation requests for students the assistant could not help
   - `database/faq-content-corrections.sql` - removes the stale "Pay Now" FAQ answer
5. Verify. Each phase has a test script; run them after applying:
   - `database/test-security-hardening-phase0a.sql`
   - `database/test-security-hardening-phase0b.sql`
   - `database/test-appointments-and-messaging.sql` - run last, after `messaging-qa.sql` and `appointments.sql`
6. Set the Edge Function secrets, or the help assistant will not answer:
   - `GROQ_API_KEY` - optional. Without it the assistant returns the matched articles instead of a composed answer, which is honest but less useful.
   - `SUPABASE_SERVICE_ROLE_KEY` - required by `faq-assistant`. The function also writes an audit trail to `chat_logs` and resolves the help desk recipient, neither of which a user JWT may do.
7. **Order matters.** `timetable-integrity.sql`, `messaging-qa.sql` and `appointments.sql` each open with a `SELECT` report. Run those reports before you trust the feature. The timetable seed in `supabase-schema-v2.sql` hardcodes `offering_id` 1, 2, 3, which only matches the intended subjects on a brand-new database; on a live database those ids belong to whatever offerings were created first, so the sample schedule can be attached to the wrong subjects. `messaging-qa.sql` must be applied before deploying the updated front-end, because both portals now select `messages.topic` and will error until the column exists. `appointments.sql` must come after `messaging-qa.sql`, because the notification trigger writes to `messages` and calls `helpdesk_recipient_id()`.
8. Enable the **Google Provider** under `Authentication -> Providers`.

### Appointment times are Manila time

Consultation times are stored as `timestamptz` (`preferred_at`, `scheduled_at`), never as a date plus a text time. Asia/Manila is UTC+8 with no daylight saving, so a student's "9:00 AM" is a fixed instant.

The conversion happens in one shared module, `shared/datetime.js`, which both portals load before their page script. Staff read and write Manila wall-clock values; the database compares instants. Two consequences worth knowing:

- The `<input type="date" min>` on the booking form is computed on the Manila calendar. `toISOString().slice(0, 10)` gives the *UTC* date, which is a different day for eight hours every evening, and would hand a student in another country a meaningless minimum date.
- Staff are shown the confirmed time in Manila and it is labelled as such. A registrar working from another time zone reading a bare "3 Jun, 09:00" will assume their own clock.

Run `node shared/datetime.test.mjs` after touching the module. The appointment trigger rejects a past `preferred_at` or `scheduled_at` and names the Manila time in the error, so a booking that looks eight hours off can be diagnosed from the message alone. It deliberately does *not* forbid confirming a time earlier than the student asked for: staff routinely offer something sooner, and that is a scheduling policy rather than a data-integrity rule.

### Verification

Run these before a deploy. They need no database.

```bash
node shared/identity.test.mjs          # 84 assertions
node shared/ui.test.mjs                # 49 assertions
node shared/datetime.test.mjs          # 39 assertions
node database/tools/check-scope-rules.mjs   # assistant scope: 26 assertions
node supabase/functions/check-syntax.mjs    # Edge Function structure
node database/tools/check-sql.js database/appointments.sql   # and each other migration
node --check student/dashboard.js
node --check staff/registrar-dashboard.js
```

`supabase/functions/check-syntax.mjs` is a stand-in for `deno check`, not a replacement. It only proves the functions parse and that no binding is declared twice in the same block; it cannot check types. Run `deno check` where Deno is available.

`database/tools/check-sql.js` catches unbalanced dollar-quoting, unbalanced `BEGIN`/`END`, unterminated comments, and calls to functions the script does not define. It is static only: it does not execute SQL, so it cannot prove a policy or trigger behaves correctly. The integration scripts under `database/` exist for that and need a live database.

`database/test-appointments-and-messaging.sql` is the one script that exercises the support flow end to end: a student cannot open a peer channel, a filed request really does notify the help desk, a past Manila time is rejected by the database rather than only in the browser, and a registrar can still offer a time earlier than the student asked for. It runs in a transaction it rolls back, and it stands down pre-existing registrar and admin accounts for the duration so the routing assertions are deterministic on a live database. **It has never been executed**: Docker was unavailable while it was written, so it has only passed the static check. Treat its first run as a debugging session, not a green light.

### Rollback
`appointments-rollback.sql` and `messaging-qa-rollback.sql` are paired with their migrations. The two `security-hardening-phase*-rollback.sql` files deliberately reinstate privilege defects, including the student-to-student message channel, so they are for recovering from a bad deploy and nothing else. `timetable-integrity.sql` and `faq-content-corrections.sql` have no rollback: the first is additive validation and the second is idempotent content, and in both cases a hand-written reversal would be more dangerous than re-running the forward file. Read the warning at the top of each rollback first.

### 3. Launch the Application Locally
Since the project uses ES Modules and modern web APIs, serve it with any local static HTTP server:

**Using Python:**
```bash
python -m http.server 8080
```

**Using Node / npx:**
```bash
npx serve . -p 8080
```

Open your browser and navigate to:
```
http://localhost:8080/index.html
```

---

## 🌐 Production Deployment

The project can be deployed using several topologies:

### Option A: Raspberry Pi 4 (Self-Hosted Production)
Refer to the detailed guide in [`docs/production-guide.md`](docs/production-guide.md) to set up:
- Docker & Nginx for static site delivery.
- Portainer for container management.
- Ngrok or Cloudflare Tunnels for secure public HTTPS ingress.

### Option B: Cloud Static Hosting (Vercel / Cloudflare Pages)
A preconfigured [`vercel.json`](vercel.json) is included in the project root for zero-config CI/CD deployments. Simply connect the GitHub repository to Vercel or your preferred static hosting platform.

---

## 💾 Database Backups

Run the automated Supabase backup script to export table records and schema snapshots:

```bash
npm install
npm run backup
```

Backups are saved to `database/backups/` as timestamped JSON archives.

---

## 👥 Contributors & Acknowledgements

Developed as a **Capstone 1 Project** for **Iligan Medical Center College (IMCC)**.
Special thanks to the faculty, academic advisors, and students who contributed feedback during system prototyping and testing.
