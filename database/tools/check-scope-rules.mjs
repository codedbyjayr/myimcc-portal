// Scratch check for the help assistant's scope rules.
// Confirms the refusals fire on personal-record questions and, just as
// importantly, do NOT fire on ordinary how-to questions -- a rule that is too
// broad turns away questions the portal could answer.
//
// Run: node database/tools/check-scope-rules.mjs
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../../supabase/functions/faq-assistant/index.ts', import.meta.url), 'utf8');

// Parsed from the function source rather than duplicated, so this test cannot
// pass while the shipped rules say something else.
const block = SRC.match(/const OUT_OF_SCOPE_RULES[\s\S]*?\n\];/);
if (!block) {
  console.error('could not find OUT_OF_SCOPE_RULES in index.ts');
  process.exit(1);
}

const navigation = SRC.match(/const NAVIGATION = new RegExp\(\s*\n?\s*'([\s\S]*?)',\s*\n?\s*'i'\s*\n?\)/);
if (!navigation) {
  console.error('could not find NAVIGATION in index.ts');
  process.exit(1);
}
const NAV = new RegExp(
  navigation[1].split("' + '").map(s => s.replace(/\\\\/g, '\\').replace(/\\'/g, "'")).join(''),
  'i'
);

const rules = [...block[0].matchAll(
  /name:\s*'([^']+)'\s*,\s*re:\s*(\/(?:\\.|[^\\/])+\/[a-z]*)\s*(?:,\s*exemptNavigation:\s*true)?/g
)].map(m => ({
  name: m[1],
  re: new RegExp(m[2].slice(1, m[2].lastIndexOf('/')), m[2].slice(m[2].lastIndexOf('/') + 1)),
  exemptNavigation: /exemptNavigation:\s*true/.test(m[0]),
}));

console.log(`parsed ${rules.length} rules and the navigation pattern from index.ts`);

const match = q => {
  const isNav = NAV.test(q);
  for (const rule of rules) {
    if (!rule.re.test(q)) continue;
    if (rule.exemptNavigation && isNav) continue;
    return rule.name;
  }
  return null;
};

// Must be answerable from a published article. Each of these is a real
// navigation question, and refusing one is a bug: the student is sent to a
// person for something the portal could have told them in a sentence.
const ALLOWED = [
  'How do I enroll in a subject?',
  'How do I check my grades?',
  'How do I get my online clearance?',
  'How do I view my class schedule?',
  'How do I see my balance and payment history?',
  'How do I get my Certificate of Registration?',
  'What do I do if my enrollment is not showing?',
  'How do I reset my password?',
  'How do I get a medical certificate?',
  'How do I check my clearance status?',
  'Where can I see my grades?',
  'How do I apply for a leave of absence?'
];

// Must be refused and routed to a person. Where more than one rule could
// legitimately fire, any of them is accepted: what is being asserted is the
// refusal, not which rule happened to come first in the table.
const REFUSED = [
  ['my grade is wrong', ['own_record_value']],
  ['my grades', ['own_record_value']],
  ['what is my gpa', ['own_record_value', 'own_account']],
  ['how much is my outstanding balance', ['own_account', 'own_record_value']],
  ['I have a medical certificate and my diagnosis', ['medical_record']],
  ['my prescription is wrong', ['medical_record']],
  ['how do I apply for a scholarship', ['disciplinary']],
  ['I want to appeal my grade', ['disciplinary', 'own_record_value']],
  ['can I cancel my enrolled subject', ['enrolment_change']],
  ['I need this urgently', ['urgent']],
  ['this is an emergency', ['urgent']],
  ['how do I file a complaint', ['complaint']],
  ['what are my final grades', ['own_record_value']],
  ['I want to drop my subject', ['enrolment_change']]
];

let passed = 0;
const failures = [];

for (const q of ALLOWED) {
  const got = match(q);
  if (got === null) { passed++; }
  else { failures.push(`SHOULD BE ANSWERABLE but was refused as "${got}": ${q}`); }
}

for (const [q, acceptable] of REFUSED) {
  const got = match(q);
  if (got !== null && acceptable.includes(got)) { passed++; }
  else if (got === null) {
    failures.push(`SHOULD REFUSE (as one of ${acceptable.join('/')}) but was allowed: ${q}`);
  } else {
    failures.push(`SHOULD REFUSE as one of ${acceptable.join('/')} but got "${got}": ${q}`);
  }
}

console.log(`scope rules: ${passed} passed, ${failures.length} failed`);
for (const f of failures) console.error('  FAIL ' + f);
if (failures.length) process.exit(1);
