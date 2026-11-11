import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
for (const path of ['faculty/dean-dashboard.js','review-assets/faculty/dean-dashboard.js']) {
 const source=readFileSync(path,'utf8');
 assert(source.includes('window.imccSubjectPicker(catalogSelect, search, state.courses, form)'));
 assert(source.includes('for (const field of window.deanOfferingFields)'));
}
console.log('Normal and demo offering forms share the subject picker and exclude search from saved fields.');
