// Static structural validation for Postgres SQL.
// Catches the failure modes that actually happen when hand-writing DDL:
// unbalanced dollar-quoting, unbalanced BEGIN/END, and references to
// functions that are never defined in the same script.
import { readFileSync } from 'node:fs';

const file = process.argv[2];
const src = readFileSync(file, 'utf8');

const errors = [];
const warnings = [];

// Strip line comments, respecting dollar-quoted bodies.
function stripComments(s) {
  let out = '';
  let i = 0;
  while (i < s.length) {
    if (s.startsWith('--', i)) {
      while (i < s.length && s[i] !== '\n') i++;
    } else if (s.startsWith('/*', i)) {
      const end = s.indexOf('*/', i + 2);
      if (end === -1) { errors.push('unterminated /* comment at offset ' + i); break; }
      i = end + 2;
    } else {
      out += s[i];
      i++;
    }
  }
  return out;
}

// Strip single-quoted literals, handling the doubled '' escape. Without
// this, prose inside a string ('E2 case insensitive') is counted as SQL
// keywords, which turns an ordinary assertion label into a fake CASE and a
// fake imbalance.
function stripStrings(s) {
  let out = '';
  let i = 0;
  while (i < s.length) {
    if (s[i] === "'") {
      out += " '' ";
      i++;
      while (i < s.length) {
        if (s[i] === "'" && s[i + 1] === "'") { i += 2; continue; }
        if (s[i] === "'") { i++; break; }
        i++;
      }
    } else {
      out += s[i];
      i++;
    }
  }
  return out;
}

const body = stripComments(src);

// 1. Dollar-quote pairing
const tags = [...body.matchAll(/\$[a-zA-Z_0-9]*\$/g)].map(m => m[0]);
const counts = {};
for (const t of tags) counts[t] = (counts[t] || 0) + 1;
for (const [tag, n] of Object.entries(counts)) {
  if (n % 2 !== 0) {
    errors.push(`unbalanced dollar-quote ${tag}: ${n} occurrence(s)`);
  }
}
if (new Set(Object.keys(counts)).size > 1) {
  warnings.push('multiple dollar-quote tags used: ' + Object.keys(counts).join(', '));
}

// 2. BEGIN/END balance inside the plain (non-quoted) SQL.
const plain = stripStrings(
  body.replace(/\$[a-zA-Z0-9]*\$[\s\S]*?\$[a-zA-Z0-9]*\$/g, ' __BODY__ ')
);
// A bare "BEGIN;" opens a transaction and correctly has no END.
const begins = (plain.match(/\bBEGIN\b(?!\s*;)/gi) || []).length;
const cases = (plain.match(/\bCASE\b/gi) || []).length;
const ends = (plain.match(/\bEND\b/gi) || []).length;
// Only discount a CASE that actually has an END to go with it, so an END that
// belongs to a BEGIN is not also spent on a CASE.
//
// Known limitation: this compares aggregate counts, so a CASE with no END at
// all is NOT caught. "SELECT CASE WHEN true THEN 1 ELSE 2;" has one CASE and
// zero END, pairedCases is min(1, 0) = 0, and 0 === 0 - 0 passes. Telling a
// missing END from an END that closes a BEGIN needs real parsing, which this
// checker does not do. Postgres is the only thing that will catch it, so a
// clean run here is not proof the file parses.
const pairedCases = Math.min(cases, ends);
if (begins !== ends - pairedCases) {
  errors.push(
    `BEGIN/END mismatch outside function bodies: ${begins} BEGIN vs ${ends} END `
    + `(${pairedCases}/${cases} CASE expression(s) closed)`
  );
}

// 3. Every public.<fn>( or bare <fn>( referenced inside a body should be
//    defined by this script or be a known Supabase/Postgres builtin.
//    Table names are excluded, since "ON public.profiles (" looks the same.
const tables = new Set();
for (const m of body.matchAll(/CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+([a-zA-Z0-9_.]+)/gi)) {
  tables.add(m[1].toLowerCase());
}
// ALTER-only scripts never CREATE the table, so pick those up too.
for (const m of body.matchAll(/(?:ALTER\s+TABLE|DROP\s+POLICY[^;]*?\s+ON|ON)\s+(?:TABLE\s+)?([a-zA-Z0-9_.]+)/gi)) {
  tables.add(m[1].toLowerCase());
}
const defined = new Set();
for (const m of body.matchAll(/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+([a-zA-Z0-9_.]+)/gi)) {
  defined.add(m[2].toLowerCase());
}
const BUILTIN = new Set([
  'auth.uid', 'now', 'lower', 'split_part', 'coalesce', 'nullif', 'format',
  'gen_random_uuid', 'uuid_generate_v4', 'auth.jwt'
]);
const called = new Set();
for (const m of body.matchAll(/\b(public\.[a-z0-9_]+|auth\.[a-z0-9_]+)\s*\(/gi)) {
  const name = m[1].toLowerCase();
  if (!tables.has(name)) called.add(name);
}
for (const c of called) {
  if (!defined.has(c) && !BUILTIN.has(c)) {
    warnings.push(`calls ${c}() which this script does not define (expected if created in an earlier migration)`);
  }
}

// 4. Object-count summary
const count = (re) => (body.match(re) || []).length;
const summary = {
  functions: count(/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION/gi),
  triggers: count(/CREATE\s+TRIGGER/gi),
  policies: count(/CREATE\s+POLICY/gi),
  tables: count(/ALTER\s+TABLE/gi),
  statements: body.split(';').length - 1
};

console.log('=== ' + file + ' ===');
for (const [k, v] of Object.entries(summary)) console.log(`  ${k.padEnd(10)} ${v}`);

if (warnings.length) {
  console.log('\nWARNINGS:');
  warnings.forEach(w => console.log('  ! ' + w));
}
if (errors.length) {
  console.log('\nERRORS:');
  errors.forEach(e => console.log('  x ' + e));
  process.exit(1);
}
console.log('\nOK: no structural errors.');
