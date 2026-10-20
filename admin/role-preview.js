// The frame has an opaque origin, no auth scripts and no network/API access.
export function buildPreview(source, pageUrl, role) {
  const doc = new DOMParser().parseFromString(source, 'text/html');
  doc.querySelectorAll('script,base,meta[http-equiv],iframe,object,embed,link[rel="preload"],link[rel="modulepreload"]')
    .forEach(el => el.remove());
  doc.querySelectorAll('*').forEach(el => {
    for (const attr of [...el.attributes]) {
      if (/^on/i.test(attr.name) || ['srcdoc', 'formaction', 'action', 'target'].includes(attr.name)) el.removeAttribute(attr.name);
    }
  });
  const base = doc.createElement('base');
  base.href = pageUrl;
  doc.head.prepend(base);
  const csp = doc.createElement('meta');
  csp.httpEquiv = 'Content-Security-Policy';
  csp.content = `default-src 'none'; script-src ${location.origin}/admin/role-preview-navigation.js; connect-src 'none'; form-action 'none'; object-src 'none'; frame-src 'none'; style-src ${location.origin} https://fonts.googleapis.com 'unsafe-inline'; font-src ${location.origin} https://fonts.gstatic.com; img-src ${location.origin} data:; base-uri ${location.origin}`;
  doc.head.prepend(csp);
  doc.querySelectorAll('a').forEach(el => { el.removeAttribute('href'); el.setAttribute('aria-disabled', 'true'); });
  doc.querySelectorAll('input,select,textarea,button').forEach(el => {
    if (!el.matches('[data-page],[data-view],#menuToggle,#sidebarCloseBtn')) {
      el.disabled = true;
      el.title = 'Unavailable in read-only layout preview';
    }
  });
  doc.querySelectorAll('.imcc-skel').forEach(el => { el.className = ''; el.textContent = 'Preview'; });
  doc.querySelectorAll('tbody').forEach(el => {
    const cell = doc.createElement('td');
    cell.colSpan = Math.max(1, el.closest('table')?.querySelectorAll('thead th').length || 1);
    cell.textContent = 'Layout preview — sign in with your assigned role to test records.';
    const row = doc.createElement('tr'); row.append(cell); el.replaceChildren(row);
  });
  const notice = doc.createElement('div');
  notice.textContent = `Viewing as ${role} — READ ONLY · No personal records`;
  notice.setAttribute('role', 'status');
  notice.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:2147483647;background:#fde68a;color:#172033;padding:10px;text-align:center;font:700 14px system-ui;pointer-events:none';
  doc.body.append(notice);
  const script = doc.createElement('script');
  script.src = location.origin + '/admin/role-preview-navigation.js';
  doc.body.append(script);
  return '<!doctype html>' + doc.documentElement.outerHTML;
}

if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', async () => {
  const select = document.getElementById('previewRole');
  const status = document.getElementById('previewStatus');
  const frame = document.getElementById('previewFrame');
  async function showPreview() {
    select.disabled = true;
    status.textContent = 'Loading layout…';
    try {
      const client = await getSupabaseClientAsync();
      const { data: { session }, error } = await client.auth.getSession();
      if (error || !session) throw new Error('Sign in with your developer account first.');
      const access = await fetch('/api/developer-preview', { headers: { Authorization: 'Bearer ' + session.access_token }, cache: 'no-store' });
      const result = await access.json();
      if (!access.ok) throw new Error(result.error || 'Preview access denied.');
      const path = result.dashboards[select.value];
      if (!path) throw new Error('Unknown dashboard role.');
      const response = await fetch(path, { cache: 'no-store' });
      if (!response.ok) throw new Error('Dashboard layout could not be loaded.');
      const label = select.selectedOptions[0].textContent;
      frame.srcdoc = buildPreview(await response.text(), new URL(path, location.origin).href, label);
      frame.title = label + ' dashboard layout preview';
      frame.hidden = false;
      status.textContent = 'Viewing as ' + label + ' — read only';
    } catch (error) {
      frame.hidden = true;
      frame.removeAttribute('srcdoc');
      status.textContent = error.message;
    } finally { select.disabled = false; }
  }
  select.addEventListener('change', showPreview);
  try {
    const client = await getSupabaseClientAsync();
    client.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT' || event === 'USER_UPDATED' || event === 'SIGNED_IN') {
        frame.hidden = true; frame.removeAttribute('srcdoc'); status.textContent = 'Session changed. Reload to check access.';
      }
    });
  } catch (error) { status.textContent = error.message; return; }
  await showPreview();
});
