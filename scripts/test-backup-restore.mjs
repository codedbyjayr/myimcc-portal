import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { backupDatabase } from './backup-supabase.js';

// Synthetic records only; this never connects to a hosted database.
const bin = resolve(process.env.PG_BIN || '.temp/full-audit/tools/node_modules/@embedded-postgres/windows-x64/native/bin');
const suffix = process.platform==='win32' ? '.exe' : '';
const directory = mkdtempSync(resolve('.temp/restore-rehearsal-'));
const data = resolve(directory,'data');
const probe = createServer();
await new Promise(done => probe.listen(0,'127.0.0.1',done));
const port = probe.address().port;
await new Promise(done => probe.close(done));
const run = (name,args) => execFileSync(resolve(bin,name+suffix),args,{windowsHide:true,timeout:60000,stdio:'ignore'});
const env = { ...process.env, PGHOST:'127.0.0.1',PGPORT:String(port),PGUSER:'postgres',PGDATABASE:'source',PGCONNECT_TIMEOUT:'5' };
const sql = (database,query) => execFileSync(resolve(bin,'psql'+suffix),['--no-psqlrc','--set','ON_ERROR_STOP=1','--tuples-only','--no-align','--command',query],{env:{...env,PGDATABASE:database},windowsHide:true,timeout:30000,encoding:'utf8',stdio:'pipe'}).trim();
let started = false;
try {
  run('initdb',['-D',data,'-U','postgres','--auth=trust','--encoding=UTF8','--locale=C']);
  run('pg_ctl',['-D',data,'-l',resolve(directory,'server.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start']);
  started = true;
  sql('postgres','CREATE DATABASE source');
  sql('postgres','CREATE DATABASE restored');
  sql('source',`CREATE ROLE archive_reader;
    CREATE TABLE records(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,owner_name text,payload jsonb,amount numeric(12,2),labels text[]);
    INSERT INTO records(owner_name,payload,amount,labels) VALUES('O''Brien','{"nested":[1,true,null]}',1234.56,ARRAY['one','comma,value']);
    ALTER TABLE records ENABLE ROW LEVEL SECURITY;
    CREATE POLICY own_records ON records TO archive_reader USING(owner_name=current_user);
    GRANT SELECT ON records TO archive_reader;`);
  const expected = sql('source','SELECT jsonb_agg(to_jsonb(r) ORDER BY id)::text FROM records r');
  const archive = backupDatabase({...process.env,SUPABASE_DB_URL:`postgresql://postgres@127.0.0.1:${port}/source`,PG_DUMP:resolve(bin,'pg_dump'+suffix),PG_RESTORE:resolve(bin,'pg_restore'+suffix)},directory);
  execFileSync(resolve(bin,'pg_restore'+suffix),['--exit-on-error','--single-transaction','--no-owner','--dbname','restored',archive],{env:{...env,PGDATABASE:'restored'},windowsHide:true,timeout:60000,stdio:'pipe'});
  assert.equal(sql('restored','SELECT jsonb_agg(to_jsonb(r) ORDER BY id)::text FROM records r'),expected);
  assert.equal(sql('restored',"SELECT relrowsecurity FROM pg_class WHERE oid='records'::regclass"),'t');
  assert.equal(sql('restored',"SELECT count(*) FROM pg_policies WHERE tablename='records' AND policyname='own_records'"),'1');
  assert.equal(sql('restored','SET ROLE archive_reader; SELECT count(*) FROM records').split(/\r?\n/).at(-1),'0');
  assert.equal(sql('restored',"INSERT INTO records(owner_name) VALUES('After restore') RETURNING id").split(/\r?\n/)[0],'2');
  assert(readFileSync(archive).subarray(0,5).equals(Buffer.from('PGDMP')));
  console.log('Synthetic PostgreSQL archive restored: typed values, sequence, RLS, policy, and role isolation passed.');
  console.log('Local rehearsal files: '+directory);
} finally {
  if(started) run('pg_ctl',['-D',data,'-m','fast','-w','stop']);
}
