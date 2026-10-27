import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function checkRelease(root = fileURLToPath(new URL('../', import.meta.url)), env = process.env, request = fetch) {
  async function visit(directory, review = false) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) { await visit(path, review); continue; }
      if (!/\.(js|html)$/.test(entry.name)) continue;
      const source = await readFile(path, 'utf8');
      const name = relative(root, path);
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
  // Vercel must target the deployed academic backend; offline CI still checks asset isolation.
  if (env.VERCEL || env.SUPABASE_URL || env.SUPABASE_ANON_KEY) {
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) throw new Error('Release blocked: configure the target Supabase URL and anon key.');
    const response = await request(new URL('/rest/v1/rpc/portal_release_ready', env.SUPABASE_URL), {
      headers: { apikey: env.SUPABASE_ANON_KEY }, signal: AbortSignal.timeout(15000), redirect: 'error',
    });
    if (!response.ok || await response.json() !== 'semester-v3') throw new Error('Release blocked: target backend must support semester-v3.');
  }
  await visit(resolve(root, 'review-assets'), true);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await checkRelease(); console.log('Release boundary: production contracts and isolated review assets passed.'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
