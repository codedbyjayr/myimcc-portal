import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert';

// Simulate minimal browser window/document environment
const window = {
  addEventListener: () => {},
  removeEventListener: () => {}
};
const document = {
  readyState: 'complete',
  addEventListener: () => {},
  createElement: () => ({
    classList: { add: () => {}, remove: () => {} },
    setAttribute: () => {},
    style: {}
  }),
  body: {
    insertBefore: () => {},
    firstChild: null
  },
  getElementById: () => null
};

// Evaluate shared/loading.js
const code = readFileSync(resolve('shared/loading.js'), 'utf-8');
const runInContext = new Function('window', 'document', 'setTimeout', 'Date', code);
runInContext(window, document, setTimeout, Date);

// Verify core API presence
assert(typeof window.imccHidePreloader === 'function', 'imccHidePreloader missing');
assert(typeof window.imccShowPreloader === 'function', 'imccShowPreloader missing');
assert(typeof window.imccSkeleton === 'function', 'imccSkeleton missing');
assert(typeof window.imccTableSkeleton === 'function', 'imccTableSkeleton missing');
assert(typeof window.imccWithSkeleton === 'function', 'imccWithSkeleton missing');

// Verify skeleton output structure
const cardHtml = window.imccSkeleton({ card: true, lines: 2 });
assert(cardHtml.includes('imcc-skel-card'), 'card skeleton missing class');
assert(cardHtml.includes('imcc-skel-line'), 'line skeleton missing class');

const tableHtml = window.imccTableSkeleton(4, 2);
assert(tableHtml.includes('imcc-skel-table-row'), 'table skeleton missing row class');
assert((tableHtml.match(/<tr/g) || []).length === 2, 'table skeleton incorrect row count');
assert((tableHtml.match(/<td/g) || []).length === 8, 'table skeleton incorrect td count');

console.log('Loading & skeleton assertions passed OK (7/7)');
