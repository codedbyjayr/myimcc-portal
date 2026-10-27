'use strict';
document.addEventListener('DOMContentLoaded', async () => {
  const session = await initAuthGuard(['dean', 'admin', 'staff', 'registrar']);
  if (!session) return;
  document.getElementById('back').href = IMCC.dashboardForRole(session.profile.role);
  const rows = document.getElementById('requests');
  const message = document.getElementById('message');
  const refresh = document.getElementById('refresh');
  const statusFilter = document.getElementById('statusFilter');
  const reviewTermSelect = document.getElementById('reviewTerm');
  const reviewYearSelect = document.getElementById('reviewYear');
  let reviewTerm = null;
  const finalizations = document.getElementById('finalizationGroups');
  const termSelect = document.getElementById('enrollmentTermSelect');
  document.getElementById('termManager').hidden = !['dean', 'admin', 'registrar'].includes(session.profile.role);
  async function askReview(text, reason = false) {
    if (window.IMCC_DEVELOPER_VIEW !== false) return reason ? window.prompt(text) : window.confirm(text);
    // Opaque demo frames cannot use browser prompts; a native dialog keeps the sandbox intact.
    const dialog = document.createElement('dialog');
    dialog.setAttribute('aria-label', text);
    const label = document.createElement('label');
    label.textContent = text;
    const input = document.createElement('textarea');
    input.required = true; input.maxLength = 1000;
    if (reason) label.append(input);
    const cancel = document.createElement('button'), proceed = document.createElement('button');
    cancel.type = proceed.type = 'button'; cancel.textContent = 'Cancel'; proceed.textContent = 'Continue';
    dialog.style.cssText = 'max-width:440px;padding:24px;border-radius:12px;font:inherit';
    dialog.append(label, cancel, proceed);
    document.body.append(dialog);
    return new Promise(resolve => {
      dialog.addEventListener('close', () => {
        const answer = dialog.returnValue === 'continue' ? (reason ? input.value.trim() : true) : null;
        dialog.remove(); resolve(answer);
      }, {once:true});
      cancel.addEventListener('click', () => dialog.close('cancel'));
      proceed.addEventListener('click', () => { if (!reason || input.reportValidity()) dialog.close('continue'); });
      dialog.showModal();
    });
  }
  let loading = false, reloadRequested = false;
  async function load() {
    if (loading) { reloadRequested = true; return; }
    loading = true;
    refresh.disabled = true;
    message.textContent = rows.innerHTML ? 'Updating…' : 'Loading…';
    try {
      const { data, error } = await supabaseClient.rpc('list_enrollment_request_history', { p_status: statusFilter.value });
      if (error) throw error;
      const workspace = await supabaseClient.rpc('get_enrollment_workspace');
      if (workspace.error) throw workspace.error;
      const terms = IMCC.termKeys([...(workspace.data.terms || []), ...(data || [])]);
      if (reviewTerm === null || (reviewTerm && !terms.includes(reviewTerm))) reviewTerm = terms[0] || '';
      reviewTermSelect.innerHTML = '<option value="">All terms</option>' + terms.map(t => UIM.html`<option value="${t}">${t.split('|').reverse().join(' · ')}</option>`).join('');
      reviewTermSelect.value = reviewTerm;
      const matchesTerm = row => (!reviewTerm || IMCC.termKey(row) === reviewTerm) && (!reviewYearSelect.value || String(parseInt(row.year_level, 10)) === reviewYearSelect.value);
      const visibleRequests = (data || []).filter(matchesTerm);
      finalizations.innerHTML = (workspace.data.groups || []).filter(matchesTerm).map(g => UIM.html`<div class="load-summary"><strong>${g.student_name}</strong> · ${g.student_no || ''} · ${g.semester} ${g.school_year} · ${g.units} units
        ${g.locked_at ? UIM.html`<span>Finalized and locked</span>` : UIM.html`<button type="button" data-finalize="${g.student_id}" data-year="${g.school_year}" data-semester="${g.semester}">Finalize Enrollment</button>`}</div>`).join('') || '<p>No enrolled students.</p>';
      const previousTerm = termSelect.value;
      termSelect.innerHTML = (workspace.data.terms || []).map(t => UIM.html`<option value="${JSON.stringify([t.school_year, t.semester])}">${t.semester} ${t.school_year} — ${t.is_open ? 'Open' : 'Closed'}</option>`).join('');
      if ([...termSelect.options].some(o => o.value === previousTerm)) termSelect.value = previousTerm;
      const groups = new Map();
      for (const request of visibleRequests) {
        const key = JSON.stringify([request.student_id, request.school_year, request.semester]);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(request);
      }
      rows.innerHTML = [...groups.values()].map(requests => {
        const student = requests[0];
        const pendingUnits = requests.filter(r => r.status === 'pending').reduce((total, r) => total + Number(r.units || 0), 0);
        const enrolledUnits = Number(student.enrolled_units || 0);
        return UIM.html`<section class="student-request">
          <header class="student-header"><div><h2>${student.student_name} <small>${student.student_no || 'No student number'}</small></h2>
          <p class="student-meta">${student.program || 'Program not set'} · ${student.year_level || 'Year not set'} · Section ${student.section || 'not set'}</p></div>
          <p class="term-label">${student.semester} · ${student.school_year}</p></header>
          <div class="load-summary"><div><strong>${pendingUnits} pending units</strong><span>Awaiting a decision</span></div><div><strong>${enrolledUnits} enrolled units</strong><span>Current approved load</span></div><div><strong>${pendingUnits + enrolledUnits} units if all pending subjects are approved</strong><span>Proposed semester load</span></div></div>
          <div class="table-wrap"><table>
            <caption>Subjects for ${student.semester} ${student.school_year}</caption>
            <thead><tr><th>Subject</th><th>Schedule</th><th>Units</th><th>Status / Decision</th></tr></thead>
            <tbody>${requests.map(r => UIM.html`<tr>
              <td>${r.code} — ${r.title}</td><td>${r.schedule || 'Schedule TBA'}</td><td>${r.units}</td>
              <td><span class="status-badge status-${r.status}">${r.status}</span>${r.review_note ? UIM.html`<span class="review-note">${r.review_note}</span>` : ''}${r.status === 'pending' ? UIM.html`<div class="decision-actions"><button data-id="${r.id}" data-decision="approved">Approve</button><button data-id="${r.id}" data-decision="rejected">Reject</button></div>` : ''}</td></tr>`)}
            ${(student.enrolled_courses || []).map(c => UIM.html`<tr>
              <td>${c.code} — ${c.title}</td><td>${c.schedule || 'Schedule TBA'}</td><td>${c.units}</td><td><span class="status-badge status-enrolled">Enrolled</span></td></tr>`)}</tbody>
          </table></div>
        </section>`;
      }).join('') || UIM.html`<section class="request-empty"><div class="empty-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4H5a2 2 0 0 0-2 2v14h18V6a2 2 0 0 0-2-2h-3M8 2h8v5H8zM8 13l3 3 5-5"/></svg></div><h2>${statusFilter.value === 'pending' ? 'Nothing waiting for review' : 'No matching requests'}</h2><p>${statusFilter.value === 'pending' ? 'New subject requests will appear here when students submit their proposed load. You can still review previous decisions.' : 'There are no requests in this view. Change the status filter or refresh to check for updates.'}</p>${statusFilter.value !== 'all' ? UIM.html`<button type="button" data-history="all">View decision history</button>` : ''}</section>`;
      message.textContent = visibleRequests.length ? `${visibleRequests.length} ${statusFilter.value === 'all' ? 'subject request(s)' : `${statusFilter.value} subject request(s)`} across ${groups.size} student/term group(s).` : `No ${statusFilter.value === 'all' ? 'requests' : statusFilter.value + ' requests'} found.`;
    } catch (err) { if (rows.innerHTML.includes('class="request-empty"')) rows.innerHTML = ''; message.textContent = 'Could not load requests: ' + err.message + (rows.innerHTML ? ' — displayed results may be outdated. Refresh to retry.' : ''); }
    finally { loading = false; refresh.disabled = false; if (reloadRequested) { reloadRequested = false; await load(); } }
  }
  rows.addEventListener('click', async event => {
    const button = event.target.closest('button[data-id],button[data-history]');
    if (!button || refresh.disabled) return;
    if (button.dataset.history === 'all') { statusFilter.value = 'all'; await load(); return; }
    const row = button.closest('tr');
    let reviewNote = null;
    if (button.dataset.decision === 'rejected') {
      reviewNote = (await askReview('Enter a reason for rejecting this enrollment request:', true))?.trim();
      if (!reviewNote) { message.textContent = 'A rejection reason is required.'; return; }
      if (reviewNote.length > 1000) { message.textContent = 'Keep the rejection reason to 1,000 characters or fewer.'; return; }
    }
    row.querySelectorAll('button').forEach(b => { b.disabled = true; });
    refresh.disabled = true;
    try {
      const { error } = await supabaseClient.rpc('review_enrollment_request', {
        p_request_id: button.dataset.id, p_decision: button.dataset.decision, p_review_note: reviewNote,
      });
      if (error) throw error;
      await load();
    } catch (err) {
      message.textContent = 'Could not review request: ' + err.message;
      row.querySelectorAll('button').forEach(b => { b.disabled = false; });
    } finally { refresh.disabled = false; }
  });
  refresh.addEventListener('click', load);
  statusFilter.addEventListener('change', load);
  reviewTermSelect.addEventListener('change', () => { reviewTerm = reviewTermSelect.value; return load(); });
  reviewYearSelect.addEventListener('change', load);
  finalizations.addEventListener('click', async event => {
    const button = event.target.closest('[data-finalize]');
    if (!button || refresh.disabled || !await askReview('Finalize this enrollment? Subject changes for this student and term will be blocked.')) return;
    button.disabled = true;
    refresh.disabled = true;
    try {
      const { error } = await supabaseClient.rpc('finalize_enrollment', { p_student_id: button.dataset.finalize, p_school_year: button.dataset.year, p_semester: button.dataset.semester });
      if (error) throw error;
      await load();
    } catch (error) { message.textContent = 'Could not finalize enrollment: ' + error.message; }
    finally { button.disabled = false; refresh.disabled = false; }
  });
  for (const [id, open] of [['openTerm', true], ['closeTerm', false]]) {
    document.getElementById(id).addEventListener('click', async () => {
      if (refresh.disabled || !termSelect.value) return;
      const [year, semester] = JSON.parse(termSelect.value);
      refresh.disabled = true;
      try {
        const { error } = await supabaseClient.rpc('set_enrollment_term', { p_school_year: year, p_semester: semester, p_open: open });
        if (error) throw error;
        await load();
      } catch (error) { message.textContent = 'Could not update term: ' + error.message; }
      finally { refresh.disabled = false; }
    });
  }
  await load();
  window.imccLiveRefresh?.(supabaseClient, [{table:'enrollment_requests'}, {table:'enrollments'}, {table:'course_offerings'}], async () => {
    if (!refresh.disabled && !document.querySelector('dialog[open]')) await load();
  });
});
