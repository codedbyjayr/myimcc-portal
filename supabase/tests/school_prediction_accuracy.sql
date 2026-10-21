-- Read-only. No accuracy is claimed when there are no prospective result pairs.
WITH pairs AS (
 SELECT g.id,g.final,h.ai_predicted_equivalent AS prediction
 FROM public.grades g
 JOIN LATERAL (
   SELECT h.* FROM public.grade_history h
   WHERE h.grade_id=g.id AND h.grade_scale='school' AND h.final IS NULL
     AND h.prediction_method='equal-period-mean-v1'
     AND h.ai_predicted_equivalent IS NOT NULL AND h.predicted_at < g.graded_at
     AND NOT EXISTS (
       SELECT 1 FROM public.grade_history prior
       WHERE prior.grade_id=g.id AND prior.final IS NOT NULL AND prior.created_at <= h.predicted_at
     )
   ORDER BY h.predicted_at DESC LIMIT 1
 ) h ON true
 WHERE g.grade_scale='school' AND g.final IS NOT NULL AND g.final<>4 AND g.remark<>'Dropped'
)
SELECT count(*) AS evaluated_pairs,
 round(avg(abs(prediction-final)),2) AS mean_absolute_grade_error,
 round(100.0*count(*) FILTER(WHERE abs(prediction-final)<=0.25)/nullif(count(*),0),2) AS within_quarter_grade_percent
FROM pairs;
