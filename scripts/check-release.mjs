import { pathToFileURL } from 'node:url';

export async function checkRelease(env = process.env, request = fetch, { frontend = true } = {}) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) throw new Error('Release blocked: configure SUPABASE_URL and SUPABASE_ANON_KEY for the target database.');
  const rpc = frontend ? 'portal_frontend_release_ready' : 'portal_release_ready';
  const expected = frontend ? 'registrar-summer-v1' : 'semester-v3';
  const url = new URL(`/rest/v1/rpc/${rpc}`, env.SUPABASE_URL);
  const response = await request(url, {
    headers: { apikey: env.SUPABASE_ANON_KEY },
    signal: AbortSignal.timeout(15000), redirect: 'error',
  });
  if (!response.ok) {
    throw new Error(`Release blocked: ${url.hostname} returned HTTP ${response.status} for ${rpc}. Check the target project, API key, and RPC availability.`);
  }
  if (await response.json() !== expected) {
    const migrations = frontend ? 'the academic backend, Registrar Summer publishing, and frontend readiness migrations' : 'the academic backend migrations';
    throw new Error(`Release blocked: ${rpc} on ${url.hostname} did not return ${expected}. Apply and verify ${migrations} on that database.`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await checkRelease(); console.log('Target database supports the frontend release, including Registrar Summer publishing.'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
