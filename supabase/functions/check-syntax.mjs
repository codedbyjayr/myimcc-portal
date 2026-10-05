// Minimal structural check for the Edge Functions.
//
// The real type check is `deno check`, but Deno is not installed everywhere
// this repo is worked on, and hand-editing a 450-line function is exactly how
// a duplicate `const supabaseKey` slipped in and made the function unable to
// parse. So this catches that class of error without a Deno toolchain.
//
// It is not a type checker. It cannot tell you a type is wrong. It only
// verifies that, after comments and string literals are removed, brackets
// balance and no binding name is declared twice in the same file.
//
// Usage: node supabase/functions/check-syntax.mjs

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Replace every comment and string literal with a single space.
 *
 * Strings and comments are removed in one pass on purpose. Doing it in two
 * passes breaks on real code: stripping `//` first eats the `//` inside a URL
 * like 'https://esm.sh/...', which swallows the rest of the line including
 * the closing quote, and every bracket after that point reads as unbalanced.
 * That produces a checker that condemns correct files, which is worse than no
 * checker because it trains you to ignore it.
 */
function blank(s) {
  let out = '';
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    const n = s[i + 1];

    if (c === '/' && n === '*') {
      const end = s.indexOf('*/', i + 2);
      i = end === -1 ? s.length : end + 2;
      out += ' ';
      continue;
    }
    if (c === '/' && n === '/') {
      while (i < s.length && s[i] !== '\n') i++;
      out += ' ';
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      i++;
      let closed = false;
      while (i < s.length) {
        if (s[i] === '\\') { i += 2; continue; }
        if (s[i] === quote) {
          // '' inside a single-quoted literal is an escaped quote, not a close.
          if (quote === "'" && s[i + 1] === "'") { i += 2; continue; }
          i++;
          closed = true;
          break;
        }
        i++;
      }
      // An unterminated literal is itself worth reporting, so leave a
      // delimiter behind rather than silently swallowing the rest of the file.
      out += closed ? ' ' : quote;
      continue;
    }

    out += c;
    i++;
  }
  return out;
}

function brackets(clean) {
  const openFor = { '}': '{', ')': '(', ']': '[' };
  const stack = [];
  for (const ch of clean) {
    if (ch === '{' || ch === '(' || ch === '[') stack.push(ch);
    else if (openFor[ch]) {
      const expected = stack.pop();
      if (expected !== openFor[ch]) {
        return `closing ${ch} but the innermost open bracket is ${expected ?? 'nothing'}`;
      }
    }
  }
  return stack.length ? `${stack.length} bracket(s) never closed` : null;
}

/**
 * Find a binding declared twice in the same block.
 *
 * Scope matters, and getting this wrong makes the checker useless. These are
 * all legal and must not be reported:
 *
 *   const vector = ...        // inside embed()
 *   const vector = ...        // inside the request handler
 *
 *   const answer = ...        // inside an if-block that returns
 *   const answer = ...        // later in the enclosing function
 *
 * So each declaration is keyed by name *and* the chain of enclosing blocks,
 * which distinguishes siblings from a genuine collision. Only `const` and
 * `let` are considered: `var x; var x;` and duplicate `function` declarations
 * are both legal, and including them would trade false positives for missed
 * bugs. The bug worth catching is a duplicated `const` in one function body,
 * which is a hard SyntaxError.
 */
function redeclared(clean) {
  const stack = [];
  let nextBlock = 1;
  const seen = new Map();
  const dupes = new Set();

  for (const token of clean.matchAll(/[{}]|\b(?:const|let)\s+([A-Za-z_$][\w$]*)/g)) {
    if (token[0] === '{') {
      stack.push(nextBlock++);
    } else if (token[0] === '}') {
      stack.pop();
    } else {
      const name = token[1];
      const key = `${stack.join('/')}|${name}`;
      if (seen.has(key)) dupes.add(name);
      else seen.set(key, true);
    }
  }
  return dupes.size ? [...dupes].join(', ') : null;
}

let failed = 0;

for (const entry of readdirSync(here, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const file = join(here, entry.name, 'index.ts');
  if (!existsSync(file)) continue;

  const problems = [];
  const clean = blank(readFileSync(file, 'utf8'));

  const b = brackets(clean);
  if (b) problems.push(b);
  const d = redeclared(clean);
  if (d) problems.push(`declared more than once: ${d}`);

  if (problems.length) {
    failed++;
    console.log(`FAIL ${entry.name}`);
    for (const p of problems) console.log(`     ${p}`);
  } else {
    console.log(`ok   ${entry.name}`);
  }
}

if (failed) {
  console.log(`\n${failed} function(s) would not parse.`);
  process.exit(1);
}
console.log('\nAll functions parse (structure only; run `deno check` for types).');
