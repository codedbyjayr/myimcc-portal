import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import { executeEnrollmentAction, groupEnrollmentRequests, loadEnrollmentWorkspace, type EnrollmentAction, type EnrollmentSnapshot, type StudentTerm } from './enrollment-workspace';
import '../shared/tailwind.css';

const buttonClass = 'min-h-[42px] cursor-pointer rounded-lg border border-solid border-[var(--line)] bg-[var(--card)] px-3.5 py-2.5 font-sans text-[13px] font-semibold text-[var(--ink-700)] hover:enabled:border-[var(--pink-500)] hover:enabled:text-[var(--pink-600)] disabled:cursor-not-allowed disabled:opacity-55';
const controlClass = 'box-border min-h-11 min-w-0 max-w-full rounded-lg border border-solid border-[var(--line)] bg-[var(--bg)] px-3 py-[11px] font-sans text-base text-[var(--ink-900)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pink-500)] sm:text-sm';
const panelClass = 'rounded-[14px] border border-solid border-[var(--line)] bg-[var(--card)] shadow-[var(--shadow)]';
const badgeClass: Record<string, string> = {
  pending: 'bg-[var(--amber-bg)] text-[#854D0E] [[data-theme=dark]_&]:text-[var(--amber)]',
  approved: 'bg-[var(--green-bg)] text-[#166534] [[data-theme=dark]_&]:text-[var(--green)]',
  enrolled: 'bg-[var(--green-bg)] text-[#166534] [[data-theme=dark]_&]:text-[var(--green)]',
  rejected: 'bg-[var(--red-bg)] text-[#991B1B] [[data-theme=dark]_&]:text-[var(--red)]',
};

function EnrollmentRequests() {
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('pending');
  const [reviewTerm, setReviewTerm] = useState<string | null>(null);
  const [reviewYear, setReviewYear] = useState('');
  const [managedTerm, setManagedTerm] = useState('');
  const [snapshot, setSnapshot] = useState<EnrollmentSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState<{ text: string; error: boolean; term: boolean } | null>(null);
  const [confirmation, setConfirmation] = useState<EnrollmentAction | null>(null);
  const [reason, setReason] = useState('');
  const active = useRef(true);
  const writing = useRef(false);
  const version = useRef(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const readOnly = window.IMCC_DEVELOPER_VIEW === true;
  const canManageTerms = ['dean', 'admin', 'registrar'].includes(role);

  async function refresh() {
    if (!client) return;
    const current = ++version.current;
    setLoading(true);
    setLoadError('');
    try {
      const next = await loadEnrollmentWorkspace(client, status, readOnly);
      if (!active.current || current !== version.current) return;
      const terms = window.IMCC.termKeys([...next.terms, ...next.requests]);
      setSnapshot(next);
      setReviewTerm(selected => selected === null || (selected && !terms.includes(selected)) ? terms[0] || '' : selected);
      setManagedTerm(selected => next.terms.some(term => JSON.stringify([term.school_year, term.semester]) === selected)
        ? selected : next.terms[0] ? JSON.stringify([next.terms[0].school_year, next.terms[0].semester]) : '');
    } catch (error) {
      if (active.current && current === version.current) setLoadError(error instanceof Error ? error.message : 'Please refresh to retry.');
    } finally {
      if (active.current && current === version.current) setLoading(false);
    }
  }

  useEffect(() => {
    active.current = true;
    async function initialize() {
      try {
        const connection = await window.getSupabaseClientAsync();
        const session = await window.initAuthGuard(['dean', 'admin', 'staff', 'registrar']);
        if (!session || !active.current) return;
        setRole(session.profile.role);
        setClient(connection);
      } catch (error) {
        if (active.current) {
          setLoadError(error instanceof Error ? error.message : 'Could not initialize the workspace.');
          setLoading(false);
        }
      }
    }
    void initialize();
    return () => { active.current = false; };
  }, []);

  useEffect(() => {
    void refresh();
    return () => { version.current++; };
  }, [client, status]);

  const refreshFromEvent = useEffectEvent(() => {
    if (!loading && !writing.current && !confirmation) return refresh();
  });
  useEffect(() => {
    if (!client) return;
    return window.imccLiveRefresh?.(client, [{ table: 'enrollment_requests' }, { table: 'enrollments' }, { table: 'course_offerings' }], () => refreshFromEvent());
  }, [client]);

  useEffect(() => {
    if (confirmation) dialog.current?.showModal();
    else dialog.current?.close();
  }, [confirmation]);

  const writesDisabled = readOnly || loading || saving || !!loadError || !snapshot || snapshot.status !== status;
  async function perform(action: EnrollmentAction) {
    if (!client || writesDisabled || writing.current || (action.kind === 'term' && !canManageTerms)) return;
    writing.current = true;
    setSaving(true);
    setNotice(null);
    try {
      await executeEnrollmentAction(client, action, reason);
      if (!active.current) return;
      setConfirmation(null);
      setNotice({
        text: action.kind === 'term' ? `Enrollment ${action.open ? 'opened' : 'closed'} for ${action.term.semester}, ${action.term.school_year}.`
          : action.kind === 'finalize' ? 'Enrollment finalized successfully.' : `Request ${action.decision}.`,
        error: false, term: action.kind === 'term',
      });
      await refresh();
    } catch (error) {
      if (active.current) setNotice({ text: error instanceof Error ? error.message : 'The change could not be saved.', error: true, term: action.kind === 'term' });
    } finally {
      writing.current = false;
      if (active.current) setSaving(false);
    }
  }

  function confirm(action: EnrollmentAction) {
    if (writesDisabled || writing.current) return;
    setReason('');
    setNotice(null);
    setConfirmation(action);
  }

  const terms = snapshot ? window.IMCC.termKeys([...snapshot.terms, ...snapshot.requests]) : [];
  const matchesFilters = (row: StudentTerm) => (!reviewTerm || window.IMCC.termKey(row) === reviewTerm)
    && (!reviewYear || String(parseInt(row.year_level || '', 10)) === reviewYear);
  const requests = snapshot?.requests.filter(matchesFilters) || [];
  const groups = groupEnrollmentRequests(requests);
  const finalizations = snapshot?.groups.filter(matchesFilters) || [];
  const selectedTerm = snapshot?.terms.find(term => JSON.stringify([term.school_year, term.semester]) === managedTerm);
  const rejection = confirmation?.kind === 'review' && confirmation.decision === 'rejected';
  const summary = requests.length ? `${requests.length} ${snapshot?.status === 'all' ? 'subject request(s)' : snapshot?.status + ' subject request(s)'} across ${groups.length} student/term group(s).`
    : `No ${status === 'all' ? 'requests' : status + ' requests'} found.`;

  return <main className="mx-auto box-border max-w-[1180px] px-4 pt-5 pb-10 [color-scheme:light] sm:px-7 sm:pt-8 sm:pb-16 [[data-theme=dark]_&]:[color-scheme:dark]" aria-busy={loading || saving}>
    <a id="back" href={window.IMCC.dashboardForRole(role) || '../index.html'} className="mb-5 inline-flex min-h-9 items-center gap-2 text-[13px] font-semibold text-[var(--ink-500)] no-underline hover:text-[var(--pink-600)] sm:mb-7">
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m12 5-7 7 7 7M5 12h14" /></svg>Back to portal
    </a>
    <header className="mb-7 flex items-start gap-3 sm:gap-4">
      <span className="heading-icon grid size-11 shrink-0 place-items-center rounded-xl border border-solid border-[var(--pink-200)] bg-[var(--pink-50)] text-[var(--pink-600)] sm:size-[52px] sm:rounded-[14px]">
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[26px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="4" width="14" height="18" rx="2" /><path d="M9 4V2h6v2M9 10h6M9 14h6M9 18h4" /></svg>
      </span>
      <div>
        <p className="m-0 mb-[7px] text-[11px] font-bold tracking-[0.12em] text-[var(--ink-500)] uppercase">MyIMCC · Academic Services</p>
        <h1 className="m-0 mb-2.5 font-heading text-[clamp(25px,3vw,32px)] leading-[1.2] tracking-[-0.035em]">Enrollment Requests</h1>
        <p className="m-0 max-w-[660px] text-sm leading-[1.7] text-[var(--ink-500)]">Review proposed subject loads, make enrollment decisions, and keep track of each student's progress.</p>
      </div>
    </header>

    {readOnly && <p role="status" className="text-sm text-[var(--ink-500)]">Read-only preview. Enrollment changes are disabled.</p>}
    {!readOnly && <div className="mb-6 grid grid-cols-1 gap-3">
      <details id="termManager" hidden={!canManageTerms} className={`${panelClass} px-5 py-4`}>
        <summary className="cursor-pointer text-[13px] font-bold text-[var(--ink-700)]">Enrollment term settings</summary>
        <p className="text-[13px] leading-[1.7] text-[var(--ink-500)]">Open or close 1st Semester, 2nd Semester, or Summer for the selected school year. Opening a closed term automatically notifies all active, approved students through their notification bell. Subject offerings must be added from the Dean dashboard first.</p>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="enrollmentTermSelect" className="text-sm font-semibold">Term</label>
          <select id="enrollmentTermSelect" value={managedTerm} onChange={event => setManagedTerm(event.target.value)} disabled={saving} className={controlClass}>
            {!snapshot?.terms.length && <option value="">No enrollment terms</option>}
            {snapshot?.terms.map(term => <option key={JSON.stringify([term.school_year, term.semester])} value={JSON.stringify([term.school_year, term.semester])}>{term.semester} {term.school_year} — {term.is_open ? 'Open' : 'Closed'}</option>)}
          </select>
          <button id="openTerm" type="button" className={buttonClass} disabled={writesDisabled || !selectedTerm || !canManageTerms} onClick={() => selectedTerm && void perform({ kind: 'term', term: selectedTerm, open: true })}>Open enrollment</button>
          <button id="closeTerm" type="button" className={buttonClass} disabled={writesDisabled || !selectedTerm || !canManageTerms} onClick={() => selectedTerm && void perform({ kind: 'term', term: selectedTerm, open: false })}>Close enrollment</button>
        </div>
        <p id="termStatus" role={notice?.term && notice.error ? 'alert' : 'status'} className="text-sm text-[var(--ink-500)]">{notice?.term ? notice.text : ''}</p>
      </details>
      <details className={`${panelClass} px-5 py-4`}>
        <summary className="cursor-pointer text-[13px] font-bold text-[var(--ink-700)]">Finalize a student's enrollment</summary>
        <p className="text-[13px] leading-[1.7] text-[var(--ink-500)]">Resolve pending requests first. Finalizing locks the student's subjects for that term.</p>
        <div id="finalizationGroups">
          {finalizations.map(group => <div key={JSON.stringify([group.student_id, group.school_year, group.semester])} className="my-2.5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-solid border-[var(--line)] bg-[var(--bg)] p-3 text-[13px]">
            <span className="min-w-0 [overflow-wrap:anywhere]"><strong>{group.student_name}</strong> · {group.student_no || ''} · {group.semester} {group.school_year} · {group.units} units</span>
            {group.locked_at ? <span>Finalized and locked</span> : <button type="button" data-finalize={group.student_id} disabled={writesDisabled} className={buttonClass} onClick={() => confirm({ kind: 'finalize', group })}>Finalize Enrollment</button>}
          </div>)}
          {!finalizations.length && <p className="text-sm text-[var(--ink-500)]">No enrolled students.</p>}
        </div>
      </details>
    </div>}

    <section aria-label="Request filters" className={`${panelClass} flex flex-wrap items-end gap-4 p-4 sm:px-5 sm:py-[18px]`}>
      <label className="grid min-w-0 flex-[1_1_200px] gap-2 text-xs font-bold text-[var(--ink-700)]" htmlFor="statusFilter">Request status
        <select id="statusFilter" disabled={saving} value={status} onChange={event => { setNotice(null); setStatus(event.target.value); }} className={controlClass}>
          <option value="pending">Pending requests</option><option value="approved">Approved history</option><option value="rejected">Rejected history</option><option value="all">All decisions</option>
        </select>
      </label>
      <label className="grid min-w-0 flex-[1_1_200px] gap-2 text-xs font-bold text-[var(--ink-700)]" htmlFor="reviewTerm">Review semester
        <select id="reviewTerm" value={reviewTerm || ''} disabled={saving} onChange={event => setReviewTerm(event.target.value)} className={controlClass}>
          <option value="">All terms</option>{terms.map(term => <option key={term} value={term}>{term.split('|').reverse().join(' · ')}</option>)}
        </select>
      </label>
      <label className="grid min-w-0 flex-[1_1_150px] gap-2 text-xs font-bold text-[var(--ink-700)]" htmlFor="reviewYear">Student year level
        <select id="reviewYear" value={reviewYear} disabled={saving} onChange={event => setReviewYear(event.target.value)} className={controlClass}>
          <option value="">All year levels</option><option value="1">1st Year</option><option value="2">2nd Year</option><option value="3">3rd Year</option><option value="4">4th Year</option>
        </select>
      </label>
      <button id="refresh" type="button" disabled={loading || saving} onClick={() => client ? void refresh() : window.location.reload()} className={`${buttonClass} w-full sm:w-auto`}>Refresh requests</button>
    </section>
    <p id="message" role={loadError || (notice?.error && !confirmation) ? 'alert' : 'status'} className="mx-0.5 my-[18px] min-h-[21px] text-[13px] leading-[1.6] text-[var(--ink-500)]">
      {loadError ? `Could not load requests: ${loadError}${snapshot?.requests.length ? ' — displayed results may be outdated. Refresh to retry.' : ''}` : loading ? snapshot ? 'Updating…' : 'Loading…' : saving ? 'Saving…' : notice && !notice.term && !confirmation ? notice.text : summary}
    </p>
    {snapshot && snapshot.status !== status && <p className="text-sm text-[var(--ink-500)]">Showing previously loaded {snapshot.status} requests.</p>}
    <div id="requests">
      {groups.map(group => {
        const student = group[0];
        const pendingUnits = group.filter(request => request.status === 'pending').reduce((total, request) => total + Number(request.units || 0), 0);
        const enrolledUnits = Number(student.enrolled_units || 0);
        return <section key={JSON.stringify([student.student_id, student.school_year, student.semester])} className={`student-request ${panelClass} mb-5 overflow-hidden`}>
          <header className="flex flex-col items-start justify-between gap-2.5 px-4 pt-[18px] pb-3.5 sm:flex-row sm:gap-4 sm:px-[22px] sm:pt-[22px] sm:pb-4">
            <div><h2 className="m-0 mb-1.5 font-heading text-[17px] leading-[1.5] [overflow-wrap:anywhere]">{student.student_name} <small className="mt-1 block font-sans text-xs font-medium text-[var(--ink-500)]">{student.student_no || 'No student number'}</small></h2>
              <p className="m-0 text-[13px] leading-[1.7] text-[var(--ink-500)]">{student.program || 'Program not set'} · {student.year_level || 'Year not set'} · Section {student.section || 'not set'}</p></div>
            <p className="m-0 max-w-full shrink-0 rounded-lg border border-solid border-[var(--line)] bg-[var(--bg)] px-2.5 py-2 text-xs font-semibold text-[var(--ink-700)] sm:max-w-[45%]">{student.semester} · {student.school_year}</p>
          </header>
          <div className="load-summary mx-4 mb-4 grid grid-cols-2 rounded-[10px] border border-solid border-[var(--line)] bg-[var(--bg)] sm:mx-[22px] sm:mb-[18px] sm:grid-cols-[1fr_1fr_1.4fr]">
            {[
              [`${pendingUnits} pending units`, 'Awaiting a decision'],
              [`${enrolledUnits} enrolled units`, 'Current approved load'],
              [`${pendingUnits + enrolledUnits} units if all pending subjects are approved`, 'Proposed semester load'],
            ].map(([value, caption], index) => <div key={caption} className={`min-w-0 p-3 sm:px-4 sm:py-3.5 ${index === 1 ? 'border-0 border-l border-solid border-[var(--line)]' : index === 2 ? 'col-span-2 border-0 border-t border-solid border-[var(--line)] sm:col-span-1 sm:border-t-0 sm:border-l' : ''}`}>
              <strong className={`block text-[13px] leading-[1.5] ${index === 0 ? 'text-[var(--pink-600)]' : 'text-[var(--ink-900)]'}`}>{value}</strong><span className="mt-1 block text-[11px] text-[var(--ink-500)]">{caption}</span>
            </div>)}
          </div>
          <div tabIndex={0} role="region" aria-label={`Subjects for ${student.student_name}`} className="overflow-x-auto px-4 pb-2.5 focus-visible:outline-2 focus-visible:outline-[var(--pink-500)] sm:px-[22px] sm:pb-3.5">
            <table className="w-full min-w-[650px] border-collapse text-[13px]">
              <caption className="pb-3.5 text-left text-xs font-semibold text-[var(--ink-500)]">Subjects for {student.semester} {student.school_year}</caption>
              <thead><tr>{['Subject', 'Schedule', 'Units', 'Status / Decision'].map(label => <th key={label} scope="col" className="bg-[var(--bg)] p-3 text-left text-[11px] font-bold tracking-[0.04em] text-[var(--ink-500)] uppercase">{label}</th>)}</tr></thead>
              <tbody className="[&_td]:border-0 [&_td]:border-b [&_td]:border-solid [&_td]:border-[var(--line)] [&_td]:px-3 [&_td]:py-3.5 [&_td]:align-top [&_td]:leading-[1.6] [&_tr:hover]:bg-[var(--bg)]">
                {group.map(request => <tr key={request.id}>
                  <td className="w-[43%] font-medium">{request.code} — {request.title}</td><td>{request.schedule || 'Schedule TBA'}</td><td>{request.units}</td>
                  <td><span className={`status-badge status-${request.status} inline-block rounded-md px-[9px] py-1 text-[11px] font-bold capitalize ${badgeClass[request.status] || 'bg-[var(--bg)] text-[var(--ink-500)]'}`}>{request.status}</span>
                    {request.review_note && <span className="mt-1.5 block max-w-[240px] text-xs text-[var(--ink-500)] [overflow-wrap:anywhere]">{request.review_note}</span>}
                    {request.status === 'pending' && <div className="mt-[9px] flex gap-[7px]">
                      <button type="button" data-id={request.id} data-decision="approved" disabled={writesDisabled} className={`${buttonClass} ${badgeClass.approved}`} onClick={() => void perform({ kind: 'review', request, decision: 'approved' })}>Approve</button>
                      <button type="button" data-id={request.id} data-decision="rejected" disabled={writesDisabled} className={buttonClass} onClick={() => confirm({ kind: 'review', request, decision: 'rejected' })}>Reject</button>
                    </div>}
                  </td>
                </tr>)}
                {(student.enrolled_courses || []).map((course, index) => <tr key={'enrolled-' + index}><td className="font-medium">{course.code} — {course.title}</td><td>{course.schedule || 'Schedule TBA'}</td><td>{course.units}</td><td><span className={`status-badge status-enrolled inline-block rounded-md px-[9px] py-1 text-[11px] font-bold ${badgeClass.enrolled}`}>Enrolled</span></td></tr>)}
              </tbody>
            </table>
          </div>
        </section>;
      })}
      {!groups.length && snapshot && !loading && !loadError && <section className={`request-empty ${panelClass} border-dashed px-5 py-9 text-center sm:py-[52px]`}>
        <h2 className="m-0 mb-2.5 font-heading text-lg">{status === 'pending' ? 'Nothing waiting for review' : 'No matching requests'}</h2>
        <p className="mx-auto mb-5 max-w-[450px] text-[13px] leading-[1.7] text-[var(--ink-500)]">{status === 'pending' ? 'New subject requests will appear here when students submit their proposed load. You can still review previous decisions.' : 'There are no requests in this view. Change the status filter or refresh to check for updates.'}</p>
        {status !== 'all' && <button type="button" className={buttonClass} disabled={saving} onClick={() => { setNotice(null); setStatus('all'); }}>View decision history</button>}
      </section>}
    </div>
    <dialog ref={dialog} aria-labelledby="reviewDialogTitle" onCancel={event => { if (saving) event.preventDefault(); else setConfirmation(null); }} onClose={() => setConfirmation(null)} className="box-border w-[440px] max-w-[calc(100vw-2rem)] rounded-xl border border-solid border-[var(--line)] bg-[var(--card)] p-6 text-[var(--ink-900)] shadow-xl backdrop:bg-black/50">
      <div>
        <h2 id="reviewDialogTitle" className="m-0 mb-4 font-heading text-lg">{rejection ? 'Reject enrollment request' : 'Finalize this enrollment?'}</h2>
        {rejection ? <label className="grid gap-2 text-sm" htmlFor="reviewReason">Enter a reason for rejecting this enrollment request:
          <textarea id="reviewReason" value={reason} onChange={event => setReason(event.target.value)} required maxLength={1000} rows={4} disabled={saving} className={`${controlClass} w-full`} />
        </label> : <p className="text-sm">{confirmation?.kind === 'finalize' && <><strong>{confirmation.group.student_name}</strong> · {confirmation.group.semester} {confirmation.group.school_year}<br /></>}Subject changes for this student and term will be blocked.</p>}
        {confirmation && notice?.error && <p role="alert" className="text-sm text-[var(--red)]">{notice.text}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" disabled={saving} className={buttonClass} onClick={() => setConfirmation(null)}>Cancel</button>
          <button type="button" disabled={saving} className={buttonClass} onClick={() => {
            const input = dialog.current?.querySelector('textarea');
            if (input && !input.reportValidity()) return;
            if (confirmation) void perform(confirmation);
          }}>{saving ? 'Saving…' : 'Continue'}</button>
        </div>
      </div>
    </dialog>
  </main>;
}

createRoot(document.getElementById('root')!).render(<EnrollmentRequests />);
