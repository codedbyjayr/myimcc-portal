// shared/grading.test.mjs
import assert from 'node:assert/strict';
import './grading.js';

const Grading = globalThis.Grading;

// computeEquivalent
assert.equal(Grading.computeEquivalent(null), null);
assert.equal(Grading.computeEquivalent(NaN), null);
assert.equal(Grading.computeEquivalent(97), 1.00);
assert.equal(Grading.computeEquivalent(95), 1.25);
assert.equal(Grading.computeEquivalent(92), 1.50);
assert.equal(Grading.computeEquivalent(89), 1.75);
assert.equal(Grading.computeEquivalent(86), 2.00);
assert.equal(Grading.computeEquivalent(83), 2.25);
assert.equal(Grading.computeEquivalent(80), 2.50);
assert.equal(Grading.computeEquivalent(76), 2.75);
assert.equal(Grading.computeEquivalent(75), 3.00);
assert.equal(Grading.computeEquivalent(74), 5.00);

// periodAverage
assert.equal(Grading.periodAverage({ prelim: null, midterm: null, semifinal: null, final: null }), null);
assert.equal(Grading.periodAverage({ prelim: 90, midterm: 80, semifinal: null, final: null }), 85);
assert.equal(Grading.periodAverage({ prelim: 100, midterm: 90, semifinal: 80, final: 70 }), 85);

// computeRemark & previewEquivalent
assert.equal(Grading.computeRemark({ prelim: 80, midterm: 80, semifinal: 80, final: null }), 'Pending');
assert.equal(Grading.computeRemark({ prelim: 1.5, midterm: 1.5, semifinal: 1.5, final: 1 }), 'Passed');
assert.equal(Grading.computeRemark({ prelim: 60, midterm: 60, semifinal: 60, final: 60 }), 'Failed');

assert.equal(Grading.previewEquivalent({ prelim: null }), '—');
assert.equal(Grading.previewEquivalent({ prelim: 1.5, midterm: 1.5, semifinal: 1.5, final: 1 }), '1.00');
assert.equal(Grading.computeEquivalent(98), 1.10);
for (const grade of [1,1.1,1.2,1.25,1.3,1.4,1.5,1.6,1.7,1.75,1.8,1.9,2,2.1,2.2,2.25,2.3,2.4,2.5,2.6,2.7,2.75,2.8,2.9,3,4,5]) assert(Grading.isSchoolGrade(grade));
for (const grade of [null,undefined,'',NaN,Infinity,0,1.11,3.5,4.5,98]) assert(!Grading.isSchoolGrade(grade));
assert.equal(Grading.computeRemark({ final:4 }), 'Conditional');
assert.equal(Grading.computeRemark({ final:null,remark:'Dropped' }), 'Dropped');
assert.equal(Grading.computeRemark({ final:5 }), 'Failed');
assert.equal(Grading.formatGrade(1.1), '1.10');
assert.equal(Grading.estimate({ grade_scale:'school',prelim:1,midterm:2,semifinal:3 }), 2);
assert.equal(Grading.estimate({ grade_scale:'school',prelim:4,midterm:2 }), 2);
assert.equal(Grading.estimate({ grade_scale:'school',prelim:1,final:1.5 }), null);
assert.equal(Grading.estimate({ grade_scale:'percentage',prelim:98 }), null);
assert.equal(Grading.estimate({ grade_scale:'school',prelim:null }), null);
assert.equal(Grading.weightedGwa([{ final:3,equivalent:3,units:6 },{ final:1,equivalent:1,units:3 }]).toFixed(2),'2.33');
assert.equal(Grading.weightedGwa([{ final:4,equivalent:4,units:3 }]), null);
assert.equal(Grading.weightedGwa([{ final:1,equivalent:1,units:null }]), null);
assert.equal(Grading.previewEquivalent({ grade_scale:'percentage',final:98,equivalent:1.25 }), '1.25');

console.log('grading.js: all tests passed');
