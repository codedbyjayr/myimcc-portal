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
assert.equal(Grading.computeRemark({ prelim: 80, midterm: 80, semifinal: 80, final: 80 }), 'Passed');
assert.equal(Grading.computeRemark({ prelim: 60, midterm: 60, semifinal: 60, final: 60 }), 'Failed');

assert.equal(Grading.previewEquivalent({ prelim: null }), '—');
assert.equal(Grading.previewEquivalent({ prelim: 96, midterm: 96, semifinal: 96, final: 96 }), '1.00');

console.log('grading.js: all tests passed');
