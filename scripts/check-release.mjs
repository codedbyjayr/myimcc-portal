import { pathToFileURL } from 'node:url';

export async function checkRelease(env = process.env, request = fetch) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) throw new Error('Release blocked: configure SUPABASE_URL and SUPABASE_ANON_KEY for the target database.');
  const response = await request(new URL('/rest/v1/rpc/portal_release_ready', env.SUPABASE_URL), {
    headers: { apikey: env.SUPABASE_ANON_KEY },
    signal: AbortSignal.timeout(15000), redirect: 'error',
  });
  if (!response.ok || await response.json() !== 'semester-v3') throw new Error('Release blocked: apply and verify the academic-term, adviser, backend access-control and semester-total migrations on this target before deploying the frontend.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await checkRelease(); console.log('Target database supports the adviser frontend.'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
