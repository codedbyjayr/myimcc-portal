// onboarding/select-role.js

// Replace the form with an explanation when the account cannot proceed.
// Returns true when it handled the state, so the caller can stop.
function showBlockedState(profile) {
    const route = window.IMCC && window.IMCC.resolveRoute
        ? window.IMCC.resolveRoute(profile)
        : null;
    if (!route) return false;
    if (route.kind !== 'rejected' && route.kind !== 'suspended') return false;

    const panel = document.getElementById('onboardBlocked');
    const title = document.getElementById('onboardBlockedTitle');
    const message = document.getElementById('onboardBlockedMessage');
    const form = document.getElementById('onboardForm');
    if (!panel || !title || !message) return false;

    if (route.kind === 'rejected') {
        title.textContent = 'Your access request was not approved';
        message.textContent =
            'An administrator reviewed your account and declined it. Submitting this '
            + 'form again will not change the outcome. If you believe this is a mistake, '
            + 'contact the Registrar or your department administrator.';
    } else {
        title.textContent = 'Your account is currently suspended';
        message.textContent =
            'Your portal access has been suspended. Please contact the Registrar or your '
            + 'department administrator to have it restored.';
    }

    if (form) form.hidden = true;
    panel.classList.add('visible');
    return true;
}

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
    const programSelect = document.getElementById('studentProgram');
    const yearSelect = document.getElementById('studentYear');
    const updateAcademicFields = () => {
        const student = requestedRoleSelect.value === 'student';
        document.getElementById('studentAcademicFields').hidden = !student;
        programSelect.disabled = yearSelect.disabled = !student;
        programSelect.required = yearSelect.required = student;
    };
    requestedRoleSelect.addEventListener('change', updateAcademicFields);
    updateAcademicFields();
    const submitBtn = document.getElementById('submitBtn');
    const formError = document.getElementById('formError');

    // Signing out is the only action a blocked account can take, so give it a
    // real handler. A button with no listener looks broken.
    document.getElementById('onboardSignOut')?.addEventListener('click', async () => {
        try {
            await supabaseClient.auth.signOut();
        } catch (e) {
            console.warn('Sign-out failed, continuing to login anyway:', e);
        }
        window.location.href = '../auth/login.html';
    });

    // Verify User Session
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
        window.location.href = '../auth/login.html';
        return;
    }

    // Pre-check profile state.
    //
    // resolveRoute already encodes the full decision table, including the two
    // cases this page used to get wrong. It only ever tested for 'pending', so
    // an account that was already approved, rejected, or suspended landed on
    // the role form as if it were brand new: an approved user could re-submit
    // and watch their details change, and a rejected or suspended user saw a
    // blank form with no explanation and no way forward.
    const { data: profile } = await supabaseClient
        .from('profiles')
        .select('status, role, full_name, is_active, program, year_level')
        .eq('id', user.id)
        .single();

    if (profile && showBlockedState(profile)) return;

    const route = window.IMCC && window.IMCC.resolveRoute
        ? window.IMCC.resolveRoute(profile)
        : null;

    // 'onboarding' resolves back to this page, so only a redirect elsewhere is
    // acted on here. IMCC.isCurrentPage stops an approved user being redirected
    // to the page they are already on, which would reload it in a loop.
    const isThisPage = window.IMCC && typeof window.IMCC.isCurrentPage === 'function'
        ? url => window.IMCC.isCurrentPage(url)
        : () => false;

    if (route && route.kind === 'redirect' && !isThisPage(route.url)) {
        window.location.href = route.url;
        return;
    }

    const { data: curriculum, error: curriculumError } = await window.IMCC.fetchAll(() =>
        supabaseClient.from('courses').select('program,year_level'));
    programSelect.replaceChildren(new Option(curriculumError ? 'Programs could not load. Refresh to retry.' : 'Choose your program', ''));
    if (!curriculumError) {
        const programs = [...new Set((curriculum || []).map(course => course.program).filter(Boolean))].sort();
        programs.forEach(program => programSelect.add(new Option(program, program)));
        programSelect.value = profile?.program || '';
        yearSelect.value = profile?.year_level || '';
    }

    // Prefill the name from the institutional address, e.g.
    // abc12345@imcc.edu.ph or maria.santos@imcc.edu.ph. This is a
    // convenience only; the user can correct it.
    //
    // The five-digit student suffix is deliberately NOT used to fill the ID
    // number. That suffix is a provisional mailbox token, not a school ID,
    // and writing it into student_no would claim an identity record the
    // registrar never issued.
    if (window.IMCC && typeof window.IMCC.parseEmailIdentity === 'function') {
        const hint = window.IMCC.parseEmailIdentity(user.email);
        if (hint && hint.displayName && !fullNameInput.value.trim()) {
            fullNameInput.value = hint.displayName;
        }
    }

    onboardForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (formError) formError.hidden = true;

        const fullName = fullNameInput.value.trim();
        const idNumber = idNumberInput.value.trim();
        const requestedRole = requestedRoleSelect.value;
        const academicDetails = requestedRole === 'student'
            ? { program: programSelect.value, year_level: yearSelect.value } : {};

        if (!fullName || !idNumber || (requestedRole === 'student' &&
            !(curriculum || []).some(course => course.program === academicDetails.program &&
                course.year_level === parseInt(academicDetails.year_level, 10)))) {
            if (formError) {
                formError.textContent = 'Please fill out all required fields, including a valid student program and year level.';
                formError.hidden = false;
            }
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';

        // The database owns approval and validates student academic details.
        const { error } = await supabaseClient
            .from('profiles')
            .update({
                full_name: fullName,
                id_number: idNumber,
                requested_role: requestedRole,
                ...academicDetails,
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
            return;
        }

        // Re-read rather than assuming. A student-pattern account is
        // already approved at this point and belongs in the student
        // portal, not the waiting room.
        const { data: updated } = await supabaseClient
            .from('profiles')
            .select('role, status, is_active')
            .eq('id', user.id)
            .single();

        const route = window.IMCC && window.IMCC.resolveRoute
            ? window.IMCC.resolveRoute(updated)
            : null;

        if (route && route.kind === 'redirect') {
            window.location.href = route.url;
        } else {
            window.location.href = 'awaiting-approval.html';
        }
    });
});
