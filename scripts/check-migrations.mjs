import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

// Pass a fresh read-only export of version, name and statements from schema_migrations.
assert(process.argv[2], 'Usage: node scripts/check-migrations.mjs <production-history.json>');
const history = JSON.parse(await readFile(process.argv[2], 'utf8'));
assert(Array.isArray(history) && history.length > 0, 'Migration history must be a nonempty array');
const expected = history.map(({ version, name, statements }) => {
  assert(/^\d{14}$/.test(version) && /^[a-z0-9_]+$/.test(name), 'Invalid migration identity');
  assert(Array.isArray(statements) && statements.length && statements.every(sql => typeof sql === 'string'), 'Missing recorded SQL');
  return `${version}_${name}.sql`;
});
assert.equal(new Set(history.map(row => row.version)).size, history.length, 'Duplicate migration versions');
const directory = new URL('../supabase/migrations/', import.meta.url);
const actual = (await readdir(directory)).filter(name => name.endsWith('.sql')).sort();
const pending = actual.filter(name => !expected.includes(name));
assert(expected.every(name => actual.includes(name)), 'Missing production migrations');
if (!process.argv.includes('--allow-pending')) assert.deepEqual(actual, [...expected].sort(), 'Missing or pending production migrations');
const normalize = sql => sql.replace(/\r\n?/g, '\n').trim();
for (let index = 0; index < history.length; index++) {
  const sql = await readFile(new URL(expected[index], directory), 'utf8');
  assert.equal(normalize(sql), normalize(history[index].statements.join('\n')), `Recorded SQL differs: ${expected[index]}`);
}
const testDirectory = new URL('../supabase/test-environment/migrations/', import.meta.url);
const testFiles = await readdir(testDirectory);
for (const name of ['20261015144016_enrollment_request_approval.sql','20261015150353_enrollment_review_student_groups.sql',
  '20261015152431_dean_self_teaching.sql','20261015154210_assignment_managers_and_rosters.sql','20261015155745_test_roster_course_access.sql']) {
  assert(testFiles.includes(name) && !actual.includes(name), `Keep the original test increment isolated: ${name}`);
}
assert((await readFile(new URL('../supabase/pending/20261015130111_pending_student_clearances.sql', import.meta.url), 'utf8'))
  .includes('REVOKE ALL ON FUNCTION public.initialize_student_clearances(uuid) FROM PUBLIC, anon, authenticated;'), 'Preserve unapplied clearance hardening');
console.log(`${history.length} production migrations match the recorded versions and SQL. Unapplied local migrations: ${pending.length ? pending.join(', ') : 'none'}. Test and pending SQL remain isolated.`);
