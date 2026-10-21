-- Read-only assertions. Safe on the deployed schema; no student records are changed.
BEGIN;
DO $test$
DECLARE
 expected numeric[] := ARRAY[3,2.9,2.8,2.75,2.7,2.6,2.5,2.4,2.5,2.3,2.2,2.1,2,1.9,1.8,1.75,1.7,1.6,1.5,1.4,1.5,1.3,1.2,1.1,1,1];
 p integer;
BEGIN
 FOR p IN 0..100 LOOP
   ASSERT public.calculate_equivalent(p) = CASE WHEN p<75 THEN 5 ELSE expected[p-74] END,
     format('Incorrect percentage conversion at %s',p);
 END LOOP;
 ASSERT public.calculate_equivalent(NULL) IS NULL;
 ASSERT public.calculate_equivalent(-1) IS NULL;
 ASSERT public.calculate_equivalent(101) IS NULL;
 ASSERT public.calculate_equivalent('NaN'::numeric) IS NULL;
 ASSERT public.calculate_equivalent(99.5)=1;
 ASSERT public.calculate_equivalent(96.5)=1.25;
 ASSERT public.calculate_equivalent(74.999)=5;
 ASSERT public.calculate_equivalent(98.5) IS NULL;
 ASSERT public.calculate_remark(97)='Excellent';
 ASSERT public.calculate_remark(94)='Outstanding';
 ASSERT public.calculate_remark(95)='Superior';
 ASSERT public.calculate_remark(91)='Very Good';
 ASSERT public.calculate_remark(88)='Good';
 ASSERT public.calculate_remark(85)='Satisfactory';
 ASSERT public.calculate_remark(83)='Fairly Satisfactory';
 ASSERT public.calculate_remark(79)='Fair';
 ASSERT public.calculate_remark(76)='Passing';
 ASSERT public.calculate_remark(75)='Passing (minimum)';
 ASSERT public.calculate_remark(74)='Failed';
 ASSERT (SELECT count(*)=27 FROM public.grading_scale);
 ASSERT (SELECT description='Conditional / INC' AND percentage_min IS NULL AND percentage_max IS NULL FROM public.grading_scale WHERE equivalent=4);
END;
$test$;
ROLLBACK;
