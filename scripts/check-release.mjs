import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

export async function checkRelease(env = process.env, request = fetch, root = fileURLToPath(new URL('../', import.meta.url))) {
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) { await visit(path); continue; }
      if (!entry.name.endsWith('.html')) continue;
      const source = await readFile(path, 'utf8');
      const name = relative(root, path);
      for (const match of source.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)=[\"']([^\"']+)[\"'][^>]*>/g)) {
        const url = new URL(match[1], 'https://assets.invalid/' + name.replaceAll('\\', '/'));
        if (url.origin !== 'https://assets.invalid') continue;
        if (url.pathname === '/review-assets/env-config.js') continue;
        if (!url.pathname.startsWith('/review-assets/')) throw new Error(`Release blocked: ${name} loads a production asset: ${url.pathname}`);
        if (!(await stat(resolve(root, '.' + url.pathname))).isFile()) throw new Error(`Release blocked: missing ${url.pathname}`);
      }
    }
  }

  if (env.VERCEL || env.SUPABASE_URL || env.SUPABASE_ANON_KEY) {
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) throw new Error('Release blocked: configure the target Supabase URL and anon key.');
    const response = await request(new URL('/rest/v1/rpc/portal_release_ready', env.SUPABASE_URL), {
      headers: { apikey: env.SUPABASE_ANON_KEY }, signal: AbortSignal.timeout(15000), redirect: 'error',
    });
    if (!response.ok || await response.json() !== 'semester-v3') throw new Error('Release blocked: target backend must support semester-v3.');
  }

  await visit(resolve(root, 'review-assets'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await checkRelease(); console.log('Release boundary: production contract and isolated review assets passed.'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
