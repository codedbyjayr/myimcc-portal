// onboarding/select-role.js
document.addEventListener('DOMContentLoaded', async () => {
    let supabaseClient;
    try {
        supabaseClient = await getSupabaseClientAsync();
    } catch (e) {
        console.error("Failed to init Supabase", e);
        return;
    }

    const onboardForm = document.getElementById('onboardForm');
    const fullNameInput = document.getElementById('fullName');
    const idNumberInput = document.getElementById('idNumber');
    const requestedRoleSelect = document.getElementById('requestedRole');
    const submitBtn = document.getElementById('submitBtn');
    const formError = document.getElementById('formError');

    // Verify User Session
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
        window.location.href = '../auth/login.html';
        return;
    }

    // Pre-check profile state
    const { data: profile } = await supabaseClient
        .from('profiles')
        .select('status')
        .eq('id', user.id)
        .single();

    if (profile && profile.status === 'pending') {
        window.location.href = 'awaiting-approval.html';
        return;
    }

    onboardForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (formError) formError.hidden = true;

        const fullName = fullNameInput.value.trim();
        const idNumber = idNumberInput.value.trim();
        const requestedRole = requestedRoleSelect.value;

        if (!fullName || !idNumber) {
            if (formError) {
                formError.textContent = 'Please fill out all required fields.';
                formError.hidden = false;
            }
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';

        // Update profile in DB to move status from 'onboarding' -> 'pending'
        const { error } = await supabaseClient
            .from('profiles')
            .update({
                full_name: fullName,
                id_number: idNumber,
                requested_role: requestedRole,
                status: 'pending',
                updated_at: new Date().toISOString()
            })
            .eq('id', user.id);

        if (error) {
            console.error("Profile update error:", error);
            if (formError) {
                formError.textContent = error.message || 'Error saving profile.';
                formError.hidden = false;
            }
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit for Approval';
        } else {
            window.location.href = 'awaiting-approval.html';
        }
    });
});