// admin/admin-dashboard.js
document.addEventListener('DOMContentLoaded', async () => {
    let supabaseClient;
    try {
        supabaseClient = await getSupabaseClientAsync();
    } catch (e) {
        console.error("Failed to init Supabase", e);
        return;
    }

    const adminEmailEl = document.getElementById('adminEmail');
    const pendingTableBody = document.getElementById('pendingTableBody');
    const approvedTableBody = document.getElementById('approvedTableBody');
    const pendingCountEl = document.getElementById('pendingCount');
    const noPendingMsg = document.getElementById('noPendingMsg');
    const noApprovedMsg = document.getElementById('noApprovedMsg');
    const logoutBtn = document.getElementById('logoutBtn');
    const searchInput = document.getElementById('searchInput');
    const courseFilter = document.getElementById('courseFilter');
    const clearFiltersBtn = document.getElementById('clearFiltersBtn');
    const previewControl = document.getElementById('developerPreviewControl');
    const previewRole = document.getElementById('previewRole');
    const temporaryRoleTest = document.getElementById('temporaryRoleTest');
    const previewPanel = document.getElementById('developerPreview');
    const previewFrame = document.getElementById('previewFrame');
    const previewStatus = document.getElementById('previewStatus');
    const workspace = document.getElementById('adminWorkspace');
    let previewChannel = null;
    let previewHome = null;
    let demoSession = null, demoTimer = null, demoGeneration = 0;
    if (window.imccTableSkeleton) {
        if (pendingTableBody) pendingTableBody.innerHTML = window.imccTableSkeleton(5, 2);
        if (approvedTableBody) approvedTableBody.innerHTML = window.imccTableSkeleton(5, 4);
    }

    let currentAdminId = null;

    // Full unfiltered datasets — filters are applied client-side against these.
    let allPendingUsers = [];
    let allApprovedUsers = [];

    // Role labels/synonyms so searching "faculty" also matches role "teacher", etc.
    const roleLabels = {
        student: 'Student',
        teacher: 'Faculty',
        faculty: 'Faculty',
        staff: 'Staff',
        registrar: 'Registrar',
        admin: 'Admin',
        dean: 'Dean',
    };

    // 1. Verify User is an Approved Admin
    async function checkAdminAuth() {
        const { data: { user }, error } = await supabaseClient.auth.getUser();

        if (error || !user) {
            window.location.href = '../auth/login.html';
            return;
        }

        currentAdminId = user.id;

        const { data: profile } = await supabaseClient
            .from('profiles')
            .select('role, status, is_active')
            .eq('id', user.id)
            .single();

        if (!profile || profile.role !== 'admin' || profile.status !== 'approved' || profile.is_active !== true) {
            alert("Unauthorized access. Admin privileges required.");
            await supabaseClient.auth.signOut();
            window.location.href = '../auth/login.html';
            return;
        }

        if (adminEmailEl) adminEmailEl.textContent = user.email;
        if (user.email?.toLowerCase() === 'jlm33405@imcc.edu.ph') {
            try {
                await previewRequest();
                previewControl.hidden = false;
                previewRole.disabled = false;
                try { temporaryRoleTest.hidden = !(await demoRequest()).available; } catch { temporaryRoleTest.hidden = true; }
            } catch { previewControl.hidden = true; }
        }
        return true;
    }

    async function previewRequest(resource, headers = {}) {
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        if (error || !session) throw new Error('Sign in with your developer account first.');
        const response = await fetch('/api/developer-preview' + (resource ? '?resource=' + encodeURIComponent(resource) : ''), {
            headers: { ...headers, Authorization: 'Bearer ' + session.access_token }, cache: 'no-store',
        });
        if (!resource && !response.ok) throw new Error((await response.json()).error || 'Developer view is unavailable.');
        return resource ? response : response.json();
    }

    function closePreview() {
        demoGeneration++;
        demoSession = null;
        clearTimeout(demoTimer);
        temporaryRoleTest.textContent = 'Try selected role (demo)';
        previewChannel = null;
        previewHome = null;
        previewFrame.hidden = true;
        previewFrame.removeAttribute('srcdoc');
        previewPanel.hidden = true;
        workspace.hidden = false;
        previewRole.value = 'admin';
    }

    async function demoRequest(payload) {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) throw new Error('Sign in with your developer account first.');
        const endpoint = window.__ENV__?.SUPABASE_URL ? window.__ENV__.SUPABASE_URL.replace(/\/+$/,'') + '/functions/v1/developer-demo' : '/api/developer-demo';
        const response = await fetch(endpoint, {
            method: payload ? 'POST' : 'GET', cache: 'no-store',
            headers: { Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json', apikey:window.__ENV__?.SUPABASE_ANON_KEY || '' },
            ...(payload ? {body:JSON.stringify(payload)} : {}),
        });
        if (payload?.action === 'request') return response;
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Demo review is unavailable.');
        return result;
    }

    async function startDemo() {
        const generation = ++demoGeneration;
        temporaryRoleTest.disabled = true;
        previewRole.disabled = true;
        try {
            const session = await demoRequest({action:'start',role:previewRole.value});
            if (generation !== demoGeneration) return;
            demoSession = session;
            temporaryRoleTest.textContent = 'Return to read-only';
            clearTimeout(demoTimer);
            demoTimer = setTimeout(() => { closePreview(); previewPanel.hidden=false; previewStatus.textContent='Demo review expired. Your admin workspace is restored.'; }, Math.max(0,demoSession.expiresAt-Date.now()));
            await showPreview();
        } catch(error) { closePreview(); previewPanel.hidden=false; previewStatus.textContent=error.message; }
        finally { temporaryRoleTest.disabled = false; previewRole.disabled = previewControl.hidden; }
    }

    // This runs inside the opaque frame. No admin token or parent storage is given to it.
    function startReadOnlyDashboard(channel, user, theme, demo) {
        window.IMCC_DEVELOPER_VIEW = !demo;
        const storage = new Map([['myimcc_theme', theme]]);
        Object.defineProperty(window, 'localStorage', { value: {
            getItem: key => storage.get(key) ?? null,
            setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key),
        } });
        const readOnlyFetch = async (input, options) => {
            const request = new Request(input, options);
            if (!demo && !['GET', 'HEAD'].includes(request.method)) {
                return new Response(JSON.stringify({ code: '25006', message: 'Developer view is read only.' }), { status: 405 });
            }
            const id = crypto.randomUUID();
            const body = !['GET','HEAD'].includes(request.method) ? JSON.parse(await request.text() || 'null') : null;
            return new Promise(resolve => {
                const timeout = setTimeout(() => finish({ status: 504, body: '{"message":"Developer view request timed out."}' }), 20000);
                function finish(result) {
                    clearTimeout(timeout);
                    window.removeEventListener('message', receive);
                    resolve(new Response(request.method === 'HEAD' ? null : result.body, { status: result.status, headers: result.headers }));
                }
                function receive(event) {
                    if (event.source === parent && event.data?.channel === channel && event.data.id === id) finish(event.data);
                }
                window.addEventListener('message', receive);
                const url = new URL(request.url);
                parent.postMessage({ channel, id, resource: url.pathname + url.search, method:request.method, body,
                    accept: request.headers.get('accept'), prefer: request.headers.get('prefer'), range: request.headers.get('range') }, '*');
            });
        };
        const client = supabase.createClient('https://developer-preview.invalid', 'read-only', {
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
            global: { fetch: readOnlyFetch },
        });
        client.auth.getUser = async () => ({ data: { user }, error: null });
        client.auth.getSession = async () => ({ data: { session: { user, access_token: 'read-only' } }, error: null });
        client.auth.onAuthStateChange = () => ({ data: { subscription: { unsubscribe() {} } } });
        client.channel = () => ({ on() { return this; }, subscribe() { return this; } });
        const rpc = client.rpc.bind(client);
        if (!demo) client.rpc = (name, args) => rpc(name, args, { get: true });
        window.supabaseClient = window.__myimcc_supabase_client__ = client;
        window.getSupabaseClientAsync = async () => client;
        document.addEventListener('click', event => {
            if (event.target.closest('a[href],#logoutBtn,#signOutBtn')) {
                event.preventDefault(); event.stopImmediatePropagation();
                const link = event.target.closest('a[href]');
                if (link) parent.postMessage({channel,navigate:new URL(link.href).pathname},'*');
                else if (demo) parent.postMessage({channel,exitDemo:true},'*');
            }
        }, true);
    }

    async function showPreview(navigate) {
        if (previewRole.value === 'admin' && !demoSession) { closePreview(); return; }
        const channel = previewChannel = crypto.randomUUID();
        previewRole.disabled = true;
        previewPanel.hidden = false;
        workspace.hidden = true;
        previewStatus.textContent = 'Loading dashboard…';
        try {
            const metadata = demoSession || await previewRequest();
            const user = metadata.user;
            previewHome = demoSession ? demoSession.path : metadata.dashboards[previewRole.value];
            let path = typeof navigate==='string' ? navigate : demoSession ? demoSession.path : metadata.dashboards[previewRole.value];
            if (demoSession) path = '/review-assets' + path;
            if (!path) throw new Error('Unknown dashboard role.');
            const response = await fetch(path, { cache: 'no-store' });
            if (!response.ok) throw new Error('Dashboard could not be loaded.');
            const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
            doc.querySelectorAll('base,meta[http-equiv]').forEach(el => el.remove());
            if (!demoSession) doc.querySelectorAll('#developerPreview,#developerPreviewControl,#temporaryRoleTest').forEach(el=>el.remove());
            doc.querySelectorAll('script[src]').forEach(el => {
                if (new URL(el.getAttribute('src'), new URL(path, location.origin)).pathname.endsWith('/env-config.js')) el.remove();
            });
            let theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            try { theme = localStorage.getItem('myimcc_theme') || theme; } catch {}
            doc.documentElement.dataset.theme = doc.body.dataset.theme = theme;
            const script = doc.createElement('script');
            script.textContent = `(${startReadOnlyDashboard.toString()})(${JSON.stringify(channel)},${JSON.stringify(user).replaceAll('<', '\\u003c')},${JSON.stringify(theme)},${!!demoSession});`.replace(/\r\n?/g, '\n');
            const config = doc.querySelector('script[src$="/shared/supabase-config.js"]');
            if (!config) throw new Error('Dashboard configuration was not found.');
            config.replaceWith(script);
            const base = doc.createElement('base');
            base.href = new URL(path, location.origin).href;
            doc.head.prepend(base);
            const hashes = await Promise.all([...doc.querySelectorAll('script:not([src])')].map(async el => {
                const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(el.textContent));
                return "'sha256-" + btoa(String.fromCharCode(...new Uint8Array(digest))) + "'";
            }));
            const sources = [...doc.querySelectorAll('script[src]')].map(el => new URL(el.getAttribute('src'), base.href).href);
            const csp = doc.createElement('meta');
            csp.httpEquiv = 'Content-Security-Policy';
            const imageOrigin = new URL(window.__ENV__?.SUPABASE_URL || location.origin).origin;
            csp.content = `default-src 'none'; script-src ${[...hashes, ...sources].join(' ')}; connect-src 'none'; form-action 'none'; object-src 'none'; frame-src 'none'; style-src ${location.origin} https://fonts.googleapis.com 'unsafe-inline'; font-src ${location.origin} https://fonts.gstatic.com; img-src ${location.origin} ${imageOrigin} https://lh3.googleusercontent.com data:; base-uri ${location.origin}`;
            doc.head.prepend(csp);
            if (previewChannel !== channel) return;
            previewFrame.srcdoc = '<!doctype html>' + doc.documentElement.outerHTML;
            previewFrame.title = previewRole.selectedOptions[0].textContent + ' dashboard';
            previewFrame.hidden = false;
            previewStatus.textContent = demoSession ? 'DEMO ONLY · ' + previewRole.selectedOptions[0].textContent + ' · ' + user.email : 'Viewing as ' + previewRole.selectedOptions[0].textContent + ' — read only';
            previewPanel.querySelector('.preview-note').textContent = demoSession ? 'Interactive fictional records only. Changes stay in the review area. Ends at ' + new Date(demoSession.expiresAt).toLocaleTimeString() + '.' : 'Read only · Uses your admin account\'s permitted data. No role changes or user impersonation.';
        } catch (error) {
            if (previewChannel !== channel) return;
            closePreview();
            previewPanel.hidden = false;
            previewStatus.textContent = error.message;
        } finally { previewRole.disabled = previewControl.hidden; }
    }

    window.addEventListener('message', async event => {
        const request = event.data;
        if (previewChannel && event.source === previewFrame.contentWindow && request?.channel === previewChannel) {
            if (demoSession && request.exitDemo) { closePreview(); return; }
            if (typeof request.navigate==='string') {
                request.navigate=request.navigate.replace(/^\/review-assets(?=\/)/,'');
                const role = demoSession?.role || previewRole.value;
                const allowed = [previewHome];
                if (!demoSession && request.navigate==='/admin/admin-dashboard.html') request.navigate=previewHome;
                if (['dean','admin','registrar','staff'].includes(role)) allowed.push('/staff/enrollment-requests.html');
                if (demoSession && role==='admin') allowed.push('/faculty/dean-dashboard.html','/faculty/teacher-dashboard.html','/staff/registrar-dashboard.html','/staff/staff-dashboard.html');
                if (allowed.includes(request.navigate)) await showPreview(request.navigate);
                return;
            }
        }
        if (!previewChannel || event.source !== previewFrame.contentWindow || request?.channel !== previewChannel
            || typeof request.id !== 'string' || typeof request.resource !== 'string') return;
        const channel = previewChannel;
        let result;
        try {
            const response = demoSession ? await demoRequest({action:'request',ticket:demoSession.ticket,
                resource:request.resource,method:request.method,body:request.body,accept:request.accept,prefer:request.prefer,range:request.range}) : await previewRequest(request.resource, {
                'X-Preview-Accept': request.accept || 'application/json',
                'X-Preview-Prefer': request.prefer || '', 'X-Preview-Range': request.range || '',
            });
            result = { status: response.status, body: await response.text(), headers: {
                'Content-Type': 'application/json', ...(response.headers.has('content-range') ? { 'Content-Range': response.headers.get('content-range') } : {}),
            } };
        } catch { result = { status: 503, body: '{"message":"Developer view is unavailable."}' }; }
        if (previewChannel === channel) previewFrame.contentWindow.postMessage({ ...result, channel, id: request.id }, '*');
    });
    previewRole.addEventListener('change', () => { if (demoSession) startDemo(); else showPreview(); });
    temporaryRoleTest.addEventListener('click', () => {
        if (demoSession) { const role=previewRole.value; closePreview(); previewRole.value=role; showPreview(); }
        else startDemo();
    });
    document.getElementById('exitPreview').addEventListener('click', closePreview);
    supabaseClient.auth.onAuthStateChange(event => {
        if (['SIGNED_OUT', 'USER_UPDATED', 'SIGNED_IN'].includes(event)) {
            closePreview(); previewControl.hidden = true; previewRole.disabled = true;
            temporaryRoleTest.hidden = true;
        }
    });

    // 2. Fetch Pending Requests
    async function loadPendingUsers() {
        const { data: users, error } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('status', 'pending')
            .order('created_at', { ascending: true });

        if (error) return;

        allPendingUsers = users || [];
        pendingCountEl.textContent = `${allPendingUsers.length} Pending`;

        populateCourseFilter();
        renderPendingTable(filterUsers(allPendingUsers, { roleField: 'requested_role' }));
    }

    // 3. Fetch Approved Users & Render Interactive Select Dropdowns
    async function loadApprovedUsers() {
        const { data: users, error } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('status', 'approved')
            .order('full_name', { ascending: true });

        if (error) return;

        allApprovedUsers = users || [];

        populateCourseFilter();
        renderApprovedTable(filterUsers(allApprovedUsers, { roleField: 'role' }));
    }

    // ── Render: Pending table (from a given, already-filtered, array) ──────
    function renderPendingTable(users) {
        pendingTableBody.innerHTML = '';

        if (users.length === 0) {
            noPendingMsg.style.display = 'block';
            noPendingMsg.textContent = allPendingUsers.length === 0
                ? 'No pending registration requests found.'
                : 'No pending requests match your search or filter.';
            attachPendingListeners();
            return;
        }
        noPendingMsg.style.display = 'none';

        const term = (searchInput?.value || '').trim();

        users.forEach(user => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
        <td><b>${highlight(user.full_name || 'N/A', term)}</b></td>
        <td>${highlight(user.email, term)}</td>
        <td><code>${highlight(user.student_no || 'N/A', term)}</code></td>
        <td>${highlight(user.program || '—', term)}</td>
        <td>
          <select class="role-select pending-role-select" data-id="${user.id}">
            <option value="student" ${(user.requested_role || 'student') === 'student' ? 'selected' : ''}>Student</option>
            <option value="teacher" ${user.requested_role === 'teacher' || user.requested_role === 'faculty' ? 'selected' : ''}>Faculty</option>
              <option value="staff" ${user.requested_role === 'staff' ? 'selected' : ''}>Staff</option>
              <option value="registrar" ${user.requested_role === 'registrar' ? 'selected' : ''}>Registrar</option>
              <option value="admin" ${user.requested_role === 'admin' ? 'selected' : ''}>Admin</option>
            <option value="dean" ${user.requested_role === 'dean' ? 'selected' : ''}>Dean</option>
          </select>
        </td>
        <td>
          <button class="btn-action btn-approve" data-id="${user.id}">Approve</button>
          <button class="btn-action btn-reject" data-id="${user.id}">Reject</button>
        </td>
      `;
            pendingTableBody.appendChild(tr);
        });

        attachPendingListeners();
    }

    // ── Render: Approved table (from a given, already-filtered, array) ─────
    function renderApprovedTable(users) {
        approvedTableBody.innerHTML = '';

        if (users.length === 0) {
            if (noApprovedMsg) noApprovedMsg.style.display = 'block';
            attachApprovedListeners();
            return;
        }
        if (noApprovedMsg) noApprovedMsg.style.display = 'none';

        const term = (searchInput?.value || '').trim();

        users.forEach(user => {
            const isSelf = user.id === currentAdminId;
            const currentRole = user.role || 'student';

            const tr = document.createElement('tr');
            tr.innerHTML = `
        <td><b>${highlight(user.full_name || 'N/A', term)}</b> ${isSelf ? '<small style="color:var(--primary);">(You)</small>' : ''}</td>
        <td>${highlight(user.email, term)}</td>
        <td><code>${highlight(user.student_no || 'N/A', term)}</code></td>
        <td>${highlight(user.program || '—', term)}</td>
        <td>
          <select class="role-select" data-id="${user.id}" ${isSelf ? 'disabled' : ''}>
            <option value="student" ${currentRole === 'student' ? 'selected' : ''}>Student</option>
            <option value="teacher" ${currentRole === 'teacher' || currentRole === 'faculty' ? 'selected' : ''}>Faculty</option>
              <option value="staff" ${currentRole === 'staff' ? 'selected' : ''}>Staff</option>
              <option value="registrar" ${currentRole === 'registrar' ? 'selected' : ''}>Registrar</option>
              <option value="admin" ${currentRole === 'admin' ? 'selected' : ''}>Admin</option>
            <option value="dean" ${currentRole === 'dean' ? 'selected' : ''}>Dean</option>
          </select>
        </td>
        <td><span class="badge badge-approved">Approved</span></td>
        <td>
          ${!isSelf ? `<button class="btn-action btn-revoke" data-id="${user.id}">Revoke Access</button>` : '<span style="color:var(--text-muted); font-size:12px;">Active Session</span>'}
        </td>
      `;
            approvedTableBody.appendChild(tr);
        });

        attachApprovedListeners();
    }

    // ── Filtering ────────────────────────────────────────────────────────
    // Dynamic search across name / email / ID number / role (with synonyms),
    // combined with the selected course filter. Runs entirely client-side
    // against the already-loaded dataset, so results update as you type.
    function filterUsers(users, { roleField }) {
        const term = (searchInput?.value || '').trim().toLowerCase();
        const course = courseFilter?.value || '';

        return users.filter(user => {
            if (course && (user.program || '') !== course) return false;
            if (!term) return true;

            const roleRaw = (user[roleField] || 'student').toLowerCase();
            const roleLabel = (roleLabels[roleRaw] || roleRaw).toLowerCase();

            const haystack = [
                user.full_name,
                user.email,
                user.student_no,
                user.program,
                roleRaw,
                roleLabel,
            ].filter(Boolean).join(' ').toLowerCase();

            return haystack.includes(term);
        });
    }

    function applyFilters() {
        const active = !!(searchInput?.value.trim() || courseFilter?.value);
        if (clearFiltersBtn) clearFiltersBtn.style.display = active ? 'inline-block' : 'none';

        renderPendingTable(filterUsers(allPendingUsers, { roleField: 'requested_role' }));
        renderApprovedTable(filterUsers(allApprovedUsers, { roleField: 'role' }));
    }

    // Populate "Filter by Course" with distinct programs found across both lists.
    function populateCourseFilter() {
        if (!courseFilter) return;
        const previous = courseFilter.value;

        const courses = new Set();
        [...allPendingUsers, ...allApprovedUsers].forEach(u => {
            if (u.program) courses.add(u.program);
        });

        const sorted = [...courses].sort((a, b) => a.localeCompare(b));
        courseFilter.innerHTML = '<option value="">All Courses</option>' +
            sorted.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');

        if (sorted.includes(previous)) courseFilter.value = previous;
    }

    function highlight(text, term) {
        const safe = escapeHtml(String(text ?? ''));
        if (!term) return safe;
        const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        try {
            return safe.replace(new RegExp(`(${escapedTerm})`, 'ig'), '<span class="highlight">$1</span>');
        } catch {
            return safe;
        }
    }

    // 4. Attach Listeners for Pending Approvals / Rejections
    //
    // These used to write { status, role } straight to the profiles table.
    // Phase 0a made those columns admin-managed and removed the
    // "Users update own profile" policy, so a direct UPDATE no longer
    // carries the authority check with it. Each action now goes through
    // the SECURITY DEFINER RPC, which re-verifies that the caller is an
    // active approved admin before it writes.
    async function callRpc(name, args) {
        const { error } = await supabaseClient.rpc(name, args);
        return error;
    }

    function attachPendingListeners() {
        pendingTableBody.querySelectorAll('.btn-approve').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const userId = e.target.getAttribute('data-id');
                const roleSelect = pendingTableBody.querySelector(`.pending-role-select[data-id="${userId}"]`);
                const targetRole = roleSelect ? roleSelect.value : 'student';

                btn.disabled = true;
                const error = await callRpc('set_user_approval', {
                    target_id: userId,
                    approved: true,
                    approved_role: targetRole,
                });

                if (error) {
                    alert('Failed to approve user: ' + error.message);
                } else {
                    loadPendingUsers();
                    loadApprovedUsers();
                }
                btn.disabled = false;
            });
        });

        pendingTableBody.querySelectorAll('.btn-reject').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                if (!confirm('Reject this registration request?')) return;
                const userId = e.target.getAttribute('data-id');

                btn.disabled = true;
                const error = await callRpc('set_user_approval', {
                    target_id: userId,
                    approved: false,
                });

                if (error) {
                    alert('Failed to reject user: ' + error.message);
                } else {
                    loadPendingUsers();
                }
                btn.disabled = false;
            });
        });
    }

    // 5. Attach Listeners for Dynamic Role Updates and Access Revocation
    function attachApprovedListeners() {
        // Live Role Changing Dropdown Listener — scoped to approvedTableBody only
        approvedTableBody.querySelectorAll('.role-select[data-id]').forEach(select => {
            select.addEventListener('change', async (e) => {
                const userId = e.target.getAttribute('data-id');
                const newRole = e.target.value;

                const error = await callRpc('set_user_role', {
                    target_id: userId,
                    new_role: newRole,
                });

                if (error) {
                    alert('Failed to update role: ' + error.message);
                    loadApprovedUsers(); // Revert back on error
                } else {
                    // Subtle highlight to confirm save
                    e.target.style.borderColor = 'var(--success)';
                    setTimeout(() => { e.target.style.borderColor = 'var(--surface-border)'; }, 1500);
                    // Update local cache so re-renders keep the new value
                    const cached = allApprovedUsers.find(u => u.id === userId);
                    if (cached) cached.role = newRole;
                }
            });
        });

        // Revoke Access Listener — scoped to approvedTableBody only
        //
        // This previously wrote { status: 'pending', role: 'student' }, which
        // did two wrong things at once: it silently demoted the person to a
        // student, and it dropped them back into the approval queue as if
        // they had just registered. Revoking access should lock the account
        // and preserve the role it had, so set_user_active() is the correct
        // call; a deliberate demotion is a separate, explicit action.
        approvedTableBody.querySelectorAll('.btn-revoke').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                if (!confirm('Revoke access for this user? Their portal access will be suspended. They keep their role and can be reactivated without re-approval.')) return;
                const userId = e.target.getAttribute('data-id');

                btn.disabled = true;
                const error = await callRpc('set_user_active', {
                    target_id: userId,
                    active: false,
                });

                if (error) {
                    alert('Failed to revoke access: ' + error.message);
                } else {
                    loadApprovedUsers();
                }
                btn.disabled = false;
            });
        });
    }

    function escapeHtml(str) {
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await supabaseClient.auth.signOut();
            window.location.href = '../auth/login.html';
        });
    }

    if (searchInput) searchInput.addEventListener('input', applyFilters);
    if (courseFilter) courseFilter.addEventListener('change', applyFilters);
    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', () => {
            if (searchInput) searchInput.value = '';
            if (courseFilter) courseFilter.value = '';
            applyFilters();
        });
    }

    if (!await checkAdminAuth()) return;
    await loadPendingUsers();
    await loadApprovedUsers();

    if (window.imccHidePreloader) window.imccHidePreloader();
});
