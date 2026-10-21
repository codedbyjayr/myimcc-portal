BEGIN;
ALTER TABLE public.grading_scale ALTER COLUMN percentage_min DROP NOT NULL, ALTER COLUMN percentage_max DROP NOT NULL;
INSERT INTO public.grading_scale(equivalent,percentage_min,percentage_max,description,category,is_passing) VALUES
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

CREATE OR REPLACE FUNCTION public.calculate_equivalent(percentage numeric) RETURNS numeric
LANGUAGE plpgsql STABLE SET search_path='' AS $function$
BEGIN
 IF percentage IS NULL OR percentage<0 OR percentage>100 THEN RETURN NULL; END IF;
 IF percentage<75 THEN RETURN 5.00; END IF;
 RETURN (SELECT s.equivalent FROM public.grading_scale s
   WHERE percentage BETWEEN s.percentage_min AND s.percentage_max
   ORDER BY s.percentage_max-s.percentage_min,s.equivalent LIMIT 1);
END;
$function$;

CREATE OR REPLACE FUNCTION public.calculate_remark(percentage numeric) RETURNS text
LANGUAGE sql STABLE SET search_path='' AS $function$
 SELECT s.description FROM public.grading_scale s WHERE s.equivalent=public.calculate_equivalent(percentage);
$function$;
COMMIT;
