import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { backupDatabase } from './backup-supabase.js';

const env = { SUPABASE_DB_URL: 'postgresql://backup:se%40cret@localhost:5544/fictional?sslmode=require' };
const parent = resolve('.temp');
const { mkdirSync } = await import('node:fs');
mkdirSync(parent, { recursive: true });
assert.throws(() => backupDatabase({}), /SUPABASE_DB_URL/);
assert.throws(() => backupDatabase({ SUPABASE_DB_URL: 'not a URL secret' }), /^Error: SUPABASE_DB_URL must be a valid/);
assert.throws(() => backupDatabase({ SUPABASE_DB_URL: env.SUPABASE_DB_URL + '&unsupported=true' }), /Unsupported/);
for (const scenario of ['success', 'dump-failed', 'missing-client', 'invalid-archive']) {
  const directory = mkdtempSync(resolve(parent, 'backup-check-'));
  const calls = [];
  const run = (command, args, options) => {
    calls.push(command);
    assert(!args.join(' ').includes('secret'));
    assert.equal(options.env.PGDATABASE, 'fictional');
    assert.equal(options.env.PGHOST, 'localhost');
    assert.equal(options.env.PGPORT, '5544');
    assert.equal(options.env.PGUSER, 'backup');
    assert.equal(options.env.PGPASSWORD, 'se@cret');
    assert.equal(options.env.PGSSLMODE, 'require');
    if (command === 'pg_dump') {
      assert(args.includes('--format=custom'));
      assert(!args.includes('--data-only'));
      writeFileSync(args.at(-1), 'fictional archive');
      return scenario === 'missing-client' ? { error: new Error('secret must not leak') } : { status: scenario === 'dump-failed' ? 1 : 0 };
    }
    assert.deepEqual(args.slice(0, 1), ['--list']);
    return { status: scenario === 'invalid-archive' ? 1 : 0 };
  };
  if (scenario === 'success') assert(existsSync(backupDatabase(env, directory, run)));
  else assert.throws(() => backupDatabase(env, directory, run), /failed/);
  const summary = JSON.parse(readFileSync(resolve(directory, readdirSync(directory).find(f => f.endsWith('.json')))));
  assert.equal(summary.status, scenario === 'success' ? 'archive-validated' : 'failed');
  assert.equal(summary.errors.length, scenario === 'success' ? 0 : 1);
  assert(!JSON.stringify(summary).includes('secret'));
  assert.equal(readdirSync(directory).some(f => f.endsWith('.dump')), scenario === 'success');
  assert.equal(calls.length, ['dump-failed', 'missing-client'].includes(scenario) ? 1 : 2);
}
console.log('Backup: failed exports, unavailable clients, archive checks, publication and credential redaction passed.');
