-- Only the supplied BSIT curriculum is mapped; future catalog rows need a program.
ALTER TABLE public.courses ADD COLUMN program text CHECK (program IS NULL OR btrim(program) <> '');
UPDATE public.courses SET program='BSIT' WHERE code IN (
 'CC 101','CC 102','GE-P','GE-C','GE-S','GE-E','SFD','PATH-FIT 1','NSTP 1',
 'CC 103','HCI','MS 101','GE-U','GE-R','GE-M','GE-A','PATH-FIT 2','NSTP 2',
 'CC 104','IT 101','PT 101','RIZAL','GS','TEM','PATH-FIT 3',
 'CC 105','PEbD','MS 102','NET 101','IPT 101','CS 101','SP 101','PATH-FIT 4',
 'IM 101','NET 102','SIA 101','PROF-E1','EDP 101','CS 102','PROF-E2',
 'CC 106','CAP 101','IAS 101','CS 108','PROF-E3','PROF-E4',
 'SA 101','IAS 102','CAP 102','SIA 102','PRAC 101'
);

CREATE FUNCTION private.publish_term_curriculum() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  -- Serialize publication with manual offering writes, so reopening cannot duplicate them.
  LOCK TABLE public.course_offerings IN SHARE ROW EXCLUSIVE MODE;
  INSERT INTO public.course_offerings(code,title,units,program,year,semester,school_year,prerequisites,enrollment_open)
    SELECT c.code,c.title,c.lec_units+c.lab_units,c.program,c.year_level,NEW.semester,NEW.school_year,c.prerequisites,true
    FROM public.courses c
    WHERE c.program IS NOT NULL
      AND c.semester=CASE NEW.semester WHEN '1st Semester' THEN 1 WHEN '2nd Semester' THEN 2 ELSE 3 END
      AND NOT EXISTS (
        SELECT 1 FROM public.course_offerings o
        WHERE o.school_year=NEW.school_year AND o.semester=NEW.semester
          AND upper(btrim(o.code))=upper(btrim(c.code))
          AND (o.program IS NULL OR upper(btrim(o.program))=upper(btrim(c.program)))
          AND (o.year IS NULL OR o.year=c.year_level)
      );
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.publish_term_curriculum() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER publish_term_curriculum AFTER INSERT OR UPDATE OF is_open ON public.enrollment_terms
 FOR EACH ROW WHEN (NEW.is_open) EXECUTE FUNCTION private.publish_term_curriculum();

-- Repair terms already opened without subjects, without resending opening notices.
UPDATE public.enrollment_terms SET is_open=is_open WHERE is_open;
