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
            .select('role, status')
            .eq('id', user.id)
            .single();

        if (!profile || profile.role !== 'admin' || profile.status !== 'approved') {
            alert("Unauthorized access. Admin privileges required.");
            await supabaseClient.auth.signOut();
            window.location.href = '../auth/login.html';
            return;
        }

        if (adminEmailEl) adminEmailEl.textContent = user.email;
    }

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
        <td><code>${highlight(user.id_number || 'N/A', term)}</code></td>
        <td>${highlight(user.program || '—', term)}</td>
        <td>
          <select class="role-select pending-role-select" data-id="${user.id}">
            <option value="student" ${(user.requested_role || 'student') === 'student' ? 'selected' : ''}>Student</option>
            <option value="teacher" ${user.requested_role === 'teacher' || user.requested_role === 'faculty' ? 'selected' : ''}>Faculty</option>
            <option value="staff" ${user.requested_role === 'staff' ? 'selected' : ''}>Staff</option>
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
        <td><code>${highlight(user.id_number || 'N/A', term)}</code></td>
        <td>${highlight(user.program || '—', term)}</td>
        <td>
          <select class="role-select" data-id="${user.id}" ${isSelf ? 'disabled' : ''}>
            <option value="student" ${currentRole === 'student' ? 'selected' : ''}>Student</option>
            <option value="teacher" ${currentRole === 'teacher' || currentRole === 'faculty' ? 'selected' : ''}>Faculty</option>
            <option value="staff" ${currentRole === 'staff' ? 'selected' : ''}>Staff</option>
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
                user.id_number,
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
    function attachPendingListeners() {
        document.querySelectorAll('.btn-approve').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const userId = e.target.getAttribute('data-id');
                const roleSelect = document.querySelector(`.pending-role-select[data-id="${userId}"]`);
                const targetRole = roleSelect ? roleSelect.value : 'student';

                const { error } = await supabaseClient
                    .from('profiles')
                    .update({ status: 'approved', role: targetRole })
                    .eq('id', userId);

                if (error) {
                    alert('Failed to approve user: ' + error.message);
                } else {
                    loadPendingUsers();
                    loadApprovedUsers();
                }
            });
        });

        document.querySelectorAll('.btn-reject').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                if (!confirm('Reject this registration request?')) return;
                const userId = e.target.getAttribute('data-id');

                const { error } = await supabaseClient
                    .from('profiles')
                    .update({ status: 'rejected' })
                    .eq('id', userId);

                if (error) {
                    alert('Failed to reject user: ' + error.message);
                } else {
                    loadPendingUsers();
                }
            });
        });
    }

    // 5. Attach Listeners for Dynamic Role Updates and Access Revocation
    function attachApprovedListeners() {
        // Live Role Changing Dropdown Listener
        document.querySelectorAll('.role-select[data-id]').forEach(select => {
            select.addEventListener('change', async (e) => {
                const userId = e.target.getAttribute('data-id');
                const newRole = e.target.value;

                const { error } = await supabaseClient
                    .from('profiles')
                    .update({ role: newRole })
                    .eq('id', userId);

                if (error) {
                    alert('Failed to update role: ' + error.message);
                    loadApprovedUsers(); // Revert back on error
                } else {
                    // Subtle highlight to confirm save
                    e.target.style.borderColor = 'var(--success)';
                    setTimeout(() => { e.target.style.borderColor = 'var(--surface-border)'; }, 1500);
                    const cached = allApprovedUsers.find(u => u.id === userId);
                    if (cached) cached.role = newRole;
                }
            });
        });

        // Revoke Access Listener
        document.querySelectorAll('.btn-revoke').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                if (!confirm('Revoke access for this user? They will be locked out of the portal until approved again.')) return;
                const userId = e.target.getAttribute('data-id');

                const { error } = await supabaseClient
                    .from('profiles')
                    .update({ status: 'onboarding', role: null })
                    .eq('id', userId);

                if (error) {
                    alert('Failed to revoke access: ' + error.message);
                } else {
                    loadApprovedUsers();
                    loadPendingUsers();
                }
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

    await checkAdminAuth();
    await loadPendingUsers();
    await loadApprovedUsers();
});