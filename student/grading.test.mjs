import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadDashboardView } from '../scripts/dashboard-markup.mjs';
import '../shared/grading.js';
const { GradeTerms, StudentGradeRows, GradeInsight } = await loadDashboardView(new URL('./dashboard-view.tsx', import.meta.url));
const { StudentSummary } = await loadDashboardView(new URL('./summary-view.tsx', import.meta.url));
const source = readFileSync(new URL('./dashboard.js',import.meta.url),'utf8');
const texts = {}, elements = { gradesBody:{},aiInsightText:{},gradeYearFilter:{value:''} };
const grades = [
 { code:'BEST',title:'Best subject',year:1,school_year:'2026',semester:'1st',grade_scale:'school',final:1,equivalent:1,units:3,remark:'Passed' },
 { code:'HEAVY',title:'Heavy subject',year:2,school_year:'2026',semester:'1st',grade_scale:'school',final:3,equivalent:3,units:6,remark:'Passed' },
 { code:'IMPROVE',title:'<img src=x> Needs improvement',school_year:'2026',semester:'1st',grade_scale:'school',prelim:2.5,midterm:3,final:null,units:3 },
 { code:'STRONG',title:'Strong subject',school_year:'2026',semester:'1st',grade_scale:'school',prelim:1,final:null,units:3 },
 { code:'OTHER',school_year:'2025',semester:'1st',grade_scale:'school',final:5,equivalent:5,units:50 },
];
const window = {
  renderStudentGradeTerms: props => renderToStaticMarkup(createElement(GradeTerms, props)),
  renderStudentGradeRows: props => renderToStaticMarkup(createElement(StudentGradeRows, props)),
  renderStudentGradeInsight: props => renderToStaticMarkup(createElement(GradeInsight, props)),
  renderStudentSummary: props => renderToStaticMarkup(createElement(StudentSummary, props)),
};
const context=vm.createContext({ window,state:{grades,studentProfile:{}},Grading:globalThis.Grading,getEl:id=>elements[id],setText:(id,value)=>texts[id]=value });
vm.runInContext("let _gradesSelectedTerm='2026|1st';" + source.slice(source.indexOf('function gradesForSelectedTerm()'),source.indexOf('async function loadGrades()')) + source.slice(source.indexOf('function predictedGwa('),source.indexOf('// ── Degree Prospectus Modal')),context);
vm.runInContext('renderSelectedGrades()',context);
assert.equal(texts['grade-gwa'],'2.33');
assert.equal(texts['grade-highest'],'1.00');
assert.equal(texts['grade-highest-course'],'BEST — Final');
assert.equal(texts['grade-ai'],'2.15');
assert(elements.aiInsightText.innerHTML.includes('Focus on IMPROVE'));
assert(elements.aiInsightText.innerHTML.includes('&lt;img src=x&gt;'));
assert(elements.gradesBody.innerHTML.includes('&lt;img src=x&gt;'));
assert(!elements.gradesBody.innerHTML.includes('OTHER'));
assert(elements.gradesBody.innerHTML.includes('Excellent'));
assert(elements.gradesBody.innerHTML.includes('Passing (minimum)'));
elements.gradeYearFilter.value='2';
vm.runInContext('renderSelectedGrades()',context);
assert.equal(texts['grade-gwa'],'3.00');
assert(!elements.gradesBody.innerHTML.includes('BEST'));
assert(elements.gradesBody.innerHTML.includes('HEAVY'));
elements.gradeYearFilter.value='';
elements.dashboardSummary = {};
context.state.dashboard = {
  student: { schoolYear: '2026', semester: '1st' }, unitsEnrolled: 9, subjectsEnrolled: 3,
  balance: 0, clearance: { cleared: 1, total: 1 },
};
Object.assign(context, { getTimeGreeting: () => 'Hello', renderStudentAvatar() {}, peso: String });
const homeStart = source.indexOf('function renderDashboard()');
const homeEnd = source.indexOf('// ── Announcements, Deadlines', homeStart);
vm.runInContext(source.slice(homeStart, homeEnd) + "_gradesSelectedTerm='2025|1st'; renderDashboard();", context);
assert.match(elements.dashboardSummary.innerHTML, /id="stat-gwa">2\.33<\/div>/, 'Home GWA uses current-term grades, independent of the grade-page filter');
vm.runInContext("_gradesSelectedTerm='2026|1st';",context);
grades.push({code:'LEGACY',school_year:'2026',semester:'1st',grade_scale:'percentage',prelim:98,final:98,equivalent:1.25,units:3,remark:'Passed'});
vm.runInContext('renderSelectedGrades()',context);
assert.equal(texts['grade-ai'],'2.15', 'Legacy records do not affect estimates');
assert(!elements.gradesBody.innerHTML.includes('>98<'));
assert(elements.gradesBody.innerHTML.includes('Legacy · under review'));
assert(elements.gradesBody.innerHTML.includes('1.25'));
elements.gradeTermSelect = {};
context.state.grades = grades.filter(g => g.school_year === '2025');
vm.runInContext('buildGradesTermDropdown();', context);
assert(elements.gradeTermSelect.innerHTML.includes('value="2025|1st"'));
assert.equal(elements.gradeTermSelect.value, '2025|1st', 'A removed term must fall back to an available term');
console.log('Student grades: direct display, legacy preservation, weighted term summaries, weakest subject and term fallback passed');
