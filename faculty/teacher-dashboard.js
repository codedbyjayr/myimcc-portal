// faculty-dashboard.js
document.addEventListener('DOMContentLoaded', async () => {
    let supabaseClient;
    try {
        supabaseClient = await getSupabaseClientAsync();
    } catch (e) {
        console.error('Failed to init Supabase', e);
        return;
    }

    // ── Helpers — delegated to shared/faculty-chrome.js (FC) & shared/grading.js (Grading) ──
    const getEl = FC.getEl;
    const escapeHtml = FC.escapeHtml;
    const fmtDate = FC.fmtDate;
    const showToast = FC.showToast;
    const isMissingTableError = FC.isMissingTableError;
    const gradingWorkspace = Grading.initWorkspace();

    // ── State ───────────────────────────────────────────────────────────
    let currentUser = null;
    let currentProfile = null;
    let offerings = [];
    let selectedOffering = null;
    let roster = [];
    let darkMode = false;

    // ── Mobile Navigation — delegated to FC ──
    FC.initMobileNav();

    // ── Navigation — delegated to FC ──
    const goto = FC.initNavigation({
        dashboard: 'Dashboard',
        classes: 'My Classes',
        attendance: 'Attendance',
        announcements: 'Announcements',
        evaluations: 'Student Evaluations',
        profile: 'My Profile',
    }, function (page) {
        if (page === 'attendance') initAttendancePage();
        if (page === 'announcements') initAnnouncementsPage();
        if (page === 'evaluations') loadTeacherEvaluations();
        if (page === 'profile') renderProfile();
    });

    // ── Dropdown + theme — delegated to FC ──
    FC.setupDropdown('userBtn', 'userDropdown');
    FC.initThemeToggle();

    // ── Auth ────────────────────────────────────────────────────────────
    async function checkFacultyAuth() {
        const session = await initAuthGuard(['teacher', 'faculty', 'dean', 'admin']);
        if (!session) return false;
        currentUser = session.user;
        currentProfile = session.profile;
        FC.setSidebarProfile(currentProfile, session.user.email);
        return true;
    }

    // ── Dashboard stats ───────────────────────────────────────────────────

    async function loadDashboardStats() {
        const term = getEl('page-classes').querySelector('.grading-term-select').value;
        const year = getEl('page-classes').querySelector('.grading-year-select').value;
        const termOfferings = offerings.filter(o => IMCC.termKey(o) === term && (!year || String(o.year) === year));
        if (!termOfferings.length) {
            getEl('stat-classes').textContent = '0';
            getEl('stat-students').textContent = '0';
            getEl('stat-pending').textContent = '0';
            return;
        }
        const offeringIds = termOfferings.map(o => o.id);

        const [{ data: enrollments }, { data: gradeRows }] = await Promise.all([
            supabaseClient.from('enrollments').select('student_id, offering_id').in('offering_id', offeringIds).eq('status', 'enrolled'),
            supabaseClient.from('grades').select('student_id, offering_id, final').in('offering_id', offeringIds),
        ]);
        if (term !== getEl('page-classes').querySelector('.grading-term-select').value || year !== getEl('page-classes').querySelector('.grading-year-select').value) return;

        const uniqueStudents = new Set((enrollments || []).map(e => e.student_id));
        const gradedSet = new Set((gradeRows || []).filter(g => g.final !== null && g.final !== undefined).map(g => `${g.student_id}|${g.offering_id}`));
        const pending = (enrollments || []).filter(e => !gradedSet.has(`${e.student_id}|${e.offering_id}`)).length;

        getEl('stat-classes').textContent = termOfferings.length;
        getEl('stat-students').textContent = uniqueStudents.size;
        getEl('stat-pending').textContent = pending;
    }

    // ── Load assigned course offerings ───────────────────────────────────
    async function loadMyCourses() {
        let { data, error } = await supabaseClient
            .from('course_offerings')
            .select('*')
            .eq('instructor_id', currentUser.id);

        if (error || !data || data.length === 0) {
            // Fall back to name matching (handles missing instructor_id column too).
            ({ data, error } = await supabaseClient
                .from('course_offerings')
                .select('*')
                .eq('instructor_name', currentProfile.full_name));
        }

        if (!data || data.length === 0) {
            // Fall back to teacher_assignments table
            const { data: taRows } = await supabaseClient
                .from('teacher_assignments')
                .select('offering_id, course_offerings(*)')
                .eq('teacher_id', currentUser.id)
                .eq('is_active', true);
            if (taRows && taRows.length > 0) {
                data = taRows.map(t => t.course_offerings).filter(Boolean);
            }
        }

        if (error) { showToast('Failed to load your classes: ' + error.message, true); return; }

        offerings = (data || []).sort((a, b) => (b.school_year || '').localeCompare(a.school_year || ''));
        renderCourseList();
        await loadDashboardStats();
    }

    function renderCourseList() {
        const visibleOfferings = gradingWorkspace.setCourses(offerings, selectedOffering?.id, () => { renderCourseList(); loadDashboardStats(); });
        const wrap = getEl('courseList');
        const msg = getEl('noCoursesMsg');
        if (!visibleOfferings.length) { wrap.innerHTML = ''; msg.style.display = 'block'; return; }
        msg.style.display = 'none';

        wrap.innerHTML = visibleOfferings.map(o => `
      <button type="button" class="nav-item" style="border:1px solid var(--line);margin-bottom:8px;" data-id="${o.id}">
        <div style="text-align:left;">
          <div style="font-weight:800;font-size:13.5px;">${escapeHtml(o.code || '—')}</div>
          <div style="font-size:12px;color:var(--ink-500);font-weight:500;">${escapeHtml(o.title || '—')}</div>
          <div style="font-size:11px;color:var(--ink-300);margin-top:4px;">${escapeHtml(o.schedule || 'Schedule TBA')} · ${escapeHtml(o.semester || '')} ${escapeHtml(o.school_year || '')}</div>
        </div>
      </button>
    `).join('');

        document.querySelectorAll('#courseList .nav-item').forEach(btn => {
            btn.addEventListener('click', () => selectCourse(btn.dataset.id, btn));
        });
    }

    // ── Roster + grade entry ─────────────────────────────────────────────
    async function selectCourse(offeringId, btnEl) {
        if (!gradingWorkspace.canLeave()) return;
        gradingWorkspace.startClass(offeringId);
        document.querySelectorAll('#courseList .nav-item').forEach(b => b.classList.remove('active'));
        if (btnEl) btnEl.classList.add('active');

        selectedOffering = offerings.find(o => String(o.id) === String(offeringId));
        if (!selectedOffering) return;

        getEl('selectedCourseTitle').textContent = `${selectedOffering.code} — ${selectedOffering.title}`;
        getEl('selectedCourseSub').textContent = `Section ${selectedOffering.section || '—'} · ${selectedOffering.semester || ''} ${selectedOffering.school_year || ''} · ${selectedOffering.schedule || 'Schedule TBA'}`;
        getEl('saveGradesBtn').disabled = true;

        const [{ data: enrollments, error: rosterError }, { data: existingGrades, error: gradesError }, { data: offeringState, error: offeringError }] = await Promise.all([
            supabaseClient.rpc('get_class_roster', { p_offering_id: Number(offeringId) }),
            supabaseClient.from('grades').select('*').eq('offering_id', offeringId),
            supabaseClient.from('course_offerings').select('grades_locked').eq('id', offeringId).single(),
        ]);

        if (String(selectedOffering?.id) !== String(offeringId)) return;
        if (gradesError || offeringError) { roster = []; renderRoster(); showToast('Could not load grades or finalization status. Please retry.', true); return; }
        selectedOffering.grades_locked = offeringState?.grades_locked === true;
        gradingWorkspace.setLocked(selectedOffering.grades_locked);
        if (rosterError) { roster = []; renderRoster(); showToast('Could not load class roster: ' + rosterError.message, true); return; }

        const gradeByStudent = {};
        (existingGrades || []).forEach(g => { gradeByStudent[g.student_id] = g; });

        roster = (enrollments || [])
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

        renderRoster();
        gradingWorkspace.markClean();
        gradingWorkspace.refresh();
        if (getEl('classAuditLogBtn')) getEl('classAuditLogBtn').style.display = roster.length > 0 ? 'inline-flex' : 'none';
    }

    function renderRoster() {
        const table = getEl('rosterTable');
        const body = getEl('rosterBody');
        const msg = getEl('noRosterMsg');
        gradingWorkspace.setRosterCount(roster.length);

        if (!roster.length) {
            table.style.display = 'none';
            msg.style.display = 'block';
            msg.textContent = 'No students are enrolled in this class yet.';
            return;
        }
        msg.style.display = 'none';
        table.style.display = 'table';

        const periodInput = (r, idx, field, cls) =>
            `<input type="number" min="1" max="${r.grade_scale === 'percentage' ? 100 : 5}" step="0.01" class="field-input ${cls}" style="width:72px;" data-idx="${idx}" ${window.IMCC_DEVELOPER_VIEW || selectedOffering?.grades_locked || r.grade_scale === 'percentage' ? 'readonly' : ''} aria-label="${escapeHtml(r.student.full_name || 'Student')} ${field} school grade" value="${r[field] ?? ''}">`;

        body.innerHTML = roster.map((r, idx) => `
      <tr data-idx="${idx}">
        <td><b>${escapeHtml(r.student.full_name || 'N/A')}</b><small class="student-number">${escapeHtml(r.student.student_no || r.student.id_number || '—')}</small></td>
        <td>${periodInput(r, idx, 'prelim', 'prelim-input')}</td>
        <td>${periodInput(r, idx, 'midterm', 'mid-input')}</td>
        <td>${periodInput(r, idx, 'semifinal', 'semifinal-input')}</td>
        <td>${periodInput(r, idx, 'final', 'final-input')}</td>
        <td>${periodInput(r, idx, 'equivalent', 'equivalent-input')}</td>
        <td class="remark-cell" data-idx="${idx}">${previewRemarkBadge(r)}</td>
        <td style="text-align:center;white-space:nowrap;">
          <button type="button" class="btn btn-ghost grade-hist-btn" data-idx="${idx}" style="padding:4px 9px;font-size:12px;display:inline-flex;align-items:center;gap:4px;" title="View history & revert">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg>
            History
          </button>
        </td>
      </tr>
    `).join('');

        const fieldByClass = { 'prelim-input': 'prelim', 'mid-input': 'midterm', 'semifinal-input': 'semifinal', 'final-input': 'final', 'equivalent-input': 'equivalent' };
        document.querySelectorAll('.prelim-input, .mid-input, .semifinal-input, .final-input, .equivalent-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const idx = Number(e.target.dataset.idx);
                const val = e.target.value === '' ? null : Number(e.target.value);
                const field = fieldByClass[[...e.target.classList].find(c => fieldByClass[c])];
                roster[idx][field] = val;
                document.querySelector(`.remark-cell[data-idx="${idx}"]`).innerHTML = previewRemarkBadge(roster[idx]);
            });
        });

        document.querySelectorAll('.grade-hist-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = Number(btn.dataset.idx);
                if (roster[idx]) openStudentGradeHistory(roster[idx]);
            });
        });
    }

    document.querySelector('.lock-grades-btn').addEventListener('click', async () => {
        if (!selectedOffering || !gradingWorkspace.canFinalize()) return;
        if (!confirm('Lock all grades for this class? Normal grade entry and history reverts will be disabled.')) return;
        const button = document.querySelector('.lock-grades-btn');
        button.disabled = true;
        try {
            const { error } = await supabaseClient.rpc('lock_class_grades', { p_offering_id: Number(selectedOffering.id) });
            if (error) throw error;
            selectedOffering.grades_locked = true;
            gradingWorkspace.setLocked(true);
            renderRoster();
            gradingWorkspace.markClean();
            showToast('Grades finalized and locked.');
        } catch (error) { showToast('Could not lock grades: ' + error.message, true); }
        finally { gradingWorkspace.refresh(); }
    });

    // Grading helpers — delegated to shared/grading.js
    const previewEquivalent = Grading.previewEquivalent;
    const previewRemarkBadge = Grading.previewRemarkBadge;

    getEl('saveGradesBtn').addEventListener('click', async () => {
        if (!selectedOffering || !roster.length) return;
        const btn = getEl('saveGradesBtn');
        if (!gradingWorkspace.validate()) return;
        gradingWorkspace.setSaving(true);
        btn.disabled = true;
        btn.textContent = 'Saving…';

        let successCount = 0, failCount = 0;

        try {
            for (const r of roster) {
                if (r.grade_scale === 'percentage' || selectedOffering?.grades_locked) continue;
                const { data, error, skipped } = await Grading.saveGrade(supabaseClient, r, selectedOffering.id);
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
        if (successCount) renderRoster();
        if (failCount === 0) gradingWorkspace.markClean();
        else gradingWorkspace.saveFailed();
        btn.textContent = 'Save Grades';

        if (failCount === 0) showToast(`Saved grades for ${successCount} student${successCount === 1 ? '' : 's'}.`);
        else showToast(`Saved ${successCount}, failed ${failCount}. Changes kept; reload the class to resolve conflicts.`, true);

        await loadDashboardStats();
    });

    // ── Grade History & Reversion System ──────────────────────────────────
    async function openStudentGradeHistory(r) {
        if (!selectedOffering || !r || !r.student) return;
        const modal = getEl('gradeHistoryModal');
        const title = getEl('gradeHistoryModalTitle');
        const sub = getEl('gradeHistoryModalSub');
        const currentBox = getEl('gradeHistoryCurrentBox');
        const body = getEl('gradeHistoryBody');
        const noMsg = getEl('noGradeHistoryMsg');

        title.textContent = `Grade History — ${r.student.full_name || 'Student'}`;
        sub.textContent = `${selectedOffering.code}: ${selectedOffering.title} · Student No: ${r.student.student_no || r.student.id_number || 'N/A'}`;

        const eq = previewEquivalent(r);
        const rem = previewRemarkBadge(r);

        currentBox.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-weight:700;font-size:13px;color:var(--ink-700);">Current Active Grade</span>
                <span style="font-size:11.5px;color:var(--ink-500);font-weight:500;">Saved in Portal</span>
            </div>
            <div class="current-grade-grid">
                <div class="current-grade-item"><div class="current-grade-label">Prelim</div><div class="current-grade-val">${r.prelim != null ? r.prelim : '—'}</div></div>
                <div class="current-grade-item"><div class="current-grade-label">Midterm</div><div class="current-grade-val">${r.midterm != null ? r.midterm : '—'}</div></div>
                <div class="current-grade-item"><div class="current-grade-label">Semi-Final</div><div class="current-grade-val">${r.semifinal != null ? r.semifinal : '—'}</div></div>
                <div class="current-grade-item"><div class="current-grade-label">Final</div><div class="current-grade-val">${r.final != null ? r.final : '—'}</div></div>
                <div class="current-grade-item"><div class="current-grade-label">Equivalent</div><div class="current-grade-val">${eq}</div></div>
                <div class="current-grade-item"><div class="current-grade-label">Remark</div><div class="current-grade-val" style="font-size:12px;">${rem}</div></div>
            </div>
        `;

        body.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:24px;color:var(--ink-500);">Loading revision history…</td></tr>';
        noMsg.style.display = 'none';
        modal.classList.add('open');

        const { data: historyRows, error } = await supabaseClient
            .from('v_grade_history')
            .select('*')
            .eq('offering_id', selectedOffering.id)
            .eq('student_id', r.student.id)
            .order('created_at', { ascending: false });

        if (error) {
            body.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:24px;color:var(--red);">Failed to load history: ${escapeHtml(error.message)}</td></tr>`;
            return;
        }

        renderHistoryRows(historyRows || [], r);
    }

    async function openClassGradeHistory() {
        if (!selectedOffering) return;
        const modal = getEl('gradeHistoryModal');
        const title = getEl('gradeHistoryModalTitle');
        const sub = getEl('gradeHistoryModalSub');
        const currentBox = getEl('gradeHistoryCurrentBox');
        const body = getEl('gradeHistoryBody');
        const noMsg = getEl('noGradeHistoryMsg');

        title.textContent = `Class Grade Audit Log — ${selectedOffering.code}`;
        sub.textContent = `${selectedOffering.title} · ${selectedOffering.semester || ''} ${selectedOffering.school_year || ''}`;

        currentBox.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-weight:700;font-size:13px;color:var(--ink-700);">Class Audit Trail & Revision History</span>
                <span style="font-size:12px;color:var(--ink-500);">${roster.length} students enrolled</span>
            </div>
            <div style="font-size:12px;color:var(--ink-500);margin-top:6px;">
                Shows every grade entry, update, and revert operation for this subject. Click "Revert" on any historical record to restore that student's prior grade.
            </div>
        `;

        body.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:24px;color:var(--ink-500);">Loading class grade history…</td></tr>';
        noMsg.style.display = 'none';
        modal.classList.add('open');

        const { data: historyRows, error } = await supabaseClient
            .from('v_grade_history')
            .select('*')
            .eq('offering_id', selectedOffering.id)
            .order('created_at', { ascending: false });

        if (error) {
            body.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:24px;color:var(--red);">Failed to load history: ${escapeHtml(error.message)}</td></tr>`;
            return;
        }

        renderHistoryRows(historyRows || [], null);
    }

    function renderHistoryRows(rows, targetStudent) {
        Grading.renderHistoryRows(rows, targetStudent, (histEntry, studentId) => {
            executeRevert(histEntry, targetStudent || roster.find(x => x.student.id === studentId));
        }, selectedOffering?.grades_locked);
    }

    async function executeRevert(histEntry, studentRosterItem) {
        await Grading.executeRevert({
            supabaseClient,
            histEntry,
            studentRosterItem,
            locked: selectedOffering?.grades_locked,
            showToast,
            async onDone(data, item) {
                if (item) {
                    renderRoster();
                    if (getEl('gradeHistoryModal').classList.contains('open')) {
                        openStudentGradeHistory(item);
                    }
                } else if (selectedOffering) {
                    selectCourse(selectedOffering.id);
                }
                showToast('Grade successfully reverted!');
                await loadDashboardStats();
            }
        });
    }

    getEl('gradeHistoryCloseBtn')?.addEventListener('click', () => getEl('gradeHistoryModal').classList.remove('open'));
    getEl('gradeHistoryDoneBtn')?.addEventListener('click', () => getEl('gradeHistoryModal').classList.remove('open'));
    getEl('classAuditLogBtn')?.addEventListener('click', openClassGradeHistory);


    // ══════════════════════════════════════════════════════════════════
    // ATTENDANCE
    // ══════════════════════════════════════════════════════════════════
    let attRoster = [];
    let attLoadedKey = null, attLoadVersion = 0, attSaving = false;

    function initAttendancePage() {
        const select = getEl('attClassSelect');
        select.innerHTML = offerings.map(o => `<option value="${o.id}">${escapeHtml(o.code)} — ${escapeHtml(o.title)}</option>`).join('') || '<option>No classes assigned</option>';
        const dateInput = getEl('attDateInput');
        if (!dateInput.value) dateInput.value = SCHOOLTIME.schoolToday();

        select.onchange = loadAttendanceRoster;
        dateInput.onchange = loadAttendanceRoster;
        if (offerings.length) loadAttendanceRoster();
        loadAttendanceHistory();
    }

    async function loadAttendanceRoster() {
        if (attSaving) return;
        const version = ++attLoadVersion;
        const offeringId = getEl('attClassSelect').value;
        const date = getEl('attDateInput').value;
        attLoadedKey = null;
        getEl('saveAttendanceBtn').disabled = true;
        if (!offeringId || !date) return;
        try {
            const [{ data: enrollments, error: rosterError }, existingRes] = await Promise.all([
                supabaseClient.rpc('get_class_roster', { p_offering_id: Number(offeringId) }),
                supabaseClient.from('attendance').select('*').eq('offering_id', offeringId).eq('date', date),
            ]);

            if (version !== attLoadVersion || offeringId !== getEl('attClassSelect').value || date !== getEl('attDateInput').value) return;
            if (rosterError || existingRes.error) throw rosterError || existingRes.error;

            const existingByStudent = {};
            (existingRes.data || []).forEach(r => { existingByStudent[r.student_id] = r.status; });

            attRoster = (enrollments || [])
                .filter(e => e.profiles)
                .map(e => ({ student: e.profiles, status: existingByStudent[e.student_id] || 'present' }))
                .sort((a, b) => (a.student.full_name || '').localeCompare(b.student.full_name || ''));

            attLoadedKey = `${offeringId}|${date}`;
            renderAttendanceRoster();
        } catch (error) {
            if (version !== attLoadVersion || offeringId !== getEl('attClassSelect').value || date !== getEl('attDateInput').value) return;
            const msg = getEl('noAttMsg');
            msg.style.display = 'block';
            msg.textContent = 'Attendance is unavailable. Previous entries have not been changed. ';
            const retry = document.createElement('button');
            retry.type = 'button';
            retry.className = 'btn btn-ghost';
            retry.textContent = 'Retry';
            retry.addEventListener('click', loadAttendanceRoster);
            msg.appendChild(retry);
            showToast('Could not load attendance: ' + error.message, true);
        }
    }

    function renderAttendanceRoster() {
        const table = getEl('attTable');
        const body = getEl('attBody');
        const msg = getEl('noAttMsg');
        getEl('saveAttendanceBtn').disabled = !attLoadedKey || attRoster.length === 0;

        if (!attRoster.length) { table.style.display = 'none'; msg.style.display = 'block'; msg.textContent = 'No students enrolled in this class.'; return; }
        msg.style.display = 'none';
        table.style.display = 'table';

        const statuses = [
            { value: 'present', label: 'Present' },
            { value: 'late', label: 'Late' },
            { value: 'absent', label: 'Absent' },
            { value: 'excused', label: 'Excused' },
        ];

        body.innerHTML = attRoster.map((r, idx) => `
      <tr>
        <td><b>${escapeHtml(r.student.full_name)}</b></td>
        <td>
          <select class="field-input att-status" style="width:auto;" data-idx="${idx}" aria-label="Attendance Status for ${escapeHtml(r.student.full_name)}" title="Attendance Status">
            ${statuses.map(s => `<option value="${s.value}" ${r.status === s.value ? 'selected' : ''}>${s.label}</option>`).join('')}
          </select>
        </td>
      </tr>
    `).join('');

        document.querySelectorAll('.att-status').forEach(sel => {
            sel.addEventListener('change', (e) => { attRoster[Number(e.target.dataset.idx)].status = e.target.value; });
        });
    }

    getEl('saveAttendanceBtn').addEventListener('click', async () => {
        const offeringId = getEl('attClassSelect').value;
        const date = getEl('attDateInput').value;
        if (!offeringId || !date || !attRoster.length || attSaving || attLoadedKey !== `${offeringId}|${date}`) return;

        const btn = getEl('saveAttendanceBtn');
        attSaving = true;
        getEl('attClassSelect').disabled = getEl('attDateInput').disabled = true;
        btn.disabled = true;
        btn.textContent = 'Saving…';

        const rows = attRoster.map(r => ({
            offering_id: Number(offeringId),
            student_id: r.student.id,
            date: date,
            status: r.status,
            marked_by: currentUser.id,
        }));

        try {
            const { error } = await supabaseClient.from('attendance').upsert(rows, { onConflict: 'student_id,offering_id,date' });
            if (error) throw error;
            showToast('Attendance saved.');
            loadAttendanceHistory();
        } catch (error) {
            showToast('Failed to save attendance: ' + error.message, true);
        } finally {
            attSaving = false;
            getEl('attClassSelect').disabled = getEl('attDateInput').disabled = false;
            btn.disabled = attLoadedKey !== `${getEl('attClassSelect').value}|${getEl('attDateInput').value}` || !attRoster.length;
            btn.textContent = 'Save Attendance';
        }
    });

    async function loadAttendanceHistory() {
        if (!offerings.length) return;
        const offeringIds = offerings.map(o => o.id);
        const { data, error } = await supabaseClient.rpc('get_attendance_history', { p_offering_ids: offeringIds });

        const body = getEl('attHistoryBody');
        const msg = getEl('noAttHistoryMsg');

        if (error) { showToast('Could not load attendance history: ' + error.message, true); return; }
        if (!data || !data.length) {
            body.innerHTML = '';
            msg.style.display = 'block';
            return;
        }
        msg.style.display = 'none';

        body.innerHTML = data.map(g => {
            const offering = offerings.find(o => String(o.id) === String(g.offering_id));
            return `
        <tr>
          <td>${fmtDate(g.date)}</td>
          <td>${escapeHtml(offering?.code || '—')}</td>
          <td>${g.present}</td>
          <td>${g.absent}</td>
          <td>${g.late}</td>
        </tr>`;
        }).join('');
    }

    // ══════════════════════════════════════════════════════════════════
    // ANNOUNCEMENTS
    // ══════════════════════════════════════════════════════════════════
    function initAnnouncementsPage() {
        const select = getEl('annClassSelect');
        select.innerHTML = offerings.map(o => `<option value="${o.id}">${escapeHtml(o.code)} — ${escapeHtml(o.title)}</option>`).join('') || '<option>No classes assigned</option>';
        loadAnnouncements();
    }

    getEl('postAnnouncementBtn').addEventListener('click', async () => {
        const offeringId = getEl('annClassSelect').value;
        const title = getEl('annTitleInput').value.trim();
        const message = getEl('annMessageInput').value.trim();
        if (!offeringId) { showToast('Pick a class first.', true); return; }
        if (!title || !message) { showToast('Title and message are required.', true); return; }

        const { error } = await supabaseClient.from('class_announcements').insert({
            offering_id: Number(offeringId),
            author_id: currentUser.id,
            title,
            body: message,
            is_active: true,
        });

        if (error) {
            showToast('Failed to post announcement: ' + error.message, true);
            return;
        }

        showToast('Announcement posted.');
        getEl('annTitleInput').value = '';
        getEl('annMessageInput').value = '';
        loadAnnouncements();
    });

    async function loadAnnouncements() {
        if (!offerings.length) return;
        const offeringIds = offerings.map(o => o.id);
        const { data, error } = await supabaseClient
            .from('class_announcements')
            .select('*')
            .in('offering_id', offeringIds)
            .order('created_at', { ascending: false })
            .limit(30);

        const wrap = getEl('announcementsList');
        const msg = getEl('noAnnouncementsMsg');

        if (isMissingTableError(error)) {
            wrap.innerHTML = '';
            msg.style.display = 'block';
            msg.textContent = 'Announcements could not be loaded.';
            return;
        }
        if (!data || !data.length) { wrap.innerHTML = ''; msg.style.display = 'block'; msg.textContent = 'No announcements posted yet.'; return; }
        msg.style.display = 'none';

        wrap.innerHTML = data.map(a => {
            const offering = offerings.find(o => String(o.id) === String(a.offering_id));
            const announcementText = a.body || a.message || '';
            return `
        <div class="activity-row">
          <div class="adot" style="background:var(--pink-500);"></div>
          <div>
            <div class="t">${escapeHtml(a.title)} <span style="color:var(--ink-300);font-weight:500;">— ${escapeHtml(offering?.code || '')}</span></div>
            <div class="d">${escapeHtml(announcementText)}</div>
            <div class="d" style="margin-top:2px;">${fmtDate(a.created_at)}</div>
          </div>
        </div>
      `;
        }).join('');
    }

    // ══════════════════════════════════════════════════════════════════
    // TEACHING SCHEDULE
    // ══════════════════════════════════════════════════════════════════
    // ══════════════════════════════════════════════════════════════════
    // PROFILE
    // ══════════════════════════════════════════════════════════════════
    function renderProfile() {
        const p = currentProfile;
        const rows = [
            ['Full Name', p.full_name],
            ['Email', p.email || currentUser.email],
            ['ID Number', p.id_number],
            ['Department / Program', p.program],
            ['Role', 'Faculty'],
        ];
        getEl('profileFields').innerHTML = rows.map(([label, value]) => `
      <div style="padding:12px 0;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:12px;">
        <span style="color:var(--ink-500);font-size:13px;">${escapeHtml(label)}</span>
        <span style="font-weight:700;font-size:13.5px;">${escapeHtml(value || '—')}</span>
      </div>
    `).join('');
    }

    // ── Student Evaluations ─────────────────────────────────────────────
    async function loadTeacherEvaluations() {
        const instructorId = currentProfile?.id;
        if (!instructorId) return;
        const { data, error } = await supabaseClient
            .from('instructor_evaluation_summary')
            .select('*')
            .eq('instructor_id', instructorId)
            .order('school_year', { ascending: false });

        renderTeacherEvaluations(data || []);
    }

    function renderTeacherEvaluations(evals) {
        const cardsEl = getEl('evalSummaryCards');
        const bodyEl = getEl('evalHistoryBody');
        const noMsg = getEl('noEvalMsg');

        if (!evals || !evals.length) {
            if (cardsEl) cardsEl.innerHTML = '';
            if (bodyEl) bodyEl.innerHTML = '';
            if (noMsg) noMsg.style.display = 'block';
            return;
        }

        if (noMsg) noMsg.style.display = 'none';

        const latest = evals[0];
        if (cardsEl) {
            cardsEl.innerHTML = `
                <div class="card card-pad" style="text-align:center;">
                    <div style="font-size:24px;font-weight:700;color:var(--brand);">${latest.avg_overall != null ? Number(latest.avg_overall).toFixed(2) : '—'} ⭐</div>
                    <div style="font-size:12px;color:var(--ink-500);margin-top:4px;">Overall (${escapeHtml(latest.school_year)} ${escapeHtml(latest.semester)})</div>
                </div>
                <div class="card card-pad" style="text-align:center;">
                    <div style="font-size:24px;font-weight:700;">${latest.total_evaluations || 0}</div>
                    <div style="font-size:12px;color:var(--ink-500);margin-top:4px;">Students Evaluated</div>
                </div>
                <div class="card card-pad" style="text-align:center;">
                    <div style="font-size:24px;font-weight:700;color:var(--ink-700);">${latest.avg_teaching_clarity != null ? Number(latest.avg_teaching_clarity).toFixed(2) : '—'}</div>
                    <div style="font-size:12px;color:var(--ink-500);margin-top:4px;">Teaching Clarity</div>
                </div>
                <div class="card card-pad" style="text-align:center;">
                    <div style="font-size:24px;font-weight:700;color:var(--ink-700);">${latest.avg_knowledge != null ? Number(latest.avg_knowledge).toFixed(2) : '—'}</div>
                    <div style="font-size:12px;color:var(--ink-500);margin-top:4px;">Subject Knowledge</div>
                </div>
            `;
        }

        if (bodyEl) {
            bodyEl.innerHTML = evals.map(e => `
                <tr>
                    <td><b>${escapeHtml(e.school_year)}</b> · ${escapeHtml(e.semester)}</td>
                    <td>${e.total_evaluations || 0}</td>
                    <td>${e.avg_teaching_clarity != null ? Number(e.avg_teaching_clarity).toFixed(2) : '—'}</td>
                    <td>${e.avg_knowledge != null ? Number(e.avg_knowledge).toFixed(2) : '—'}</td>
                    <td>${e.avg_availability != null ? Number(e.avg_availability).toFixed(2) : '—'}</td>
                    <td>${e.avg_fairness != null ? Number(e.avg_fairness).toFixed(2) : '—'}</td>
                    <td>${e.avg_punctuality != null ? Number(e.avg_punctuality).toFixed(2) : '—'}</td>
                    <td><b style="color:var(--brand);">${e.avg_overall != null ? Number(e.avg_overall).toFixed(2) + ' / 5.00' : '—'}</b></td>
                </tr>
            `).join('');
        }
    }

    // ── Quick Links (SSO) — delegated to FC ──
    async function loadSSOLinks() {
        await FC.loadSSOLinks(supabaseClient, currentProfile?.role || 'teacher');
    }

    // ── Logout ──────────────────────────────────────────────────────────
    getEl('signOutBtn').addEventListener('click', async () => {
        await supabaseClient.auth.signOut();
        window.location.href = '../auth/login.html';
    });

    // ── Init ────────────────────────────────────────────────────────────
    const ok = await checkFacultyAuth();
    if (!ok) return;

    await loadMyCourses();
    await loadSSOLinks();
    getEl('refreshEnrollmentNotifications').addEventListener('click', () => FC.loadEnrollmentNotifications(supabaseClient));
    await FC.loadEnrollmentNotifications(supabaseClient);

    if (window.imccHidePreloader) window.imccHidePreloader();
});
