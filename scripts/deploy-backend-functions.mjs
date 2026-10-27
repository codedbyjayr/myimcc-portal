import {spawnSync} from 'node:child_process';
import {loadEnvFile} from 'node:process';
import {pathToFileURL} from 'node:url';
import {checkRelease} from './check-release.mjs';

export async function deployBackendFunctions(env = process.env, run = spawnSync, request = fetch) {
  const projectRef = new URL(env.SUPABASE_URL || 'https://invalid').hostname.match(/^([a-z0-9]{20})\.supabase\.co$/)?.[1];
  if (!projectRef) throw new Error('Set SUPABASE_URL to the intended hosted Supabase project.');
  await checkRelease(env, request);
  for (const name of ['faq-assistant', 'faq-reindex']) {
    // Both handlers validate their own caller; the indexer accepts only the service credential.
    const result = run('supabase', ['functions', 'deploy', name, '--project-ref', projectRef, '--no-verify-jwt'], {env,stdio:'inherit',windowsHide:true});
    if (result.error || result.status !== 0) throw new Error(`Deployment failed for ${name}; later functions were not deployed.`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    for (const file of ['.env', 'config/.env']) {
      try { loadEnvFile(file); break; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    await deployBackendFunctions();
    console.log('FAQ functions deployed after database compatibility verification. Hosted acceptance checks are still required.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
