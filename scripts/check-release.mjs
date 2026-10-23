import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Pending adviser contracts belong only to the isolated review asset tree.
const pending = /\b(list_student_records|get_student_record|get_enrollment_workspace|finalize_enrollment|lock_class_grades|set_enrollment_term|admin_set_profile_access|grades_locked|enrollment_locks|instructor_notifications)\b/;
export async function checkRelease(root = fileURLToPath(new URL('../', import.meta.url))) {
  async function visit(directory, review = false) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) { await visit(path, review); continue; }
      if (!/\.(js|html)$/.test(entry.name)) continue;
      const source = await readFile(path, 'utf8');
      const name = relative(root, path);
      if (!review && pending.test(source)) throw new Error(`Release blocked: ${name} uses a review-only database contract: ${source.match(pending)[0]}`);
      if (!review || !entry.name.endsWith('.html')) continue;
      for (const match of source.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)=["']([^"']+)["'][^>]*>/g)) {
        const url = new URL(match[1], 'https://assets.invalid/' + name.replaceAll('\\', '/'));
        if (url.origin !== 'https://assets.invalid') continue;
        // The Admin broker removes env-config and replaces the blocked Supabase bootstrap.
        if (url.pathname === '/review-assets/env-config.js') continue;
        if (!url.pathname.startsWith('/review-assets/')) throw new Error(`Release blocked: ${name} loads a production asset: ${url.pathname}`);
        if (!(await stat(resolve(root, '.' + url.pathname))).isFile()) throw new Error(`Release blocked: missing ${url.pathname}`);
      }
    }
  }
  for (const directory of ['admin', 'faculty', 'staff', 'student', 'shared']) await visit(resolve(root, directory));
  await visit(resolve(root, 'review-assets'), true);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await checkRelease(); console.log('Release boundary: production contracts and isolated review assets passed.'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
