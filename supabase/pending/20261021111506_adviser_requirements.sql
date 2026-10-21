-- Pending promotion. Run the rollback-only adviser_requirements.sql test first.
BEGIN;
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
      SELECT e.student_id,p.full_name AS student_name,coalesce(p.student_no,p.id_number) AS student_no,o.school_year,o.semester,sum(o.units) AS units,l.locked_at
      FROM public.enrollments e JOIN public.profiles p ON p.id=e.student_id JOIN public.course_offerings o ON o.id=e.offering_id
      LEFT JOIN public.enrollment_locks l ON l.student_id=e.student_id AND l.school_year=o.school_year AND l.semester=o.semester
      WHERE e.status='enrolled' GROUP BY e.student_id,p.full_name,p.student_no,p.id_number,o.school_year,o.semester,l.locked_at
    ) g),'[]'::jsonb),
    'terms',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.school_year DESC,t.semester) FROM (SELECT school_year,semester,bool_or(enrollment_open) AS is_open FROM public.course_offerings GROUP BY school_year,semester) t),'[]'::jsonb)
  );
END;
$$;
CREATE FUNCTION public.get_enrollment_workspace() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT private.get_enrollment_workspace(); $$;
REVOKE ALL ON FUNCTION private.get_enrollment_workspace(),public.get_enrollment_workspace() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.get_enrollment_workspace(),public.get_enrollment_workspace() TO authenticated;
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


COMMIT;
