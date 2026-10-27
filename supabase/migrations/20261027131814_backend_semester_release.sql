BEGIN;

-- 20261027000000_normalize_academic_terms.sql
-- Unique-key conflicts abort the whole migration; never merge school records silently.
-- Normalize assignments first so the offering trigger reuses them instead of creating duplicate canonical rows.
UPDATE public.teacher_assignments SET academic_year=translate(academic_year,'–—','--') WHERE academic_year<>translate(academic_year,'–—','--');
UPDATE public.course_offerings SET school_year=translate(school_year,'–—','--') WHERE school_year<>translate(school_year,'–—','--');
UPDATE public.student_semesters SET school_year=translate(school_year,'–—','--') WHERE school_year<>translate(school_year,'–—','--');
UPDATE public.misc_fees SET school_year=translate(school_year,'–—','--') WHERE school_year<>translate(school_year,'–—','--');
UPDATE public.faculty_evaluations SET school_year=translate(school_year,'–—','--') WHERE school_year<>translate(school_year,'–—','--');

CREATE FUNCTION private.normalize_academic_year() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_TABLE_NAME='teacher_assignments' THEN
    NEW.academic_year:=translate(NEW.academic_year,'–—','--');
  ELSE
    NEW.school_year:=translate(NEW.school_year,'–—','--');
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.normalize_academic_year() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER normalize_academic_year BEFORE INSERT OR UPDATE ON public.course_offerings FOR EACH ROW EXECUTE FUNCTION private.normalize_academic_year();
CREATE TRIGGER normalize_academic_year BEFORE INSERT OR UPDATE ON public.student_semesters FOR EACH ROW EXECUTE FUNCTION private.normalize_academic_year();
CREATE TRIGGER normalize_academic_year BEFORE INSERT OR UPDATE ON public.misc_fees FOR EACH ROW EXECUTE FUNCTION private.normalize_academic_year();
CREATE TRIGGER normalize_academic_year BEFORE INSERT OR UPDATE ON public.faculty_evaluations FOR EACH ROW EXECUTE FUNCTION private.normalize_academic_year();
CREATE TRIGGER normalize_academic_year BEFORE INSERT OR UPDATE ON public.teacher_assignments FOR EACH ROW EXECUTE FUNCTION private.normalize_academic_year();

-- 20261021111506_adviser_requirements.sql
-- Pending promotion. Run the rollback-only adviser_requirements.sql test first.

REVOKE TRUNCATE ON public.grades,public.enrollments,public.course_offerings,public.enrollment_requests FROM authenticated,anon;

ALTER TABLE public.course_offerings
  ADD COLUMN grades_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN grades_locked_at timestamptz,
  ADD COLUMN grades_locked_by uuid REFERENCES public.profiles(id),
  ADD COLUMN enrollment_open boolean NOT NULL DEFAULT false;
CREATE INDEX course_offerings_grades_locked_by_idx ON public.course_offerings(grades_locked_by);
UPDATE public.course_offerings o SET enrollment_open=true WHERE EXISTS (
  SELECT 1 FROM public.student_semesters s WHERE s.is_current IS TRUE AND s.school_year=o.school_year AND s.semester=o.semester
);

CREATE TABLE public.enrollment_locks (
  student_id uuid NOT NULL REFERENCES public.profiles(id),
  school_year text NOT NULL,
  semester text NOT NULL CHECK (semester IN ('1st Semester','2nd Semester','Summer')),
  locked_at timestamptz NOT NULL DEFAULT now(),
  locked_by uuid NOT NULL REFERENCES public.profiles(id),
  PRIMARY KEY (student_id, school_year, semester)
);
CREATE INDEX enrollment_locks_actor_idx ON public.enrollment_locks(locked_by);
ALTER TABLE public.enrollment_locks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.enrollment_locks FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.enrollment_locks TO authenticated;
CREATE POLICY enrollment_locks_read ON public.enrollment_locks FOR SELECT TO authenticated
USING (public.is_mfa_compliant() AND (student_id = (SELECT auth.uid()) OR EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role IN ('dean','admin','registrar','staff') AND p.status='approved' AND p.is_active IS TRUE
)));

CREATE TABLE public.instructor_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES public.profiles(id),
  enrollment_id uuid NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
  subject text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  UNIQUE(recipient_id, enrollment_id)
);
CREATE INDEX instructor_notifications_enrollment_idx ON public.instructor_notifications(enrollment_id);
ALTER TABLE public.instructor_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.instructor_notifications FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.instructor_notifications TO authenticated;
GRANT UPDATE(read_at) ON public.instructor_notifications TO authenticated;
CREATE POLICY instructor_notifications_own ON public.instructor_notifications FOR ALL TO authenticated
USING (recipient_id = (SELECT auth.uid()) AND public.is_mfa_compliant() AND EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.role IN ('teacher','faculty','dean','admin') AND p.status='approved' AND p.is_active IS TRUE
)) WITH CHECK (recipient_id = (SELECT auth.uid()) AND public.is_mfa_compliant());

CREATE FUNCTION private.guard_enrollment_finalization() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target record; locked_offering public.course_offerings%ROWTYPE;
BEGIN
  -- All enrollment writers and finalizers serialize on the same student rows.
  IF TG_OP='UPDATE' THEN
    PERFORM id FROM public.profiles WHERE id IN (OLD.student_id,NEW.student_id) ORDER BY id FOR UPDATE;
  ELSE
    PERFORM id FROM public.profiles WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.student_id ELSE NEW.student_id END FOR UPDATE;
  END IF;
  FOR target IN
    SELECT e.student_id,o.* FROM (
      SELECT OLD.student_id,OLD.offering_id WHERE TG_OP IN ('UPDATE','DELETE')
      UNION SELECT NEW.student_id,NEW.offering_id WHERE TG_OP IN ('UPDATE','INSERT')
    ) e JOIN public.course_offerings o ON o.id=e.offering_id ORDER BY o.id
  LOOP
    SELECT * INTO locked_offering FROM public.course_offerings WHERE id=target.id FOR UPDATE;
    IF locked_offering.grades_locked OR EXISTS (SELECT 1 FROM public.enrollment_locks l WHERE l.student_id=target.student_id AND l.school_year=locked_offering.school_year AND l.semester=locked_offering.semester) THEN
      RAISE EXCEPTION 'Enrollment is finalized and locked' USING ERRCODE='55000';
    END IF;
    IF TG_OP='INSERT' AND NOT locked_offering.enrollment_open THEN
      RAISE EXCEPTION 'Enrollment is closed for this term' USING ERRCODE='55000';
    END IF;
  END LOOP;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER guard_enrollment_finalization BEFORE INSERT OR UPDATE OR DELETE ON public.enrollments
FOR EACH ROW EXECUTE FUNCTION private.guard_enrollment_finalization();
CREATE TRIGGER guard_request_finalization BEFORE INSERT OR UPDATE OR DELETE ON public.enrollment_requests
FOR EACH ROW EXECUTE FUNCTION private.guard_enrollment_finalization();

CREATE FUNCTION private.finalize_enrollment(p_student_id uuid,p_school_year text,p_semester text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT public.is_mfa_compliant() OR NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role IN ('dean','admin','registrar','staff') AND p.status='approved' AND p.is_active IS TRUE
  ) THEN RAISE EXCEPTION 'Active enrollment reviewer access required' USING ERRCODE='42501'; END IF;
  PERFORM id FROM public.profiles WHERE id=p_student_id AND role='student' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Student not found' USING ERRCODE='P0002'; END IF;
  PERFORM o.id FROM public.course_offerings o JOIN public.enrollments e ON e.offering_id=o.id
    WHERE e.student_id=p_student_id AND o.school_year=p_school_year AND o.semester=p_semester ORDER BY o.id FOR UPDATE OF o;
  IF NOT EXISTS (SELECT 1 FROM public.enrollments e JOIN public.course_offerings o ON o.id=e.offering_id WHERE e.student_id=p_student_id AND e.status='enrolled' AND o.school_year=p_school_year AND o.semester=p_semester) THEN
    RAISE EXCEPTION 'No enrolled subjects for this student and term' USING ERRCODE='55000';
  END IF;
  IF EXISTS (SELECT 1 FROM public.enrollment_requests r JOIN public.course_offerings o ON o.id=r.offering_id WHERE r.student_id=p_student_id AND r.status='pending' AND o.school_year=p_school_year AND o.semester=p_semester) THEN
    RAISE EXCEPTION 'Review all pending subjects before finalizing enrollment' USING ERRCODE='55000';
  END IF;
  INSERT INTO public.enrollment_locks(student_id,school_year,semester,locked_by) VALUES(p_student_id,p_school_year,p_semester,auth.uid()) ON CONFLICT DO NOTHING;
END;
$$;
CREATE FUNCTION public.finalize_enrollment(p_student_id uuid,p_school_year text,p_semester text) RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.finalize_enrollment(p_student_id,p_school_year,p_semester); $$;

CREATE FUNCTION private.guard_grade_finalization() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE offering_id integer;
BEGIN
  FOR offering_id IN SELECT id FROM public.course_offerings WHERE id IN (
    CASE WHEN TG_OP<>'INSERT' THEN OLD.offering_id END,CASE WHEN TG_OP<>'DELETE' THEN NEW.offering_id END
  ) ORDER BY id FOR UPDATE LOOP
    IF (SELECT o.grades_locked FROM public.course_offerings o WHERE o.id=offering_id) THEN
      RAISE EXCEPTION 'Grades are finalized and locked' USING ERRCODE='55000';
    END IF;
  END LOOP;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER a_guard_grade_finalization BEFORE INSERT OR UPDATE OR DELETE ON public.grades
FOR EACH ROW EXECUTE FUNCTION private.guard_grade_finalization();

CREATE FUNCTION private.protect_offering_finalization() RETURNS trigger
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
    NEW.enrollment_open:=coalesce((SELECT bool_or(o.enrollment_open) FROM public.course_offerings o WHERE o.school_year=NEW.school_year AND o.semester=NEW.semester),NEW.enrollment_open);
    RETURN NEW;
  END IF;
  IF OLD.grades_locked AND (TG_OP='DELETE' OR (to_jsonb(NEW)-'enrollment_open') IS DISTINCT FROM (to_jsonb(OLD)-'enrollment_open')) THEN
    RAISE EXCEPTION 'Finalized class records cannot be changed' USING ERRCODE='55000';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF (NEW.school_year,NEW.semester) IS DISTINCT FROM (OLD.school_year,OLD.semester) AND (
    EXISTS(SELECT 1 FROM public.enrollments WHERE offering_id=OLD.id) OR EXISTS(SELECT 1 FROM public.enrollment_requests WHERE offering_id=OLD.id)
  ) THEN RAISE EXCEPTION 'Create a new offering to change the term of a used subject' USING ERRCODE='55000'; END IF;
  IF (NEW.code,NEW.title,NEW.units,NEW.program,NEW.year,NEW.schedule) IS DISTINCT FROM (OLD.code,OLD.title,OLD.units,OLD.program,OLD.year,OLD.schedule) AND EXISTS (
    SELECT 1 FROM public.enrollments e JOIN public.enrollment_locks l ON l.student_id=e.student_id AND l.school_year=OLD.school_year AND l.semester=OLD.semester WHERE e.offering_id=OLD.id
  ) THEN RAISE EXCEPTION 'Subject details belong to a finalized enrollment' USING ERRCODE='55000'; END IF;
  IF NEW.grades_locked AND NOT OLD.grades_locked THEN
    IF NOT public.is_mfa_compliant() OR NOT EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.status='approved' AND p.is_active IS TRUE AND
        (p.role IN ('dean','admin') OR (p.role IN ('teacher','faculty') AND EXISTS (SELECT 1 FROM public.teacher_assignments ta WHERE ta.teacher_id=p.id AND ta.offering_id=OLD.id AND ta.is_active IS TRUE)))
    ) THEN RAISE EXCEPTION 'Active assigned instructor, dean, or admin required' USING ERRCODE='42501'; END IF;
    IF EXISTS(SELECT 1 FROM public.enrollment_requests WHERE offering_id=OLD.id AND status='pending') THEN
      RAISE EXCEPTION 'Resolve pending enrollment requests before locking grades' USING ERRCODE='55000';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM public.enrollments WHERE offering_id=OLD.id AND status='enrolled') OR EXISTS (
      SELECT 1 FROM public.enrollments e LEFT JOIN public.grades g ON g.student_id=e.student_id AND g.offering_id=e.offering_id WHERE e.offering_id=OLD.id AND e.status='enrolled' AND (g.final IS NULL OR g.equivalent IS NULL)
    ) THEN RAISE EXCEPTION 'Save Final and Equivalent for every enrolled student before locking' USING ERRCODE='55000'; END IF;
    NEW.grades_locked_at:=now(); NEW.grades_locked_by:=auth.uid();
  ELSIF (NEW.grades_locked_at,NEW.grades_locked_by) IS DISTINCT FROM (OLD.grades_locked_at,OLD.grades_locked_by) THEN
    RAISE EXCEPTION 'Finalization metadata is managed by Lock Grades' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER a_protect_offering_finalization BEFORE INSERT OR UPDATE OR DELETE ON public.course_offerings
FOR EACH ROW EXECUTE FUNCTION private.protect_offering_finalization();

CREATE FUNCTION private.lock_class_grades(p_offering_id integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  -- The offering trigger verifies both the caller and completeness under this row lock.
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first' USING ERRCODE='42501'; END IF;
  UPDATE public.course_offerings SET grades_locked=true WHERE id=p_offering_id AND NOT grades_locked;
  IF NOT FOUND THEN RAISE EXCEPTION 'Class is missing or already locked' USING ERRCODE='55000'; END IF;
END;
$$;
CREATE FUNCTION public.lock_class_grades(p_offering_id integer) RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.lock_class_grades(p_offering_id); $$;

CREATE FUNCTION private.set_enrollment_term(p_school_year text,p_semester text,p_open boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF p_open IS NULL OR NOT public.is_mfa_compliant() OR NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role IN ('dean','admin','registrar') AND p.status='approved' AND p.is_active IS TRUE
  ) THEN RAISE EXCEPTION 'Active term manager access required' USING ERRCODE='42501'; END IF;
  UPDATE public.course_offerings SET enrollment_open=p_open WHERE school_year=p_school_year AND semester=p_semester;
  IF NOT FOUND THEN RAISE EXCEPTION 'Create subject offerings for this term first' USING ERRCODE='P0002'; END IF;
END;
$$;
CREATE FUNCTION public.set_enrollment_term(p_school_year text,p_semester text,p_open boolean) RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.set_enrollment_term(p_school_year,p_semester,p_open); $$;

CREATE FUNCTION private.notify_course_enrollment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_TABLE_NAME='enrollments' THEN
    IF NEW.status<>'enrolled' OR (TG_OP='UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status AND OLD.offering_id IS NOT DISTINCT FROM NEW.offering_id AND OLD.student_id IS NOT DISTINCT FROM NEW.student_id) THEN RETURN NEW; END IF;
    INSERT INTO public.instructor_notifications(recipient_id,enrollment_id,subject,body)
      SELECT o.instructor_id,NEW.id,'New enrollment — '||o.code,p.full_name||' enrolled in '||o.code||' — '||o.title||' ('||o.semester||' '||o.school_year||').' FROM public.course_offerings o JOIN public.profiles p ON p.id=NEW.student_id WHERE o.id=NEW.offering_id AND o.instructor_id IS NOT NULL
      ON CONFLICT(recipient_id,enrollment_id) DO UPDATE SET subject=EXCLUDED.subject,body=EXCLUDED.body,created_at=now(),read_at=NULL;
  ELSE
    IF NEW.instructor_id IS NULL OR NEW.instructor_id IS NOT DISTINCT FROM OLD.instructor_id THEN RETURN NEW; END IF;
    INSERT INTO public.instructor_notifications(recipient_id,enrollment_id,subject,body)
      SELECT NEW.instructor_id,e.id,'Class roster — '||NEW.code,p.full_name||' is enrolled in '||NEW.code||' — '||NEW.title||' ('||NEW.semester||' '||NEW.school_year||').' FROM public.enrollments e JOIN public.profiles p ON p.id=e.student_id WHERE e.offering_id=NEW.id AND e.status='enrolled'
      ON CONFLICT(recipient_id,enrollment_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER notify_course_enrollment AFTER INSERT OR UPDATE ON public.enrollments FOR EACH ROW EXECUTE FUNCTION private.notify_course_enrollment();
CREATE TRIGGER notify_assigned_roster AFTER UPDATE OF instructor_id ON public.course_offerings FOR EACH ROW EXECUTE FUNCTION private.notify_course_enrollment();

CREATE FUNCTION private.get_student_record(p_student_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.is_mfa_compliant() OR NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role IN ('dean','admin') AND p.status='approved' AND p.is_active IS TRUE
  ) THEN RAISE EXCEPTION 'Active dean or admin access required' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object('id',p.id,'full_name',p.full_name,'student_no',p.student_no,'id_number',p.id_number,'program',p.program,'year_level',p.year_level,'section',p.section,'email',p.email,'phone',p.phone,'address',p.address,'status',p.status,'is_active',p.is_active) INTO result FROM public.profiles p WHERE p.id=p_student_id AND p.role='student';
  IF result IS NULL THEN RAISE EXCEPTION 'Student not found' USING ERRCODE='P0002'; END IF;
  RETURN jsonb_build_object(
    'profile',result,
    'enrollments',coalesce((SELECT jsonb_agg(to_jsonb(e)||jsonb_build_object('code',o.code,'title',o.title,'units',o.units,'semester',o.semester,'school_year',o.school_year) ORDER BY o.school_year,o.semester,o.code) FROM public.enrollments e JOIN public.course_offerings o ON o.id=e.offering_id WHERE e.student_id=p_student_id),'[]'::jsonb),
    'grades',coalesce((SELECT jsonb_agg(to_jsonb(g)||jsonb_build_object('code',o.code,'semester',o.semester,'school_year',o.school_year) ORDER BY o.school_year,o.semester,o.code) FROM public.grades g JOIN public.course_offerings o ON o.id=g.offering_id WHERE g.student_id=p_student_id),'[]'::jsonb),
    'clearances',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.department_name) FROM public.clearances c WHERE c.student_id=p_student_id),'[]'::jsonb),
    'attendance',coalesce((SELECT jsonb_agg(to_jsonb(a)||jsonb_build_object('code',o.code) ORDER BY a.date DESC) FROM public.attendance a JOIN public.course_offerings o ON o.id=a.offering_id WHERE a.student_id=p_student_id),'[]'::jsonb),
    'semesters',coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM public.student_semesters t WHERE t.student_id=p_student_id),'[]'::jsonb),
    'transactions',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.txn_date DESC) FROM public.transactions t WHERE t.student_id=p_student_id),'[]'::jsonb),
    'installments',coalesce((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.due_date) FROM public.installments i WHERE i.student_id=p_student_id),'[]'::jsonb),
    'billing',(SELECT to_jsonb(b) FROM public.billing_summary b WHERE b.student_id=p_student_id)
  );
END;
$$;
CREATE FUNCTION public.get_student_record(p_student_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT private.get_student_record(p_student_id); $$;

REVOKE ALL ON FUNCTION private.guard_enrollment_finalization(),private.guard_grade_finalization(),private.protect_offering_finalization(),private.notify_course_enrollment() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.finalize_enrollment(uuid,text,text),public.finalize_enrollment(uuid,text,text),private.lock_class_grades(integer),public.lock_class_grades(integer),private.set_enrollment_term(text,text,boolean),public.set_enrollment_term(text,text,boolean),private.get_student_record(uuid),public.get_student_record(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.finalize_enrollment(uuid,text,text),public.finalize_enrollment(uuid,text,text),private.lock_class_grades(integer),public.lock_class_grades(integer),private.set_enrollment_term(text,text,boolean),public.set_enrollment_term(text,text,boolean),private.get_student_record(uuid),public.get_student_record(uuid) TO authenticated;


CREATE FUNCTION private.get_enrollment_workspace() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT public.is_mfa_compliant() OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role IN ('dean','admin','registrar','staff') AND p.status='approved' AND p.is_active IS TRUE) THEN RAISE EXCEPTION 'Active enrollment reviewer access required' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object(
    'groups',coalesce((SELECT jsonb_agg(to_jsonb(g) ORDER BY g.student_name,g.school_year,g.semester) FROM (
      SELECT e.student_id,p.full_name AS student_name,coalesce(p.student_no,p.id_number) AS student_no,p.year_level,o.school_year,o.semester,sum(o.units) AS units,l.locked_at
      FROM public.enrollments e JOIN public.profiles p ON p.id=e.student_id JOIN public.course_offerings o ON o.id=e.offering_id
      LEFT JOIN public.enrollment_locks l ON l.student_id=e.student_id AND l.school_year=o.school_year AND l.semester=o.semester
      WHERE e.status='enrolled' GROUP BY e.student_id,p.full_name,p.student_no,p.id_number,p.year_level,o.school_year,o.semester,l.locked_at
    ) g),'[]'::jsonb),
    'terms',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.school_year DESC,t.semester) FROM (SELECT school_year,semester,bool_or(enrollment_open) AS is_open FROM public.course_offerings GROUP BY school_year,semester) t),'[]'::jsonb)
  );
END;
$$;
CREATE FUNCTION public.get_enrollment_workspace() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT private.get_enrollment_workspace(); $$;
REVOKE ALL ON FUNCTION private.get_enrollment_workspace(),public.get_enrollment_workspace() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.get_enrollment_workspace(),public.get_enrollment_workspace() TO authenticated;

-- An unassigned new class has no assignment to synchronize; instructor changes retain the manager guard.
DROP TRIGGER trg_sync_teacher_assignment ON public.course_offerings;
CREATE TRIGGER trg_sync_teacher_assignment AFTER UPDATE OF instructor_id,school_year,semester ON public.course_offerings FOR EACH ROW EXECUTE FUNCTION public.sync_teacher_assignment();
CREATE TRIGGER trg_sync_teacher_assignment_insert AFTER INSERT ON public.course_offerings FOR EACH ROW WHEN (NEW.instructor_id IS NOT NULL) EXECUTE FUNCTION public.sync_teacher_assignment();

CREATE FUNCTION private.publish_summer_offering(p_source_offering_id integer,p_school_year text,p_schedule text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.is_mfa_compliant() OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role IN ('dean','admin','registrar') AND status='approved' AND is_active IS TRUE
  ) THEN RAISE EXCEPTION 'Active registrar, dean, or admin access required' USING ERRCODE='42501'; END IF;
  IF p_school_year IS NULL OR p_school_year !~ '^\d{4}[-–—]\d{4}$' THEN
    RAISE EXCEPTION 'A school year is required' USING ERRCODE='23514';
  END IF;
  INSERT INTO public.course_offerings(code,title,units,program,year,semester,school_year,schedule,is_major)
  SELECT code,title,units,program,year,'Summer',translate(p_school_year,'–—','--'),nullif(btrim(p_schedule),''),is_major
  FROM public.course_offerings WHERE id=p_source_offering_id AND year BETWEEN 1 AND 4 AND units>0
  RETURNING to_jsonb(course_offerings) INTO result;
  IF result IS NULL THEN RAISE EXCEPTION 'Choose an existing subject with a valid year level and units' USING ERRCODE='P0002'; END IF;
  RETURN result;
END;
$$;
CREATE FUNCTION public.publish_summer_offering(p_source_offering_id integer,p_school_year text,p_schedule text DEFAULT NULL) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.publish_summer_offering(p_source_offering_id,p_school_year,p_schedule); $$;
REVOKE ALL ON FUNCTION private.publish_summer_offering(integer,text,text),public.publish_summer_offering(integer,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.publish_summer_offering(integer,text,text),public.publish_summer_offering(integer,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_grade_calculations() RETURNS trigger
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


CREATE OR REPLACE FUNCTION private.save_course_offering_with_instructor(p_offering_id integer DEFAULT NULL::integer, p_code text DEFAULT NULL::text, p_title text DEFAULT NULL::text, p_units numeric DEFAULT 3.0, p_program text DEFAULT NULL::text, p_year integer DEFAULT 1, p_semester text DEFAULT NULL::text, p_school_year text DEFAULT NULL::text, p_schedule text DEFAULT NULL::text, p_instructor_id uuid DEFAULT NULL::uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE instructor text; result jsonb;
BEGIN
  IF NOT public.is_mfa_compliant() OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role IN ('dean','admin') AND p.status='approved' AND p.is_active IS TRUE) THEN
    RAISE EXCEPTION 'Active dean or admin access required' USING ERRCODE='42501';
  END IF;
  IF p_code IS NULL OR btrim(p_code)='' OR p_title IS NULL OR btrim(p_title)='' OR p_school_year IS NULL OR p_school_year !~ '^\d{4}[-–—]\d{4}$' OR p_units IS NULL OR p_units<=0 OR p_units::text IN ('NaN','Infinity','-Infinity') OR p_year IS NULL OR p_year NOT BETWEEN 1 AND 4 OR p_semester IS NULL OR p_semester NOT IN ('1st Semester','2nd Semester','Summer') THEN
    RAISE EXCEPTION 'Subject code, title, school year, semester, year level, and positive units are required' USING ERRCODE='23514';
  END IF;
  IF p_instructor_id IS NOT NULL THEN
    SELECT p.full_name INTO instructor FROM public.profiles p WHERE p.id=p_instructor_id AND p.status='approved' AND p.is_active IS TRUE AND (p.role IN ('teacher','faculty') OR (p.role='dean' AND p.id=auth.uid()));
    IF instructor IS NULL THEN RAISE EXCEPTION 'Choose an active eligible instructor or leave unassigned' USING ERRCODE='42501'; END IF;
  END IF;
  IF p_offering_id IS NULL THEN
    INSERT INTO public.course_offerings(code,title,units,program,year,semester,school_year,schedule,instructor_id,instructor_name)
    VALUES(btrim(p_code),btrim(p_title),p_units,p_program,p_year,p_semester,translate(p_school_year,'–—','--'),p_schedule,p_instructor_id,instructor)
    RETURNING to_jsonb(course_offerings) INTO result;
  ELSE
    UPDATE public.course_offerings SET code=btrim(p_code),title=btrim(p_title),units=p_units,program=p_program,year=p_year,semester=p_semester,school_year=translate(p_school_year,'–—','--'),schedule=p_schedule,instructor_id=p_instructor_id,instructor_name=instructor
    WHERE id=p_offering_id RETURNING to_jsonb(course_offerings) INTO result;
    IF result IS NULL THEN RAISE EXCEPTION 'Offering not found or access denied' USING ERRCODE='P0002'; END IF;
  END IF;
  RETURN result;
END;
$$;
CREATE OR REPLACE FUNCTION public.save_course_offering_with_instructor(p_offering_id integer DEFAULT NULL::integer, p_code text DEFAULT NULL::text, p_title text DEFAULT NULL::text, p_units numeric DEFAULT 3.0, p_program text DEFAULT NULL::text, p_year integer DEFAULT 1, p_semester text DEFAULT NULL::text, p_school_year text DEFAULT NULL::text, p_schedule text DEFAULT NULL::text, p_instructor_id uuid DEFAULT NULL::uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.save_course_offering_with_instructor(p_offering_id,p_code,p_title,p_units,p_program,p_year,p_semester,p_school_year,p_schedule,p_instructor_id); $$;
REVOKE ALL ON FUNCTION private.save_course_offering_with_instructor(integer,text,text,numeric,text,integer,text,text,text,uuid),public.save_course_offering_with_instructor(integer,text,text,numeric,text,integer,text,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.save_course_offering_with_instructor(integer,text,text,numeric,text,integer,text,text,text,uuid),public.save_course_offering_with_instructor(integer,text,text,numeric,text,integer,text,text,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.get_subject_instructor_options()
RETURNS TABLE(id uuid,full_name text,role text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT p.id,p.full_name,p.role FROM public.profiles p WHERE p.status='approved' AND p.is_active IS TRUE
  AND (p.role IN ('teacher','faculty') OR (p.role='dean' AND p.id=auth.uid()))
  AND public.is_mfa_compliant() AND EXISTS (SELECT 1 FROM public.profiles actor WHERE actor.id=auth.uid() AND actor.role IN ('dean','admin') AND actor.status='approved' AND actor.is_active IS TRUE)
  ORDER BY p.full_name,p.id;
$$;
CREATE OR REPLACE FUNCTION public.get_subject_instructor_options()
RETURNS TABLE(id uuid,full_name text,role text) LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT * FROM private.get_subject_instructor_options(); $$;
REVOKE ALL ON FUNCTION private.get_subject_instructor_options(),public.get_subject_instructor_options() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.get_subject_instructor_options(),public.get_subject_instructor_options() TO authenticated;

CREATE FUNCTION private.list_student_records() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT public.is_mfa_compliant() OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role IN ('dean','admin') AND p.status='approved' AND p.is_active IS TRUE) THEN RAISE EXCEPTION 'Active dean or admin access required' USING ERRCODE='42501'; END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'full_name',p.full_name,'student_no',coalesce(p.student_no,p.id_number),'program',p.program,'year_level',p.year_level,'role',p.role,'status',p.status) ORDER BY p.full_name,p.id) FROM public.profiles p WHERE p.role='student'),'[]'::jsonb);
END;
$$;
CREATE FUNCTION public.list_student_records() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT private.list_student_records(); $$;
REVOKE ALL ON FUNCTION private.list_student_records(),public.list_student_records() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.list_student_records(),public.list_student_records() TO authenticated;

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
    AND e.status = 'enrolled' AND co.school_year=off.school_year AND co.semester=off.semester;

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

-- 20261025174457_backend_access_controls.sql
DO $$ BEGIN
 IF to_regprocedure('public.finalize_enrollment(uuid,text,text)') IS NULL THEN
  RAISE EXCEPTION 'Apply the validated adviser requirements migration first';
 END IF;
END $$;

ALTER TABLE public.profiles DROP CONSTRAINT profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('student','faculty','teacher','staff','admin','dean','registrar'));
GRANT UPDATE(id_number,requested_role,updated_at) ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.is_mfa_compliant() IS TRUE AND EXISTS (
  SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='admin' AND status='approved' AND is_active IS TRUE
 );
$$;

CREATE OR REPLACE FUNCTION public.admin_set_profile_access(p_profile_id uuid,p_role text DEFAULT NULL,p_status text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Active admin and MFA required' USING ERRCODE='42501'; END IF;
 IF (p_role IS NULL AND p_status IS NULL)
 OR (p_role IS NOT NULL AND p_role NOT IN ('student','faculty','teacher','staff','admin','dean','registrar'))
 OR (p_status IS NOT NULL AND p_status NOT IN ('approved','pending','rejected','onboarding')) THEN
  RAISE EXCEPTION 'Invalid role or status' USING ERRCODE='22023';
 END IF;
 UPDATE public.profiles SET role=coalesce(p_role,role),status=coalesce(p_status,status),updated_at=now() WHERE id=p_profile_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found' USING ERRCODE='P0002'; END IF;
END;
$$;
CREATE FUNCTION public.set_user_role(target_id uuid,new_role text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF new_role IS NULL THEN RAISE EXCEPTION 'Role required' USING ERRCODE='22023'; END IF;
 PERFORM public.admin_set_profile_access(target_id,new_role,NULL);
END;
$$;
CREATE FUNCTION public.set_user_approval(target_id uuid,approved boolean,approved_role text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF approved IS NULL THEN RAISE EXCEPTION 'Approval decision required' USING ERRCODE='22023'; END IF;
 PERFORM public.admin_set_profile_access(target_id,CASE WHEN approved THEN coalesce(approved_role,'student') END,
   CASE WHEN approved THEN 'approved' ELSE 'rejected' END);
 UPDATE public.profiles SET is_active=approved,requested_role=NULL,
   deactivated_at=CASE WHEN approved THEN NULL ELSE now() END WHERE id=target_id;
END;
$$;
CREATE FUNCTION public.set_user_active(target_id uuid,active boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Active admin and MFA required' USING ERRCODE='42501'; END IF;
 IF active IS NULL THEN RAISE EXCEPTION 'Active state required' USING ERRCODE='22023'; END IF;
 UPDATE public.profiles SET is_active=active,deactivated_at=CASE WHEN active THEN NULL ELSE now() END,updated_at=now() WHERE id=target_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found' USING ERRCODE='P0002'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.set_user_role(uuid,text),public.set_user_approval(uuid,boolean,text),public.set_user_active(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_user_role(uuid,text),public.set_user_approval(uuid,boolean,text),public.set_user_active(uuid,boolean) TO authenticated;

CREATE FUNCTION private.submit_profile_request() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid()=OLD.id AND NOT public.is_admin() THEN
  IF OLD.status NOT IN ('onboarding','pending') OR OLD.is_active IS FALSE
    OR NEW.requested_role NOT IN ('student','faculty','teacher','staff','dean','registrar') THEN
   RAISE EXCEPTION 'Account cannot submit this access request' USING ERRCODE='42501';
  END IF;
  NEW.status:='pending';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER submit_profile_request BEFORE UPDATE OF requested_role,id_number ON public.profiles
FOR EACH ROW EXECUTE FUNCTION private.submit_profile_request();

-- Triggers also run inside owner-privileged RPCs, which bypass table RLS.
CREATE FUNCTION private.require_write_mfa() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NOT NULL AND public.is_mfa_compliant() IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'Complete MFA before changing records' USING ERRCODE='42501';
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER require_write_mfa BEFORE INSERT OR UPDATE OR DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION private.require_write_mfa();
CREATE TRIGGER require_write_mfa BEFORE INSERT OR UPDATE OR DELETE ON public.grades
FOR EACH ROW EXECUTE FUNCTION private.require_write_mfa();
CREATE TRIGGER require_write_mfa BEFORE INSERT OR UPDATE OR DELETE ON public.course_offerings
FOR EACH ROW EXECUTE FUNCTION private.require_write_mfa();
CREATE TRIGGER require_write_mfa BEFORE INSERT OR UPDATE OR DELETE ON public.enrollments
FOR EACH ROW EXECUTE FUNCTION private.require_write_mfa();
CREATE TRIGGER require_write_mfa BEFORE INSERT OR UPDATE OR DELETE ON public.teacher_assignments
FOR EACH ROW EXECUTE FUNCTION private.require_write_mfa();
REVOKE ALL ON FUNCTION private.require_write_mfa(),private.submit_profile_request() FROM PUBLIC,anon,authenticated;
CREATE POLICY enrollment_mfa ON public.enrollments AS RESTRICTIVE FOR ALL TO authenticated
 USING ((SELECT public.is_mfa_compliant())) WITH CHECK ((SELECT public.is_mfa_compliant()));
CREATE POLICY assignment_mfa ON public.teacher_assignments AS RESTRICTIVE FOR ALL TO authenticated
 USING ((SELECT public.is_mfa_compliant())) WITH CHECK ((SELECT public.is_mfa_compliant()));
CREATE POLICY evaluation_mfa ON public.faculty_evaluations AS RESTRICTIVE FOR ALL TO authenticated
 USING ((SELECT public.is_mfa_compliant())) WITH CHECK ((SELECT public.is_mfa_compliant()));

ALTER POLICY "Approved staff manage enrollments" ON public.enrollments
USING (EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role IN ('admin','dean','registrar','staff') AND status='approved' AND is_active IS TRUE))
WITH CHECK (EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role IN ('admin','dean','registrar','staff') AND status='approved' AND is_active IS TRUE));
ALTER POLICY "Faculty read all attendance" ON public.attendance USING (
 EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.status='approved' AND p.is_active IS TRUE AND (
  p.role IN ('admin','dean','staff') OR (p.role IN ('teacher','faculty') AND EXISTS(
   SELECT 1 FROM public.teacher_assignments ta WHERE ta.teacher_id=p.id AND ta.offering_id=attendance.offering_id AND ta.is_active IS TRUE))
 ))
);

CREATE FUNCTION private.validate_attendance_enrollment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM 1 FROM public.enrollments WHERE student_id=NEW.student_id AND offering_id=NEW.offering_id FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Attendance requires a matching enrollment' USING ERRCODE='23503'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER validate_attendance_enrollment BEFORE INSERT OR UPDATE ON public.attendance
FOR EACH ROW EXECUTE FUNCTION private.validate_attendance_enrollment();
REVOKE ALL ON FUNCTION private.validate_attendance_enrollment() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.get_attendance_history(p_offering_ids integer[])
RETURNS TABLE(date date,offering_id integer,present bigint,absent bigint,late bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT a.date,a.offering_id,count(*) FILTER(WHERE a.status='present'),
  count(*) FILTER(WHERE a.status='absent'),count(*) FILTER(WHERE a.status='late')
 FROM public.attendance a WHERE a.offering_id=ANY(p_offering_ids)
 GROUP BY a.date,a.offering_id ORDER BY a.date DESC,a.offering_id LIMIT 20;
$$;
REVOKE ALL ON FUNCTION public.get_attendance_history(integer[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_attendance_history(integer[]) TO authenticated;

CREATE FUNCTION private.get_clearance_workspace()
RETURNS TABLE(id uuid,student_id uuid,department_code text,department_name text,officer_name text,icon text,
 status text,note text,cleared_at timestamptz,created_at timestamptz,profiles jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF public.is_mfa_compliant() IS DISTINCT FROM TRUE OR NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role IN ('staff','admin') AND p.status='approved' AND p.is_active IS TRUE
 ) THEN RAISE EXCEPTION 'Approved active clearance staff and MFA required' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT c.id,c.student_id,c.department_code,c.department_name,c.officer_name,c.icon,c.status,c.note,c.cleared_at,c.created_at,
  jsonb_build_object('student_no',p.student_no,'full_name',p.full_name,'program',p.program)
 FROM public.clearances c JOIN public.profiles p ON p.id=c.student_id ORDER BY c.created_at DESC,c.id;
END;
$$;
CREATE FUNCTION public.get_clearance_workspace()
RETURNS TABLE(id uuid,student_id uuid,department_code text,department_name text,officer_name text,icon text,
 status text,note text,cleared_at timestamptz,created_at timestamptz,profiles jsonb)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT * FROM private.get_clearance_workspace(); $$;
REVOKE ALL ON FUNCTION private.get_clearance_workspace(),public.get_clearance_workspace() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.get_clearance_workspace(),public.get_clearance_workspace() TO authenticated;

ALTER POLICY "Students insert own evaluations" ON public.faculty_evaluations WITH CHECK (
 student_id=auth.uid() AND public.is_mfa_compliant() IS TRUE AND EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role='student' AND p.status='approved' AND p.is_active IS TRUE
 ) AND EXISTS (
  SELECT 1 FROM public.enrollments e JOIN public.course_offerings o ON o.id=e.offering_id
  WHERE e.student_id=auth.uid() AND e.status IN ('enrolled','completed')
   AND o.instructor_id=faculty_evaluations.instructor_id AND o.school_year=faculty_evaluations.school_year AND o.semester=faculty_evaluations.semester
 )
);
DROP POLICY "Teachers view own evaluations" ON public.faculty_evaluations;

CREATE FUNCTION private.instructor_evaluation_summary()
RETURNS TABLE(instructor_name text,school_year text,semester text,total_evaluations integer,
 avg_teaching_clarity numeric,avg_knowledge numeric,avg_availability numeric,avg_fairness numeric,avg_punctuality numeric,avg_overall numeric,instructor_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT max(e.instructor_name),e.school_year,e.semester,count(*)::integer,
 round(avg(e.teaching_clarity),2),round(avg(e.knowledge),2),round(avg(e.availability),2),round(avg(e.fairness),2),round(avg(e.punctuality),2),
 round(avg((e.teaching_clarity+e.knowledge+e.availability+e.fairness+e.punctuality)::numeric/5),2),e.instructor_id
 FROM public.faculty_evaluations e
 WHERE public.is_mfa_compliant() IS TRUE AND EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.status='approved' AND p.is_active IS TRUE
   AND (p.role IN ('dean','admin') OR (p.role IN ('teacher','faculty') AND e.instructor_id=p.id))
 ) GROUP BY e.instructor_id,e.school_year,e.semester;
$$;
REVOKE ALL ON FUNCTION private.instructor_evaluation_summary() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.instructor_evaluation_summary() TO authenticated;
CREATE OR REPLACE VIEW public.instructor_evaluation_summary WITH (security_invoker=true)
AS SELECT * FROM private.instructor_evaluation_summary();
REVOKE ALL ON public.instructor_evaluation_summary FROM PUBLIC,anon;
GRANT SELECT ON public.instructor_evaluation_summary TO authenticated;

CREATE FUNCTION private.is_staffed_office(candidate uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=candidate AND status='approved' AND is_active IS TRUE
  AND role IN ('teacher','faculty','staff','dean','registrar','admin'));
$$;
CREATE FUNCTION private.is_approved_account(candidate uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=candidate AND status='approved' AND is_active IS TRUE);
$$;
REVOKE ALL ON FUNCTION private.is_staffed_office(uuid),private.is_approved_account(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.is_staffed_office(uuid),private.is_approved_account(uuid) TO authenticated;
DROP POLICY "Users send messages" ON public.messages;
CREATE POLICY "Approved users send to eligible recipients" ON public.messages FOR INSERT TO authenticated WITH CHECK (
 sender_id=auth.uid() AND public.is_mfa_compliant() IS TRUE AND private.is_approved_account(auth.uid()) AND (
  (EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='student') AND private.is_staffed_office(recipient_id))
  OR (private.is_staffed_office(auth.uid()) AND private.is_approved_account(recipient_id))
 )
);
REVOKE UPDATE ON public.messages FROM authenticated;
GRANT UPDATE(is_read,read_at) ON public.messages TO authenticated;
REVOKE TRUNCATE,TRIGGER,REFERENCES ON ALL TABLES IN SCHEMA public FROM authenticated,anon;

CREATE TABLE private.faq_rate_limits (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 window_start timestamptz NOT NULL,
 requests integer NOT NULL
);
REVOKE ALL ON private.faq_rate_limits FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.consume_faq_request(p_user_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE allowed boolean;
BEGIN
 INSERT INTO private.faq_rate_limits AS limits(user_id,window_start,requests)
 VALUES(p_user_id,clock_timestamp(),1)
 ON CONFLICT(user_id) DO UPDATE SET
  requests=CASE WHEN limits.window_start<=clock_timestamp()-interval '1 minute' THEN 1 ELSE limits.requests+1 END,
  window_start=CASE WHEN limits.window_start<=clock_timestamp()-interval '1 minute' THEN clock_timestamp() ELSE limits.window_start END
 WHERE limits.requests<10 OR limits.window_start<=clock_timestamp()-interval '1 minute'
 RETURNING true INTO allowed;
 RETURN coalesce(allowed,false);
END;
$$;
REVOKE ALL ON FUNCTION public.consume_faq_request(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.consume_faq_request(uuid) TO service_role;

CREATE FUNCTION public.portal_release_ready() RETURNS text
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT CASE WHEN
  NOT EXISTS(SELECT 1 FROM unnest(ARRAY[
   'public.set_user_role(uuid,text)','public.set_user_approval(uuid,boolean,text)','public.set_user_active(uuid,boolean)',
   'public.lock_class_grades(integer)','public.finalize_enrollment(uuid,text,text)','public.get_student_record(uuid)',
   'public.list_student_records()','public.get_enrollment_workspace()','public.get_clearance_workspace()','public.get_attendance_history(integer[])','public.consume_faq_request(uuid)'
  ]) signature WHERE to_regprocedure(signature) IS NULL)
  AND EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.course_offerings'::regclass AND attname='grades_locked' AND NOT attisdropped)
 THEN 'backend-v2' END;
$$;
REVOKE ALL ON FUNCTION public.portal_release_ready() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_release_ready() TO anon,authenticated;

-- 20261027001000_semester_enrollment_totals.sql
ALTER TABLE public.student_semesters ALTER COLUMN units_enrolled TYPE numeric;

CREATE FUNCTION private.refresh_enrollment_totals(p_student_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM id FROM public.profiles WHERE id=p_student_id AND role='student' FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO public.student_semesters(student_id,school_year,semester,is_current,units_enrolled,subjects_enrolled)
    SELECT e.student_id,o.school_year,o.semester,false,sum(o.units),count(*)
    FROM public.enrollments e JOIN public.course_offerings o ON o.id=e.offering_id
    WHERE e.student_id=p_student_id AND e.status='enrolled'
    GROUP BY e.student_id,o.school_year,o.semester
    ON CONFLICT(student_id,school_year,semester) DO UPDATE SET
      units_enrolled=EXCLUDED.units_enrolled,subjects_enrolled=EXCLUDED.subjects_enrolled;
  UPDATE public.student_semesters s SET units_enrolled=0,subjects_enrolled=0
    WHERE s.student_id=p_student_id AND NOT EXISTS (
      SELECT 1 FROM public.enrollments e JOIN public.course_offerings o ON o.id=e.offering_id
      WHERE e.student_id=s.student_id AND e.status='enrolled' AND o.school_year=s.school_year AND o.semester=s.semester
    );
END;
$$;
REVOKE ALL ON FUNCTION private.refresh_enrollment_totals(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.sync_student_term_on_enroll() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE student uuid; off public.course_offerings%ROWTYPE;
BEGIN
  FOR student IN SELECT id FROM public.profiles WHERE role='student' AND id IN (
    CASE WHEN TG_OP<>'INSERT' THEN OLD.student_id END,
    CASE WHEN TG_OP<>'DELETE' THEN NEW.student_id END
  ) ORDER BY id FOR UPDATE LOOP
    PERFORM private.refresh_enrollment_totals(student);
  END LOOP;
  IF TG_OP='INSERT' AND NEW.status='enrolled' THEN
    SELECT * INTO off FROM public.course_offerings WHERE id=NEW.offering_id;
    IF NOT EXISTS (
      SELECT 1 FROM public.student_semesters s WHERE s.student_id=NEW.student_id AND s.is_current
      AND (s.school_year,array_position(ARRAY['1st Semester','2nd Semester','Summer'],s.semester)) >
          (off.school_year,array_position(ARRAY['1st Semester','2nd Semester','Summer'],off.semester))
    ) THEN
      UPDATE public.student_semesters SET is_current=false WHERE student_id=NEW.student_id AND is_current;
      UPDATE public.student_semesters SET is_current=true WHERE student_id=NEW.student_id AND school_year=off.school_year AND semester=off.semester;
    END IF;
    PERFORM public.initialize_student_clearances(NEW.student_id);
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER trg_sync_student_term_on_enroll ON public.enrollments;
CREATE TRIGGER trg_sync_student_term_on_enroll AFTER INSERT OR UPDATE OR DELETE ON public.enrollments
FOR EACH ROW EXECUTE FUNCTION public.sync_student_term_on_enroll();

CREATE FUNCTION private.refresh_offering_enrollment_totals() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE student uuid;
BEGIN
  FOR student IN SELECT DISTINCT student_id FROM public.enrollments WHERE offering_id=NEW.id ORDER BY student_id LOOP
    PERFORM private.refresh_enrollment_totals(student);
  END LOOP;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION private.refresh_offering_enrollment_totals() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER refresh_offering_enrollment_totals AFTER UPDATE OF units ON public.course_offerings
FOR EACH ROW WHEN (OLD.units IS DISTINCT FROM NEW.units) EXECUTE FUNCTION private.refresh_offering_enrollment_totals();

DO $$ DECLARE student uuid; BEGIN
  FOR student IN SELECT id FROM public.profiles WHERE role='student' ORDER BY id LOOP
    PERFORM private.refresh_enrollment_totals(student);
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.portal_release_ready() RETURNS text
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT CASE WHEN
  NOT EXISTS(SELECT 1 FROM unnest(ARRAY[
   'public.set_user_role(uuid,text)','public.set_user_approval(uuid,boolean,text)','public.set_user_active(uuid,boolean)',
   'public.lock_class_grades(integer)','public.finalize_enrollment(uuid,text,text)','public.get_student_record(uuid)',
   'public.list_student_records()','public.get_enrollment_workspace()','public.get_clearance_workspace()',
   'public.get_attendance_history(integer[])','public.consume_faq_request(uuid)'
  ]) signature WHERE to_regprocedure(signature) IS NULL)
  AND EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.course_offerings'::regclass AND attname='grades_locked' AND NOT attisdropped)
  AND EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.course_offerings'::regclass AND attname='enrollment_open' AND NOT attisdropped)
  AND EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='public.enrollments'::regclass AND tgname='trg_sync_student_term_on_enroll' AND (tgtype::integer & 28)=28)
 THEN 'semester-v3' END;
$$;

-- 20261021045356_faq_search_and_content.sql
-- One named-argument RPC, with the existing return contract preserved.
DROP FUNCTION IF EXISTS public.match_faq_articles(extensions.vector, double precision, integer);
CREATE OR REPLACE FUNCTION public.match_faq_articles(
  query_embedding extensions.vector, match_count integer DEFAULT 5,
  match_threshold double precision DEFAULT 0.5
) RETURNS TABLE(id uuid, category text, question text, answer text, keywords text, similarity double precision)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, extensions, pg_temp
AS $function$
  SELECT f.id, f.category, f.question, f.answer, f.keywords,
         1 - (f.embedding OPERATOR(extensions.<=>) query_embedding) AS similarity
  FROM public.faq_articles f
  WHERE f.is_active AND f.embedding IS NOT NULL
    AND 1 - (f.embedding OPERATOR(extensions.<=>) query_embedding) > match_threshold
  ORDER BY f.embedding OPERATOR(extensions.<=>) query_embedding
  LIMIT LEAST(GREATEST(match_count, 1), 20);
$function$;
REVOKE ALL ON FUNCTION public.match_faq_articles(extensions.vector, integer, double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_faq_articles(extensions.vector, integer, double precision) TO authenticated, service_role;

-- Content edits must never retain an embedding of the old answer.
CREATE OR REPLACE FUNCTION public.invalidate_faq_embedding()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp
AS $function$
BEGIN
  IF ROW(NEW.category, NEW.question, NEW.answer, NEW.keywords)
     IS DISTINCT FROM ROW(OLD.category, OLD.question, OLD.answer, OLD.keywords) THEN
    NEW.embedding := NULL;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.invalidate_faq_embedding() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS faq_content_changed ON public.faq_articles;
CREATE TRIGGER faq_content_changed BEFORE UPDATE OF category, question, answer, keywords
ON public.faq_articles FOR EACH ROW EXECUTE FUNCTION public.invalidate_faq_embedding();

-- Rebuild with gte-small; MiniLM vectors are not interchangeable.
UPDATE public.faq_articles SET embedding = NULL WHERE embedding IS NOT NULL;

UPDATE public.faq_articles
   SET answer = 'Tuition is settled through the Cashier''s Office or your designated '
             || 'payment channel. Open Billing & History to see your assessed balance and '
             || 'any installment schedule the Cashier''s Office has issued. Payment status is '
             || 'recorded by cashier staff, so it will not change until they process it. '
             || 'If no schedule is shown, no schedule has been published yet and your full '
             || 'assessed balance is due.'
 WHERE question = 'Can I pay in installments?';

UPDATE public.faq_articles
   SET answer = 'Go to Billing & History to view your assessed balance, your published '
             || 'installment schedule, and your transaction history. Payment status is '
             || 'recorded by Cashier staff; there is no online payment button in the portal.'
 WHERE answer ILIKE '%Pay Now%';

UPDATE public.faq_articles
   SET answer = 'To get library clearance, return all borrowed books and settle any library '
             || 'fines with the Library. Once your account is clear, the librarian signs your '
             || 'clearance. If books or fines are outstanding, Library clearance will show '
             || 'Action Required.'
 WHERE question = 'How do I get cleared by the library?';

UPDATE public.faq_articles
   SET answer = 'Open the Class Schedule page in the sidebar. It lists your enrolled subjects '
             || 'with meeting day, time, room and instructor, and the class you are sitting in '
             || 'right now is highlighted. All times are Manila time. If a subject you are '
             || 'enrolled in has no meeting time published yet, the page says so and names the '
             || 'Registrar to confirm with, rather than showing an invented time.'
 WHERE question = 'How do I view my class schedule?';

UPDATE public.faq_articles
   SET answer = 'Sign in with the official @imcc.edu.ph address issued to you by the '
             || 'institution. Access is granted by the administration: your student account '
             || 'is confirmed automatically from your institutional email, while faculty, '
             || 'staff and administrative accounts are approved manually before access is '
             || 'granted.'
 WHERE question = 'What email do I use to log in?';

UPDATE public.faq_articles
SET answer = 'Payments are recorded by Cashier staff. Open Billing & History to view your assessed balance, installment schedule and transaction history. Book a consultation for questions about your payment record.'
WHERE question = 'What payment methods are accepted?';

NOTIFY pgrst, 'reload schema';

COMMIT;
