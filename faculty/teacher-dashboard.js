// faculty-dashboard.js
document.addEventListener('DOMContentLoaded', async () => {
    let supabaseClient;
    try {
        supabaseClient = await getSupabaseClientAsync();
    } catch (e) {
        console.error('Failed to init Supabase', e);
        return;
    }

    // ── Helpers ─────────────────────────────────────────────────────────
    const getEl = id => document.getElementById(id);
    function escapeHtml(str) {
        return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function initials(name) {
        return (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
    }
    function fmtDate(iso) {
        if (!iso) return '—';
        return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    }
    let toastTimer;
    function showToast(msg, isError = false) {
        const t = getEl('toast');
        if (!t) return;
        t.textContent = msg;
        t.classList.toggle('error', isError);
        t.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
    }
    function isMissingTableError(err) {
        return err && (err.code === '42P01' || /relation .* does not exist/i.test(err.message || ''));
    }

    // Standard Philippine collegiate 0–100 → 1.00–5.00 conversion.
    // Adjust these cutoffs to match your institution's actual grading policy.
    function computeEquivalent(avg) {
        if (avg === null || avg === undefined || isNaN(avg)) return null;
        if (avg >= 97) return 1.00;
        if (avg >= 94) return 1.25;
        if (avg >= 91) return 1.50;
        if (avg >= 88) return 1.75;
        if (avg >= 85) return 2.00;
        if (avg >= 82) return 2.25;
        if (avg >= 79) return 2.50;
        if (avg >= 76) return 2.75;
        if (avg >= 75) return 3.00;
        return 5.00;
    }

    // ── State ───────────────────────────────────────────────────────────
    let currentUser = null;
    let currentProfile = null;
    let offerings = [];
    let selectedOffering = null;
    let roster = [];
    let darkMode = false;

    // ── Navigation (goto) ───────────────────────────────────────────────
    const titles = {
        dashboard: 'Dashboard',
        classes: 'My Classes',
        attendance: 'Attendance',
        announcements: 'Announcements',
        schedule: 'Teaching Schedule',
        profile: 'My Profile',
    };

    function goto(page) {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        const pageEl = getEl('page-' + page);
        if (pageEl) pageEl.classList.add('active');
        document.querySelectorAll('.nav-item[data-page]').forEach(n => n.classList.toggle('active', n.dataset.page === page));
        getEl('pageTitle').textContent = titles[page] || 'Dashboard';
        getEl('userDropdown')?.classList.remove('open');

        if (page === 'attendance') initAttendancePage();
        if (page === 'announcements') initAnnouncementsPage();
        if (page === 'schedule') renderSchedule();
        if (page === 'profile') renderProfile();
    }
    document.querySelectorAll('[data-page]').forEach(el => el.addEventListener('click', () => goto(el.dataset.page)));
    document.querySelectorAll('[data-goto]').forEach(el => el.addEventListener('click', () => goto(el.dataset.goto)));

    // ── Dropdown + theme toggle (matches student portal exactly) ────────
    function setupDropdown(btnId, ddId) {
        const btn = getEl(btnId), dd = getEl(ddId);
        if (!btn || !dd) return;
        btn.addEventListener('click', e => { e.stopPropagation(); dd.classList.toggle('open'); });
        document.addEventListener('click', () => dd.classList.remove('open'));
        dd.addEventListener('click', e => e.stopPropagation());
    }
    setupDropdown('userBtn', 'userDropdown');

    getEl('themeToggle')?.addEventListener('click', () => {
        darkMode = !darkMode;
        document.body.setAttribute('data-theme', darkMode ? 'dark' : 'light');
        getEl('themeLabel').textContent = darkMode ? 'Light' : 'Dark';
        getEl('themeIcon').innerHTML = darkMode
            ? '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>'
            : '<path d="M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z"/>';
    });

    // ── Auth ────────────────────────────────────────────────────────────
    async function checkFacultyAuth() {
        const { data: { user }, error } = await supabaseClient.auth.getUser();
        if (error || !user) { window.location.href = '../auth/login.html'; return false; }
        currentUser = user;

        const { data: profile } = await supabaseClient.from('profiles').select('*').eq('id', user.id).single();

        if (!profile || profile.status !== 'approved' || !['teacher', 'faculty'].includes(profile.role)) {
            alert('Unauthorized access. Faculty privileges required.');
            await supabaseClient.auth.signOut();
            window.location.href = '../auth/login.html';
            return false;
        }

        currentProfile = profile;
        const name = profile.full_name || user.email;
        getEl('sidebarName').textContent = name;
        getEl('sidebarDept').textContent = profile.program || 'Faculty';
        getEl('sidebarAvatar').textContent = initials(name);
        getEl('topAvatar').textContent = initials(name);
        getEl('topName').textContent = name.split(' ')[0] || 'Faculty';
        return true;
    }

    // ── Dashboard stats ───────────────────────────────────────────────────

    async function loadDashboardStats() {
        if (!offerings.length) {
            getEl('stat-classes').textContent = '0';
            getEl('stat-students').textContent = '0';
            getEl('stat-pending').textContent = '0';
            return;
        }
        const offeringIds = offerings.map(o => o.id);

        const [{ data: enrollments }, { data: gradeRows }] = await Promise.all([
            supabaseClient.from('enrollments').select('student_id, offering_id').in('offering_id', offeringIds).eq('status', 'enrolled'),
            supabaseClient.from('grades').select('student_id, offering_id, final').in('offering_id', offeringIds),
        ]);

        const uniqueStudents = new Set((enrollments || []).map(e => e.student_id));
        const gradedSet = new Set((gradeRows || []).filter(g => g.final !== null && g.final !== undefined).map(g => `${g.student_id}|${g.offering_id}`));
        const pending = (enrollments || []).filter(e => !gradedSet.has(`${e.student_id}|${e.offering_id}`)).length;

        getEl('stat-classes').textContent = offerings.length;
        getEl('stat-students').textContent = uniqueStudents.size;
        getEl('stat-pending').textContent = pending;
    }

    // ── Load assigned course offerings ───────────────────────────────────
    async function loadMyCourses() {
        let { data, error } = await supabaseClient
            .from('course_offerings')
            .select('*')
            .or(`instructor_id.eq.${currentUser.id},instructor_name.eq.${currentProfile.full_name}`);

        if (error) {
            // instructor_id column may not exist yet — fall back to name matching only.
            ({ data, error } = await supabaseClient
                .from('course_offerings')
                .select('*')
                .eq('instructor_name', currentProfile.full_name));
        }

        if (error) { showToast('Failed to load your classes: ' + error.message, true); return; }

        offerings = (data || []).sort((a, b) => (b.school_year || '').localeCompare(a.school_year || ''));
        renderCourseList();
        await loadDashboardStats();
    }

    function renderCourseList() {
        const wrap = getEl('courseList');
        const msg = getEl('noCoursesMsg');
        if (!offerings.length) { wrap.innerHTML = ''; msg.style.display = 'block'; return; }
        msg.style.display = 'none';

        wrap.innerHTML = offerings.map(o => `
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
        document.querySelectorAll('#courseList .nav-item').forEach(b => b.classList.remove('active'));
        if (btnEl) btnEl.classList.add('active');

        selectedOffering = offerings.find(o => String(o.id) === String(offeringId));
        if (!selectedOffering) return;

        getEl('selectedCourseTitle').textContent = `${selectedOffering.code} — ${selectedOffering.title}`;
        getEl('selectedCourseSub').textContent = `${selectedOffering.semester || ''} ${selectedOffering.school_year || ''} · ${selectedOffering.schedule || 'Schedule TBA'}`;
        getEl('saveGradesBtn').disabled = false;

        const [{ data: enrollments }, { data: existingGrades }] = await Promise.all([
            supabaseClient.from('enrollments').select('student_id, profiles(id, full_name, student_no, id_number)').eq('offering_id', offeringId).eq('status', 'enrolled'),
            supabaseClient.from('grades').select('*').eq('offering_id', offeringId),
        ]);

        const gradeByStudent = {};
        (existingGrades || []).forEach(g => { gradeByStudent[g.student_id] = g; });

        roster = (enrollments || [])
            .map(e => {
                const g = gradeByStudent[e.student_id];
                return { student: e.profiles, gradeId: g?.id || null, midterm: g?.midterm ?? null, final: g?.final ?? null };
            })
            .filter(r => r.student)
            .sort((a, b) => (a.student.full_name || '').localeCompare(b.student.full_name || ''));

        renderRoster();
    }

    function renderRoster() {
        const table = getEl('rosterTable');
        const body = getEl('rosterBody');
        const msg = getEl('noRosterMsg');

        if (!roster.length) {
            table.style.display = 'none';
            msg.style.display = 'block';
            msg.textContent = 'No students are enrolled in this class yet.';
            return;
        }
        msg.style.display = 'none';
        table.style.display = 'table';

        body.innerHTML = roster.map((r, idx) => `
      <tr data-idx="${idx}">
        <td><b>${escapeHtml(r.student.full_name || 'N/A')}</b></td>
        <td>${escapeHtml(r.student.student_no || r.student.id_number || '—')}</td>
        <td><input type="number" min="0" max="100" step="0.01" class="field-input mid-input" style="width:80px;" data-idx="${idx}" value="${r.midterm ?? ''}"></td>
        <td><input type="number" min="0" max="100" step="0.01" class="field-input final-input" style="width:80px;" data-idx="${idx}" value="${r.final ?? ''}"></td>
        <td class="equiv-cell" data-idx="${idx}">${previewEquivalent(r)}</td>
        <td class="remark-cell" data-idx="${idx}">${previewRemarkBadge(r)}</td>
      </tr>
    `).join('');

        document.querySelectorAll('.mid-input, .final-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const idx = Number(e.target.dataset.idx);
                const val = e.target.value === '' ? null : Number(e.target.value);
                if (e.target.classList.contains('mid-input')) roster[idx].midterm = val;
                else roster[idx].final = val;
                document.querySelector(`.equiv-cell[data-idx="${idx}"]`).textContent = previewEquivalent(roster[idx]);
                document.querySelector(`.remark-cell[data-idx="${idx}"]`).innerHTML = previewRemarkBadge(roster[idx]);
            });
        });
    }

    function previewEquivalent(r) {
        if (r.final === null || r.final === undefined) return '—';
        const avg = r.midterm !== null && r.midterm !== undefined ? (r.midterm * 0.4 + r.final * 0.6) : r.final;
        const eq = computeEquivalent(avg);
        return eq === null ? '—' : eq.toFixed(2);
    }

    function previewRemarkBadge(r) {
        if (r.final === null || r.final === undefined) return '<span class="badge badge-amber">Pending</span>';
        const avg = r.midterm !== null && r.midterm !== undefined ? (r.midterm * 0.4 + r.final * 0.6) : r.final;
        const eq = computeEquivalent(avg);
        const remark = eq !== null && eq <= 3.00 ? 'Passed' : 'Failed';
        return `<span class="badge ${remark === 'Passed' ? 'badge-green' : 'badge-red'}">${remark}</span>`;
    }

    getEl('saveGradesBtn').addEventListener('click', async () => {
        if (!selectedOffering || !roster.length) return;
        const btn = getEl('saveGradesBtn');
        btn.disabled = true;
        btn.textContent = 'Saving…';

        let successCount = 0, failCount = 0;

        for (const r of roster) {
            const avg = r.final !== null && r.final !== undefined
                ? (r.midterm !== null && r.midterm !== undefined ? (r.midterm * 0.4 + r.final * 0.6) : r.final)
                : null;
            const equivalent = computeEquivalent(avg);
            const remark = r.final === null || r.final === undefined ? 'Pending' : (equivalent <= 3.00 ? 'Passed' : 'Failed');

            const payload = { student_id: r.student.id, offering_id: selectedOffering.id, midterm: r.midterm, final: r.final, equivalent, remark };

            let error;
            if (r.gradeId) {
                ({ error } = await supabaseClient.from('grades').update(payload).eq('id', r.gradeId));
            } else {
                const { data, error: insertErr } = await supabaseClient.from('grades').insert(payload).select().single();
                error = insertErr;
                if (!error && data) r.gradeId = data.id;
            }
            if (error) failCount++; else successCount++;
        }

        btn.disabled = false;
        btn.textContent = 'Save Grades';

        if (failCount === 0) showToast(`Saved grades for ${successCount} student${successCount === 1 ? '' : 's'}.`);
        else showToast(`Saved ${successCount}, failed ${failCount}. Check console for details.`, true);

        await loadDashboardStats();
    });

    // ══════════════════════════════════════════════════════════════════
    // ATTENDANCE
    // ══════════════════════════════════════════════════════════════════
    let attRoster = [];

    function initAttendancePage() {
        const select = getEl('attClassSelect');
        select.innerHTML = offerings.map(o => `<option value="${o.id}">${escapeHtml(o.code)} — ${escapeHtml(o.title)}</option>`).join('') || '<option>No classes assigned</option>';
        const dateInput = getEl('attDateInput');
        if (!dateInput.value) dateInput.value = new Date().toISOString().slice(0, 10);

        select.onchange = loadAttendanceRoster;
        dateInput.onchange = loadAttendanceRoster;
        if (offerings.length) loadAttendanceRoster();
        loadAttendanceHistory();
    }

    async function loadAttendanceRoster() {
        const offeringId = getEl('attClassSelect').value;
        const date = getEl('attDateInput').value;
        if (!offeringId || !date) return;

        const [{ data: enrollments }, existingRes] = await Promise.all([
            supabaseClient.from('enrollments').select('student_id, profiles(id, full_name, student_no)').eq('offering_id', offeringId).eq('status', 'enrolled'),
            supabaseClient.from('attendance_records').select('*').eq('offering_id', offeringId).eq('session_date', date),
        ]);

        if (isMissingTableError(existingRes.error)) {
            getEl('attTable').style.display = 'none';
            const msg = getEl('noAttMsg');
            msg.style.display = 'block';
            msg.textContent = 'Attendance needs the attendance_records table — run faculty-schema-additions.sql, then reload.';
            getEl('saveAttendanceBtn').disabled = true;
            return;
        }

        const existingByStudent = {};
        (existingRes.data || []).forEach(r => { existingByStudent[r.student_id] = r.status; });

        attRoster = (enrollments || [])
            .filter(e => e.profiles)
            .map(e => ({ student: e.profiles, status: existingByStudent[e.student_id] || 'present' }))
            .sort((a, b) => (a.student.full_name || '').localeCompare(b.student.full_name || ''));

        renderAttendanceRoster();
    }

    function renderAttendanceRoster() {
        const table = getEl('attTable');
        const body = getEl('attBody');
        const msg = getEl('noAttMsg');
        getEl('saveAttendanceBtn').disabled = attRoster.length === 0;

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
          <select class="field-input att-status" style="width:auto;" data-idx="${idx}">
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
        if (!offeringId || !date || !attRoster.length) return;

        const btn = getEl('saveAttendanceBtn');
        btn.disabled = true;
        btn.textContent = 'Saving…';

        const rows = attRoster.map(r => ({
            offering_id: offeringId,
            student_id: r.student.id,
            session_date: date,
            status: r.status,
            recorded_by: currentUser.id,
        }));

        const { error } = await supabaseClient.from('attendance_records').upsert(rows, { onConflict: 'offering_id,student_id,session_date' });

        btn.disabled = false;
        btn.textContent = 'Save Attendance';

        if (error) {
            if (isMissingTableError(error)) showToast('Attendance needs the attendance_records table — see faculty-schema-additions.sql.', true);
            else showToast('Failed to save attendance: ' + error.message, true);
            return;
        }
        showToast('Attendance saved.');
        loadAttendanceHistory();
    });

    async function loadAttendanceHistory() {
        if (!offerings.length) return;
        const offeringIds = offerings.map(o => o.id);
        const { data, error } = await supabaseClient
            .from('attendance_records')
            .select('session_date, status, offering_id')
            .in('offering_id', offeringIds)
            .order('session_date', { ascending: false })
            .limit(300);

        const body = getEl('attHistoryBody');
        const msg = getEl('noAttHistoryMsg');

        if (isMissingTableError(error) || !data || !data.length) {
            body.innerHTML = '';
            msg.style.display = 'block';
            return;
        }
        msg.style.display = 'none';

        const grouped = {};
        data.forEach(r => {
            const key = `${r.session_date}|${r.offering_id}`;
            if (!grouped[key]) grouped[key] = { date: r.session_date, offeringId: r.offering_id, present: 0, absent: 0, late: 0 };
            if (r.status === 'present') grouped[key].present++;
            else if (r.status === 'absent') grouped[key].absent++;
            else if (r.status === 'late') grouped[key].late++;
        });

        const rows = Object.values(grouped).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);
        body.innerHTML = rows.map(g => {
            const offering = offerings.find(o => String(o.id) === String(g.offeringId));
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
            offering_id: offeringId,
            posted_by: currentUser.id,
            posted_by_name: currentProfile.full_name,
            title, message,
        });

        if (error) {
            if (isMissingTableError(error)) showToast('Announcements need the class_announcements table — see faculty-schema-additions.sql.', true);
            else showToast('Failed to post: ' + error.message, true);
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
            msg.textContent = 'Announcements need the class_announcements table — run faculty-schema-additions.sql, then reload.';
            return;
        }
        if (!data || !data.length) { wrap.innerHTML = ''; msg.style.display = 'block'; msg.textContent = 'No announcements posted yet.'; return; }
        msg.style.display = 'none';

        wrap.innerHTML = data.map(a => {
            const offering = offerings.find(o => String(o.id) === String(a.offering_id));
            return `
        <div class="activity-row">
          <div class="adot" style="background:var(--pink-500);"></div>
          <div>
            <div class="t">${escapeHtml(a.title)} <span style="color:var(--ink-300);font-weight:500;">— ${escapeHtml(offering?.code || '')}</span></div>
            <div class="d">${escapeHtml(a.message)}</div>
            <div class="d" style="margin-top:2px;">${fmtDate(a.created_at)}</div>
          </div>
        </div>
      `;
        }).join('');
    }

    // ══════════════════════════════════════════════════════════════════
    // TEACHING SCHEDULE
    // ══════════════════════════════════════════════════════════════════
    function renderSchedule() {
        const body = getEl('scheduleBody');
        const msg = getEl('noScheduleMsg');
        if (!offerings.length) { body.innerHTML = ''; msg.style.display = 'block'; return; }
        msg.style.display = 'none';
        body.innerHTML = offerings.map(o => `
      <tr>
        <td><b>${escapeHtml(o.code || '—')}</b></td>
        <td>${escapeHtml(o.title || '—')}</td>
        <td>${escapeHtml(o.schedule || 'TBA')}</td>
        <td>${o.units ?? '—'}</td>
        <td>${escapeHtml(o.semester || '')} ${escapeHtml(o.school_year || '')}</td>
      </tr>
    `).join('');
    }

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

    // ── Logout ──────────────────────────────────────────────────────────
    getEl('signOutBtn').addEventListener('click', async () => {
        await supabaseClient.auth.signOut();
        window.location.href = '../auth/login.html';
    });

    // ── Init ────────────────────────────────────────────────────────────
    const ok = await checkFacultyAuth();
    if (!ok) return;
    await loadMyCourses();
});