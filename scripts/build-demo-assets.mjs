import { readdir, readFile, mkdir, writeFile, copyFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';

// Keep the adviser review release separate from the current school screens.
for (const directory of ['student','faculty','staff','admin','shared']) {
  for (const file of await readdir(directory,{recursive:true})) {
    if (!/\.(html|js|css|svg)$/.test(file)) continue;
    const target=join('review-assets',directory,file);
    await mkdir(dirname(target),{recursive:true});
    const content=directory==='shared' && file==='supabase-config.js'
      ? "throw new Error('Open the demo workspace from the Admin role picker.');\n"
      : await readFile(join(directory,file));
    await writeFile(target,content);
  }
}
await copyFile('logo.png','review-assets/logo.png');
console.log('Demo-only assets prepared; normal role pages are unchanged.');
