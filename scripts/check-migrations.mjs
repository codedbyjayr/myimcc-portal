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
assert.deepEqual(actual, [...expected].sort(), 'Missing or pending production migrations');
const normalize = sql => sql.replace(/\r\n?/g, '\n').trim();
for (let index = 0; index < history.length; index++) {
  const sql = await readFile(new URL(expected[index], directory), 'utf8');
  assert.equal(normalize(sql), normalize(history[index].statements.join('\n')), `Recorded SQL differs: ${expected[index]}`);
}
const testDirectory = new URL('../supabase/test-environment/migrations/', import.meta.url);
assert.equal((await readdir(testDirectory)).filter(name => name.endsWith('.sql')).length, 5, 'Keep all five test increments isolated');
assert((await readFile(new URL('../supabase/pending/20261015130111_pending_student_clearances.sql', import.meta.url), 'utf8'))
  .includes('REVOKE ALL ON FUNCTION public.initialize_student_clearances(uuid) FROM PUBLIC, anon, authenticated;'), 'Preserve unapplied clearance hardening');
console.log(`${history.length} production migrations match the recorded versions and SQL; no pending production migrations. Test and pending SQL remain isolated.`);
