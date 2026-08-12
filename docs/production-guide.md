# MyIMCC Portal — Production Deployment & Handoff Guide

## Table of Contents
1. [Architecture Overview](#1-architecture-overview)
2. [Critical Issues Fixed](#2-critical-issues-fixed)
3. [Remaining Improvements Checklist](#3-remaining-improvements-checklist)
4. [Deployment: Raspberry Pi + Docker + Ngrok](#4-deployment-raspberry-pi--docker--ngrok)
5. [Supabase Setup](#5-supabase-setup)
6. [Google OAuth (SSO) Setup](#6-google-oauth-sso-setup)
7. [Groq AI Chatbot Setup](#7-groq-ai-chatbot-setup)
8. [TOTP MFA Setup](#8-totp-mfa-setup)
9. [Security Hardening](#9-security-hardening)
10. [Testing & Verification](#10-testing--verification)
11. [Rollback & Recovery](#11-rollback--recovery)
12. [Handoff Checklist](#12-handoff-checklist)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Student / Faculty / Admin              │
│                     (Web Browser)                         │
└──────────────┬──────────────────────────┬───────────────┘
               │                          │
               ▼                          ▼
    ┌──────────────────┐      ┌──────────────────┐
    │  Ngrok Tunnel    │      │  Supabase Auth    │
    │  (HTTPS)         │      │  (Google OAuth    │
    │                  │      │   + TOTP MFA)     │
    └────────┬─────────┘      └────────┬─────────┘
             │                         │
             ▼                         ▼
    ┌──────────────────┐      ┌──────────────────┐
    │  Raspberry Pi 4  │      │  Supabase         │
    │  Docker/Portainer│      │  PostgreSQL       │
    │  Static Files    │      │  (Cloud Database) │
    │  + Edge Function │      │                  │
    └──────────────────┘      └────────┬─────────┘
             │                         │
             └────────┬────────────────┘
                      ▼
             ┌──────────────────┐
             │  Groq API         │
             │  (LLM for FAQ)    │
             └──────────────────┘
```

### Tech Stack Summary
| Component | Technology | Purpose |
|-----------|-----------|---------|
| Frontend | HTML5 + CSS3 + Vanilla JS | Student/faculty/admin dashboards |
| Auth | Supabase Auth + Google OAuth | SSO with institutional email |
| MFA | Supabase Auth MFA (TOTP) | Two-factor authentication |
| Database | Supabase (PostgreSQL) | Cloud-hosted relational DB |
| AI Chatbot | Groq API (Llama 3.3 70B) | FAQ assistant |
| Server | Raspberry Pi 4 | Static file hosting |
| Container | Docker + Portainer | Container management |
| Tunnel | Ngrok | Public HTTPS access |
| Runtime | Supabase Edge Functions | AI FAQ backend |

---

## 2. Critical Issues Fixed

### Issue #1: Staff & Teacher dashboards used `localStorage` + `fetch('http://localhost:4000')`
**Status: ✅ FIXED**

The original `staff-dashboard.html` and `teacher-dashboard.html` were using:
```js
const faculty = JSON.parse(localStorage.getItem('faculty') || '{}');
const res = await fetch('http://localhost:4000/api/admin/clearance');
```

This bypassed the entire SSO + Supabase auth flow. They now use:
- `requireAuth(['staff', 'admin'])` / `requireAuth(['faculty', 'admin'])`
- Direct Supabase client queries with RLS
- Proper sign-out via `supabase.auth.signOut()`

### Issue #2: Admin dashboard used `localStorage` instead of Supabase session
**Status: ✅ FIXED**

The admin dashboard now:
- Checks for admin role via `requireAuth(['admin'])`
- Pulls all data through Supabase queries
- Uses shared `portal.css` design tokens

### Issue #3: Staff-login.js was a non-functional stub
**Status: ✅ FIXED**

The original `staff-login.js` only had a password eye-toggle. Staff/faculty/admin now go through the **same** `login.html` SSO + TOTP flow as students. The `roleFromEmail()` function in `supabase-config.js` routes them to the correct dashboard after authentication.

### Issue #4: Duplicated Supabase credentials across files
**Status: ✅ FIXED**

Created `shared/supabase-config.js` as a single source of truth. All pages import this shared file instead of duplicating keys.

### Issue #5: No database schema provided
**Status: ✅ FIXED**

Complete `supabase-schema.sql` with:
- 14 tables (profiles, course_offerings, student_semesters, enrollments, grades, transactions, installments, billing_summary, misc_fees, clearances, announcements, deadlines, activities, faq_articles, cor_signatories)
- RLS policies for every table
- Auto-profile creation trigger on auth signup
- Seed data for FAQ, misc fees, announcements, deadlines, sample courses

### Issue #6: No Groq AI integration code
**Status: ✅ FIXED**

Created `supabase/functions/faq-assistant/index.ts` Edge Function that:
- Retrieves FAQ articles from the database via keyword matching
- Sends context + user question to Groq's Llama 3.3 70B
- Returns grounded answer with source citations
- Falls back to direct FAQ answer if Groq API is unavailable

---

## 3. Remaining Improvements Checklist

### High Priority (Do Before Demo)
- [ ] **Replace placeholder Supabase credentials** in `shared/supabase-config.js` with real values from your Supabase dashboard
- [ ] **Run `supabase-schema.sql`** in Supabase SQL Editor to create all tables
- [ ] **Deploy the Edge Function**: `supabase functions deploy faq-assistant`
- [ ] **Set Edge Function secrets**: `supabase secrets set GROQ_API_KEY=your_key`
- [ ] **Configure Google OAuth** in Supabase Dashboard → Authentication → Providers → Google
- [ ] **Update email suffixes** in `shared/supabase-config.js` to match your real school domains
- [ ] **Test SSO + TOTP flow** end-to-end with a real school email
- [ ] **Add a `logo.png`** in the project root for the COR page

### Medium Priority (Polish Before Defense)
- [ ] **Add drop course functionality** — currently enrollment only adds; add a "Drop" button on enrolled courses
- [ ] **Faculty grade entry** — test the modal with real student data
- [ ] **Admin CRUD operations** — admin dashboard is read-only; add create/edit/delete for courses, announcements
- [ ] **Session timeout handling** — redirect to login when Supabase token expires
- [ ] **Loading states** — add skeleton loaders for slower Pi connections
- [ ] **Error boundaries** — wrap fetch calls in try/catch with user-friendly error messages
- [ ] **Print CSS for COR** — already exists; test on actual paper

### Low Priority (Nice to Have)
- [ ] **PWA manifest** — make the portal installable as a mobile app
- [ ] **Push notifications** — use Supabase Realtime for live updates
- [ ] **Dark mode consistency** — staff/faculty/admin dashboards currently only support light mode
- [ ] **Audit log** — track who approved what clearance and when
- [ ] **Bulk grade import** — CSV upload for faculty
- [ ] **Payment gateway** — integrate GCash or Dragonpay for online payments

---

## 4. Deployment: Raspberry Pi + Docker + Ngrok

### Step 1: Prepare the Raspberry Pi 4
```bash
# Install Docker on Raspberry Pi (Raspberry Pi OS 64-bit)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in for group change to take effect

# Install Docker Compose
sudo apt-get install -y docker-compose-plugin
```

### Step 2: Copy Project Files
```bash
# Create project directory
mkdir -p ~/myimcc-portal
cd ~/myimcc-portal

# Copy all files from this project to the Pi
# Option A: SCP from your dev machine
scp -r ./* pi@<PI_IP>:~/myimcc-portal/

# Option B: Clone from Git (if you push to a repo)
git clone <your-repo-url> ~/myimcc-portal
```

### Step 3: Create .env File
```bash
cp .env.example .env
nano .env
# Fill in all the real values
```

### Step 4: Start Docker Services
```bash
# Start Portainer + Ngrok
docker compose up -d

# Verify containers are running
docker compose ps

# Access Portainer at https://<PI_IP>:9443
# Access Ngrok inspector at http://<PI_IP>:4040
```

### Step 5: Serve Static Files
The portal is static HTML/CSS/JS. Serve it with a simple nginx container or Python:

```bash
# Option A: Python (quickest for testing)
cd ~/myimcc-portal
python3 -m http.server 8080

# Option B: Nginx in Docker (recommended for production)
docker run -d \
  --name myimcc-nginx \
  -p 8080:80 \
  -v ~/myimcc-portal:/usr/share/nginx/html:ro \
  --restart unless-stopped \
  nginx:alpine
```

### Step 6: Verify Ngrok Tunnel
```bash
# Check the Ngrok tunnel URL
curl http://localhost:4040/api/tunnels

# Or visit http://<PI_IP>:4040 in your browser
# You should see the tunnel forwarding to localhost:8080
```

---

## 5. Supabase Setup

1. **Create a project** at [supabase.com](https://supabase.com)
2. **Get your keys**: Project Settings → API
   - `SUPABASE_URL` = Project URL
   - `SUPABASE_ANON_KEY` = anon public key
   - `SUPABASE_SERVICE_ROLE_KEY` = service_role key (keep secret!)
3. **Run the schema**: Go to SQL Editor → New Query → paste contents of `supabase-schema.sql` → Run
4. **Verify tables**: Go to Table Editor — you should see all 14 tables
5. **Set up Edge Function secrets**:
   ```bash
   supabase secrets set GROQ_API_KEY=your-groq-key
   supabase secrets set GROQ_MODEL=llama-3.3-70b-versatile
   ```

---

## 6. Google OAuth (SSO) Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or use existing)
3. APIs & Services → Credentials → Create Credentials → OAuth client ID
4. Application type: Web application
5. Authorized redirect URIs:
   ```
   https://YOUR_PROJECT_ID.supabase.co/auth/v1/callback
   ```
6. Copy the Client ID and Client Secret
7. In Supabase Dashboard → Authentication → Providers → Google:
   - Enable Google
   - Paste Client ID and Client Secret
8. In Supabase Dashboard → Authentication → URL Configuration:
   - Set Site URL to your Ngrok URL: `https://your-domain.ngrok.app`
   - Add redirect URL: `https://your-domain.ngrok.app/login.html`

---

## 7. Groq AI Chatbot Setup

1. Get an API key at [console.groq.com](https://console.groq.com)
2. Set the key as a Supabase secret:
   ```bash
   supabase secrets set GROQ_API_KEY=gsk_your_key_here
   ```
3. Deploy the Edge Function:
   ```bash
   supabase functions deploy faq-assistant
   ```
4. Test it:
   ```bash
   curl -X POST \
     https://YOUR_PROJECT_ID.supabase.co/functions/v1/faq-assistant \
     -H "Authorization: Bearer YOUR_ANON_KEY" \
     -H "Content-Type: application/json" \
     -d '{"message":"How do I enroll?","history":[]}'
   ```

### How the AI Works
1. Student asks a question in the chat widget
2. Edge Function searches `faq_articles` table by keyword overlap
3. Top 5 FAQ articles become context for the LLM prompt
4. Groq's Llama 3.3 70B generates a grounded answer
5. If Groq fails, the best-matching FAQ answer is returned directly
6. Answer + source categories are displayed in the chat bubble

---

## 8. TOTP MFA Setup

MFA is handled natively by Supabase Auth:

1. Supabase Dashboard → Authentication → Factors
2. Enable TOTP factor
3. The flow in `login.js`:
   - Step 1: SSO (Google OAuth) → creates AAL1 session
   - Step 2A: If no TOTP factor enrolled → show QR code → verify code → AAL2
   - Step 2B: If TOTP factor exists → challenge → verify → AAL2
4. Users can reset MFA from the "Lost your code?" link

### Important Notes
- The Supabase JS client handles TOTP enrollment (`supabase.auth.mfa.enroll`)
- QR codes are generated server-side by Supabase
- The `handle_new_user` trigger auto-creates a profile on signup
- Email domain detection determines the role (student/faculty/admin/staff)

---

## 9. Security Hardening

### ✅ Already Implemented
- Row Level Security (RLS) on every table
- Auth guard (`requireAuth()`) on all dashboards
- Role-based access control (student/faculty/staff/admin)
- Email domain whitelist for institutional access
- TOTP MFA enforced for all users
- No hardcoded API keys in frontend (Supabase anon key is safe to expose)

### ⚠️ Must Do Before Production
- [ ] Replace all `YOUR_PROJECT_ID` and `YOUR_ANON_KEY` placeholders
- [ ] Set up Supabase Auth → Email → Confirm email (require email verification)
- [ ] Configure rate limiting on the Edge Function
- [ ] Set up Supabase audit logs
- [ ] Use Supabase service role key ONLY in Edge Functions (never in frontend)
- [ ] Enable HTTPS enforcement on Ngrok (use a reserved domain)
- [ ] Set up regular database backups in Supabase Dashboard
- [ ] Change Ngrok from free tier to a paid plan for stable domain

### Security Notes
- The `SUPABASE_ANON_KEY` is safe to include in frontend code — it only allows operations permitted by RLS policies
- The `SUPABASE_SERVICE_ROLE_KEY` must NEVER be in frontend code — it bypasses RLS
- Groq API key is stored as a Supabase secret, not in the frontend
- All password/TOTP handling is done by Supabase Auth, not custom code

---

## 10. Testing & Verification

### Smoke Test Checklist
Run through this after deployment:

| # | Test | Expected Result |
|---|------|----------------|
| 1 | Open Ngrok URL | Shows login page |
| 2 | Enter non-school email | Shows "Unauthorized Access" |
| 3 | Enter school email + click Sign In | Redirects to Google OAuth |
| 4 | Complete Google OAuth | Returns to login, shows QR code (first time) |
| 5 | Scan QR + enter TOTP code | Redirects to role-appropriate dashboard |
| 6 | Student dashboard loads | Shows stats, courses, grades, clearance |
| 7 | Click Enrollment tab | Shows available courses |
| 8 | Select a course | Billing summary updates |
| 9 | Click "Proceed to Fee Review" | Shows review step |
| 10 | Click "Confirm Enrollment" | Shows confirmation |
| 11 | Click "Certificate (COR)" | Shows printable COR |
| 12 | Click "Print Certificate" | Opens print dialog |
| 13 | Open FAQ chatbot | Shows greeting message |
| 14 | Ask "How do I enroll?" | Gets AI-powered answer with sources |
| 15 | Faculty login | Shows teacher dashboard with classes |
| 16 | Click "View Roster & Grades" | Shows grade entry modal |
| 17 | Staff login | Shows staff dashboard with clearance table |
| 18 | Click "Mark Cleared" | Updates clearance status |
| 19 | Admin login | Shows admin dashboard with overview |
| 20 | Navigate admin sections | Each tab loads data correctly |
| 21 | Test on mobile (Chrome DevTools) | Layout is responsive |
| 22 | Test dark mode toggle | Theme switches correctly |
| 23 | Click "Sign Out" | Returns to login page |

---

## 11. Rollback & Recovery

### Database Rollback
```sql
-- If schema migration fails, you can drop all tables:
-- ⚠️ THIS DELETES ALL DATA — use with caution!
DROP TABLE IF EXISTS cor_signatories, faq_articles, activities,
  deadlines, announcements, clearances, misc_fees, billing_summary,
  installments, transactions, grades, enrollments, student_semesters,
  course_offerings, profiles CASCADE;
DROP FUNCTION IF EXISTS handle_new_user() CASCADE;
```

### Ngrok Tunnel Reset
```bash
# If Ngrok tunnel drops
docker compose restart ngrok

# Check new URL
curl http://localhost:4040/api/tunnels
```

### Docker Recovery
```bash
# Restart all containers
docker compose restart

# View logs
docker compose logs -f

# Full reset
docker compose down
docker compose up -d
```

### Supabase Backup
- Supabase automatically backs up daily on free tier
- For manual backup: Dashboard → Database → Backups → Create Backup
- Export individual tables: Dashboard → Table Editor → Export → CSV

---

## 12. Handoff Checklist

### Files Delivered

| File | Purpose |
|------|---------|
| `.env.example` | Environment variable template |
| `supabase-schema.sql` | Complete database schema + seed data |
| `docker-compose.yml` | Docker services (Portainer + Ngrok) |
| `shared/supabase-config.js` | Shared Supabase client + auth helpers |
| `shared/portal.css` | Shared design tokens for role dashboards |
| `supabase/functions/faq-assistant/index.ts` | Groq AI Edge Function |
| `staff/staff-dashboard.html` | Fixed staff dashboard (Supabase-native) |
| `faculty/teacher-dashboard.html` | Fixed faculty dashboard with grade entry |
| `admin/admin-dashboard.html` | Fixed admin dashboard (Supabase-native) |
| `PRODUCTION-GUIDE.md` | This document |

### Your Existing Files (Not Modified)
These files from your original codebase are already production-quality and don't need changes:
- `login.html` + `login.css` + `login.js` — SSO + TOTP flow ✅
- `dashboard.html` + `dashboard.css` + `dashboard.js` — Student dashboard ✅
- `cor.html` — Certificate of Registration ✅

### What You Need to Do Next
1. Replace placeholder Supabase credentials (find & replace `YOUR_PROJECT_ID`)
2. Run `supabase-schema.sql` in Supabase SQL Editor
3. Deploy the Edge Function with `supabase functions deploy faq-assistant`
4. Set up Google OAuth in Supabase Dashboard
5. Set up Groq API key as Supabase secret
6. Update email domains to match your real school domains
7. Copy all files to the Raspberry Pi
8. Start Docker services
9. Run through the smoke test checklist
10. Demo it to your panel!

---

## Risk Items

| Risk | Impact | Mitigation |
|------|--------|------------|
| Ngrok free tier URL changes on restart | Users lose access | Use reserved domain (paid) or document URL change procedure |
| Raspberry Pi SD card failure | Total data loss on Pi | Supabase is cloud-hosted, so DB is safe; keep Git backup of static files |
| Supabase free tier limits | API rate limits | Monitor usage; upgrade if needed |
| Groq API rate limits | Chatbot degradation | Fallback to keyword-based FAQ answers (already implemented) |
| Google OAuth consent screen not verified | Users see scary warning | Submit app for verification or use test mode with user whitelist |
| School email domains not matching | Users can't sign in | Update `ALLOWED_SUFFIXES` in `supabase-config.js` |
