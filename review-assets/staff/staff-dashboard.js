const getEl = id => document.getElementById(id);
const { html, raw, escapeHtml, toast } = UIM;
let supabaseClient, staffProfile;
let allClearances = [], selectedStudentId = null, clearanceOffice = null;

function studentRows() {
  return [...new Map(allClearances.map(row => [row.student_id, row])).values()];
}

function renderStudents() {
  const query = getEl('searchInput').value.trim().toLowerCase();
  const year = getEl('filterYear').value;
  const rows = studentRows().filter(row => {
    const student = row.profiles || {};
    return (!query || [student.full_name, student.student_no, student.program].join(' ').toLowerCase().includes(query))
      && (!year || String(parseInt(student.year_level, 10)) === year);
  });
  getEl('clearanceStudents').innerHTML = rows.map(row => html`<button type="button" data-student-id="${row.student_id}"
    aria-pressed="${row.student_id === selectedStudentId}"><b>${row.profiles?.full_name || 'Unnamed student'}</b>
    <small>${row.profiles?.student_no || 'No student number'} · ${row.profiles?.program || 'No program'}</small></button>`).join('') || '<p>No students match this filter.</p>';
}

function canApprove(row) {
  return staffProfile?.role === 'admin' || (clearanceOffice && row.department_code === clearanceOffice);
}

function renderDetails() {
  const rows = allClearances.filter(row => row.student_id === selectedStudentId);
  if (!rows.length) {
    getEl('clearanceDetails').innerHTML = '<div class="panel-head"><h3>Select a student</h3></div><p>Choose a student to review their clearance.</p>';
    return;
  }
  const student = rows[0].profiles || {};
  const details = rows.map(row => {
    const cleared = row.status === 'cleared';
    const action = cleared ? '✓ Cleared' : canApprove(row)
      ? raw('<button class="btn btn-primary" type="button" data-clearance-id="' + escapeHtml(row.id) + '">Approve ' + escapeHtml(row.department_name) + ' clearance</button>')
      : 'Awaiting office approval';
    return html`<tr><td>${row.department_name}</td><td><span class="badge ${cleared ? 'badge-green' : 'badge-amber'}">${(row.status || 'pending').replace('_', ' ')}</span></td>
      <td>${action}</td><td>${row.note || '—'}</td><td>${row.cleared_at ? UIM.formatDate(row.cleared_at) : '—'}</td></tr>`;
  });
  getEl('clearanceDetails').innerHTML = html`<div class="panel-head"><h3>${student.full_name || 'Student'} — Clearance</h3></div>
    <p>${student.student_no || 'No student number'} · ${student.program || 'No program'} · ${student.year_level || 'Year level not set'}</p>
    <div class="table-responsive"><table><thead><tr><th scope="col">Office / Department</th><th scope="col">Status</th><th scope="col">Approval / Action</th><th scope="col">Note</th><th scope="col">Cleared Date</th></tr></thead><tbody>${details}</tbody></table></div>`;
}

async function loadClearances() {
  const { data, error } = await IMCC.fetchAll(() => supabaseClient.rpc('get_clearance_workspace'));
  if (error) throw new Error(error.message);
  allClearances = data || [];
  renderStudents();
  renderDetails();
  const count = studentRows().length;
  getEl('staffStatus').textContent = !clearanceOffice && staffProfile?.role !== 'admin'
    ? 'Ask an administrator to assign your clearance office before approving requirements.'
    : `${count} ${count === 1 ? 'student' : 'students'} loaded.`;
}

async function approveClearance(button) {
  if (button.disabled) return;
  const row = allClearances.find(item => item.id === button.dataset.clearanceId && item.student_id === selectedStudentId);
  if (!row || !canApprove(row) || row.status === 'cleared') return;
  if (!window.confirm(`Clear the ${row.department_name} requirement for ${row.profiles?.full_name || 'this student'}?`)) return;
  button.disabled = true;
  try {
    const { data, error } = await supabaseClient.from('clearances')
      .update({ status: 'cleared', cleared_at: new Date().toISOString() })
      .eq('id', row.id).eq('student_id', row.student_id).eq('department_code', row.department_code)
      .eq('status', row.status).select('id').single();
    if (error) throw error;
    if (!data?.id) throw new Error('No clearance was changed. Refresh and retry.');
    toast(`${row.department_name} clearance approved.`, { type: 'success' });
    await loadClearances();
  } catch (error) {
    toast('Could not approve clearance: ' + error.message, { type: 'error' });
  } finally {
    button.disabled = false;
  }
}

async function init() {
  try {
    supabaseClient = await getSupabaseClientAsync();
    const auth = await initAuthGuard(['staff', 'admin']);
    if (!auth) return;
    staffProfile = auth.profile;
    clearanceOffice = ({ Guidance: 'guidance', Cashier: 'cashier', DSA: 'dsa',
      'Laboratory/Nursing Arts/Cybershack': 'laboratory', Library: 'library',
      'Medical Clinic/Dental': 'medical_dental', 'Property Custodian': 'property_custodian', 'ROTC/CWTS': 'rotc_cwts' })[staffProfile.role_department];
    getEl('userName').textContent = staffProfile.full_name || 'Staff';
    getEl('staffOffice').textContent = staffProfile.role_department || (staffProfile.role === 'admin' ? 'All offices' : 'Office not assigned');
    getEl('officeHeading').textContent = `${getEl('staffOffice').textContent} Clearance`;
    FC.initMobileNav();
    FC.initThemeToggle();
    await loadClearances();
  } catch (error) {
    getEl('staffStatus').textContent = 'Could not load clearances. Use Refresh to retry.';
    toast(error.message, { type: 'error' });
  } finally {
    if (window.imccHidePreloader) window.imccHidePreloader();
  }
}

getEl('searchInput').addEventListener('input', renderStudents);
getEl('filterYear').addEventListener('change', renderStudents);
getEl('clearanceStudents').addEventListener('click', event => {
  const button = event.target.closest('[data-student-id]');
  if (!button) return;
  selectedStudentId = button.dataset.studentId;
  renderStudents();
  renderDetails();
});
getEl('clearanceDetails').addEventListener('click', event => {
  const button = event.target.closest('[data-clearance-id]');
  if (button) approveClearance(button);
});
getEl('refreshClearances').addEventListener('click', () => loadClearances().catch(error => toast(error.message, { type: 'error' })));
getEl('signOutBtn').addEventListener('click', async () => {
  const { error } = await supabaseClient.auth.signOut();
  if (error) { toast(error.message, { type: 'error' }); return; }
  window.location.href = '../auth/login.html';
});
init();
