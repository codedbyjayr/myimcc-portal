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

    // 1. Verify User is an Approved Admin
    async function checkAdminAuth() {
        const { data: { user }, error } = await supabaseClient.auth.getUser();

        if (error || !user) {
            window.location.href = '../auth/login.html';
            return;
        }

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

    // 2. Fetch and Render Pending Requests
    async function loadPendingUsers() {
        const { data: users, error } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('status', 'pending')
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Error fetching pending users:', error);
            return;
        }

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

        attachActionListeners();
    }

    // 3. Fetch and Render Approved Users
    async function loadApprovedUsers() {
        const { data: users, error } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('status', 'approved')
            .order('updated_at', { ascending: false });

        if (error) return;

        approvedTableBody.innerHTML = '';
        users.forEach(user => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
        <td>${escapeHtml(user.full_name || 'N/A')}</td>
        <td>${escapeHtml(user.email)}</td>
        <td><code>${escapeHtml(user.id_number || 'N/A')}</code></td>
        <td><b style="text-transform: capitalize;">${escapeHtml(user.role || 'student')}</b></td>
        <td><span class="badge badge-approved">Approved</span></td>
      `;
            approvedTableBody.appendChild(tr);
        });
    }

    // 4. Handle Approve/Reject Buttons
    function attachActionListeners() {
        document.querySelectorAll('.btn-approve').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const userId = e.target.getAttribute('data-id');
                const targetRole = e.target.getAttribute('data-role');

                const { error } = await supabaseClient
                    .from('profiles')
                    .update({
                        status: 'approved',
                        role: targetRole
                    })
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
                if (!confirm('Are you sure you want to reject this request?')) return;
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

    // Helper function to prevent XSS
    function escapeHtml(str) {
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // 5. Logout Listener
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await supabaseClient.auth.signOut();
            window.location.href = '../auth/login.html';
        });
    }

    // Run Bootstrap
    await checkAdminAuth();
    await loadPendingUsers();
    await loadApprovedUsers();
});