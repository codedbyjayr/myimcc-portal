// dean-dashboard.js
(async () => {
    let supabaseClient;
    try {
        supabaseClient = await getSupabaseClientAsync();
    } catch (e) {
        console.error('Failed to init Supabase', e);
        return;
    }

    // ── Shared helpers — delegated to shared/faculty-chrome.js (FC) ──
    const getEl = FC.getEl;
    const escapeHtml = FC.escapeHtml;
    const fmtDate = FC.fmtDate;
    const showToast = FC.showToast;

    const SEMESTER_ORDER = { '1st Semester': 1, '2nd Semester': 2, 'Summer': 3, 'Summer Semester': 3 };
    function termKey(schoolYear, semester) { return `${schoolYear || '—'} · ${semester || '—'}`; }
    function termSortValue(schoolYear, semester) {
        const startYear = parseInt(String(schoolYear || '0').match(/\d{4}/)?.[0] || '0', 10);
        return startYear * 10 + (SEMESTER_ORDER[semester] || 9);
    }

    // ── State ───────────────────────────────────────────────────────────
    let currentUserId = null;
    let currentProfile = null;
    let darkMode = false;
    const state = {
        profiles: [], offerings: [], grades: [], enrollments: [], facultyList: [],
        courses: [],
        // Instructor options loaded from the get_subject_instructor_options RPC.
        // Each entry: { id, full_name, role }
        instructorOptions: null,   // null = not yet loaded; [] = loaded but empty
        instructorOptionsError: null,
        instructorOptionsRequest: null,
    };

    // ── Mobile Navigation — delegated to FC ──
    FC.initMobileNav();

    // ── Navigation — delegated to FC ──
    const goto = FC.initNavigation({
        dashboard: 'Dashboard',
        classes: 'My Classes',
        faculty: 'Faculty & Schedule',
        records: 'View Records',
        compliance: 'Student Compliance',
        profile: 'My Profile',
    }, function (page) {
        if (page === 'profile') renderProfile();
        if (page === 'classes') loadMyClasses();
        if (page === 'records') renderStudentPicker('record');
        if (page === 'compliance') renderStudentPicker('clearance');
    });

    // ── Dropdown + theme — delegated to FC ──
    FC.setupDropdown('userBtn', 'userDropdown');
    FC.initThemeToggle();

    // ── Auth ────────────────────────────────────────────────────────────
    async function checkDeanAuth() {
        const session = await initAuthGuard(['dean', 'admin']);
        if (!session) return false;
        currentUserId = session.user.id;
        currentProfile = session.profile;
        FC.setSidebarProfile(currentProfile, session.user.email);
        return true;
    }

    // ── Bulk data load ──────────────────────────────────────────────────

    /**
     * Load instructor options via the get_subject_instructor_options RPC.
     * Returns approved active teachers/faculty and the signed-in dean.
     * Results are cached in state.instructorOptions so repeated calls are cheap.
     * @param {boolean} force - if true, bypasses the cache and re-fetches.
     */
    async function loadInstructorOptions(force = false) {
        if (state.instructorOptionsRequest) return state.instructorOptionsRequest;
        if (!force && state.instructorOptions !== null) return;

        state.instructorOptions = null;  // mark as loading
        state.instructorOptionsError = null;

        const request = Promise.resolve(supabaseClient.rpc('get_subject_instructor_options')).catch(error => ({ error }));
        state.instructorOptionsRequest = request;
        const { data, error } = await request;
        state.instructorOptionsRequest = null;

        if (error) {
            console.error('get_subject_instructor_options RPC error:', error);
            state.instructorOptions = [];
            state.instructorOptionsError = error.message || 'Unknown RPC error';
        } else {
            // A dean may teach a subject themselves, alongside eligible teachers/faculty.
            state.instructorOptions = (data || []).filter(r =>
                r.role === 'teacher' || r.role === 'faculty' || (r.role === 'dean' && r.id === currentUserId)
            );
            state.instructorOptionsError = null;
        }

        // Also mirror into facultyList so the inline-assign dropdowns in the
        // Faculty & Schedule tab stay in sync (they use state.facultyList).
        if (state.instructorOptions.length) {
            state.facultyList = state.instructorOptions.map(r => ({
                id: r.id,
                full_name: r.full_name,
                role: r.role,
                status: 'approved',
            }));
        }
    }

    async function loadAllData() {
        const results = await Promise.all([
            supabaseClient.rpc(window.IMCC_DEVELOPER_VIEW ? 'get_dean_student_directory' : 'list_student_records'),
            IMCC.fetchAll(() => supabaseClient.from('course_offerings').select('*')),
            IMCC.fetchAll(() => supabaseClient.from('grades').select('*, course_offerings(code, title, units, program, instructor_name)')),
            IMCC.fetchAll(() => supabaseClient.from('enrollments').select('id, student_id, status, offering_id, course_offerings(school_year, semester)').eq('status', 'enrolled')),
            IMCC.fetchAll(() => supabaseClient.from('courses').select('*').order('code')),
        ]);

        const failure = results.find(result => result.error || !Array.isArray(result.data));
        if (failure) throw new Error(failure.error?.message || 'Dashboard data is unavailable.');
        const [{ data: profiles }, { data: offerings }, { data: gradeRows }, { data: enrollRows }, { data: courses }] = results;

        state.profiles = [currentProfile, ...(profiles || [])].filter(Boolean);
        state.offerings = offerings || [];
        state.grades = gradeRows || [];
        state.enrollments = enrollRows || [];
        state.courses = courses || [];

        // Build an initial facultyList from profiles for cases where the RPC
        // hasn't loaded yet. The RPC result will overwrite this once ready.
        state.facultyList = state.profiles.filter(
            p => ['teacher', 'faculty', 'dean'].includes(p.role) && p.status === 'approved'
        );

        // Both assignment dropdowns need the complete list before the first render.
        await loadInstructorOptions();
    }

    // ══════════════════════════════════════════════════════════════════
    // DASHBOARD — STRATEGIC ANALYTICS
    // ══════════════════════════════════════════════════════════════════
    function renderOverview() {
        renderEnrollmentStats();
        renderProgramBars();
        renderSemesterTrend();
        renderPerformance();
        renderFlaggedCourses();
    }

    function renderEnrollmentStats() {
        const students = state.profiles.filter(p => p.role === 'student' && p.status === 'approved');
        const programs = new Set(students.map(s => s.program).filter(Boolean));

        const withFinal = state.grades.filter(g => g.final !== null && g.final !== undefined);
        const avgEquivalent = withFinal.length
            ? (withFinal.reduce((s, g) => s + Number(g.equivalent || 0), 0) / withFinal.length).toFixed(2)
            : '—';

        const retention = computeRetentionRate();

        getEl('enrollmentStats').innerHTML = window.renderDeanEnrollmentStats({
            students: students.length, programs: programs.size, average: avgEquivalent,
            finals: withFinal.length, retention, offerings: state.offerings.length,
        });
    }

    function renderProgramBars() {
        const students = state.profiles.filter(p => p.role === 'student' && p.status === 'approved');
        const counts = {};
        students.forEach(s => { const p = s.program || 'Unspecified'; counts[p] = (counts[p] || 0) + 1; });
        const max = Math.max(1, ...Object.values(counts));
        const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);

        getEl('programBars').innerHTML = window.renderDeanOverviewBars({
            rows: entries.map(([label, value]) => ({ label, value, width: value / max * 100 })),
            empty: 'No approved students on file.',
        });
    }

    function getTermCounts() {
        const map = {};
        state.enrollments.forEach(e => {
            const off = e.course_offerings;
            if (!off) return;
            const key = termKey(off.school_year, off.semester);
            if (!map[key]) map[key] = { set: new Set(), sortVal: termSortValue(off.school_year, off.semester) };
            map[key].set.add(e.student_id);
        });
        return Object.entries(map)
            .map(([key, v]) => ({ key, count: v.set.size, sortVal: v.sortVal, set: v.set }))
            .sort((a, b) => a.sortVal - b.sortVal);
    }

    function renderSemesterTrend() {
        const terms = getTermCounts().slice(-6);
        const max = Math.max(1, ...terms.map(t => t.count));

        getEl('semesterTrendBars').innerHTML = window.renderDeanOverviewBars({
            rows: terms.map(term => ({ label: term.key, value: term.count, width: term.count / max * 100, color: 'ok' })),
            empty: 'No enrollment history found yet.',
        });
    }

    function computeRetentionRate() {
        const terms = getTermCounts();
        if (terms.length < 2) return null;
        const prev = terms[terms.length - 2];
        const latest = terms[terms.length - 1];
        if (prev.set.size === 0) return null;
        let retained = 0;
        prev.set.forEach(id => { if (latest.set.has(id)) retained++; });
        return (retained / prev.set.size) * 100;
    }

    function renderPerformance() {
        const withRemark = state.grades.filter(g => g.remark && g.remark !== 'Pending');
        const passed = withRemark.filter(g => g.remark === 'Passed').length;
        const failed = withRemark.filter(g => g.remark === 'Failed').length;
        const pending = state.grades.length - withRemark.length;
        const total = Math.max(1, state.grades.length);

        getEl('performanceStats').innerHTML = window.renderDeanPerformanceStats({ passed, failed, pending });
        getEl('passFailBars').innerHTML = window.renderDeanOverviewBars({
            rows: [
                { label: 'Passed', value: (passed / total * 100).toFixed(0) + '%', width: passed / total * 100, color: 'ok' },
                { label: 'Failed', value: (failed / total * 100).toFixed(0) + '%', width: failed / total * 100, color: 'danger' },
            ],
        });
    }

    function renderFlaggedCourses() {
        const byOffering = {};
        state.grades.forEach(g => {
            if (g.final === null || g.final === undefined) return;
            const off = g.course_offerings;
            if (!off) return;
            const key = off.code || 'Unknown';
            if (!byOffering[key]) byOffering[key] = { code: off.code, program: off.program, total: 0, failed: 0 };
            byOffering[key].total++;
            if (g.remark === 'Failed') byOffering[key].failed++;
        });

        const flagged = Object.values(byOffering)
            .filter(c => c.total >= 3 && (c.failed / c.total) >= 0.3)
            .sort((a, b) => (b.failed / b.total) - (a.failed / a.total));

        const body = getEl('flaggedCoursesBody');
        const msg = getEl('noFlaggedMsg');
        if (!flagged.length) { body.innerHTML = ''; msg.style.display = 'block'; return; }
        msg.style.display = 'none';
        body.innerHTML = window.renderDeanFlaggedCourses({ rows: flagged });
    }

    // ══════════════════════════════════════════════════════════════════
    // FACULTY & SCHEDULE
    // ══════════════════════════════════════════════════════════════════
    function getTermList() {
        const set = new Map();
        state.offerings.forEach(o => {
            const key = termKey(o.school_year, o.semester);
            if (!set.has(key)) set.set(key, { school_year: o.school_year, semester: o.semester, sortVal: termSortValue(o.school_year, o.semester) });
        });
        return [...set.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.sortVal - a.sortVal);
    }

    let selectedTermKey = null;

    function initTermFilter() {
        const terms = getTermList();
        const select = getEl('assignSemesterFilter');
        if (!terms.some(term => term.key === selectedTermKey)) selectedTermKey = terms[0]?.key ?? null;
        if (!terms.length) { select.innerHTML = '<option>No terms found</option>'; return; }
        select.innerHTML = terms.map(t => `<option value="${escapeHtml(t.key)}" ${t.key === selectedTermKey ? 'selected' : ''}>${escapeHtml(t.key)}</option>`).join('');
        select.onchange = () => { selectedTermKey = select.value; renderFacultyPage(); };
        getEl('assignYearFilter').onchange = renderFacultyPage;
    }

    function renderFacultyPage() {
        initTermFilter();
        renderWorkloads();
        renderAssignments();
    }

    function offeringsForSelectedTerm() {
        const year = getEl('assignYearFilter').value;
        return state.offerings.filter(o => termKey(o.school_year, o.semester) === selectedTermKey && (!year || String(o.year) === year));
    }

    function renderWorkloads() {
        const offerings = offeringsForSelectedTerm();
        const byInstructor = {};
        offerings.forEach(o => {
            const id = o.instructor_id || 'unassigned';
            const name = o.instructor_name || 'Unassigned';
            if (!byInstructor[id]) byInstructor[id] = { id, name, sections: 0, units: 0 };
            byInstructor[id].sections++;
            byInstructor[id].units += Number(o.units || 0);
        });

        const rows = Object.values(byInstructor).sort((a, b) => b.units - a.units);
        const body = getEl('workloadBody');
        const msg = getEl('noWorkloadMsg');
        if (!rows.length) { body.innerHTML = ''; msg.style.display = 'block'; return; }
        msg.style.display = 'none';

        body.innerHTML = window.renderDeanWorkloadRows({ rows });
    }

    const pendingAssignments = new Map();

    function renderAssignments() {
        const offerings = offeringsForSelectedTerm();
        const body = getEl('assignBody');
        const msg = getEl('noOfferingsMsg');
        if (!offerings.length) { body.innerHTML = ''; msg.style.display = 'block'; return; }
        msg.style.display = 'none';

        // Use RPC-based instructor list when available; fall back to profiles-derived facultyList.
        const instructorSource = (state.instructorOptions && state.instructorOptions.length)
            ? state.instructorOptions
            : state.facultyList.filter(f => f.role === 'teacher' || f.role === 'faculty' || (f.role === 'dean' && f.id === currentUserId));
        const instructors = instructorSource.slice().sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
        body.innerHTML = window.renderDeanAssignmentRows({ offerings, instructors, currentUserId, pending: pendingAssignments });
        body.querySelectorAll('.assign-select').forEach(sel => {
            sel.addEventListener('change', () => assignFaculty(sel));
        });

        document.querySelectorAll('.edit-offering-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const offering = offerings.find(o => String(o.id) === btn.dataset.id);
                if (offering && !pendingAssignments.has(btn.dataset.id)) openModal(offering);
            });
        });

        document.querySelectorAll('.delete-offering-btn').forEach(btn => {
            btn.addEventListener('click', () => deleteOffering(btn.dataset.id));
        });
    }

    async function deleteOffering(offeringId) {
        if (pendingAssignments.has(offeringId)) return;
        if (!confirm('Are you sure you want to delete this subject offering?')) return;
        const { data, error } = await supabaseClient.from('course_offerings').delete().eq('id', offeringId).select('id').maybeSingle();
        if (error || String(data?.id) !== String(offeringId)) {
            showToast('Failed to delete offering: ' + (error?.message || 'No subject offering was deleted.'), true);
            return;
        }
        showToast('Subject offering deleted.');
        state.offerings = state.offerings.filter(o => String(o.id) !== String(offeringId));
        renderFacultyPage();
        loadMyClasses();
    }

    async function assignFaculty(sel) {
        const offeringId = sel.dataset.id;
        const offering = state.offerings.find(o => String(o.id) === offeringId);
        if (!offering || sel.disabled || pendingAssignments.has(offeringId)) return;
        const previousId = offering.instructor_id || '';
        const facultyId = sel.value;
        const faculty = state.facultyList.find(f => f.id === facultyId);
        if (facultyId && !faculty) {
            sel.value = previousId;
            showToast('Selected instructor is unavailable. Refresh and try again.', true);
            return;
        }
        sel.disabled = true;
        pendingAssignments.set(offeringId, facultyId);
        try {
            // The database trigger synchronizes assignments in this same transaction.
            const { data, error } = await supabaseClient.from('course_offerings')
                .update({ instructor_id: facultyId || null, instructor_name: faculty?.full_name || null })
                .eq('id', offeringId).select().single();
            if (error) throw error;
            if (!data) throw new Error('No subject offering was updated.');
            Object.assign(offering, data);
            const currentOffering = state.offerings.find(o => String(o.id) === offeringId);
            if (currentOffering && currentOffering !== offering) {
                currentOffering.instructor_id = data.instructor_id;
                currentOffering.instructor_name = data.instructor_name;
            }
            sel.value = offering.instructor_id || '';
        } catch (error) {
            sel.value = previousId;
            showToast('Failed to update faculty assignment: ' + error.message, true);
            return;
        } finally {
            pendingAssignments.delete(offeringId);
            sel.disabled = false;
            if (!sel.isConnected) renderAssignments();
        }
        showToast(offering.instructor_name ? 'Assigned ' + offering.instructor_name + '.' : 'Unassigned faculty.');
        renderWorkloads();
        loadMyClasses();
    }



    let selectedRecord = { record: null, clearance: null };
    const recordRequestVersion = { record: 0, clearance: 0 };
    let deanClearanceRows = [];
    const pendingDeanClearances = new Set();
    function renderStudentPicker(kind) {
        if (kind === 'clearance' && getEl('clearanceCourseFilter') && state.profiles.length) {
            const courseSelect = getEl('clearanceCourseFilter');
            const existingVals = new Set([...courseSelect.options].map(o => o.value));
            state.profiles.forEach(p => {
                if (p.program && !existingVals.has(p.program)) {
                    courseSelect.add(new Option(p.program, p.program));
                    existingVals.add(p.program);
                }
            });
        }
        const query = getEl(kind + 'Search')?.value.trim().toLowerCase() || '';
        const course = getEl(kind + 'CourseFilter')?.value?.toLowerCase() || '';
        const year = getEl(kind + 'YearFilter')?.value || '';

        const students = state.profiles.filter(p => {
            if (p.role !== 'student') return false;
            if (query && !(p.full_name + ' ' + (p.student_no || '') + ' ' + (p.program || '')).toLowerCase().includes(query)) return false;
            if (course && (p.program || '').toLowerCase() !== course) return false;
            const yearLevel = String(p.year_level || '').trim().toLowerCase();
            const studentYear = yearLevel.match(/^[1-4]/)?.[0] || ({ first: '1', second: '2', third: '3', fourth: '4' }[yearLevel.match(/^(first|second|third|fourth)/)?.[0]]);
            if (year && studentYear !== year) return false;
            return true;
        });
        getEl(kind + 'Students').innerHTML = window.renderDeanStudentPicker({ students });
    }
    function renderDeanClearances() {
        getEl('clearanceDetails').innerHTML = window.renderDeanClearanceDetails({
            rows: deanClearanceRows, pending: pendingDeanClearances,
            readOnly: !!window.IMCC_DEVELOPER_VIEW, formatDate: fmtDate,
        });
    }
    async function loadStudentRecord(kind, id) {
        const version = ++recordRequestVersion[kind];
        selectedRecord[kind] = id;
        if (kind === 'clearance') deanClearanceRows = [];
        const target = getEl(kind + 'Details');
        target.textContent = 'Loading records…';
        getEl(kind + 'Title').textContent = state.profiles.find(p => p.id === id)?.full_name || 'Student records';
        const { data, error } = await supabaseClient.rpc('get_student_record', { p_student_id: id });
        if (version !== recordRequestVersion[kind]) return;
        if (error || !data || (kind === 'record' && !data.profile)) {
            target.textContent = 'Could not load records: ' + (error?.message || 'No student record returned.');
            return;
        }
        if (kind === 'clearance') {
            deanClearanceRows = data.clearances || [];
            renderDeanClearances();
            return;
        }
        target.innerHTML = window.renderDeanRecordDetails({ record: data, formatDate: fmtDate, formatGrade: Grading.formatGrade });
    }
    for (const kind of ['record', 'clearance']) {
        getEl(kind + 'Search').addEventListener('input', () => renderStudentPicker(kind));
        getEl(kind + 'CourseFilter')?.addEventListener('change', () => renderStudentPicker(kind));
        getEl(kind + 'YearFilter')?.addEventListener('change', () => renderStudentPicker(kind));
        getEl(kind + 'Students').addEventListener('click', event => {
            const id = event.target.closest('[data-student]')?.dataset.student;
            if (id) loadStudentRecord(kind, id);
        });
    }
    getEl('clearanceDetails').addEventListener('submit', async event => {
        const form = event.target;
        const id = form.dataset.clearanceNote;
        if (!id) return;
        event.preventDefault();
        const studentId = selectedRecord.clearance;
        const row = deanClearanceRows.find(item => String(item.id) === id && item.department_code === 'dean');
        if (window.IMCC_DEVELOPER_VIEW || !studentId || !row || row.status === 'cleared' || pendingDeanClearances.has(id)) return;
        pendingDeanClearances.add(id);
        const fields = form.querySelector('fieldset');
        fields.disabled = true;
        let saved = false;
        try {
            const note = await window.saveClearanceNote(supabaseClient, { ...row, student_id: studentId }, form.elements.note.value);
            const current = deanClearanceRows.find(item => String(item.id) === id);
            if (selectedRecord.clearance === studentId && current) current.note = note;
            saved = true;
            showToast('Clearance note saved.');
        } catch (error) {
            showToast('Could not save clearance note: ' + error.message, true);
        } finally {
            pendingDeanClearances.delete(id);
            fields.disabled = false;
            if ((saved || !form.isConnected) && selectedRecord.clearance === studentId && deanClearanceRows.some(item => String(item.id) === id)) renderDeanClearances();
        }
    });
    getEl('clearanceDetails').addEventListener('click', async event => {
        const button = event.target.closest('button[data-clearance-id]');
        const studentId = selectedRecord.clearance;
        if (!button || button.disabled || !studentId) return;
        const id = button.dataset.clearanceId;
        const row = deanClearanceRows.find(item => String(item.id) === id && item.department_code === 'dean');
        if (window.IMCC_DEVELOPER_VIEW || !row || row.status === 'cleared' || pendingDeanClearances.has(id)) return;
        const studentName = state.profiles.find(profile => String(profile.id) === String(studentId))?.full_name || 'this student';
        if (!window.confirm('Do you want to clear the College Dean requirement for ' + studentName + '?')) return;
        pendingDeanClearances.add(id);
        button.disabled = true;
        try {
            const update = supabaseClient.from('clearances')
                .update({ status: 'cleared', cleared_at: new Date().toISOString() })
                .eq('id', id).eq('student_id', studentId).eq('department_code', 'dean');
            const reviewedStatus = row.status == null ? update.is('status', null) : update.eq('status', row.status);
            const { data, error } = await reviewedStatus.select('id').maybeSingle();
            if (error) throw error;
            if (String(data?.id) !== id) throw new Error('No clearance was changed. Refresh and retry.');
        } catch (error) {
            showToast('Could not approve clearance: ' + error.message, true);
            return;
        } finally {
            pendingDeanClearances.delete(id);
            button.disabled = false;
            if (!button.isConnected && deanClearanceRows.some(item => String(item.id) === id)) renderDeanClearances();
        }
        showToast('College Dean clearance approved.');
        if (selectedRecord.clearance === studentId) await loadStudentRecord('clearance', studentId);
    });

    // ══════════════════════════════════════════════════════════════════
    // PROFILE
    // ══════════════════════════════════════════════════════════════════
    function renderProfile() {
        const p = currentProfile;
        const rows = [
            ['Full Name', p.full_name],
            ['Email', p.email],
            ['ID Number', p.id_number],
            ['Department / Program', p.program],
            ['Role', 'Dean'],
        ];
        getEl('profileFields').innerHTML = rows.map(([label, value]) => `
      <div style="padding:12px 0;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:12px;">
        <span style="color:var(--ink-500);font-size:13px;">${escapeHtml(label)}</span>
        <span style="font-weight:700;font-size:13.5px;">${escapeHtml(value || '—')}</span>
      </div>
    `).join('');
    }

    // ══════════════════════════════════════════════════════════════════
    // MY CLASSES — grade entry for courses the dean personally handles
    // (identical mechanics to faculty-dashboard.js, scoped to this account)
    // ══════════════════════════════════════════════════════════════════
    let myOfferings = [];
    let selectedMyOffering = null;
    let myRoster = [];

    // Grade helpers — delegated to shared/grading.js
    const gradingWorkspace = Grading.initWorkspace();

    let deanCourseScope = 'my';
    let classListVersion = 0;
    let rosterVersion = 0;
    let historyVersion = 0;
    let revertingGrade = false;

    getEl('deanScopeMyBtn')?.addEventListener('click', () => {
        if (!gradingWorkspace.canLeave()) return;
        gradingWorkspace.markClean();
        deanCourseScope = 'my';
        if (getEl('deanScopeMyBtn')) getEl('deanScopeMyBtn').className = 'btn btn-primary';
        if (getEl('deanScopeAllBtn')) getEl('deanScopeAllBtn').className = 'btn btn-ghost';
        loadMyClasses();
    });

    getEl('deanScopeAllBtn')?.addEventListener('click', () => {
        if (!gradingWorkspace.canLeave()) return;
        gradingWorkspace.markClean();
        deanCourseScope = 'all';
        if (getEl('deanScopeMyBtn')) getEl('deanScopeMyBtn').className = 'btn btn-ghost';
        if (getEl('deanScopeAllBtn')) getEl('deanScopeAllBtn').className = 'btn btn-primary';
        loadMyClasses();
    });

    function resetMyRoster() {
        ++rosterVersion;
        closeDeanGradeHistory();
        selectedMyOffering = null;
        myRoster = [];
        getEl('deanClassAuditLogBtn').style.display = 'none';
    }

    async function loadMyClasses(autoSelectId = null) {
        if (!gradingWorkspace.canLeave()) return;
        const version = ++classListVersion;
        const targetId = autoSelectId ?? selectedMyOffering?.id;
        const offerings = state.offerings || [];
        let nextOfferings = deanCourseScope === 'all' ? offerings.slice() : offerings.filter(o =>
            (o.instructor_id && o.instructor_id === currentUserId) ||
            (o.instructor_name && currentProfile && o.instructor_name === currentProfile.full_name)
        );

        if (deanCourseScope === 'my' && !nextOfferings.length) {
            resetMyRoster();
            myOfferings = [];
            getEl('myCourseList').replaceChildren();
            gradingWorkspace.startClass('');
            getEl('selectedMyCourseTitle').textContent = 'Select a class';
            getEl('selectedMyCourseSub').textContent = '';
            const { data: taRows } = await supabaseClient.from('teacher_assignments')
                .select('offering_id, course_offerings(*)').eq('teacher_id', currentUserId).eq('is_active', true);
            if (version !== classListVersion) return;
            nextOfferings = (taRows || []).map(t => t.course_offerings).filter(Boolean);
        }

        myOfferings = nextOfferings.sort((a, b) => (b.school_year || '').localeCompare(a.school_year || ''));
        renderMyCourseList(targetId);
    }

    function renderMyCourseList(autoSelectId = null) {
        const visibleOfferings = gradingWorkspace.setCourses(myOfferings, selectedMyOffering?.id, renderMyCourseList);
        const wrap = getEl('myCourseList');
        const msg = getEl('noMyCoursesMsg');
        if (!visibleOfferings.length) {
            resetMyRoster();
            if (wrap) wrap.innerHTML = '';
            if (msg) { msg.style.display = 'block'; msg.textContent = deanCourseScope === 'my' ? 'No classes assigned. Switch to All Classes, or assign yourself under Faculty & Schedule.' : 'No course offerings found.'; }
            if (getEl('selectedMyCourseTitle')) getEl('selectedMyCourseTitle').textContent = 'Select a class';
            if (getEl('selectedMyCourseSub')) getEl('selectedMyCourseSub').textContent = '';
            if (getEl('saveMyGradesBtn')) getEl('saveMyGradesBtn').disabled = true;
            if (getEl('deanClassAuditLogBtn')) getEl('deanClassAuditLogBtn').style.display = 'none';
            if (getEl('myRosterTable')) getEl('myRosterTable').style.display = 'none';
            if (getEl('noMyRosterMsg')) {
                getEl('noMyRosterMsg').style.display = 'block';
                getEl('noMyRosterMsg').textContent = deanCourseScope === 'my' ? 'No course offerings are assigned to you yet.' : 'No course offerings found.';
            }
            return;
        }
        if (msg) msg.style.display = 'none';

        wrap.innerHTML = visibleOfferings.map(o => `
      <button type="button" class="nav-item dean-course-item" style="border:1px solid var(--line);margin-bottom:8px;width:100%;text-align:left;display:block;padding:10px 14px;" data-id="${o.id}">
        <div style="font-weight:800;font-size:13.5px;">${escapeHtml(o.code || '—')}</div>
        <div style="font-size:12px;color:var(--ink-500);font-weight:500;">${escapeHtml(o.title || '—')}</div>
        <div style="font-size:11px;color:var(--ink-300);margin-top:4px;">${escapeHtml(o.schedule || 'Schedule TBA')} · ${escapeHtml(o.semester || '')} ${escapeHtml(o.school_year || '')}</div>
        ${deanCourseScope === 'all' ? `<div style="font-size:11px;color:var(--pink-600);font-weight:600;margin-top:4px;">👨‍🏫 ${escapeHtml(o.instructor_name || 'Unassigned')}</div>` : ''}
      </button>
    `).join('');

        document.querySelectorAll('#myCourseList .nav-item').forEach(btn => {
            btn.addEventListener('click', () => selectMyCourse(btn.dataset.id, btn));
        });

        // Automatically select target course or first course so it displays immediately!
        const targetId = autoSelectId || (selectedMyOffering ? selectedMyOffering.id : visibleOfferings[0]?.id);
        const targetBtn = document.querySelector(`#myCourseList .nav-item[data-id="${targetId}"]`) || document.querySelector('#myCourseList .nav-item');
        if (targetBtn) {
            selectMyCourse(targetBtn.dataset.id, targetBtn);
        }
    }

    async function selectMyCourse(offeringId, btnEl) {
        if (!gradingWorkspace.canLeave()) return;
        resetMyRoster();
        const version = rosterVersion;
        gradingWorkspace.startClass(offeringId);
        document.querySelectorAll('#myCourseList .nav-item').forEach(b => b.classList.remove('active'));
        if (btnEl) btnEl.classList.add('active');

        selectedMyOffering = myOfferings.find(o => String(o.id) === String(offeringId));
        if (!selectedMyOffering) return;
        selectedMyOffering.canEditGrades = false;

        getEl('selectedMyCourseTitle').textContent = `${selectedMyOffering.code} — ${selectedMyOffering.title}`;
        getEl('selectedMyCourseSub').textContent = `Section ${selectedMyOffering.section || '—'} · ${selectedMyOffering.semester || ''} ${selectedMyOffering.school_year || ''} · ${selectedMyOffering.schedule || 'Schedule TBA'}${selectedMyOffering.instructor_name ? ` · Instructor: ${selectedMyOffering.instructor_name}` : ''}`;
        getEl('saveMyGradesBtn').disabled = true;

        const [{ data: enrollments, error: rosterError }, { data: existingGrades, error: gradesError }, { data: offeringState, error: offeringError }, assignment] = await Promise.all([
            supabaseClient.rpc('get_class_roster', { p_offering_id: Number(offeringId) }),
            supabaseClient.from('grades').select('*').eq('offering_id', offeringId),
            supabaseClient.from('course_offerings').select('grades_locked').eq('id', offeringId).single(),
            currentProfile.role === 'admin' ? Promise.resolve({ data: [true] }) : supabaseClient.from('teacher_assignments').select('offering_id').eq('teacher_id', currentUserId).eq('offering_id', offeringId).eq('is_active', true).limit(1),
        ]);

        if (version !== rosterVersion) return;
        if (gradesError || offeringError) { renderMyRoster(); showToast('Could not load grades or finalization status. Please retry.', true); return; }
        selectedMyOffering.grades_locked = offeringState?.grades_locked === true;
        selectedMyOffering.canEditGrades = !assignment.error && assignment.data?.length > 0;
        gradingWorkspace.setReadOnly(!selectedMyOffering.canEditGrades);
        if (assignment.error) showToast('Could not verify teaching assignment. Class is read-only; retry to edit.', true);
        gradingWorkspace.setLocked(selectedMyOffering.grades_locked);
        if (rosterError) { renderMyRoster(); showToast('Could not load class roster: ' + rosterError.message, true); return; }

        const gradeByStudent = {};
        (existingGrades || []).forEach(g => { gradeByStudent[g.student_id] = g; });

        myRoster = (enrollments || [])
            .map(e => {
                const g = gradeByStudent[e.student_id];
                return {
                    student: e.profiles, gradeId: g?.id || null, savedGrade: g || null, grade_scale: g ? (g.grade_scale || 'percentage') : 'school', equivalent: g?.equivalent == null ? null : Number(g.equivalent), remark: g?.remark,
                    prelim: g?.prelim ?? null, midterm: g?.midterm ?? null,
                    semifinal: g?.semifinal ?? null, final: g?.final ?? null,
                };
            })
            .filter(r => r.student)
            .sort((a, b) => (a.student.full_name || '').localeCompare(b.student.full_name || ''));

        renderMyRoster();
        gradingWorkspace.markClean();
        gradingWorkspace.refresh();
        if (getEl('deanClassAuditLogBtn')) getEl('deanClassAuditLogBtn').style.display = myRoster.length > 0 ? 'inline-flex' : 'none';
    }

    function renderMyRoster() {
        const table = getEl('myRosterTable');
        const body = getEl('myRosterBody');
        const msg = getEl('noMyRosterMsg');
        gradingWorkspace.setRosterCount(myRoster.length);

        if (!myRoster.length) {
            table.style.display = 'none';
            msg.style.display = 'block';
            msg.textContent = 'No students are enrolled in this class yet.';
            if (getEl('deanClassAuditLogBtn')) getEl('deanClassAuditLogBtn').style.display = 'none';
            return;
        }
        msg.style.display = 'none';
        table.style.display = 'table';
        if (getEl('deanClassAuditLogBtn')) getEl('deanClassAuditLogBtn').style.display = 'inline-flex';

        const readOnly = !!(window.IMCC_DEVELOPER_VIEW || !selectedMyOffering?.canEditGrades || selectedMyOffering.grades_locked);
        body.innerHTML = window.renderDeanGradeRows({
            rows: myRoster.map(row => ({ ...row, draftRemark: row.final == null || row.equivalent == null ? 'Pending' : Grading.computeRemark(row) })),
            readOnly,
        });

        body.querySelectorAll('input[data-grade-field]').forEach(input => {
            input.addEventListener('input', (e) => {
                const idx = Number(e.target.dataset.idx);
                const val = e.target.value === '' ? null : Number(e.target.value);
                const field = e.target.dataset.gradeField;
                myRoster[idx][field] = val;
                document.querySelector(`.my-remark-cell[data-idx="${idx}"]`).innerHTML = previewMyRemarkBadge(myRoster[idx]);
            });
        });

        document.querySelectorAll('.dean-grade-hist-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = Number(btn.dataset.idx);
                if (myRoster[idx]) openDeanGradeHistory(myRoster[idx]);
            });
        });
    }

    document.querySelector('.lock-grades-btn').addEventListener('click', async () => {
        if (!selectedMyOffering || !gradingWorkspace.canFinalize()) return;
        if (!confirm('Lock all grades for this class? Normal grade entry and history reverts will be disabled.')) return;
        const button = document.querySelector('.lock-grades-btn');
        gradingWorkspace.setSaving(true);
        button.disabled = true;
        try {
            const { error } = await supabaseClient.rpc('lock_class_grades', { p_offering_id: Number(selectedMyOffering.id) });
            if (error) throw error;
            selectedMyOffering.grades_locked = true;
            gradingWorkspace.setLocked(true);
            renderMyRoster();
            gradingWorkspace.markClean();
            showToast('Grades finalized and locked.');
        } catch (error) { showToast('Could not lock grades: ' + error.message, true); }
        finally { gradingWorkspace.setSaving(false); }
    });

    // Grade preview — delegated to shared/grading.js
    const previewMyRemarkBadge = Grading.previewRemarkBadge;

    getEl('saveMyGradesBtn').addEventListener('click', async () => {
        if (!selectedMyOffering?.canEditGrades || !myRoster.length) return;
        const btn = getEl('saveMyGradesBtn');
        if (!gradingWorkspace.validate()) return;
        gradingWorkspace.setSaving(true);
        btn.disabled = true;
        btn.textContent = 'Saving…';

        let successCount = 0, failCount = 0;

        try {
            for (const r of myRoster) {
                if (r.grade_scale === 'percentage' || selectedMyOffering?.grades_locked) continue;
                const { data, error, skipped } = await Grading.saveGrade(supabaseClient, r, selectedMyOffering.id);
                if (skipped) continue;
                if (error || !data) { failCount++; showToast(`${r.student.full_name || 'Student'}: ${error?.message || 'Save failed'}`, true); }
                else { Object.assign(r, data, { gradeId: data.id, savedGrade: data }); successCount++; }
            }

        } catch (error) {
            failCount++;
            showToast('Could not save grades: ' + error.message, true);
        } finally {
            gradingWorkspace.setSaving(false);
        }
        if (successCount) renderMyRoster();
        if (failCount === 0) gradingWorkspace.markClean();
        else gradingWorkspace.saveFailed();
        btn.textContent = 'Save Grades';

        if (failCount === 0) showToast(`Saved grades for ${successCount} student${successCount === 1 ? '' : 's'}.`);
        else showToast(`Saved ${successCount}, failed ${failCount}. Changes kept; reload the class to resolve conflicts.`, true);

        // Keep department-wide analytics (avg GWA, pass/fail bars, flagged courses) in sync.
        const { data: gradeRows, error: refreshError } = await IMCC.fetchAll(() => supabaseClient.from('grades').select('*, course_offerings(code, title, units, program, instructor_name)'));
        if (refreshError) { showToast('Grades saved, but reports could not refresh. Displayed reports may be outdated.', true); return; }
        state.grades = gradeRows;
        renderOverview();
    });

    // ── Dean Grade History & Revert System ───────────────────────────────
    function closeDeanGradeHistory() {
        ++historyVersion;
        getEl('gradeHistoryModal').close();
    }

    async function openDeanGradeHistory(studentRow = null) {
        const offering = selectedMyOffering;
        if (!offering) return;
        const version = ++historyVersion;
        const modal = getEl('gradeHistoryModal');
        const body = getEl('gradeHistoryBody');
        const noMsg = getEl('noGradeHistoryMsg');
        const student = studentRow?.student;
        getEl('gradeHistoryModalTitle').textContent = student
            ? 'Grade History — ' + (student.full_name || 'Student')
            : 'Class Grade Audit Log — ' + offering.code;
        getEl('gradeHistoryModalSub').textContent = student
            ? offering.code + ': ' + offering.title + ' · Student No: ' + (student.student_no || student.id_number || 'N/A')
            : offering.title + ' · ' + (offering.semester || '') + ' ' + (offering.school_year || '');
        getEl('gradeHistoryCurrentBox').innerHTML = window.renderDeanHistorySummary({
            student: !!student, saved: studentRow?.savedGrade, count: myRoster.length,
        });
        getEl('gradeHistoryStudentHeader').hidden = !!student;
        body.innerHTML = window.renderDeanHistoryMessage({ message: 'Loading revision history…', student: !!student });
        noMsg.hidden = true;
        if (!modal.open) modal.showModal();

        let query = supabaseClient.from('v_grade_history').select('*').eq('offering_id', offering.id);
        if (student) query = query.eq('student_id', student.id);
        const { data, error } = await query.order('created_at', { ascending: false });
        if (version !== historyVersion || !modal.open || selectedMyOffering !== offering) return;

        if (error) {
            body.innerHTML = window.renderDeanHistoryMessage({ message: 'Failed to load history: ' + error.message, student: !!student });
            return;
        }
        const rows = data || [];
        noMsg.hidden = rows.length !== 0;
        body.innerHTML = window.renderDeanHistoryRows({
            rows, student: !!student, readOnly: !!(offering.grades_locked || !offering.canEditGrades || window.IMCC_DEVELOPER_VIEW),
        });
        body.querySelectorAll('.revert-btn').forEach(button => {
            button.addEventListener('click', () => {
                const revision = rows.find(row => String(row.id) === button.dataset.histId);
                if (!revision || version !== historyVersion || !modal.open || button.disabled) return;
                executeDeanRevert(revision, studentRow || myRoster.find(row => row.student.id === revision.student_id));
            });
        });
    }

    async function executeDeanRevert(histEntry, studentRosterItem) {
        if (revertingGrade || !gradingWorkspace.canLeave()) return;
        const version = historyVersion;
        const request = rosterVersion;
        const offering = selectedMyOffering;
        let reverted = false;
        revertingGrade = true;
        gradingWorkspace.setSaving(true);
        try {
            await Grading.executeRevert({
                supabaseClient,
                histEntry,
                studentRosterItem,
                locked: offering?.grades_locked,
                readOnly: window.IMCC_DEVELOPER_VIEW || !offering?.canEditGrades,
                roleLabel: '(Dean Oversight)',
                showToast,
                onDone() { reverted = true; },
            });
        } catch (error) {
            showToast('Could not revert grade: ' + error.message, true);
        } finally {
            revertingGrade = false;
            gradingWorkspace.setSaving(false);
        }
        if (!reverted) return;
        if (request === rosterVersion) {
            if (studentRosterItem) {
                renderMyRoster();
                gradingWorkspace.markClean();
                if (version === historyVersion && getEl('gradeHistoryModal').open) openDeanGradeHistory(studentRosterItem);
            } else {
                selectMyCourse(offering.id);
            }
        }
        showToast('Grade successfully reverted!');
        const { data: gradeRows, error } = await IMCC.fetchAll(() => supabaseClient.from('grades').select('*, course_offerings(code, title, units, program, instructor_name)'));
        if (error) { showToast('Grade reverted, but reports could not refresh. Displayed reports may be outdated.', true); return; }
        state.grades = gradeRows;
        renderOverview();
    }

    getEl('gradeHistoryModal').addEventListener('cancel', event => {
        event.preventDefault();
        closeDeanGradeHistory();
    });
    getEl('gradeHistoryCloseBtn')?.addEventListener('click', closeDeanGradeHistory);
    getEl('gradeHistoryDoneBtn')?.addEventListener('click', closeDeanGradeHistory);
    getEl('deanClassAuditLogBtn')?.addEventListener('click', () => openDeanGradeHistory());

    getEl('deanAddClassBtn')?.addEventListener('click', () => {
        openModal();
    });

    // ══════════════════════════════════════════════════════════════════
    // COURSE OFFERING FORM
    // ══════════════════════════════════════════════════════════════════
    let offeringModalOpen = false;
    let editingOfferingId = null;
    let modalVersion = 0;

    document.querySelector('[data-modal="courseOffering"]').addEventListener('click', () => openModal());

    // An unavailable instructor list must still allow saving an unassigned subject.
    function renderInstructorDropdown(existingInstructorId = null, existingInstructorName = null) {
        const wrapper = getEl('instructorSelectWrapper');
        if (!wrapper) return;
        wrapper.innerHTML = window.renderDeanInstructorField({
            options: state.instructorOptions || [], selectedId: existingInstructorId, selectedName: existingInstructorName,
            currentUserId, loading: state.instructorOptions === null, error: !!state.instructorOptionsError,
        });
        getEl('retryInstructorLoad')?.addEventListener('click', event => {
            event.currentTarget.disabled = true;
            refreshInstructorDropdown(true, existingInstructorId, existingInstructorName);
        });
    }

    async function refreshInstructorDropdown(force, existingInstructorId, existingInstructorName) {
        const version = modalVersion;
        await loadInstructorOptions(force);
        if (version !== modalVersion) return;

        const select = getEl('field_instructor_id');
        const selectedId = select?.value ?? existingInstructorId;
        const selectedName = selectedId === existingInstructorId ? existingInstructorName : select?.selectedOptions[0]?.textContent;
        renderInstructorDropdown(selectedId, selectedName);
    }

    function openModal(initialValues = null) {
        ++modalVersion;
        offeringModalOpen = true;
        editingOfferingId = initialValues?.id ?? null;
        getEl('modalTitle').textContent = editingOfferingId ? 'Edit Subject / Course Offering' : 'Add Subject / Course Offering';
        getEl('modalSaveBtn').disabled = false;
        getEl('modalSaveBtn').textContent = editingOfferingId ? 'Save changes' : 'Add course offering';
        const form = getEl('modalForm');
        form.innerHTML = window.renderDeanOfferingFields({ initial: initialValues, courses: state.courses });

        const codeInput = getEl('field_code');
        const search = getEl('field_catalog_search');
        const catalogSelect = getEl('field_catalog_course');
        const insights = window.imccSubjectPicker(catalogSelect, search, state.courses, form);

        const existingInstructorId = (initialValues && initialValues.instructor_id) ? initialValues.instructor_id : null;
        const existingInstructorName = (initialValues && initialValues.instructor_name) ? initialValues.instructor_name : null;

        // Show whatever we have immediately (may be loading state, legacy state, or eligible).
        renderInstructorDropdown(existingInstructorId, existingInstructorName);

        // If the RPC hasn't resolved yet, kick off the load and refresh the dropdown when done.
        if (state.instructorOptions === null) {
            refreshInstructorDropdown(false, existingInstructorId, existingInstructorName);
        } else if (!state.instructorOptions.length && !state.instructorOptionsError) {
            // We have a stale empty result — re-fetch once to be sure.
            refreshInstructorDropdown(true, existingInstructorId, existingInstructorName);
        }

        // Add datalist for codeInput
        if (codeInput && state.courses && state.courses.length) {
            let dl = getEl('deanCurriculumDatalist');
            if (!dl) {
                dl = document.createElement('datalist');
                dl.id = 'deanCurriculumDatalist';
                document.body.appendChild(dl);
            }
            dl.innerHTML = state.courses.map(c => `<option value="${escapeHtml(c.code)}">${escapeHtml(c.title)}</option>`).join('');
            codeInput.setAttribute('list', 'deanCurriculumDatalist');
            codeInput.setAttribute('autocomplete', 'off');
        }

        const applyCourse = (c) => {
            if (!c) return;
            insights.textContent = [c.code + ' — ' + c.title, 'Year ' + (c.year_level || '—'), c.semester === 3 ? 'Summer' : c.semester === 2 ? '2nd Semester' : '1st Semester', ((c.lec_units || 0) + (c.lab_units || 0) || c.units || 3) + ' units', 'Prerequisites: ' + (c.prerequisites || 'None')].join(' · ');
            const units = (c.lec_units || 0) + (c.lab_units || 0) || c.units || 3.0;
            const semStr = c.semester === 2 ? '2nd Semester' : (c.semester === 3 ? 'Summer' : '1st Semester');
            if (getEl('field_code')) getEl('field_code').value = c.code || '';
            if (getEl('field_title')) getEl('field_title').value = c.title || '';
            if (getEl('field_units')) getEl('field_units').value = units;
            if (getEl('field_program')) getEl('field_program').value = c.program || 'BSIT';
            if (getEl('field_year') && c.year_level) getEl('field_year').value = String(c.year_level);
            if (getEl('field_semester')) getEl('field_semester').value = semStr;
            if (catalogSelect) catalogSelect.value = c.code || '';
        };

        catalogSelect?.addEventListener('change', (e) => {
            const val = (e.target.value || '').trim().toLowerCase();
            const matched = state.courses.find(c => c.code.toLowerCase() === val);
            if (matched) applyCourse(matched);
        });

        codeInput?.addEventListener('input', (e) => {
            const rawVal = (e.target.value || '').trim();
            const normalized = rawVal.replace(/\s+/g, '').toLowerCase();
            if (!normalized) return;
            const matched = state.courses.find(c =>
                c.code.toLowerCase() === rawVal.toLowerCase() ||
                c.code.replace(/\s+/g, '').toLowerCase() === normalized
            );
            if (matched) applyCourse(matched);
        });

        const modal = getEl('modalOverlay');
        modal.classList.add('open');
        if (!modal.open) modal.showModal();
        search.focus();
    }

    function closeModal() {
        ++modalVersion;
        const modal = getEl('modalOverlay');
        modal.close();
        modal.classList.remove('open');
        offeringModalOpen = false;
        editingOfferingId = null;
    }
    getEl('modalCancelBtn').addEventListener('click', closeModal);
    getEl('modalOverlay').addEventListener('cancel', event => { event.preventDefault(); closeModal(); });
    getEl('modalOverlay').addEventListener('click', (e) => { if (e.target.id === 'modalOverlay') closeModal(); });

    getEl('modalSaveBtn').addEventListener('click', async () => {
        const saveBtn = getEl('modalSaveBtn');
        if (!offeringModalOpen || saveBtn.disabled) return;
        const offeringId = editingOfferingId;
        const version = modalVersion;
        const values = {};
        for (const field of window.deanOfferingFields) {
            const input = getEl('field_' + field.name);
            const value = input.value.trim();
            if (field.required && !value) {
                showToast(field.label + ' is required.', true);
                const details = input.closest('details');
                if (details) details.open = true;
                input.focus();
                return;
            }
            if (field.type === 'number' && (!Number.isFinite(Number(value)) || Number(value) <= 0)) {
                showToast(field.label + ' must be a positive number.', true);
                const details = input.closest('details');
                if (details) details.open = true;
                input.focus();
                return;
            }
            values[field.name] = field.type === 'number' ? Number(value) : value || null;
        }

        const selectedInstructorId = getEl('field_instructor_id')?.value.trim() || '';
        const instructor = (state.instructorOptions || []).find(person => String(person.id) === selectedInstructorId);
        if (selectedInstructorId && !instructor) {
            showToast('Choose an approved active instructor or leave the subject unassigned.', true);
            return;
        }
        values.instructor_id = instructor?.id || null;
        values.instructor_name = instructor?.full_name || null;
        values.year = Number(values.year) || 1;

        const originalBtnText = saveBtn.textContent;
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving…';
        let savedRow;
        try {
            let { data, error } = await supabaseClient.rpc('save_course_offering_with_instructor', {
                p_offering_id: offeringId ? Number(offeringId) : null,
                p_code: values.code, p_title: values.title, p_units: values.units, p_program: values.program,
                p_year: values.year, p_semester: values.semester, p_school_year: values.school_year,
                p_schedule: values.schedule, p_instructor_id: values.instructor_id,
            });
            const isRpcMissing = error?.code === 'PGRST202' ||
                (error?.message?.includes('function') && error.message.includes('does not exist'));
            if (isRpcMissing) {
                console.warn('save_course_offering_with_instructor RPC not found, falling back to trigger-synchronized offering write:', error.message);
                const table = supabaseClient.from('course_offerings');
                const write = offeringId ? table.update(values).eq('id', offeringId) : table.insert(values);
                ({ data, error } = await write.select().single());
            }
            if (error) throw error;
            if (!data?.id) throw new Error('No subject offering was saved.');
            savedRow = data;
        } catch (error) {
            showToast('Failed to save offering: ' + (error.message || 'Database error'), true);
            return;
        } finally {
            if (version === modalVersion) {
                saveBtn.disabled = false;
                saveBtn.textContent = originalBtnText;
            }
        }

        showToast(offeringId ? 'Updated successfully.' : 'Saved successfully.');
        if (version === modalVersion) closeModal();
        const { data: offerings, error } = await IMCC.fetchAll(() => supabaseClient.from('course_offerings').select('*'));
        if (error) { showToast('Subject saved, but the list could not refresh. Reload to retry.', true); return; }
        state.offerings = offerings;
        renderFacultyPage();
        await loadMyClasses(savedRow.id);
    });

    // ── Quick Links (SSO) — delegated to FC ──
    async function loadSSOLinks() {
        await FC.loadSSOLinks(supabaseClient, currentProfile?.role || 'dean');
    }

    // ── Logout ──────────────────────────────────────────────────────────
    getEl('signOutBtn').addEventListener('click', async () => {
        await supabaseClient.auth.signOut();
        window.location.href = '../auth/login.html';
    });

    // ── Init ────────────────────────────────────────────────────────────
    const ok = await checkDeanAuth();
    if (!ok) return;

    try { await loadAllData(); }
    catch (error) {
        if (window.imccHidePreloader) window.imccHidePreloader();
        getEl('pageTitle').textContent = 'Dashboard unavailable';
        const notice = document.createElement('p');
        notice.setAttribute('role', 'alert');
        notice.textContent = 'Could not load dashboard data. Reload to retry. Reports are unavailable.';
        getEl('page-dashboard').replaceChildren(notice);
        showToast('Could not load dashboard: ' + error.message, true);
        return;
    }
    await loadSSOLinks();
    getEl('refreshEnrollmentNotifications').addEventListener('click', () => FC.loadEnrollmentNotifications(supabaseClient));
    await FC.loadEnrollmentNotifications(supabaseClient);
    renderOverview();
    renderFacultyPage();
    await loadMyClasses();
    renderStudentPicker('clearance');
    renderStudentPicker('record');

    if (window.imccHidePreloader) window.imccHidePreloader();
})();
