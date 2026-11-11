import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import { clearStudent, loadClearances, type Clearance } from './clearance-workspace';
import { ClearanceNoteEditor, saveClearanceNote } from '../shared/clearance-note';
import '../shared/tailwind.css';

const controlClass = 'box-border min-h-10 rounded-lg border border-solid border-[var(--line)] bg-[var(--card)] px-3.5 py-[9px] font-sans text-base text-[var(--ink-900)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pink-500)] sm:text-[13px]';
const statusClass: Record<string, string> = {
  cleared: 'bg-[var(--green-bg)] text-[#166534] [[data-theme=dark]_&]:text-[var(--green)]',
  pending: 'bg-[var(--amber-bg)] text-[#854D0E] [[data-theme=dark]_&]:text-[var(--amber)]',
  action_required: 'bg-[var(--red-bg)] text-[#991B1B] [[data-theme=dark]_&]:text-[var(--red)]',
};
const officeCodes = new Map([
  ['Guidance', 'guidance'], ['Cashier', 'cashier'], ['DSA', 'dsa'],
  ['Laboratory/Nursing Arts/Cybershack', 'laboratory'], ['Library', 'library'],
  ['Medical Clinic/Dental', 'medical_dental'], ['Property Custodian', 'property_custodian'], ['ROTC/CWTS', 'rotc_cwts'],
]);

function StaffDashboard() {
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [profile, setProfile] = useState<{ role: string; full_name?: string | null; role_department?: string | null } | null>(null);
  const [rows, setRows] = useState<Clearance[] | null>(null);
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [year, setYear] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState<Clearance['id'] | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [confirmation, setConfirmation] = useState<Clearance | null>(null);
  const [editingNote, setEditingNote] = useState<Clearance['id'] | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const active = useRef(true);
  const readOnly = window.IMCC_DEVELOPER_VIEW === true;

  useEffect(() => {
    if (confirmation) dialog.current?.showModal();
    else dialog.current?.close();
  }, [confirmation]);

  async function refresh(connection: SupabaseClient) {
    setLoading(true);
    setLoadError('');
    try {
      const records = await loadClearances(connection);
      if (active.current) {
        setRows(records);
        setDepartment(selected => records.some(row => row.department_name === selected) ? selected : '');
      }
    } catch (error) {
      if (active.current) setLoadError(error instanceof Error ? error.message : 'Could not load clearances.');
    } finally {
      if (active.current) setLoading(false);
    }
  }

  useEffect(() => {
    active.current = true;
    async function initialize() {
      try {
        const connection = await window.getSupabaseClientAsync();
        const auth = await window.initAuthGuard(['staff', 'admin']);
        if (!auth || !active.current) return;
        setClient(connection);
        setProfile(auth.profile);
        await refresh(connection);
      } catch (error) {
        if (active.current) {
          setLoadError(error instanceof Error ? error.message : 'Could not initialize your dashboard.');
          setLoading(false);
        }
      } finally {
        if (active.current) window.imccHidePreloader?.();
      }
    }
    void initialize();
    return () => { active.current = false; };
  }, []);

  const mayChange = (row: Clearance) => !readOnly && row.status !== 'cleared'
    && (profile?.role === 'admin' || officeCodes.get(profile?.role_department ?? '') === row.department_code);

  async function approve(row: Clearance) {
    if (!client || !mayChange(row) || saving !== null || loading || loadError || signingOut) return;
    setConfirmation(null);
    setSaving(row.id);
    setNotice(null);
    try {
      await clearStudent(client, row);
      if (!active.current) return;
      setRows(current => current?.map(record => record.id === row.id ? { ...record, status: 'cleared' } : record) || []);
      setNotice({ text: 'Clearance approved successfully', error: false });
      await refresh(client);
    } catch (error) {
      if (active.current) setNotice({ text: error instanceof Error ? error.message : 'Could not approve clearance.', error: true });
    } finally {
      if (active.current) setSaving(null);
    }
  }

  async function submitNote(event: FormEvent<HTMLFormElement>, row: Clearance) {
    event.preventDefault();
    if (!client || !mayChange(row) || saving !== null || loading || loadError || signingOut) return;
    const form = event.currentTarget;
    setSaving(row.id);
    setNotice(null);
    try {
      const note = await saveClearanceNote(client, row, String(new FormData(form).get('note') ?? ''));
      if (!active.current) return;
      setRows(current => current?.map(record => record.id === row.id ? { ...record, note } : record) || []);
      setEditingNote(null);
      setNotice({ text: 'Clearance note saved.', error: false });
    } catch (error) {
      if (active.current) setNotice({ text: error instanceof Error ? error.message : 'Could not save clearance note.', error: true });
    } finally {
      if (active.current) setSaving(null);
    }
  }

  async function signOut() {
    if (signingOut || saving !== null) return;
    setSigningOut(true);
    setNotice(null);
    try {
      const connection = client || await window.getSupabaseClientAsync();
      const { error } = await connection.auth.signOut();
      if (error) throw error;
      window.location.href = '../auth/login.html';
    } catch (error) {
      if (active.current) {
        setNotice({ text: error instanceof Error ? error.message : 'Unable to sign out. Please try again.', error: true });
        setSigningOut(false);
      }
    }
  }

  const clearances = rows || [];
  const cleared = clearances.filter(row => row.status === 'cleared').length;
  const departments = [...new Set(clearances.map(row => row.department_name))];
  const query = search.trim().toLowerCase();
  const filtered = clearances.filter(row =>
    [row.profiles?.full_name, row.profiles?.student_no, row.profiles?.program].join(' ').toLowerCase().includes(query)
    && (!year || String(parseInt(row.profiles?.year_level ?? '', 10)) === year)
    && (!department || row.department_name === department) && (!status || row.status === status));

  return <main className="mx-auto box-border max-w-[1200px] px-3 py-4 sm:px-3.5 sm:py-5 md:px-6 md:py-8" aria-busy={loading || saving !== null}>
    <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="m-0 font-heading text-[clamp(22px,5vw,28px)] font-extrabold text-[var(--ink-900)] md:text-[28px]">Staff Dashboard</h1>
        {profile && <p className="m-0 text-sm font-semibold">{profile.full_name || 'Staff'}</p>}
        <p className="m-0 mt-1 text-[13px] text-[var(--ink-500)]">Manage clearances and student records</p>
        <a href="enrollment-requests.html" className="text-[13px] text-[var(--pink-600)] underline underline-offset-2">Enrollment / Advising</a>
      </div>
      <button id="signOutBtn" type="button" disabled={signingOut || saving !== null} onClick={signOut} className="min-h-10 cursor-pointer rounded-[10px] border border-solid border-[var(--line)] bg-transparent px-4 py-2.5 font-sans text-[13px] font-semibold text-[var(--ink-700)] hover:border-[var(--pink-500)] hover:text-[var(--pink-600)] disabled:cursor-wait disabled:opacity-60">
        {signingOut ? 'Signing Out…' : 'Sign Out'}
      </button>
    </header>

    {readOnly && <p role="status" className="text-sm text-[var(--ink-500)]">Read-only preview. Clearance changes are disabled.</p>}
    {notice && <p role={notice.error ? 'alert' : 'status'} className={`rounded-lg p-3 text-sm ${notice.error ? statusClass.action_required : statusClass.cleared}`}>{notice.text}</p>}

    <section aria-label="Clearance statistics" className="mb-6 grid grid-cols-1 gap-2.5 sm:mb-8 sm:grid-cols-[repeat(auto-fit,minmax(200px,1fr))] sm:gap-4">
      {[
        { label: 'Total Clearances', id: 'totalClr', value: clearances.length, color: 'text-[var(--pink-600)]' },
        { label: 'Cleared', id: 'clearedCount', value: cleared, color: 'text-[var(--green)]' },
        { label: 'Pending', id: 'pendingCount', value: clearances.length - cleared, color: 'text-[var(--amber)]' },
      ].map(stat => <div key={stat.id} className="rounded-lg border border-solid border-[var(--line)] border-l-4 border-l-[var(--pink-500)] bg-[var(--card)] p-[18px] shadow-[var(--shadow)]">
        <div className="mb-2.5 text-[11px] font-extrabold tracking-[0.07em] text-[var(--ink-500)] uppercase">{stat.label}</div>
        <div id={stat.id} className={`text-[27px] font-extrabold ${stat.color}`}>{rows ? stat.value : '—'}</div>
      </div>)}
    </section>

    <section aria-labelledby="clearanceHeading" className="mb-5 rounded-[14px] border border-solid border-[var(--line)] bg-[var(--card)] px-3 py-4 shadow-[var(--shadow)] sm:p-5 md:p-6">
      <h2 id="clearanceHeading" className="m-0 mb-3.5 font-heading text-base font-extrabold text-[var(--ink-900)]">Clearance Status — All Students</h2>
      <div className="mb-3 flex flex-wrap gap-2">
        <input id="searchInput" type="search" aria-label="Search students" placeholder="Name, student number, or program" value={search} onChange={event => setSearch(event.target.value)} className={`${controlClass} min-w-0 flex-[1_1_200px]`} />
        <select id="filterYear" aria-label="Year level" value={year} onChange={event => setYear(event.target.value)} className={controlClass}>
          <option value="">All year levels</option>
          {['1st Year', '2nd Year', '3rd Year', '4th Year'].map((label, index) => <option key={label} value={index + 1}>{label}</option>)}
        </select>
        <select id="filterDept" aria-label="Department" value={department} onChange={event => setDepartment(event.target.value)} className={`${controlClass} max-w-full`}>
          <option value="">All Departments</option>
          {departments.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
        <select id="filterStatus" aria-label="Clearance status" value={status} onChange={event => setStatus(event.target.value)} className={controlClass}>
          <option value="">All Statuses</option>
          <option value="cleared">Cleared</option>
          <option value="pending">Pending</option>
          <option value="action_required">Action Required</option>
        </select>
        <button type="button" disabled={loading || saving !== null} className={`${controlClass} cursor-pointer disabled:cursor-wait disabled:opacity-60`} onClick={() => client ? void refresh(client) : window.location.reload()}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      {loadError && <p role="alert" className="text-sm text-[var(--red)]">Could not load clearances. {loadError} {rows ? 'Displayed results may be outdated. ' : ''}Use Refresh to retry.</p>}
      <div tabIndex={0} role="region" aria-label="Student clearance table" className="mb-3 w-full overflow-x-auto rounded-lg focus-visible:outline-2 focus-visible:outline-[var(--pink-500)]">
        <table className="w-full min-w-[580px] border-collapse text-xs sm:text-[13px]">
          <thead><tr>{['Student', 'Program', 'Department', 'Status', 'Note', 'Action'].map(heading => <th key={heading} scope="col" className="border-0 border-b border-solid border-[var(--line)] px-1.5 py-2 text-left text-[11px] font-bold tracking-[0.04em] text-[var(--ink-500)] uppercase sm:px-2 sm:py-2.5 md:p-3">{heading}</th>)}</tr></thead>
          <tbody id="clearanceTable" className="[&_td]:border-0 [&_td]:border-b [&_td]:border-solid [&_td]:border-[var(--line)] [&_td]:px-1.5 [&_td]:py-2 [&_td]:text-[var(--ink-900)] sm:[&_td]:px-2 sm:[&_td]:py-2.5 md:[&_td]:p-3">
            {filtered.map(row => <tr key={row.id} className="hover:bg-[var(--pink-50)]">
              <td><strong>{row.profiles?.full_name || '—'}</strong><br /><span className="text-[11px] text-[var(--ink-500)]">{row.profiles?.student_no || ''}</span></td>
              <td>{row.profiles?.program || '—'}</td>
              <td>{row.department_name}</td>
              <td><span className={`inline-block rounded-md px-2.5 py-1 text-[11px] font-bold ${statusClass[row.status] || statusClass.pending}`}>{row.status.replaceAll('_', ' ').toUpperCase()}</span></td>
              <td><span className="whitespace-pre-wrap text-[11px] text-[var(--ink-500)] [overflow-wrap:anywhere]">{row.note || '—'}</span>
                {mayChange(row) && (editingNote === row.id
                  ? <ClearanceNoteEditor id={row.id} office={row.department_name} note={row.note} open
                    disabled={loading || saving !== null || !!loadError || signingOut} onSubmit={event => void submitNote(event, row)} />
                  : <button type="button" disabled={loading || saving !== null || !!loadError || signingOut}
                    onClick={() => setEditingNote(row.id)}
                    className="mt-1 block cursor-pointer border-0 bg-transparent p-0 text-xs font-semibold text-[var(--pink-600)] disabled:opacity-60">Edit note</button>)}
              </td>
              <td>{row.status !== 'cleared' ? <button type="button" data-student-id={row.student_id} data-dept-code={row.department_code} disabled={!mayChange(row) || loading || saving !== null || !!loadError || signingOut} onClick={() => setConfirmation(row)} className="min-h-10 cursor-pointer rounded-[7px] border-0 bg-[var(--pink-700)] px-3.5 py-2.5 font-sans text-xs font-semibold text-[var(--card)] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60">{saving === row.id ? 'Saving…' : 'Mark Cleared'}</button> : '—'}</td>
            </tr>)}
            {!filtered.length && <tr><td colSpan={6} className="!p-8 text-center">{loading ? 'Loading clearance data...' : loadError && !rows ? 'Clearance data is unavailable.' : 'No clearance records found.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
    <dialog ref={dialog} aria-labelledby="confirmTitle" aria-describedby="confirmMessage" onCancel={() => setConfirmation(null)} onClose={() => setConfirmation(null)} className="box-border w-[420px] max-w-[calc(100vw-2rem)] rounded-xl border border-solid border-[var(--line)] bg-[var(--card)] p-6 text-[var(--ink-900)] shadow-xl backdrop:bg-black/50">
      <h2 id="confirmTitle" className="m-0 font-heading text-lg">Confirm clearance</h2>
      <p id="confirmMessage" className="text-sm">Mark {confirmation?.profiles?.full_name || 'this student'} as cleared for {confirmation?.department_name}?</p>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" autoFocus onClick={() => setConfirmation(null)} className={`${controlClass} cursor-pointer`}>Cancel</button>
        <button type="button" onClick={() => confirmation && void approve(confirmation)} className="min-h-10 cursor-pointer rounded-lg border-0 bg-[var(--pink-700)] px-4 py-2 font-sans text-sm font-semibold text-[var(--card)]">Mark Cleared</button>
      </div>
    </dialog>
  </main>;
}

createRoot(document.getElementById('root')!).render(<StaffDashboard />);
