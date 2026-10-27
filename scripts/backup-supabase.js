import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadEnvFile } from 'node:process';

// PostgreSQL preserves types, dependencies, sequences and a consistent snapshot.
export function backupDatabase(env = process.env, directory = resolve('database/backups'), run = spawnSync) {
  if (!env.SUPABASE_DB_URL) throw new Error('Set SUPABASE_DB_URL to the intended database connection URL. No backup was taken.');
  let url;
  try { url = new URL(env.SUPABASE_DB_URL); } catch { throw new Error('SUPABASE_DB_URL must be a valid PostgreSQL connection URL.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('SUPABASE_DB_URL must be a PostgreSQL connection URL.');
  mkdirSync(directory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const partial = resolve(directory, `${stamp}.dump.partial`);
  const archive = partial.replace(/\.partial$/, '');
  const summaryFile = resolve(directory, `${stamp}.summary.json`);
  const summary = { createdAt: new Date().toISOString(), status: 'failed', archive: null, errors: [] };
  // Keep credentials out of the command line and child error output.
  const childEnv = { ...env, PGHOST: url.hostname, PGPORT: url.port || '5432',
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)), PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password), PGCONNECT_TIMEOUT: env.PGCONNECT_TIMEOUT || '15' };
  const parameters = { sslmode: 'PGSSLMODE', sslrootcert: 'PGSSLROOTCERT', sslcert: 'PGSSLCERT', sslkey: 'PGSSLKEY',
    connect_timeout: 'PGCONNECT_TIMEOUT', application_name: 'PGAPPNAME', options: 'PGOPTIONS' };
  for (const [name, value] of url.searchParams) {
    if (!parameters[name]) throw new Error('Unsupported database connection parameter. Use a session-pooler PostgreSQL URL.');
    childEnv[parameters[name]] = value;
  }
  try {
    const dump = run(env.PG_DUMP || 'pg_dump', ['--format=custom', '--no-password', '--file', partial], { env: childEnv, stdio: 'pipe' });
    if (dump.error || dump.status !== 0) throw new Error('pg_dump failed. Check the PostgreSQL client installation, connection and database permissions.');
    const inspect = run(env.PG_RESTORE || 'pg_restore', ['--list', partial], { env: childEnv, stdio: 'pipe' });
    if (inspect.error || inspect.status !== 0) throw new Error('Archive validation failed. The partial file is not a verified backup.');
    renameSync(partial, archive);
    summary.status = 'archive-validated'; summary.archive = archive;
    return archive;
  } catch (error) {
    summary.errors.push(error.message);
    throw error;
  } finally {
    writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    for (const file of ['.env', 'config/.env']) {
      try { loadEnvFile(file); break; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    if (process.argv.length > 2) throw new Error('Project-name arguments are no longer supported. Select one database explicitly with SUPABASE_DB_URL.');
    console.log('Database archive created and readable: ' + backupDatabase());
    console.log('A restore rehearsal is still required. Storage files and external service settings are not included.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
