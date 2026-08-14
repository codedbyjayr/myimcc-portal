// ── Universal Portal Map ──────────────────────────────────────────────
const ROLE_DASHBOARDS = {
    admin: '../admin/dashboard.html',
    faculty: '../faculty/teacher-dashboard.html',
    staff: '../staff/staff-dashboard.html',
    student: '../student/dashboard.html'
};

/**
 * Validates session, status, and role.
 * Redirects automatically if the user does not match the page's allowed roles.
 * 
 * @param {Array<string>} allowedRoles - e.g. ['admin'], ['faculty'], or ['student']
 * @returns {Promise<{user: object, profile: object}|null>}
 */
async function initAuthGuard(allowedRoles = []) {
    if (!supabaseClient) {
        console.error('Supabase client not found.');
        return null;
    }

    // 1. Authenticate Active Supabase Session
    const { data: { user }, error } = await supabaseClient.auth.getUser();
    if (error || !user) {
        window.location.href = '../auth/login.html';
        return null;
    }

    // 2. Fetch User Profile
    const { data: profile, error: pErr } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

    if (pErr || !profile) {
        console.error('Error fetching profile guard:', pErr);
        window.location.href = '../auth/login.html';
        return null;
    }

    // 3. Verify Account Approval Status
    if (profile.status !== 'approved') {
        alert(`Your account status is currently "${profile.status || 'pending'}". Access denied.`);
        window.location.href = '../auth/login.html';
        return null;
    }

    // 4. Role Guard: Check if user belongs on this dashboard
    if (!allowedRoles.includes(profile.role)) {
        const targetDashboard = ROLE_DASHBOARDS[profile.role] || '../auth/login.html';
        alert(`Your assigned role is ${profile.role.toUpperCase()}. Redirecting to your dashboard...`);
        window.location.href = targetDashboard;
        return null;
    }

    // 5. Attach Real-time Change Listener for Admin Panel Actions
    listenForRoleChanges(user.id, allowedRoles);

    return { user, profile };
}

// ── Live Supabase Realtime Listener ──────────────────────────────────
function listenForRoleChanges(userId, currentAllowedRoles) {
    supabaseClient
        .channel(`public:profiles:id=eq.${userId}`)
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'profiles',
                filter: `id=eq.${userId}`
            },
            (payload) => {
                const updatedProfile = payload.new;

                // Account status revoked/unapproved by Admin
                if (updatedProfile.status !== 'approved') {
                    alert('Your access status was changed by an administrator. Redirecting...');
                    window.location.href = '../auth/login.html';
                    return;
                }

                // Role changed in Admin Portal dropdown
                if (!currentAllowedRoles.includes(updatedProfile.role)) {
                    const target = ROLE_DASHBOARDS[updatedProfile.role] || '../auth/login.html';
                    alert(`Your role has been updated to "${updatedProfile.role.toUpperCase()}". Redirecting...`);
                    window.location.href = target;
                }
            }
        )
        .subscribe();
}