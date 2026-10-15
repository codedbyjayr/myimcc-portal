-- Schema-only snapshot of myimcc-portal for ycziiezfrwnzouilutum. No production rows.

SET check_function_bodies = false;

CREATE SCHEMA IF NOT EXISTS private;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

SET search_path = public, extensions, pg_catalog;

DO $$ BEGIN IF to_regclass('public.profiles') IS NOT NULL THEN RAISE EXCEPTION 'Test baseline requires a fresh database'; END IF; END $$;

CREATE SEQUENCE public.grading_scale_id_seq AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;

CREATE SEQUENCE public.course_offerings_id_seq AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;

CREATE SEQUENCE public.misc_fees_id_seq AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;

CREATE SEQUENCE public.departments_id_seq AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;

CREATE SEQUENCE public.academic_years_id_seq AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;

CREATE SEQUENCE public.sections_id_seq AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;

CREATE SEQUENCE public.rooms_id_seq AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;

CREATE SEQUENCE public.timetable_id_seq AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;

CREATE SEQUENCE public.system_settings_id_seq AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;

CREATE SEQUENCE public.sso_links_id_seq AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;

CREATE TABLE public.departments (id integer DEFAULT nextval('departments_id_seq'::regclass) NOT NULL, code text NOT NULL, name text NOT NULL, head_name text, created_at timestamp with time zone DEFAULT now());

CREATE TABLE public.grading_scale (id integer DEFAULT nextval('grading_scale_id_seq'::regclass) NOT NULL, equivalent numeric(3,2) NOT NULL, percentage_min numeric(5,2) NOT NULL, percentage_max numeric(5,2) NOT NULL, description text NOT NULL, category text NOT NULL, is_passing boolean DEFAULT true);

CREATE TABLE public.timetable (id integer DEFAULT nextval('timetable_id_seq'::regclass) NOT NULL, offering_id integer, day_of_week text NOT NULL, start_time time without time zone NOT NULL, end_time time without time zone NOT NULL, room_id integer, teacher_id uuid, created_at timestamp with time zone DEFAULT now());

CREATE TABLE public.attendance (id uuid DEFAULT uuid_generate_v4() NOT NULL, student_id uuid, offering_id integer, timetable_id integer, date date NOT NULL, status text NOT NULL, notes text, marked_by uuid, created_at timestamp with time zone DEFAULT now());

CREATE TABLE public.messages (id uuid DEFAULT uuid_generate_v4() NOT NULL, sender_id uuid, recipient_id uuid, subject text, body text NOT NULL, is_read boolean DEFAULT false, read_at timestamp with time zone, created_at timestamp with time zone DEFAULT now());

CREATE TABLE public.class_announcements (id uuid DEFAULT uuid_generate_v4() NOT NULL, author_id uuid, offering_id integer, title text NOT NULL, body text NOT NULL, is_active boolean DEFAULT true, created_at timestamp with time zone DEFAULT now());

CREATE TABLE public.misc_fees (id integer DEFAULT nextval('misc_fees_id_seq'::regclass) NOT NULL, name text NOT NULL, amount numeric(10,2) NOT NULL, semester text, school_year text, created_at timestamp with time zone DEFAULT now());

CREATE TABLE public.activities (id uuid DEFAULT uuid_generate_v4() NOT NULL, student_id uuid, description text NOT NULL, color text DEFAULT '#E7338A'::text, created_at timestamp with time zone DEFAULT now());

CREATE TABLE public.clearances (id uuid DEFAULT uuid_generate_v4() NOT NULL, student_id uuid, department_code text NOT NULL, department_name text NOT NULL, officer_name text, icon text DEFAULT '📄'::text, status text DEFAULT 'pending'::text, note text, cleared_at timestamp with time zone, created_at timestamp with time zone DEFAULT now());

CREATE TABLE public.enrollments (id uuid DEFAULT uuid_generate_v4() NOT NULL, student_id uuid, offering_id integer, status text DEFAULT 'enrolled'::text, enrolled_at timestamp with time zone DEFAULT now());

CREATE TABLE public.student_semesters (id uuid DEFAULT uuid_generate_v4() NOT NULL, student_id uuid, school_year text NOT NULL, semester text NOT NULL, is_current boolean DEFAULT false, gwa numeric(5,2), units_enrolled integer DEFAULT 0, subjects_enrolled integer DEFAULT 0, balance numeric(10,2) DEFAULT 0, created_at timestamp with time zone DEFAULT now());

CREATE TABLE public.appeals (id uuid DEFAULT gen_random_uuid() NOT NULL, student_name text NOT NULL, student_id uuid, appeal_type text DEFAULT 'grade_change'::text, course_code text, reason text NOT NULL, status text DEFAULT 'pending'::text, reviewed_by uuid, reviewed_at timestamp with time zone, created_at timestamp with time zone DEFAULT now(), requested_by uuid);

CREATE TABLE public.clearance_status (id uuid DEFAULT gen_random_uuid() NOT NULL, student_id uuid, department_id uuid, status text DEFAULT 'Pending'::text, remarks text, updated_at timestamp with time zone DEFAULT now());

CREATE TABLE public.sections (id integer DEFAULT nextval('sections_id_seq'::regclass) NOT NULL, name text NOT NULL, program text, year_level text, academic_year_id integer, adviser_id uuid, created_at timestamp with time zone DEFAULT now());

CREATE TABLE public.rooms (id integer DEFAULT nextval('rooms_id_seq'::regclass) NOT NULL, name text NOT NULL, building text, capacity integer, type text DEFAULT 'classroom'::text, created_at timestamp with time zone DEFAULT now());

CREATE TABLE public.enrollment_items (id uuid DEFAULT gen_random_uuid() NOT NULL, enrollment_id uuid, course_offering_id uuid);

CREATE TABLE public.clearance_departments (id uuid DEFAULT gen_random_uuid() NOT NULL, code text NOT NULL, name text NOT NULL, icon text);

CREATE TABLE public.transactions (id uuid DEFAULT uuid_generate_v4() NOT NULL, student_id uuid, or_number text, txn_date timestamp with time zone DEFAULT now(), description text, channel text DEFAULT 'Cashier'::text, amount numeric(10,2) NOT NULL, created_at timestamp with time zone DEFAULT now());

CREATE TABLE public.deadlines (id uuid DEFAULT uuid_generate_v4() NOT NULL, title text NOT NULL, due_date date NOT NULL, type text DEFAULT 'optional'::text, is_active boolean DEFAULT true, created_at timestamp with time zone DEFAULT now());

CREATE TABLE public.courses (id uuid DEFAULT gen_random_uuid() NOT NULL, code text NOT NULL, title text NOT NULL, year_level integer NOT NULL, semester integer NOT NULL, lec_units integer DEFAULT 0 NOT NULL, lab_units integer DEFAULT 0 NOT NULL, prerequisites text DEFAULT 'None'::text);

CREATE TABLE public.students (id uuid DEFAULT gen_random_uuid() NOT NULL, email text NOT NULL, first_name text, last_name text, student_number text, created_at timestamp with time zone DEFAULT now(), role text DEFAULT 'Student'::text, gwa numeric(3,2) DEFAULT 0.00, balance_due numeric(10,2) DEFAULT 0.00, section text DEFAULT 'BSIT 2-A'::text, year_level text DEFAULT '2nd Year'::text);

CREATE TABLE public.faculty_notes (id uuid DEFAULT gen_random_uuid() NOT NULL, faculty_name text NOT NULL, faculty_id uuid, note_type text DEFAULT 'evaluation'::text, content text NOT NULL, created_by uuid, created_at timestamp with time zone DEFAULT now());

CREATE TABLE public.accreditation_checklist (id uuid DEFAULT gen_random_uuid() NOT NULL, requirement text NOT NULL, department text, status text DEFAULT 'pending'::text, notes text, evidence_link text, created_by uuid, updated_at timestamp with time zone DEFAULT now(), created_at timestamp with time zone DEFAULT now());

CREATE TABLE public.department_budgets (id uuid DEFAULT gen_random_uuid() NOT NULL, department text NOT NULL, fiscal_year text NOT NULL, allocated_budget numeric(12,2) DEFAULT 0, amount_spent numeric(12,2) DEFAULT 0, created_by uuid, created_at timestamp with time zone DEFAULT now(), updated_at timestamp with time zone DEFAULT now(), notes text);

CREATE TABLE public.grant_funding (id uuid DEFAULT gen_random_uuid() NOT NULL, grant_name text NOT NULL, department text NOT NULL, amount numeric(12,2) DEFAULT 0, status text DEFAULT 'pending'::text, funding_source text, created_by uuid, created_at timestamp with time zone DEFAULT now(), updated_at timestamp with time zone DEFAULT now(), notes text);

CREATE TABLE public.course_offerings (id integer DEFAULT nextval('course_offerings_id_seq'::regclass) NOT NULL, code text NOT NULL, title text NOT NULL, units numeric(4,1) DEFAULT 3.0 NOT NULL, fee numeric(10,2) DEFAULT 0 NOT NULL, instructor_name text, schedule text, program text, year integer, semester text, school_year text NOT NULL, is_major boolean DEFAULT false, prerequisites text, created_at timestamp with time zone DEFAULT now(), instructor_id uuid);

CREATE TABLE public.faq_articles (id uuid DEFAULT uuid_generate_v4() NOT NULL, category text NOT NULL, question text NOT NULL, answer text NOT NULL, keywords text, is_active boolean DEFAULT true, created_at timestamp with time zone DEFAULT now(), embedding vector(384));

CREATE TABLE public.announcements (id uuid DEFAULT uuid_generate_v4() NOT NULL, content text NOT NULL, deadline date, is_active boolean DEFAULT true, created_at timestamp with time zone DEFAULT now());

CREATE TABLE public.academic_years (id integer DEFAULT nextval('academic_years_id_seq'::regclass) NOT NULL, label text NOT NULL, start_date date, end_date date, is_active boolean DEFAULT false, created_at timestamp with time zone DEFAULT now());

CREATE TABLE public.sso_links (id integer DEFAULT nextval('sso_links_id_seq'::regclass) NOT NULL, label text NOT NULL, url text NOT NULL, icon text DEFAULT '🔗'::text, sort_order integer DEFAULT 0, is_active boolean DEFAULT true, roles text DEFAULT 'student,faculty'::text, created_at timestamp with time zone DEFAULT now());

CREATE TABLE public.profiles (id uuid NOT NULL, email text NOT NULL, full_name text NOT NULL, student_no text, program text, year_level text, section text, role text DEFAULT 'student'::text NOT NULL, created_at timestamp with time zone DEFAULT now(), updated_at timestamp with time zone DEFAULT now(), is_active boolean DEFAULT true, deactivated_at timestamp with time zone, avatar_url text, phone text, address text, requested_role text, status text DEFAULT 'onboarding'::text NOT NULL, id_number text);

CREATE TABLE public.user_mfa (id uuid DEFAULT gen_random_uuid() NOT NULL, email text NOT NULL, mfa_secret text NOT NULL, is_verified boolean DEFAULT false, created_at timestamp with time zone DEFAULT now());

CREATE TABLE public.faculty_evaluations (id uuid DEFAULT gen_random_uuid() NOT NULL, student_id uuid NOT NULL, instructor_name text NOT NULL, school_year text DEFAULT '2025–2026'::text NOT NULL, semester text DEFAULT '2nd Semester'::text NOT NULL, teaching_clarity integer NOT NULL, knowledge integer NOT NULL, availability integer NOT NULL, fairness integer NOT NULL, punctuality integer NOT NULL, comment text, created_at timestamp with time zone DEFAULT now() NOT NULL, instructor_id uuid NOT NULL);

CREATE TABLE public.grades (id uuid DEFAULT uuid_generate_v4() NOT NULL, student_id uuid, offering_id integer, midterm numeric(5,2), final numeric(5,2), equivalent numeric(5,2), ai_predicted_grade numeric(5,2), ai_predicted_equivalent numeric(5,2), remark text DEFAULT 'Pending'::text, created_at timestamp with time zone DEFAULT now(), prelim numeric(5,2), semifinal numeric(5,2), graded_by uuid, graded_at timestamp with time zone);

CREATE TABLE public.installments (id uuid DEFAULT uuid_generate_v4() NOT NULL, student_id uuid, name text NOT NULL, amount numeric(10,2) NOT NULL, due_date date NOT NULL, status text DEFAULT 'pending'::text, paid_at timestamp with time zone, or_number text, created_at timestamp with time zone DEFAULT now());

CREATE TABLE public.billing_summary (student_id uuid NOT NULL, total_paid numeric(10,2) DEFAULT 0, balance numeric(10,2) DEFAULT 0, updated_at timestamp with time zone DEFAULT now());

CREATE TABLE public.teacher_assignments (id uuid DEFAULT gen_random_uuid() NOT NULL, teacher_id uuid, offering_id integer, assigned_by uuid, assigned_at timestamp with time zone DEFAULT now(), is_active boolean DEFAULT true, academic_year text DEFAULT '2026-2027'::text, semester text DEFAULT '1st Semester'::text, updated_at timestamp with time zone DEFAULT now());

CREATE TABLE public.system_settings (id integer DEFAULT nextval('system_settings_id_seq'::regclass) NOT NULL, key text NOT NULL, value text NOT NULL, category text DEFAULT 'general'::text, description text, updated_by uuid, updated_at timestamp with time zone DEFAULT now());

CREATE TABLE public.chat_logs (id uuid DEFAULT uuid_generate_v4() NOT NULL, user_id uuid, user_message text NOT NULL, bot_response text NOT NULL, sources jsonb, created_at timestamp with time zone DEFAULT now());

CREATE TABLE public.grade_history (id uuid DEFAULT uuid_generate_v4() NOT NULL, grade_id uuid, student_id uuid, offering_id integer, prelim numeric, midterm numeric, semifinal numeric, final numeric, equivalent numeric, remark text, changed_by uuid, change_type text DEFAULT 'update'::text, reason text, created_at timestamp with time zone DEFAULT now());

ALTER TABLE public.departments ADD CONSTRAINT departments_code_key UNIQUE (code);

ALTER TABLE public.departments ADD CONSTRAINT departments_pkey PRIMARY KEY (id);

ALTER TABLE public.grading_scale ADD CONSTRAINT grading_scale_equivalent_key UNIQUE (equivalent);

ALTER TABLE public.grading_scale ADD CONSTRAINT grading_scale_pkey PRIMARY KEY (id);

ALTER TABLE public.timetable ADD CONSTRAINT timetable_day_of_week_check CHECK ((day_of_week = ANY (ARRAY['Mon'::text, 'Tue'::text, 'Wed'::text, 'Thu'::text, 'Fri'::text, 'Sat'::text, 'Sun'::text])));

ALTER TABLE public.timetable ADD CONSTRAINT timetable_offering_id_day_of_week_start_time_key UNIQUE (offering_id, day_of_week, start_time);

ALTER TABLE public.timetable ADD CONSTRAINT timetable_pkey PRIMARY KEY (id);

ALTER TABLE public.attendance ADD CONSTRAINT attendance_pkey PRIMARY KEY (id);

ALTER TABLE public.attendance ADD CONSTRAINT attendance_status_check CHECK ((status = ANY (ARRAY['present'::text, 'absent'::text, 'late'::text, 'excused'::text])));

ALTER TABLE public.attendance ADD CONSTRAINT attendance_student_id_offering_id_date_key UNIQUE (student_id, offering_id, date);

ALTER TABLE public.messages ADD CONSTRAINT messages_pkey PRIMARY KEY (id);

ALTER TABLE public.class_announcements ADD CONSTRAINT class_announcements_pkey PRIMARY KEY (id);

ALTER TABLE public.misc_fees ADD CONSTRAINT misc_fees_pkey PRIMARY KEY (id);

ALTER TABLE public.activities ADD CONSTRAINT activities_pkey PRIMARY KEY (id);

ALTER TABLE public.clearances ADD CONSTRAINT clearances_pkey PRIMARY KEY (id);

ALTER TABLE public.clearances ADD CONSTRAINT clearances_status_check CHECK ((status = ANY (ARRAY['cleared'::text, 'pending'::text, 'action_required'::text])));

ALTER TABLE public.clearances ADD CONSTRAINT clearances_student_id_department_code_key UNIQUE (student_id, department_code);

ALTER TABLE public.enrollments ADD CONSTRAINT enrollments_pkey PRIMARY KEY (id);

ALTER TABLE public.enrollments ADD CONSTRAINT enrollments_status_check CHECK ((status = ANY (ARRAY['enrolled'::text, 'dropped'::text, 'completed'::text])));

ALTER TABLE public.enrollments ADD CONSTRAINT enrollments_student_id_offering_id_key UNIQUE (student_id, offering_id);

ALTER TABLE public.student_semesters ADD CONSTRAINT student_semesters_pkey PRIMARY KEY (id);

ALTER TABLE public.student_semesters ADD CONSTRAINT student_semesters_student_id_school_year_semester_key UNIQUE (student_id, school_year, semester);

ALTER TABLE public.appeals ADD CONSTRAINT appeals_appeal_type_check CHECK ((appeal_type = ANY (ARRAY['grade_change'::text, 'prerequisite_waiver'::text, 'credit_transfer'::text])));

ALTER TABLE public.appeals ADD CONSTRAINT appeals_pkey PRIMARY KEY (id);

ALTER TABLE public.appeals ADD CONSTRAINT appeals_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));

ALTER TABLE public.clearance_status ADD CONSTRAINT clearance_status_pkey PRIMARY KEY (id);

ALTER TABLE public.sections ADD CONSTRAINT sections_pkey PRIMARY KEY (id);

ALTER TABLE public.rooms ADD CONSTRAINT rooms_pkey PRIMARY KEY (id);

ALTER TABLE public.rooms ADD CONSTRAINT rooms_type_check CHECK ((type = ANY (ARRAY['classroom'::text, 'lab'::text, 'auditorium'::text, 'office'::text, 'other'::text])));

ALTER TABLE public.enrollment_items ADD CONSTRAINT enrollment_items_pkey PRIMARY KEY (id);

ALTER TABLE public.clearance_departments ADD CONSTRAINT clearance_departments_code_key UNIQUE (code);

ALTER TABLE public.clearance_departments ADD CONSTRAINT clearance_departments_pkey PRIMARY KEY (id);

ALTER TABLE public.transactions ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);

ALTER TABLE public.deadlines ADD CONSTRAINT deadlines_pkey PRIMARY KEY (id);

ALTER TABLE public.deadlines ADD CONSTRAINT deadlines_type_check CHECK ((type = ANY (ARRAY['urgent'::text, 'schedule'::text, 'optional'::text])));

ALTER TABLE public.courses ADD CONSTRAINT courses_code_key UNIQUE (code);

ALTER TABLE public.courses ADD CONSTRAINT courses_pkey PRIMARY KEY (id);

ALTER TABLE public.students ADD CONSTRAINT students_email_key UNIQUE (email);

ALTER TABLE public.students ADD CONSTRAINT students_pkey PRIMARY KEY (id);

ALTER TABLE public.students ADD CONSTRAINT students_student_number_key UNIQUE (student_number);

ALTER TABLE public.faculty_notes ADD CONSTRAINT faculty_notes_note_type_check CHECK ((note_type = ANY (ARRAY['evaluation'::text, 'publication'::text, 'tenure'::text])));

ALTER TABLE public.faculty_notes ADD CONSTRAINT faculty_notes_pkey PRIMARY KEY (id);

ALTER TABLE public.accreditation_checklist ADD CONSTRAINT accreditation_checklist_pkey PRIMARY KEY (id);

ALTER TABLE public.accreditation_checklist ADD CONSTRAINT accreditation_checklist_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'compliant'::text, 'at_risk'::text])));

ALTER TABLE public.department_budgets ADD CONSTRAINT department_budgets_pkey PRIMARY KEY (id);

ALTER TABLE public.grant_funding ADD CONSTRAINT grant_funding_pkey PRIMARY KEY (id);

ALTER TABLE public.grant_funding ADD CONSTRAINT grant_funding_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'closed'::text, 'rejected'::text])));

ALTER TABLE public.course_offerings ADD CONSTRAINT course_offerings_pkey PRIMARY KEY (id);

ALTER TABLE public.faq_articles ADD CONSTRAINT faq_articles_pkey PRIMARY KEY (id);

ALTER TABLE public.announcements ADD CONSTRAINT announcements_pkey PRIMARY KEY (id);

ALTER TABLE public.academic_years ADD CONSTRAINT academic_years_pkey PRIMARY KEY (id);

ALTER TABLE public.sso_links ADD CONSTRAINT sso_links_pkey PRIMARY KEY (id);

ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['student'::text, 'faculty'::text, 'teacher'::text, 'staff'::text, 'admin'::text, 'dean'::text])));

ALTER TABLE public.profiles ADD CONSTRAINT profiles_student_no_key UNIQUE (student_no);

ALTER TABLE public.user_mfa ADD CONSTRAINT user_mfa_email_key UNIQUE (email);

ALTER TABLE public.user_mfa ADD CONSTRAINT user_mfa_pkey PRIMARY KEY (id);

ALTER TABLE public.faculty_evaluations ADD CONSTRAINT faculty_evaluations_availability_check CHECK (((availability >= 1) AND (availability <= 5)));

ALTER TABLE public.faculty_evaluations ADD CONSTRAINT faculty_evaluations_fairness_check CHECK (((fairness >= 1) AND (fairness <= 5)));

ALTER TABLE public.faculty_evaluations ADD CONSTRAINT faculty_evaluations_knowledge_check CHECK (((knowledge >= 1) AND (knowledge <= 5)));

ALTER TABLE public.faculty_evaluations ADD CONSTRAINT faculty_evaluations_pkey PRIMARY KEY (id);

ALTER TABLE public.faculty_evaluations ADD CONSTRAINT faculty_evaluations_punctuality_check CHECK (((punctuality >= 1) AND (punctuality <= 5)));

ALTER TABLE public.faculty_evaluations ADD CONSTRAINT faculty_evaluations_student_instructor_term_key UNIQUE (student_id, instructor_id, school_year, semester);

ALTER TABLE public.faculty_evaluations ADD CONSTRAINT faculty_evaluations_teaching_clarity_check CHECK (((teaching_clarity >= 1) AND (teaching_clarity <= 5)));

ALTER TABLE public.grades ADD CONSTRAINT grades_pkey PRIMARY KEY (id);

ALTER TABLE public.grades ADD CONSTRAINT grades_remark_check CHECK ((remark = ANY (ARRAY['Passed'::text, 'Failed'::text, 'Pending'::text, 'Dropped'::text])));

ALTER TABLE public.grades ADD CONSTRAINT grades_student_id_offering_id_key UNIQUE (student_id, offering_id);

ALTER TABLE public.installments ADD CONSTRAINT installments_pkey PRIMARY KEY (id);

ALTER TABLE public.installments ADD CONSTRAINT installments_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text])));

ALTER TABLE public.billing_summary ADD CONSTRAINT billing_summary_pkey PRIMARY KEY (student_id);

ALTER TABLE public.teacher_assignments ADD CONSTRAINT teacher_assignments_pkey PRIMARY KEY (id);

ALTER TABLE public.teacher_assignments ADD CONSTRAINT teacher_assignments_teacher_id_offering_id_academic_year_se_key UNIQUE (teacher_id, offering_id, academic_year, semester);

ALTER TABLE public.system_settings ADD CONSTRAINT system_settings_key_key UNIQUE (key);

ALTER TABLE public.system_settings ADD CONSTRAINT system_settings_pkey PRIMARY KEY (id);

ALTER TABLE public.chat_logs ADD CONSTRAINT chat_logs_pkey PRIMARY KEY (id);

ALTER TABLE public.grade_history ADD CONSTRAINT grade_history_pkey PRIMARY KEY (id);

ALTER TABLE public.timetable ADD CONSTRAINT timetable_offering_id_fkey FOREIGN KEY (offering_id) REFERENCES course_offerings(id) ON DELETE CASCADE;

ALTER TABLE public.timetable ADD CONSTRAINT timetable_room_id_fkey FOREIGN KEY (room_id) REFERENCES rooms(id);

ALTER TABLE public.timetable ADD CONSTRAINT timetable_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES profiles(id);

ALTER TABLE public.attendance ADD CONSTRAINT attendance_marked_by_fkey FOREIGN KEY (marked_by) REFERENCES profiles(id);

ALTER TABLE public.attendance ADD CONSTRAINT attendance_offering_id_fkey FOREIGN KEY (offering_id) REFERENCES course_offerings(id) ON DELETE CASCADE;

ALTER TABLE public.attendance ADD CONSTRAINT attendance_student_id_fkey FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.attendance ADD CONSTRAINT attendance_timetable_id_fkey FOREIGN KEY (timetable_id) REFERENCES timetable(id) ON DELETE SET NULL;

ALTER TABLE public.messages ADD CONSTRAINT messages_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.messages ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.class_announcements ADD CONSTRAINT class_announcements_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.class_announcements ADD CONSTRAINT class_announcements_offering_id_fkey FOREIGN KEY (offering_id) REFERENCES course_offerings(id) ON DELETE CASCADE;

ALTER TABLE public.activities ADD CONSTRAINT activities_student_id_fkey FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.clearances ADD CONSTRAINT clearances_student_id_fkey FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.enrollments ADD CONSTRAINT enrollments_offering_id_fkey FOREIGN KEY (offering_id) REFERENCES course_offerings(id) ON DELETE CASCADE;

ALTER TABLE public.enrollments ADD CONSTRAINT enrollments_student_id_fkey FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.student_semesters ADD CONSTRAINT student_semesters_student_id_fkey FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.appeals ADD CONSTRAINT appeals_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE public.appeals ADD CONSTRAINT appeals_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES profiles(id);

ALTER TABLE public.appeals ADD CONSTRAINT appeals_student_id_fkey FOREIGN KEY (student_id) REFERENCES profiles(id);

ALTER TABLE public.clearance_status ADD CONSTRAINT clearance_status_department_id_fkey FOREIGN KEY (department_id) REFERENCES clearance_departments(id) ON DELETE CASCADE;

ALTER TABLE public.clearance_status ADD CONSTRAINT clearance_status_student_id_fkey FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.sections ADD CONSTRAINT sections_academic_year_id_fkey FOREIGN KEY (academic_year_id) REFERENCES academic_years(id);

ALTER TABLE public.sections ADD CONSTRAINT sections_adviser_id_fkey FOREIGN KEY (adviser_id) REFERENCES profiles(id);

ALTER TABLE public.transactions ADD CONSTRAINT transactions_student_id_fkey FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.faculty_notes ADD CONSTRAINT faculty_notes_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);

ALTER TABLE public.faculty_notes ADD CONSTRAINT faculty_notes_faculty_id_fkey FOREIGN KEY (faculty_id) REFERENCES profiles(id);

ALTER TABLE public.accreditation_checklist ADD CONSTRAINT accreditation_checklist_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);

ALTER TABLE public.department_budgets ADD CONSTRAINT department_budgets_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);

ALTER TABLE public.grant_funding ADD CONSTRAINT grant_funding_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);

ALTER TABLE public.course_offerings ADD CONSTRAINT course_offerings_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.faculty_evaluations ADD CONSTRAINT faculty_evaluations_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES profiles(id);

ALTER TABLE public.faculty_evaluations ADD CONSTRAINT faculty_evaluations_student_id_fkey FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.grades ADD CONSTRAINT grades_graded_by_fkey FOREIGN KEY (graded_by) REFERENCES profiles(id);

ALTER TABLE public.grades ADD CONSTRAINT grades_offering_id_fkey FOREIGN KEY (offering_id) REFERENCES course_offerings(id) ON DELETE CASCADE;

ALTER TABLE public.grades ADD CONSTRAINT grades_student_id_fkey FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.installments ADD CONSTRAINT installments_student_id_fkey FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.billing_summary ADD CONSTRAINT billing_summary_student_id_fkey FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.teacher_assignments ADD CONSTRAINT teacher_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES profiles(id);

ALTER TABLE public.teacher_assignments ADD CONSTRAINT teacher_assignments_offering_id_fkey FOREIGN KEY (offering_id) REFERENCES course_offerings(id) ON DELETE CASCADE;

ALTER TABLE public.teacher_assignments ADD CONSTRAINT teacher_assignments_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.system_settings ADD CONSTRAINT system_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES profiles(id);

ALTER TABLE public.chat_logs ADD CONSTRAINT chat_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.grade_history ADD CONSTRAINT grade_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE public.grade_history ADD CONSTRAINT grade_history_grade_id_fkey FOREIGN KEY (grade_id) REFERENCES grades(id) ON DELETE CASCADE;

ALTER TABLE public.grade_history ADD CONSTRAINT grade_history_offering_id_fkey FOREIGN KEY (offering_id) REFERENCES course_offerings(id) ON DELETE CASCADE;

ALTER TABLE public.grade_history ADD CONSTRAINT grade_history_student_id_fkey FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.get_subject_instructor_options()
 RETURNS TABLE(id uuid, full_name text, role text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_caller_role TEXT;
  v_caller_status TEXT;
  v_caller_active BOOLEAN;
BEGIN
  -- Verify caller is authenticated and is an approved, active dean
  SELECT p.role, p.status, COALESCE(p.is_active, true)
  INTO v_caller_role, v_caller_status, v_caller_active
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF v_caller_role != 'dean' OR v_caller_status != 'approved' OR NOT v_caller_active THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.id, p.full_name, p.role
  FROM public.profiles p
  WHERE p.role IN ('teacher', 'faculty')
    AND p.status = 'approved'
    AND COALESCE(p.is_active, true) = true
  ORDER BY p.full_name ASC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_set_profile_access(p_profile_id uuid, p_role text DEFAULT NULL::text, p_status text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Approved admin access required' USING ERRCODE = '42501';
  END IF;

  IF p_role IS NULL AND p_status IS NULL THEN
    RAISE EXCEPTION 'Provide a role or status to update' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles AS target
  SET role = COALESCE(p_role, target.role),
      status = COALESCE(p_status, target.status),
      updated_at = pg_catalog.now()
  WHERE target.id = p_profile_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found' USING ERRCODE = 'P0002';
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_name text;
BEGIN
  -- Signup metadata is user-controlled; new accounts always start as students.
  v_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'name', ''),
    split_part(NEW.email, '@', 1)
  );

  INSERT INTO public.profiles (id, email, full_name, status, role, program)
  VALUES (NEW.id, NEW.email, v_name, 'onboarding', 'student', 'BSIT')
  ON CONFLICT (id) DO UPDATE
  SET program = COALESCE(public.profiles.program, 'BSIT'),
      full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name);

  PERFORM public.initialize_student_clearances(NEW.id);
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.save_course_offering_with_instructor(p_offering_id integer DEFAULT NULL::integer, p_code text DEFAULT NULL::text, p_title text DEFAULT NULL::text, p_units numeric DEFAULT 3.0, p_program text DEFAULT NULL::text, p_year integer DEFAULT 1, p_semester text DEFAULT NULL::text, p_school_year text DEFAULT NULL::text, p_schedule text DEFAULT NULL::text, p_instructor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_caller_id UUID;
  v_caller_role TEXT;
  v_caller_status TEXT;
  v_caller_active BOOLEAN;
  v_instructor_name TEXT;
  v_instructor_role TEXT;
  v_instructor_status TEXT;
  v_instructor_active BOOLEAN;
  v_offering_id INTEGER;
  v_result JSONB;
BEGIN
  -- 1. Authentication check
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 2. Authorization check: caller must be approved active dean
  SELECT p.role, p.status, COALESCE(p.is_active, true)
  INTO v_caller_role, v_caller_status, v_caller_active
  FROM public.profiles p
  WHERE p.id = v_caller_id;

  IF v_caller_role != 'dean' OR v_caller_status != 'approved' OR NOT v_caller_active THEN
    RAISE EXCEPTION 'Access denied: only approved active deans can assign instructors to course offerings';
  END IF;

  -- 3. Instructor eligibility check: must be approved active teacher or faculty
  IF p_instructor_id IS NULL THEN
    RAISE EXCEPTION 'An eligible instructor must be selected';
  END IF;

  SELECT p.full_name, p.role, p.status, COALESCE(p.is_active, true)
  INTO v_instructor_name, v_instructor_role, v_instructor_status, v_instructor_active
  FROM public.profiles p
  WHERE p.id = p_instructor_id;

  IF v_instructor_name IS NULL THEN
    RAISE EXCEPTION 'Selected instructor profile not found';
  END IF;

  IF v_instructor_role NOT IN ('teacher', 'faculty') OR v_instructor_status != 'approved' OR NOT v_instructor_active THEN
    RAISE EXCEPTION 'Selected instructor is not an approved active teacher or faculty member';
  END IF;

  -- Validate essential offering fields
  IF p_code IS NULL OR TRIM(p_code) = '' THEN
    RAISE EXCEPTION 'Subject code is required';
  END IF;
  IF p_title IS NULL OR TRIM(p_title) = '' THEN
    RAISE EXCEPTION 'Course title is required';
  END IF;

  -- 4. Insert or Update course_offerings
  IF p_offering_id IS NULL THEN
    INSERT INTO public.course_offerings (
      code,
      title,
      units,
      program,
      year,
      semester,
      school_year,
      schedule,
      instructor_id,
      instructor_name
    )
    VALUES (
      TRIM(p_code),
      TRIM(p_title),
      COALESCE(p_units, 3.0),
      p_program,
      COALESCE(p_year, 1),
      COALESCE(p_semester, '1st Semester'),
      COALESCE(p_school_year, '2026-2027'),
      p_schedule,
      p_instructor_id,
      v_instructor_name
    )
    RETURNING id INTO v_offering_id;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.course_offerings WHERE id = p_offering_id) THEN
      RAISE EXCEPTION 'Course offering % not found', p_offering_id;
    END IF;

    UPDATE public.course_offerings
    SET
      code = TRIM(p_code),
      title = TRIM(p_title),
      units = COALESCE(p_units, 3.0),
      program = p_program,
      year = COALESCE(p_year, 1),
      semester = COALESCE(p_semester, '1st Semester'),
      school_year = COALESCE(p_school_year, '2026-2027'),
      schedule = p_schedule,
      instructor_id = p_instructor_id,
      instructor_name = v_instructor_name
    WHERE id = p_offering_id;

    v_offering_id := p_offering_id;

    -- Deactivate prior active assignments for this offering
    UPDATE public.teacher_assignments
    SET is_active = false
    WHERE offering_id = v_offering_id;
  END IF;

  -- 5. Upsert active assignment in teacher_assignments
  INSERT INTO public.teacher_assignments (
    teacher_id,
    offering_id,
    academic_year,
    semester,
    is_active,
    assigned_by
  )
  VALUES (
    p_instructor_id,
    v_offering_id,
    COALESCE(p_school_year, '2026-2027'),
    COALESCE(p_semester, '1st Semester'),
    true,
    v_caller_id
  )
  ON CONFLICT (teacher_id, offering_id, academic_year, semester)
  DO UPDATE SET
    is_active = true,
    assigned_by = v_caller_id,
    updated_at = now();

  -- Return the saved offering with latest data
  SELECT to_jsonb(co.*) INTO v_result
  FROM public.course_offerings co
  WHERE co.id = v_offering_id;

  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.initialize_student_clearances(target_student_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF target_student_id IS NULL THEN
    target_student_id := auth.uid();
  END IF;

  IF target_student_id IS NULL THEN
    RETURN;
  END IF;

  -- Initialization creates requirements; only staff can approve them.
  INSERT INTO public.clearances (student_id, department_code, department_name, icon, status)
  SELECT target_student_id, cd.code, cd.name, cd.icon, 'pending'
  FROM public.clearance_departments cd
  ON CONFLICT (student_id, department_code) DO NOTHING;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.calculate_remark(percentage numeric)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF percentage IS NULL THEN
    RETURN NULL;
  END IF;
  
  IF percentage >= 96 THEN
    RETURN 'Excellent / Superior';
  ELSIF percentage >= 94 THEN
    RETURN 'Excellent / Superior';
  ELSIF percentage >= 92 THEN
    RETURN 'Very Good';
  ELSIF percentage >= 89 THEN
    RETURN 'Very Good';
  ELSIF percentage >= 86 THEN
    RETURN 'Good';
  ELSIF percentage >= 83 THEN
    RETURN 'Good';
  ELSIF percentage >= 80 THEN
    RETURN 'Satisfactory / Fair';
  ELSIF percentage >= 76 THEN
    RETURN 'Satisfactory / Fair';
  ELSIF percentage >= 75 THEN
    RETURN 'Passing';
  ELSE
    RETURN 'Failed';
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.review_enrollment_request(p_request_id uuid, p_decision text, p_review_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  SELECT private.review_enrollment_request($1, $2, $3);
$function$
;

CREATE OR REPLACE FUNCTION public.sync_student_term_on_enroll()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  off RECORD;
  subj_count int;
  total_units numeric;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles AS p
    WHERE p.id = NEW.student_id AND p.role = 'student'
  ) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO off
  FROM public.course_offerings
  WHERE id = NEW.offering_id;
  IF off IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)::int, COALESCE(SUM(co.units), 0)
  INTO subj_count, total_units
  FROM public.enrollments AS e
  JOIN public.course_offerings AS co ON co.id = e.offering_id
  WHERE e.student_id = NEW.student_id
    AND e.status = 'enrolled';

  UPDATE public.student_semesters
  SET is_current = false
  WHERE student_id = NEW.student_id;

  INSERT INTO public.student_semesters (
    student_id, school_year, semester, is_current, units_enrolled, subjects_enrolled
  ) VALUES (
    NEW.student_id, off.school_year, off.semester, true, total_units, subj_count
  )
  ON CONFLICT (student_id, school_year, semester)
  DO UPDATE SET
    is_current = true,
    units_enrolled = EXCLUDED.units_enrolled,
    subjects_enrolled = EXCLUDED.subjects_enrolled;

  PERFORM public.initialize_student_clearances(NEW.student_id);
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.calculate_equivalent(percentage numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF percentage IS NULL THEN
    RETURN NULL;
  END IF;
  
  IF percentage >= 96 THEN
    RETURN 1.00;
  ELSIF percentage >= 94 THEN
    RETURN 1.25;
  ELSIF percentage >= 92 THEN
    RETURN 1.50;
  ELSIF percentage >= 89 THEN
    RETURN 1.75;
  ELSIF percentage >= 86 THEN
    RETURN 2.00;
  ELSIF percentage >= 83 THEN
    RETURN 2.25;
  ELSIF percentage >= 80 THEN
    RETURN 2.50;
  ELSIF percentage >= 76 THEN
    RETURN 2.75;
  ELSIF percentage >= 75 THEN
    RETURN 3.00;
  ELSE
    RETURN 5.00;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_sso_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  user_role TEXT;
  user_domain TEXT;
BEGIN
  user_domain := split_part(NEW.email, '@', 2);

  IF user_domain = 'student.school.edu' OR user_domain = 'imcc.edu.ph' THEN
    user_role := 'Student';
  ELSIF user_domain = 'faculty.school.edu' THEN
    user_role := 'Faculty';
  ELSIF user_domain = 'admin.school.edu' THEN
    user_role := 'Admin';
  ELSE
    RAISE EXCEPTION 'Unauthorized Access - Institutional Email Required';
  END IF;

  INSERT INTO public.students (email, first_name, last_name, role)
  VALUES (
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'first_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    user_role
  )
  ON CONFLICT (email) DO UPDATE
  SET role = EXCLUDED.role;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.seed_student_demo_data(target_student_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_sa101  BIGINT;
  v_ias102 BIGINT;
  v_cap102 BIGINT;
  v_sia102 BIGINT;
BEGIN
  SELECT id INTO v_sa101  FROM public.course_offerings WHERE code = 'SA 101' LIMIT 1;
  SELECT id INTO v_ias102 FROM public.course_offerings WHERE code = 'IAS 102' LIMIT 1;
  SELECT id INTO v_cap102 FROM public.course_offerings WHERE code = 'CAP 102' LIMIT 1;
  SELECT id INTO v_sia102 FROM public.course_offerings WHERE code = 'SIA 102' LIMIT 1;

  UPDATE public.profiles
  SET
    student_no = '2023-00189',
    year_level = '4th Year',
    program    = 'BSIT',
    section    = 'BSIT-4A'
  WHERE id = target_student_id;

  DELETE FROM public.student_semesters WHERE student_id = target_student_id;
  INSERT INTO public.student_semesters (student_id, school_year, semester, is_current, gwa, units_enrolled, subjects_enrolled, balance)
  VALUES (target_student_id, '2026-2027', '1st Semester', true, 1.25, 12, 4, 6500.00);

  DELETE FROM public.enrollments WHERE student_id = target_student_id;
  IF v_sa101  IS NOT NULL THEN INSERT INTO public.enrollments (student_id, offering_id, status) VALUES (target_student_id, v_sa101, 'enrolled'); END IF;
  IF v_ias102 IS NOT NULL THEN INSERT INTO public.enrollments (student_id, offering_id, status) VALUES (target_student_id, v_ias102, 'enrolled'); END IF;
  IF v_cap102 IS NOT NULL THEN INSERT INTO public.enrollments (student_id, offering_id, status) VALUES (target_student_id, v_cap102, 'enrolled'); END IF;
  IF v_sia102 IS NOT NULL THEN INSERT INTO public.enrollments (student_id, offering_id, status) VALUES (target_student_id, v_sia102, 'enrolled'); END IF;

  DELETE FROM public.grades WHERE student_id = target_student_id;
  IF v_sa101 IS NOT NULL THEN
    INSERT INTO public.grades (student_id, offering_id, midterm, final, equivalent, ai_predicted_grade, ai_predicted_equivalent, remark)
    VALUES (target_student_id, v_sa101, 91.00, NULL, 1.50, '92.50', 1.25, 'Passed');
  END IF;
  IF v_ias102 IS NOT NULL THEN
    INSERT INTO public.grades (student_id, offering_id, midterm, final, equivalent, ai_predicted_grade, ai_predicted_equivalent, remark)
    VALUES (target_student_id, v_ias102, 94.00, NULL, 1.25, '95.00', 1.00, 'Passed');
  END IF;
  IF v_cap102 IS NOT NULL THEN
    INSERT INTO public.grades (student_id, offering_id, midterm, final, equivalent, ai_predicted_grade, ai_predicted_equivalent, remark)
    VALUES (target_student_id, v_cap102, 89.00, NULL, 1.75, '91.00', 1.50, 'Passed');
  END IF;
  IF v_sia102 IS NOT NULL THEN
    INSERT INTO public.grades (student_id, offering_id, midterm, final, equivalent, ai_predicted_grade, ai_predicted_equivalent, remark)
    VALUES (target_student_id, v_sia102, 93.00, NULL, 1.25, '94.00', 1.25, 'Passed');
  END IF;

  DELETE FROM public.clearances WHERE student_id = target_student_id;
  INSERT INTO public.clearances (student_id, department_code, department_name, officer_name, status, note, icon) VALUES
  (target_student_id, 'cashier',  'Cashier / Finance',  'Ms. Maria Clara',      'action_required', 'Pending balance of P6,500.00',              '💳'),
  (target_student_id, 'library',  'University Library', 'Mr. Jose Rizal',       'cleared',         'No pending library holds',                  '📚'),
  (target_student_id, 'dean',     'College Dean',       'Dr. Santiago Alvarez', 'cleared',         'Capstone 1 pre-requisite verified',         '🎓'),
  (target_student_id, 'guidance', 'Guidance Office',    'Ms. Leonor Rivera',    'cleared',         '4th Year status verified',                  '💬');

  DELETE FROM public.activities WHERE student_id = target_student_id;
  INSERT INTO public.activities (student_id, description, color) VALUES
  (target_student_id, 'Enrolled in 4th Year 1st Semester subjects (12 units)', '#E7338A'),
  (target_student_id, 'Capstone 2 enrollment verified (Pre-requisite CAP 101 cleared)', '#10B981');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_role()
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.role = 'admin'
      AND p.status = 'approved'
      AND p.is_active IS TRUE
  );
$function$
;

CREATE OR REPLACE FUNCTION public.auto_create_student_semester()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  active_year TEXT;
  active_sem  TEXT;
BEGIN
  -- Only run for students being approved
  IF NEW.role = 'student' AND NEW.status = 'approved' THEN
    -- Get the active academic year label
    SELECT label INTO active_year
    FROM public.academic_years
    WHERE is_active = true
    LIMIT 1;

    active_year := COALESCE(active_year, '2026-2027');
    active_sem  := '1st Semester';

    INSERT INTO public.student_semesters (student_id, school_year, semester, is_current)
    VALUES (NEW.id, active_year, active_sem, true)
    ON CONFLICT (student_id, school_year, semester) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_staff_or_faculty()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.role = ANY (ARRAY['dean', 'teacher', 'faculty', 'admin', 'staff', 'registrar'])
      AND p.status = 'approved'
      AND p.is_active IS TRUE
  );
$function$
;

CREATE OR REPLACE FUNCTION public.revert_grade(p_history_id uuid, p_reason text DEFAULT 'Reverted to previous version'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_hist record;
  v_grade record;
  v_user_id uuid;
  v_user_role text;
  v_previous_change_type text;
  v_previous_reason text;
BEGIN
  v_user_id := (SELECT auth.uid());
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT p.role INTO v_user_role
  FROM public.profiles p
  WHERE p.id = v_user_id
    AND p.status = 'approved'
    AND p.is_active IS TRUE;

  IF NOT FOUND OR v_user_role NOT IN ('teacher', 'faculty', 'dean', 'admin') THEN
    RAISE EXCEPTION 'Approved faculty access required' USING ERRCODE = '42501';
  END IF;

  SELECT h.* INTO v_hist
  FROM public.grade_history h
  WHERE h.id = p_history_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Grade history record not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_user_role <> 'admin' AND NOT EXISTS (
    SELECT 1 FROM public.teacher_assignments ta
    WHERE ta.teacher_id = v_user_id
      AND ta.offering_id = v_hist.offering_id
      AND ta.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'Active assignment required for this course offering' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.enrollments e
    WHERE e.student_id = v_hist.student_id
      AND e.offering_id = v_hist.offering_id
  ) THEN
    RAISE EXCEPTION 'Matching enrollment required to revert this grade' USING ERRCODE = '42501';
  END IF;

  SELECT g.* INTO v_grade
  FROM public.grades g
  WHERE g.id = v_hist.grade_id
    AND g.student_id IS NOT DISTINCT FROM v_hist.student_id
    AND g.offering_id IS NOT DISTINCT FROM v_hist.offering_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Matching grade record not found' USING ERRCODE = 'P0002';
  END IF;

  v_previous_change_type := pg_catalog.current_setting('app.grade_change_type', true);
  v_previous_reason := pg_catalog.current_setting('app.grade_change_reason', true);
  PERFORM pg_catalog.set_config('app.grade_change_type', 'revert', true);
  PERFORM pg_catalog.set_config('app.grade_change_reason', COALESCE(p_reason, 'Reverted to previous version'), true);

  UPDATE public.grades g
  SET prelim = v_hist.prelim,
      midterm = v_hist.midterm,
      semifinal = v_hist.semifinal,
      final = v_hist.final,
      equivalent = v_hist.equivalent,
      remark = v_hist.remark,
      graded_by = v_user_id,
      graded_at = pg_catalog.clock_timestamp()
  WHERE g.id = v_hist.grade_id
  RETURNING g.* INTO v_grade;

  PERFORM pg_catalog.set_config('app.grade_change_type', COALESCE(v_previous_change_type, ''), true);
  PERFORM pg_catalog.set_config('app.grade_change_reason', COALESCE(v_previous_reason, ''), true);

  RETURN pg_catalog.to_jsonb(v_grade);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT role FROM public.profiles WHERE id = (SELECT auth.uid());
$function$
;

CREATE OR REPLACE FUNCTION public.is_mfa_compliant()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_user_id             UUID;
  v_role                TEXT;
  v_has_verified_factor BOOLEAN := FALSE;
  v_aal                 TEXT;
BEGIN
  v_role := auth.role();
  IF v_role = 'service_role' THEN
    RETURN TRUE;
  END IF;

  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF to_regclass('auth.mfa_factors') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM auth.mfa_factors
      WHERE user_id = v_user_id
        AND status = 'verified'
    ) INTO v_has_verified_factor;
  END IF;

  IF NOT v_has_verified_factor THEN
    RETURN TRUE;
  END IF;

  v_aal := (auth.jwt() ->> 'aal');
  RETURN (v_aal = 'aal2');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.match_faq_articles(query_embedding vector, match_threshold double precision, match_count integer)
 RETURNS TABLE(id uuid, category text, question text, answer text, keywords text, similarity double precision)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    f.id,
    f.category,
    f.question,
    f.answer,
    f.keywords,
    1 - (f.embedding <=> query_embedding) AS similarity
  FROM public.faq_articles f
  WHERE f.is_active = true
    AND f.embedding IS NOT NULL
    AND 1 - (f.embedding <=> query_embedding) > match_threshold
  ORDER BY f.embedding <=> query_embedding
  LIMIT match_count;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.match_faq_articles(query_embedding vector, match_count integer DEFAULT 5, match_threshold double precision DEFAULT 0.5)
 RETURNS TABLE(id uuid, category text, question text, answer text, keywords text, similarity double precision)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    f.id,
    f.category,
    f.question,
    f.answer,
    f.keywords,
    1 - (f.embedding <=> query_embedding) AS similarity
  FROM faq_articles f
  WHERE f.is_active = true
    AND f.embedding IS NOT NULL
    AND 1 - (f.embedding <=> query_embedding) > match_threshold
  ORDER BY f.embedding <=> query_embedding
  LIMIT match_count;
$function$
;

CREATE OR REPLACE FUNCTION public.archive_grade_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id UUID;
  v_change_type TEXT;
  v_reason TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    v_user_id := COALESCE(NEW.graded_by, OLD.graded_by);
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.prelim IS DISTINCT FROM NEW.prelim OR
       OLD.midterm IS DISTINCT FROM NEW.midterm OR
       OLD.semifinal IS DISTINCT FROM NEW.semifinal OR
       OLD.final IS DISTINCT FROM NEW.final OR
       OLD.equivalent IS DISTINCT FROM NEW.equivalent OR
       OLD.remark IS DISTINCT FROM NEW.remark THEN
      v_change_type := NULLIF(pg_catalog.current_setting('app.grade_change_type', true), '');
      v_reason := NULLIF(pg_catalog.current_setting('app.grade_change_reason', true), '');
      INSERT INTO public.grade_history (
        grade_id, student_id, offering_id,
        prelim, midterm, semifinal, final, equivalent, remark,
        changed_by, change_type, reason, created_at
      ) VALUES (
        OLD.id, OLD.student_id, OLD.offering_id,
        OLD.prelim, OLD.midterm, OLD.semifinal, OLD.final, OLD.equivalent, OLD.remark,
        v_user_id, COALESCE(v_change_type, 'before_update'), v_reason, pg_catalog.clock_timestamp()
      );
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO public.grade_history (
      grade_id, student_id, offering_id,
      prelim, midterm, semifinal, final, equivalent, remark,
      changed_by, change_type, created_at
    ) VALUES (
      NEW.id, NEW.student_id, NEW.offering_id,
      NEW.prelim, NEW.midterm, NEW.semifinal, NEW.final, NEW.equivalent, NEW.remark,
      v_user_id, 'initial_entry', pg_catalog.clock_timestamp()
    );
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION private.review_enrollment_request(p_request_id uuid, p_decision text, p_review_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_request public.enrollment_requests%ROWTYPE;
  v_student_eligible boolean;
  v_enrollment_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_decision IS NULL OR p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Decision must be approved or rejected' USING ERRCODE = '22023';
  END IF;

  IF p_review_note IS NOT NULL AND pg_catalog.char_length(p_review_note) > 1000 THEN
    RAISE EXCEPTION 'Review note must be 1000 characters or fewer' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = v_actor
      AND p.role = ANY (ARRAY['admin', 'dean', 'registrar', 'staff'])
      AND p.status = 'approved'
      AND p.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'Approved active enrollment reviewer access required' USING ERRCODE = '42501';
  END IF;

  SELECT r.*
  INTO v_request
  FROM public.enrollment_requests r
  WHERE r.id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Enrollment request not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending requests can be reviewed' USING ERRCODE = '55000';
  END IF;

  IF p_decision = 'approved' THEN
    PERFORM 1
    FROM public.profiles p
    WHERE p.id = v_request.student_id
    FOR UPDATE;

    SELECT EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = v_request.student_id
        AND p.role = 'student'
        AND p.status = 'approved'
        AND p.is_active IS TRUE
    )
    INTO v_student_eligible;

    IF v_student_eligible IS NOT TRUE THEN
      RAISE EXCEPTION 'Student is no longer approved and active' USING ERRCODE = '42501';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.enrollments e
      WHERE e.student_id = v_request.student_id
        AND e.offering_id = v_request.offering_id
        AND e.status IN ('enrolled', 'completed')
    ) THEN
      RAISE EXCEPTION 'Student already has an enrolled or completed record for this offering' USING ERRCODE = '23505';
    END IF;

    INSERT INTO public.enrollments (student_id, offering_id, status)
    VALUES (v_request.student_id, v_request.offering_id, 'enrolled')
    RETURNING id INTO v_enrollment_id;
  END IF;

  UPDATE public.enrollment_requests r
  SET status = p_decision,
      reviewed_by = v_actor,
      reviewed_at = pg_catalog.now(),
      review_note = p_review_note
  WHERE r.id = v_request.id;

  RETURN pg_catalog.jsonb_build_object(
    'request_id', v_request.id,
    'status', p_decision,
    'enrollment_id', v_enrollment_id
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION private.cancel_enrollment_request(p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_cancelled_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = v_actor
      AND p.role = 'student'
      AND p.status = 'approved'
      AND p.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'Approved active student access required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.enrollment_requests r
  SET status = 'cancelled',
      cancelled_at = pg_catalog.now()
  WHERE r.id = p_request_id
    AND r.student_id = v_actor
    AND r.status = 'pending'
  RETURNING r.id INTO v_cancelled_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending request not found or not owned by this student' USING ERRCODE = 'P0002';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'request_id', v_cancelled_id,
    'status', 'cancelled'
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cancel_enrollment_request(p_request_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  SELECT private.cancel_enrollment_request($1);
$function$
;

CREATE OR REPLACE FUNCTION public.update_grade_calculations()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_count int;
  v_avg   numeric;
BEGIN
  v_count := (CASE WHEN NEW.prelim    IS NOT NULL THEN 1 ELSE 0 END)
           + (CASE WHEN NEW.midterm   IS NOT NULL THEN 1 ELSE 0 END)
           + (CASE WHEN NEW.semifinal IS NOT NULL THEN 1 ELSE 0 END)
           + (CASE WHEN NEW.final     IS NOT NULL THEN 1 ELSE 0 END);

  IF v_count > 0 THEN
    v_avg := (COALESCE(NEW.prelim,0) + COALESCE(NEW.midterm,0)
            + COALESCE(NEW.semifinal,0) + COALESCE(NEW.final,0))::numeric / v_count;

    -- ponytail: hardcoded scale matching grading_scale table and shared/grading.js
    NEW.equivalent := CASE
      WHEN v_avg >= 96 THEN 1.00 WHEN v_avg >= 94 THEN 1.25
      WHEN v_avg >= 92 THEN 1.50 WHEN v_avg >= 89 THEN 1.75
      WHEN v_avg >= 86 THEN 2.00 WHEN v_avg >= 83 THEN 2.25
      WHEN v_avg >= 80 THEN 2.50 WHEN v_avg >= 76 THEN 2.75
      WHEN v_avg >= 75 THEN 3.00 ELSE 5.00 END;
  END IF;

  IF NEW.final IS NULL THEN
    NEW.remark := 'Pending';
  ELSIF NEW.equivalent IS NOT NULL AND NEW.equivalent <= 3.00 THEN
    NEW.remark := 'Passed';
  ELSE
    NEW.remark := 'Failed';
  END IF;

  NEW.graded_by := COALESCE(auth.uid(), NEW.graded_by);
  NEW.graded_at := now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_teacher_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  -- The trigger runs with owner privileges, so RLS cannot enforce caller activation here.
  IF auth.uid() IS NOT NULL
     AND auth.role() IS DISTINCT FROM 'service_role'
     AND NOT EXISTS (
       SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid()
         AND p.role IN ('teacher', 'faculty', 'dean', 'admin')
         AND p.status = 'approved' AND p.is_active IS TRUE
     ) THEN
    RAISE EXCEPTION 'Approved active account required to change assignments' USING ERRCODE = '42501';
  END IF;

  IF NEW.instructor_id IS NULL THEN
    UPDATE public.teacher_assignments
    SET is_active = false
    WHERE offering_id = NEW.id;
  ELSE
    -- Deactivate previous assignments that don't match the new instructor
    UPDATE public.teacher_assignments
    SET is_active = false
    WHERE offering_id = NEW.id
      AND (
        teacher_id IS DISTINCT FROM NEW.instructor_id
        OR academic_year IS DISTINCT FROM NEW.school_year
        OR semester IS DISTINCT FROM NEW.semester
      );

    -- Upsert active assignment
    INSERT INTO public.teacher_assignments (
      teacher_id,
      offering_id,
      academic_year,
      semester,
      is_active,
      assigned_by
    )
    VALUES (
      NEW.instructor_id,
      NEW.id,
      COALESCE(NEW.school_year, '2026-2027'),
      COALESCE(NEW.semester, '1st Semester'),
      true,
      auth.uid()
    )
    ON CONFLICT (teacher_id, offering_id, academic_year, semester)
    DO UPDATE SET
      is_active = true,
      assigned_by = COALESCE(auth.uid(), public.teacher_assignments.assigned_by),
      updated_at = now();
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE VIEW public.teacher_assigned_subjects WITH (security_invoker=true) AS  SELECT ta.teacher_id,
    p.full_name AS teacher_name,
    p.email AS teacher_email,
    co.id AS offering_id,
    co.code AS course_code,
    co.title AS course_title,
    co.units,
    co.schedule,
    co.program,
    co.year,
    co.semester,
    co.school_year,
    ta.academic_year,
    ta.semester AS assignment_semester,
    ta.is_active
   FROM teacher_assignments ta
     JOIN profiles p ON ta.teacher_id = p.id
     JOIN course_offerings co ON ta.offering_id = co.id
  WHERE ta.is_active = true;

CREATE VIEW public.teacher_subject_dropdown WITH (security_invoker=true) AS  SELECT DISTINCT ta.teacher_id,
    co.id AS offering_id,
    (co.code || ' - '::text) || co.title AS display_name,
    co.code,
    co.title,
    co.semester,
    co.school_year,
    co.schedule,
    count(DISTINCT e.student_id) AS enrolled_students_count
   FROM teacher_assignments ta
     JOIN course_offerings co ON ta.offering_id = co.id
     LEFT JOIN enrollments e ON co.id = e.offering_id
  WHERE ta.is_active = true
  GROUP BY ta.teacher_id, co.id, co.code, co.title, co.semester, co.school_year, co.schedule
  ORDER BY co.code;

CREATE VIEW public.v_grade_history WITH (security_invoker=true) AS  SELECT gh.id,
    gh.grade_id,
    gh.student_id,
    st.full_name AS student_name,
    st.student_no,
    gh.offering_id,
    co.code AS course_code,
    co.title AS course_title,
    gh.prelim,
    gh.midterm,
    gh.semifinal,
    gh.final,
    gh.equivalent,
    gh.remark,
    gh.changed_by,
    cb.full_name AS changed_by_name,
    gh.change_type,
    gh.reason,
    gh.created_at
   FROM grade_history gh
     LEFT JOIN profiles st ON gh.student_id = st.id
     LEFT JOIN course_offerings co ON gh.offering_id = co.id
     LEFT JOIN profiles cb ON gh.changed_by = cb.id;

CREATE VIEW public.instructor_evaluation_summary WITH (security_invoker=true) AS  SELECT max(instructor_name) AS instructor_name,
    school_year,
    semester,
    count(*)::integer AS total_evaluations,
    round(avg(teaching_clarity), 2) AS avg_teaching_clarity,
    round(avg(knowledge), 2) AS avg_knowledge,
    round(avg(availability), 2) AS avg_availability,
    round(avg(fairness), 2) AS avg_fairness,
    round(avg(punctuality), 2) AS avg_punctuality,
    round(avg((teaching_clarity + knowledge + availability + fairness + punctuality)::numeric / 5.0), 2) AS avg_overall,
    instructor_id
   FROM faculty_evaluations
  GROUP BY instructor_id, school_year, semester;

CREATE VIEW public.teacher_subject_students WITH (security_invoker=true) AS  SELECT ta.teacher_id,
    p.full_name AS teacher_name,
    co.id AS offering_id,
    co.code AS course_code,
    co.title AS course_title,
    e.student_id,
    st.full_name AS student_name,
    st.student_no,
    st.email AS student_email,
    st.year_level,
    st.section,
    e.status AS enrollment_status,
    e.enrolled_at,
    g.id AS grade_id,
    g.prelim,
    g.midterm,
    g.semifinal,
    g.final,
    g.equivalent,
    g.remark,
    g.graded_by,
    g.graded_at
   FROM teacher_assignments ta
     JOIN profiles p ON ta.teacher_id = p.id
     JOIN course_offerings co ON ta.offering_id = co.id
     JOIN enrollments e ON co.id = e.offering_id
     JOIN profiles st ON e.student_id = st.id
     LEFT JOIN grades g ON e.student_id = g.student_id AND e.offering_id = g.offering_id
  WHERE ta.is_active = true AND st.role = 'student'::text AND st.status = 'approved'::text;

CREATE INDEX idx_sections_adviser_id ON public.sections USING btree (adviser_id);

CREATE INDEX idx_messages_recipient_id ON public.messages USING btree (recipient_id);

CREATE INDEX idx_teacher_assignments_offering_active ON public.teacher_assignments USING btree (offering_id, is_active);

CREATE INDEX idx_grades_student_id ON public.grades USING btree (student_id);

CREATE INDEX idx_course_offerings_instructor_id ON public.course_offerings USING btree (instructor_id);

CREATE INDEX idx_grades_graded_by ON public.grades USING btree (graded_by);

CREATE INDEX idx_teacher_assignments_teacher_active ON public.teacher_assignments USING btree (teacher_id, is_active);

CREATE INDEX idx_class_announcements_offering_id ON public.class_announcements USING btree (offering_id);

CREATE INDEX idx_fac_eval_instructor_term ON public.faculty_evaluations USING btree (instructor_name, school_year, semester);

CREATE INDEX idx_installments_student_id ON public.installments USING btree (student_id);

CREATE INDEX idx_messages_sender_id ON public.messages USING btree (sender_id);

CREATE INDEX idx_grade_history_grade_id ON public.grade_history USING btree (grade_id);

CREATE INDEX idx_clearances_student_id ON public.clearances USING btree (student_id);

CREATE INDEX idx_messages_recipient_unread ON public.messages USING btree (recipient_id, is_read) WHERE (is_read = false);

CREATE INDEX idx_attendance_date ON public.attendance USING btree (date);

CREATE INDEX idx_class_announcements_offering ON public.class_announcements USING btree (offering_id);

CREATE INDEX idx_sections_academic_year_id ON public.sections USING btree (academic_year_id);

CREATE INDEX idx_enrollments_offering_id ON public.enrollments USING btree (offering_id);

CREATE INDEX idx_faq_articles_embedding ON public.faq_articles USING hnsw (embedding vector_cosine_ops);

CREATE INDEX idx_attendance_student_id ON public.attendance USING btree (student_id);

CREATE INDEX idx_fac_eval_student ON public.faculty_evaluations USING btree (student_id);

CREATE INDEX faq_articles_embedding_idx ON public.faq_articles USING hnsw (embedding vector_ip_ops) WITH (m='16', ef_construction='64');

CREATE INDEX idx_timetable_teacher_id ON public.timetable USING btree (teacher_id);

CREATE INDEX idx_attendance_offering_id ON public.attendance USING btree (offering_id);

CREATE INDEX idx_system_settings_updated_by ON public.system_settings USING btree (updated_by);

CREATE INDEX idx_class_announcements_author_id ON public.class_announcements USING btree (author_id);

CREATE INDEX idx_activities_student_id ON public.activities USING btree (student_id);

CREATE INDEX idx_clearance_status_dept_id ON public.clearance_status USING btree (department_id);

CREATE INDEX idx_transactions_student_id ON public.transactions USING btree (student_id);

CREATE INDEX idx_teacher_assignments_teacher_id ON public.teacher_assignments USING btree (teacher_id);

CREATE UNIQUE INDEX uq_enrollments_student_offering ON public.enrollments USING btree (student_id, offering_id) WHERE (status = 'enrolled'::text);

CREATE INDEX idx_chat_logs_user_id ON public.chat_logs USING btree (user_id);

CREATE INDEX idx_student_semesters_student_id ON public.student_semesters USING btree (student_id);

CREATE INDEX idx_teacher_assignments_assigned_by ON public.teacher_assignments USING btree (assigned_by);

CREATE INDEX idx_attendance_marked_by ON public.attendance USING btree (marked_by);

CREATE INDEX idx_appeals_student_id ON public.appeals USING btree (student_id);

CREATE UNIQUE INDEX uq_teacher_assignments_slot ON public.teacher_assignments USING btree (teacher_id, offering_id, academic_year, semester);

CREATE INDEX idx_timetable_room_id ON public.timetable USING btree (room_id);

CREATE INDEX idx_clearance_status_student_id ON public.clearance_status USING btree (student_id);

CREATE INDEX idx_faculty_evaluations_student_id ON public.faculty_evaluations USING btree (student_id);

CREATE INDEX idx_grade_history_student ON public.grade_history USING btree (student_id, created_at DESC);

CREATE INDEX idx_grades_offering_id ON public.grades USING btree (offering_id);

CREATE INDEX idx_enrollments_student_id ON public.enrollments USING btree (student_id);

CREATE INDEX idx_grade_history_student_id ON public.grade_history USING btree (student_id);

CREATE INDEX idx_timetable_offering_id ON public.timetable USING btree (offering_id);

CREATE INDEX idx_grade_history_offering ON public.grade_history USING btree (offering_id, created_at DESC);

CREATE INDEX idx_teacher_assignments_offering_id ON public.teacher_assignments USING btree (offering_id);

CREATE INDEX idx_attendance_timetable_id ON public.attendance USING btree (timetable_id);

CREATE INDEX idx_faculty_evaluations_instructor_id ON public.faculty_evaluations USING btree (instructor_id);

ALTER TABLE "public"."departments" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."grading_scale" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."timetable" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."attendance" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."class_announcements" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."misc_fees" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."activities" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."clearances" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."enrollments" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."student_semesters" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."appeals" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."clearance_status" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."sections" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."rooms" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."enrollment_items" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."clearance_departments" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."transactions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."deadlines" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."courses" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."students" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."faculty_notes" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."accreditation_checklist" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."department_budgets" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."grant_funding" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."course_offerings" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."faq_articles" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."announcements" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."academic_years" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."sso_links" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."user_mfa" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."faculty_evaluations" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."grades" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."installments" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."billing_summary" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."teacher_assignments" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."system_settings" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."chat_logs" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."grade_history" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins write departments" ON public.departments AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)) AND (profiles.role = 'admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)) AND (profiles.role = 'admin'::text)))));

CREATE POLICY "Authenticated read departments" ON public.departments AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "All users can read grading scale" ON public.grading_scale AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY "Admins write timetable" ON public.timetable AS PERMISSIVE FOR ALL TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)) AND (profiles.role = 'admin'::text)))));

CREATE POLICY "Authenticated read timetable" ON public.timetable AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "Faculty read all attendance" ON public.attendance AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['faculty'::text, 'teacher'::text, 'staff'::text, 'admin'::text, 'dean'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE)))));

CREATE POLICY "Faculty write attendance" ON public.attendance AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE) AND ((p.role = ANY (ARRAY['admin'::text, 'dean'::text])) OR ((p.role = ANY (ARRAY['teacher'::text, 'faculty'::text])) AND (EXISTS ( SELECT 1
           FROM teacher_assignments ta
          WHERE ((ta.teacher_id = p.id) AND (ta.offering_id = attendance.offering_id) AND (ta.is_active IS TRUE)))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE) AND ((p.role = ANY (ARRAY['admin'::text, 'dean'::text])) OR ((p.role = ANY (ARRAY['teacher'::text, 'faculty'::text])) AND (EXISTS ( SELECT 1
           FROM teacher_assignments ta
          WHERE ((ta.teacher_id = p.id) AND (ta.offering_id = attendance.offering_id) AND (ta.is_active IS TRUE))))))))));

CREATE POLICY "Students read own attendance" ON public.attendance AS PERMISSIVE FOR SELECT TO PUBLIC USING ((student_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)));

CREATE POLICY mfa_restrictive_attendance ON public.attendance AS RESTRICTIVE FOR ALL TO authenticated USING (is_mfa_compliant()) WITH CHECK (is_mfa_compliant());

CREATE POLICY "Users read own messages" ON public.messages AS PERMISSIVE FOR SELECT TO authenticated USING (((sender_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)) OR (recipient_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid))));

CREATE POLICY "Users send messages" ON public.messages AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((sender_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)));

CREATE POLICY "Users update own messages" ON public.messages AS PERMISSIVE FOR UPDATE TO authenticated USING ((recipient_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)));

CREATE POLICY "Faculty read all class announcements" ON public.class_announcements AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['faculty'::text, 'teacher'::text, 'admin'::text, 'dean'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE)))));

CREATE POLICY "Faculty write own announcements" ON public.class_announcements AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE) AND (((p.role = ANY (ARRAY['faculty'::text, 'teacher'::text])) AND (class_announcements.author_id = ( SELECT auth.uid() AS uid))) OR (p.role = ANY (ARRAY['dean'::text, 'admin'::text]))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE) AND (((p.role = ANY (ARRAY['faculty'::text, 'teacher'::text])) AND (class_announcements.author_id = ( SELECT auth.uid() AS uid))) OR (p.role = ANY (ARRAY['dean'::text, 'admin'::text])))))));

CREATE POLICY "Students read class announcements" ON public.class_announcements AS PERMISSIVE FOR SELECT TO authenticated USING (((is_active = true) AND (EXISTS ( SELECT 1
   FROM enrollments e
  WHERE ((e.student_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)) AND (e.offering_id = class_announcements.offering_id))))));

CREATE POLICY "Anyone can read misc_fees" ON public.misc_fees AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users read misc fees" ON public.misc_fees AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "Students read own activities" ON public.activities AS PERMISSIVE FOR SELECT TO PUBLIC USING ((student_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)));

CREATE POLICY "Approved staff manage clearances" ON public.clearances AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['teacher'::text, 'faculty'::text, 'staff'::text, 'registrar'::text, 'dean'::text, 'admin'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['teacher'::text, 'faculty'::text, 'staff'::text, 'registrar'::text, 'dean'::text, 'admin'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE)))));

CREATE POLICY "Students read own clearances" ON public.clearances AS PERMISSIVE FOR SELECT TO authenticated USING ((student_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY mfa_restrictive_clearances ON public.clearances AS RESTRICTIVE FOR ALL TO authenticated USING (is_mfa_compliant()) WITH CHECK (is_mfa_compliant());

CREATE POLICY "Approved staff manage enrollments" ON public.enrollments AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['teacher'::text, 'faculty'::text, 'dean'::text, 'admin'::text, 'registrar'::text, 'staff'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['teacher'::text, 'faculty'::text, 'dean'::text, 'admin'::text, 'registrar'::text, 'staff'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE)))));

CREATE POLICY "Approved staff read enrollments" ON public.enrollments AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['teacher'::text, 'faculty'::text, 'dean'::text, 'admin'::text, 'registrar'::text, 'staff'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE)))));

CREATE POLICY "Students read own enrollments" ON public.enrollments AS PERMISSIVE FOR SELECT TO authenticated USING ((student_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "Admins read all semesters" ON public.student_semesters AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)) AND (profiles.role = 'admin'::text)))));

CREATE POLICY "Students read own semesters" ON public.student_semesters AS PERMISSIVE FOR SELECT TO authenticated USING ((student_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)));

CREATE POLICY "Dean admin manage appeals" ON public.appeals AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['dean'::text, 'admin'::text]))))));

CREATE POLICY "Students insert own appeals" ON public.appeals AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((student_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "Students read own appeals" ON public.appeals AS PERMISSIVE FOR SELECT TO authenticated USING ((student_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY mfa_restrictive_appeals ON public.appeals AS RESTRICTIVE FOR ALL TO authenticated USING (is_mfa_compliant()) WITH CHECK (is_mfa_compliant());

CREATE POLICY "Staff faculty dean admin manage clearance_status" ON public.clearance_status AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['teacher'::text, 'faculty'::text, 'staff'::text, 'registrar'::text, 'dean'::text, 'admin'::text]))))));

CREATE POLICY "Students view own clearance" ON public.clearance_status AS PERMISSIVE FOR SELECT TO authenticated USING ((student_id IN ( SELECT students.id
   FROM students
  WHERE (students.email = ( SELECT (( SELECT auth.jwt() AS jwt) ->> 'email'::text))))));

CREATE POLICY mfa_restrictive_clearance_status ON public.clearance_status AS RESTRICTIVE FOR ALL TO authenticated USING (is_mfa_compliant()) WITH CHECK (is_mfa_compliant());

CREATE POLICY "Admins write sections" ON public.sections AS PERMISSIVE FOR ALL TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)) AND (profiles.role = 'admin'::text)))));

CREATE POLICY "Authenticated read sections" ON public.sections AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins write rooms" ON public.rooms AS PERMISSIVE FOR ALL TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)) AND (profiles.role = 'admin'::text)))));

CREATE POLICY "Authenticated read rooms" ON public.rooms AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated read enrollment_items" ON public.enrollment_items AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "Students insert enrollment_items" ON public.enrollment_items AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM enrollments e
  WHERE ((e.id = enrollment_items.enrollment_id) AND (e.student_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid))))));

CREATE POLICY "Public read clearance departments" ON public.clearance_departments AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "Students read own transactions" ON public.transactions AS PERMISSIVE FOR SELECT TO PUBLIC USING ((student_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)));

CREATE POLICY mfa_restrictive_transactions ON public.transactions AS RESTRICTIVE FOR ALL TO authenticated USING (is_mfa_compliant()) WITH CHECK (is_mfa_compliant());

CREATE POLICY "Public read deadlines" ON public.deadlines AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY "Deans and admins manage courses" ON public.courses AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['dean'::text, 'admin'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['dean'::text, 'admin'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE)))));

CREATE POLICY "Public read courses" ON public.courses AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY "Students view own profile" ON public.students AS PERMISSIVE FOR SELECT TO authenticated USING ((email = ( SELECT (( SELECT auth.jwt() AS jwt) ->> 'email'::text))));

CREATE POLICY "Dean admin manage faculty_notes" ON public.faculty_notes AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['dean'::text, 'admin'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['dean'::text, 'admin'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE)))));

CREATE POLICY "Dean admin manage accreditation_checklist" ON public.accreditation_checklist AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['dean'::text, 'admin'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['dean'::text, 'admin'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE)))));

CREATE POLICY "Dean admin manage department_budgets" ON public.department_budgets AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['dean'::text, 'admin'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['dean'::text, 'admin'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE)))));

CREATE POLICY "Dean admin manage grant_funding" ON public.grant_funding AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['dean'::text, 'admin'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['dean'::text, 'admin'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE)))));

CREATE POLICY "All users read offerings" ON public.course_offerings AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated read offerings" ON public.course_offerings AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "Faculty and admin delete offerings" ON public.course_offerings AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['teacher'::text, 'faculty'::text, 'dean'::text, 'admin'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE)))));

CREATE POLICY "Faculty and admin insert offerings" ON public.course_offerings AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['teacher'::text, 'faculty'::text, 'dean'::text, 'admin'::text]))))));

CREATE POLICY "Faculty and admin update offerings" ON public.course_offerings AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['teacher'::text, 'faculty'::text, 'dean'::text, 'admin'::text]))))));

CREATE POLICY "Anyone can read faq" ON public.faq_articles AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "Anyone can read announcements" ON public.announcements AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "Teachers write announcements" ON public.announcements AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['teacher'::text, 'faculty'::text, 'staff'::text, 'admin'::text, 'dean'::text, 'registrar'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['teacher'::text, 'faculty'::text, 'staff'::text, 'admin'::text, 'dean'::text, 'registrar'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE)))));

CREATE POLICY "Admins write academic_years" ON public.academic_years AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)) AND (profiles.role = 'admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)) AND (profiles.role = 'admin'::text)))));

CREATE POLICY "Authenticated read academic_years" ON public.academic_years AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins write sso_links" ON public.sso_links AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)) AND (profiles.role = 'admin'::text)))));

CREATE POLICY "Authenticated read sso_links" ON public.sso_links AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users read sso links" ON public.sso_links AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can update all profiles" ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated USING (is_admin());

CREATE POLICY "Admins can view all profiles" ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin());

CREATE POLICY "Admins delete profiles" ON public.profiles AS PERMISSIVE FOR DELETE TO authenticated USING (is_admin());

CREATE POLICY "Admins insert profiles" ON public.profiles AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_admin());

CREATE POLICY "Users can read own profile" ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated USING ((id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)));

CREATE POLICY "Users can update own profile" ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated USING ((id = ( SELECT ( SELECT auth.uid() AS uid) AS uid))) WITH CHECK ((id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)));

CREATE POLICY "Deans and admins delete evaluations" ON public.faculty_evaluations AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['dean'::text, 'admin'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE)))));

CREATE POLICY "Deans and admins insert evaluations" ON public.faculty_evaluations AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['dean'::text, 'admin'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE)))));

CREATE POLICY "Deans and admins update evaluations" ON public.faculty_evaluations AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['dean'::text, 'admin'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['dean'::text, 'admin'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE)))));

CREATE POLICY "Deans and admins view all evaluations" ON public.faculty_evaluations AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['dean'::text, 'admin'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE)))));

CREATE POLICY "Students insert own evaluations" ON public.faculty_evaluations AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((student_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "Students view own evaluations" ON public.faculty_evaluations AS PERMISSIVE FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = student_id));

CREATE POLICY "Teachers view own evaluations" ON public.faculty_evaluations AS PERMISSIVE FOR SELECT TO authenticated USING (((instructor_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['teacher'::text, 'faculty'::text, 'dean'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE))))));

CREATE POLICY "Admin can view all grades" ON public.grades AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::text) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE)))));

CREATE POLICY "Admins delete any grades" ON public.grades AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::text) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE)))));

CREATE POLICY "Admins insert grades for enrolled students" ON public.grades AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::text) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE)))) AND (EXISTS ( SELECT 1
   FROM enrollments e
  WHERE ((e.student_id = grades.student_id) AND (e.offering_id = grades.offering_id))))));

CREATE POLICY "Admins update grades for enrolled students" ON public.grades AS PERMISSIVE FOR UPDATE TO authenticated USING (((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::text) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE)))) AND (EXISTS ( SELECT 1
   FROM enrollments e
  WHERE ((e.student_id = grades.student_id) AND (e.offering_id = grades.offering_id)))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::text) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE)))) AND (EXISTS ( SELECT 1
   FROM enrollments e
  WHERE ((e.student_id = grades.student_id) AND (e.offering_id = grades.offering_id))))));

CREATE POLICY "Approved assigned instructors insert enrolled grades" ON public.grades AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM (profiles p
     JOIN teacher_assignments ta ON ((ta.teacher_id = p.id)))
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['teacher'::text, 'faculty'::text, 'dean'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE) AND (ta.offering_id = grades.offering_id) AND (ta.is_active IS TRUE)))) AND (EXISTS ( SELECT 1
   FROM enrollments e
  WHERE ((e.student_id = grades.student_id) AND (e.offering_id = grades.offering_id))))));

CREATE POLICY "Approved assigned instructors update enrolled grades" ON public.grades AS PERMISSIVE FOR UPDATE TO authenticated USING (((EXISTS ( SELECT 1
   FROM (profiles p
     JOIN teacher_assignments ta ON ((ta.teacher_id = p.id)))
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['teacher'::text, 'faculty'::text, 'dean'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE) AND (ta.offering_id = grades.offering_id) AND (ta.is_active IS TRUE)))) AND (EXISTS ( SELECT 1
   FROM enrollments e
  WHERE ((e.student_id = grades.student_id) AND (e.offering_id = grades.offering_id)))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM (profiles p
     JOIN teacher_assignments ta ON ((ta.teacher_id = p.id)))
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['teacher'::text, 'faculty'::text, 'dean'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE) AND (ta.offering_id = grades.offering_id) AND (ta.is_active IS TRUE)))) AND (EXISTS ( SELECT 1
   FROM enrollments e
  WHERE ((e.student_id = grades.student_id) AND (e.offering_id = grades.offering_id))))));

CREATE POLICY "Approved deans delete assigned grades" ON public.grades AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (profiles p
     JOIN teacher_assignments ta ON ((ta.teacher_id = p.id)))
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'dean'::text) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE) AND (ta.offering_id = grades.offering_id) AND (ta.is_active IS TRUE)))));

CREATE POLICY "Approved deans view all grades" ON public.grades AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'dean'::text) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE)))));

CREATE POLICY "Approved instructors view assigned grades" ON public.grades AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (profiles p
     JOIN teacher_assignments ta ON ((ta.teacher_id = p.id)))
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['teacher'::text, 'faculty'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE) AND (ta.offering_id = grades.offering_id) AND (ta.is_active IS TRUE)))));

CREATE POLICY "Students can view own grades" ON public.grades AS PERMISSIVE FOR SELECT TO authenticated USING ((student_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "Students read own grades" ON public.grades AS PERMISSIVE FOR SELECT TO authenticated USING ((student_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)));

CREATE POLICY mfa_restrictive_grades ON public.grades AS RESTRICTIVE FOR ALL TO authenticated USING (is_mfa_compliant()) WITH CHECK (is_mfa_compliant());

CREATE POLICY "Students read own installments" ON public.installments AS PERMISSIVE FOR SELECT TO authenticated USING ((student_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY mfa_restrictive_installments ON public.installments AS RESTRICTIVE FOR ALL TO authenticated USING (is_mfa_compliant()) WITH CHECK (is_mfa_compliant());

CREATE POLICY "Students read own billing" ON public.billing_summary AS PERMISSIVE FOR SELECT TO PUBLIC USING ((student_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)));

CREATE POLICY mfa_restrictive_billing_summary ON public.billing_summary AS RESTRICTIVE FOR ALL TO authenticated USING (is_mfa_compliant()) WITH CHECK (is_mfa_compliant());

CREATE POLICY "Admin can view all assignments" ON public.teacher_assignments AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::text) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE)))));

CREATE POLICY "Admin manage assignments" ON public.teacher_assignments AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::text) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::text) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE)))));

CREATE POLICY "Dean can manage all assignments" ON public.teacher_assignments AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'dean'::text) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'dean'::text) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE)))));

CREATE POLICY "Deans and teachers read teacher_assignments" ON public.teacher_assignments AS PERMISSIVE FOR SELECT TO authenticated USING (((teacher_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['dean'::text, 'admin'::text, 'registrar'::text])) AND (profiles.status = 'approved'::text))))));

CREATE POLICY "Teachers can view own assignments" ON public.teacher_assignments AS PERMISSIVE FOR SELECT TO authenticated USING (((teacher_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['teacher'::text, 'faculty'::text, 'dean'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE))))));

CREATE POLICY "System settings read policy" ON public.system_settings AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "System settings write policy" ON public.system_settings AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'dean'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'dean'::text]))))));

CREATE POLICY "Chat logs select policy" ON public.chat_logs AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)) AND (profiles.role = 'admin'::text))))));

CREATE POLICY "Approved instructors read assigned grade history" ON public.grade_history AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (profiles p
     JOIN teacher_assignments ta ON ((ta.teacher_id = p.id)))
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['teacher'::text, 'faculty'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE) AND (ta.offering_id = grade_history.offering_id) AND (ta.is_active IS TRUE)))));

CREATE POLICY "Approved oversight read grade history" ON public.grade_history AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['dean'::text, 'admin'::text, 'registrar'::text, 'staff'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE)))));

CREATE POLICY "Students read own grade history" ON public.grade_history AS PERMISSIVE FOR SELECT TO authenticated USING ((student_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY mfa_restrictive_grade_history ON public.grade_history AS RESTRICTIVE FOR ALL TO authenticated USING (is_mfa_compliant()) WITH CHECK (is_mfa_compliant());

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

CREATE TRIGGER trg_sync_student_term_on_enroll AFTER INSERT ON public.enrollments FOR EACH ROW EXECUTE FUNCTION sync_student_term_on_enroll();

CREATE TRIGGER grade_calculation_trigger BEFORE INSERT OR UPDATE ON public.grades FOR EACH ROW EXECUTE FUNCTION update_grade_calculations();

CREATE TRIGGER trg_auto_student_semester AFTER INSERT OR UPDATE OF status, role ON public.profiles FOR EACH ROW EXECUTE FUNCTION auto_create_student_semester();

CREATE TRIGGER trg_archive_grade_change AFTER INSERT OR UPDATE ON public.grades FOR EACH ROW EXECUTE FUNCTION archive_grade_change();

CREATE TRIGGER trg_sync_teacher_assignment AFTER INSERT OR UPDATE OF instructor_id, school_year, semester ON public.course_offerings FOR EACH ROW EXECUTE FUNCTION sync_teacher_assignment();

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.clearance_status FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.accreditation_checklist FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.department_budgets FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.grant_funding FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.billing_summary FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.system_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

REVOKE ALL ON ALL TABLES IN SCHEMA public,private FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON ALL SEQUENCES IN SCHEMA public,private FROM PUBLIC,anon,authenticated,service_role;

GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;

GRANT INSERT ON public.departments TO authenticated;

GRANT SELECT ON public.departments TO authenticated;

GRANT UPDATE ON public.departments TO authenticated;

GRANT DELETE ON public.departments TO authenticated;

GRANT TRUNCATE ON public.departments TO authenticated;

GRANT REFERENCES ON public.departments TO authenticated;

GRANT TRIGGER ON public.departments TO authenticated;

GRANT MAINTAIN ON public.departments TO authenticated;

GRANT INSERT ON public.departments TO service_role;

GRANT SELECT ON public.departments TO service_role;

GRANT UPDATE ON public.departments TO service_role;

GRANT DELETE ON public.departments TO service_role;

GRANT TRUNCATE ON public.departments TO service_role;

GRANT REFERENCES ON public.departments TO service_role;

GRANT TRIGGER ON public.departments TO service_role;

GRANT MAINTAIN ON public.departments TO service_role;

GRANT SELECT ON public.departments TO anon;

GRANT INSERT ON public.grading_scale TO authenticated;

GRANT SELECT ON public.grading_scale TO authenticated;

GRANT UPDATE ON public.grading_scale TO authenticated;

GRANT DELETE ON public.grading_scale TO authenticated;

GRANT TRUNCATE ON public.grading_scale TO authenticated;

GRANT REFERENCES ON public.grading_scale TO authenticated;

GRANT TRIGGER ON public.grading_scale TO authenticated;

GRANT MAINTAIN ON public.grading_scale TO authenticated;

GRANT SELECT ON public.grading_scale TO anon;

GRANT INSERT ON public.timetable TO authenticated;

GRANT SELECT ON public.timetable TO authenticated;

GRANT UPDATE ON public.timetable TO authenticated;

GRANT DELETE ON public.timetable TO authenticated;

GRANT TRUNCATE ON public.timetable TO authenticated;

GRANT REFERENCES ON public.timetable TO authenticated;

GRANT TRIGGER ON public.timetable TO authenticated;

GRANT MAINTAIN ON public.timetable TO authenticated;

GRANT INSERT ON public.timetable TO service_role;

GRANT SELECT ON public.timetable TO service_role;

GRANT UPDATE ON public.timetable TO service_role;

GRANT DELETE ON public.timetable TO service_role;

GRANT TRUNCATE ON public.timetable TO service_role;

GRANT REFERENCES ON public.timetable TO service_role;

GRANT TRIGGER ON public.timetable TO service_role;

GRANT MAINTAIN ON public.timetable TO service_role;

GRANT SELECT ON public.timetable TO anon;

GRANT INSERT ON public.attendance TO authenticated;

GRANT SELECT ON public.attendance TO authenticated;

GRANT UPDATE ON public.attendance TO authenticated;

GRANT DELETE ON public.attendance TO authenticated;

GRANT TRUNCATE ON public.attendance TO authenticated;

GRANT REFERENCES ON public.attendance TO authenticated;

GRANT TRIGGER ON public.attendance TO authenticated;

GRANT MAINTAIN ON public.attendance TO authenticated;

GRANT INSERT ON public.attendance TO service_role;

GRANT SELECT ON public.attendance TO service_role;

GRANT UPDATE ON public.attendance TO service_role;

GRANT DELETE ON public.attendance TO service_role;

GRANT TRUNCATE ON public.attendance TO service_role;

GRANT REFERENCES ON public.attendance TO service_role;

GRANT TRIGGER ON public.attendance TO service_role;

GRANT MAINTAIN ON public.attendance TO service_role;

GRANT SELECT ON public.attendance TO anon;

GRANT INSERT ON public.messages TO authenticated;

GRANT SELECT ON public.messages TO authenticated;

GRANT UPDATE ON public.messages TO authenticated;

GRANT DELETE ON public.messages TO authenticated;

GRANT TRUNCATE ON public.messages TO authenticated;

GRANT REFERENCES ON public.messages TO authenticated;

GRANT TRIGGER ON public.messages TO authenticated;

GRANT MAINTAIN ON public.messages TO authenticated;

GRANT INSERT ON public.messages TO service_role;

GRANT SELECT ON public.messages TO service_role;

GRANT UPDATE ON public.messages TO service_role;

GRANT DELETE ON public.messages TO service_role;

GRANT TRUNCATE ON public.messages TO service_role;

GRANT REFERENCES ON public.messages TO service_role;

GRANT TRIGGER ON public.messages TO service_role;

GRANT MAINTAIN ON public.messages TO service_role;

GRANT SELECT ON public.messages TO anon;

GRANT INSERT ON public.class_announcements TO authenticated;

GRANT SELECT ON public.class_announcements TO authenticated;

GRANT UPDATE ON public.class_announcements TO authenticated;

GRANT DELETE ON public.class_announcements TO authenticated;

GRANT TRUNCATE ON public.class_announcements TO authenticated;

GRANT REFERENCES ON public.class_announcements TO authenticated;

GRANT TRIGGER ON public.class_announcements TO authenticated;

GRANT MAINTAIN ON public.class_announcements TO authenticated;

GRANT INSERT ON public.class_announcements TO service_role;

GRANT SELECT ON public.class_announcements TO service_role;

GRANT UPDATE ON public.class_announcements TO service_role;

GRANT DELETE ON public.class_announcements TO service_role;

GRANT TRUNCATE ON public.class_announcements TO service_role;

GRANT REFERENCES ON public.class_announcements TO service_role;

GRANT TRIGGER ON public.class_announcements TO service_role;

GRANT MAINTAIN ON public.class_announcements TO service_role;

GRANT SELECT ON public.class_announcements TO anon;

GRANT INSERT ON public.misc_fees TO authenticated;

GRANT SELECT ON public.misc_fees TO authenticated;

GRANT UPDATE ON public.misc_fees TO authenticated;

GRANT DELETE ON public.misc_fees TO authenticated;

GRANT TRUNCATE ON public.misc_fees TO authenticated;

GRANT REFERENCES ON public.misc_fees TO authenticated;

GRANT TRIGGER ON public.misc_fees TO authenticated;

GRANT MAINTAIN ON public.misc_fees TO authenticated;

GRANT INSERT ON public.misc_fees TO service_role;

GRANT SELECT ON public.misc_fees TO service_role;

GRANT UPDATE ON public.misc_fees TO service_role;

GRANT DELETE ON public.misc_fees TO service_role;

GRANT TRUNCATE ON public.misc_fees TO service_role;

GRANT REFERENCES ON public.misc_fees TO service_role;

GRANT TRIGGER ON public.misc_fees TO service_role;

GRANT MAINTAIN ON public.misc_fees TO service_role;

GRANT SELECT ON public.misc_fees TO anon;

GRANT INSERT ON public.activities TO authenticated;

GRANT SELECT ON public.activities TO authenticated;

GRANT UPDATE ON public.activities TO authenticated;

GRANT DELETE ON public.activities TO authenticated;

GRANT TRUNCATE ON public.activities TO authenticated;

GRANT REFERENCES ON public.activities TO authenticated;

GRANT TRIGGER ON public.activities TO authenticated;

GRANT MAINTAIN ON public.activities TO authenticated;

GRANT INSERT ON public.activities TO service_role;

GRANT SELECT ON public.activities TO service_role;

GRANT UPDATE ON public.activities TO service_role;

GRANT DELETE ON public.activities TO service_role;

GRANT TRUNCATE ON public.activities TO service_role;

GRANT REFERENCES ON public.activities TO service_role;

GRANT TRIGGER ON public.activities TO service_role;

GRANT MAINTAIN ON public.activities TO service_role;

GRANT SELECT ON public.activities TO anon;

GRANT INSERT ON public.clearances TO service_role;

GRANT SELECT ON public.clearances TO service_role;

GRANT UPDATE ON public.clearances TO service_role;

GRANT DELETE ON public.clearances TO service_role;

GRANT TRUNCATE ON public.clearances TO service_role;

GRANT REFERENCES ON public.clearances TO service_role;

GRANT TRIGGER ON public.clearances TO service_role;

GRANT MAINTAIN ON public.clearances TO service_role;

GRANT INSERT ON public.clearances TO authenticated;

GRANT SELECT ON public.clearances TO authenticated;

GRANT UPDATE ON public.clearances TO authenticated;

GRANT DELETE ON public.clearances TO authenticated;

GRANT INSERT ON public.enrollments TO authenticated;

GRANT SELECT ON public.enrollments TO authenticated;

GRANT UPDATE ON public.enrollments TO authenticated;

GRANT DELETE ON public.enrollments TO authenticated;

GRANT TRUNCATE ON public.enrollments TO authenticated;

GRANT REFERENCES ON public.enrollments TO authenticated;

GRANT TRIGGER ON public.enrollments TO authenticated;

GRANT MAINTAIN ON public.enrollments TO authenticated;

GRANT INSERT ON public.enrollments TO service_role;

GRANT SELECT ON public.enrollments TO service_role;

GRANT UPDATE ON public.enrollments TO service_role;

GRANT DELETE ON public.enrollments TO service_role;

GRANT TRUNCATE ON public.enrollments TO service_role;

GRANT REFERENCES ON public.enrollments TO service_role;

GRANT TRIGGER ON public.enrollments TO service_role;

GRANT MAINTAIN ON public.enrollments TO service_role;

GRANT SELECT ON public.enrollments TO anon;

GRANT INSERT ON public.student_semesters TO service_role;

GRANT SELECT ON public.student_semesters TO service_role;

GRANT UPDATE ON public.student_semesters TO service_role;

GRANT DELETE ON public.student_semesters TO service_role;

GRANT TRUNCATE ON public.student_semesters TO service_role;

GRANT REFERENCES ON public.student_semesters TO service_role;

GRANT TRIGGER ON public.student_semesters TO service_role;

GRANT MAINTAIN ON public.student_semesters TO service_role;

GRANT SELECT ON public.student_semesters TO authenticated;

GRANT INSERT ON public.appeals TO authenticated;

GRANT SELECT ON public.appeals TO authenticated;

GRANT UPDATE ON public.appeals TO authenticated;

GRANT DELETE ON public.appeals TO authenticated;

GRANT TRUNCATE ON public.appeals TO authenticated;

GRANT REFERENCES ON public.appeals TO authenticated;

GRANT TRIGGER ON public.appeals TO authenticated;

GRANT MAINTAIN ON public.appeals TO authenticated;

GRANT SELECT ON public.appeals TO anon;

GRANT INSERT ON public.clearance_status TO authenticated;

GRANT SELECT ON public.clearance_status TO authenticated;

GRANT UPDATE ON public.clearance_status TO authenticated;

GRANT DELETE ON public.clearance_status TO authenticated;

GRANT TRUNCATE ON public.clearance_status TO authenticated;

GRANT REFERENCES ON public.clearance_status TO authenticated;

GRANT TRIGGER ON public.clearance_status TO authenticated;

GRANT MAINTAIN ON public.clearance_status TO authenticated;

GRANT INSERT ON public.clearance_status TO service_role;

GRANT SELECT ON public.clearance_status TO service_role;

GRANT UPDATE ON public.clearance_status TO service_role;

GRANT DELETE ON public.clearance_status TO service_role;

GRANT TRUNCATE ON public.clearance_status TO service_role;

GRANT REFERENCES ON public.clearance_status TO service_role;

GRANT TRIGGER ON public.clearance_status TO service_role;

GRANT MAINTAIN ON public.clearance_status TO service_role;

GRANT SELECT ON public.clearance_status TO anon;

GRANT INSERT ON public.sections TO authenticated;

GRANT SELECT ON public.sections TO authenticated;

GRANT UPDATE ON public.sections TO authenticated;

GRANT DELETE ON public.sections TO authenticated;

GRANT TRUNCATE ON public.sections TO authenticated;

GRANT REFERENCES ON public.sections TO authenticated;

GRANT TRIGGER ON public.sections TO authenticated;

GRANT MAINTAIN ON public.sections TO authenticated;

GRANT INSERT ON public.sections TO service_role;

GRANT SELECT ON public.sections TO service_role;

GRANT UPDATE ON public.sections TO service_role;

GRANT DELETE ON public.sections TO service_role;

GRANT TRUNCATE ON public.sections TO service_role;

GRANT REFERENCES ON public.sections TO service_role;

GRANT TRIGGER ON public.sections TO service_role;

GRANT MAINTAIN ON public.sections TO service_role;

GRANT SELECT ON public.sections TO anon;

GRANT INSERT ON public.rooms TO authenticated;

GRANT SELECT ON public.rooms TO authenticated;

GRANT UPDATE ON public.rooms TO authenticated;

GRANT DELETE ON public.rooms TO authenticated;

GRANT TRUNCATE ON public.rooms TO authenticated;

GRANT REFERENCES ON public.rooms TO authenticated;

GRANT TRIGGER ON public.rooms TO authenticated;

GRANT MAINTAIN ON public.rooms TO authenticated;

GRANT INSERT ON public.rooms TO service_role;

GRANT SELECT ON public.rooms TO service_role;

GRANT UPDATE ON public.rooms TO service_role;

GRANT DELETE ON public.rooms TO service_role;

GRANT TRUNCATE ON public.rooms TO service_role;

GRANT REFERENCES ON public.rooms TO service_role;

GRANT TRIGGER ON public.rooms TO service_role;

GRANT MAINTAIN ON public.rooms TO service_role;

GRANT SELECT ON public.rooms TO anon;

GRANT INSERT ON public.enrollment_items TO authenticated;

GRANT SELECT ON public.enrollment_items TO authenticated;

GRANT UPDATE ON public.enrollment_items TO authenticated;

GRANT DELETE ON public.enrollment_items TO authenticated;

GRANT TRUNCATE ON public.enrollment_items TO authenticated;

GRANT REFERENCES ON public.enrollment_items TO authenticated;

GRANT TRIGGER ON public.enrollment_items TO authenticated;

GRANT MAINTAIN ON public.enrollment_items TO authenticated;

GRANT INSERT ON public.enrollment_items TO service_role;

GRANT SELECT ON public.enrollment_items TO service_role;

GRANT UPDATE ON public.enrollment_items TO service_role;

GRANT DELETE ON public.enrollment_items TO service_role;

GRANT TRUNCATE ON public.enrollment_items TO service_role;

GRANT REFERENCES ON public.enrollment_items TO service_role;

GRANT TRIGGER ON public.enrollment_items TO service_role;

GRANT MAINTAIN ON public.enrollment_items TO service_role;

GRANT SELECT ON public.enrollment_items TO anon;

GRANT INSERT ON public.clearance_departments TO authenticated;

GRANT SELECT ON public.clearance_departments TO authenticated;

GRANT UPDATE ON public.clearance_departments TO authenticated;

GRANT DELETE ON public.clearance_departments TO authenticated;

GRANT TRUNCATE ON public.clearance_departments TO authenticated;

GRANT REFERENCES ON public.clearance_departments TO authenticated;

GRANT TRIGGER ON public.clearance_departments TO authenticated;

GRANT MAINTAIN ON public.clearance_departments TO authenticated;

GRANT INSERT ON public.clearance_departments TO service_role;

GRANT SELECT ON public.clearance_departments TO service_role;

GRANT UPDATE ON public.clearance_departments TO service_role;

GRANT DELETE ON public.clearance_departments TO service_role;

GRANT TRUNCATE ON public.clearance_departments TO service_role;

GRANT REFERENCES ON public.clearance_departments TO service_role;

GRANT TRIGGER ON public.clearance_departments TO service_role;

GRANT MAINTAIN ON public.clearance_departments TO service_role;

GRANT SELECT ON public.clearance_departments TO anon;

GRANT INSERT ON public.transactions TO authenticated;

GRANT SELECT ON public.transactions TO authenticated;

GRANT UPDATE ON public.transactions TO authenticated;

GRANT DELETE ON public.transactions TO authenticated;

GRANT TRUNCATE ON public.transactions TO authenticated;

GRANT REFERENCES ON public.transactions TO authenticated;

GRANT TRIGGER ON public.transactions TO authenticated;

GRANT MAINTAIN ON public.transactions TO authenticated;

GRANT INSERT ON public.transactions TO service_role;

GRANT SELECT ON public.transactions TO service_role;

GRANT UPDATE ON public.transactions TO service_role;

GRANT DELETE ON public.transactions TO service_role;

GRANT TRUNCATE ON public.transactions TO service_role;

GRANT REFERENCES ON public.transactions TO service_role;

GRANT TRIGGER ON public.transactions TO service_role;

GRANT MAINTAIN ON public.transactions TO service_role;

GRANT SELECT ON public.transactions TO anon;

GRANT INSERT ON public.deadlines TO authenticated;

GRANT SELECT ON public.deadlines TO authenticated;

GRANT UPDATE ON public.deadlines TO authenticated;

GRANT DELETE ON public.deadlines TO authenticated;

GRANT TRUNCATE ON public.deadlines TO authenticated;

GRANT REFERENCES ON public.deadlines TO authenticated;

GRANT TRIGGER ON public.deadlines TO authenticated;

GRANT MAINTAIN ON public.deadlines TO authenticated;

GRANT INSERT ON public.deadlines TO service_role;

GRANT SELECT ON public.deadlines TO service_role;

GRANT UPDATE ON public.deadlines TO service_role;

GRANT DELETE ON public.deadlines TO service_role;

GRANT TRUNCATE ON public.deadlines TO service_role;

GRANT REFERENCES ON public.deadlines TO service_role;

GRANT TRIGGER ON public.deadlines TO service_role;

GRANT MAINTAIN ON public.deadlines TO service_role;

GRANT SELECT ON public.deadlines TO anon;

GRANT INSERT ON public.courses TO authenticated;

GRANT SELECT ON public.courses TO authenticated;

GRANT UPDATE ON public.courses TO authenticated;

GRANT DELETE ON public.courses TO authenticated;

GRANT TRUNCATE ON public.courses TO authenticated;

GRANT REFERENCES ON public.courses TO authenticated;

GRANT TRIGGER ON public.courses TO authenticated;

GRANT MAINTAIN ON public.courses TO authenticated;

GRANT INSERT ON public.courses TO service_role;

GRANT SELECT ON public.courses TO service_role;

GRANT UPDATE ON public.courses TO service_role;

GRANT DELETE ON public.courses TO service_role;

GRANT TRUNCATE ON public.courses TO service_role;

GRANT REFERENCES ON public.courses TO service_role;

GRANT TRIGGER ON public.courses TO service_role;

GRANT MAINTAIN ON public.courses TO service_role;

GRANT SELECT ON public.courses TO anon;

GRANT INSERT ON public.students TO authenticated;

GRANT SELECT ON public.students TO authenticated;

GRANT UPDATE ON public.students TO authenticated;

GRANT DELETE ON public.students TO authenticated;

GRANT TRUNCATE ON public.students TO authenticated;

GRANT REFERENCES ON public.students TO authenticated;

GRANT TRIGGER ON public.students TO authenticated;

GRANT MAINTAIN ON public.students TO authenticated;

GRANT INSERT ON public.students TO service_role;

GRANT SELECT ON public.students TO service_role;

GRANT UPDATE ON public.students TO service_role;

GRANT DELETE ON public.students TO service_role;

GRANT TRUNCATE ON public.students TO service_role;

GRANT REFERENCES ON public.students TO service_role;

GRANT TRIGGER ON public.students TO service_role;

GRANT MAINTAIN ON public.students TO service_role;

GRANT SELECT ON public.students TO anon;

GRANT INSERT ON public.faculty_notes TO authenticated;

GRANT SELECT ON public.faculty_notes TO authenticated;

GRANT UPDATE ON public.faculty_notes TO authenticated;

GRANT DELETE ON public.faculty_notes TO authenticated;

GRANT TRUNCATE ON public.faculty_notes TO authenticated;

GRANT REFERENCES ON public.faculty_notes TO authenticated;

GRANT TRIGGER ON public.faculty_notes TO authenticated;

GRANT MAINTAIN ON public.faculty_notes TO authenticated;

GRANT SELECT ON public.faculty_notes TO anon;

GRANT INSERT ON public.accreditation_checklist TO authenticated;

GRANT SELECT ON public.accreditation_checklist TO authenticated;

GRANT UPDATE ON public.accreditation_checklist TO authenticated;

GRANT DELETE ON public.accreditation_checklist TO authenticated;

GRANT TRUNCATE ON public.accreditation_checklist TO authenticated;

GRANT REFERENCES ON public.accreditation_checklist TO authenticated;

GRANT TRIGGER ON public.accreditation_checklist TO authenticated;

GRANT MAINTAIN ON public.accreditation_checklist TO authenticated;

GRANT SELECT ON public.accreditation_checklist TO anon;

GRANT INSERT ON public.department_budgets TO authenticated;

GRANT SELECT ON public.department_budgets TO authenticated;

GRANT UPDATE ON public.department_budgets TO authenticated;

GRANT DELETE ON public.department_budgets TO authenticated;

GRANT TRUNCATE ON public.department_budgets TO authenticated;

GRANT REFERENCES ON public.department_budgets TO authenticated;

GRANT TRIGGER ON public.department_budgets TO authenticated;

GRANT MAINTAIN ON public.department_budgets TO authenticated;

GRANT SELECT ON public.department_budgets TO anon;

GRANT INSERT ON public.grant_funding TO authenticated;

GRANT SELECT ON public.grant_funding TO authenticated;

GRANT UPDATE ON public.grant_funding TO authenticated;

GRANT DELETE ON public.grant_funding TO authenticated;

GRANT TRUNCATE ON public.grant_funding TO authenticated;

GRANT REFERENCES ON public.grant_funding TO authenticated;

GRANT TRIGGER ON public.grant_funding TO authenticated;

GRANT MAINTAIN ON public.grant_funding TO authenticated;

GRANT SELECT ON public.grant_funding TO anon;

GRANT INSERT ON public.course_offerings TO authenticated;

GRANT SELECT ON public.course_offerings TO authenticated;

GRANT UPDATE ON public.course_offerings TO authenticated;

GRANT DELETE ON public.course_offerings TO authenticated;

GRANT TRUNCATE ON public.course_offerings TO authenticated;

GRANT REFERENCES ON public.course_offerings TO authenticated;

GRANT TRIGGER ON public.course_offerings TO authenticated;

GRANT MAINTAIN ON public.course_offerings TO authenticated;

GRANT INSERT ON public.course_offerings TO service_role;

GRANT SELECT ON public.course_offerings TO service_role;

GRANT UPDATE ON public.course_offerings TO service_role;

GRANT DELETE ON public.course_offerings TO service_role;

GRANT TRUNCATE ON public.course_offerings TO service_role;

GRANT REFERENCES ON public.course_offerings TO service_role;

GRANT TRIGGER ON public.course_offerings TO service_role;

GRANT MAINTAIN ON public.course_offerings TO service_role;

GRANT SELECT ON public.course_offerings TO anon;

GRANT INSERT ON public.faq_articles TO authenticated;

GRANT SELECT ON public.faq_articles TO authenticated;

GRANT UPDATE ON public.faq_articles TO authenticated;

GRANT DELETE ON public.faq_articles TO authenticated;

GRANT TRUNCATE ON public.faq_articles TO authenticated;

GRANT REFERENCES ON public.faq_articles TO authenticated;

GRANT TRIGGER ON public.faq_articles TO authenticated;

GRANT MAINTAIN ON public.faq_articles TO authenticated;

GRANT INSERT ON public.faq_articles TO service_role;

GRANT SELECT ON public.faq_articles TO service_role;

GRANT UPDATE ON public.faq_articles TO service_role;

GRANT DELETE ON public.faq_articles TO service_role;

GRANT TRUNCATE ON public.faq_articles TO service_role;

GRANT REFERENCES ON public.faq_articles TO service_role;

GRANT TRIGGER ON public.faq_articles TO service_role;

GRANT MAINTAIN ON public.faq_articles TO service_role;

GRANT SELECT ON public.faq_articles TO anon;

GRANT INSERT ON public.announcements TO authenticated;

GRANT SELECT ON public.announcements TO authenticated;

GRANT UPDATE ON public.announcements TO authenticated;

GRANT DELETE ON public.announcements TO authenticated;

GRANT TRUNCATE ON public.announcements TO authenticated;

GRANT REFERENCES ON public.announcements TO authenticated;

GRANT TRIGGER ON public.announcements TO authenticated;

GRANT MAINTAIN ON public.announcements TO authenticated;

GRANT INSERT ON public.announcements TO service_role;

GRANT SELECT ON public.announcements TO service_role;

GRANT UPDATE ON public.announcements TO service_role;

GRANT DELETE ON public.announcements TO service_role;

GRANT TRUNCATE ON public.announcements TO service_role;

GRANT REFERENCES ON public.announcements TO service_role;

GRANT TRIGGER ON public.announcements TO service_role;

GRANT MAINTAIN ON public.announcements TO service_role;

GRANT SELECT ON public.announcements TO anon;

GRANT INSERT ON public.academic_years TO authenticated;

GRANT SELECT ON public.academic_years TO authenticated;

GRANT UPDATE ON public.academic_years TO authenticated;

GRANT DELETE ON public.academic_years TO authenticated;

GRANT TRUNCATE ON public.academic_years TO authenticated;

GRANT REFERENCES ON public.academic_years TO authenticated;

GRANT TRIGGER ON public.academic_years TO authenticated;

GRANT MAINTAIN ON public.academic_years TO authenticated;

GRANT INSERT ON public.academic_years TO service_role;

GRANT SELECT ON public.academic_years TO service_role;

GRANT UPDATE ON public.academic_years TO service_role;

GRANT DELETE ON public.academic_years TO service_role;

GRANT TRUNCATE ON public.academic_years TO service_role;

GRANT REFERENCES ON public.academic_years TO service_role;

GRANT TRIGGER ON public.academic_years TO service_role;

GRANT MAINTAIN ON public.academic_years TO service_role;

GRANT SELECT ON public.academic_years TO anon;

GRANT INSERT ON public.sso_links TO authenticated;

GRANT SELECT ON public.sso_links TO authenticated;

GRANT UPDATE ON public.sso_links TO authenticated;

GRANT DELETE ON public.sso_links TO authenticated;

GRANT TRUNCATE ON public.sso_links TO authenticated;

GRANT REFERENCES ON public.sso_links TO authenticated;

GRANT TRIGGER ON public.sso_links TO authenticated;

GRANT MAINTAIN ON public.sso_links TO authenticated;

GRANT INSERT ON public.sso_links TO service_role;

GRANT SELECT ON public.sso_links TO service_role;

GRANT UPDATE ON public.sso_links TO service_role;

GRANT DELETE ON public.sso_links TO service_role;

GRANT TRUNCATE ON public.sso_links TO service_role;

GRANT REFERENCES ON public.sso_links TO service_role;

GRANT TRIGGER ON public.sso_links TO service_role;

GRANT MAINTAIN ON public.sso_links TO service_role;

GRANT SELECT ON public.sso_links TO anon;

GRANT INSERT ON public.profiles TO authenticated;

GRANT SELECT ON public.profiles TO authenticated;

GRANT DELETE ON public.profiles TO authenticated;

GRANT TRUNCATE ON public.profiles TO authenticated;

GRANT REFERENCES ON public.profiles TO authenticated;

GRANT TRIGGER ON public.profiles TO authenticated;

GRANT MAINTAIN ON public.profiles TO authenticated;

GRANT INSERT ON public.profiles TO service_role;

GRANT SELECT ON public.profiles TO service_role;

GRANT UPDATE ON public.profiles TO service_role;

GRANT DELETE ON public.profiles TO service_role;

GRANT TRUNCATE ON public.profiles TO service_role;

GRANT REFERENCES ON public.profiles TO service_role;

GRANT TRIGGER ON public.profiles TO service_role;

GRANT MAINTAIN ON public.profiles TO service_role;

GRANT SELECT ON public.profiles TO anon;

GRANT INSERT ON public.user_mfa TO service_role;

GRANT SELECT ON public.user_mfa TO service_role;

GRANT UPDATE ON public.user_mfa TO service_role;

GRANT DELETE ON public.user_mfa TO service_role;

GRANT TRUNCATE ON public.user_mfa TO service_role;

GRANT REFERENCES ON public.user_mfa TO service_role;

GRANT TRIGGER ON public.user_mfa TO service_role;

GRANT MAINTAIN ON public.user_mfa TO service_role;

GRANT INSERT ON public.faculty_evaluations TO authenticated;

GRANT SELECT ON public.faculty_evaluations TO authenticated;

GRANT UPDATE ON public.faculty_evaluations TO authenticated;

GRANT DELETE ON public.faculty_evaluations TO authenticated;

GRANT TRUNCATE ON public.faculty_evaluations TO authenticated;

GRANT REFERENCES ON public.faculty_evaluations TO authenticated;

GRANT TRIGGER ON public.faculty_evaluations TO authenticated;

GRANT MAINTAIN ON public.faculty_evaluations TO authenticated;

GRANT INSERT ON public.faculty_evaluations TO service_role;

GRANT SELECT ON public.faculty_evaluations TO service_role;

GRANT UPDATE ON public.faculty_evaluations TO service_role;

GRANT DELETE ON public.faculty_evaluations TO service_role;

GRANT TRUNCATE ON public.faculty_evaluations TO service_role;

GRANT REFERENCES ON public.faculty_evaluations TO service_role;

GRANT TRIGGER ON public.faculty_evaluations TO service_role;

GRANT MAINTAIN ON public.faculty_evaluations TO service_role;

GRANT SELECT ON public.faculty_evaluations TO anon;

GRANT INSERT ON public.grades TO authenticated;

GRANT SELECT ON public.grades TO authenticated;

GRANT UPDATE ON public.grades TO authenticated;

GRANT DELETE ON public.grades TO authenticated;

GRANT TRUNCATE ON public.grades TO authenticated;

GRANT REFERENCES ON public.grades TO authenticated;

GRANT TRIGGER ON public.grades TO authenticated;

GRANT MAINTAIN ON public.grades TO authenticated;

GRANT INSERT ON public.grades TO service_role;

GRANT SELECT ON public.grades TO service_role;

GRANT UPDATE ON public.grades TO service_role;

GRANT DELETE ON public.grades TO service_role;

GRANT TRUNCATE ON public.grades TO service_role;

GRANT REFERENCES ON public.grades TO service_role;

GRANT TRIGGER ON public.grades TO service_role;

GRANT MAINTAIN ON public.grades TO service_role;

GRANT SELECT ON public.grades TO anon;

GRANT INSERT ON public.installments TO service_role;

GRANT SELECT ON public.installments TO service_role;

GRANT UPDATE ON public.installments TO service_role;

GRANT DELETE ON public.installments TO service_role;

GRANT TRUNCATE ON public.installments TO service_role;

GRANT REFERENCES ON public.installments TO service_role;

GRANT TRIGGER ON public.installments TO service_role;

GRANT MAINTAIN ON public.installments TO service_role;

GRANT SELECT ON public.installments TO authenticated;

GRANT INSERT ON public.billing_summary TO authenticated;

GRANT SELECT ON public.billing_summary TO authenticated;

GRANT UPDATE ON public.billing_summary TO authenticated;

GRANT DELETE ON public.billing_summary TO authenticated;

GRANT TRUNCATE ON public.billing_summary TO authenticated;

GRANT REFERENCES ON public.billing_summary TO authenticated;

GRANT TRIGGER ON public.billing_summary TO authenticated;

GRANT MAINTAIN ON public.billing_summary TO authenticated;

GRANT INSERT ON public.billing_summary TO service_role;

GRANT SELECT ON public.billing_summary TO service_role;

GRANT UPDATE ON public.billing_summary TO service_role;

GRANT DELETE ON public.billing_summary TO service_role;

GRANT TRUNCATE ON public.billing_summary TO service_role;

GRANT REFERENCES ON public.billing_summary TO service_role;

GRANT TRIGGER ON public.billing_summary TO service_role;

GRANT MAINTAIN ON public.billing_summary TO service_role;

GRANT SELECT ON public.billing_summary TO anon;

GRANT INSERT ON public.teacher_assignments TO authenticated;

GRANT SELECT ON public.teacher_assignments TO authenticated;

GRANT UPDATE ON public.teacher_assignments TO authenticated;

GRANT DELETE ON public.teacher_assignments TO authenticated;

GRANT TRUNCATE ON public.teacher_assignments TO authenticated;

GRANT REFERENCES ON public.teacher_assignments TO authenticated;

GRANT TRIGGER ON public.teacher_assignments TO authenticated;

GRANT MAINTAIN ON public.teacher_assignments TO authenticated;

GRANT SELECT ON public.teacher_assignments TO anon;

GRANT INSERT ON public.system_settings TO authenticated;

GRANT SELECT ON public.system_settings TO authenticated;

GRANT UPDATE ON public.system_settings TO authenticated;

GRANT DELETE ON public.system_settings TO authenticated;

GRANT TRUNCATE ON public.system_settings TO authenticated;

GRANT REFERENCES ON public.system_settings TO authenticated;

GRANT TRIGGER ON public.system_settings TO authenticated;

GRANT MAINTAIN ON public.system_settings TO authenticated;

GRANT INSERT ON public.system_settings TO service_role;

GRANT SELECT ON public.system_settings TO service_role;

GRANT UPDATE ON public.system_settings TO service_role;

GRANT DELETE ON public.system_settings TO service_role;

GRANT TRUNCATE ON public.system_settings TO service_role;

GRANT REFERENCES ON public.system_settings TO service_role;

GRANT TRIGGER ON public.system_settings TO service_role;

GRANT MAINTAIN ON public.system_settings TO service_role;

GRANT SELECT ON public.system_settings TO anon;

GRANT INSERT ON public.chat_logs TO authenticated;

GRANT SELECT ON public.chat_logs TO authenticated;

GRANT UPDATE ON public.chat_logs TO authenticated;

GRANT DELETE ON public.chat_logs TO authenticated;

GRANT TRUNCATE ON public.chat_logs TO authenticated;

GRANT REFERENCES ON public.chat_logs TO authenticated;

GRANT TRIGGER ON public.chat_logs TO authenticated;

GRANT MAINTAIN ON public.chat_logs TO authenticated;

GRANT INSERT ON public.chat_logs TO service_role;

GRANT SELECT ON public.chat_logs TO service_role;

GRANT UPDATE ON public.chat_logs TO service_role;

GRANT DELETE ON public.chat_logs TO service_role;

GRANT TRUNCATE ON public.chat_logs TO service_role;

GRANT REFERENCES ON public.chat_logs TO service_role;

GRANT TRIGGER ON public.chat_logs TO service_role;

GRANT MAINTAIN ON public.chat_logs TO service_role;

GRANT SELECT ON public.chat_logs TO anon;

GRANT INSERT ON public.teacher_assigned_subjects TO authenticated;

GRANT SELECT ON public.teacher_assigned_subjects TO authenticated;

GRANT UPDATE ON public.teacher_assigned_subjects TO authenticated;

GRANT DELETE ON public.teacher_assigned_subjects TO authenticated;

GRANT TRUNCATE ON public.teacher_assigned_subjects TO authenticated;

GRANT REFERENCES ON public.teacher_assigned_subjects TO authenticated;

GRANT TRIGGER ON public.teacher_assigned_subjects TO authenticated;

GRANT MAINTAIN ON public.teacher_assigned_subjects TO authenticated;

GRANT SELECT ON public.teacher_assigned_subjects TO anon;

GRANT INSERT ON public.teacher_subject_dropdown TO authenticated;

GRANT SELECT ON public.teacher_subject_dropdown TO authenticated;

GRANT UPDATE ON public.teacher_subject_dropdown TO authenticated;

GRANT DELETE ON public.teacher_subject_dropdown TO authenticated;

GRANT TRUNCATE ON public.teacher_subject_dropdown TO authenticated;

GRANT REFERENCES ON public.teacher_subject_dropdown TO authenticated;

GRANT TRIGGER ON public.teacher_subject_dropdown TO authenticated;

GRANT MAINTAIN ON public.teacher_subject_dropdown TO authenticated;

GRANT SELECT ON public.teacher_subject_dropdown TO anon;

GRANT SELECT ON SEQUENCE public.academic_years_id_seq TO authenticated;

GRANT UPDATE ON SEQUENCE public.academic_years_id_seq TO authenticated;

GRANT USAGE ON SEQUENCE public.academic_years_id_seq TO authenticated;

GRANT SELECT ON SEQUENCE public.academic_years_id_seq TO service_role;

GRANT UPDATE ON SEQUENCE public.academic_years_id_seq TO service_role;

GRANT USAGE ON SEQUENCE public.academic_years_id_seq TO service_role;

GRANT SELECT ON SEQUENCE public.academic_years_id_seq TO anon;

GRANT USAGE ON SEQUENCE public.academic_years_id_seq TO anon;

GRANT SELECT ON SEQUENCE public.sections_id_seq TO authenticated;

GRANT UPDATE ON SEQUENCE public.sections_id_seq TO authenticated;

GRANT USAGE ON SEQUENCE public.sections_id_seq TO authenticated;

GRANT SELECT ON SEQUENCE public.sections_id_seq TO service_role;

GRANT UPDATE ON SEQUENCE public.sections_id_seq TO service_role;

GRANT USAGE ON SEQUENCE public.sections_id_seq TO service_role;

GRANT SELECT ON SEQUENCE public.sections_id_seq TO anon;

GRANT USAGE ON SEQUENCE public.sections_id_seq TO anon;

GRANT SELECT ON SEQUENCE public.system_settings_id_seq TO authenticated;

GRANT UPDATE ON SEQUENCE public.system_settings_id_seq TO authenticated;

GRANT USAGE ON SEQUENCE public.system_settings_id_seq TO authenticated;

GRANT SELECT ON SEQUENCE public.system_settings_id_seq TO service_role;

GRANT UPDATE ON SEQUENCE public.system_settings_id_seq TO service_role;

GRANT USAGE ON SEQUENCE public.system_settings_id_seq TO service_role;

GRANT SELECT ON SEQUENCE public.system_settings_id_seq TO anon;

GRANT USAGE ON SEQUENCE public.system_settings_id_seq TO anon;

GRANT SELECT ON SEQUENCE public.sso_links_id_seq TO authenticated;

GRANT UPDATE ON SEQUENCE public.sso_links_id_seq TO authenticated;

GRANT USAGE ON SEQUENCE public.sso_links_id_seq TO authenticated;

GRANT SELECT ON SEQUENCE public.sso_links_id_seq TO service_role;

GRANT UPDATE ON SEQUENCE public.sso_links_id_seq TO service_role;

GRANT USAGE ON SEQUENCE public.sso_links_id_seq TO service_role;

GRANT SELECT ON SEQUENCE public.sso_links_id_seq TO anon;

GRANT USAGE ON SEQUENCE public.sso_links_id_seq TO anon;

GRANT SELECT ON SEQUENCE public.grading_scale_id_seq TO authenticated;

GRANT UPDATE ON SEQUENCE public.grading_scale_id_seq TO authenticated;

GRANT USAGE ON SEQUENCE public.grading_scale_id_seq TO authenticated;

GRANT SELECT ON SEQUENCE public.grading_scale_id_seq TO anon;

GRANT USAGE ON SEQUENCE public.grading_scale_id_seq TO anon;

GRANT SELECT ON SEQUENCE public.course_offerings_id_seq TO authenticated;

GRANT UPDATE ON SEQUENCE public.course_offerings_id_seq TO authenticated;

GRANT USAGE ON SEQUENCE public.course_offerings_id_seq TO authenticated;

GRANT SELECT ON SEQUENCE public.course_offerings_id_seq TO service_role;

GRANT UPDATE ON SEQUENCE public.course_offerings_id_seq TO service_role;

GRANT USAGE ON SEQUENCE public.course_offerings_id_seq TO service_role;

GRANT SELECT ON SEQUENCE public.course_offerings_id_seq TO anon;

GRANT USAGE ON SEQUENCE public.course_offerings_id_seq TO anon;

GRANT SELECT ON SEQUENCE public.misc_fees_id_seq TO authenticated;

GRANT UPDATE ON SEQUENCE public.misc_fees_id_seq TO authenticated;

GRANT USAGE ON SEQUENCE public.misc_fees_id_seq TO authenticated;

GRANT SELECT ON SEQUENCE public.misc_fees_id_seq TO service_role;

GRANT UPDATE ON SEQUENCE public.misc_fees_id_seq TO service_role;

GRANT USAGE ON SEQUENCE public.misc_fees_id_seq TO service_role;

GRANT SELECT ON SEQUENCE public.misc_fees_id_seq TO anon;

GRANT USAGE ON SEQUENCE public.misc_fees_id_seq TO anon;

GRANT SELECT ON SEQUENCE public.rooms_id_seq TO authenticated;

GRANT UPDATE ON SEQUENCE public.rooms_id_seq TO authenticated;

GRANT USAGE ON SEQUENCE public.rooms_id_seq TO authenticated;

GRANT SELECT ON SEQUENCE public.rooms_id_seq TO service_role;

GRANT UPDATE ON SEQUENCE public.rooms_id_seq TO service_role;

GRANT USAGE ON SEQUENCE public.rooms_id_seq TO service_role;

GRANT SELECT ON SEQUENCE public.rooms_id_seq TO anon;

GRANT USAGE ON SEQUENCE public.rooms_id_seq TO anon;

GRANT SELECT ON SEQUENCE public.timetable_id_seq TO authenticated;

GRANT UPDATE ON SEQUENCE public.timetable_id_seq TO authenticated;

GRANT USAGE ON SEQUENCE public.timetable_id_seq TO authenticated;

GRANT SELECT ON SEQUENCE public.timetable_id_seq TO service_role;

GRANT UPDATE ON SEQUENCE public.timetable_id_seq TO service_role;

GRANT USAGE ON SEQUENCE public.timetable_id_seq TO service_role;

GRANT SELECT ON SEQUENCE public.timetable_id_seq TO anon;

GRANT USAGE ON SEQUENCE public.timetable_id_seq TO anon;

GRANT SELECT ON SEQUENCE public.departments_id_seq TO authenticated;

GRANT UPDATE ON SEQUENCE public.departments_id_seq TO authenticated;

GRANT USAGE ON SEQUENCE public.departments_id_seq TO authenticated;

GRANT SELECT ON SEQUENCE public.departments_id_seq TO service_role;

GRANT UPDATE ON SEQUENCE public.departments_id_seq TO service_role;

GRANT USAGE ON SEQUENCE public.departments_id_seq TO service_role;

GRANT SELECT ON SEQUENCE public.departments_id_seq TO anon;

GRANT USAGE ON SEQUENCE public.departments_id_seq TO anon;

GRANT INSERT ON public.v_grade_history TO authenticated;

GRANT SELECT ON public.v_grade_history TO authenticated;

GRANT UPDATE ON public.v_grade_history TO authenticated;

GRANT DELETE ON public.v_grade_history TO authenticated;

GRANT TRUNCATE ON public.v_grade_history TO authenticated;

GRANT REFERENCES ON public.v_grade_history TO authenticated;

GRANT TRIGGER ON public.v_grade_history TO authenticated;

GRANT MAINTAIN ON public.v_grade_history TO authenticated;

GRANT SELECT ON public.v_grade_history TO anon;

GRANT INSERT ON public.grade_history TO authenticated;

GRANT SELECT ON public.grade_history TO authenticated;

GRANT UPDATE ON public.grade_history TO authenticated;

GRANT DELETE ON public.grade_history TO authenticated;

GRANT TRUNCATE ON public.grade_history TO authenticated;

GRANT REFERENCES ON public.grade_history TO authenticated;

GRANT TRIGGER ON public.grade_history TO authenticated;

GRANT MAINTAIN ON public.grade_history TO authenticated;

GRANT SELECT ON public.grade_history TO anon;

GRANT INSERT ON public.instructor_evaluation_summary TO authenticated;

GRANT SELECT ON public.instructor_evaluation_summary TO authenticated;

GRANT UPDATE ON public.instructor_evaluation_summary TO authenticated;

GRANT DELETE ON public.instructor_evaluation_summary TO authenticated;

GRANT TRUNCATE ON public.instructor_evaluation_summary TO authenticated;

GRANT REFERENCES ON public.instructor_evaluation_summary TO authenticated;

GRANT TRIGGER ON public.instructor_evaluation_summary TO authenticated;

GRANT MAINTAIN ON public.instructor_evaluation_summary TO authenticated;

GRANT INSERT ON public.instructor_evaluation_summary TO service_role;

GRANT SELECT ON public.instructor_evaluation_summary TO service_role;

GRANT UPDATE ON public.instructor_evaluation_summary TO service_role;

GRANT DELETE ON public.instructor_evaluation_summary TO service_role;

GRANT TRUNCATE ON public.instructor_evaluation_summary TO service_role;

GRANT REFERENCES ON public.instructor_evaluation_summary TO service_role;

GRANT TRIGGER ON public.instructor_evaluation_summary TO service_role;

GRANT MAINTAIN ON public.instructor_evaluation_summary TO service_role;

GRANT SELECT ON public.instructor_evaluation_summary TO anon;

GRANT INSERT ON public.teacher_subject_students TO authenticated;

GRANT SELECT ON public.teacher_subject_students TO authenticated;

GRANT UPDATE ON public.teacher_subject_students TO authenticated;

GRANT DELETE ON public.teacher_subject_students TO authenticated;

GRANT TRUNCATE ON public.teacher_subject_students TO authenticated;

GRANT REFERENCES ON public.teacher_subject_students TO authenticated;

GRANT TRIGGER ON public.teacher_subject_students TO authenticated;

GRANT MAINTAIN ON public.teacher_subject_students TO authenticated;

GRANT UPDATE (full_name) ON public.profiles TO authenticated;

GRANT UPDATE (avatar_url) ON public.profiles TO authenticated;

GRANT UPDATE (phone) ON public.profiles TO authenticated;

GRANT UPDATE (address) ON public.profiles TO authenticated;

REVOKE ALL ON FUNCTION public.get_subject_instructor_options() FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION public.admin_set_profile_access(p_profile_id uuid, p_role text, p_status text) FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION public.save_course_offering_with_instructor(p_offering_id integer, p_code text, p_title text, p_units numeric, p_program text, p_year integer, p_semester text, p_school_year text, p_schedule text, p_instructor_id uuid) FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION public.initialize_student_clearances(target_student_id uuid) FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION public.calculate_remark(percentage numeric) FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION public.review_enrollment_request(p_request_id uuid, p_decision text, p_review_note text) FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION public.sync_student_term_on_enroll() FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION public.calculate_equivalent(percentage numeric) FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION public.handle_new_sso_user() FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION public.seed_student_demo_data(target_student_id uuid) FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION public.get_user_role() FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION public.auto_create_student_semester() FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION public.is_staff_or_faculty() FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION public.revert_grade(p_history_id uuid, p_reason text) FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION public.get_my_role() FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION public.is_mfa_compliant() FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION public.match_faq_articles(query_embedding vector, match_threshold double precision, match_count integer) FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION public.match_faq_articles(query_embedding vector, match_count integer, match_threshold double precision) FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION public.archive_grade_change() FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION private.review_enrollment_request(p_request_id uuid, p_decision text, p_review_note text) FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION private.cancel_enrollment_request(p_request_id uuid) FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION public.cancel_enrollment_request(p_request_id uuid) FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION public.update_grade_calculations() FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION public.sync_teacher_assignment() FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.get_subject_instructor_options() TO authenticated;

GRANT EXECUTE ON FUNCTION public.admin_set_profile_access(p_profile_id uuid, p_role text, p_status text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

GRANT EXECUTE ON FUNCTION public.save_course_offering_with_instructor(p_offering_id integer, p_code text, p_title text, p_units numeric, p_program text, p_year integer, p_semester text, p_school_year text, p_schedule text, p_instructor_id uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.initialize_student_clearances(target_student_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.calculate_remark(percentage numeric) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.calculate_remark(percentage numeric) TO authenticated;

GRANT EXECUTE ON FUNCTION public.review_enrollment_request(p_request_id uuid, p_decision text, p_review_note text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.calculate_equivalent(percentage numeric) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.calculate_equivalent(percentage numeric) TO authenticated;

GRANT EXECUTE ON FUNCTION public.handle_new_sso_user() TO service_role;

GRANT EXECUTE ON FUNCTION public.seed_student_demo_data(target_student_id uuid) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.seed_student_demo_data(target_student_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.seed_student_demo_data(target_student_id uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_user_role() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_user_role() TO service_role;

GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;

GRANT EXECUTE ON FUNCTION public.is_admin() TO service_role;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

GRANT EXECUTE ON FUNCTION public.is_staff_or_faculty() TO authenticated;

GRANT EXECUTE ON FUNCTION public.revert_grade(p_history_id uuid, p_reason text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;

GRANT EXECUTE ON FUNCTION public.is_mfa_compliant() TO authenticated;

GRANT EXECUTE ON FUNCTION public.is_mfa_compliant() TO service_role;

GRANT EXECUTE ON FUNCTION public.match_faq_articles(query_embedding vector, match_threshold double precision, match_count integer) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.match_faq_articles(query_embedding vector, match_threshold double precision, match_count integer) TO service_role;

GRANT EXECUTE ON FUNCTION public.match_faq_articles(query_embedding vector, match_threshold double precision, match_count integer) TO authenticated;

GRANT EXECUTE ON FUNCTION public.match_faq_articles(query_embedding vector, match_count integer, match_threshold double precision) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.match_faq_articles(query_embedding vector, match_count integer, match_threshold double precision) TO authenticated;

GRANT EXECUTE ON FUNCTION public.match_faq_articles(query_embedding vector, match_count integer, match_threshold double precision) TO service_role;

GRANT EXECUTE ON FUNCTION private.review_enrollment_request(p_request_id uuid, p_decision text, p_review_note text) TO authenticated;

GRANT EXECUTE ON FUNCTION private.cancel_enrollment_request(p_request_id uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.cancel_enrollment_request(p_request_id uuid) TO authenticated;
