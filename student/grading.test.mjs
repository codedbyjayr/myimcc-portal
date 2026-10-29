import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import '../shared/grading.js';
const source = readFileSync(new URL('./dashboard.js',import.meta.url),'utf8');
const texts = {}, elements = { gradesBody:{},aiInsightText:{},gradeYearFilter:{value:''} };
const grades = [
 { code:'BEST',title:'Best subject',year:1,school_year:'2026',semester:'1st',grade_scale:'school',final:1,equivalent:1,units:3,remark:'Passed' },
 { code:'HEAVY',title:'Heavy subject',year:2,school_year:'2026',semester:'1st',grade_scale:'school',final:3,equivalent:3,units:6,remark:'Passed' },
 { code:'IMPROVE',title:'Needs improvement',school_year:'2026',semester:'1st',grade_scale:'school',prelim:2.5,midterm:3,final:null,units:3 },
 { code:'STRONG',title:'Strong subject',school_year:'2026',semester:'1st',grade_scale:'school',prelim:1,final:null,units:3 },
 { code:'OTHER',school_year:'2025',semester:'1st',grade_scale:'school',final:5,equivalent:5,units:50 },
];
const context=vm.createContext({ state:{grades,studentProfile:{}},Grading:globalThis.Grading,getEl:id=>elements[id],setText:(id,value)=>texts[id]=value,escapeHtml:s=>String(s) });
vm.runInContext("let _gradesSelectedTerm='2026|1st';" + source.slice(source.indexOf('function gradesForSelectedTerm()'),source.indexOf('function buildGradesTermDropdown()')) + source.slice(source.indexOf('function predictedGwa('),source.indexOf('// ── Degree Prospectus Modal')),context);
vm.runInContext('renderGradeStats();renderGrades();renderGradesHeader();',context);
assert.equal(texts['grade-gwa'],'2.33');
assert.equal(texts['grade-highest'],'1.00');
assert.equal(texts['grade-highest-course'],'BEST — Final');
assert.equal(texts['grade-ai'],'2.15');
assert(elements.aiInsightText.innerHTML.includes('Focus on IMPROVE'));
assert(!elements.gradesBody.innerHTML.includes('OTHER'));
assert(elements.gradesBody.innerHTML.includes('Excellent'));
assert(elements.gradesBody.innerHTML.includes('Passing (minimum)'));
elements.gradeYearFilter.value='2';
vm.runInContext('renderGradeStats();renderGrades()',context);
assert.equal(texts['grade-gwa'],'3.00');
assert(!elements.gradesBody.innerHTML.includes('BEST'));
assert(elements.gradesBody.innerHTML.includes('HEAVY'));
elements.gradeYearFilter.value='';
const homeStats=source.slice(source.indexOf('  const currentGrades ='),source.indexOf("  setText('stat-units'"));
vm.runInContext("var d={student:{schoolYear:'2026',semester:'1st'}};_gradesSelectedTerm='2025|1st';"+homeStats,context);
assert.equal(texts['stat-gwa'],'2.33','Home GWA uses current-term grades, independent of the grade-page filter');
vm.runInContext("_gradesSelectedTerm='2026|1st';",context);
grades.push({code:'LEGACY',school_year:'2026',semester:'1st',grade_scale:'percentage',prelim:98,final:98,equivalent:1.25,units:3,remark:'Passed'});
vm.runInContext('renderGradeStats();renderGrades()',context);
assert.equal(texts['grade-ai'],'2.15', 'Legacy records do not affect estimates');
assert(!elements.gradesBody.innerHTML.includes('>98<'));
assert(elements.gradesBody.innerHTML.includes('Legacy · under review'));
assert(elements.gradesBody.innerHTML.includes('1.25'));
elements.gradeTermSelect = {};
context.state.grades = grades.filter(g => g.school_year === '2025');
vm.runInContext(source.slice(source.indexOf('function buildGradesTermDropdown()'), source.indexOf('async function loadGrades()')) + 'buildGradesTermDropdown();', context);
assert(elements.gradeTermSelect.innerHTML.includes('value="2025|1st" selected'), 'A removed term must fall back to an available term');
console.log('Student grades: direct display, legacy preservation, weighted term summaries, weakest subject and term fallback passed');
