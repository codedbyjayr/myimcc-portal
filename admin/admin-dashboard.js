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
    const logoutBtn = document.getElementById('logoutBtn');

    let currentAdminId = null;

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

        pendingTableBody.innerHTML = '';
        pendingCountEl.textContent = `${users.length} Pending`;

        if (users.length === 0) {
            noPendingMsg.style.display = 'block';
            return;
        } else {
            noPendingMsg.style.display = 'none';
        }

        users.forEach(user => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
        <td><b>${escapeHtml(user.full_name || 'N/A')}</b></td>
        <td>${escapeHtml(user.email)}</td>
        <td><code>${escapeHtml(user.id_number || 'N/A')}</code></td>
        <td><span class="badge badge-pending">${escapeHtml(user.requested_role || 'student')}</span></td>
        <td>
          <button class="btn-action btn-approve" data-id="${user.id}" data-role="${user.requested_role || 'student'}">Approve</button>
          <button class="btn-action btn-reject" data-id="${user.id}">Reject</button>
        </td>
      `;
            pendingTableBody.appendChild(tr);
        });

        attachPendingListeners();
    }

    // 3. Fetch Approved Users & Render Interactive Select Dropdowns
    async function loadApprovedUsers() {
        const { data: users, error } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('status', 'approved')
            .order('full_name', { ascending: true });

        if (error) return;

        approvedTableBody.innerHTML = '';

        users.forEach(user => {
            const isSelf = user.id === currentAdminId;
            const currentRole = user.role || 'student';

            const tr = document.createElement('tr');
            tr.innerHTML = `
        <td><b>${escapeHtml(user.full_name || 'N/A')}</b> ${isSelf ? '<small style="color:var(--primary);">(You)</small>' : ''}</td>
        <td>${escapeHtml(user.email)}</td>
        <td><code>${escapeHtml(user.id_number || 'N/A')}</code></td>
        <td>
          <select class="role-select" data-id="${user.id}" ${isSelf ? 'disabled' : ''}>
            <option value="student" ${currentRole === 'student' ? 'selected' : ''}>Student</option>
            <option value="teacher" ${currentRole === 'teacher' || currentRole === 'faculty' ? 'selected' : ''}>Faculty</option>
            <option value="staff" ${currentRole === 'staff' ? 'selected' : ''}>Staff</option>
            <option value="admin" ${currentRole === 'admin' ? 'selected' : ''}>Admin</option>
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

    // 4. Attach Listeners for Pending Approvals / Rejections
    function attachPendingListeners() {
        document.querySelectorAll('.btn-approve').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const userId = e.target.getAttribute('data-id');
                const targetRole = e.target.getAttribute('data-role');

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
        document.querySelectorAll('.role-select').forEach(select => {
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

    await checkAdminAuth();
    await loadPendingUsers();
    await loadApprovedUsers();
});