-- =====================================================================
-- MyIMCC Portal — Grade History, Auditing & Revision Tracking
-- Automatically archives previous grades before updates and provides
-- full version history and reversion capability.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.grade_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    grade_id UUID REFERENCES public.grades(id) ON DELETE CASCADE,
    student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    offering_id INTEGER REFERENCES public.course_offerings(id) ON DELETE CASCADE,
    prelim NUMERIC,
    midterm NUMERIC,
    semifinal NUMERIC,
    final NUMERIC,
    equivalent NUMERIC,
    remark TEXT,
    changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    change_type TEXT DEFAULT 'update',
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_grade_history_offering ON public.grade_history(offering_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_grade_history_student ON public.grade_history(student_id, created_at DESC);

ALTER TABLE public.grade_history ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.grade_history TO authenticated;
GRANT SELECT ON public.grade_history TO anon;

DROP POLICY IF EXISTS "Faculty and admin view grade history" ON public.grade_history;
CREATE POLICY "Faculty and admin view grade history"
  ON public.grade_history FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role IN ('teacher', 'faculty', 'dean', 'admin')
    )
    OR student_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "Faculty and admin insert grade history" ON public.grade_history;
CREATE POLICY "Faculty and admin insert grade history"
  ON public.grade_history FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role IN ('teacher', 'faculty', 'dean', 'admin')
    )
  );

DROP POLICY IF EXISTS "Dean and admin delete grade history" ON public.grade_history;
CREATE POLICY "Dean and admin delete grade history"
  ON public.grade_history FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role IN ('dean', 'admin')
    )
  );

CREATE OR REPLACE FUNCTION public.archive_grade_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_user_id UUID;
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
      
      INSERT INTO public.grade_history (
        grade_id, student_id, offering_id,
        prelim, midterm, semifinal, final, equivalent, remark,
        changed_by, change_type, created_at
      ) VALUES (
        OLD.id, OLD.student_id, OLD.offering_id,
        OLD.prelim, OLD.midterm, OLD.semifinal, OLD.final, OLD.equivalent, OLD.remark,
        v_user_id, 'before_update', now()
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
      v_user_id, 'initial_entry', now()
    );
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_archive_grade_change ON public.grades;
CREATE TRIGGER trg_archive_grade_change
  AFTER INSERT OR UPDATE ON public.grades
  FOR EACH ROW
  EXECUTE FUNCTION public.archive_grade_change();

DROP VIEW IF EXISTS public.v_grade_history;
CREATE VIEW public.v_grade_history
WITH (security_invoker = true)
AS
SELECT 
  gh.id,
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
FROM public.grade_history gh
LEFT JOIN public.profiles st ON gh.student_id = st.id
LEFT JOIN public.course_offerings co ON gh.offering_id = co.id
LEFT JOIN public.profiles cb ON gh.changed_by = cb.id;

GRANT SELECT ON public.v_grade_history TO authenticated;
