BEGIN;
CREATE SCHEMA imcc_review;
-- Schema-only snapshot of myimcc-portal for ycziiezfrwnzouilutum. No production rows.

SET LOCAL check_function_bodies = false;

CREATE SCHEMA IF NOT EXISTS imcc_review_private;




SET LOCAL search_path = imcc_review, extensions, pg_catalog;

DO $$ BEGIN IF to_regclass('imcc_review.profiles') IS NOT NULL THEN RAISE EXCEPTION 'Test baseline requires a fresh database'; END IF; END $$;

CREATE SEQUENCE imcc_review.grading_scale_id_seq AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;

CREATE SEQUENCE imcc_review.course_offerings_id_seq AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;

CREATE SEQUENCE imcc_review.misc_fees_id_seq AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;

CREATE SEQUENCE imcc_review.departments_id_seq AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;

CREATE SEQUENCE imcc_review.academic_years_id_seq AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;

CREATE SEQUENCE imcc_review.sections_id_seq AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;

CREATE SEQUENCE imcc_review.rooms_id_seq AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;

CREATE SEQUENCE imcc_review.timetable_id_seq AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;

CREATE SEQUENCE imcc_review.system_settings_id_seq AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;

CREATE SEQUENCE imcc_review.sso_links_id_seq AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;

CREATE TABLE imcc_review.departments (id integer DEFAULT nextval('departments_id_seq'::regclass) NOT NULL, code text NOT NULL, name text NOT NULL, head_name text, created_at timestamp with time zone DEFAULT now());

CREATE TABLE imcc_review.grading_scale (id integer DEFAULT nextval('grading_scale_id_seq'::regclass) NOT NULL, equivalent numeric(3,2) NOT NULL, percentage_min numeric(5,2) NOT NULL, percentage_max numeric(5,2) NOT NULL, description text NOT NULL, category text NOT NULL, is_passing boolean DEFAULT true);

CREATE TABLE imcc_review.timetable (id integer DEFAULT nextval('timetable_id_seq'::regclass) NOT NULL, offering_id integer, day_of_week text NOT NULL, start_time time without time zone NOT NULL, end_time time without time zone NOT NULL, room_id integer, teacher_id uuid, created_at timestamp with time zone DEFAULT now());

CREATE TABLE imcc_review.attendance (id uuid DEFAULT uuid_generate_v4() NOT NULL, student_id uuid, offering_id integer, timetable_id integer, date date NOT NULL, status text NOT NULL, notes text, marked_by uuid, created_at timestamp with time zone DEFAULT now());

CREATE TABLE imcc_review.messages (id uuid DEFAULT uuid_generate_v4() NOT NULL, sender_id uuid, recipient_id uuid, subject text, body text NOT NULL, is_read boolean DEFAULT false, read_at timestamp with time zone, created_at timestamp with time zone DEFAULT now());

CREATE TABLE imcc_review.class_announcements (id uuid DEFAULT uuid_generate_v4() NOT NULL, author_id uuid, offering_id integer, title text NOT NULL, body text NOT NULL, is_active boolean DEFAULT true, created_at timestamp with time zone DEFAULT now());

CREATE TABLE imcc_review.misc_fees (id integer DEFAULT nextval('misc_fees_id_seq'::regclass) NOT NULL, name text NOT NULL, amount numeric(10,2) NOT NULL, semester text, school_year text, created_at timestamp with time zone DEFAULT now());

CREATE TABLE imcc_review.activities (id uuid DEFAULT uuid_generate_v4() NOT NULL, student_id uuid, description text NOT NULL, color text DEFAULT '#E7338A'::text, created_at timestamp with time zone DEFAULT now());

CREATE TABLE imcc_review.clearances (id uuid DEFAULT uuid_generate_v4() NOT NULL, student_id uuid, department_code text NOT NULL, department_name text NOT NULL, officer_name text, icon text DEFAULT '📄'::text, status text DEFAULT 'pending'::text, note text, cleared_at timestamp with time zone, created_at timestamp with time zone DEFAULT now());

CREATE TABLE imcc_review.enrollments (id uuid DEFAULT uuid_generate_v4() NOT NULL, student_id uuid, offering_id integer, status text DEFAULT 'enrolled'::text, enrolled_at timestamp with time zone DEFAULT now());

CREATE TABLE imcc_review.student_semesters (id uuid DEFAULT uuid_generate_v4() NOT NULL, student_id uuid, school_year text NOT NULL, semester text NOT NULL, is_current boolean DEFAULT false, gwa numeric(5,2), units_enrolled integer DEFAULT 0, subjects_enrolled integer DEFAULT 0, balance numeric(10,2) DEFAULT 0, created_at timestamp with time zone DEFAULT now());

CREATE TABLE imcc_review.appeals (id uuid DEFAULT gen_random_uuid() NOT NULL, student_name text NOT NULL, student_id uuid, appeal_type text DEFAULT 'grade_change'::text, course_code text, reason text NOT NULL, status text DEFAULT 'pending'::text, reviewed_by uuid, reviewed_at timestamp with time zone, created_at timestamp with time zone DEFAULT now(), requested_by uuid);

CREATE TABLE imcc_review.clearance_status (id uuid DEFAULT gen_random_uuid() NOT NULL, student_id uuid, department_id uuid, status text DEFAULT 'Pending'::text, remarks text, updated_at timestamp with time zone DEFAULT now());

CREATE TABLE imcc_review.sections (id integer DEFAULT nextval('sections_id_seq'::regclass) NOT NULL, name text NOT NULL, program text, year_level text, academic_year_id integer, adviser_id uuid, created_at timestamp with time zone DEFAULT now());

CREATE TABLE imcc_review.rooms (id integer DEFAULT nextval('rooms_id_seq'::regclass) NOT NULL, name text NOT NULL, building text, capacity integer, type text DEFAULT 'classroom'::text, created_at timestamp with time zone DEFAULT now());

CREATE TABLE imcc_review.enrollment_items (id uuid DEFAULT gen_random_uuid() NOT NULL, enrollment_id uuid, course_offering_id uuid);

CREATE TABLE imcc_review.clearance_departments (id uuid DEFAULT gen_random_uuid() NOT NULL, code text NOT NULL, name text NOT NULL, icon text);

CREATE TABLE imcc_review.transactions (id uuid DEFAULT uuid_generate_v4() NOT NULL, student_id uuid, or_number text, txn_date timestamp with time zone DEFAULT now(), description text, channel text DEFAULT 'Cashier'::text, amount numeric(10,2) NOT NULL, created_at timestamp with time zone DEFAULT now());

CREATE TABLE imcc_review.deadlines (id uuid DEFAULT uuid_generate_v4() NOT NULL, title text NOT NULL, due_date date NOT NULL, type text DEFAULT 'optional'::text, is_active boolean DEFAULT true, created_at timestamp with time zone DEFAULT now());

CREATE TABLE imcc_review.courses (id uuid DEFAULT gen_random_uuid() NOT NULL, code text NOT NULL, title text NOT NULL, year_level integer NOT NULL, semester integer NOT NULL, lec_units integer DEFAULT 0 NOT NULL, lab_units integer DEFAULT 0 NOT NULL, prerequisites text DEFAULT 'None'::text);

CREATE TABLE imcc_review.students (id uuid DEFAULT gen_random_uuid() NOT NULL, email text NOT NULL, first_name text, last_name text, student_number text, created_at timestamp with time zone DEFAULT now(), role text DEFAULT 'Student'::text, gwa numeric(3,2) DEFAULT 0.00, balance_due numeric(10,2) DEFAULT 0.00, section text DEFAULT 'BSIT 2-A'::text, year_level text DEFAULT '2nd Year'::text);

CREATE TABLE imcc_review.faculty_notes (id uuid DEFAULT gen_random_uuid() NOT NULL, faculty_name text NOT NULL, faculty_id uuid, note_type text DEFAULT 'evaluation'::text, content text NOT NULL, created_by uuid, created_at timestamp with time zone DEFAULT now());

CREATE TABLE imcc_review.accreditation_checklist (id uuid DEFAULT gen_random_uuid() NOT NULL, requirement text NOT NULL, department text, status text DEFAULT 'pending'::text, notes text, evidence_link text, created_by uuid, updated_at timestamp with time zone DEFAULT now(), created_at timestamp with time zone DEFAULT now());

CREATE TABLE imcc_review.department_budgets (id uuid DEFAULT gen_random_uuid() NOT NULL, department text NOT NULL, fiscal_year text NOT NULL, allocated_budget numeric(12,2) DEFAULT 0, amount_spent numeric(12,2) DEFAULT 0, created_by uuid, created_at timestamp with time zone DEFAULT now(), updated_at timestamp with time zone DEFAULT now(), notes text);

CREATE TABLE imcc_review.grant_funding (id uuid DEFAULT gen_random_uuid() NOT NULL, grant_name text NOT NULL, department text NOT NULL, amount numeric(12,2) DEFAULT 0, status text DEFAULT 'pending'::text, funding_source text, created_by uuid, created_at timestamp with time zone DEFAULT now(), updated_at timestamp with time zone DEFAULT now(), notes text);

CREATE TABLE imcc_review.course_offerings (id integer DEFAULT nextval('course_offerings_id_seq'::regclass) NOT NULL, code text NOT NULL, title text NOT NULL, units numeric(4,1) DEFAULT 3.0 NOT NULL, fee numeric(10,2) DEFAULT 0 NOT NULL, instructor_name text, schedule text, program text, year integer, semester text, school_year text NOT NULL, is_major boolean DEFAULT false, prerequisites text, created_at timestamp with time zone DEFAULT now(), instructor_id uuid);

CREATE TABLE imcc_review.faq_articles (id uuid DEFAULT uuid_generate_v4() NOT NULL, category text NOT NULL, question text NOT NULL, answer text NOT NULL, keywords text, is_active boolean DEFAULT true, created_at timestamp with time zone DEFAULT now(), embedding vector(384));

CREATE TABLE imcc_review.announcements (id uuid DEFAULT uuid_generate_v4() NOT NULL, content text NOT NULL, deadline date, is_active boolean DEFAULT true, created_at timestamp with time zone DEFAULT now());

CREATE TABLE imcc_review.academic_years (id integer DEFAULT nextval('academic_years_id_seq'::regclass) NOT NULL, label text NOT NULL, start_date date, end_date date, is_active boolean DEFAULT false, created_at timestamp with time zone DEFAULT now());

CREATE TABLE imcc_review.sso_links (id integer DEFAULT nextval('sso_links_id_seq'::regclass) NOT NULL, label text NOT NULL, url text NOT NULL, icon text DEFAULT '🔗'::text, sort_order integer DEFAULT 0, is_active boolean DEFAULT true, roles text DEFAULT 'student,faculty'::text, created_at timestamp with time zone DEFAULT now());

CREATE TABLE imcc_review.profiles (id uuid NOT NULL, email text NOT NULL, full_name text NOT NULL, student_no text, program text, year_level text, section text, role text DEFAULT 'student'::text NOT NULL, created_at timestamp with time zone DEFAULT now(), updated_at timestamp with time zone DEFAULT now(), is_active boolean DEFAULT true, deactivated_at timestamp with time zone, avatar_url text, phone text, address text, requested_role text, status text DEFAULT 'onboarding'::text NOT NULL, id_number text);

CREATE TABLE imcc_review.user_mfa (id uuid DEFAULT gen_random_uuid() NOT NULL, email text NOT NULL, mfa_secret text NOT NULL, is_verified boolean DEFAULT false, created_at timestamp with time zone DEFAULT now());

CREATE TABLE imcc_review.faculty_evaluations (id uuid DEFAULT gen_random_uuid() NOT NULL, student_id uuid NOT NULL, instructor_name text NOT NULL, school_year text DEFAULT '2025–2026'::text NOT NULL, semester text DEFAULT '2nd Semester'::text NOT NULL, teaching_clarity integer NOT NULL, knowledge integer NOT NULL, availability integer NOT NULL, fairness integer NOT NULL, punctuality integer NOT NULL, comment text, created_at timestamp with time zone DEFAULT now() NOT NULL, instructor_id uuid NOT NULL);

CREATE TABLE imcc_review.grades (id uuid DEFAULT uuid_generate_v4() NOT NULL, student_id uuid, offering_id integer, midterm numeric(5,2), final numeric(5,2), equivalent numeric(5,2), ai_predicted_grade numeric(5,2), ai_predicted_equivalent numeric(5,2), remark text DEFAULT 'Pending'::text, created_at timestamp with time zone DEFAULT now(), prelim numeric(5,2), semifinal numeric(5,2), graded_by uuid, graded_at timestamp with time zone);

CREATE TABLE imcc_review.installments (id uuid DEFAULT uuid_generate_v4() NOT NULL, student_id uuid, name text NOT NULL, amount numeric(10,2) NOT NULL, due_date date NOT NULL, status text DEFAULT 'pending'::text, paid_at timestamp with time zone, or_number text, created_at timestamp with time zone DEFAULT now());

CREATE TABLE imcc_review.billing_summary (student_id uuid NOT NULL, total_paid numeric(10,2) DEFAULT 0, balance numeric(10,2) DEFAULT 0, updated_at timestamp with time zone DEFAULT now());

CREATE TABLE imcc_review.teacher_assignments (id uuid DEFAULT gen_random_uuid() NOT NULL, teacher_id uuid, offering_id integer, assigned_by uuid, assigned_at timestamp with time zone DEFAULT now(), is_active boolean DEFAULT true, academic_year text DEFAULT '2026-2027'::text, semester text DEFAULT '1st Semester'::text, updated_at timestamp with time zone DEFAULT now());

CREATE TABLE imcc_review.system_settings (id integer DEFAULT nextval('system_settings_id_seq'::regclass) NOT NULL, key text NOT NULL, value text NOT NULL, category text DEFAULT 'general'::text, description text, updated_by uuid, updated_at timestamp with time zone DEFAULT now());

CREATE TABLE imcc_review.chat_logs (id uuid DEFAULT uuid_generate_v4() NOT NULL, user_id uuid, user_message text NOT NULL, bot_response text NOT NULL, sources jsonb, created_at timestamp with time zone DEFAULT now());

CREATE TABLE imcc_review.grade_history (id uuid DEFAULT uuid_generate_v4() NOT NULL, grade_id uuid, student_id uuid, offering_id integer, prelim numeric, midterm numeric, semifinal numeric, final numeric, equivalent numeric, remark text, changed_by uuid, change_type text DEFAULT 'update'::text, reason text, created_at timestamp with time zone DEFAULT now());

ALTER TABLE imcc_review.departments ADD CONSTRAINT departments_code_key UNIQUE (code);

ALTER TABLE imcc_review.departments ADD CONSTRAINT departments_pkey PRIMARY KEY (id);

ALTER TABLE imcc_review.grading_scale ADD CONSTRAINT grading_scale_equivalent_key UNIQUE (equivalent);

ALTER TABLE imcc_review.grading_scale ADD CONSTRAINT grading_scale_pkey PRIMARY KEY (id);

ALTER TABLE imcc_review.timetable ADD CONSTRAINT timetable_day_of_week_check CHECK ((day_of_week = ANY (ARRAY['Mon'::text, 'Tue'::text, 'Wed'::text, 'Thu'::text, 'Fri'::text, 'Sat'::text, 'Sun'::text])));

ALTER TABLE imcc_review.timetable ADD CONSTRAINT timetable_offering_id_day_of_week_start_time_key UNIQUE (offering_id, day_of_week, start_time);

ALTER TABLE imcc_review.timetable ADD CONSTRAINT timetable_pkey PRIMARY KEY (id);

ALTER TABLE imcc_review.attendance ADD CONSTRAINT attendance_pkey PRIMARY KEY (id);

ALTER TABLE imcc_review.attendance ADD CONSTRAINT attendance_status_check CHECK ((status = ANY (ARRAY['present'::text, 'absent'::text, 'late'::text, 'excused'::text])));

ALTER TABLE imcc_review.attendance ADD CONSTRAINT attendance_student_id_offering_id_date_key UNIQUE (student_id, offering_id, date);

ALTER TABLE imcc_review.messages ADD CONSTRAINT messages_pkey PRIMARY KEY (id);

ALTER TABLE imcc_review.class_announcements ADD CONSTRAINT class_announcements_pkey PRIMARY KEY (id);

ALTER TABLE imcc_review.misc_fees ADD CONSTRAINT misc_fees_pkey PRIMARY KEY (id);

ALTER TABLE imcc_review.activities ADD CONSTRAINT activities_pkey PRIMARY KEY (id);

ALTER TABLE imcc_review.clearances ADD CONSTRAINT clearances_pkey PRIMARY KEY (id);

ALTER TABLE imcc_review.clearances ADD CONSTRAINT clearances_status_check CHECK ((status = ANY (ARRAY['cleared'::text, 'pending'::text, 'action_required'::text])));

ALTER TABLE imcc_review.clearances ADD CONSTRAINT clearances_student_id_department_code_key UNIQUE (student_id, department_code);

ALTER TABLE imcc_review.enrollments ADD CONSTRAINT enrollments_pkey PRIMARY KEY (id);

ALTER TABLE imcc_review.enrollments ADD CONSTRAINT enrollments_status_check CHECK ((status = ANY (ARRAY['enrolled'::text, 'dropped'::text, 'completed'::text])));

ALTER TABLE imcc_review.enrollments ADD CONSTRAINT enrollments_student_id_offering_id_key UNIQUE (student_id, offering_id);

ALTER TABLE imcc_review.student_semesters ADD CONSTRAINT student_semesters_pkey PRIMARY KEY (id);

ALTER TABLE imcc_review.student_semesters ADD CONSTRAINT student_semesters_student_id_school_year_semester_key UNIQUE (student_id, school_year, semester);

ALTER TABLE imcc_review.appeals ADD CONSTRAINT appeals_appeal_type_check CHECK ((appeal_type = ANY (ARRAY['grade_change'::text, 'prerequisite_waiver'::text, 'credit_transfer'::text])));

ALTER TABLE imcc_review.appeals ADD CONSTRAINT appeals_pkey PRIMARY KEY (id);

ALTER TABLE imcc_review.appeals ADD CONSTRAINT appeals_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));

ALTER TABLE imcc_review.clearance_status ADD CONSTRAINT clearance_status_pkey PRIMARY KEY (id);

ALTER TABLE imcc_review.sections ADD CONSTRAINT sections_pkey PRIMARY KEY (id);

ALTER TABLE imcc_review.rooms ADD CONSTRAINT rooms_pkey PRIMARY KEY (id);

ALTER TABLE imcc_review.rooms ADD CONSTRAINT rooms_type_check CHECK ((type = ANY (ARRAY['classroom'::text, 'lab'::text, 'auditorium'::text, 'office'::text, 'other'::text])));

ALTER TABLE imcc_review.enrollment_items ADD CONSTRAINT enrollment_items_pkey PRIMARY KEY (id);

ALTER TABLE imcc_review.clearance_departments ADD CONSTRAINT clearance_departments_code_key UNIQUE (code);

ALTER TABLE imcc_review.clearance_departments ADD CONSTRAINT clearance_departments_pkey PRIMARY KEY (id);

ALTER TABLE imcc_review.transactions ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);

ALTER TABLE imcc_review.deadlines ADD CONSTRAINT deadlines_pkey PRIMARY KEY (id);

ALTER TABLE imcc_review.deadlines ADD CONSTRAINT deadlines_type_check CHECK ((type = ANY (ARRAY['urgent'::text, 'schedule'::text, 'optional'::text])));

ALTER TABLE imcc_review.courses ADD CONSTRAINT courses_code_key UNIQUE (code);

ALTER TABLE imcc_review.courses ADD CONSTRAINT courses_pkey PRIMARY KEY (id);

ALTER TABLE imcc_review.students ADD CONSTRAINT students_email_key UNIQUE (email);

ALTER TABLE imcc_review.students ADD CONSTRAINT students_pkey PRIMARY KEY (id);

ALTER TABLE imcc_review.students ADD CONSTRAINT students_student_number_key UNIQUE (student_number);

ALTER TABLE imcc_review.faculty_notes ADD CONSTRAINT faculty_notes_note_type_check CHECK ((note_type = ANY (ARRAY['evaluation'::text, 'publication'::text, 'tenure'::text])));

ALTER TABLE imcc_review.faculty_notes ADD CONSTRAINT faculty_notes_pkey PRIMARY KEY (id);

ALTER TABLE imcc_review.accreditation_checklist ADD CONSTRAINT accreditation_checklist_pkey PRIMARY KEY (id);

ALTER TABLE imcc_review.accreditation_checklist ADD CONSTRAINT accreditation_checklist_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'compliant'::text, 'at_risk'::text])));

ALTER TABLE imcc_review.department_budgets ADD CONSTRAINT department_budgets_pkey PRIMARY KEY (id);

ALTER TABLE imcc_review.grant_funding ADD CONSTRAINT grant_funding_pkey PRIMARY KEY (id);

ALTER TABLE imcc_review.grant_funding ADD CONSTRAINT grant_funding_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'closed'::text, 'rejected'::text])));

ALTER TABLE imcc_review.course_offerings ADD CONSTRAINT course_offerings_pkey PRIMARY KEY (id);

ALTER TABLE imcc_review.faq_articles ADD CONSTRAINT faq_articles_pkey PRIMARY KEY (id);

ALTER TABLE imcc_review.announcements ADD CONSTRAINT announcements_pkey PRIMARY KEY (id);

ALTER TABLE imcc_review.academic_years ADD CONSTRAINT academic_years_pkey PRIMARY KEY (id);

ALTER TABLE imcc_review.sso_links ADD CONSTRAINT sso_links_pkey PRIMARY KEY (id);

ALTER TABLE imcc_review.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

ALTER TABLE imcc_review.profiles ADD CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['student'::text, 'faculty'::text, 'teacher'::text, 'staff'::text, 'admin'::text, 'dean'::text])));

ALTER TABLE imcc_review.profiles ADD CONSTRAINT profiles_student_no_key UNIQUE (student_no);

ALTER TABLE imcc_review.user_mfa ADD CONSTRAINT user_mfa_email_key UNIQUE (email);

ALTER TABLE imcc_review.user_mfa ADD CONSTRAINT user_mfa_pkey PRIMARY KEY (id);

ALTER TABLE imcc_review.faculty_evaluations ADD CONSTRAINT faculty_evaluations_availability_check CHECK (((availability >= 1) AND (availability <= 5)));

ALTER TABLE imcc_review.faculty_evaluations ADD CONSTRAINT faculty_evaluations_fairness_check CHECK (((fairness >= 1) AND (fairness <= 5)));

ALTER TABLE imcc_review.faculty_evaluations ADD CONSTRAINT faculty_evaluations_knowledge_check CHECK (((knowledge >= 1) AND (knowledge <= 5)));

ALTER TABLE imcc_review.faculty_evaluations ADD CONSTRAINT faculty_evaluations_pkey PRIMARY KEY (id);

ALTER TABLE imcc_review.faculty_evaluations ADD CONSTRAINT faculty_evaluations_punctuality_check CHECK (((punctuality >= 1) AND (punctuality <= 5)));

ALTER TABLE imcc_review.faculty_evaluations ADD CONSTRAINT faculty_evaluations_student_instructor_term_key UNIQUE (student_id, instructor_id, school_year, semester);

ALTER TABLE imcc_review.faculty_evaluations ADD CONSTRAINT faculty_evaluations_teaching_clarity_check CHECK (((teaching_clarity >= 1) AND (teaching_clarity <= 5)));

ALTER TABLE imcc_review.grades ADD CONSTRAINT grades_pkey PRIMARY KEY (id);

ALTER TABLE imcc_review.grades ADD CONSTRAINT grades_remark_check CHECK ((remark = ANY (ARRAY['Passed'::text, 'Failed'::text, 'Pending'::text, 'Dropped'::text])));

ALTER TABLE imcc_review.grades ADD CONSTRAINT grades_student_id_offering_id_key UNIQUE (student_id, offering_id);

ALTER TABLE imcc_review.installments ADD CONSTRAINT installments_pkey PRIMARY KEY (id);

ALTER TABLE imcc_review.installments ADD CONSTRAINT installments_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text])));

ALTER TABLE imcc_review.billing_summary ADD CONSTRAINT billing_summary_pkey PRIMARY KEY (student_id);

ALTER TABLE imcc_review.teacher_assignments ADD CONSTRAINT teacher_assignments_pkey PRIMARY KEY (id);

ALTER TABLE imcc_review.teacher_assignments ADD CONSTRAINT teacher_assignments_teacher_id_offering_id_academic_year_se_key UNIQUE (teacher_id, offering_id, academic_year, semester);

ALTER TABLE imcc_review.system_settings ADD CONSTRAINT system_settings_key_key UNIQUE (key);

ALTER TABLE imcc_review.system_settings ADD CONSTRAINT system_settings_pkey PRIMARY KEY (id);

ALTER TABLE imcc_review.chat_logs ADD CONSTRAINT chat_logs_pkey PRIMARY KEY (id);

ALTER TABLE imcc_review.grade_history ADD CONSTRAINT grade_history_pkey PRIMARY KEY (id);

ALTER TABLE imcc_review.timetable ADD CONSTRAINT timetable_offering_id_fkey FOREIGN KEY (offering_id) REFERENCES course_offerings(id) ON DELETE CASCADE;

ALTER TABLE imcc_review.timetable ADD CONSTRAINT timetable_room_id_fkey FOREIGN KEY (room_id) REFERENCES rooms(id);

ALTER TABLE imcc_review.timetable ADD CONSTRAINT timetable_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES profiles(id);

ALTER TABLE imcc_review.attendance ADD CONSTRAINT attendance_marked_by_fkey FOREIGN KEY (marked_by) REFERENCES profiles(id);

ALTER TABLE imcc_review.attendance ADD CONSTRAINT attendance_offering_id_fkey FOREIGN KEY (offering_id) REFERENCES course_offerings(id) ON DELETE CASCADE;

ALTER TABLE imcc_review.attendance ADD CONSTRAINT attendance_student_id_fkey FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE imcc_review.attendance ADD CONSTRAINT attendance_timetable_id_fkey FOREIGN KEY (timetable_id) REFERENCES timetable(id) ON DELETE SET NULL;

ALTER TABLE imcc_review.messages ADD CONSTRAINT messages_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE imcc_review.messages ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE imcc_review.class_announcements ADD CONSTRAINT class_announcements_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE imcc_review.class_announcements ADD CONSTRAINT class_announcements_offering_id_fkey FOREIGN KEY (offering_id) REFERENCES course_offerings(id) ON DELETE CASCADE;

ALTER TABLE imcc_review.activities ADD CONSTRAINT activities_student_id_fkey FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE imcc_review.clearances ADD CONSTRAINT clearances_student_id_fkey FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE imcc_review.enrollments ADD CONSTRAINT enrollments_offering_id_fkey FOREIGN KEY (offering_id) REFERENCES course_offerings(id) ON DELETE CASCADE;

ALTER TABLE imcc_review.enrollments ADD CONSTRAINT enrollments_student_id_fkey FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE imcc_review.student_semesters ADD CONSTRAINT student_semesters_student_id_fkey FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE imcc_review.appeals ADD CONSTRAINT appeals_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE imcc_review.appeals ADD CONSTRAINT appeals_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES profiles(id);

ALTER TABLE imcc_review.appeals ADD CONSTRAINT appeals_student_id_fkey FOREIGN KEY (student_id) REFERENCES profiles(id);

ALTER TABLE imcc_review.clearance_status ADD CONSTRAINT clearance_status_department_id_fkey FOREIGN KEY (department_id) REFERENCES clearance_departments(id) ON DELETE CASCADE;

ALTER TABLE imcc_review.clearance_status ADD CONSTRAINT clearance_status_student_id_fkey FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE imcc_review.sections ADD CONSTRAINT sections_academic_year_id_fkey FOREIGN KEY (academic_year_id) REFERENCES academic_years(id);

ALTER TABLE imcc_review.sections ADD CONSTRAINT sections_adviser_id_fkey FOREIGN KEY (adviser_id) REFERENCES profiles(id);

ALTER TABLE imcc_review.transactions ADD CONSTRAINT transactions_student_id_fkey FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE imcc_review.faculty_notes ADD CONSTRAINT faculty_notes_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);

ALTER TABLE imcc_review.faculty_notes ADD CONSTRAINT faculty_notes_faculty_id_fkey FOREIGN KEY (faculty_id) REFERENCES profiles(id);

ALTER TABLE imcc_review.accreditation_checklist ADD CONSTRAINT accreditation_checklist_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);

ALTER TABLE imcc_review.department_budgets ADD CONSTRAINT department_budgets_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);

ALTER TABLE imcc_review.grant_funding ADD CONSTRAINT grant_funding_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);

ALTER TABLE imcc_review.course_offerings ADD CONSTRAINT course_offerings_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE imcc_review.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE imcc_review.faculty_evaluations ADD CONSTRAINT faculty_evaluations_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES profiles(id);

ALTER TABLE imcc_review.faculty_evaluations ADD CONSTRAINT faculty_evaluations_student_id_fkey FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE imcc_review.grades ADD CONSTRAINT grades_graded_by_fkey FOREIGN KEY (graded_by) REFERENCES profiles(id);

ALTER TABLE imcc_review.grades ADD CONSTRAINT grades_offering_id_fkey FOREIGN KEY (offering_id) REFERENCES course_offerings(id) ON DELETE CASCADE;

ALTER TABLE imcc_review.grades ADD CONSTRAINT grades_student_id_fkey FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE imcc_review.installments ADD CONSTRAINT installments_student_id_fkey FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE imcc_review.billing_summary ADD CONSTRAINT billing_summary_student_id_fkey FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE imcc_review.teacher_assignments ADD CONSTRAINT teacher_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES profiles(id);

ALTER TABLE imcc_review.teacher_assignments ADD CONSTRAINT teacher_assignments_offering_id_fkey FOREIGN KEY (offering_id) REFERENCES course_offerings(id) ON DELETE CASCADE;

ALTER TABLE imcc_review.teacher_assignments ADD CONSTRAINT teacher_assignments_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE imcc_review.system_settings ADD CONSTRAINT system_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES profiles(id);

ALTER TABLE imcc_review.chat_logs ADD CONSTRAINT chat_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE imcc_review.grade_history ADD CONSTRAINT grade_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE imcc_review.grade_history ADD CONSTRAINT grade_history_grade_id_fkey FOREIGN KEY (grade_id) REFERENCES grades(id) ON DELETE CASCADE;

ALTER TABLE imcc_review.grade_history ADD CONSTRAINT grade_history_offering_id_fkey FOREIGN KEY (offering_id) REFERENCES course_offerings(id) ON DELETE CASCADE;

ALTER TABLE imcc_review.grade_history ADD CONSTRAINT grade_history_student_id_fkey FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION imcc_review.get_subject_instructor_options()
 RETURNS TABLE(id uuid, full_name text, role text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'imcc_review', 'pg_catalog'
AS $function$
DECLARE
  v_caller_role TEXT;
  v_caller_status TEXT;
  v_caller_active BOOLEAN;
BEGIN
  -- Verify caller is authenticated and is an approved, active dean
  SELECT p.role, p.status, COALESCE(p.is_active, true)
  INTO v_caller_role, v_caller_status, v_caller_active
  FROM imcc_review.profiles p
  WHERE p.id = auth.uid();

  IF v_caller_role != 'dean' OR v_caller_status != 'approved' OR NOT v_caller_active THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.id, p.full_name, p.role
  FROM imcc_review.profiles p
  WHERE p.role IN ('teacher', 'faculty')
    AND p.status = 'approved'
    AND COALESCE(p.is_active, true) = true
  ORDER BY p.full_name ASC;
END;
$function$
;

CREATE OR REPLACE FUNCTION imcc_review.admin_set_profile_access(p_profile_id uuid, p_role text DEFAULT NULL::text, p_status text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT imcc_review.is_admin() THEN
    RAISE EXCEPTION 'Approved admin access required' USING ERRCODE = '42501';
  END IF;

  IF p_role IS NULL AND p_status IS NULL THEN
    RAISE EXCEPTION 'Provide a role or status to update' USING ERRCODE = '22023';
  END IF;

  UPDATE imcc_review.profiles AS target
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

CREATE OR REPLACE FUNCTION imcc_review.handle_new_user()
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

  INSERT INTO imcc_review.profiles (id, email, full_name, status, role, program)
  VALUES (NEW.id, NEW.email, v_name, 'onboarding', 'student', 'BSIT')
  ON CONFLICT (id) DO UPDATE
  SET program = COALESCE(imcc_review.profiles.program, 'BSIT'),
      full_name = COALESCE(imcc_review.profiles.full_name, EXCLUDED.full_name);

  PERFORM imcc_review.initialize_student_clearances(NEW.id);
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION imcc_review.rls_auto_enable()
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
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('imcc_review') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
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

CREATE OR REPLACE FUNCTION imcc_review.save_course_offering_with_instructor(p_offering_id integer DEFAULT NULL::integer, p_code text DEFAULT NULL::text, p_title text DEFAULT NULL::text, p_units numeric DEFAULT 3.0, p_program text DEFAULT NULL::text, p_year integer DEFAULT 1, p_semester text DEFAULT NULL::text, p_school_year text DEFAULT NULL::text, p_schedule text DEFAULT NULL::text, p_instructor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'imcc_review', 'pg_catalog'
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
  FROM imcc_review.profiles p
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
  FROM imcc_review.profiles p
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
    INSERT INTO imcc_review.course_offerings (
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
    IF NOT EXISTS (SELECT 1 FROM imcc_review.course_offerings WHERE id = p_offering_id) THEN
      RAISE EXCEPTION 'Course offering % not found', p_offering_id;
    END IF;

    UPDATE imcc_review.course_offerings
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
    UPDATE imcc_review.teacher_assignments
    SET is_active = false
    WHERE offering_id = v_offering_id;
  END IF;

  -- 5. Upsert active assignment in teacher_assignments
  INSERT INTO imcc_review.teacher_assignments (
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
  FROM imcc_review.course_offerings co
  WHERE co.id = v_offering_id;

  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION imcc_review.initialize_student_clearances(target_student_id uuid DEFAULT NULL::uuid)
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
  INSERT INTO imcc_review.clearances (student_id, department_code, department_name, icon, status)
  SELECT target_student_id, cd.code, cd.name, cd.icon, 'pending'
  FROM imcc_review.clearance_departments cd
  ON CONFLICT (student_id, department_code) DO NOTHING;
END;
$function$
;

CREATE OR REPLACE FUNCTION imcc_review.calculate_remark(percentage numeric)
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

CREATE OR REPLACE FUNCTION imcc_review.review_enrollment_request(p_request_id uuid, p_decision text, p_review_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  SELECT imcc_review_private.review_enrollment_request($1, $2, $3);
$function$
;

CREATE OR REPLACE FUNCTION imcc_review.sync_student_term_on_enroll()
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
    SELECT 1 FROM imcc_review.profiles AS p
    WHERE p.id = NEW.student_id AND p.role = 'student'
  ) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO off
  FROM imcc_review.course_offerings
  WHERE id = NEW.offering_id;
  IF off IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)::int, COALESCE(SUM(co.units), 0)
  INTO subj_count, total_units
  FROM imcc_review.enrollments AS e
  JOIN imcc_review.course_offerings AS co ON co.id = e.offering_id
  WHERE e.student_id = NEW.student_id
    AND e.status = 'enrolled';

  UPDATE imcc_review.student_semesters
  SET is_current = false
  WHERE student_id = NEW.student_id;

  INSERT INTO imcc_review.student_semesters (
    student_id, school_year, semester, is_current, units_enrolled, subjects_enrolled
  ) VALUES (
    NEW.student_id, off.school_year, off.semester, true, total_units, subj_count
  )
  ON CONFLICT (student_id, school_year, semester)
  DO UPDATE SET
    is_current = true,
    units_enrolled = EXCLUDED.units_enrolled,
    subjects_enrolled = EXCLUDED.subjects_enrolled;

  PERFORM imcc_review.initialize_student_clearances(NEW.student_id);
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION imcc_review.calculate_equivalent(percentage numeric)
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

CREATE OR REPLACE FUNCTION imcc_review.handle_new_sso_user()
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

  INSERT INTO imcc_review.students (email, first_name, last_name, role)
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

CREATE OR REPLACE FUNCTION imcc_review.seed_student_demo_data(target_student_id uuid)
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
  SELECT id INTO v_sa101  FROM imcc_review.course_offerings WHERE code = 'SA 101' LIMIT 1;
  SELECT id INTO v_ias102 FROM imcc_review.course_offerings WHERE code = 'IAS 102' LIMIT 1;
  SELECT id INTO v_cap102 FROM imcc_review.course_offerings WHERE code = 'CAP 102' LIMIT 1;
  SELECT id INTO v_sia102 FROM imcc_review.course_offerings WHERE code = 'SIA 102' LIMIT 1;

  UPDATE imcc_review.profiles
  SET
    student_no = '2023-00189',
    year_level = '4th Year',
    program    = 'BSIT',
    section    = 'BSIT-4A'
  WHERE id = target_student_id;

  DELETE FROM imcc_review.student_semesters WHERE student_id = target_student_id;
  INSERT INTO imcc_review.student_semesters (student_id, school_year, semester, is_current, gwa, units_enrolled, subjects_enrolled, balance)
  VALUES (target_student_id, '2026-2027', '1st Semester', true, 1.25, 12, 4, 6500.00);

  DELETE FROM imcc_review.enrollments WHERE student_id = target_student_id;
  IF v_sa101  IS NOT NULL THEN INSERT INTO imcc_review.enrollments (student_id, offering_id, status) VALUES (target_student_id, v_sa101, 'enrolled'); END IF;
  IF v_ias102 IS NOT NULL THEN INSERT INTO imcc_review.enrollments (student_id, offering_id, status) VALUES (target_student_id, v_ias102, 'enrolled'); END IF;
  IF v_cap102 IS NOT NULL THEN INSERT INTO imcc_review.enrollments (student_id, offering_id, status) VALUES (target_student_id, v_cap102, 'enrolled'); END IF;
  IF v_sia102 IS NOT NULL THEN INSERT INTO imcc_review.enrollments (student_id, offering_id, status) VALUES (target_student_id, v_sia102, 'enrolled'); END IF;

  DELETE FROM imcc_review.grades WHERE student_id = target_student_id;
  IF v_sa101 IS NOT NULL THEN
    INSERT INTO imcc_review.grades (student_id, offering_id, midterm, final, equivalent, ai_predicted_grade, ai_predicted_equivalent, remark)
    VALUES (target_student_id, v_sa101, 91.00, NULL, 1.50, '92.50', 1.25, 'Passed');
  END IF;
  IF v_ias102 IS NOT NULL THEN
    INSERT INTO imcc_review.grades (student_id, offering_id, midterm, final, equivalent, ai_predicted_grade, ai_predicted_equivalent, remark)
    VALUES (target_student_id, v_ias102, 94.00, NULL, 1.25, '95.00', 1.00, 'Passed');
  END IF;
  IF v_cap102 IS NOT NULL THEN
    INSERT INTO imcc_review.grades (student_id, offering_id, midterm, final, equivalent, ai_predicted_grade, ai_predicted_equivalent, remark)
    VALUES (target_student_id, v_cap102, 89.00, NULL, 1.75, '91.00', 1.50, 'Passed');
  END IF;
  IF v_sia102 IS NOT NULL THEN
    INSERT INTO imcc_review.grades (student_id, offering_id, midterm, final, equivalent, ai_predicted_grade, ai_predicted_equivalent, remark)
    VALUES (target_student_id, v_sia102, 93.00, NULL, 1.25, '94.00', 1.25, 'Passed');
  END IF;

  DELETE FROM imcc_review.clearances WHERE student_id = target_student_id;
  INSERT INTO imcc_review.clearances (student_id, department_code, department_name, officer_name, status, note, icon) VALUES
  (target_student_id, 'cashier',  'Cashier / Finance',  'Ms. Maria Clara',      'action_required', 'Pending balance of P6,500.00',              '💳'),
  (target_student_id, 'library',  'University Library', 'Mr. Jose Rizal',       'cleared',         'No pending library holds',                  '📚'),
  (target_student_id, 'dean',     'College Dean',       'Dr. Santiago Alvarez', 'cleared',         'Capstone 1 pre-requisite verified',         '🎓'),
  (target_student_id, 'guidance', 'Guidance Office',    'Ms. Leonor Rivera',    'cleared',         '4th Year status verified',                  '💬');

  DELETE FROM imcc_review.activities WHERE student_id = target_student_id;
  INSERT INTO imcc_review.activities (student_id, description, color) VALUES
  (target_student_id, 'Enrolled in 4th Year 1st Semester subjects (12 units)', '#E7338A'),
  (target_student_id, 'Capstone 2 enrollment verified (Pre-requisite CAP 101 cleared)', '#10B981');
END;
$function$
;

CREATE OR REPLACE FUNCTION imcc_review.get_user_role()
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT role FROM imcc_review.profiles WHERE id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION imcc_review.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM imcc_review.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.role = 'admin'
      AND p.status = 'approved'
      AND p.is_active IS TRUE
  );
$function$
;

CREATE OR REPLACE FUNCTION imcc_review.auto_create_student_semester()
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
    FROM imcc_review.academic_years
    WHERE is_active = true
    LIMIT 1;

    active_year := COALESCE(active_year, '2026-2027');
    active_sem  := '1st Semester';

    INSERT INTO imcc_review.student_semesters (student_id, school_year, semester, is_current)
    VALUES (NEW.id, active_year, active_sem, true)
    ON CONFLICT (student_id, school_year, semester) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION imcc_review.is_staff_or_faculty()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM imcc_review.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.role = ANY (ARRAY['dean', 'teacher', 'faculty', 'admin', 'staff', 'registrar'])
      AND p.status = 'approved'
      AND p.is_active IS TRUE
  );
$function$
;

CREATE OR REPLACE FUNCTION imcc_review.revert_grade(p_history_id uuid, p_reason text DEFAULT 'Reverted to previous version'::text)
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
  FROM imcc_review.profiles p
  WHERE p.id = v_user_id
    AND p.status = 'approved'
    AND p.is_active IS TRUE;

  IF NOT FOUND OR v_user_role NOT IN ('teacher', 'faculty', 'dean', 'admin') THEN
    RAISE EXCEPTION 'Approved faculty access required' USING ERRCODE = '42501';
  END IF;

  SELECT h.* INTO v_hist
  FROM imcc_review.grade_history h
  WHERE h.id = p_history_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Grade history record not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_user_role <> 'admin' AND NOT EXISTS (
    SELECT 1 FROM imcc_review.teacher_assignments ta
    WHERE ta.teacher_id = v_user_id
      AND ta.offering_id = v_hist.offering_id
      AND ta.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'Active assignment required for this course offering' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM imcc_review.enrollments e
    WHERE e.student_id = v_hist.student_id
      AND e.offering_id = v_hist.offering_id
  ) THEN
    RAISE EXCEPTION 'Matching enrollment required to revert this grade' USING ERRCODE = '42501';
  END IF;

  SELECT g.* INTO v_grade
  FROM imcc_review.grades g
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

  UPDATE imcc_review.grades g
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

CREATE OR REPLACE FUNCTION imcc_review.get_my_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT role FROM imcc_review.profiles WHERE id = (SELECT auth.uid());
$function$
;

CREATE OR REPLACE FUNCTION imcc_review.is_mfa_compliant()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'imcc_review', 'auth', 'pg_temp'
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

CREATE OR REPLACE FUNCTION imcc_review.match_faq_articles(query_embedding vector, match_threshold double precision, match_count integer)
 RETURNS TABLE(id uuid, category text, question text, answer text, keywords text, similarity double precision)
 LANGUAGE sql
 STABLE
 SET search_path TO 'imcc_review', 'pg_temp'
AS $function$
  SELECT
    f.id,
    f.category,
    f.question,
    f.answer,
    f.keywords,
    1 - (f.embedding <=> query_embedding) AS similarity
  FROM imcc_review.faq_articles f
  WHERE f.is_active = true
    AND f.embedding IS NOT NULL
    AND 1 - (f.embedding <=> query_embedding) > match_threshold
  ORDER BY f.embedding <=> query_embedding
  LIMIT match_count;
$function$
;

CREATE OR REPLACE FUNCTION imcc_review.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION imcc_review.match_faq_articles(query_embedding vector, match_count integer DEFAULT 5, match_threshold double precision DEFAULT 0.5)
 RETURNS TABLE(id uuid, category text, question text, answer text, keywords text, similarity double precision)
 LANGUAGE sql
 STABLE
 SET search_path TO 'imcc_review', 'pg_temp'
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

CREATE OR REPLACE FUNCTION imcc_review.archive_grade_change()
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
      INSERT INTO imcc_review.grade_history (
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
    INSERT INTO imcc_review.grade_history (
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

CREATE OR REPLACE FUNCTION imcc_review_private.review_enrollment_request(p_request_id uuid, p_decision text, p_review_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_request imcc_review.enrollment_requests%ROWTYPE;
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
    FROM imcc_review.profiles p
    WHERE p.id = v_actor
      AND p.role = ANY (ARRAY['admin', 'dean', 'registrar', 'staff'])
      AND p.status = 'approved'
      AND p.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'Approved active enrollment reviewer access required' USING ERRCODE = '42501';
  END IF;

  SELECT r.*
  INTO v_request
  FROM imcc_review.enrollment_requests r
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
    FROM imcc_review.profiles p
    WHERE p.id = v_request.student_id
    FOR UPDATE;

    SELECT EXISTS (
      SELECT 1
      FROM imcc_review.profiles p
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
      FROM imcc_review.enrollments e
      WHERE e.student_id = v_request.student_id
        AND e.offering_id = v_request.offering_id
        AND e.status IN ('enrolled', 'completed')
    ) THEN
      RAISE EXCEPTION 'Student already has an enrolled or completed record for this offering' USING ERRCODE = '23505';
    END IF;

    INSERT INTO imcc_review.enrollments (student_id, offering_id, status)
    VALUES (v_request.student_id, v_request.offering_id, 'enrolled')
    RETURNING id INTO v_enrollment_id;
  END IF;

  UPDATE imcc_review.enrollment_requests r
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

CREATE OR REPLACE FUNCTION imcc_review_private.cancel_enrollment_request(p_request_id uuid)
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
    FROM imcc_review.profiles p
    WHERE p.id = v_actor
      AND p.role = 'student'
      AND p.status = 'approved'
      AND p.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'Approved active student access required' USING ERRCODE = '42501';
  END IF;

  UPDATE imcc_review.enrollment_requests r
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

CREATE OR REPLACE FUNCTION imcc_review.cancel_enrollment_request(p_request_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  SELECT imcc_review_private.cancel_enrollment_request($1);
$function$
;

CREATE OR REPLACE FUNCTION imcc_review.update_grade_calculations()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'imcc_review', 'pg_catalog'
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

CREATE OR REPLACE FUNCTION imcc_review.sync_teacher_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'imcc_review', 'pg_catalog'
AS $function$
BEGIN
  -- The trigger runs with owner privileges, so RLS cannot enforce caller activation here.
  IF auth.uid() IS NOT NULL
     AND auth.role() IS DISTINCT FROM 'service_role'
     AND NOT EXISTS (
       SELECT 1 FROM imcc_review.profiles p
       WHERE p.id = auth.uid()
         AND p.role IN ('teacher', 'faculty', 'dean', 'admin')
         AND p.status = 'approved' AND p.is_active IS TRUE
     ) THEN
    RAISE EXCEPTION 'Approved active account required to change assignments' USING ERRCODE = '42501';
  END IF;

  IF NEW.instructor_id IS NULL THEN
    UPDATE imcc_review.teacher_assignments
    SET is_active = false
    WHERE offering_id = NEW.id;
  ELSE
    -- Deactivate previous assignments that don't match the new instructor
    UPDATE imcc_review.teacher_assignments
    SET is_active = false
    WHERE offering_id = NEW.id
      AND (
        teacher_id IS DISTINCT FROM NEW.instructor_id
        OR academic_year IS DISTINCT FROM NEW.school_year
        OR semester IS DISTINCT FROM NEW.semester
      );

    -- Upsert active assignment
    INSERT INTO imcc_review.teacher_assignments (
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
      assigned_by = COALESCE(auth.uid(), imcc_review.teacher_assignments.assigned_by),
      updated_at = now();
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE VIEW imcc_review.teacher_assigned_subjects WITH (security_invoker=true) AS  SELECT ta.teacher_id,
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

CREATE VIEW imcc_review.teacher_subject_dropdown WITH (security_invoker=true) AS  SELECT DISTINCT ta.teacher_id,
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

CREATE VIEW imcc_review.v_grade_history WITH (security_invoker=true) AS  SELECT gh.id,
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

CREATE VIEW imcc_review.instructor_evaluation_summary WITH (security_invoker=true) AS  SELECT max(instructor_name) AS instructor_name,
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

CREATE VIEW imcc_review.teacher_subject_students WITH (security_invoker=true) AS  SELECT ta.teacher_id,
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

CREATE INDEX idx_sections_adviser_id ON imcc_review.sections USING btree (adviser_id);

CREATE INDEX idx_messages_recipient_id ON imcc_review.messages USING btree (recipient_id);

CREATE INDEX idx_teacher_assignments_offering_active ON imcc_review.teacher_assignments USING btree (offering_id, is_active);

CREATE INDEX idx_grades_student_id ON imcc_review.grades USING btree (student_id);

CREATE INDEX idx_course_offerings_instructor_id ON imcc_review.course_offerings USING btree (instructor_id);

CREATE INDEX idx_grades_graded_by ON imcc_review.grades USING btree (graded_by);

CREATE INDEX idx_teacher_assignments_teacher_active ON imcc_review.teacher_assignments USING btree (teacher_id, is_active);

CREATE INDEX idx_class_announcements_offering_id ON imcc_review.class_announcements USING btree (offering_id);

CREATE INDEX idx_fac_eval_instructor_term ON imcc_review.faculty_evaluations USING btree (instructor_name, school_year, semester);

CREATE INDEX idx_installments_student_id ON imcc_review.installments USING btree (student_id);

CREATE INDEX idx_messages_sender_id ON imcc_review.messages USING btree (sender_id);

CREATE INDEX idx_grade_history_grade_id ON imcc_review.grade_history USING btree (grade_id);

CREATE INDEX idx_clearances_student_id ON imcc_review.clearances USING btree (student_id);

CREATE INDEX idx_messages_recipient_unread ON imcc_review.messages USING btree (recipient_id, is_read) WHERE (is_read = false);

CREATE INDEX idx_attendance_date ON imcc_review.attendance USING btree (date);

CREATE INDEX idx_class_announcements_offering ON imcc_review.class_announcements USING btree (offering_id);

CREATE INDEX idx_sections_academic_year_id ON imcc_review.sections USING btree (academic_year_id);

CREATE INDEX idx_enrollments_offering_id ON imcc_review.enrollments USING btree (offering_id);

CREATE INDEX idx_faq_articles_embedding ON imcc_review.faq_articles USING hnsw (embedding vector_cosine_ops);

CREATE INDEX idx_attendance_student_id ON imcc_review.attendance USING btree (student_id);

CREATE INDEX idx_fac_eval_student ON imcc_review.faculty_evaluations USING btree (student_id);

CREATE INDEX faq_articles_embedding_idx ON imcc_review.faq_articles USING hnsw (embedding vector_ip_ops) WITH (m='16', ef_construction='64');

CREATE INDEX idx_timetable_teacher_id ON imcc_review.timetable USING btree (teacher_id);

CREATE INDEX idx_attendance_offering_id ON imcc_review.attendance USING btree (offering_id);

CREATE INDEX idx_system_settings_updated_by ON imcc_review.system_settings USING btree (updated_by);

CREATE INDEX idx_class_announcements_author_id ON imcc_review.class_announcements USING btree (author_id);

CREATE INDEX idx_activities_student_id ON imcc_review.activities USING btree (student_id);

CREATE INDEX idx_clearance_status_dept_id ON imcc_review.clearance_status USING btree (department_id);

CREATE INDEX idx_transactions_student_id ON imcc_review.transactions USING btree (student_id);

CREATE INDEX idx_teacher_assignments_teacher_id ON imcc_review.teacher_assignments USING btree (teacher_id);

CREATE UNIQUE INDEX uq_enrollments_student_offering ON imcc_review.enrollments USING btree (student_id, offering_id) WHERE (status = 'enrolled'::text);

CREATE INDEX idx_chat_logs_user_id ON imcc_review.chat_logs USING btree (user_id);

CREATE INDEX idx_student_semesters_student_id ON imcc_review.student_semesters USING btree (student_id);

CREATE INDEX idx_teacher_assignments_assigned_by ON imcc_review.teacher_assignments USING btree (assigned_by);

CREATE INDEX idx_attendance_marked_by ON imcc_review.attendance USING btree (marked_by);

CREATE INDEX idx_appeals_student_id ON imcc_review.appeals USING btree (student_id);

CREATE UNIQUE INDEX uq_teacher_assignments_slot ON imcc_review.teacher_assignments USING btree (teacher_id, offering_id, academic_year, semester);

CREATE INDEX idx_timetable_room_id ON imcc_review.timetable USING btree (room_id);

CREATE INDEX idx_clearance_status_student_id ON imcc_review.clearance_status USING btree (student_id);

CREATE INDEX idx_faculty_evaluations_student_id ON imcc_review.faculty_evaluations USING btree (student_id);

CREATE INDEX idx_grade_history_student ON imcc_review.grade_history USING btree (student_id, created_at DESC);

CREATE INDEX idx_grades_offering_id ON imcc_review.grades USING btree (offering_id);

CREATE INDEX idx_enrollments_student_id ON imcc_review.enrollments USING btree (student_id);

CREATE INDEX idx_grade_history_student_id ON imcc_review.grade_history USING btree (student_id);

CREATE INDEX idx_timetable_offering_id ON imcc_review.timetable USING btree (offering_id);

CREATE INDEX idx_grade_history_offering ON imcc_review.grade_history USING btree (offering_id, created_at DESC);

CREATE INDEX idx_teacher_assignments_offering_id ON imcc_review.teacher_assignments USING btree (offering_id);

CREATE INDEX idx_attendance_timetable_id ON imcc_review.attendance USING btree (timetable_id);

CREATE INDEX idx_faculty_evaluations_instructor_id ON imcc_review.faculty_evaluations USING btree (instructor_id);

ALTER TABLE "imcc_review"."departments" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "imcc_review"."grading_scale" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "imcc_review"."timetable" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "imcc_review"."attendance" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "imcc_review"."messages" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "imcc_review"."class_announcements" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "imcc_review"."misc_fees" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "imcc_review"."activities" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "imcc_review"."clearances" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "imcc_review"."enrollments" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "imcc_review"."student_semesters" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "imcc_review"."appeals" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "imcc_review"."clearance_status" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "imcc_review"."sections" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "imcc_review"."rooms" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "imcc_review"."enrollment_items" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "imcc_review"."clearance_departments" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "imcc_review"."transactions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "imcc_review"."deadlines" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "imcc_review"."courses" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "imcc_review"."students" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "imcc_review"."faculty_notes" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "imcc_review"."accreditation_checklist" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "imcc_review"."department_budgets" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "imcc_review"."grant_funding" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "imcc_review"."course_offerings" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "imcc_review"."faq_articles" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "imcc_review"."announcements" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "imcc_review"."academic_years" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "imcc_review"."sso_links" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "imcc_review"."profiles" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "imcc_review"."user_mfa" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "imcc_review"."faculty_evaluations" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "imcc_review"."grades" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "imcc_review"."installments" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "imcc_review"."billing_summary" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "imcc_review"."teacher_assignments" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "imcc_review"."system_settings" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "imcc_review"."chat_logs" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "imcc_review"."grade_history" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins write departments" ON imcc_review.departments AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)) AND (profiles.role = 'admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)) AND (profiles.role = 'admin'::text)))));

CREATE POLICY "Authenticated read departments" ON imcc_review.departments AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "All users can read grading scale" ON imcc_review.grading_scale AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY "Admins write timetable" ON imcc_review.timetable AS PERMISSIVE FOR ALL TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)) AND (profiles.role = 'admin'::text)))));

CREATE POLICY "Authenticated read timetable" ON imcc_review.timetable AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "Faculty read all attendance" ON imcc_review.attendance AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['faculty'::text, 'teacher'::text, 'staff'::text, 'admin'::text, 'dean'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE)))));

CREATE POLICY "Faculty write attendance" ON imcc_review.attendance AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE) AND ((p.role = ANY (ARRAY['admin'::text, 'dean'::text])) OR ((p.role = ANY (ARRAY['teacher'::text, 'faculty'::text])) AND (EXISTS ( SELECT 1
           FROM teacher_assignments ta
          WHERE ((ta.teacher_id = p.id) AND (ta.offering_id = attendance.offering_id) AND (ta.is_active IS TRUE)))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE) AND ((p.role = ANY (ARRAY['admin'::text, 'dean'::text])) OR ((p.role = ANY (ARRAY['teacher'::text, 'faculty'::text])) AND (EXISTS ( SELECT 1
           FROM teacher_assignments ta
          WHERE ((ta.teacher_id = p.id) AND (ta.offering_id = attendance.offering_id) AND (ta.is_active IS TRUE))))))))));

CREATE POLICY "Students read own attendance" ON imcc_review.attendance AS PERMISSIVE FOR SELECT TO PUBLIC USING ((student_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)));

CREATE POLICY mfa_restrictive_attendance ON imcc_review.attendance AS RESTRICTIVE FOR ALL TO authenticated USING (is_mfa_compliant()) WITH CHECK (is_mfa_compliant());

CREATE POLICY "Users read own messages" ON imcc_review.messages AS PERMISSIVE FOR SELECT TO authenticated USING (((sender_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)) OR (recipient_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid))));

CREATE POLICY "Users send messages" ON imcc_review.messages AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((sender_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)));

CREATE POLICY "Users update own messages" ON imcc_review.messages AS PERMISSIVE FOR UPDATE TO authenticated USING ((recipient_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)));

CREATE POLICY "Faculty read all class announcements" ON imcc_review.class_announcements AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['faculty'::text, 'teacher'::text, 'admin'::text, 'dean'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE)))));

CREATE POLICY "Faculty write own announcements" ON imcc_review.class_announcements AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE) AND (((p.role = ANY (ARRAY['faculty'::text, 'teacher'::text])) AND (class_announcements.author_id = ( SELECT auth.uid() AS uid))) OR (p.role = ANY (ARRAY['dean'::text, 'admin'::text]))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE) AND (((p.role = ANY (ARRAY['faculty'::text, 'teacher'::text])) AND (class_announcements.author_id = ( SELECT auth.uid() AS uid))) OR (p.role = ANY (ARRAY['dean'::text, 'admin'::text])))))));

CREATE POLICY "Students read class announcements" ON imcc_review.class_announcements AS PERMISSIVE FOR SELECT TO authenticated USING (((is_active = true) AND (EXISTS ( SELECT 1
   FROM enrollments e
  WHERE ((e.student_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)) AND (e.offering_id = class_announcements.offering_id))))));

CREATE POLICY "Anyone can read misc_fees" ON imcc_review.misc_fees AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users read misc fees" ON imcc_review.misc_fees AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "Students read own activities" ON imcc_review.activities AS PERMISSIVE FOR SELECT TO PUBLIC USING ((student_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)));

CREATE POLICY "Approved staff manage clearances" ON imcc_review.clearances AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['teacher'::text, 'faculty'::text, 'staff'::text, 'registrar'::text, 'dean'::text, 'admin'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['teacher'::text, 'faculty'::text, 'staff'::text, 'registrar'::text, 'dean'::text, 'admin'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE)))));

CREATE POLICY "Students read own clearances" ON imcc_review.clearances AS PERMISSIVE FOR SELECT TO authenticated USING ((student_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY mfa_restrictive_clearances ON imcc_review.clearances AS RESTRICTIVE FOR ALL TO authenticated USING (is_mfa_compliant()) WITH CHECK (is_mfa_compliant());

CREATE POLICY "Approved staff manage enrollments" ON imcc_review.enrollments AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['teacher'::text, 'faculty'::text, 'dean'::text, 'admin'::text, 'registrar'::text, 'staff'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['teacher'::text, 'faculty'::text, 'dean'::text, 'admin'::text, 'registrar'::text, 'staff'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE)))));

CREATE POLICY "Approved staff read enrollments" ON imcc_review.enrollments AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['teacher'::text, 'faculty'::text, 'dean'::text, 'admin'::text, 'registrar'::text, 'staff'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE)))));

CREATE POLICY "Students read own enrollments" ON imcc_review.enrollments AS PERMISSIVE FOR SELECT TO authenticated USING ((student_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "Admins read all semesters" ON imcc_review.student_semesters AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)) AND (profiles.role = 'admin'::text)))));

CREATE POLICY "Students read own semesters" ON imcc_review.student_semesters AS PERMISSIVE FOR SELECT TO authenticated USING ((student_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)));

CREATE POLICY "Dean admin manage appeals" ON imcc_review.appeals AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['dean'::text, 'admin'::text]))))));

CREATE POLICY "Students insert own appeals" ON imcc_review.appeals AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((student_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "Students read own appeals" ON imcc_review.appeals AS PERMISSIVE FOR SELECT TO authenticated USING ((student_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY mfa_restrictive_appeals ON imcc_review.appeals AS RESTRICTIVE FOR ALL TO authenticated USING (is_mfa_compliant()) WITH CHECK (is_mfa_compliant());

CREATE POLICY "Staff faculty dean admin manage clearance_status" ON imcc_review.clearance_status AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['teacher'::text, 'faculty'::text, 'staff'::text, 'registrar'::text, 'dean'::text, 'admin'::text]))))));

CREATE POLICY "Students view own clearance" ON imcc_review.clearance_status AS PERMISSIVE FOR SELECT TO authenticated USING ((student_id IN ( SELECT students.id
   FROM students
  WHERE (students.email = ( SELECT (( SELECT auth.jwt() AS jwt) ->> 'email'::text))))));

CREATE POLICY mfa_restrictive_clearance_status ON imcc_review.clearance_status AS RESTRICTIVE FOR ALL TO authenticated USING (is_mfa_compliant()) WITH CHECK (is_mfa_compliant());

CREATE POLICY "Admins write sections" ON imcc_review.sections AS PERMISSIVE FOR ALL TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)) AND (profiles.role = 'admin'::text)))));

CREATE POLICY "Authenticated read sections" ON imcc_review.sections AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins write rooms" ON imcc_review.rooms AS PERMISSIVE FOR ALL TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)) AND (profiles.role = 'admin'::text)))));

CREATE POLICY "Authenticated read rooms" ON imcc_review.rooms AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated read enrollment_items" ON imcc_review.enrollment_items AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "Students insert enrollment_items" ON imcc_review.enrollment_items AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM enrollments e
  WHERE ((e.id = enrollment_items.enrollment_id) AND (e.student_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid))))));

CREATE POLICY "Public read clearance departments" ON imcc_review.clearance_departments AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "Students read own transactions" ON imcc_review.transactions AS PERMISSIVE FOR SELECT TO PUBLIC USING ((student_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)));

CREATE POLICY mfa_restrictive_transactions ON imcc_review.transactions AS RESTRICTIVE FOR ALL TO authenticated USING (is_mfa_compliant()) WITH CHECK (is_mfa_compliant());

CREATE POLICY "Public read deadlines" ON imcc_review.deadlines AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY "Deans and admins manage courses" ON imcc_review.courses AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['dean'::text, 'admin'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['dean'::text, 'admin'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE)))));

CREATE POLICY "Public read courses" ON imcc_review.courses AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY "Students view own profile" ON imcc_review.students AS PERMISSIVE FOR SELECT TO authenticated USING ((email = ( SELECT (( SELECT auth.jwt() AS jwt) ->> 'email'::text))));

CREATE POLICY "Dean admin manage faculty_notes" ON imcc_review.faculty_notes AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['dean'::text, 'admin'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['dean'::text, 'admin'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE)))));

CREATE POLICY "Dean admin manage accreditation_checklist" ON imcc_review.accreditation_checklist AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['dean'::text, 'admin'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['dean'::text, 'admin'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE)))));

CREATE POLICY "Dean admin manage department_budgets" ON imcc_review.department_budgets AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['dean'::text, 'admin'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['dean'::text, 'admin'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE)))));

CREATE POLICY "Dean admin manage grant_funding" ON imcc_review.grant_funding AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['dean'::text, 'admin'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['dean'::text, 'admin'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE)))));

CREATE POLICY "All users read offerings" ON imcc_review.course_offerings AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated read offerings" ON imcc_review.course_offerings AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "Faculty and admin delete offerings" ON imcc_review.course_offerings AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['teacher'::text, 'faculty'::text, 'dean'::text, 'admin'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE)))));

CREATE POLICY "Faculty and admin insert offerings" ON imcc_review.course_offerings AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['teacher'::text, 'faculty'::text, 'dean'::text, 'admin'::text]))))));

CREATE POLICY "Faculty and admin update offerings" ON imcc_review.course_offerings AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['teacher'::text, 'faculty'::text, 'dean'::text, 'admin'::text]))))));

CREATE POLICY "Anyone can read faq" ON imcc_review.faq_articles AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "Anyone can read announcements" ON imcc_review.announcements AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "Teachers write announcements" ON imcc_review.announcements AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['teacher'::text, 'faculty'::text, 'staff'::text, 'admin'::text, 'dean'::text, 'registrar'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['teacher'::text, 'faculty'::text, 'staff'::text, 'admin'::text, 'dean'::text, 'registrar'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE)))));

CREATE POLICY "Admins write academic_years" ON imcc_review.academic_years AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)) AND (profiles.role = 'admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)) AND (profiles.role = 'admin'::text)))));

CREATE POLICY "Authenticated read academic_years" ON imcc_review.academic_years AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins write sso_links" ON imcc_review.sso_links AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)) AND (profiles.role = 'admin'::text)))));

CREATE POLICY "Authenticated read sso_links" ON imcc_review.sso_links AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users read sso links" ON imcc_review.sso_links AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can update all profiles" ON imcc_review.profiles AS PERMISSIVE FOR UPDATE TO authenticated USING (is_admin());

CREATE POLICY "Admins can view all profiles" ON imcc_review.profiles AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin());

CREATE POLICY "Admins delete profiles" ON imcc_review.profiles AS PERMISSIVE FOR DELETE TO authenticated USING (is_admin());

CREATE POLICY "Admins insert profiles" ON imcc_review.profiles AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_admin());

CREATE POLICY "Users can read own profile" ON imcc_review.profiles AS PERMISSIVE FOR SELECT TO authenticated USING ((id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)));

CREATE POLICY "Users can update own profile" ON imcc_review.profiles AS PERMISSIVE FOR UPDATE TO authenticated USING ((id = ( SELECT ( SELECT auth.uid() AS uid) AS uid))) WITH CHECK ((id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)));

CREATE POLICY "Deans and admins delete evaluations" ON imcc_review.faculty_evaluations AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['dean'::text, 'admin'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE)))));

CREATE POLICY "Deans and admins insert evaluations" ON imcc_review.faculty_evaluations AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['dean'::text, 'admin'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE)))));

CREATE POLICY "Deans and admins update evaluations" ON imcc_review.faculty_evaluations AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['dean'::text, 'admin'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['dean'::text, 'admin'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE)))));

CREATE POLICY "Deans and admins view all evaluations" ON imcc_review.faculty_evaluations AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['dean'::text, 'admin'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE)))));

CREATE POLICY "Students insert own evaluations" ON imcc_review.faculty_evaluations AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((student_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "Students view own evaluations" ON imcc_review.faculty_evaluations AS PERMISSIVE FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = student_id));

CREATE POLICY "Teachers view own evaluations" ON imcc_review.faculty_evaluations AS PERMISSIVE FOR SELECT TO authenticated USING (((instructor_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['teacher'::text, 'faculty'::text, 'dean'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE))))));

CREATE POLICY "Admin can view all grades" ON imcc_review.grades AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::text) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE)))));

CREATE POLICY "Admins delete any grades" ON imcc_review.grades AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::text) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE)))));

CREATE POLICY "Admins insert grades for enrolled students" ON imcc_review.grades AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::text) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE)))) AND (EXISTS ( SELECT 1
   FROM enrollments e
  WHERE ((e.student_id = grades.student_id) AND (e.offering_id = grades.offering_id))))));

CREATE POLICY "Admins update grades for enrolled students" ON imcc_review.grades AS PERMISSIVE FOR UPDATE TO authenticated USING (((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::text) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE)))) AND (EXISTS ( SELECT 1
   FROM enrollments e
  WHERE ((e.student_id = grades.student_id) AND (e.offering_id = grades.offering_id)))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::text) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE)))) AND (EXISTS ( SELECT 1
   FROM enrollments e
  WHERE ((e.student_id = grades.student_id) AND (e.offering_id = grades.offering_id))))));

CREATE POLICY "Approved assigned instructors insert enrolled grades" ON imcc_review.grades AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM (profiles p
     JOIN teacher_assignments ta ON ((ta.teacher_id = p.id)))
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['teacher'::text, 'faculty'::text, 'dean'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE) AND (ta.offering_id = grades.offering_id) AND (ta.is_active IS TRUE)))) AND (EXISTS ( SELECT 1
   FROM enrollments e
  WHERE ((e.student_id = grades.student_id) AND (e.offering_id = grades.offering_id))))));

CREATE POLICY "Approved assigned instructors update enrolled grades" ON imcc_review.grades AS PERMISSIVE FOR UPDATE TO authenticated USING (((EXISTS ( SELECT 1
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

CREATE POLICY "Approved deans delete assigned grades" ON imcc_review.grades AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (profiles p
     JOIN teacher_assignments ta ON ((ta.teacher_id = p.id)))
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'dean'::text) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE) AND (ta.offering_id = grades.offering_id) AND (ta.is_active IS TRUE)))));

CREATE POLICY "Approved deans view all grades" ON imcc_review.grades AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'dean'::text) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE)))));

CREATE POLICY "Approved instructors view assigned grades" ON imcc_review.grades AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (profiles p
     JOIN teacher_assignments ta ON ((ta.teacher_id = p.id)))
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['teacher'::text, 'faculty'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE) AND (ta.offering_id = grades.offering_id) AND (ta.is_active IS TRUE)))));

CREATE POLICY "Students can view own grades" ON imcc_review.grades AS PERMISSIVE FOR SELECT TO authenticated USING ((student_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "Students read own grades" ON imcc_review.grades AS PERMISSIVE FOR SELECT TO authenticated USING ((student_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)));

CREATE POLICY mfa_restrictive_grades ON imcc_review.grades AS RESTRICTIVE FOR ALL TO authenticated USING (is_mfa_compliant()) WITH CHECK (is_mfa_compliant());

CREATE POLICY "Students read own installments" ON imcc_review.installments AS PERMISSIVE FOR SELECT TO authenticated USING ((student_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY mfa_restrictive_installments ON imcc_review.installments AS RESTRICTIVE FOR ALL TO authenticated USING (is_mfa_compliant()) WITH CHECK (is_mfa_compliant());

CREATE POLICY "Students read own billing" ON imcc_review.billing_summary AS PERMISSIVE FOR SELECT TO PUBLIC USING ((student_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)));

CREATE POLICY mfa_restrictive_billing_summary ON imcc_review.billing_summary AS RESTRICTIVE FOR ALL TO authenticated USING (is_mfa_compliant()) WITH CHECK (is_mfa_compliant());

CREATE POLICY "Admin can view all assignments" ON imcc_review.teacher_assignments AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::text) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE)))));

CREATE POLICY "Admin manage assignments" ON imcc_review.teacher_assignments AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::text) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::text) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE)))));

CREATE POLICY "Dean can manage all assignments" ON imcc_review.teacher_assignments AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'dean'::text) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'dean'::text) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE)))));

CREATE POLICY "Deans and teachers read teacher_assignments" ON imcc_review.teacher_assignments AS PERMISSIVE FOR SELECT TO authenticated USING (((teacher_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['dean'::text, 'admin'::text, 'registrar'::text])) AND (profiles.status = 'approved'::text))))));

CREATE POLICY "Teachers can view own assignments" ON imcc_review.teacher_assignments AS PERMISSIVE FOR SELECT TO authenticated USING (((teacher_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['teacher'::text, 'faculty'::text, 'dean'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE))))));

CREATE POLICY "System settings read policy" ON imcc_review.system_settings AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "System settings write policy" ON imcc_review.system_settings AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'dean'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'dean'::text]))))));

CREATE POLICY "Chat logs select policy" ON imcc_review.chat_logs AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)) AND (profiles.role = 'admin'::text))))));

CREATE POLICY "Approved instructors read assigned grade history" ON imcc_review.grade_history AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (profiles p
     JOIN teacher_assignments ta ON ((ta.teacher_id = p.id)))
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['teacher'::text, 'faculty'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE) AND (ta.offering_id = grade_history.offering_id) AND (ta.is_active IS TRUE)))));

CREATE POLICY "Approved oversight read grade history" ON imcc_review.grade_history AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['dean'::text, 'admin'::text, 'registrar'::text, 'staff'::text])) AND (p.status = 'approved'::text) AND (p.is_active IS TRUE)))));

CREATE POLICY "Students read own grade history" ON imcc_review.grade_history AS PERMISSIVE FOR SELECT TO authenticated USING ((student_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY mfa_restrictive_grade_history ON imcc_review.grade_history AS RESTRICTIVE FOR ALL TO authenticated USING (is_mfa_compliant()) WITH CHECK (is_mfa_compliant());


CREATE TRIGGER trg_sync_student_term_on_enroll AFTER INSERT ON imcc_review.enrollments FOR EACH ROW EXECUTE FUNCTION sync_student_term_on_enroll();

CREATE TRIGGER grade_calculation_trigger BEFORE INSERT OR UPDATE ON imcc_review.grades FOR EACH ROW EXECUTE FUNCTION update_grade_calculations();

CREATE TRIGGER trg_auto_student_semester AFTER INSERT OR UPDATE OF status, role ON imcc_review.profiles FOR EACH ROW EXECUTE FUNCTION auto_create_student_semester();

CREATE TRIGGER trg_archive_grade_change AFTER INSERT OR UPDATE ON imcc_review.grades FOR EACH ROW EXECUTE FUNCTION archive_grade_change();

CREATE TRIGGER trg_sync_teacher_assignment AFTER INSERT OR UPDATE OF instructor_id, school_year, semester ON imcc_review.course_offerings FOR EACH ROW EXECUTE FUNCTION sync_teacher_assignment();

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON imcc_review.clearance_status FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON imcc_review.accreditation_checklist FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON imcc_review.department_budgets FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON imcc_review.grant_funding FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON imcc_review.profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON imcc_review.billing_summary FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON imcc_review.system_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

REVOKE ALL ON ALL TABLES IN SCHEMA imcc_review,imcc_review_private FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON ALL SEQUENCES IN SCHEMA imcc_review,imcc_review_private FROM PUBLIC,anon,authenticated,service_role;

GRANT USAGE ON SCHEMA imcc_review TO anon,authenticated,service_role;

GRANT INSERT ON imcc_review.departments TO authenticated;

GRANT SELECT ON imcc_review.departments TO authenticated;

GRANT UPDATE ON imcc_review.departments TO authenticated;

GRANT DELETE ON imcc_review.departments TO authenticated;

GRANT TRUNCATE ON imcc_review.departments TO authenticated;

GRANT REFERENCES ON imcc_review.departments TO authenticated;

GRANT TRIGGER ON imcc_review.departments TO authenticated;

GRANT MAINTAIN ON imcc_review.departments TO authenticated;

GRANT INSERT ON imcc_review.departments TO service_role;

GRANT SELECT ON imcc_review.departments TO service_role;

GRANT UPDATE ON imcc_review.departments TO service_role;

GRANT DELETE ON imcc_review.departments TO service_role;

GRANT TRUNCATE ON imcc_review.departments TO service_role;

GRANT REFERENCES ON imcc_review.departments TO service_role;

GRANT TRIGGER ON imcc_review.departments TO service_role;

GRANT MAINTAIN ON imcc_review.departments TO service_role;

GRANT SELECT ON imcc_review.departments TO anon;

GRANT INSERT ON imcc_review.grading_scale TO authenticated;

GRANT SELECT ON imcc_review.grading_scale TO authenticated;

GRANT UPDATE ON imcc_review.grading_scale TO authenticated;

GRANT DELETE ON imcc_review.grading_scale TO authenticated;

GRANT TRUNCATE ON imcc_review.grading_scale TO authenticated;

GRANT REFERENCES ON imcc_review.grading_scale TO authenticated;

GRANT TRIGGER ON imcc_review.grading_scale TO authenticated;

GRANT MAINTAIN ON imcc_review.grading_scale TO authenticated;

GRANT SELECT ON imcc_review.grading_scale TO anon;

GRANT INSERT ON imcc_review.timetable TO authenticated;

GRANT SELECT ON imcc_review.timetable TO authenticated;

GRANT UPDATE ON imcc_review.timetable TO authenticated;

GRANT DELETE ON imcc_review.timetable TO authenticated;

GRANT TRUNCATE ON imcc_review.timetable TO authenticated;

GRANT REFERENCES ON imcc_review.timetable TO authenticated;

GRANT TRIGGER ON imcc_review.timetable TO authenticated;

GRANT MAINTAIN ON imcc_review.timetable TO authenticated;

GRANT INSERT ON imcc_review.timetable TO service_role;

GRANT SELECT ON imcc_review.timetable TO service_role;

GRANT UPDATE ON imcc_review.timetable TO service_role;

GRANT DELETE ON imcc_review.timetable TO service_role;

GRANT TRUNCATE ON imcc_review.timetable TO service_role;

GRANT REFERENCES ON imcc_review.timetable TO service_role;

GRANT TRIGGER ON imcc_review.timetable TO service_role;

GRANT MAINTAIN ON imcc_review.timetable TO service_role;

GRANT SELECT ON imcc_review.timetable TO anon;

GRANT INSERT ON imcc_review.attendance TO authenticated;

GRANT SELECT ON imcc_review.attendance TO authenticated;

GRANT UPDATE ON imcc_review.attendance TO authenticated;

GRANT DELETE ON imcc_review.attendance TO authenticated;

GRANT TRUNCATE ON imcc_review.attendance TO authenticated;

GRANT REFERENCES ON imcc_review.attendance TO authenticated;

GRANT TRIGGER ON imcc_review.attendance TO authenticated;

GRANT MAINTAIN ON imcc_review.attendance TO authenticated;

GRANT INSERT ON imcc_review.attendance TO service_role;

GRANT SELECT ON imcc_review.attendance TO service_role;

GRANT UPDATE ON imcc_review.attendance TO service_role;

GRANT DELETE ON imcc_review.attendance TO service_role;

GRANT TRUNCATE ON imcc_review.attendance TO service_role;

GRANT REFERENCES ON imcc_review.attendance TO service_role;

GRANT TRIGGER ON imcc_review.attendance TO service_role;

GRANT MAINTAIN ON imcc_review.attendance TO service_role;

GRANT SELECT ON imcc_review.attendance TO anon;

GRANT INSERT ON imcc_review.messages TO authenticated;

GRANT SELECT ON imcc_review.messages TO authenticated;

GRANT UPDATE ON imcc_review.messages TO authenticated;

GRANT DELETE ON imcc_review.messages TO authenticated;

GRANT TRUNCATE ON imcc_review.messages TO authenticated;

GRANT REFERENCES ON imcc_review.messages TO authenticated;

GRANT TRIGGER ON imcc_review.messages TO authenticated;

GRANT MAINTAIN ON imcc_review.messages TO authenticated;

GRANT INSERT ON imcc_review.messages TO service_role;

GRANT SELECT ON imcc_review.messages TO service_role;

GRANT UPDATE ON imcc_review.messages TO service_role;

GRANT DELETE ON imcc_review.messages TO service_role;

GRANT TRUNCATE ON imcc_review.messages TO service_role;

GRANT REFERENCES ON imcc_review.messages TO service_role;

GRANT TRIGGER ON imcc_review.messages TO service_role;

GRANT MAINTAIN ON imcc_review.messages TO service_role;

GRANT SELECT ON imcc_review.messages TO anon;

GRANT INSERT ON imcc_review.class_announcements TO authenticated;

GRANT SELECT ON imcc_review.class_announcements TO authenticated;

GRANT UPDATE ON imcc_review.class_announcements TO authenticated;

GRANT DELETE ON imcc_review.class_announcements TO authenticated;

GRANT TRUNCATE ON imcc_review.class_announcements TO authenticated;

GRANT REFERENCES ON imcc_review.class_announcements TO authenticated;

GRANT TRIGGER ON imcc_review.class_announcements TO authenticated;

GRANT MAINTAIN ON imcc_review.class_announcements TO authenticated;

GRANT INSERT ON imcc_review.class_announcements TO service_role;

GRANT SELECT ON imcc_review.class_announcements TO service_role;

GRANT UPDATE ON imcc_review.class_announcements TO service_role;

GRANT DELETE ON imcc_review.class_announcements TO service_role;

GRANT TRUNCATE ON imcc_review.class_announcements TO service_role;

GRANT REFERENCES ON imcc_review.class_announcements TO service_role;

GRANT TRIGGER ON imcc_review.class_announcements TO service_role;

GRANT MAINTAIN ON imcc_review.class_announcements TO service_role;

GRANT SELECT ON imcc_review.class_announcements TO anon;

GRANT INSERT ON imcc_review.misc_fees TO authenticated;

GRANT SELECT ON imcc_review.misc_fees TO authenticated;

GRANT UPDATE ON imcc_review.misc_fees TO authenticated;

GRANT DELETE ON imcc_review.misc_fees TO authenticated;

GRANT TRUNCATE ON imcc_review.misc_fees TO authenticated;

GRANT REFERENCES ON imcc_review.misc_fees TO authenticated;

GRANT TRIGGER ON imcc_review.misc_fees TO authenticated;

GRANT MAINTAIN ON imcc_review.misc_fees TO authenticated;

GRANT INSERT ON imcc_review.misc_fees TO service_role;

GRANT SELECT ON imcc_review.misc_fees TO service_role;

GRANT UPDATE ON imcc_review.misc_fees TO service_role;

GRANT DELETE ON imcc_review.misc_fees TO service_role;

GRANT TRUNCATE ON imcc_review.misc_fees TO service_role;

GRANT REFERENCES ON imcc_review.misc_fees TO service_role;

GRANT TRIGGER ON imcc_review.misc_fees TO service_role;

GRANT MAINTAIN ON imcc_review.misc_fees TO service_role;

GRANT SELECT ON imcc_review.misc_fees TO anon;

GRANT INSERT ON imcc_review.activities TO authenticated;

GRANT SELECT ON imcc_review.activities TO authenticated;

GRANT UPDATE ON imcc_review.activities TO authenticated;

GRANT DELETE ON imcc_review.activities TO authenticated;

GRANT TRUNCATE ON imcc_review.activities TO authenticated;

GRANT REFERENCES ON imcc_review.activities TO authenticated;

GRANT TRIGGER ON imcc_review.activities TO authenticated;

GRANT MAINTAIN ON imcc_review.activities TO authenticated;

GRANT INSERT ON imcc_review.activities TO service_role;

GRANT SELECT ON imcc_review.activities TO service_role;

GRANT UPDATE ON imcc_review.activities TO service_role;

GRANT DELETE ON imcc_review.activities TO service_role;

GRANT TRUNCATE ON imcc_review.activities TO service_role;

GRANT REFERENCES ON imcc_review.activities TO service_role;

GRANT TRIGGER ON imcc_review.activities TO service_role;

GRANT MAINTAIN ON imcc_review.activities TO service_role;

GRANT SELECT ON imcc_review.activities TO anon;

GRANT INSERT ON imcc_review.clearances TO service_role;

GRANT SELECT ON imcc_review.clearances TO service_role;

GRANT UPDATE ON imcc_review.clearances TO service_role;

GRANT DELETE ON imcc_review.clearances TO service_role;

GRANT TRUNCATE ON imcc_review.clearances TO service_role;

GRANT REFERENCES ON imcc_review.clearances TO service_role;

GRANT TRIGGER ON imcc_review.clearances TO service_role;

GRANT MAINTAIN ON imcc_review.clearances TO service_role;

GRANT INSERT ON imcc_review.clearances TO authenticated;

GRANT SELECT ON imcc_review.clearances TO authenticated;

GRANT UPDATE ON imcc_review.clearances TO authenticated;

GRANT DELETE ON imcc_review.clearances TO authenticated;

GRANT INSERT ON imcc_review.enrollments TO authenticated;

GRANT SELECT ON imcc_review.enrollments TO authenticated;

GRANT UPDATE ON imcc_review.enrollments TO authenticated;

GRANT DELETE ON imcc_review.enrollments TO authenticated;

GRANT TRUNCATE ON imcc_review.enrollments TO authenticated;

GRANT REFERENCES ON imcc_review.enrollments TO authenticated;

GRANT TRIGGER ON imcc_review.enrollments TO authenticated;

GRANT MAINTAIN ON imcc_review.enrollments TO authenticated;

GRANT INSERT ON imcc_review.enrollments TO service_role;

GRANT SELECT ON imcc_review.enrollments TO service_role;

GRANT UPDATE ON imcc_review.enrollments TO service_role;

GRANT DELETE ON imcc_review.enrollments TO service_role;

GRANT TRUNCATE ON imcc_review.enrollments TO service_role;

GRANT REFERENCES ON imcc_review.enrollments TO service_role;

GRANT TRIGGER ON imcc_review.enrollments TO service_role;

GRANT MAINTAIN ON imcc_review.enrollments TO service_role;

GRANT SELECT ON imcc_review.enrollments TO anon;

GRANT INSERT ON imcc_review.student_semesters TO service_role;

GRANT SELECT ON imcc_review.student_semesters TO service_role;

GRANT UPDATE ON imcc_review.student_semesters TO service_role;

GRANT DELETE ON imcc_review.student_semesters TO service_role;

GRANT TRUNCATE ON imcc_review.student_semesters TO service_role;

GRANT REFERENCES ON imcc_review.student_semesters TO service_role;

GRANT TRIGGER ON imcc_review.student_semesters TO service_role;

GRANT MAINTAIN ON imcc_review.student_semesters TO service_role;

GRANT SELECT ON imcc_review.student_semesters TO authenticated;

GRANT INSERT ON imcc_review.appeals TO authenticated;

GRANT SELECT ON imcc_review.appeals TO authenticated;

GRANT UPDATE ON imcc_review.appeals TO authenticated;

GRANT DELETE ON imcc_review.appeals TO authenticated;

GRANT TRUNCATE ON imcc_review.appeals TO authenticated;

GRANT REFERENCES ON imcc_review.appeals TO authenticated;

GRANT TRIGGER ON imcc_review.appeals TO authenticated;

GRANT MAINTAIN ON imcc_review.appeals TO authenticated;

GRANT SELECT ON imcc_review.appeals TO anon;

GRANT INSERT ON imcc_review.clearance_status TO authenticated;

GRANT SELECT ON imcc_review.clearance_status TO authenticated;

GRANT UPDATE ON imcc_review.clearance_status TO authenticated;

GRANT DELETE ON imcc_review.clearance_status TO authenticated;

GRANT TRUNCATE ON imcc_review.clearance_status TO authenticated;

GRANT REFERENCES ON imcc_review.clearance_status TO authenticated;

GRANT TRIGGER ON imcc_review.clearance_status TO authenticated;

GRANT MAINTAIN ON imcc_review.clearance_status TO authenticated;

GRANT INSERT ON imcc_review.clearance_status TO service_role;

GRANT SELECT ON imcc_review.clearance_status TO service_role;

GRANT UPDATE ON imcc_review.clearance_status TO service_role;

GRANT DELETE ON imcc_review.clearance_status TO service_role;

GRANT TRUNCATE ON imcc_review.clearance_status TO service_role;

GRANT REFERENCES ON imcc_review.clearance_status TO service_role;

GRANT TRIGGER ON imcc_review.clearance_status TO service_role;

GRANT MAINTAIN ON imcc_review.clearance_status TO service_role;

GRANT SELECT ON imcc_review.clearance_status TO anon;

GRANT INSERT ON imcc_review.sections TO authenticated;

GRANT SELECT ON imcc_review.sections TO authenticated;

GRANT UPDATE ON imcc_review.sections TO authenticated;

GRANT DELETE ON imcc_review.sections TO authenticated;

GRANT TRUNCATE ON imcc_review.sections TO authenticated;

GRANT REFERENCES ON imcc_review.sections TO authenticated;

GRANT TRIGGER ON imcc_review.sections TO authenticated;

GRANT MAINTAIN ON imcc_review.sections TO authenticated;

GRANT INSERT ON imcc_review.sections TO service_role;

GRANT SELECT ON imcc_review.sections TO service_role;

GRANT UPDATE ON imcc_review.sections TO service_role;

GRANT DELETE ON imcc_review.sections TO service_role;

GRANT TRUNCATE ON imcc_review.sections TO service_role;

GRANT REFERENCES ON imcc_review.sections TO service_role;

GRANT TRIGGER ON imcc_review.sections TO service_role;

GRANT MAINTAIN ON imcc_review.sections TO service_role;

GRANT SELECT ON imcc_review.sections TO anon;

GRANT INSERT ON imcc_review.rooms TO authenticated;

GRANT SELECT ON imcc_review.rooms TO authenticated;

GRANT UPDATE ON imcc_review.rooms TO authenticated;

GRANT DELETE ON imcc_review.rooms TO authenticated;

GRANT TRUNCATE ON imcc_review.rooms TO authenticated;

GRANT REFERENCES ON imcc_review.rooms TO authenticated;

GRANT TRIGGER ON imcc_review.rooms TO authenticated;

GRANT MAINTAIN ON imcc_review.rooms TO authenticated;

GRANT INSERT ON imcc_review.rooms TO service_role;

GRANT SELECT ON imcc_review.rooms TO service_role;

GRANT UPDATE ON imcc_review.rooms TO service_role;

GRANT DELETE ON imcc_review.rooms TO service_role;

GRANT TRUNCATE ON imcc_review.rooms TO service_role;

GRANT REFERENCES ON imcc_review.rooms TO service_role;

GRANT TRIGGER ON imcc_review.rooms TO service_role;

GRANT MAINTAIN ON imcc_review.rooms TO service_role;

GRANT SELECT ON imcc_review.rooms TO anon;

GRANT INSERT ON imcc_review.enrollment_items TO authenticated;

GRANT SELECT ON imcc_review.enrollment_items TO authenticated;

GRANT UPDATE ON imcc_review.enrollment_items TO authenticated;

GRANT DELETE ON imcc_review.enrollment_items TO authenticated;

GRANT TRUNCATE ON imcc_review.enrollment_items TO authenticated;

GRANT REFERENCES ON imcc_review.enrollment_items TO authenticated;

GRANT TRIGGER ON imcc_review.enrollment_items TO authenticated;

GRANT MAINTAIN ON imcc_review.enrollment_items TO authenticated;

GRANT INSERT ON imcc_review.enrollment_items TO service_role;

GRANT SELECT ON imcc_review.enrollment_items TO service_role;

GRANT UPDATE ON imcc_review.enrollment_items TO service_role;

GRANT DELETE ON imcc_review.enrollment_items TO service_role;

GRANT TRUNCATE ON imcc_review.enrollment_items TO service_role;

GRANT REFERENCES ON imcc_review.enrollment_items TO service_role;

GRANT TRIGGER ON imcc_review.enrollment_items TO service_role;

GRANT MAINTAIN ON imcc_review.enrollment_items TO service_role;

GRANT SELECT ON imcc_review.enrollment_items TO anon;

GRANT INSERT ON imcc_review.clearance_departments TO authenticated;

GRANT SELECT ON imcc_review.clearance_departments TO authenticated;

GRANT UPDATE ON imcc_review.clearance_departments TO authenticated;

GRANT DELETE ON imcc_review.clearance_departments TO authenticated;

GRANT TRUNCATE ON imcc_review.clearance_departments TO authenticated;

GRANT REFERENCES ON imcc_review.clearance_departments TO authenticated;

GRANT TRIGGER ON imcc_review.clearance_departments TO authenticated;

GRANT MAINTAIN ON imcc_review.clearance_departments TO authenticated;

GRANT INSERT ON imcc_review.clearance_departments TO service_role;

GRANT SELECT ON imcc_review.clearance_departments TO service_role;

GRANT UPDATE ON imcc_review.clearance_departments TO service_role;

GRANT DELETE ON imcc_review.clearance_departments TO service_role;

GRANT TRUNCATE ON imcc_review.clearance_departments TO service_role;

GRANT REFERENCES ON imcc_review.clearance_departments TO service_role;

GRANT TRIGGER ON imcc_review.clearance_departments TO service_role;

GRANT MAINTAIN ON imcc_review.clearance_departments TO service_role;

GRANT SELECT ON imcc_review.clearance_departments TO anon;

GRANT INSERT ON imcc_review.transactions TO authenticated;

GRANT SELECT ON imcc_review.transactions TO authenticated;

GRANT UPDATE ON imcc_review.transactions TO authenticated;

GRANT DELETE ON imcc_review.transactions TO authenticated;

GRANT TRUNCATE ON imcc_review.transactions TO authenticated;

GRANT REFERENCES ON imcc_review.transactions TO authenticated;

GRANT TRIGGER ON imcc_review.transactions TO authenticated;

GRANT MAINTAIN ON imcc_review.transactions TO authenticated;

GRANT INSERT ON imcc_review.transactions TO service_role;

GRANT SELECT ON imcc_review.transactions TO service_role;

GRANT UPDATE ON imcc_review.transactions TO service_role;

GRANT DELETE ON imcc_review.transactions TO service_role;

GRANT TRUNCATE ON imcc_review.transactions TO service_role;

GRANT REFERENCES ON imcc_review.transactions TO service_role;

GRANT TRIGGER ON imcc_review.transactions TO service_role;

GRANT MAINTAIN ON imcc_review.transactions TO service_role;

GRANT SELECT ON imcc_review.transactions TO anon;

GRANT INSERT ON imcc_review.deadlines TO authenticated;

GRANT SELECT ON imcc_review.deadlines TO authenticated;

GRANT UPDATE ON imcc_review.deadlines TO authenticated;

GRANT DELETE ON imcc_review.deadlines TO authenticated;

GRANT TRUNCATE ON imcc_review.deadlines TO authenticated;

GRANT REFERENCES ON imcc_review.deadlines TO authenticated;

GRANT TRIGGER ON imcc_review.deadlines TO authenticated;

GRANT MAINTAIN ON imcc_review.deadlines TO authenticated;

GRANT INSERT ON imcc_review.deadlines TO service_role;

GRANT SELECT ON imcc_review.deadlines TO service_role;

GRANT UPDATE ON imcc_review.deadlines TO service_role;

GRANT DELETE ON imcc_review.deadlines TO service_role;

GRANT TRUNCATE ON imcc_review.deadlines TO service_role;

GRANT REFERENCES ON imcc_review.deadlines TO service_role;

GRANT TRIGGER ON imcc_review.deadlines TO service_role;

GRANT MAINTAIN ON imcc_review.deadlines TO service_role;

GRANT SELECT ON imcc_review.deadlines TO anon;

GRANT INSERT ON imcc_review.courses TO authenticated;

GRANT SELECT ON imcc_review.courses TO authenticated;

GRANT UPDATE ON imcc_review.courses TO authenticated;

GRANT DELETE ON imcc_review.courses TO authenticated;

GRANT TRUNCATE ON imcc_review.courses TO authenticated;

GRANT REFERENCES ON imcc_review.courses TO authenticated;

GRANT TRIGGER ON imcc_review.courses TO authenticated;

GRANT MAINTAIN ON imcc_review.courses TO authenticated;

GRANT INSERT ON imcc_review.courses TO service_role;

GRANT SELECT ON imcc_review.courses TO service_role;

GRANT UPDATE ON imcc_review.courses TO service_role;

GRANT DELETE ON imcc_review.courses TO service_role;

GRANT TRUNCATE ON imcc_review.courses TO service_role;

GRANT REFERENCES ON imcc_review.courses TO service_role;

GRANT TRIGGER ON imcc_review.courses TO service_role;

GRANT MAINTAIN ON imcc_review.courses TO service_role;

GRANT SELECT ON imcc_review.courses TO anon;

GRANT INSERT ON imcc_review.students TO authenticated;

GRANT SELECT ON imcc_review.students TO authenticated;

GRANT UPDATE ON imcc_review.students TO authenticated;

GRANT DELETE ON imcc_review.students TO authenticated;

GRANT TRUNCATE ON imcc_review.students TO authenticated;

GRANT REFERENCES ON imcc_review.students TO authenticated;

GRANT TRIGGER ON imcc_review.students TO authenticated;

GRANT MAINTAIN ON imcc_review.students TO authenticated;

GRANT INSERT ON imcc_review.students TO service_role;

GRANT SELECT ON imcc_review.students TO service_role;

GRANT UPDATE ON imcc_review.students TO service_role;

GRANT DELETE ON imcc_review.students TO service_role;

GRANT TRUNCATE ON imcc_review.students TO service_role;

GRANT REFERENCES ON imcc_review.students TO service_role;

GRANT TRIGGER ON imcc_review.students TO service_role;

GRANT MAINTAIN ON imcc_review.students TO service_role;

GRANT SELECT ON imcc_review.students TO anon;

GRANT INSERT ON imcc_review.faculty_notes TO authenticated;

GRANT SELECT ON imcc_review.faculty_notes TO authenticated;

GRANT UPDATE ON imcc_review.faculty_notes TO authenticated;

GRANT DELETE ON imcc_review.faculty_notes TO authenticated;

GRANT TRUNCATE ON imcc_review.faculty_notes TO authenticated;

GRANT REFERENCES ON imcc_review.faculty_notes TO authenticated;

GRANT TRIGGER ON imcc_review.faculty_notes TO authenticated;

GRANT MAINTAIN ON imcc_review.faculty_notes TO authenticated;

GRANT SELECT ON imcc_review.faculty_notes TO anon;

GRANT INSERT ON imcc_review.accreditation_checklist TO authenticated;

GRANT SELECT ON imcc_review.accreditation_checklist TO authenticated;

GRANT UPDATE ON imcc_review.accreditation_checklist TO authenticated;

GRANT DELETE ON imcc_review.accreditation_checklist TO authenticated;

GRANT TRUNCATE ON imcc_review.accreditation_checklist TO authenticated;

GRANT REFERENCES ON imcc_review.accreditation_checklist TO authenticated;

GRANT TRIGGER ON imcc_review.accreditation_checklist TO authenticated;

GRANT MAINTAIN ON imcc_review.accreditation_checklist TO authenticated;

GRANT SELECT ON imcc_review.accreditation_checklist TO anon;

GRANT INSERT ON imcc_review.department_budgets TO authenticated;

GRANT SELECT ON imcc_review.department_budgets TO authenticated;

GRANT UPDATE ON imcc_review.department_budgets TO authenticated;

GRANT DELETE ON imcc_review.department_budgets TO authenticated;

GRANT TRUNCATE ON imcc_review.department_budgets TO authenticated;

GRANT REFERENCES ON imcc_review.department_budgets TO authenticated;

GRANT TRIGGER ON imcc_review.department_budgets TO authenticated;

GRANT MAINTAIN ON imcc_review.department_budgets TO authenticated;

GRANT SELECT ON imcc_review.department_budgets TO anon;

GRANT INSERT ON imcc_review.grant_funding TO authenticated;

GRANT SELECT ON imcc_review.grant_funding TO authenticated;

GRANT UPDATE ON imcc_review.grant_funding TO authenticated;

GRANT DELETE ON imcc_review.grant_funding TO authenticated;

GRANT TRUNCATE ON imcc_review.grant_funding TO authenticated;

GRANT REFERENCES ON imcc_review.grant_funding TO authenticated;

GRANT TRIGGER ON imcc_review.grant_funding TO authenticated;

GRANT MAINTAIN ON imcc_review.grant_funding TO authenticated;

GRANT SELECT ON imcc_review.grant_funding TO anon;

GRANT INSERT ON imcc_review.course_offerings TO authenticated;

GRANT SELECT ON imcc_review.course_offerings TO authenticated;

GRANT UPDATE ON imcc_review.course_offerings TO authenticated;

GRANT DELETE ON imcc_review.course_offerings TO authenticated;

GRANT TRUNCATE ON imcc_review.course_offerings TO authenticated;

GRANT REFERENCES ON imcc_review.course_offerings TO authenticated;

GRANT TRIGGER ON imcc_review.course_offerings TO authenticated;

GRANT MAINTAIN ON imcc_review.course_offerings TO authenticated;

GRANT INSERT ON imcc_review.course_offerings TO service_role;

GRANT SELECT ON imcc_review.course_offerings TO service_role;

GRANT UPDATE ON imcc_review.course_offerings TO service_role;

GRANT DELETE ON imcc_review.course_offerings TO service_role;

GRANT TRUNCATE ON imcc_review.course_offerings TO service_role;

GRANT REFERENCES ON imcc_review.course_offerings TO service_role;

GRANT TRIGGER ON imcc_review.course_offerings TO service_role;

GRANT MAINTAIN ON imcc_review.course_offerings TO service_role;

GRANT SELECT ON imcc_review.course_offerings TO anon;

GRANT INSERT ON imcc_review.faq_articles TO authenticated;

GRANT SELECT ON imcc_review.faq_articles TO authenticated;

GRANT UPDATE ON imcc_review.faq_articles TO authenticated;

GRANT DELETE ON imcc_review.faq_articles TO authenticated;

GRANT TRUNCATE ON imcc_review.faq_articles TO authenticated;

GRANT REFERENCES ON imcc_review.faq_articles TO authenticated;

GRANT TRIGGER ON imcc_review.faq_articles TO authenticated;

GRANT MAINTAIN ON imcc_review.faq_articles TO authenticated;

GRANT INSERT ON imcc_review.faq_articles TO service_role;

GRANT SELECT ON imcc_review.faq_articles TO service_role;

GRANT UPDATE ON imcc_review.faq_articles TO service_role;

GRANT DELETE ON imcc_review.faq_articles TO service_role;

GRANT TRUNCATE ON imcc_review.faq_articles TO service_role;

GRANT REFERENCES ON imcc_review.faq_articles TO service_role;

GRANT TRIGGER ON imcc_review.faq_articles TO service_role;

GRANT MAINTAIN ON imcc_review.faq_articles TO service_role;

GRANT SELECT ON imcc_review.faq_articles TO anon;

GRANT INSERT ON imcc_review.announcements TO authenticated;

GRANT SELECT ON imcc_review.announcements TO authenticated;

GRANT UPDATE ON imcc_review.announcements TO authenticated;

GRANT DELETE ON imcc_review.announcements TO authenticated;

GRANT TRUNCATE ON imcc_review.announcements TO authenticated;

GRANT REFERENCES ON imcc_review.announcements TO authenticated;

GRANT TRIGGER ON imcc_review.announcements TO authenticated;

GRANT MAINTAIN ON imcc_review.announcements TO authenticated;

GRANT INSERT ON imcc_review.announcements TO service_role;

GRANT SELECT ON imcc_review.announcements TO service_role;

GRANT UPDATE ON imcc_review.announcements TO service_role;

GRANT DELETE ON imcc_review.announcements TO service_role;

GRANT TRUNCATE ON imcc_review.announcements TO service_role;

GRANT REFERENCES ON imcc_review.announcements TO service_role;

GRANT TRIGGER ON imcc_review.announcements TO service_role;

GRANT MAINTAIN ON imcc_review.announcements TO service_role;

GRANT SELECT ON imcc_review.announcements TO anon;

GRANT INSERT ON imcc_review.academic_years TO authenticated;

GRANT SELECT ON imcc_review.academic_years TO authenticated;

GRANT UPDATE ON imcc_review.academic_years TO authenticated;

GRANT DELETE ON imcc_review.academic_years TO authenticated;

GRANT TRUNCATE ON imcc_review.academic_years TO authenticated;

GRANT REFERENCES ON imcc_review.academic_years TO authenticated;

GRANT TRIGGER ON imcc_review.academic_years TO authenticated;

GRANT MAINTAIN ON imcc_review.academic_years TO authenticated;

GRANT INSERT ON imcc_review.academic_years TO service_role;

GRANT SELECT ON imcc_review.academic_years TO service_role;

GRANT UPDATE ON imcc_review.academic_years TO service_role;

GRANT DELETE ON imcc_review.academic_years TO service_role;

GRANT TRUNCATE ON imcc_review.academic_years TO service_role;

GRANT REFERENCES ON imcc_review.academic_years TO service_role;

GRANT TRIGGER ON imcc_review.academic_years TO service_role;

GRANT MAINTAIN ON imcc_review.academic_years TO service_role;

GRANT SELECT ON imcc_review.academic_years TO anon;

GRANT INSERT ON imcc_review.sso_links TO authenticated;

GRANT SELECT ON imcc_review.sso_links TO authenticated;

GRANT UPDATE ON imcc_review.sso_links TO authenticated;

GRANT DELETE ON imcc_review.sso_links TO authenticated;

GRANT TRUNCATE ON imcc_review.sso_links TO authenticated;

GRANT REFERENCES ON imcc_review.sso_links TO authenticated;

GRANT TRIGGER ON imcc_review.sso_links TO authenticated;

GRANT MAINTAIN ON imcc_review.sso_links TO authenticated;

GRANT INSERT ON imcc_review.sso_links TO service_role;

GRANT SELECT ON imcc_review.sso_links TO service_role;

GRANT UPDATE ON imcc_review.sso_links TO service_role;

GRANT DELETE ON imcc_review.sso_links TO service_role;

GRANT TRUNCATE ON imcc_review.sso_links TO service_role;

GRANT REFERENCES ON imcc_review.sso_links TO service_role;

GRANT TRIGGER ON imcc_review.sso_links TO service_role;

GRANT MAINTAIN ON imcc_review.sso_links TO service_role;

GRANT SELECT ON imcc_review.sso_links TO anon;

GRANT INSERT ON imcc_review.profiles TO authenticated;

GRANT SELECT ON imcc_review.profiles TO authenticated;

GRANT DELETE ON imcc_review.profiles TO authenticated;

GRANT TRUNCATE ON imcc_review.profiles TO authenticated;

GRANT REFERENCES ON imcc_review.profiles TO authenticated;

GRANT TRIGGER ON imcc_review.profiles TO authenticated;

GRANT MAINTAIN ON imcc_review.profiles TO authenticated;

GRANT INSERT ON imcc_review.profiles TO service_role;

GRANT SELECT ON imcc_review.profiles TO service_role;

GRANT UPDATE ON imcc_review.profiles TO service_role;

GRANT DELETE ON imcc_review.profiles TO service_role;

GRANT TRUNCATE ON imcc_review.profiles TO service_role;

GRANT REFERENCES ON imcc_review.profiles TO service_role;

GRANT TRIGGER ON imcc_review.profiles TO service_role;

GRANT MAINTAIN ON imcc_review.profiles TO service_role;

GRANT SELECT ON imcc_review.profiles TO anon;

GRANT INSERT ON imcc_review.user_mfa TO service_role;

GRANT SELECT ON imcc_review.user_mfa TO service_role;

GRANT UPDATE ON imcc_review.user_mfa TO service_role;

GRANT DELETE ON imcc_review.user_mfa TO service_role;

GRANT TRUNCATE ON imcc_review.user_mfa TO service_role;

GRANT REFERENCES ON imcc_review.user_mfa TO service_role;

GRANT TRIGGER ON imcc_review.user_mfa TO service_role;

GRANT MAINTAIN ON imcc_review.user_mfa TO service_role;

GRANT INSERT ON imcc_review.faculty_evaluations TO authenticated;

GRANT SELECT ON imcc_review.faculty_evaluations TO authenticated;

GRANT UPDATE ON imcc_review.faculty_evaluations TO authenticated;

GRANT DELETE ON imcc_review.faculty_evaluations TO authenticated;

GRANT TRUNCATE ON imcc_review.faculty_evaluations TO authenticated;

GRANT REFERENCES ON imcc_review.faculty_evaluations TO authenticated;

GRANT TRIGGER ON imcc_review.faculty_evaluations TO authenticated;

GRANT MAINTAIN ON imcc_review.faculty_evaluations TO authenticated;

GRANT INSERT ON imcc_review.faculty_evaluations TO service_role;

GRANT SELECT ON imcc_review.faculty_evaluations TO service_role;

GRANT UPDATE ON imcc_review.faculty_evaluations TO service_role;

GRANT DELETE ON imcc_review.faculty_evaluations TO service_role;

GRANT TRUNCATE ON imcc_review.faculty_evaluations TO service_role;

GRANT REFERENCES ON imcc_review.faculty_evaluations TO service_role;

GRANT TRIGGER ON imcc_review.faculty_evaluations TO service_role;

GRANT MAINTAIN ON imcc_review.faculty_evaluations TO service_role;

GRANT SELECT ON imcc_review.faculty_evaluations TO anon;

GRANT INSERT ON imcc_review.grades TO authenticated;

GRANT SELECT ON imcc_review.grades TO authenticated;

GRANT UPDATE ON imcc_review.grades TO authenticated;

GRANT DELETE ON imcc_review.grades TO authenticated;

GRANT TRUNCATE ON imcc_review.grades TO authenticated;

GRANT REFERENCES ON imcc_review.grades TO authenticated;

GRANT TRIGGER ON imcc_review.grades TO authenticated;

GRANT MAINTAIN ON imcc_review.grades TO authenticated;

GRANT INSERT ON imcc_review.grades TO service_role;

GRANT SELECT ON imcc_review.grades TO service_role;

GRANT UPDATE ON imcc_review.grades TO service_role;

GRANT DELETE ON imcc_review.grades TO service_role;

GRANT TRUNCATE ON imcc_review.grades TO service_role;

GRANT REFERENCES ON imcc_review.grades TO service_role;

GRANT TRIGGER ON imcc_review.grades TO service_role;

GRANT MAINTAIN ON imcc_review.grades TO service_role;

GRANT SELECT ON imcc_review.grades TO anon;

GRANT INSERT ON imcc_review.installments TO service_role;

GRANT SELECT ON imcc_review.installments TO service_role;

GRANT UPDATE ON imcc_review.installments TO service_role;

GRANT DELETE ON imcc_review.installments TO service_role;

GRANT TRUNCATE ON imcc_review.installments TO service_role;

GRANT REFERENCES ON imcc_review.installments TO service_role;

GRANT TRIGGER ON imcc_review.installments TO service_role;

GRANT MAINTAIN ON imcc_review.installments TO service_role;

GRANT SELECT ON imcc_review.installments TO authenticated;

GRANT INSERT ON imcc_review.billing_summary TO authenticated;

GRANT SELECT ON imcc_review.billing_summary TO authenticated;

GRANT UPDATE ON imcc_review.billing_summary TO authenticated;

GRANT DELETE ON imcc_review.billing_summary TO authenticated;

GRANT TRUNCATE ON imcc_review.billing_summary TO authenticated;

GRANT REFERENCES ON imcc_review.billing_summary TO authenticated;

GRANT TRIGGER ON imcc_review.billing_summary TO authenticated;

GRANT MAINTAIN ON imcc_review.billing_summary TO authenticated;

GRANT INSERT ON imcc_review.billing_summary TO service_role;

GRANT SELECT ON imcc_review.billing_summary TO service_role;

GRANT UPDATE ON imcc_review.billing_summary TO service_role;

GRANT DELETE ON imcc_review.billing_summary TO service_role;

GRANT TRUNCATE ON imcc_review.billing_summary TO service_role;

GRANT REFERENCES ON imcc_review.billing_summary TO service_role;

GRANT TRIGGER ON imcc_review.billing_summary TO service_role;

GRANT MAINTAIN ON imcc_review.billing_summary TO service_role;

GRANT SELECT ON imcc_review.billing_summary TO anon;

GRANT INSERT ON imcc_review.teacher_assignments TO authenticated;

GRANT SELECT ON imcc_review.teacher_assignments TO authenticated;

GRANT UPDATE ON imcc_review.teacher_assignments TO authenticated;

GRANT DELETE ON imcc_review.teacher_assignments TO authenticated;

GRANT TRUNCATE ON imcc_review.teacher_assignments TO authenticated;

GRANT REFERENCES ON imcc_review.teacher_assignments TO authenticated;

GRANT TRIGGER ON imcc_review.teacher_assignments TO authenticated;

GRANT MAINTAIN ON imcc_review.teacher_assignments TO authenticated;

GRANT SELECT ON imcc_review.teacher_assignments TO anon;

GRANT INSERT ON imcc_review.system_settings TO authenticated;

GRANT SELECT ON imcc_review.system_settings TO authenticated;

GRANT UPDATE ON imcc_review.system_settings TO authenticated;

GRANT DELETE ON imcc_review.system_settings TO authenticated;

GRANT TRUNCATE ON imcc_review.system_settings TO authenticated;

GRANT REFERENCES ON imcc_review.system_settings TO authenticated;

GRANT TRIGGER ON imcc_review.system_settings TO authenticated;

GRANT MAINTAIN ON imcc_review.system_settings TO authenticated;

GRANT INSERT ON imcc_review.system_settings TO service_role;

GRANT SELECT ON imcc_review.system_settings TO service_role;

GRANT UPDATE ON imcc_review.system_settings TO service_role;

GRANT DELETE ON imcc_review.system_settings TO service_role;

GRANT TRUNCATE ON imcc_review.system_settings TO service_role;

GRANT REFERENCES ON imcc_review.system_settings TO service_role;

GRANT TRIGGER ON imcc_review.system_settings TO service_role;

GRANT MAINTAIN ON imcc_review.system_settings TO service_role;

GRANT SELECT ON imcc_review.system_settings TO anon;

GRANT INSERT ON imcc_review.chat_logs TO authenticated;

GRANT SELECT ON imcc_review.chat_logs TO authenticated;

GRANT UPDATE ON imcc_review.chat_logs TO authenticated;

GRANT DELETE ON imcc_review.chat_logs TO authenticated;

GRANT TRUNCATE ON imcc_review.chat_logs TO authenticated;

GRANT REFERENCES ON imcc_review.chat_logs TO authenticated;

GRANT TRIGGER ON imcc_review.chat_logs TO authenticated;

GRANT MAINTAIN ON imcc_review.chat_logs TO authenticated;

GRANT INSERT ON imcc_review.chat_logs TO service_role;

GRANT SELECT ON imcc_review.chat_logs TO service_role;

GRANT UPDATE ON imcc_review.chat_logs TO service_role;

GRANT DELETE ON imcc_review.chat_logs TO service_role;

GRANT TRUNCATE ON imcc_review.chat_logs TO service_role;

GRANT REFERENCES ON imcc_review.chat_logs TO service_role;

GRANT TRIGGER ON imcc_review.chat_logs TO service_role;

GRANT MAINTAIN ON imcc_review.chat_logs TO service_role;

GRANT SELECT ON imcc_review.chat_logs TO anon;

GRANT INSERT ON imcc_review.teacher_assigned_subjects TO authenticated;

GRANT SELECT ON imcc_review.teacher_assigned_subjects TO authenticated;

GRANT UPDATE ON imcc_review.teacher_assigned_subjects TO authenticated;

GRANT DELETE ON imcc_review.teacher_assigned_subjects TO authenticated;

GRANT TRUNCATE ON imcc_review.teacher_assigned_subjects TO authenticated;

GRANT REFERENCES ON imcc_review.teacher_assigned_subjects TO authenticated;

GRANT TRIGGER ON imcc_review.teacher_assigned_subjects TO authenticated;

GRANT MAINTAIN ON imcc_review.teacher_assigned_subjects TO authenticated;

GRANT SELECT ON imcc_review.teacher_assigned_subjects TO anon;

GRANT INSERT ON imcc_review.teacher_subject_dropdown TO authenticated;

GRANT SELECT ON imcc_review.teacher_subject_dropdown TO authenticated;

GRANT UPDATE ON imcc_review.teacher_subject_dropdown TO authenticated;

GRANT DELETE ON imcc_review.teacher_subject_dropdown TO authenticated;

GRANT TRUNCATE ON imcc_review.teacher_subject_dropdown TO authenticated;

GRANT REFERENCES ON imcc_review.teacher_subject_dropdown TO authenticated;

GRANT TRIGGER ON imcc_review.teacher_subject_dropdown TO authenticated;

GRANT MAINTAIN ON imcc_review.teacher_subject_dropdown TO authenticated;

GRANT SELECT ON imcc_review.teacher_subject_dropdown TO anon;

GRANT SELECT ON SEQUENCE imcc_review.academic_years_id_seq TO authenticated;

GRANT UPDATE ON SEQUENCE imcc_review.academic_years_id_seq TO authenticated;

GRANT USAGE ON SEQUENCE imcc_review.academic_years_id_seq TO authenticated;

GRANT SELECT ON SEQUENCE imcc_review.academic_years_id_seq TO service_role;

GRANT UPDATE ON SEQUENCE imcc_review.academic_years_id_seq TO service_role;

GRANT USAGE ON SEQUENCE imcc_review.academic_years_id_seq TO service_role;

GRANT SELECT ON SEQUENCE imcc_review.academic_years_id_seq TO anon;

GRANT USAGE ON SEQUENCE imcc_review.academic_years_id_seq TO anon;

GRANT SELECT ON SEQUENCE imcc_review.sections_id_seq TO authenticated;

GRANT UPDATE ON SEQUENCE imcc_review.sections_id_seq TO authenticated;

GRANT USAGE ON SEQUENCE imcc_review.sections_id_seq TO authenticated;

GRANT SELECT ON SEQUENCE imcc_review.sections_id_seq TO service_role;

GRANT UPDATE ON SEQUENCE imcc_review.sections_id_seq TO service_role;

GRANT USAGE ON SEQUENCE imcc_review.sections_id_seq TO service_role;

GRANT SELECT ON SEQUENCE imcc_review.sections_id_seq TO anon;

GRANT USAGE ON SEQUENCE imcc_review.sections_id_seq TO anon;

GRANT SELECT ON SEQUENCE imcc_review.system_settings_id_seq TO authenticated;

GRANT UPDATE ON SEQUENCE imcc_review.system_settings_id_seq TO authenticated;

GRANT USAGE ON SEQUENCE imcc_review.system_settings_id_seq TO authenticated;

GRANT SELECT ON SEQUENCE imcc_review.system_settings_id_seq TO service_role;

GRANT UPDATE ON SEQUENCE imcc_review.system_settings_id_seq TO service_role;

GRANT USAGE ON SEQUENCE imcc_review.system_settings_id_seq TO service_role;

GRANT SELECT ON SEQUENCE imcc_review.system_settings_id_seq TO anon;

GRANT USAGE ON SEQUENCE imcc_review.system_settings_id_seq TO anon;

GRANT SELECT ON SEQUENCE imcc_review.sso_links_id_seq TO authenticated;

GRANT UPDATE ON SEQUENCE imcc_review.sso_links_id_seq TO authenticated;

GRANT USAGE ON SEQUENCE imcc_review.sso_links_id_seq TO authenticated;

GRANT SELECT ON SEQUENCE imcc_review.sso_links_id_seq TO service_role;

GRANT UPDATE ON SEQUENCE imcc_review.sso_links_id_seq TO service_role;

GRANT USAGE ON SEQUENCE imcc_review.sso_links_id_seq TO service_role;

GRANT SELECT ON SEQUENCE imcc_review.sso_links_id_seq TO anon;

GRANT USAGE ON SEQUENCE imcc_review.sso_links_id_seq TO anon;

GRANT SELECT ON SEQUENCE imcc_review.grading_scale_id_seq TO authenticated;

GRANT UPDATE ON SEQUENCE imcc_review.grading_scale_id_seq TO authenticated;

GRANT USAGE ON SEQUENCE imcc_review.grading_scale_id_seq TO authenticated;

GRANT SELECT ON SEQUENCE imcc_review.grading_scale_id_seq TO anon;

GRANT USAGE ON SEQUENCE imcc_review.grading_scale_id_seq TO anon;

GRANT SELECT ON SEQUENCE imcc_review.course_offerings_id_seq TO authenticated;

GRANT UPDATE ON SEQUENCE imcc_review.course_offerings_id_seq TO authenticated;

GRANT USAGE ON SEQUENCE imcc_review.course_offerings_id_seq TO authenticated;

GRANT SELECT ON SEQUENCE imcc_review.course_offerings_id_seq TO service_role;

GRANT UPDATE ON SEQUENCE imcc_review.course_offerings_id_seq TO service_role;

GRANT USAGE ON SEQUENCE imcc_review.course_offerings_id_seq TO service_role;

GRANT SELECT ON SEQUENCE imcc_review.course_offerings_id_seq TO anon;

GRANT USAGE ON SEQUENCE imcc_review.course_offerings_id_seq TO anon;

GRANT SELECT ON SEQUENCE imcc_review.misc_fees_id_seq TO authenticated;

GRANT UPDATE ON SEQUENCE imcc_review.misc_fees_id_seq TO authenticated;

GRANT USAGE ON SEQUENCE imcc_review.misc_fees_id_seq TO authenticated;

GRANT SELECT ON SEQUENCE imcc_review.misc_fees_id_seq TO service_role;

GRANT UPDATE ON SEQUENCE imcc_review.misc_fees_id_seq TO service_role;

GRANT USAGE ON SEQUENCE imcc_review.misc_fees_id_seq TO service_role;

GRANT SELECT ON SEQUENCE imcc_review.misc_fees_id_seq TO anon;

GRANT USAGE ON SEQUENCE imcc_review.misc_fees_id_seq TO anon;

GRANT SELECT ON SEQUENCE imcc_review.rooms_id_seq TO authenticated;

GRANT UPDATE ON SEQUENCE imcc_review.rooms_id_seq TO authenticated;

GRANT USAGE ON SEQUENCE imcc_review.rooms_id_seq TO authenticated;

GRANT SELECT ON SEQUENCE imcc_review.rooms_id_seq TO service_role;

GRANT UPDATE ON SEQUENCE imcc_review.rooms_id_seq TO service_role;

GRANT USAGE ON SEQUENCE imcc_review.rooms_id_seq TO service_role;

GRANT SELECT ON SEQUENCE imcc_review.rooms_id_seq TO anon;

GRANT USAGE ON SEQUENCE imcc_review.rooms_id_seq TO anon;

GRANT SELECT ON SEQUENCE imcc_review.timetable_id_seq TO authenticated;

GRANT UPDATE ON SEQUENCE imcc_review.timetable_id_seq TO authenticated;

GRANT USAGE ON SEQUENCE imcc_review.timetable_id_seq TO authenticated;

GRANT SELECT ON SEQUENCE imcc_review.timetable_id_seq TO service_role;

GRANT UPDATE ON SEQUENCE imcc_review.timetable_id_seq TO service_role;

GRANT USAGE ON SEQUENCE imcc_review.timetable_id_seq TO service_role;

GRANT SELECT ON SEQUENCE imcc_review.timetable_id_seq TO anon;

GRANT USAGE ON SEQUENCE imcc_review.timetable_id_seq TO anon;

GRANT SELECT ON SEQUENCE imcc_review.departments_id_seq TO authenticated;

GRANT UPDATE ON SEQUENCE imcc_review.departments_id_seq TO authenticated;

GRANT USAGE ON SEQUENCE imcc_review.departments_id_seq TO authenticated;

GRANT SELECT ON SEQUENCE imcc_review.departments_id_seq TO service_role;

GRANT UPDATE ON SEQUENCE imcc_review.departments_id_seq TO service_role;

GRANT USAGE ON SEQUENCE imcc_review.departments_id_seq TO service_role;

GRANT SELECT ON SEQUENCE imcc_review.departments_id_seq TO anon;

GRANT USAGE ON SEQUENCE imcc_review.departments_id_seq TO anon;

GRANT INSERT ON imcc_review.v_grade_history TO authenticated;

GRANT SELECT ON imcc_review.v_grade_history TO authenticated;

GRANT UPDATE ON imcc_review.v_grade_history TO authenticated;

GRANT DELETE ON imcc_review.v_grade_history TO authenticated;

GRANT TRUNCATE ON imcc_review.v_grade_history TO authenticated;

GRANT REFERENCES ON imcc_review.v_grade_history TO authenticated;

GRANT TRIGGER ON imcc_review.v_grade_history TO authenticated;

GRANT MAINTAIN ON imcc_review.v_grade_history TO authenticated;

GRANT SELECT ON imcc_review.v_grade_history TO anon;

GRANT INSERT ON imcc_review.grade_history TO authenticated;

GRANT SELECT ON imcc_review.grade_history TO authenticated;

GRANT UPDATE ON imcc_review.grade_history TO authenticated;

GRANT DELETE ON imcc_review.grade_history TO authenticated;

GRANT TRUNCATE ON imcc_review.grade_history TO authenticated;

GRANT REFERENCES ON imcc_review.grade_history TO authenticated;

GRANT TRIGGER ON imcc_review.grade_history TO authenticated;

GRANT MAINTAIN ON imcc_review.grade_history TO authenticated;

GRANT SELECT ON imcc_review.grade_history TO anon;

GRANT INSERT ON imcc_review.instructor_evaluation_summary TO authenticated;

GRANT SELECT ON imcc_review.instructor_evaluation_summary TO authenticated;

GRANT UPDATE ON imcc_review.instructor_evaluation_summary TO authenticated;

GRANT DELETE ON imcc_review.instructor_evaluation_summary TO authenticated;

GRANT TRUNCATE ON imcc_review.instructor_evaluation_summary TO authenticated;

GRANT REFERENCES ON imcc_review.instructor_evaluation_summary TO authenticated;

GRANT TRIGGER ON imcc_review.instructor_evaluation_summary TO authenticated;

GRANT MAINTAIN ON imcc_review.instructor_evaluation_summary TO authenticated;

GRANT INSERT ON imcc_review.instructor_evaluation_summary TO service_role;

GRANT SELECT ON imcc_review.instructor_evaluation_summary TO service_role;

GRANT UPDATE ON imcc_review.instructor_evaluation_summary TO service_role;

GRANT DELETE ON imcc_review.instructor_evaluation_summary TO service_role;

GRANT TRUNCATE ON imcc_review.instructor_evaluation_summary TO service_role;

GRANT REFERENCES ON imcc_review.instructor_evaluation_summary TO service_role;

GRANT TRIGGER ON imcc_review.instructor_evaluation_summary TO service_role;

GRANT MAINTAIN ON imcc_review.instructor_evaluation_summary TO service_role;

GRANT SELECT ON imcc_review.instructor_evaluation_summary TO anon;

GRANT INSERT ON imcc_review.teacher_subject_students TO authenticated;

GRANT SELECT ON imcc_review.teacher_subject_students TO authenticated;

GRANT UPDATE ON imcc_review.teacher_subject_students TO authenticated;

GRANT DELETE ON imcc_review.teacher_subject_students TO authenticated;

GRANT TRUNCATE ON imcc_review.teacher_subject_students TO authenticated;

GRANT REFERENCES ON imcc_review.teacher_subject_students TO authenticated;

GRANT TRIGGER ON imcc_review.teacher_subject_students TO authenticated;

GRANT MAINTAIN ON imcc_review.teacher_subject_students TO authenticated;

GRANT UPDATE (full_name) ON imcc_review.profiles TO authenticated;

GRANT UPDATE (avatar_url) ON imcc_review.profiles TO authenticated;

GRANT UPDATE (phone) ON imcc_review.profiles TO authenticated;

GRANT UPDATE (address) ON imcc_review.profiles TO authenticated;

REVOKE ALL ON FUNCTION imcc_review.get_subject_instructor_options() FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION imcc_review.admin_set_profile_access(p_profile_id uuid, p_role text, p_status text) FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION imcc_review.handle_new_user() FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION imcc_review.rls_auto_enable() FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION imcc_review.save_course_offering_with_instructor(p_offering_id integer, p_code text, p_title text, p_units numeric, p_program text, p_year integer, p_semester text, p_school_year text, p_schedule text, p_instructor_id uuid) FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION imcc_review.initialize_student_clearances(target_student_id uuid) FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION imcc_review.calculate_remark(percentage numeric) FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION imcc_review.review_enrollment_request(p_request_id uuid, p_decision text, p_review_note text) FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION imcc_review.sync_student_term_on_enroll() FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION imcc_review.calculate_equivalent(percentage numeric) FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION imcc_review.handle_new_sso_user() FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION imcc_review.seed_student_demo_data(target_student_id uuid) FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION imcc_review.get_user_role() FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION imcc_review.is_admin() FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION imcc_review.auto_create_student_semester() FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION imcc_review.is_staff_or_faculty() FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION imcc_review.revert_grade(p_history_id uuid, p_reason text) FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION imcc_review.get_my_role() FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION imcc_review.is_mfa_compliant() FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION imcc_review.match_faq_articles(query_embedding vector, match_threshold double precision, match_count integer) FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION imcc_review.set_updated_at() FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION imcc_review.match_faq_articles(query_embedding vector, match_count integer, match_threshold double precision) FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION imcc_review.archive_grade_change() FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION imcc_review_private.review_enrollment_request(p_request_id uuid, p_decision text, p_review_note text) FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION imcc_review_private.cancel_enrollment_request(p_request_id uuid) FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION imcc_review.cancel_enrollment_request(p_request_id uuid) FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION imcc_review.update_grade_calculations() FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION imcc_review.sync_teacher_assignment() FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION imcc_review.get_subject_instructor_options() TO authenticated;

GRANT EXECUTE ON FUNCTION imcc_review.admin_set_profile_access(p_profile_id uuid, p_role text, p_status text) TO authenticated;

GRANT EXECUTE ON FUNCTION imcc_review.handle_new_user() TO service_role;

GRANT EXECUTE ON FUNCTION imcc_review.save_course_offering_with_instructor(p_offering_id integer, p_code text, p_title text, p_units numeric, p_program text, p_year integer, p_semester text, p_school_year text, p_schedule text, p_instructor_id uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION imcc_review.initialize_student_clearances(target_student_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION imcc_review.calculate_remark(percentage numeric) TO PUBLIC;

GRANT EXECUTE ON FUNCTION imcc_review.calculate_remark(percentage numeric) TO authenticated;

GRANT EXECUTE ON FUNCTION imcc_review.review_enrollment_request(p_request_id uuid, p_decision text, p_review_note text) TO authenticated;

GRANT EXECUTE ON FUNCTION imcc_review.calculate_equivalent(percentage numeric) TO PUBLIC;

GRANT EXECUTE ON FUNCTION imcc_review.calculate_equivalent(percentage numeric) TO authenticated;

GRANT EXECUTE ON FUNCTION imcc_review.handle_new_sso_user() TO service_role;

GRANT EXECUTE ON FUNCTION imcc_review.seed_student_demo_data(target_student_id uuid) TO PUBLIC;

GRANT EXECUTE ON FUNCTION imcc_review.seed_student_demo_data(target_student_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION imcc_review.seed_student_demo_data(target_student_id uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION imcc_review.get_user_role() TO PUBLIC;

GRANT EXECUTE ON FUNCTION imcc_review.get_user_role() TO service_role;

GRANT EXECUTE ON FUNCTION imcc_review.get_user_role() TO authenticated;

GRANT EXECUTE ON FUNCTION imcc_review.is_admin() TO service_role;

GRANT EXECUTE ON FUNCTION imcc_review.is_admin() TO authenticated;

GRANT EXECUTE ON FUNCTION imcc_review.is_staff_or_faculty() TO authenticated;

GRANT EXECUTE ON FUNCTION imcc_review.revert_grade(p_history_id uuid, p_reason text) TO authenticated;

GRANT EXECUTE ON FUNCTION imcc_review.get_my_role() TO authenticated;

GRANT EXECUTE ON FUNCTION imcc_review.is_mfa_compliant() TO authenticated;

GRANT EXECUTE ON FUNCTION imcc_review.is_mfa_compliant() TO service_role;

GRANT EXECUTE ON FUNCTION imcc_review.match_faq_articles(query_embedding vector, match_threshold double precision, match_count integer) TO PUBLIC;

GRANT EXECUTE ON FUNCTION imcc_review.match_faq_articles(query_embedding vector, match_threshold double precision, match_count integer) TO service_role;

GRANT EXECUTE ON FUNCTION imcc_review.match_faq_articles(query_embedding vector, match_threshold double precision, match_count integer) TO authenticated;

GRANT EXECUTE ON FUNCTION imcc_review.match_faq_articles(query_embedding vector, match_count integer, match_threshold double precision) TO PUBLIC;

GRANT EXECUTE ON FUNCTION imcc_review.match_faq_articles(query_embedding vector, match_count integer, match_threshold double precision) TO authenticated;

GRANT EXECUTE ON FUNCTION imcc_review.match_faq_articles(query_embedding vector, match_count integer, match_threshold double precision) TO service_role;

GRANT EXECUTE ON FUNCTION imcc_review_private.review_enrollment_request(p_request_id uuid, p_decision text, p_review_note text) TO authenticated;

GRANT EXECUTE ON FUNCTION imcc_review_private.cancel_enrollment_request(p_request_id uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION imcc_review.cancel_enrollment_request(p_request_id uuid) TO authenticated;

-- Production migration: promote role workflows verified in the isolated test project.
-- No demo accounts, test rows, or assistant/Edge Function changes are included.

-- Source: supabase\migrations\20261015144016_enrollment_request_approval.sql
-- Students request; approved active staff/deans finalize through the existing review RPC.
CREATE TABLE imcc_review.enrollment_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 student_id uuid NOT NULL REFERENCES imcc_review.profiles(id),
 offering_id integer NOT NULL REFERENCES imcc_review.course_offerings(id),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now(),
 reviewed_by uuid REFERENCES imcc_review.profiles(id),
 reviewed_at timestamptz,
 review_note text CHECK (char_length(review_note)<=1000),
 cancelled_at timestamptz
);
CREATE UNIQUE INDEX enrollment_requests_pending_unique ON imcc_review.enrollment_requests(student_id,offering_id) WHERE status='pending';
CREATE INDEX enrollment_requests_offering_idx ON imcc_review.enrollment_requests(offering_id);
CREATE INDEX enrollment_requests_reviewer_idx ON imcc_review.enrollment_requests(reviewed_by);
ALTER TABLE imcc_review.enrollment_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON imcc_review.enrollment_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON imcc_review.enrollment_requests TO authenticated;
GRANT ALL ON imcc_review.enrollment_requests TO service_role;
CREATE POLICY students_read_requests ON imcc_review.enrollment_requests FOR SELECT TO authenticated USING (student_id=(SELECT auth.uid()));
CREATE POLICY students_submit_requests ON imcc_review.enrollment_requests FOR INSERT TO authenticated WITH CHECK (
 student_id=(SELECT auth.uid()) AND status='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL
 AND review_note IS NULL AND cancelled_at IS NULL
 AND EXISTS(SELECT 1 FROM imcc_review.profiles p WHERE p.id=(SELECT auth.uid()) AND p.role='student' AND p.status='approved' AND p.is_active IS TRUE)
 AND NOT EXISTS(SELECT 1 FROM imcc_review.enrollments e WHERE e.student_id=(SELECT auth.uid()) AND e.offering_id=enrollment_requests.offering_id AND e.status IN ('enrolled','completed'))
);
CREATE POLICY requests_mfa ON imcc_review.enrollment_requests AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT imcc_review.is_mfa_compliant())) WITH CHECK ((SELECT imcc_review.is_mfa_compliant()));
GRANT USAGE ON SCHEMA imcc_review_private TO authenticated;
CREATE OR REPLACE FUNCTION imcc_review_private.review_enrollment_request(p_request_id uuid, p_decision text, p_review_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_request imcc_review.enrollment_requests%ROWTYPE;
  v_student_eligible boolean;
  v_enrollment_id uuid;
BEGIN
  IF v_actor IS NULL OR NOT imcc_review.is_mfa_compliant() THEN
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
    FROM imcc_review.profiles p
    WHERE p.id = v_actor
      AND p.role = ANY (ARRAY['admin', 'dean', 'registrar', 'staff'])
      AND p.status = 'approved'
      AND p.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'Approved active enrollment reviewer access required' USING ERRCODE = '42501';
  END IF;

  SELECT r.*
  INTO v_request
  FROM imcc_review.enrollment_requests r
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
    FROM imcc_review.profiles p
    WHERE p.id = v_request.student_id
    FOR UPDATE;

    SELECT EXISTS (
      SELECT 1
      FROM imcc_review.profiles p
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
      FROM imcc_review.enrollments e
      WHERE e.student_id = v_request.student_id
        AND e.offering_id = v_request.offering_id
        AND e.status IN ('enrolled', 'completed')
    ) THEN
      RAISE EXCEPTION 'Student already has an enrolled or completed record for this offering' USING ERRCODE = '23505';
    END IF;

    INSERT INTO imcc_review.enrollments (student_id, offering_id, status)
    VALUES (v_request.student_id, v_request.offering_id, 'enrolled')
    RETURNING id INTO v_enrollment_id;
  END IF;

  UPDATE imcc_review.enrollment_requests r
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
$function$;

CREATE OR REPLACE FUNCTION imcc_review_private.list_enrollment_requests() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.created_at),'[]'::jsonb) FROM (
 SELECT r.id,r.created_at,p.full_name AS student_name,p.student_no,o.code,o.title,o.school_year,o.semester
 FROM imcc_review.enrollment_requests r JOIN imcc_review.profiles p ON p.id=r.student_id JOIN imcc_review.course_offerings o ON o.id=r.offering_id
 WHERE r.status='pending' AND imcc_review.is_mfa_compliant() AND EXISTS (
 SELECT 1 FROM imcc_review.profiles actor WHERE actor.id=(SELECT auth.uid()) AND actor.role IN ('dean','admin','staff','registrar') AND actor.status='approved' AND actor.is_active IS TRUE)
 ) q;
$$;
CREATE OR REPLACE FUNCTION imcc_review.list_enrollment_requests() RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT imcc_review_private.list_enrollment_requests(); $$;
REVOKE ALL ON FUNCTION imcc_review_private.list_enrollment_requests(),imcc_review.list_enrollment_requests() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION imcc_review_private.list_enrollment_requests(),imcc_review.list_enrollment_requests() TO authenticated;


-- Source: supabase\migrations\20261015150353_enrollment_review_student_groups.sql
-- Enrich the existing reviewer-only queue without widening table access.
CREATE OR REPLACE FUNCTION imcc_review_private.list_enrollment_requests() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH pending AS (
   SELECT r.* FROM imcc_review.enrollment_requests r
   WHERE r.status='pending' AND imcc_review.is_mfa_compliant() AND EXISTS (
     SELECT 1 FROM imcc_review.profiles actor WHERE actor.id=(SELECT auth.uid())
       AND actor.role IN ('dean','admin','staff','registrar')
       AND actor.status='approved' AND actor.is_active IS TRUE)
 ), enrolled AS (
   SELECT e.student_id,o.school_year,o.semester,sum(o.units) AS enrolled_units,
     jsonb_agg(jsonb_build_object('code',o.code,'title',o.title,'schedule',o.schedule,'units',o.units) ORDER BY o.code,o.id) AS enrolled_courses
   FROM imcc_review.enrollments e JOIN imcc_review.course_offerings o ON o.id=e.offering_id
   WHERE e.status='enrolled' AND e.student_id IN (SELECT student_id FROM pending)
   GROUP BY e.student_id,o.school_year,o.semester
 )
 SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.created_at,q.id),'[]'::jsonb) FROM (
   SELECT r.id,r.created_at,r.student_id,p.full_name AS student_name,p.student_no,p.program,p.year_level,p.section,
     o.code,o.title,o.school_year,o.semester,o.schedule,o.units,
     coalesce(e.enrolled_units,0) AS enrolled_units,coalesce(e.enrolled_courses,'[]'::jsonb) AS enrolled_courses
   FROM pending r JOIN imcc_review.profiles p ON p.id=r.student_id JOIN imcc_review.course_offerings o ON o.id=r.offering_id
   LEFT JOIN enrolled e ON e.student_id=r.student_id AND e.school_year=o.school_year AND e.semester=o.semester
 ) q;
$$;
REVOKE ALL ON FUNCTION imcc_review_private.list_enrollment_requests() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION imcc_review_private.list_enrollment_requests() TO authenticated;


-- Source: supabase\migrations\20261015152431_dean_self_teaching.sql
CREATE OR REPLACE FUNCTION imcc_review.get_subject_instructor_options()
 RETURNS TABLE(id uuid, full_name text, role text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'imcc_review', 'pg_catalog'
AS $function$
DECLARE
  v_caller_role TEXT;
  v_caller_status TEXT;
  v_caller_active BOOLEAN;
BEGIN
  -- Verify caller is authenticated and is an approved, active dean
  SELECT p.role, p.status, COALESCE(p.is_active, true)
  INTO v_caller_role, v_caller_status, v_caller_active
  FROM imcc_review.profiles p
  WHERE p.id = auth.uid();

  IF v_caller_role IS DISTINCT FROM 'dean' OR v_caller_status IS DISTINCT FROM 'approved' OR v_caller_active IS NOT TRUE THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.id, p.full_name, p.role
  FROM imcc_review.profiles p
  WHERE (p.role IN ('teacher', 'faculty') OR (p.role='dean' AND p.id=auth.uid()))
    AND p.status = 'approved'
    AND COALESCE(p.is_active, true) = true
  ORDER BY p.full_name ASC;
END;
$function$;

CREATE OR REPLACE FUNCTION imcc_review.save_course_offering_with_instructor(p_offering_id integer DEFAULT NULL::integer, p_code text DEFAULT NULL::text, p_title text DEFAULT NULL::text, p_units numeric DEFAULT 3.0, p_program text DEFAULT NULL::text, p_year integer DEFAULT 1, p_semester text DEFAULT NULL::text, p_school_year text DEFAULT NULL::text, p_schedule text DEFAULT NULL::text, p_instructor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'imcc_review', 'pg_catalog'
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
  FROM imcc_review.profiles p
  WHERE p.id = v_caller_id;

  IF v_caller_role IS DISTINCT FROM 'dean' OR v_caller_status IS DISTINCT FROM 'approved' OR v_caller_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Access denied: only approved active deans can assign instructors to course offerings';
  END IF;

  -- 3. Instructor eligibility check: must be approved active teacher or faculty
  IF p_instructor_id IS NULL THEN
    RAISE EXCEPTION 'An eligible instructor must be selected';
  END IF;

  SELECT p.full_name, p.role, p.status, COALESCE(p.is_active, true)
  INTO v_instructor_name, v_instructor_role, v_instructor_status, v_instructor_active
  FROM imcc_review.profiles p
  WHERE p.id = p_instructor_id;

  IF v_instructor_name IS NULL THEN
    RAISE EXCEPTION 'Selected instructor profile not found';
  END IF;

  IF NOT (v_instructor_role IN ('teacher', 'faculty') OR (v_instructor_role='dean' AND p_instructor_id=v_caller_id)) OR v_instructor_status IS DISTINCT FROM 'approved' OR v_instructor_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Select an approved active teacher, faculty member, or yourself';
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
    INSERT INTO imcc_review.course_offerings (
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
    IF NOT EXISTS (SELECT 1 FROM imcc_review.course_offerings WHERE id = p_offering_id) THEN
      RAISE EXCEPTION 'Course offering % not found', p_offering_id;
    END IF;

    UPDATE imcc_review.course_offerings
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
    UPDATE imcc_review.teacher_assignments
    SET is_active = false
    WHERE offering_id = v_offering_id;
  END IF;

  -- 5. Upsert active assignment in teacher_assignments
  INSERT INTO imcc_review.teacher_assignments (
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
  FROM imcc_review.course_offerings co
  WHERE co.id = v_offering_id;

  RETURN v_result;
END;
$function$;


-- Source: supabase\migrations\20261015154210_assignment_managers_and_rosters.sql
-- Restrictive policies also cover any remaining permissive offering-write policies.
CREATE POLICY offering_insert_managers ON imcc_review.course_offerings AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM imcc_review.profiles p WHERE p.id=(SELECT auth.uid()) AND p.role IN ('dean','admin') AND p.status='approved' AND p.is_active IS TRUE));
CREATE POLICY offering_update_managers ON imcc_review.course_offerings AS RESTRICTIVE FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM imcc_review.profiles p WHERE p.id=(SELECT auth.uid()) AND p.role IN ('dean','admin') AND p.status='approved' AND p.is_active IS TRUE)) WITH CHECK (EXISTS (SELECT 1 FROM imcc_review.profiles p WHERE p.id=(SELECT auth.uid()) AND p.role IN ('dean','admin') AND p.status='approved' AND p.is_active IS TRUE));
CREATE POLICY offering_delete_managers ON imcc_review.course_offerings AS RESTRICTIVE FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM imcc_review.profiles p WHERE p.id=(SELECT auth.uid()) AND p.role IN ('dean','admin') AND p.status='approved' AND p.is_active IS TRUE));
CREATE OR REPLACE FUNCTION imcc_review.sync_teacher_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'imcc_review', 'pg_catalog'
AS $function$
BEGIN
  -- The trigger runs with owner privileges, so RLS cannot enforce caller activation here.
  IF auth.uid() IS NOT NULL
     AND auth.role() IS DISTINCT FROM 'service_role'
     AND NOT EXISTS (
       SELECT 1 FROM imcc_review.profiles p
       WHERE p.id = auth.uid()
         AND p.role IN ('dean', 'admin')
         AND p.status = 'approved' AND p.is_active IS TRUE
     ) THEN
    RAISE EXCEPTION 'Approved active dean or admin required to change assignments' USING ERRCODE = '42501';
  END IF;

  IF NEW.instructor_id IS NULL THEN
    UPDATE imcc_review.teacher_assignments
    SET is_active = false
    WHERE offering_id = NEW.id;
  ELSE
    -- Deactivate previous assignments that don't match the new instructor
    UPDATE imcc_review.teacher_assignments
    SET is_active = false
    WHERE offering_id = NEW.id
      AND (
        teacher_id IS DISTINCT FROM NEW.instructor_id
        OR academic_year IS DISTINCT FROM NEW.school_year
        OR semester IS DISTINCT FROM NEW.semester
      );

    -- Upsert active assignment
    INSERT INTO imcc_review.teacher_assignments (
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
      assigned_by = COALESCE(auth.uid(), imcc_review.teacher_assignments.assigned_by),
      updated_at = now();
  END IF;

  RETURN NEW;
END;
$function$;
CREATE FUNCTION imcc_review_private.get_class_roster(p_offering_id integer)
RETURNS TABLE(student_id uuid,profiles jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT e.student_id,jsonb_build_object('id',p.id,'full_name',p.full_name,'student_no',p.student_no,'id_number',p.id_number)
 FROM imcc_review.enrollments e JOIN imcc_review.profiles p ON p.id=e.student_id
 WHERE e.offering_id=p_offering_id AND e.status='enrolled'
 AND imcc_review.is_mfa_compliant() AND EXISTS (
   SELECT 1 FROM imcc_review.profiles actor WHERE actor.id=(SELECT auth.uid())
   AND actor.status='approved' AND actor.is_active IS TRUE
   AND (actor.role IN ('dean','admin') OR (actor.role IN ('teacher','faculty') AND EXISTS (
     SELECT 1 FROM imcc_review.teacher_assignments ta WHERE ta.teacher_id=actor.id AND ta.offering_id=p_offering_id AND ta.is_active IS TRUE))))
 ORDER BY p.full_name,p.id;
$$;
CREATE FUNCTION imcc_review.get_class_roster(p_offering_id integer)
RETURNS TABLE(student_id uuid,profiles jsonb)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT * FROM imcc_review_private.get_class_roster(p_offering_id); $$;
CREATE FUNCTION imcc_review_private.get_dean_student_directory()
RETURNS TABLE(id uuid,full_name text,program text,year_level text,role text,status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT p.id,p.full_name,p.program,p.year_level,p.role,p.status FROM imcc_review.profiles p
 WHERE p.role='student' AND p.status='approved' AND imcc_review.is_mfa_compliant()
 AND EXISTS(SELECT 1 FROM imcc_review.profiles actor WHERE actor.id=(SELECT auth.uid())
   AND actor.role IN ('dean','admin') AND actor.status='approved' AND actor.is_active IS TRUE)
 ORDER BY p.full_name,p.id;
$$;
CREATE FUNCTION imcc_review.get_dean_student_directory()
RETURNS TABLE(id uuid,full_name text,program text,year_level text,role text,status text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT * FROM imcc_review_private.get_dean_student_directory(); $$;
GRANT USAGE ON SCHEMA imcc_review_private TO authenticated;
REVOKE ALL ON FUNCTION imcc_review_private.get_class_roster(integer), imcc_review.get_class_roster(integer), imcc_review_private.get_dean_student_directory(), imcc_review.get_dean_student_directory() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION imcc_review_private.get_class_roster(integer), imcc_review.get_class_roster(integer), imcc_review_private.get_dean_student_directory(), imcc_review.get_dean_student_directory() TO authenticated;


-- Source: supabase\migrations\20261015155745_test_roster_course_access.sql
-- Protect instructor selection at the database boundary; deans use the existing save RPC.
CREATE OR REPLACE FUNCTION imcc_review_private.prevent_teacher_assignment_edits() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_role text; v_active boolean;
BEGIN
 IF auth.uid() IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' THEN RETURN NEW; END IF;
 SELECT p.role,p.status='approved' AND p.is_active IS TRUE INTO v_role,v_active FROM imcc_review.profiles p WHERE p.id=auth.uid();
 IF v_active IS NOT TRUE THEN RAISE EXCEPTION 'Approved active account required' USING ERRCODE='42501'; END IF;
 IF v_role IN ('teacher','faculty') AND
   (NEW.instructor_id IS DISTINCT FROM OLD.instructor_id OR NEW.instructor_name IS DISTINCT FROM OLD.instructor_name) THEN
   RAISE EXCEPTION 'Only deans and admins can change subject instructors' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER prevent_teacher_assignment_edits
BEFORE UPDATE OF instructor_id,instructor_name ON imcc_review.course_offerings
FOR EACH ROW EXECUTE FUNCTION imcc_review_private.prevent_teacher_assignment_edits();

-- Keep a student's course list and request policy consistent with their active program/year.
DROP POLICY students_submit_requests ON imcc_review.enrollment_requests;
CREATE POLICY students_submit_requests ON imcc_review.enrollment_requests FOR INSERT TO authenticated WITH CHECK (
 student_id=(SELECT auth.uid()) AND status='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL
 AND review_note IS NULL AND cancelled_at IS NULL
 AND EXISTS(SELECT 1 FROM imcc_review.profiles p WHERE p.id=(SELECT auth.uid()) AND p.role='student' AND p.status='approved' AND p.is_active IS TRUE
   AND EXISTS(SELECT 1 FROM imcc_review.course_offerings o WHERE o.id=enrollment_requests.offering_id
     AND (o.program IS NULL OR o.program=p.program)
     AND (o.year IS NULL OR o.year=CASE WHEN btrim(coalesce(p.year_level,'')) ~ '^[1-4]' THEN substring(btrim(p.year_level) from 1 for 1)::integer
       WHEN lower(p.year_level) LIKE 'first%' THEN 1 WHEN lower(p.year_level) LIKE 'second%' THEN 2
       WHEN lower(p.year_level) LIKE 'third%' THEN 3 WHEN lower(p.year_level) LIKE 'fourth%' THEN 4 END)))
 AND NOT EXISTS(SELECT 1 FROM imcc_review.enrollments e WHERE e.student_id=(SELECT auth.uid()) AND e.offering_id=enrollment_requests.offering_id AND e.status IN ('enrolled','completed'))
);

-- Prevent the existing cascading foreign keys from silently erasing academic records.
CREATE OR REPLACE FUNCTION imcc_review_private.prevent_used_offering_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM imcc_review.enrollments WHERE offering_id=OLD.id)
 OR EXISTS(SELECT 1 FROM imcc_review.enrollment_requests WHERE offering_id=OLD.id)
 OR EXISTS(SELECT 1 FROM imcc_review.grades WHERE offering_id=OLD.id)
 OR EXISTS(SELECT 1 FROM imcc_review.attendance WHERE offering_id=OLD.id) THEN
   RAISE EXCEPTION 'Cannot delete a subject offering with student enrollment, requests, grades, or attendance. Unassign or archive it instead.' USING ERRCODE='23503';
 END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER prevent_used_offering_delete BEFORE DELETE ON imcc_review.course_offerings
FOR EACH ROW EXECUTE FUNCTION imcc_review_private.prevent_used_offering_delete();

-- Keep the pending queue unchanged; expose decision history only to active enrollment reviewers.
CREATE OR REPLACE FUNCTION imcc_review_private.list_enrollment_request_history(p_status text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH visible AS (
   SELECT r.* FROM imcc_review.enrollment_requests r
   WHERE r.status IN ('pending','approved','rejected')
     AND (p_status='all' OR r.status=p_status)
     AND imcc_review.is_mfa_compliant() AND EXISTS (
       SELECT 1 FROM imcc_review.profiles actor WHERE actor.id=(SELECT auth.uid())
         AND actor.role IN ('dean','admin','staff','registrar')
         AND actor.status='approved' AND actor.is_active IS TRUE)
 ), enrolled AS (
   SELECT e.student_id,o.school_year,o.semester,sum(o.units) AS enrolled_units,
     jsonb_agg(jsonb_build_object('code',o.code,'title',o.title,'schedule',o.schedule,'units',o.units) ORDER BY o.code,o.id) AS enrolled_courses
   FROM imcc_review.enrollments e JOIN imcc_review.course_offerings o ON o.id=e.offering_id
   WHERE e.status='enrolled' AND e.student_id IN (SELECT student_id FROM visible)
   GROUP BY e.student_id,o.school_year,o.semester
 )
 SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.created_at DESC,q.id),'[]'::jsonb) FROM (
   SELECT r.id,r.created_at,r.status,r.review_note,r.reviewed_at,
     r.student_id,p.full_name AS student_name,p.student_no,p.program,p.year_level,p.section,
     o.code,o.title,o.school_year,o.semester,o.schedule,o.units,
     coalesce(e.enrolled_units,0) AS enrolled_units,coalesce(e.enrolled_courses,'[]'::jsonb) AS enrolled_courses
   FROM visible r JOIN imcc_review.profiles p ON p.id=r.student_id
   JOIN imcc_review.course_offerings o ON o.id=r.offering_id
   LEFT JOIN enrolled e ON e.student_id=r.student_id AND e.school_year=o.school_year AND e.semester=o.semester
 ) q;
$$;
CREATE OR REPLACE FUNCTION imcc_review.list_enrollment_request_history(p_status text DEFAULT 'pending')
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT CASE WHEN p_status IN ('pending','approved','rejected','all')
   THEN imcc_review_private.list_enrollment_request_history(p_status) ELSE '[]'::jsonb END;
$$;
REVOKE ALL ON FUNCTION imcc_review_private.list_enrollment_request_history(text),imcc_review.list_enrollment_request_history(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION imcc_review_private.list_enrollment_request_history(text),imcc_review.list_enrollment_request_history(text) TO authenticated;

-- Production promotion: existing percentages remain unchanged pending school review.

ALTER TABLE imcc_review.grades ADD COLUMN grade_scale text NOT NULL DEFAULT 'percentage' CHECK (grade_scale IN ('percentage','school'));
ALTER TABLE imcc_review.grades ALTER COLUMN grade_scale SET DEFAULT 'school';
ALTER TABLE imcc_review.grades ADD COLUMN prediction_method text, ADD COLUMN predicted_at timestamptz;
ALTER TABLE imcc_review.grade_history ADD COLUMN grade_scale text NOT NULL DEFAULT 'percentage',
 ADD COLUMN ai_predicted_equivalent numeric(5,2), ADD COLUMN prediction_method text, ADD COLUMN predicted_at timestamptz;
ALTER TABLE imcc_review.grades DROP CONSTRAINT grades_remark_check;
ALTER TABLE imcc_review.grades ADD CONSTRAINT grades_remark_check CHECK (remark IN ('Passed','Failed','Pending','Dropped','Conditional'));

-- Only the explicitly confirmed legacy correction; stored records are not rewritten.
CREATE OR REPLACE FUNCTION imcc_review.calculate_equivalent(percentage numeric) RETURNS numeric
LANGUAGE plpgsql SET search_path = '' AS $function$
BEGIN
 IF percentage IS NULL THEN RETURN NULL; END IF;
 RETURN CASE WHEN percentage=98 THEN 1.10
 WHEN percentage>=96 THEN 1.00 WHEN percentage>=94 THEN 1.25
 WHEN percentage>=92 THEN 1.50 WHEN percentage>=89 THEN 1.75
 WHEN percentage>=86 THEN 2.00 WHEN percentage>=83 THEN 2.25
 WHEN percentage>=80 THEN 2.50 WHEN percentage>=76 THEN 2.75
 WHEN percentage>=75 THEN 3.00 ELSE 5.00 END;
END;
$function$;

CREATE OR REPLACE FUNCTION imcc_review.update_grade_calculations() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
 v numeric;
 v_estimate numeric;
BEGIN
 IF NEW.grade_scale = 'percentage' THEN
   IF TG_OP = 'INSERT' OR coalesce(pg_catalog.current_setting('app.grade_change_type',true),'') <> 'revert' THEN
     RAISE EXCEPTION 'Legacy percentage records require school review before editing' USING ERRCODE = '23514';
   END IF;
 ELSE
   FOREACH v IN ARRAY ARRAY[NEW.prelim,NEW.midterm,NEW.semifinal,NEW.final] LOOP
     IF v IS NOT NULL AND NOT (v = ANY(ARRAY[1,1.1,1.2,1.25,1.3,1.4,1.5,1.6,1.7,1.75,1.8,1.9,2,2.1,2.2,2.25,2.3,2.4,2.5,2.6,2.7,2.75,2.8,2.9,3,4,5]::numeric[])) THEN
       RAISE EXCEPTION 'Invalid school grade: %',v USING ERRCODE = '23514';
     END IF;
   END LOOP;
   NEW.equivalent := NEW.final;
   NEW.remark := CASE WHEN NEW.remark = 'Dropped' THEN 'Dropped' WHEN NEW.final IS NULL THEN 'Pending' WHEN NEW.final = 4 THEN 'Conditional' WHEN NEW.final <= 3 THEN 'Passed' ELSE 'Failed' END;
 END IF;

 NEW.ai_predicted_grade := NULL;
 NEW.ai_predicted_equivalent := NULL;
 NEW.prediction_method := NULL;
 NEW.predicted_at := NULL;
 IF NEW.grade_scale = 'school' AND NEW.final IS NULL AND NEW.remark <> 'Dropped' THEN
   SELECT round(avg(x),2) INTO v_estimate FROM unnest(ARRAY[NEW.prelim,NEW.midterm,NEW.semifinal]) x WHERE x IS NOT NULL AND x <> 4;
   IF v_estimate IS NOT NULL THEN
     NEW.ai_predicted_equivalent := v_estimate;
     NEW.prediction_method := 'equal-period-mean-v1';
     NEW.predicted_at := pg_catalog.clock_timestamp();
   END IF;
 END IF;
 NEW.graded_by := coalesce(auth.uid(),NEW.graded_by);
 NEW.graded_at := pg_catalog.clock_timestamp();
 RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION imcc_review.archive_grade_change()
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
       OLD.remark IS DISTINCT FROM NEW.remark OR OLD.grade_scale IS DISTINCT FROM NEW.grade_scale OR OLD.ai_predicted_equivalent IS DISTINCT FROM NEW.ai_predicted_equivalent THEN
      v_change_type := NULLIF(pg_catalog.current_setting('app.grade_change_type', true), '');
      v_reason := NULLIF(pg_catalog.current_setting('app.grade_change_reason', true), '');
      INSERT INTO imcc_review.grade_history (
        grade_id, student_id, offering_id,
        prelim, midterm, semifinal, final, equivalent, remark,
        grade_scale, ai_predicted_equivalent, prediction_method, predicted_at, changed_by, change_type, reason, created_at
      ) VALUES (
        OLD.id, OLD.student_id, OLD.offering_id,
        OLD.prelim, OLD.midterm, OLD.semifinal, OLD.final, OLD.equivalent, OLD.remark,
        OLD.grade_scale, OLD.ai_predicted_equivalent, OLD.prediction_method, OLD.predicted_at, v_user_id, COALESCE(v_change_type, 'before_update'), v_reason, pg_catalog.clock_timestamp()
      );
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO imcc_review.grade_history (
      grade_id, student_id, offering_id,
      prelim, midterm, semifinal, final, equivalent, remark,
      grade_scale, ai_predicted_equivalent, prediction_method, predicted_at, changed_by, change_type, created_at
    ) VALUES (
      NEW.id, NEW.student_id, NEW.offering_id,
      NEW.prelim, NEW.midterm, NEW.semifinal, NEW.final, NEW.equivalent, NEW.remark,
      NEW.grade_scale, NEW.ai_predicted_equivalent, NEW.prediction_method, NEW.predicted_at, v_user_id, 'initial_entry', pg_catalog.clock_timestamp()
    );
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION imcc_review.revert_grade(p_history_id uuid, p_reason text DEFAULT 'Reverted to previous version'::text)
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
  FROM imcc_review.profiles p
  WHERE p.id = v_user_id
    AND p.status = 'approved'
    AND p.is_active IS TRUE;

  IF NOT FOUND OR v_user_role NOT IN ('teacher', 'faculty', 'dean', 'admin') THEN
    RAISE EXCEPTION 'Approved faculty access required' USING ERRCODE = '42501';
  END IF;

  SELECT h.* INTO v_hist
  FROM imcc_review.grade_history h
  WHERE h.id = p_history_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Grade history record not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_user_role <> 'admin' AND NOT EXISTS (
    SELECT 1 FROM imcc_review.teacher_assignments ta
    WHERE ta.teacher_id = v_user_id
      AND ta.offering_id = v_hist.offering_id
      AND ta.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'Active assignment required for this course offering' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM imcc_review.enrollments e
    WHERE e.student_id = v_hist.student_id
      AND e.offering_id = v_hist.offering_id
  ) THEN
    RAISE EXCEPTION 'Matching enrollment required to revert this grade' USING ERRCODE = '42501';
  END IF;

  SELECT g.* INTO v_grade
  FROM imcc_review.grades g
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

  UPDATE imcc_review.grades g
  SET grade_scale = v_hist.grade_scale, prelim = v_hist.prelim,
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
$function$;

CREATE OR REPLACE VIEW imcc_review.v_grade_history WITH (security_invoker = true) AS
SELECT gh.id,gh.grade_id,gh.student_id,st.full_name AS student_name,st.student_no,
 gh.offering_id,co.code AS course_code,co.title AS course_title,
 gh.prelim,gh.midterm,gh.semifinal,gh.final,gh.equivalent,gh.remark,gh.changed_by,
 cb.full_name AS changed_by_name,gh.change_type,gh.reason,gh.created_at,
 gh.grade_scale,gh.ai_predicted_equivalent,gh.prediction_method,gh.predicted_at
FROM imcc_review.grade_history gh
LEFT JOIN imcc_review.profiles st ON gh.student_id=st.id
LEFT JOIN imcc_review.course_offerings co ON gh.offering_id=co.id
LEFT JOIN imcc_review.profiles cb ON gh.changed_by=cb.id;


ALTER TABLE imcc_review.grading_scale ALTER COLUMN percentage_min DROP NOT NULL, ALTER COLUMN percentage_max DROP NOT NULL;
INSERT INTO imcc_review.grading_scale(equivalent,percentage_min,percentage_max,description,category,is_passing) VALUES
(1,99,100,'Excellent','Excellent',true),
(1.1,98,98,'Excellent','Excellent',true),
(1.2,97,97,'Excellent','Excellent',true),
(1.25,96,98,'Outstanding','Outstanding',true),
(1.3,96,96,'Outstanding','Outstanding',true),
(1.4,94,94,'Outstanding','Outstanding',true),
(1.5,93,95,'Superior','Superior',true),
(1.6,92,92,'Superior','Superior',true),
(1.7,91,91,'Very Good','Very Good',true),
(1.75,90,92,'Very Good','Very Good',true),
(1.8,89,89,'Very Good','Very Good',true),
(1.9,88,88,'Good','Good',true),
(2,87,89,'Good','Good',true),
(2.1,86,86,'Good','Good',true),
(2.2,85,85,'Satisfactory','Satisfactory',true),
(2.25,84,86,'Satisfactory','Satisfactory',true),
(2.3,84,84,'Satisfactory','Satisfactory',true),
(2.4,82,82,'Satisfactory','Satisfactory',true),
(2.5,81,83,'Fairly Satisfactory','Fairly Satisfactory',true),
(2.6,80,80,'Fairly Satisfactory','Fairly Satisfactory',true),
(2.7,79,79,'Fair','Fair',true),
(2.75,78,80,'Fair','Fair',true),
(2.8,77,77,'Fair','Fair',true),
(2.9,76,76,'Passing','Passing',true),
(3,75,77,'Passing (minimum)','Passing (minimum)',true),
(4,NULL,NULL,'Conditional / INC','Conditional / INC',false),
(5,0,74.99,'Failed','Failed',false)
ON CONFLICT(equivalent) DO UPDATE SET percentage_min=excluded.percentage_min,percentage_max=excluded.percentage_max,
 description=excluded.description,category=excluded.category,is_passing=excluded.is_passing;

CREATE OR REPLACE FUNCTION imcc_review.calculate_equivalent(percentage numeric) RETURNS numeric
LANGUAGE plpgsql STABLE SET search_path='' AS $function$
BEGIN
 IF percentage IS NULL OR percentage<0 OR percentage>100 THEN RETURN NULL; END IF;
 IF percentage<75 THEN RETURN 5.00; END IF;
 RETURN (SELECT s.equivalent FROM imcc_review.grading_scale s
   WHERE percentage BETWEEN s.percentage_min AND s.percentage_max
   ORDER BY s.percentage_max-s.percentage_min,s.equivalent LIMIT 1);
END;
$function$;

CREATE OR REPLACE FUNCTION imcc_review.calculate_remark(percentage numeric) RETURNS text
LANGUAGE sql STABLE SET search_path='' AS $function$
 SELECT s.description FROM imcc_review.grading_scale s WHERE s.equivalent=imcc_review.calculate_equivalent(percentage);
$function$;

-- Pending promotion. Run the rollback-only adviser_requirements.sql test first.

REVOKE TRUNCATE ON imcc_review.grades,imcc_review.enrollments,imcc_review.course_offerings,imcc_review.enrollment_requests FROM authenticated,anon;

ALTER TABLE imcc_review.course_offerings
  ADD COLUMN grades_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN grades_locked_at timestamptz,
  ADD COLUMN grades_locked_by uuid REFERENCES imcc_review.profiles(id),
  ADD COLUMN enrollment_open boolean NOT NULL DEFAULT false;
CREATE INDEX course_offerings_grades_locked_by_idx ON imcc_review.course_offerings(grades_locked_by);
UPDATE imcc_review.course_offerings o SET enrollment_open=true WHERE EXISTS (
  SELECT 1 FROM imcc_review.student_semesters s WHERE s.is_current IS TRUE AND s.school_year=o.school_year AND s.semester=o.semester
);

CREATE TABLE imcc_review.enrollment_locks (
  student_id uuid NOT NULL REFERENCES imcc_review.profiles(id),
  school_year text NOT NULL,
  semester text NOT NULL CHECK (semester IN ('1st Semester','2nd Semester','Summer')),
  locked_at timestamptz NOT NULL DEFAULT now(),
  locked_by uuid NOT NULL REFERENCES imcc_review.profiles(id),
  PRIMARY KEY (student_id, school_year, semester)
);
CREATE INDEX enrollment_locks_actor_idx ON imcc_review.enrollment_locks(locked_by);
ALTER TABLE imcc_review.enrollment_locks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON imcc_review.enrollment_locks FROM PUBLIC, anon, authenticated;
GRANT SELECT ON imcc_review.enrollment_locks TO authenticated;
CREATE POLICY enrollment_locks_read ON imcc_review.enrollment_locks FOR SELECT TO authenticated
USING (imcc_review.is_mfa_compliant() AND (student_id = (SELECT auth.uid()) OR EXISTS (
  SELECT 1 FROM imcc_review.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role IN ('dean','admin','registrar','staff') AND p.status='approved' AND p.is_active IS TRUE
)));

CREATE TABLE imcc_review.instructor_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES imcc_review.profiles(id),
  enrollment_id uuid NOT NULL REFERENCES imcc_review.enrollments(id) ON DELETE CASCADE,
  subject text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  UNIQUE(recipient_id, enrollment_id)
);
CREATE INDEX instructor_notifications_enrollment_idx ON imcc_review.instructor_notifications(enrollment_id);
ALTER TABLE imcc_review.instructor_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON imcc_review.instructor_notifications FROM PUBLIC, anon, authenticated;
GRANT SELECT ON imcc_review.instructor_notifications TO authenticated;
GRANT UPDATE(read_at) ON imcc_review.instructor_notifications TO authenticated;
CREATE POLICY instructor_notifications_own ON imcc_review.instructor_notifications FOR ALL TO authenticated
USING (recipient_id = (SELECT auth.uid()) AND imcc_review.is_mfa_compliant() AND EXISTS (
  SELECT 1 FROM imcc_review.profiles p WHERE p.id=(SELECT auth.uid()) AND p.role IN ('teacher','faculty','dean','admin') AND p.status='approved' AND p.is_active IS TRUE
)) WITH CHECK (recipient_id = (SELECT auth.uid()) AND imcc_review.is_mfa_compliant());

CREATE FUNCTION imcc_review_private.guard_enrollment_finalization() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target record; locked_offering imcc_review.course_offerings%ROWTYPE;
BEGIN
  -- All enrollment writers and finalizers serialize on the same student rows.
  IF TG_OP='UPDATE' THEN
    PERFORM id FROM imcc_review.profiles WHERE id IN (OLD.student_id,NEW.student_id) ORDER BY id FOR UPDATE;
  ELSE
    PERFORM id FROM imcc_review.profiles WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.student_id ELSE NEW.student_id END FOR UPDATE;
  END IF;
  FOR target IN
    SELECT e.student_id,o.* FROM (
      SELECT OLD.student_id,OLD.offering_id WHERE TG_OP IN ('UPDATE','DELETE')
      UNION SELECT NEW.student_id,NEW.offering_id WHERE TG_OP IN ('UPDATE','INSERT')
    ) e JOIN imcc_review.course_offerings o ON o.id=e.offering_id ORDER BY o.id
  LOOP
    SELECT * INTO locked_offering FROM imcc_review.course_offerings WHERE id=target.id FOR UPDATE;
    IF locked_offering.grades_locked OR EXISTS (SELECT 1 FROM imcc_review.enrollment_locks l WHERE l.student_id=target.student_id AND l.school_year=locked_offering.school_year AND l.semester=locked_offering.semester) THEN
      RAISE EXCEPTION 'Enrollment is finalized and locked' USING ERRCODE='55000';
    END IF;
    IF TG_OP='INSERT' AND NOT locked_offering.enrollment_open THEN
      RAISE EXCEPTION 'Enrollment is closed for this term' USING ERRCODE='55000';
    END IF;
  END LOOP;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER guard_enrollment_finalization BEFORE INSERT OR UPDATE OR DELETE ON imcc_review.enrollments
FOR EACH ROW EXECUTE FUNCTION imcc_review_private.guard_enrollment_finalization();
CREATE TRIGGER guard_request_finalization BEFORE INSERT OR UPDATE OR DELETE ON imcc_review.enrollment_requests
FOR EACH ROW EXECUTE FUNCTION imcc_review_private.guard_enrollment_finalization();

CREATE FUNCTION imcc_review_private.finalize_enrollment(p_student_id uuid,p_school_year text,p_semester text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT imcc_review.is_mfa_compliant() OR NOT EXISTS (
    SELECT 1 FROM imcc_review.profiles p WHERE p.id=auth.uid() AND p.role IN ('dean','admin','registrar','staff') AND p.status='approved' AND p.is_active IS TRUE
  ) THEN RAISE EXCEPTION 'Active enrollment reviewer access required' USING ERRCODE='42501'; END IF;
  PERFORM id FROM imcc_review.profiles WHERE id=p_student_id AND role='student' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Student not found' USING ERRCODE='P0002'; END IF;
  PERFORM o.id FROM imcc_review.course_offerings o JOIN imcc_review.enrollments e ON e.offering_id=o.id
    WHERE e.student_id=p_student_id AND o.school_year=p_school_year AND o.semester=p_semester ORDER BY o.id FOR UPDATE OF o;
  IF NOT EXISTS (SELECT 1 FROM imcc_review.enrollments e JOIN imcc_review.course_offerings o ON o.id=e.offering_id WHERE e.student_id=p_student_id AND e.status='enrolled' AND o.school_year=p_school_year AND o.semester=p_semester) THEN
    RAISE EXCEPTION 'No enrolled subjects for this student and term' USING ERRCODE='55000';
  END IF;
  IF EXISTS (SELECT 1 FROM imcc_review.enrollment_requests r JOIN imcc_review.course_offerings o ON o.id=r.offering_id WHERE r.student_id=p_student_id AND r.status='pending' AND o.school_year=p_school_year AND o.semester=p_semester) THEN
    RAISE EXCEPTION 'Review all pending subjects before finalizing enrollment' USING ERRCODE='55000';
  END IF;
  INSERT INTO imcc_review.enrollment_locks(student_id,school_year,semester,locked_by) VALUES(p_student_id,p_school_year,p_semester,auth.uid()) ON CONFLICT DO NOTHING;
END;
$$;
CREATE FUNCTION imcc_review.finalize_enrollment(p_student_id uuid,p_school_year text,p_semester text) RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT imcc_review_private.finalize_enrollment(p_student_id,p_school_year,p_semester); $$;

CREATE FUNCTION imcc_review_private.guard_grade_finalization() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE offering_id integer;
BEGIN
  FOR offering_id IN SELECT id FROM imcc_review.course_offerings WHERE id IN (
    CASE WHEN TG_OP<>'INSERT' THEN OLD.offering_id END,CASE WHEN TG_OP<>'DELETE' THEN NEW.offering_id END
  ) ORDER BY id FOR UPDATE LOOP
    IF (SELECT o.grades_locked FROM imcc_review.course_offerings o WHERE o.id=offering_id) THEN
      RAISE EXCEPTION 'Grades are finalized and locked' USING ERRCODE='55000';
    END IF;
  END LOOP;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER a_guard_grade_finalization BEFORE INSERT OR UPDATE OR DELETE ON imcc_review.grades
FOR EACH ROW EXECUTE FUNCTION imcc_review_private.guard_grade_finalization();

CREATE FUNCTION imcc_review_private.protect_offering_finalization() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_OP<>'DELETE' THEN
    NEW.school_year:=translate(NEW.school_year,'–—','--');
    IF NEW.semester='Summer Semester' THEN NEW.semester:='Summer'; END IF;
    IF NEW.semester IS NULL OR NEW.semester NOT IN ('1st Semester','2nd Semester','Summer') OR NEW.units<=0 OR (NEW.year IS NOT NULL AND NEW.year NOT BETWEEN 1 AND 4) THEN
      RAISE EXCEPTION 'Use a valid semester, year level, and positive units' USING ERRCODE='23514';
    END IF;
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.grades_locked OR NEW.grades_locked_at IS NOT NULL OR NEW.grades_locked_by IS NOT NULL THEN
      RAISE EXCEPTION 'Create the class before finalizing grades' USING ERRCODE='55000';
    END IF;
    NEW.enrollment_open:=coalesce((SELECT bool_or(o.enrollment_open) FROM imcc_review.course_offerings o WHERE o.school_year=NEW.school_year AND o.semester=NEW.semester),NEW.enrollment_open);
    RETURN NEW;
  END IF;
  IF OLD.grades_locked AND (TG_OP='DELETE' OR (to_jsonb(NEW)-'enrollment_open') IS DISTINCT FROM (to_jsonb(OLD)-'enrollment_open')) THEN
    RAISE EXCEPTION 'Finalized class records cannot be changed' USING ERRCODE='55000';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF (NEW.school_year,NEW.semester) IS DISTINCT FROM (OLD.school_year,OLD.semester) AND (
    EXISTS(SELECT 1 FROM imcc_review.enrollments WHERE offering_id=OLD.id) OR EXISTS(SELECT 1 FROM imcc_review.enrollment_requests WHERE offering_id=OLD.id)
  ) THEN RAISE EXCEPTION 'Create a new offering to change the term of a used subject' USING ERRCODE='55000'; END IF;
  IF (NEW.code,NEW.title,NEW.units,NEW.program,NEW.year,NEW.schedule) IS DISTINCT FROM (OLD.code,OLD.title,OLD.units,OLD.program,OLD.year,OLD.schedule) AND EXISTS (
    SELECT 1 FROM imcc_review.enrollments e JOIN imcc_review.enrollment_locks l ON l.student_id=e.student_id AND l.school_year=OLD.school_year AND l.semester=OLD.semester WHERE e.offering_id=OLD.id
  ) THEN RAISE EXCEPTION 'Subject details belong to a finalized enrollment' USING ERRCODE='55000'; END IF;
  IF NEW.grades_locked AND NOT OLD.grades_locked THEN
    IF NOT imcc_review.is_mfa_compliant() OR NOT EXISTS (
      SELECT 1 FROM imcc_review.profiles p WHERE p.id=auth.uid() AND p.status='approved' AND p.is_active IS TRUE AND
        (p.role IN ('dean','admin') OR (p.role IN ('teacher','faculty') AND EXISTS (SELECT 1 FROM imcc_review.teacher_assignments ta WHERE ta.teacher_id=p.id AND ta.offering_id=OLD.id AND ta.is_active IS TRUE)))
    ) THEN RAISE EXCEPTION 'Active assigned instructor, dean, or admin required' USING ERRCODE='42501'; END IF;
    IF EXISTS(SELECT 1 FROM imcc_review.enrollment_requests WHERE offering_id=OLD.id AND status='pending') THEN
      RAISE EXCEPTION 'Resolve pending enrollment requests before locking grades' USING ERRCODE='55000';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM imcc_review.enrollments WHERE offering_id=OLD.id AND status='enrolled') OR EXISTS (
      SELECT 1 FROM imcc_review.enrollments e LEFT JOIN imcc_review.grades g ON g.student_id=e.student_id AND g.offering_id=e.offering_id WHERE e.offering_id=OLD.id AND e.status='enrolled' AND (g.final IS NULL OR g.equivalent IS NULL)
    ) THEN RAISE EXCEPTION 'Save Final and Equivalent for every enrolled student before locking' USING ERRCODE='55000'; END IF;
    NEW.grades_locked_at:=now(); NEW.grades_locked_by:=auth.uid();
  ELSIF (NEW.grades_locked_at,NEW.grades_locked_by) IS DISTINCT FROM (OLD.grades_locked_at,OLD.grades_locked_by) THEN
    RAISE EXCEPTION 'Finalization metadata is managed by Lock Grades' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER a_protect_offering_finalization BEFORE INSERT OR UPDATE OR DELETE ON imcc_review.course_offerings
FOR EACH ROW EXECUTE FUNCTION imcc_review_private.protect_offering_finalization();

CREATE FUNCTION imcc_review_private.lock_class_grades(p_offering_id integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  -- The offering trigger verifies both the caller and completeness under this row lock.
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first' USING ERRCODE='42501'; END IF;
  UPDATE imcc_review.course_offerings SET grades_locked=true WHERE id=p_offering_id AND NOT grades_locked;
  IF NOT FOUND THEN RAISE EXCEPTION 'Class is missing or already locked' USING ERRCODE='55000'; END IF;
END;
$$;
CREATE FUNCTION imcc_review.lock_class_grades(p_offering_id integer) RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT imcc_review_private.lock_class_grades(p_offering_id); $$;

CREATE FUNCTION imcc_review_private.set_enrollment_term(p_school_year text,p_semester text,p_open boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF p_open IS NULL OR NOT imcc_review.is_mfa_compliant() OR NOT EXISTS (
    SELECT 1 FROM imcc_review.profiles p WHERE p.id=auth.uid() AND p.role IN ('dean','admin','registrar') AND p.status='approved' AND p.is_active IS TRUE
  ) THEN RAISE EXCEPTION 'Active term manager access required' USING ERRCODE='42501'; END IF;
  UPDATE imcc_review.course_offerings SET enrollment_open=p_open WHERE school_year=p_school_year AND semester=p_semester;
  IF NOT FOUND THEN RAISE EXCEPTION 'Create subject offerings for this term first' USING ERRCODE='P0002'; END IF;
END;
$$;
CREATE FUNCTION imcc_review.set_enrollment_term(p_school_year text,p_semester text,p_open boolean) RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT imcc_review_private.set_enrollment_term(p_school_year,p_semester,p_open); $$;

CREATE FUNCTION imcc_review_private.notify_course_enrollment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_TABLE_NAME='enrollments' THEN
    IF NEW.status<>'enrolled' OR (TG_OP='UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status AND OLD.offering_id IS NOT DISTINCT FROM NEW.offering_id AND OLD.student_id IS NOT DISTINCT FROM NEW.student_id) THEN RETURN NEW; END IF;
    INSERT INTO imcc_review.instructor_notifications(recipient_id,enrollment_id,subject,body)
      SELECT o.instructor_id,NEW.id,'New enrollment — '||o.code,p.full_name||' enrolled in '||o.code||' — '||o.title||' ('||o.semester||' '||o.school_year||').' FROM imcc_review.course_offerings o JOIN imcc_review.profiles p ON p.id=NEW.student_id WHERE o.id=NEW.offering_id AND o.instructor_id IS NOT NULL
      ON CONFLICT(recipient_id,enrollment_id) DO UPDATE SET subject=EXCLUDED.subject,body=EXCLUDED.body,created_at=now(),read_at=NULL;
  ELSE
    IF NEW.instructor_id IS NULL OR NEW.instructor_id IS NOT DISTINCT FROM OLD.instructor_id THEN RETURN NEW; END IF;
    INSERT INTO imcc_review.instructor_notifications(recipient_id,enrollment_id,subject,body)
      SELECT NEW.instructor_id,e.id,'Class roster — '||NEW.code,p.full_name||' is enrolled in '||NEW.code||' — '||NEW.title||' ('||NEW.semester||' '||NEW.school_year||').' FROM imcc_review.enrollments e JOIN imcc_review.profiles p ON p.id=e.student_id WHERE e.offering_id=NEW.id AND e.status='enrolled'
      ON CONFLICT(recipient_id,enrollment_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER notify_course_enrollment AFTER INSERT OR UPDATE ON imcc_review.enrollments FOR EACH ROW EXECUTE FUNCTION imcc_review_private.notify_course_enrollment();
CREATE TRIGGER notify_assigned_roster AFTER UPDATE OF instructor_id ON imcc_review.course_offerings FOR EACH ROW EXECUTE FUNCTION imcc_review_private.notify_course_enrollment();

CREATE FUNCTION imcc_review_private.get_student_record(p_student_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  IF NOT imcc_review.is_mfa_compliant() OR NOT EXISTS (
    SELECT 1 FROM imcc_review.profiles p WHERE p.id=auth.uid() AND p.role IN ('dean','admin') AND p.status='approved' AND p.is_active IS TRUE
  ) THEN RAISE EXCEPTION 'Active dean or admin access required' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object('id',p.id,'full_name',p.full_name,'student_no',p.student_no,'id_number',p.id_number,'program',p.program,'year_level',p.year_level,'section',p.section,'email',p.email,'phone',p.phone,'address',p.address,'status',p.status,'is_active',p.is_active) INTO result FROM imcc_review.profiles p WHERE p.id=p_student_id AND p.role='student';
  IF result IS NULL THEN RAISE EXCEPTION 'Student not found' USING ERRCODE='P0002'; END IF;
  RETURN jsonb_build_object(
    'profile',result,
    'enrollments',coalesce((SELECT jsonb_agg(to_jsonb(e)||jsonb_build_object('code',o.code,'title',o.title,'units',o.units,'semester',o.semester,'school_year',o.school_year) ORDER BY o.school_year,o.semester,o.code) FROM imcc_review.enrollments e JOIN imcc_review.course_offerings o ON o.id=e.offering_id WHERE e.student_id=p_student_id),'[]'::jsonb),
    'grades',coalesce((SELECT jsonb_agg(to_jsonb(g)||jsonb_build_object('code',o.code,'semester',o.semester,'school_year',o.school_year) ORDER BY o.school_year,o.semester,o.code) FROM imcc_review.grades g JOIN imcc_review.course_offerings o ON o.id=g.offering_id WHERE g.student_id=p_student_id),'[]'::jsonb),
    'clearances',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.department_name) FROM imcc_review.clearances c WHERE c.student_id=p_student_id),'[]'::jsonb),
    'attendance',coalesce((SELECT jsonb_agg(to_jsonb(a)||jsonb_build_object('code',o.code) ORDER BY a.date DESC) FROM imcc_review.attendance a JOIN imcc_review.course_offerings o ON o.id=a.offering_id WHERE a.student_id=p_student_id),'[]'::jsonb),
    'semesters',coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM imcc_review.student_semesters t WHERE t.student_id=p_student_id),'[]'::jsonb),
    'transactions',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.txn_date DESC) FROM imcc_review.transactions t WHERE t.student_id=p_student_id),'[]'::jsonb),
    'installments',coalesce((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.due_date) FROM imcc_review.installments i WHERE i.student_id=p_student_id),'[]'::jsonb),
    'billing',(SELECT to_jsonb(b) FROM imcc_review.billing_summary b WHERE b.student_id=p_student_id)
  );
END;
$$;
CREATE FUNCTION imcc_review.get_student_record(p_student_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT imcc_review_private.get_student_record(p_student_id); $$;

REVOKE ALL ON FUNCTION imcc_review_private.guard_enrollment_finalization(),imcc_review_private.guard_grade_finalization(),imcc_review_private.protect_offering_finalization(),imcc_review_private.notify_course_enrollment() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION imcc_review_private.finalize_enrollment(uuid,text,text),imcc_review.finalize_enrollment(uuid,text,text),imcc_review_private.lock_class_grades(integer),imcc_review.lock_class_grades(integer),imcc_review_private.set_enrollment_term(text,text,boolean),imcc_review.set_enrollment_term(text,text,boolean),imcc_review_private.get_student_record(uuid),imcc_review.get_student_record(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION imcc_review_private.finalize_enrollment(uuid,text,text),imcc_review.finalize_enrollment(uuid,text,text),imcc_review_private.lock_class_grades(integer),imcc_review.lock_class_grades(integer),imcc_review_private.set_enrollment_term(text,text,boolean),imcc_review.set_enrollment_term(text,text,boolean),imcc_review_private.get_student_record(uuid),imcc_review.get_student_record(uuid) TO authenticated;


CREATE FUNCTION imcc_review_private.get_enrollment_workspace() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT imcc_review.is_mfa_compliant() OR NOT EXISTS (SELECT 1 FROM imcc_review.profiles p WHERE p.id=auth.uid() AND p.role IN ('dean','admin','registrar','staff') AND p.status='approved' AND p.is_active IS TRUE) THEN RAISE EXCEPTION 'Active enrollment reviewer access required' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object(
    'groups',coalesce((SELECT jsonb_agg(to_jsonb(g) ORDER BY g.student_name,g.school_year,g.semester) FROM (
      SELECT e.student_id,p.full_name AS student_name,coalesce(p.student_no,p.id_number) AS student_no,o.school_year,o.semester,sum(o.units) AS units,l.locked_at
      FROM imcc_review.enrollments e JOIN imcc_review.profiles p ON p.id=e.student_id JOIN imcc_review.course_offerings o ON o.id=e.offering_id
      LEFT JOIN imcc_review.enrollment_locks l ON l.student_id=e.student_id AND l.school_year=o.school_year AND l.semester=o.semester
      WHERE e.status='enrolled' GROUP BY e.student_id,p.full_name,p.student_no,p.id_number,o.school_year,o.semester,l.locked_at
    ) g),'[]'::jsonb),
    'terms',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.school_year DESC,t.semester) FROM (SELECT school_year,semester,bool_or(enrollment_open) AS is_open FROM imcc_review.course_offerings GROUP BY school_year,semester) t),'[]'::jsonb)
  );
END;
$$;
CREATE FUNCTION imcc_review.get_enrollment_workspace() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT imcc_review_private.get_enrollment_workspace(); $$;
REVOKE ALL ON FUNCTION imcc_review_private.get_enrollment_workspace(),imcc_review.get_enrollment_workspace() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION imcc_review_private.get_enrollment_workspace(),imcc_review.get_enrollment_workspace() TO authenticated;
CREATE OR REPLACE FUNCTION imcc_review.update_grade_calculations() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
 v numeric;
 v_estimate numeric;
BEGIN
 IF NEW.grade_scale = 'percentage' THEN
   IF TG_OP = 'INSERT' OR coalesce(pg_catalog.current_setting('app.grade_change_type',true),'') <> 'revert' THEN
     RAISE EXCEPTION 'Legacy percentage records require school review before editing' USING ERRCODE = '23514';
   END IF;
 ELSE
   FOREACH v IN ARRAY ARRAY[NEW.prelim,NEW.midterm,NEW.semifinal,NEW.final,NEW.equivalent] LOOP
     IF v IS NOT NULL AND NOT (v = ANY(ARRAY[1,1.1,1.2,1.25,1.3,1.4,1.5,1.6,1.7,1.75,1.8,1.9,2,2.1,2.2,2.25,2.3,2.4,2.5,2.6,2.7,2.75,2.8,2.9,3,4,5]::numeric[])) THEN
       RAISE EXCEPTION 'Invalid school grade: %',v USING ERRCODE = '23514';
     END IF;
   END LOOP;
   IF NEW.final IS NOT NULL AND NEW.equivalent IS NULL THEN
     RAISE EXCEPTION 'Enter the official Equivalent with the final grade' USING ERRCODE='23514';
   END IF;
   IF NEW.final IS NULL AND NEW.equivalent IS NOT NULL THEN
     RAISE EXCEPTION 'Final is required before Equivalent' USING ERRCODE='23514';
   END IF;
   NEW.remark := CASE WHEN NEW.remark = 'Dropped' THEN 'Dropped' WHEN NEW.final IS NULL THEN 'Pending' WHEN NEW.equivalent = 4 THEN 'Conditional' WHEN NEW.equivalent <= 3 THEN 'Passed' ELSE 'Failed' END;
 END IF;

 NEW.ai_predicted_grade := NULL;
 NEW.ai_predicted_equivalent := NULL;
 NEW.prediction_method := NULL;
 NEW.predicted_at := NULL;
 IF NEW.grade_scale = 'school' AND NEW.final IS NULL AND NEW.remark <> 'Dropped' THEN
   SELECT round(avg(x),2) INTO v_estimate FROM unnest(ARRAY[NEW.prelim,NEW.midterm,NEW.semifinal]) x WHERE x IS NOT NULL AND x <> 4;
   IF v_estimate IS NOT NULL THEN
     NEW.ai_predicted_equivalent := v_estimate;
     NEW.prediction_method := 'equal-period-mean-v1';
     NEW.predicted_at := pg_catalog.clock_timestamp();
   END IF;
 END IF;
 NEW.graded_by := coalesce(auth.uid(),NEW.graded_by);
 NEW.graded_at := pg_catalog.clock_timestamp();
 RETURN NEW;
END;
$function$;


CREATE OR REPLACE FUNCTION imcc_review_private.save_course_offering_with_instructor(p_offering_id integer DEFAULT NULL::integer, p_code text DEFAULT NULL::text, p_title text DEFAULT NULL::text, p_units numeric DEFAULT 3.0, p_program text DEFAULT NULL::text, p_year integer DEFAULT 1, p_semester text DEFAULT NULL::text, p_school_year text DEFAULT NULL::text, p_schedule text DEFAULT NULL::text, p_instructor_id uuid DEFAULT NULL::uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE instructor text; result jsonb;
BEGIN
  IF NOT imcc_review.is_mfa_compliant() OR NOT EXISTS (SELECT 1 FROM imcc_review.profiles p WHERE p.id=auth.uid() AND p.role IN ('dean','admin') AND p.status='approved' AND p.is_active IS TRUE) THEN
    RAISE EXCEPTION 'Active dean or admin access required' USING ERRCODE='42501';
  END IF;
  IF p_code IS NULL OR btrim(p_code)='' OR p_title IS NULL OR btrim(p_title)='' OR p_school_year IS NULL OR p_school_year !~ '^\d{4}[-–—]\d{4}$' OR p_units IS NULL OR p_units<=0 OR p_units::text IN ('NaN','Infinity','-Infinity') OR p_year IS NULL OR p_year NOT BETWEEN 1 AND 4 OR p_semester IS NULL OR p_semester NOT IN ('1st Semester','2nd Semester','Summer') THEN
    RAISE EXCEPTION 'Subject code, title, school year, semester, year level, and positive units are required' USING ERRCODE='23514';
  END IF;
  IF p_instructor_id IS NOT NULL THEN
    SELECT p.full_name INTO instructor FROM imcc_review.profiles p WHERE p.id=p_instructor_id AND p.status='approved' AND p.is_active IS TRUE AND (p.role IN ('teacher','faculty') OR (p.role='dean' AND p.id=auth.uid()));
    IF instructor IS NULL THEN RAISE EXCEPTION 'Choose an active eligible instructor or leave unassigned' USING ERRCODE='42501'; END IF;
  END IF;
  IF p_offering_id IS NULL THEN
    INSERT INTO imcc_review.course_offerings(code,title,units,program,year,semester,school_year,schedule,instructor_id,instructor_name)
    VALUES(btrim(p_code),btrim(p_title),p_units,p_program,p_year,p_semester,translate(p_school_year,'–—','--'),p_schedule,p_instructor_id,instructor)
    RETURNING to_jsonb(course_offerings) INTO result;
  ELSE
    UPDATE imcc_review.course_offerings SET code=btrim(p_code),title=btrim(p_title),units=p_units,program=p_program,year=p_year,semester=p_semester,school_year=translate(p_school_year,'–—','--'),schedule=p_schedule,instructor_id=p_instructor_id,instructor_name=instructor
    WHERE id=p_offering_id RETURNING to_jsonb(course_offerings) INTO result;
    IF result IS NULL THEN RAISE EXCEPTION 'Offering not found or access denied' USING ERRCODE='P0002'; END IF;
  END IF;
  RETURN result;
END;
$$;
CREATE OR REPLACE FUNCTION imcc_review.save_course_offering_with_instructor(p_offering_id integer DEFAULT NULL::integer, p_code text DEFAULT NULL::text, p_title text DEFAULT NULL::text, p_units numeric DEFAULT 3.0, p_program text DEFAULT NULL::text, p_year integer DEFAULT 1, p_semester text DEFAULT NULL::text, p_school_year text DEFAULT NULL::text, p_schedule text DEFAULT NULL::text, p_instructor_id uuid DEFAULT NULL::uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT imcc_review_private.save_course_offering_with_instructor(p_offering_id,p_code,p_title,p_units,p_program,p_year,p_semester,p_school_year,p_schedule,p_instructor_id); $$;
REVOKE ALL ON FUNCTION imcc_review_private.save_course_offering_with_instructor(integer,text,text,numeric,text,integer,text,text,text,uuid),imcc_review.save_course_offering_with_instructor(integer,text,text,numeric,text,integer,text,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION imcc_review_private.save_course_offering_with_instructor(integer,text,text,numeric,text,integer,text,text,text,uuid),imcc_review.save_course_offering_with_instructor(integer,text,text,numeric,text,integer,text,text,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION imcc_review_private.get_subject_instructor_options()
RETURNS TABLE(id uuid,full_name text,role text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT p.id,p.full_name,p.role FROM imcc_review.profiles p WHERE p.status='approved' AND p.is_active IS TRUE
  AND (p.role IN ('teacher','faculty') OR (p.role='dean' AND p.id=auth.uid()))
  AND imcc_review.is_mfa_compliant() AND EXISTS (SELECT 1 FROM imcc_review.profiles actor WHERE actor.id=auth.uid() AND actor.role IN ('dean','admin') AND actor.status='approved' AND actor.is_active IS TRUE)
  ORDER BY p.full_name,p.id;
$$;
CREATE OR REPLACE FUNCTION imcc_review.get_subject_instructor_options()
RETURNS TABLE(id uuid,full_name text,role text) LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT * FROM imcc_review_private.get_subject_instructor_options(); $$;
REVOKE ALL ON FUNCTION imcc_review_private.get_subject_instructor_options(),imcc_review.get_subject_instructor_options() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION imcc_review_private.get_subject_instructor_options(),imcc_review.get_subject_instructor_options() TO authenticated;

CREATE FUNCTION imcc_review_private.list_student_records() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT imcc_review.is_mfa_compliant() OR NOT EXISTS (SELECT 1 FROM imcc_review.profiles p WHERE p.id=auth.uid() AND p.role IN ('dean','admin') AND p.status='approved' AND p.is_active IS TRUE) THEN RAISE EXCEPTION 'Active dean or admin access required' USING ERRCODE='42501'; END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'full_name',p.full_name,'student_no',coalesce(p.student_no,p.id_number),'program',p.program,'year_level',p.year_level,'role',p.role,'status',p.status) ORDER BY p.full_name,p.id) FROM imcc_review.profiles p WHERE p.role='student'),'[]'::jsonb);
END;
$$;
CREATE FUNCTION imcc_review.list_student_records() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT imcc_review_private.list_student_records(); $$;
REVOKE ALL ON FUNCTION imcc_review_private.list_student_records(),imcc_review.list_student_records() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION imcc_review_private.list_student_records(),imcc_review.list_student_records() TO authenticated;

CREATE OR REPLACE FUNCTION imcc_review.sync_student_term_on_enroll()
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
    SELECT 1 FROM imcc_review.profiles AS p
    WHERE p.id = NEW.student_id AND p.role = 'student'
  ) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO off
  FROM imcc_review.course_offerings
  WHERE id = NEW.offering_id;
  IF off IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)::int, COALESCE(SUM(co.units), 0)
  INTO subj_count, total_units
  FROM imcc_review.enrollments AS e
  JOIN imcc_review.course_offerings AS co ON co.id = e.offering_id
  WHERE e.student_id = NEW.student_id
    AND e.status = 'enrolled' AND co.school_year=off.school_year AND co.semester=off.semester;

  UPDATE imcc_review.student_semesters
  SET is_current = false
  WHERE student_id = NEW.student_id;

  INSERT INTO imcc_review.student_semesters (
    student_id, school_year, semester, is_current, units_enrolled, subjects_enrolled
  ) VALUES (
    NEW.student_id, off.school_year, off.semester, true, total_units, subj_count
  )
  ON CONFLICT (student_id, school_year, semester)
  DO UPDATE SET
    is_current = true,
    units_enrolled = EXCLUDED.units_enrolled,
    subjects_enrolled = EXCLUDED.subjects_enrolled;

  PERFORM imcc_review.initialize_student_clearances(NEW.student_id);
  RETURN NEW;
END;
$function$
;



SET LOCAL search_path=imcc_review,extensions,pg_catalog;
ALTER TABLE imcc_review.profiles DROP CONSTRAINT profiles_role_check;
ALTER TABLE imcc_review.profiles ADD CONSTRAINT profiles_role_check CHECK(role IN ('student','faculty','teacher','staff','admin','dean','registrar'));
CREATE TABLE imcc_review_private.control (id boolean PRIMARY KEY DEFAULT true CHECK(id), enabled_until timestamptz, retired boolean NOT NULL DEFAULT false, accounts jsonb NOT NULL DEFAULT '{}', ticket_secret text NOT NULL DEFAULT encode(extensions.gen_random_bytes(32),'hex'));
INSERT INTO imcc_review_private.control(id) VALUES(true);
REVOKE ALL ON imcc_review_private.control FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION imcc_review.is_mfa_compliant() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM imcc_review_private.control WHERE enabled_until>now() AND NOT retired)
 AND EXISTS(SELECT 1 FROM imcc_review.profiles WHERE id=auth.uid() AND is_active IS TRUE AND status='approved');
$$;
CREATE OR REPLACE FUNCTION imcc_review.is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT imcc_review.is_mfa_compliant() AND EXISTS(SELECT 1 FROM imcc_review.profiles
 WHERE id=auth.uid() AND role='admin' AND status='approved' AND is_active IS TRUE);
$$;
DO $$ DECLARE t record; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='imcc_review' LOOP
   EXECUTE format('ALTER TABLE imcc_review.%I ENABLE ROW LEVEL SECURITY',t.tablename);
   EXECUTE format('CREATE POLICY review_expiry ON imcc_review.%I AS RESTRICTIVE FOR ALL TO authenticated USING (imcc_review.is_mfa_compliant()) WITH CHECK (imcc_review.is_mfa_compliant())',t.tablename);
 END LOOP;
 FOR t IN SELECT viewname FROM pg_views WHERE schemaname='imcc_review' LOOP
   EXECUTE format('ALTER VIEW imcc_review.%I SET (security_invoker=true)',t.viewname);
 END LOOP;
END $$;
REVOKE ALL ON SCHEMA imcc_review,imcc_review_private FROM PUBLIC,anon;
REVOKE ALL ON ALL TABLES IN SCHEMA imcc_review FROM PUBLIC,anon;
REVOKE TRUNCATE,TRIGGER,REFERENCES ON ALL TABLES IN SCHEMA imcc_review FROM authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA imcc_review,imcc_review_private FROM PUBLIC,anon;

CREATE FUNCTION public.developer_demo_status(p_enable boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE deadline timestamptz;
BEGIN
 IF auth.jwt()->>'aal' IS DISTINCT FROM 'aal2' OR NOT EXISTS(
   SELECT 1 FROM public.profiles p JOIN auth.users u ON u.id=p.id
   WHERE p.id=auth.uid() AND lower(u.email)='jlm33405@imcc.edu.ph' AND u.email_confirmed_at IS NOT NULL
   AND p.role='admin' AND p.status='approved' AND p.is_active IS TRUE
 ) THEN RAISE EXCEPTION 'Verified developer admin and MFA required' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM imcc_review_private.control WHERE retired) THEN RETURN jsonb_build_object('available',false); END IF;
 SELECT enabled_until INTO deadline FROM imcc_review_private.control WHERE id FOR UPDATE;
 IF p_enable AND (deadline IS NULL OR deadline<=now()) THEN
   deadline:=now()+interval '2 hours';
   UPDATE imcc_review_private.control SET enabled_until=deadline WHERE id;
 END IF;
 RETURN jsonb_build_object('available',true,'expiresAt',deadline,'accounts',(
   SELECT accounts FROM imcc_review_private.control WHERE id),'ticketSecret',(
   SELECT ticket_secret FROM imcc_review_private.control WHERE id));
END $$;
REVOKE ALL ON FUNCTION public.developer_demo_status(boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.developer_demo_status(boolean) TO authenticated;
-- Keep the existing Admin UI contracts scoped to the review schema.
CREATE FUNCTION imcc_review.set_user_role(target_id uuid,new_role text) RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT imcc_review.admin_set_profile_access(target_id,new_role,NULL); $$;
CREATE FUNCTION imcc_review.set_user_approval(target_id uuid,approved boolean,approved_role text DEFAULT NULL) RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT imcc_review.admin_set_profile_access(target_id,approved_role,CASE WHEN approved THEN 'approved' ELSE 'rejected' END); $$;
CREATE FUNCTION imcc_review.set_user_active(target_id uuid,active boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF NOT imcc_review.is_admin() OR NOT imcc_review.is_mfa_compliant() THEN RAISE EXCEPTION 'Active demo Admin required' USING ERRCODE='42501'; END IF;
 UPDATE imcc_review.profiles SET is_active=active WHERE id=target_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Demo account not found' USING ERRCODE='P0002'; END IF;
END $$;
REVOKE ALL ON FUNCTION imcc_review.set_user_role(uuid,text),imcc_review.set_user_approval(uuid,boolean,text),imcc_review.set_user_active(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION imcc_review.set_user_role(uuid,text),imcc_review.set_user_approval(uuid,boolean,text),imcc_review.set_user_active(uuid,boolean) TO authenticated;

-- Only the server-side provisioning path can register freshly created demo users.
CREATE FUNCTION public.configure_demo_review(p_accounts jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item record; student uuid; instructor uuid; dean uuid; offering integer;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server only' USING ERRCODE='42501'; END IF;
 PERFORM id FROM imcc_review_private.control WHERE id FOR UPDATE;
 IF (SELECT accounts FROM imcc_review_private.control WHERE id)<>'{}'::jsonb THEN RAISE EXCEPTION 'Already configured'; END IF;
 IF jsonb_typeof(p_accounts)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(p_accounts))<>7 THEN RAISE EXCEPTION 'Invalid demo accounts'; END IF;
 FOR item IN SELECT key,value FROM jsonb_each(p_accounts) LOOP
   IF item.key NOT IN ('student','faculty','dean','admin','registrar','staff','pending') OR length(item.value->>'password')<32
     OR NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=(item.value->>'id')::uuid
       AND u.email=item.value->>'email' AND u.email LIKE 'review.'||item.key||'.%@example.invalid'
       AND u.raw_app_meta_data->>'imcc_review'='true') THEN RAISE EXCEPTION 'Only new review identities are allowed'; END IF;
   IF EXISTS(SELECT 1 FROM public.profiles WHERE id=(item.value->>'id')::uuid AND (role<>'student' OR status<>'onboarding')) THEN
     RAISE EXCEPTION 'Existing school identities cannot be registered';
   END IF;
   UPDATE public.profiles SET is_active=false WHERE id=(item.value->>'id')::uuid;
   INSERT INTO imcc_review.profiles(id,email,full_name,role,status,is_active,program,year_level,section,student_no)
   VALUES((item.value->>'id')::uuid,item.value->>'email','DEMO '||initcap(item.key),
     CASE item.key WHEN 'faculty' THEN 'teacher' WHEN 'pending' THEN 'student' ELSE item.key END,
     CASE item.key WHEN 'pending' THEN 'pending' ELSE 'approved' END,true,'BSIT','1st Year','DEMO','DEMO-'||upper(item.key));
 END LOOP;
 student:=(p_accounts->'student'->>'id')::uuid;
 instructor:=(p_accounts->'faculty'->>'id')::uuid;
 dean:=(p_accounts->'dean'->>'id')::uuid;
 INSERT INTO imcc_review.courses(code,title,year_level,semester,lec_units,lab_units)
 VALUES('DEMO101','Demo Introduction to Computing',1,1,3,0),('DEMO102','Demo Academic Writing',1,1,3,0);
 INSERT INTO imcc_review.course_offerings(code,title,units,program,year,semester,school_year,instructor_id,instructor_name,schedule,enrollment_open)
 VALUES('DEMO101','Demo Introduction to Computing',3,'BSIT',1,'1st Semester','2026-2027',instructor,'DEMO Faculty','Mon 09:00–10:30',true) RETURNING id INTO offering;
 INSERT INTO imcc_review.enrollments(student_id,offering_id,status) VALUES(student,offering,'enrolled');
 INSERT INTO imcc_review.grades(student_id,offering_id,prelim,midterm,grade_scale) VALUES(student,offering,1.5,1.75,'school');
 INSERT INTO imcc_review.course_offerings(code,title,units,program,year,semester,school_year,instructor_id,instructor_name,schedule,enrollment_open)
 VALUES('DEMO102','Demo Academic Writing',3,'BSIT',1,'1st Semester','2026-2027',dean,'DEMO Dean','Tue 09:00–10:30',true) RETURNING id INTO offering;
 INSERT INTO imcc_review.enrollments(student_id,offering_id,status) VALUES(student,offering,'enrolled');
 INSERT INTO imcc_review.course_offerings(code,title,units,program,year,semester,school_year,enrollment_open)
 VALUES('DEMO-SUM','Demo Summer Elective',3,'BSIT',1,'Summer','2026-2027',true);
 INSERT INTO imcc_review.clearances(student_id,department_code,department_name,status)
 VALUES(student,'LIB','Demo Library','pending'),(student,'REG','Demo Registrar','pending');
 INSERT INTO imcc_review.announcements(content) VALUES('DEMO REVIEW: all records in this workspace are fictional.');
 UPDATE imcc_review_private.control SET accounts=p_accounts-'pending' WHERE id;
END $$;
REVOKE ALL ON FUNCTION public.configure_demo_review(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.configure_demo_review(jsonb) TO service_role;

COMMIT;


