-- =====================================================================
-- MyIMCC Portal — Supabase Database Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- This creates all tables, RLS policies, and seed data.
-- =====================================================================

-- ── Extensions ───────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Profiles (linked to auth.users) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  full_name   TEXT NOT NULL,
  student_no  TEXT UNIQUE,
  program     TEXT,
  year_level  TEXT,
  section     TEXT,
  role        TEXT NOT NULL DEFAULT 'student'
              CHECK (role IN ('student','faculty','staff','admin')),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ── Course Offerings (catalog + schedule) ────────────────────────────
CREATE TABLE IF NOT EXISTS course_offerings (
  id              SERIAL PRIMARY KEY,
  code            TEXT NOT NULL,
  title           TEXT NOT NULL,
  units           NUMERIC(4,1) NOT NULL DEFAULT 3.0,
  fee             NUMERIC(10,2) NOT NULL DEFAULT 0,
  instructor_name TEXT,
  schedule        TEXT,
  program         TEXT,
  year            INT,
  semester        INT,
  school_year     TEXT NOT NULL,
  is_major        BOOLEAN DEFAULT false,
  prerequisites   TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ── Student Semesters (term tracking) ────────────────────────────────
CREATE TABLE IF NOT EXISTS student_semesters (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id         UUID REFERENCES profiles(id) ON DELETE CASCADE,
  school_year        TEXT NOT NULL,
  semester           TEXT NOT NULL,
  is_current         BOOLEAN DEFAULT false,
  gwa                NUMERIC(5,2),
  units_enrolled     INT DEFAULT 0,
  subjects_enrolled  INT DEFAULT 0,
  balance            NUMERIC(10,2) DEFAULT 0,
  created_at         TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, school_year, semester)
);

-- ── Enrollments ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS enrollments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id  UUID REFERENCES profiles(id) ON DELETE CASCADE,
  offering_id INT REFERENCES course_offerings(id) ON DELETE CASCADE,
  status      TEXT DEFAULT 'enrolled'
              CHECK (status IN ('enrolled','dropped','completed')),
  enrolled_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, offering_id)
);

-- ── Grades ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS grades (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id               UUID REFERENCES profiles(id) ON DELETE CASCADE,
  offering_id              INT REFERENCES course_offerings(id) ON DELETE CASCADE,
  midterm                  NUMERIC(5,2),
  final                    NUMERIC(5,2),
  equivalent               NUMERIC(5,2),
  ai_predicted_grade       NUMERIC(5,2),
  ai_predicted_equivalent  NUMERIC(5,2),
  remark                   TEXT DEFAULT 'Pending'
                           CHECK (remark IN ('Passed','Failed','Pending','Dropped')),
  created_at               TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, offering_id)
);

-- ── Billing ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id  UUID REFERENCES profiles(id) ON DELETE CASCADE,
  or_number   TEXT,
  txn_date    TIMESTAMPTZ DEFAULT now(),
  description TEXT,
  channel     TEXT DEFAULT 'Cashier',
  amount      NUMERIC(10,2) NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS installments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id  UUID REFERENCES profiles(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  amount      NUMERIC(10,2) NOT NULL,
  due_date    DATE NOT NULL,
  status      TEXT DEFAULT 'pending'
              CHECK (status IN ('pending','paid')),
  paid_at     TIMESTAMPTZ,
  or_number   TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing_summary (
  student_id  UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  total_paid  NUMERIC(10,2) DEFAULT 0,
  balance     NUMERIC(10,2) DEFAULT 0,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ── Miscellaneous Fees ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS misc_fees (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  amount      NUMERIC(10,2) NOT NULL,
  semester    TEXT,
  school_year TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ── Clearance ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clearances (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id      UUID REFERENCES profiles(id) ON DELETE CASCADE,
  department_code TEXT NOT NULL,
  department_name TEXT NOT NULL,
  officer_name    TEXT,
  icon            TEXT DEFAULT '📄',
  status          TEXT DEFAULT 'pending'
                  CHECK (status IN ('cleared','pending','action_required')),
  note            TEXT,
  cleared_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, department_code)
);

-- ── Announcements ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS announcements (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content     TEXT NOT NULL,
  deadline    DATE,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ── Deadlines ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deadlines (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title       TEXT NOT NULL,
  due_date    DATE NOT NULL,
  type        TEXT DEFAULT 'optional'
              CHECK (type IN ('urgent','schedule','optional')),
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ── Activities (recent activity feed) ────────────────────────────────
CREATE TABLE IF NOT EXISTS activities (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id  UUID REFERENCES profiles(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  color       TEXT DEFAULT '#E7338A',
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ── FAQ Articles (for AI chatbot grounding) ──────────────────────────
CREATE TABLE IF NOT EXISTS faq_articles (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category    TEXT NOT NULL,
  question    TEXT NOT NULL,
  answer      TEXT NOT NULL,
  keywords    TEXT,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ── COR Signatories ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cor_signatories (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cashier_name    TEXT,
  registrar_name  TEXT,
  is_active       BOOLEAN DEFAULT true
);

-- ── Trigger: Auto-create profile on user signup ─────────────────────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  lower_email TEXT;
BEGIN
  lower_email := LOWER(NEW.email);
  INSERT INTO profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    CASE
      WHEN lower_email LIKE '%@faculty.%' THEN 'faculty'
      WHEN lower_email LIKE '%@admin.%' THEN 'admin'
      WHEN lower_email LIKE '%@imcc.edu.ph' AND lower_email NOT LIKE '%@student.%'
           AND lower_email NOT LIKE '%@faculty.%' AND lower_email NOT LIKE '%@admin.%' THEN 'staff'
      ELSE 'student'
    END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ── Row Level Security (RLS) Policies ────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_offerings ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_semesters ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE misc_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE clearances ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE deadlines ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE faq_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE cor_signatories ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read their own profile; admins can read all
CREATE POLICY "Users read own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admins read all profiles" ON profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Course offerings: everyone authenticated can read
CREATE POLICY "Authenticated read offerings" ON course_offerings
  FOR SELECT TO authenticated USING (true);

-- Student semesters: students read their own; admins read all
CREATE POLICY "Students read own semesters" ON student_semesters
  FOR SELECT USING (student_id = auth.uid());
CREATE POLICY "Admins read all semesters" ON student_semesters
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Enrollments: students read their own; faculty/admin read all
CREATE POLICY "Students read own enrollments" ON enrollments
  FOR SELECT USING (student_id = auth.uid());
CREATE POLICY "Students insert own enrollments" ON enrollments
  FOR INSERT WITH CHECK (student_id = auth.uid());
CREATE POLICY "Students update own enrollments" ON enrollments
  FOR UPDATE USING (student_id = auth.uid());
CREATE POLICY "Staff read all enrollments" ON enrollments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('faculty','staff','admin'))
  );

-- Grades: students read their own; faculty can read for their courses
CREATE POLICY "Students read own grades" ON grades
  FOR SELECT USING (student_id = auth.uid());
CREATE POLICY "Faculty read all grades" ON grades
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('faculty','admin'))
  );
CREATE POLICY "Faculty update grades" ON grades
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('faculty','admin'))
  );

-- Billing: students read their own
CREATE POLICY "Students read own transactions" ON transactions
  FOR SELECT USING (student_id = auth.uid());
CREATE POLICY "Students read own installments" ON installments
  FOR SELECT USING (student_id = auth.uid());
CREATE POLICY "Students update own installments" ON installments
  FOR UPDATE USING (student_id = auth.uid());
CREATE POLICY "Students read own billing" ON billing_summary
  FOR SELECT USING (student_id = auth.uid());

-- Clearance: students read their own; staff/admin can read all
CREATE POLICY "Students read own clearance" ON clearances
  FOR SELECT USING (student_id = auth.uid());
CREATE POLICY "Staff read all clearances" ON clearances
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('staff','admin'))
  );
CREATE POLICY "Staff update clearances" ON clearances
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('staff','admin'))
  );

-- Public read tables (announcements, deadlines, misc_fees, faq_articles, cor_signatories)
CREATE POLICY "Anyone can read announcements" ON announcements
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can read deadlines" ON deadlines
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can read misc_fees" ON misc_fees
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can read faq" ON faq_articles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can read signatories" ON cor_signatories
  FOR SELECT TO authenticated USING (true);

-- Activities: students read their own
CREATE POLICY "Students read own activities" ON activities
  FOR SELECT USING (student_id = auth.uid());

-- ── Seed Data: COR Signatories ───────────────────────────────────────
INSERT INTO cor_signatories (cashier_name, registrar_name, is_active)
VALUES ('Mrs. Maria Santos', 'Dr. Juan Dela Cruz', true)
ON CONFLICT DO NOTHING;

-- ── Seed Data: Misc Fees (2nd Sem AY 2025-2026) ──────────────────────
INSERT INTO misc_fees (name, amount, semester, school_year) VALUES
  ('Library Fee', 500.00, '2nd Semester', '2025-2026'),
  ('Laboratory Fee', 1500.00, '2nd Semester', '2025-2026'),
  ('IT Services Fee', 800.00, '2nd Semester', '2025-2026'),
  ('Guidance Fee', 300.00, '2nd Semester', '2025-2026'),
  ('Student Council Fee', 200.00, '2nd Semester', '2025-2026'),
  ('Athletic Fee', 350.00, '2nd Semester', '2025-2026'),
  ('Medical & Dental Fee', 450.00, '2nd Semester', '2025-2026'),
  ('Cultural Fee', 250.00, '2nd Semester', '2025-2026')
ON CONFLICT DO NOTHING;

-- ── Seed Data: Announcements ─────────────────────────────────────────
INSERT INTO announcements (content, deadline, is_active) VALUES
  ('Enrollment for 2nd Semester AY 2025-2026 is now OPEN. Please settle your balance before enrolling.', '2026-01-15', true),
  ('Midterm examination schedule has been posted. Please check with your respective instructors.', '2026-02-28', true)
ON CONFLICT DO NOTHING;

-- ── Seed Data: Deadlines ─────────────────────────────────────────────
INSERT INTO deadlines (title, due_date, type, is_active) VALUES
  ('Enrollment Period Closes', '2026-01-15', 'urgent', true),
  ('Midterm Exam Week', '2026-02-24', 'schedule', true),
  ('Final Exam Week', '2026-04-28', 'schedule', true),
  ('Clearance Processing', '2026-05-15', 'optional', true)
ON CONFLICT DO NOTHING;

-- ── Seed Data: FAQ Articles ──────────────────────────────────────────
INSERT INTO faq_articles (category, question, answer, keywords) VALUES
  ('Enrollment', 'How do I enroll in courses?',
   'Navigate to the Enrollment tab from the sidebar. Select your desired courses by checking the boxes, review your fees in the billing summary, then click Proceed to Fee Review. Confirm your enrollment on step 3.',
   'enroll, enrollment, courses, subjects, register, add, drop'),
  ('Enrollment', 'Can I drop a course after enrolling?',
   'Yes, you can drop a course by going to the Enrollment tab and unchecking the course you wish to drop. Note that dropping courses after the add/drop deadline may have academic and financial implications.',
   'drop, unenroll, remove, withdraw, cancel'),
  ('Billing', 'How do I pay my tuition?',
   'Go to Billing & History. Under Upcoming Payments, click Pay Now on any pending installment. You can also visit the Cashier''s Office for in-person payments.',
   'pay, payment, tuition, fee, cash, install'),
  ('Billing', 'What payment methods are accepted?',
   'Currently, payments are processed through the Cashier''s Office. Online payment integration is coming soon.',
   'payment, method, cash, gcash, bank, online'),
  ('Grades', 'When are grades released?',
   'Midterm grades are typically released within one week after midterm exams. Final grades are released within two weeks after final exams. Check the Grades & Evaluation tab for updates.',
   'grades, release, midterm, final, results, score'),
  ('Grades', 'What is the AI Grade Prediction?',
   'The AI Grade Prediction uses historical grade patterns and your midterm scores to estimate your final grade. It is an estimate only and actual results may vary.',
   'ai, prediction, grade, forecast, estimate, smart'),
  ('Clearance', 'What is online clearance?',
   'Online clearance is a digital process where each department signs off that you have no outstanding obligations. You need all departments cleared before you can enroll for the next semester.',
   'clearance, clear, department, sign, process'),
  ('Clearance', 'Why is my clearance showing Action Required?',
   'Action Required means a department needs you to do something (e.g., pay a balance, return a library book). Check the note on the clearance card for specific instructions.',
   'action, required, hold, block, pending'),
  ('General', 'How do I set up Two-Factor Authentication (2FA)?',
   'After signing in with your school email, you will be prompted to scan a QR code with Google Authenticator. Enter the 6-digit code to verify. You can also set up MFA from the user menu in the dashboard.',
   '2fa, mfa, authenticator, totp, qr, code, two-factor'),
  ('General', 'What email domains are allowed?',
   'Only institutional email domains are allowed: @student.imcc.edu.ph (students), @faculty.imcc.edu.ph (faculty), @admin.imcc.edu.ph (admins), and @imcc.edu.ph (staff).',
   'email, domain, school, institutional, allowed')
ON CONFLICT DO NOTHING;

-- ── Seed Data: Sample Course Offerings ───────────────────────────────
INSERT INTO course_offerings (code, title, units, fee, instructor_name, schedule, program, year, semester, school_year, is_major) VALUES
  ('IT 101', 'Introduction to Computing', 3.0, 3000, 'Prof. Maria Santos', 'MWF 8:00-9:00', 'BSIT', 1, 1, '2025-2026', false),
  ('IT 102', 'Computer Programming I', 3.0, 3500, 'Engr. Jose Rizal', 'TTh 9:00-10:30', 'BSIT', 1, 1, '2025-2026', true),
  ('IT 201', 'Data Structures & Algorithms', 3.0, 4000, 'Prof. Maria Santos', 'MWF 10:00-11:00', 'BSIT', 2, 1, '2025-2026', true),
  ('IT 202', 'Database Management Systems', 3.0, 4000, 'Engr. Carlos Garcia', 'TTh 13:00-14:30', 'BSIT', 2, 1, '2025-2026', true),
  ('IT 203', 'Web Development', 3.0, 4000, 'Mr. Antonio Lopez', 'MWF 14:00-15:00', 'BSIT', 2, 2, '2025-2026', true),
  ('IT 204', 'Object-Oriented Programming', 3.0, 4000, 'Engr. Jose Rizal', 'TTh 10:30-12:00', 'BSIT', 2, 2, '2025-2026', true),
  ('IT 205', 'Network Fundamentals', 3.0, 4000, 'Engr. Carlos Garcia', 'MWF 9:00-10:00', 'BSIT', 2, 2, '2025-2026', true),
  ('MATH 101', 'College Algebra', 3.0, 3000, 'Prof. Rosario Cruz', 'MWF 11:00-12:00', 'BSIT', 1, 1, '2025-2026', false),
  ('ENG 101', 'Communication Skills', 3.0, 3000, 'Ms. Patricia Lim', 'TTh 8:00-9:30', 'BSIT', 1, 1, '2025-2026', false),
  ('FIL 101', 'Filipino sa Iba''t Ibang Disiplina', 3.0, 2500, 'Mr. Eduardo Reyes', 'MWF 13:00-14:00', 'BSIT', 1, 1, '2025-2026', false)
ON CONFLICT DO NOTHING;
