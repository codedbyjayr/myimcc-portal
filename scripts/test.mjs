import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
for (const directory of ['api','auth','faculty','shared','staff','student','scripts']) {
  for (const file of readdirSync(directory).filter(file => file.endsWith('.test.mjs') && !file.includes('browser'))) {
    const result = spawnSync(process.execPath, [`${directory}/${file}`], { stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status || 1);
  }
}
