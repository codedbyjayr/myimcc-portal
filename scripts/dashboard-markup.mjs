import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { transformWithOxc } from 'vite';
import { renderToStaticMarkup } from 'react-dom/server';

// Render the same TSX view the browser entry uses, so markup checks follow the migration.
export async function dashboardMarkup(htmlUrl) {
  const viewUrl = new URL(htmlUrl.href.replace(/\.html$/, '-view.tsx').replace('/review-assets/', '/'));
  const view = await loadDashboardView(viewUrl);
  const html = readFileSync(htmlUrl, 'utf8');
  return html.replace('<div id="root" style="display:contents"></div>', renderToStaticMarkup(view.default()));
}

export async function loadDashboardView(viewUrl) {
  return import(await dashboardViewModule(viewUrl));
}

async function dashboardViewModule(viewUrl) {
  const source = readFileSync(viewUrl, 'utf8');
  const { code } = await transformWithOxc(source, viewUrl.pathname);
  const runtime = pathToFileURL(createRequire(import.meta.url).resolve('react/jsx-runtime')).href;
  let linked = code.replace('"react/jsx-runtime"', JSON.stringify(runtime));
  for (const [statement, path] of code.matchAll(/from "([.]{1,2}\/[^"]+)"/g)) {
    const dependency = await dashboardViewModule(new URL(path + '.tsx', viewUrl));
    linked = linked.replace(statement, 'from ' + JSON.stringify(dependency));
  }
  return 'data:text/javascript,' + encodeURIComponent(linked);
}
