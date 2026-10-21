import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const testUrl = 'https://ycziiezfrwnzouilutum.supabase.co';
const testKey = 'sb_publishable_6jZgR6pnFr79Ig7gF4xwNg_MiiHRmhC';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2' };
const directories = new Set(['auth', 'student', 'faculty', 'staff', 'admin', 'onboarding', 'shared']);
const config = `window.__ENV__ = ${JSON.stringify({ SUPABASE_URL: testUrl, SUPABASE_ANON_KEY: testKey })};`;
const login = `<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>MyIMCC test login</title>
<style>body{font:16px system-ui;background:#f8fafc;color:#172033;max-width:440px;margin:8vh auto;padding:24px}
label,input,select,button{display:block;box-sizing:border-box;width:100%;margin:12px 0}input,select,button{padding:12px;font:inherit}
button{background:#b51f6b;color:white;border:0;border-radius:8px}#message{color:#a31515}</style>
<h1>MyIMCC test portal</h1><p>Use your individual approved test account. Changes affect the separate test database, not official school records.</p>
<form id="login"><label for="email">Test account email</label>
<input id="email" type="email" list="demoAccounts" autocomplete="username" required>
<datalist id="demoAccounts"><option value="student.demo@imcc.edu.ph"><option value="teacher.demo@imcc.edu.ph"><option value="dean.demo@imcc.edu.ph"></datalist>
<label for="password">Password</label><input id="password" type="password" autocomplete="current-password" required>
<button id="submit">Sign in to test portal</button><p id="message" role="alert"></p></form>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="/env-config.js"></script><script src="/shared/supabase-config.js"></script><script src="/shared/identity.js"></script>
<script>
document.getElementById('login').addEventListener('submit', async event => {
  event.preventDefault();
  const button = document.getElementById('submit');
  const message = document.getElementById('message');
  button.disabled = true; message.textContent = '';
  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: document.getElementById('email').value, password: document.getElementById('password').value
    });
    if (error) throw error;
    const { data: profile, error: profileError } = await supabaseClient.from('profiles').select('*').eq('id',data.user.id).single();
    if (profileError) throw profileError;
    if (profile.status !== 'approved' || profile.is_active !== true) throw new Error('Test account is not approved and active.');
    location.assign(IMCC.dashboardForRole(profile.role));
  } catch (error) { message.textContent = error.message; button.disabled = false; }
});
</script></html>`;

function permitted(file) {
  const path = relative(root, file);
  const parts = path.split(sep);
  return !parts.some(part => part.startsWith('.')) && types[extname(file)]
    && (directories.has(parts[0]) || path === 'logo.png');
}

export const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || '')) {
    res.writeHead(403).end(); return;
  }
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let body;
    let type = 'text/html';
    if (['/', '/index.html', '/test-login', '/auth/login.html'].includes(pathname)) {
      body = login;
    } else if (pathname === '/env-config.js') {
      body = config; type = 'text/javascript';
    } else {
      const file = resolve(root, '.' + pathname);
      if (!permitted(file) || !permitted(await realpath(file))) { res.writeHead(404).end(); return; }
      type = types[extname(file)];
      body = await readFile(file);
      if (pathname === '/shared/supabase-config.js') {
        body = body.toString().replace("storageKey: 'myimcc-auth-token'", "storageKey: 'myimcc-test-auth-token'");
        body = 'if (window.__ENV__?.SUPABASE_URL !== ' + JSON.stringify(testUrl) + ') throw new Error("Test configuration missing; login stopped.");\n' + body;
      }
      if (type === 'text/html') {
        body = body.toString().replace(/<body([^>]*)>/i, '$&<div style="position:fixed;top:0;right:0;z-index:2147483647;background:#fde68a;color:#111;padding:5px 12px;font:700 12px system-ui;pointer-events:none">TEST PORTAL · FICTIONAL DATA</div>');
      }
    }
    res.setHeader('Content-Type', type + (type.startsWith('text/') ? '; charset=utf-8' : ''));
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (error) {
    res.writeHead(error instanceof URIError ? 400 : 404).end();
  }
});

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(3080, '127.0.0.1', () => console.log('Test portal: http://localhost:3080 — test database only'));
}
