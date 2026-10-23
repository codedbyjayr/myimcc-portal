-- Preserve stored grades and history; only future school-grade writes use manual Equivalent.
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
