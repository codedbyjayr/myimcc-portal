// admin/admin-dashboard.js
(async () => {
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
    const roleSaveStatus = document.getElementById('roleSaveStatus');
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
        if (pendingTableBody) pendingTableBody.innerHTML = window.imccTableSkeleton(6, 2);
        if (approvedTableBody) approvedTableBody.innerHTML = window.imccTableSkeleton(7, 4);
    }

    let currentAdminId = null;

    // Full unfiltered datasets — filters are applied client-side against these.
    let allPendingUsers = [];
    let allApprovedUsers = [];
    const pendingRoleDrafts = new Map();
    const decidingRequests = new Set();
    const roleDrafts = new Map();
    const savingRoles = new Set();
    const changingAccess = new Set();

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

    const roleChoices = [
        ['student', 'Student'], ['teacher', 'Faculty'], ['registrar', 'Registrar'], ['admin', 'Admin'],
        ['staff', 'Staff'], ['dean', 'Dean'],
        ...['Guidance', 'Cashier', 'DSA', 'Laboratory/Nursing Arts/Cybershack', 'Library',
            'Medical Clinic/Dental', 'Property Custodian', 'ROTC/CWTS'].map(office => ['staff:' + office, 'Staff – ' + office]),
        ...['CCS', 'CBA', 'CAS', 'CNM', 'CED', 'CCSJE', 'CHTM', 'CMT', 'CRT'].map(department => ['dean:' + department, 'Dean – ' + department]),
    ];
    function roleValue(role, department) {
        return (role === 'faculty' ? 'teacher' : role || 'student') + (department ? ':' + department : '');
    }
    function roleOptions(role, department) {
        const selected = roleValue(role, department);
        return roleChoices.map(([value, label]) => `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('');
    }
    previewRole.innerHTML = roleOptions('admin').replace('value="teacher"', 'value="faculty"');

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
            const session = await demoRequest({action:'start',role:previewRole.value.split(':')[0]});
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
            previewHome = demoSession ? demoSession.path : metadata.dashboards[previewRole.value.split(':')[0]];
            let path = typeof navigate==='string' ? navigate : demoSession ? demoSession.path : metadata.dashboards[previewRole.value.split(':')[0]];
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
            csp.content = `default-src 'none'; script-src ${[...hashes, ...sources].join(' ')} ${location.origin}/shared/dist/ ${location.origin}/review-assets/shared/dist/; connect-src 'none'; form-action 'none'; object-src 'none'; frame-src 'none'; style-src ${location.origin} https://fonts.googleapis.com 'unsafe-inline'; font-src ${location.origin} https://fonts.gstatic.com; img-src ${location.origin} ${imageOrigin} https://lh3.googleusercontent.com data:; base-uri ${location.origin}`;
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
                const role = demoSession?.role || previewRole.value.split(':')[0];
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

    const listLoads = {
        pending: { version: 0, loaded: false, body: pendingTableBody, notice: document.getElementById('pendingLoadError') },
        approved: { version: 0, loaded: false, body: approvedTableBody, notice: document.getElementById('approvedLoadError') },
    };

    async function loadAccountList(status, order, applyUsers) {
        const list = listLoads[status];
        const version = ++list.version;
        const retry = list.notice.querySelector('button');
        retry.disabled = true;
        let result;
        try {
            result = await IMCC.fetchAll(() => supabaseClient
                .from('profiles')
                .select('*')
                .eq('status', status)
                .order(order, { ascending: true }));
        } catch (error) {
            result = { error };
        }
        if (version !== list.version) return;
        retry.disabled = false;
        if (result.error) {
            if (!list.loaded) {
                list.body.replaceChildren();
                if (status === 'pending') pendingCountEl.textContent = 'Unavailable';
            }
            const message = list.loaded ? ' The last loaded results are still shown.' : '';
            list.notice.querySelector('[role="alert"]').textContent = `Could not load ${status} users.${message}`;
            list.notice.hidden = false;
            return;
        }
        list.loaded = true;
        list.notice.hidden = true;
        applyUsers(result.data);
    }

    function showPendingUsers(users) {
        allPendingUsers = users;
        pendingCountEl.textContent = `${users.length} Pending`;
        populateCourseFilter();
        renderPendingTable(filterUsers(users, { roleField: 'requested_role' }));
    }

    function loadPendingUsers() {
        return loadAccountList('pending', 'created_at', showPendingUsers);
    }

    function loadApprovedUsers() {
        return loadAccountList('approved', 'full_name', users => {
            allApprovedUsers = users;
            populateCourseFilter();
            renderApprovedTable(filterUsers(users, { roleField: 'role' }));
        });
    }

    function renderPendingTable(users) {
        if (!listLoads.pending.loaded) return;
        noPendingMsg.style.display = users.length ? 'none' : 'block';
        noPendingMsg.textContent = allPendingUsers.length === 0
            ? 'No pending registration requests found.'
            : 'No pending requests match your search or filter.';
        pendingTableBody.innerHTML = window.renderAdminPendingRows({
            users: users.map(user => ({
                ...user,
                roleValue: pendingRoleDrafts.get(user.id) ?? roleValue(user.requested_role),
                busy: decidingRequests.has(user.id),
            })),
            choices: roleChoices,
            term: (searchInput?.value || '').trim(),
        });
    }

    function renderApprovedTable(users) {
        if (!listLoads.approved.loaded) return;
        noApprovedMsg.style.display = users.length ? 'none' : 'block';
        approvedTableBody.innerHTML = window.renderAdminApprovedRows({
            users: users.map(user => ({
                ...user,
                roleValue: roleDrafts.get(user.id) ?? roleValue(user.role, user.role_department),
                isSelf: user.id === currentAdminId,
                suspended: user.is_active === false,
                hasDraft: roleDrafts.has(user.id),
                saving: savingRoles.has(user.id),
                accessBusy: changingAccess.has(user.id),
            })),
            choices: roleChoices,
            term: (searchInput?.value || '').trim(),
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
                user.role_department,
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

    pendingTableBody.addEventListener('change', event => {
        const userId = event.target.dataset.roleUserId;
        if (userId) pendingRoleDrafts.set(userId, event.target.value);
    });

    pendingTableBody.addEventListener('click', async event => {
        const button = event.target.closest('[data-pending-action]');
        if (!button) return;
        const row = button.closest('tr');
        const select = row.querySelector('[data-role-user-id]');
        const userId = select.dataset.roleUserId;
        if (decidingRequests.has(userId)) return;
        const approved = button.dataset.pendingAction === 'approve';
        if (!approved && !confirm('Reject this registration request?')) return;
        const args = { target_id: userId, approved };
        if (approved) args.approved_role = select.value;

        decidingRequests.add(userId);
        row.querySelectorAll('select, button').forEach(control => { control.disabled = true; });
        try {
            const error = await callRpc('set_user_approval', args);
            if (error) throw error;
            pendingRoleDrafts.delete(userId);
            showPendingUsers(allPendingUsers.filter(user => user.id !== userId));
            void loadPendingUsers();
            if (approved) void loadApprovedUsers();
        } catch (error) {
            alert(`Failed to ${approved ? 'approve' : 'reject'} user: ${error.message}`);
        } finally {
            decidingRequests.delete(userId);
            renderPendingTable(filterUsers(allPendingUsers, { roleField: 'requested_role' }));
        }
    });

    // 5. Attach Listeners for Dynamic Role Updates and Access Revocation
    function attachApprovedListeners() {
        approvedTableBody.querySelectorAll('[data-role-user-id]').forEach(select => {
            const userId = select.dataset.roleUserId;
            const save = select.closest('td').querySelector('[data-save-role]');
            if (!save) return;

            select.addEventListener('change', () => {
                const user = allApprovedUsers.find(u => u.id === userId);
                if (!user || savingRoles.has(userId) || changingAccess.has(userId)) return;
                if (select.value === roleValue(user.role, user.role_department)) roleDrafts.delete(userId);
                else roleDrafts.set(userId, select.value);
                save.disabled = !roleDrafts.has(userId);
            });

            save.addEventListener('click', async () => {
                const newRole = roleDrafts.get(userId);
                if (!newRole || userId === currentAdminId || savingRoles.has(userId) || changingAccess.has(userId)) return;
                savingRoles.add(userId);
                select.disabled = save.disabled = true;
                select.closest('tr').querySelector('[data-account-access]').disabled = true;
                save.textContent = 'Saving…';
                roleSaveStatus.textContent = '';
                try {
                    const error = await callRpc('set_user_role', { target_id: userId, new_role: newRole });
                    if (error) throw error;
                    const cached = allApprovedUsers.find(u => u.id === userId);
                    if (cached) {
                        const [role, department] = newRole.split(':');
                        cached.role = role;
                        cached.role_department = department || null;
                    }
                    roleDrafts.delete(userId);
                    roleSaveStatus.textContent = 'Role saved.';
                } catch (error) {
                    roleSaveStatus.textContent = 'Failed to update role: ' + error.message;
                } finally {
                    savingRoles.delete(userId);
                    renderApprovedTable(filterUsers(allApprovedUsers, { roleField: 'role' }));
                }
            });
        });

    }

    const accessDialog = document.getElementById('accessDialog');
    const confirmAccess = document.getElementById('confirmAccess');
    const accessSaveStatus = document.getElementById('accessSaveStatus');
    let accessTarget = null;

    approvedTableBody.addEventListener('click', event => {
        const button = event.target.closest('[data-account-access]');
        if (!button || accessDialog.open) return;
        const userId = button.dataset.accountAccess;
        const user = allApprovedUsers.find(user => user.id === userId);
        if (!user || userId === currentAdminId || changingAccess.has(userId) || savingRoles.has(userId)) return;
        const active = user.is_active === false;
        const action = active ? 'Restore access' : 'Revoke access';
        accessTarget = { userId, active };
        document.getElementById('accessTitle').textContent = action;
        document.getElementById('accessMessage').textContent = `${action} for ${user.full_name || user.email}? Their assigned role will stay the same.`;
        confirmAccess.textContent = action;
        accessDialog.returnValue = '';
        accessDialog.showModal();
    });

    document.getElementById('cancelAccess').addEventListener('click', () => accessDialog.close());
    confirmAccess.addEventListener('click', () => accessDialog.close('confirm'));
    accessDialog.addEventListener('close', async () => {
        const target = accessTarget;
        accessTarget = null;
        if (accessDialog.returnValue !== 'confirm' || !target) return;
        const { userId, active } = target;
        const user = allApprovedUsers.find(user => user.id === userId);
        if (!user || userId === currentAdminId || changingAccess.has(userId) || savingRoles.has(userId) || active !== (user.is_active === false)) return;

        changingAccess.add(userId);
        accessSaveStatus.textContent = '';
        renderApprovedTable(filterUsers(allApprovedUsers, { roleField: 'role' }));
        try {
            const error = await callRpc('set_user_active', { target_id: userId, active });
            if (error) throw error;
            const cached = allApprovedUsers.find(user => user.id === userId);
            if (cached) cached.is_active = active;
            accessSaveStatus.textContent = active ? 'Access restored.' : 'Access revoked.';
            void loadApprovedUsers();
        } catch (error) {
            accessSaveStatus.textContent = 'Failed to update access: ' + error.message;
        } finally {
            changingAccess.delete(userId);
            renderApprovedTable(filterUsers(allApprovedUsers, { roleField: 'role' }));
        }
    });

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
    listLoads.pending.notice.querySelector('button').addEventListener('click', loadPendingUsers);
    listLoads.approved.notice.querySelector('button').addEventListener('click', loadApprovedUsers);
    await Promise.all([loadPendingUsers(), loadApprovedUsers()]);

    if (window.imccHidePreloader) window.imccHidePreloader();
})();
