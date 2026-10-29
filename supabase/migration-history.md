# Migration history

## Recovery on 2026-10-26

The 34 migrations recorded at that recovery point were compared with local SQL
using normalized-content checksums. Missing review-schema, manual-Equivalent,
and academic-live-update records were recovered without executing them.
The equivalent local `20261022090000_academic_live_updates.sql` was moved to
`pending/20261022090000_academic_live_updates_duplicate.sql`; production records
that change under `20261022043635`.

The five unapplied feature scripts were consolidated into
`20261027131814_backend_semester_release.sql` in dependency order. This is the only
academic release after the 34 recovered production records. The isolated runner executes this
exact file; adviser, permission, enrollment, grade and FAQ regressions run afterward.
Do not replay the recovered temporary-review migration against an already-provisioned project.

## Backend deployments through 2026-10-29

Production now records 37 migrations, including the independent
`20261027120911_grade_revert_mfa_guard.sql` and the academic release
`20261027131814_backend_semester_release.sql`. The academic filename was aligned
with the timestamp returned by Supabase after direct deployment; its recorded SQL
matches the local file. `20261029063928_prevent_repeat_term_enrollment.sql` was
also applied afterward. The original 34 migration contents are unchanged.

With a fresh history export, `node scripts/check-migrations.mjs <history.json>
--allow-pending` verifies recorded SQL while listing unapplied local migrations.
Without that flag the check still rejects any extra local migration.

## Earlier recovery

`supabase/migrations/` contains the 27 migrations recorded by the production
project `dusiokpfmkhutptomrqg` when its history was recovered on 2026-10-21.
The SQL and version timestamps come from `supabase_migrations.schema_migrations`.
Restoring these files does not run them again or change production history.

The original local files used different timestamps for four recorded changes.
Three had identical SQL and now use the recorded production version. The local
`20261015130111_pending_student_clearances.sql` also contained extra function ACL
hardening, so its full contents are preserved under `supabase/pending/`. The
recorded production version is `20261015130622_pending_student_clearances.sql`.
The pending hardening is not promoted by this repair; review and test it before
creating a new migration with `supabase migration new`.

Five test-only increments live under `supabase/test-environment/migrations/`.
They were combined in `20261015164009_production_role_workflows.sql`; running the
increments again against production would duplicate existing tables and policies.
Historical source comments in the recovered production SQL retain their original
paths. See `test-environment/README.md` for the current test paths.

## Verification

Export `version`, `name`, and `statements` as a JSON array from this read-only query
on the intended production project:

```sql
SELECT version, name, statements
FROM supabase_migrations.schema_migrations
ORDER BY version;
```

Then run:

```text
node scripts/check-migrations.mjs <production-history.json>
```

The check requires the same versions, filenames, and SQL (ignoring Windows line
endings and surrounding whitespace), with no extra production migrations. A local
recovery snapshot is in `.temp/migration-recovery/production-history.json`; it is
ignored by Git. Use a fresh export when checking later changes.

When CLI credentials are available, also run `supabase migration list --linked`
and `supabase db push --linked --dry-run`. The dry run must show no migrations to
apply for this repair. New feature migrations will legitimately change that result.
Do not mark history as reverted or reset production to clear this check.

This reconciles the GitHub integration with the existing database. A clean-database
replay is a separate check: older recorded migrations may depend on objects that
were originally created before migration tracking was introduced.
