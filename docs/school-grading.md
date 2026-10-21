# School grade entry

Teachers and teaching deans enter the school grade directly (for example,
1.00, 1.10, 1.25, 2.75, 3.00, 4.00 or 5.00). A final grade is authoritative;
earlier periods do not replace it with an average. 4.00 means Conditional,
5.00 means Failed, and blank means Pending. The input list follows the supplied
school table. Grade estimates may fall between its discrete input values.

## Rollout

Production was promoted through the connected Supabase migration tool on
2026-10-21. The source is `supabase/migrations/20261021035015_production_school_grading.sql`.
The post-migration checksum confirmed all 11 original grade records were unchanged;
`calculate_equivalent(98)` returned 1.10. Apply the equivalent test source
`supabase/test-environment/migrations/20261021032724_school_grade_entry.sql`
to the isolated test project, then run `supabase/tests/school_grading.sql` there.
The SQL test rolls back all fixture rows. Do not seed or reset production.

The remote test migration is also pending: the available Management API token
was rejected (401), and the CLI connection required unavailable IPv6 connectivity.
The migration, old-record preservation, grade/history/reversion assertions, and
prediction evaluation query were executed in a disposable local PostgreSQL 16
database using the full schema snapshot. Snapshot-only PostgreSQL 17 MAINTAIN
grants were omitted for that local runner. The disposable container was removed.

Existing grades and historical records are marked `percentage` without changing
their values, equivalents, or remarks. They remain read-only in grade entry.
Students see the stored school equivalent and a legacy-review label, with no raw
percentage in the period cells. A school-authorized review must resolve the
overlapping percentage ranges before converting those records. The one confirmed
correction is 98% = 1.10; other historic mappings are retained pending review.

The frontend and migration must be promoted together. New saves explicitly use
`grade_scale: school`, so deploying the frontend before its migration will fail
to save rather than silently feed school grades to the old percentage trigger.
Review the legacy 1.50/Failed production record with the school; it is deliberately
not rewritten by this migration.

## Estimates and GWA

The approved starting estimate is the equal-weight mean of available prelim,
midterm, and semifinal school grades. It excludes Conditional, Dropped and legacy
records, and disappears when a final grade is recorded. It is not a trained AI
model. GWA uses subject units; records with missing units cannot produce a GWA.
Conditional and Dropped results are excluded. The estimate card combines final
school grades and available estimates for the selected term; it does not claim
Dean's List eligibility. Official school rules still need confirmation before
production promotion.

The database computes estimates and stores their method and timestamp.
Grade history preserves the pre-final estimate for later evaluation. Run
`supabase/tests/school_prediction_accuracy.sql` to get the number of usable pairs,
mean absolute error in grade units, and the percentage within 0.25 grade units.
It uses the last saved prediction before the result and excludes predictions
after an archived final result. Zero pairs returns no accuracy claim. This is
observational evaluation, not evidence that the estimate is a validated AI model.

## Checks and deployment settings

Run `npm test`, `npm run check:edge`, and `npm run check:edge:parse`.
`scripts/grading-workspace.browser.test.mjs` exercises teacher and dean entry
with mocked requests on desktop and mobile, including errors and validation.

Vercel must explicitly set SUPABASE_URL and SUPABASE_ANON_KEY. Missing settings
now stop startup. Static/Docker deployments must provide env-config.js.
The Docker publication job requires Node and Edge Function checks first.
No new dependencies are required.
