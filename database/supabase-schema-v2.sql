-- =====================================================================
-- MyIMCC Portal — RBAC Schema Update (v2)
-- Run AFTER the original supabase-schema.sql
-- Adds: attendance, timetable, rooms, internal messaging, system settings,
--       academic structure (departments, sections, academic years),
--       user management support, session oversight, SSO navigation links
-- =====================================================================

-- ── Departments ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS departments (
  id          SERIAL PRIMARY KEY,
  code        TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  head_name   TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ── Academic Years ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS academic_years (
  id          SERIAL PRIMARY KEY,
  label       TEXT NOT NULL,          -- e.g. "AY 2025-2026"
  start_date  DATE,
  end_date    DATE,
  is_active   BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ── Sections / Classes ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sections (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,       -- e.g. "Grade 10 - Section A" or "BSIT 2-A"
  program         TEXT,
  year_level      TEXT,
  academic_year_id INT REFERENCES academic_years(id),
  adviser_id      UUID REFERENCES profiles(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ── Rooms ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rooms (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,           -- e.g. "Room 101", "Computer Lab 1"
  building    TEXT,
  capacity    INT,
  type        TEXT DEFAULT 'classroom' CHECK (type IN ('classroom','lab','auditorium','office','other')),
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ── Timetable (Master Schedule) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS timetable (
  id              SERIAL PRIMARY KEY,
  offering_id     INT REFERENCES course_offerings(id) ON DELETE CASCADE,
  day_of_week     TEXT NOT NULL CHECK (day_of_week IN ('Mon','Tue','Wed','Thu','Fri','Sat','Sun')),
  start_time      TIME NOT NULL,
  end_time        TIME NOT NULL,
  room_id         INT REFERENCES rooms(id),
  teacher_id      UUID REFERENCES profiles(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(offering_id, day_of_week, start_time)
);

-- ── Attendance ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id      UUID REFERENCES profiles(id) ON DELETE CASCADE,
  offering_id     INT REFERENCES course_offerings(id) ON DELETE CASCADE,
  timetable_id    INT REFERENCES timetable(id) ON DELETE SET NULL,
  date            DATE NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('present','absent','late','excused')),
  notes           TEXT,
  marked_by       UUID REFERENCES profiles(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, offering_id, date)
);

-- ── Internal Messaging ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id   UUID REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  subject     TEXT,
  body        TEXT NOT NULL,
  is_read     BOOLEAN DEFAULT false,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ── System Settings (Groq AI config, etc.) ───────────────────────────
CREATE TABLE IF NOT EXISTS system_settings (
  id          SERIAL PRIMARY KEY,
  key         TEXT UNIQUE NOT NULL,
  value       TEXT NOT NULL,
  category    TEXT DEFAULT 'general',
  description TEXT,
  updated_by  UUID REFERENCES profiles(id),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ── Chat Logs (AI FAQ bot history) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES profiles(id) ON DELETE CASCADE,
  user_message TEXT NOT NULL,
  bot_response TEXT NOT NULL,
  sources     JSONB,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ── Class Announcements (faculty → students) ─────────────────────────
CREATE TABLE IF NOT EXISTS class_announcements (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  author_id   UUID REFERENCES profiles(id) ON DELETE CASCADE,
  offering_id INT REFERENCES course_offerings(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ── SSO Navigation Links (LMS, Career Hub, etc.) ─────────────────────
CREATE TABLE IF NOT EXISTS sso_links (
  id          SERIAL PRIMARY KEY,
  label       TEXT NOT NULL,           -- "LMS", "Career Hub"
  url         TEXT NOT NULL,
  icon        TEXT DEFAULT '🔗',
  sort_order  INT DEFAULT 0,
  is_active   BOOLEAN DEFAULT true,
  roles       TEXT DEFAULT 'student,faculty',  -- comma-separated roles that can see it
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ── User Account Status (for deactivation) ───────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS address TEXT;

-- ── RLS on new tables ────────────────────────────────────────────────
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE timetable ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE sso_links ENABLE ROW LEVEL SECURITY;

-- Departments, academic years, rooms, sections, timetable, sso_links: authenticated read
CREATE POLICY "Authenticated read departments" ON departments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins write departments" ON departments FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Authenticated read academic_years" ON academic_years FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins write academic_years" ON academic_years FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Authenticated read sections" ON sections FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins write sections" ON sections FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Authenticated read rooms" ON rooms FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins write rooms" ON rooms FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Authenticated read timetable" ON timetable FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins write timetable" ON timetable FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Attendance: students read own; faculty/staff/admin can read all; faculty can write
CREATE POLICY "Students read own attendance" ON attendance FOR SELECT USING (student_id = auth.uid());
CREATE POLICY "Faculty read all attendance" ON attendance FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('faculty','staff','admin'))
);
CREATE POLICY "Faculty write attendance" ON attendance FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('faculty','admin'))
);

-- Messages: users read their own (sent or received); users insert own; users update own received
CREATE POLICY "Users read own messages" ON messages FOR SELECT USING (
  sender_id = auth.uid() OR recipient_id = auth.uid()
);
CREATE POLICY "Users send messages" ON messages FOR INSERT WITH CHECK (sender_id = auth.uid());
CREATE POLICY "Users update own messages" ON messages FOR UPDATE USING (recipient_id = auth.uid());

-- System settings: admin read/write; others read
CREATE POLICY "Authenticated read settings" ON system_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins write settings" ON system_settings FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Chat logs: users read own; admin reads all
CREATE POLICY "Users read own chat_logs" ON chat_logs FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Admins read all chat_logs" ON chat_logs FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Class announcements: students read for their enrolled courses; faculty write own
CREATE POLICY "Students read class announcements" ON class_announcements FOR SELECT USING (
  is_active = true AND EXISTS (
    SELECT 1 FROM enrollments e
    WHERE e.student_id = auth.uid() AND e.offering_id = class_announcements.offering_id
  )
);
CREATE POLICY "Faculty read all class announcements" ON class_announcements FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('faculty','admin'))
);
CREATE POLICY "Faculty write own announcements" ON class_announcements FOR ALL USING (
  author_id = auth.uid() OR EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  )
);

-- SSO links: authenticated read
CREATE POLICY "Authenticated read sso_links" ON sso_links FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins write sso_links" ON sso_links FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Update profiles policy to allow admin write (for user management)
CREATE POLICY "Admins update profiles" ON profiles FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Users update own profile" ON profiles FOR UPDATE USING (id = auth.uid());

-- ── Seed Data: Departments ───────────────────────────────────────────
INSERT INTO departments (code, name, head_name) VALUES
  ('IT', 'Information Technology', 'Prof. Maria Santos'),
  ('GEN', 'General Education', 'Prof. Rosario Cruz'),
  ('ENG', 'English & Communication', 'Ms. Patricia Lim'),
  ('MATH', 'Mathematics', 'Prof. Rosario Cruz'),
  ('REG', 'Registrar Office', 'Dr. Juan Dela Cruz'),
  ('FIN', 'Finance & Accounting', 'Mrs. Maria Santos')
ON CONFLICT DO NOTHING;

-- ── Seed Data: Academic Year ─────────────────────────────────────────
INSERT INTO academic_years (label, start_date, end_date, is_active) VALUES
  ('AY 2025-2026', '2025-08-01', '2026-07-31', true)
ON CONFLICT DO NOTHING;

-- ── Seed Data: Rooms ─────────────────────────────────────────────────
INSERT INTO rooms (name, building, capacity, type) VALUES
  ('Room 101', 'Main Building', 40, 'classroom'),
  ('Room 102', 'Main Building', 40, 'classroom'),
  ('Computer Lab 1', 'IT Building', 30, 'lab'),
  ('Computer Lab 2', 'IT Building', 30, 'lab'),
  ('Auditorium A', 'Main Building', 200, 'auditorium'),
  ('Faculty Lounge', 'Main Building', 20, 'office')
ON CONFLICT DO NOTHING;

-- ── Seed Data: SSO Links ─────────────────────────────────────────────
INSERT INTO sso_links (label, url, icon, sort_order, is_active, roles) VALUES
  ('LMS', 'https://gooey-kick-outsmart.ngrok-free.dev/', '📚', 1, true, 'student,faculty,teacher,dean,admin,staff'),
  ('Career Hub', 'https://careers.imcc.edu.ph', '💼', 2, true, 'student,faculty'),
  ('Library', 'https://library.imcc.edu.ph', '📖', 3, true, 'student,faculty,staff,admin'),
  ('Email', 'https://mail.imcc.edu.ph', '📧', 4, true, 'student,faculty,staff,admin')
ON CONFLICT DO NOTHING;

-- ── Seed Data: System Settings ───────────────────────────────────────
INSERT INTO system_settings (key, value, category, description) VALUES
  ('groq_model', 'llama-3.3-70b-versatile', 'ai', 'Groq LLM model for FAQ chatbot'),
  ('groq_temperature', '0.3', 'ai', 'Temperature for Groq responses'),
  ('groq_max_tokens', '500', 'ai', 'Max tokens for Groq responses'),
  ('portal_name', 'MyIMCC Portal', 'general', 'Display name of the portal'),
  ('school_name', 'Iligan Medical Center College', 'general', 'Full school name'),
  ('support_email', 'support@imcc.edu.ph', 'general', 'IT support email'),
  ('registrar_email', 'registrar@imcc.edu.ph', 'general', 'Registrar email'),
  ('max_login_attempts', '5', 'security', 'Max failed login attempts before lockout'),
  ('session_timeout_minutes', '60', 'security', 'Session idle timeout in minutes')
ON CONFLICT DO NOTHING;

-- ── Seed Data: Sample Timetable ──────────────────────────────────────
INSERT INTO timetable (offering_id, day_of_week, start_time, end_time, room_id, teacher_id) VALUES
  (1, 'Mon', '08:00', '09:00', 1, NULL),
  (1, 'Wed', '08:00', '09:00', 1, NULL),
  (1, 'Fri', '08:00', '09:00', 1, NULL),
  (2, 'Tue', '09:00', '10:30', 3, NULL),
  (2, 'Thu', '09:00', '10:30', 3, NULL),
  (3, 'Mon', '10:00', '11:00', 3, NULL),
  (3, 'Wed', '10:00', '11:00', 3, NULL),
  (3, 'Fri', '10:00', '11:00', 3, NULL)
ON CONFLICT DO NOTHING;

-- ── Clearance Departments Table & Initialization ──────────────────────
CREATE TABLE IF NOT EXISTS clearance_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  icon text DEFAULT '📄'
);

ALTER TABLE clearance_departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read clearance_departments" ON clearance_departments FOR SELECT TO authenticated USING (true);

INSERT INTO clearance_departments (code, name, icon) VALUES
  ('cashier', 'Cashier', '💵'),
  ('medical_dental', 'Medical/Dental Clinic', '🩺'),
  ('property_custodian', 'Property Custodian', '📦'),
  ('guidance', 'Guidance', '🧭'),
  ('dean', 'Dean', '🏛️'),
  ('registrar', 'Registrar', '📋'),
  ('dsa', 'Dean of Student Affairs (DSA)', '🎓'),
  ('library', 'Library', '📚'),
  ('laboratory', 'Laboratory/Nursing Arts/Cybershack', '🔬'),
  ('rotc_cwts', 'ROTC/CWTS', '🎖️')
ON CONFLICT (code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.initialize_student_clearances(target_student_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  IF target_student_id IS NULL THEN
    target_student_id := auth.uid();
  END IF;

  IF target_student_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.clearances (student_id, department_code, department_name, officer_name, icon, status, note, cleared_at)
  SELECT 
    target_student_id,
    cd.code,
    cd.name,
    CASE 
      WHEN cd.code = 'cashier' THEN 'Ms. Maria Clara'
      WHEN cd.code = 'medical_dental' THEN 'Dr. Josefa Llanes'
      WHEN cd.code = 'property_custodian' THEN 'Engr. Emilio Aguinaldo'
      WHEN cd.code = 'guidance' THEN 'Ms. Leonor Rivera'
      WHEN cd.code = 'dean' THEN 'Dr. Joeselito Ortiz'
      WHEN cd.code = 'registrar' THEN 'Atty. Apolinario Mabini'
      WHEN cd.code = 'dsa' THEN 'Prof. Marcelo Del Pilar'
      WHEN cd.code = 'library' THEN 'Mr. Jose Rizal'
      WHEN cd.code = 'laboratory' THEN 'Mr. Juan Luna'
      WHEN cd.code = 'rotc_cwts' THEN 'Col. Antonio Luna'
      ELSE 'Department Officer'
    END,
    cd.icon,
    'cleared',
    CASE 
      WHEN cd.code = 'cashier' THEN 'All tuition installments settled'
      WHEN cd.code = 'medical_dental' THEN 'Annual medical & dental checkup cleared'
      WHEN cd.code = 'property_custodian' THEN 'No unreturned school property or equipment'
      WHEN cd.code = 'guidance' THEN 'Counseling clearance cleared'
      WHEN cd.code = 'dean' THEN 'Academic requirements certified'
      WHEN cd.code = 'registrar' THEN 'Credentials and academic documents verified'
      WHEN cd.code = 'dsa' THEN 'Good moral standing, no disciplinary records'
      WHEN cd.code = 'library' THEN 'No pending book holds or overdue materials'
      WHEN cd.code = 'laboratory' THEN 'All hardware, glassware & kits accounted for'
      WHEN cd.code = 'rotc_cwts' THEN 'NSTP/ROTC requirements completed'
      ELSE 'No pending holds'
    END,
    now()
  FROM public.clearance_departments cd
  ON CONFLICT (student_id, department_code) DO UPDATE
  SET department_name = EXCLUDED.department_name,
      icon = EXCLUDED.icon;
END;
$function$;

