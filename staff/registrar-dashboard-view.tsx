import { ClearanceNoteEditor } from '../shared/clearance-note';

type ClearanceOffice = {
  department_code: string;
  department_name?: string | null;
  status?: string | null;
  note?: string | null;
  cleared_at?: string | null;
};

type RegistrarClearance = ClearanceOffice & {
  id: string;
  student_id: string;
  profiles?: { full_name?: string; student_no?: string; program?: string; year_level?: string } | null;
  clearances?: ClearanceOffice[] | null;
};

export function RegistrarClearanceQueue({ rows, selectedId, hasStudents }: { rows: RegistrarClearance[]; selectedId: string | null; hasStudents: boolean }) {
  if (!rows.length) return <p>{hasStudents ? 'No students match this filter.' : 'No Registrar clearances found.'}</p>;
  return <>{rows.map(row => <button
    key={row.student_id}
    type="button"
    data-registrar-student={row.student_id}
    aria-pressed={row.student_id === selectedId}
    className="w-full cursor-pointer rounded-[9px] border border-solid border-[var(--line)] bg-[var(--white)] px-3 py-2.5 text-left text-[var(--ink-900)] hover:border-[var(--pink-500)] hover:bg-[var(--pink-50)] aria-pressed:border-[var(--pink-500)] aria-pressed:bg-[var(--pink-50)]"
  >
    <strong>{row.profiles?.full_name || 'Unnamed student'}</strong>
    <small className="mt-[3px] block text-[var(--ink-600)]">{row.profiles?.student_no || 'No student number'} · {row.profiles?.program || 'No program'} · {(row.status || 'pending').replace('_', ' ')}</small>
  </button>)}</>;
}

export function RegistrarClearanceDetails({ row, approvalDisabled, readOnly }: { row?: RegistrarClearance; approvalDisabled?: boolean; readOnly?: boolean }) {
  if (!row) return <>
    <h3 className="mb-4 text-base font-bold">Select a student</h3>
    <p>Choose a student to review their Registrar clearance.</p>
  </>;
  return <>
    <h3 className="mb-4 text-base font-bold">{row.profiles?.full_name || 'Student'} — Registrar Clearance</h3>
    <p>{row.profiles?.student_no || 'No student number'} · {row.profiles?.program || 'No program'} · {row.profiles?.year_level || 'Year level not set'}</p>
    <div className="table-responsive">
      <table className="w-full border-collapse text-left [&_td]:border-b [&_td]:border-solid [&_td]:border-[var(--line)] [&_td]:px-2.5 [&_td]:py-3">
        <thead><tr>{['Office / Department', 'Status', 'Approval / Action', 'Note', 'Cleared Date'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{row.clearances?.map(item => {
          const status = item.status || 'pending';
          const cleared = status === 'cleared';
          const registrar = item.department_code === row.department_code;
          return <tr key={item.department_code}>
            <td>{item.department_name || item.department_code}</td>
            <td><span className={`badge ${cleared ? 'badge-green' : 'badge-amber'}`}>{status.replace('_', ' ')}</span></td>
            <td>{cleared ? (registrar ? '✓ Registrar clearance approved' : '✓ Cleared') : registrar
              ? <button className="btn btn-primary" type="button" data-clearance-id={row.id} disabled={approvalDisabled}>Approve Registrar clearance</button>
              : 'Awaiting office approval'}</td>
            <td><div className="whitespace-pre-wrap [overflow-wrap:anywhere]" data-clearance-note-text>{item.note || '—'}</div>
              {registrar && !cleared && !readOnly && <ClearanceNoteEditor id={row.id} office="Registrar" note={row.note} disabled={approvalDisabled} />}
            </td>
            <td>{item.cleared_at ? new Date(item.cleared_at).toLocaleDateString() : '—'}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  </>;
}

export function RegistrarStudentRows({ rows }: { rows: { id: string; full_name: string; student_no?: string; program?: string; year_level?: string; is_active?: boolean }[] }) {
  return <>{rows.map(student => <tr key={student.id}>
    <td>{student.student_no || '—'}</td>
    <th scope="row">
      <button type="button" data-student-id={student.id} aria-label={`Manage subjects for ${student.full_name}`}
        className="cursor-pointer rounded border-0 bg-transparent p-0 text-left font-bold text-[var(--ink-900)] underline underline-offset-2">
        {student.full_name}
      </button>
      {student.is_active !== true && <small className="ml-2 text-[var(--ink-600)]">Inactive</small>}
    </th>
    <td>{student.program || '—'}</td>
    <td>{student.year_level || '—'}</td>
  </tr>)}</>;
}

type OfferSubject = { id: number; code: string; title: string; units?: number; is_major?: boolean; year?: number; semester?: string; school_year?: string };

function SubjectCategory({ subject }: { subject: OfferSubject }) {
  return <span className={`badge ${subject.is_major ? 'major' : 'ge'}`}>{subject.is_major ? 'Major' : 'GE'}</span>;
}

export function RegistrarProspectusRows({ rows }: { rows: OfferSubject[] }) {
  return <>{rows.map(subject => <tr key={subject.id}>
    <th scope="row">{subject.code}</th>
    <td>{subject.title}</td>
    <td>{subject.units}</td>
    <td><SubjectCategory subject={subject} /></td>
    <td>{subject.year ? `Yr ${subject.year}` : ''}{subject.semester ? ` · ${subject.semester}` : ''}</td>
  </tr>)}</>;
}

export function RegistrarSummerOptions({ subjects }: { subjects: OfferSubject[] }) {
  return <>
    <option value="">Select a subject</option>
    {subjects.map(subject => <option key={subject.id} value={subject.id}>
      {`${subject.code} — ${subject.title} · Year ${subject.year || 'not set'} · ${subject.is_major ? 'Major' : 'GE'} · ${subject.semester} ${subject.school_year}`}
    </option>)}
  </>;
}

export function RegistrarOfferRows({ rows, studentName }: { rows: { id: string; status: string | null; subject: OfferSubject }[]; studentName: string }) {
  return <>{rows.map(({ id, status, subject }) => <tr key={id}>
    <th scope="row">{subject.code}</th>
    <td>{subject.title}<small> · {subject.semester} {subject.school_year}</small></td>
    <td>{subject.units}</td>
    <td><SubjectCategory subject={subject} /></td>
    <td><span className={`badge ${status === 'enrolled' ? 'bg-[#eafaf0] text-[var(--ok)]' : 'bg-[#fff4d9] text-[#8a6100]'}`}>{status || 'enrolled'}</span></td>
    <td><button className="btn btn-danger" type="button" data-remove-offer={id}
      aria-label={`Remove ${subject.code} from ${studentName}`}>Remove</button></td>
  </tr>)}</>;
}

export function RegistrarOfferOptions({ subjects }: { subjects: OfferSubject[] }) {
  return subjects.length ? <>{subjects.map(subject =>
    <option key={subject.id} value={subject.id}>{subject.code} — {subject.title}</option>
  )}</> : <option value="">No subjects available</option>;
}

export default function DashboardView() {
  return <>
    <div className="app">
      <div className="sidebar-overlay" id="sidebarOverlay" />
      <aside className="sidebar" id="sidebar">
        <div className="brand">
          <div className="logo">
            <svg viewBox="0 0 42 42" className="brand-mark-svg" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <rect width="42" height="42" rx="10" fill="#E32B4F" />
              <circle cx="21" cy="11.5" r="2.2" fill="#FFFFFF" />
              <path d="M21 15V28.5" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M9.5 27.5V14L19.5 21.5" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M32.5 27.5V14L22.5 21.5" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M9.5 27.5C13.5 25 17.5 25.5 21 28.5C24.5 25.5 28.5 25 32.5 27.5" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <div className="name">
              {"MyIMCC"}
            </div>
            <div className="tag">
              {"REGISTRAR PORTAL"}
            </div>
          </div>
          <button className="sidebar-close-btn" id="sidebarCloseBtn" aria-label="Close Navigation" type="button">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="who">
          <div className="avatar" aria-hidden="true" />
          <div className="meta">
            <div id="userName">
              {"Registrar"}
            </div>
            <div>
              {"Registrar's Office"}
            </div>
          </div>
        </div>
        <nav aria-label="Registrar sections">
          <div className="nav-label">
            {"Main Menu"}
          </div>
          <a className="nav-item" href="enrollment-requests.html">
            <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21z" />
              <path d="M4 5.5v13A2.5 2.5 0 0 1 6.5 16H20M8 7h8M8 10h8" />
            </svg>
            {"Enrollment"}
          </a>
          <button className="nav-item active" data-view="dashboard" type="button" aria-current="page">
            <span className="ic" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 10l9-7 9 7v10a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                <path d="M9 22V12h6v10" />
              </svg>
            </span>
            {"\n                    Dashboard\n                "}
          </button>
          <button className="nav-item" data-view="prospectus" type="button">
            <span className="ic" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="M2 9h20M9 9v11" />
              </svg>
            </span>
            {"\n                    Prospectus\n                "}
          </button>
          <button className="nav-item" data-view="offers" type="button">
            <span className="ic" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 10L12 5 2 10l10 5 10-5z" />
                <path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5" />
                <path d="M22 10v6" />
              </svg>
            </span>
            {"\n                    Student Offers\n                "}
          </button>
          <button className="nav-item" id="registrarClearanceNav" data-view="clearance" type="button" hidden>
            <span className="ic" aria-hidden="true">
              {"✓"}
            </span>
            {"\n                    Clearance\n                "}
          </button>
          <button className="nav-item soon" type="button" disabled title="Coming soon">
            <span className="ic" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="17" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
                <path d="M9 15l2 2 4-4" />
              </svg>
            </span>
            {"\n                    Appointments\n                    "}
            <span className="soon-badge">Coming soon</span>
          </button>
          <button className="nav-item soon" type="button" disabled title="Coming soon">
            <span className="ic" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4h16v12H8l-4 4z" />
                <path d="M8 9h8M8 12h5" />
              </svg>
            </span>
            {"\n                    Messages\n                    "}
            <span className="soon-badge">Coming soon</span>
          </button>
        </nav>
        <div className="sidebar-foot">
          {"\n                MyIMCC Portal"}
          <br />
          {"Registrar Access\n            "}
        </div>
      </aside>
      <main className="main">
        <div className="topbar">
          <div className="topbar-left">
            <button className="menu-toggle" id="menuToggle" aria-label="Open Navigation" aria-expanded="false" aria-controls="sidebar" type="button">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <line x1="4" y1="6" x2="20" y2="6" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="18" x2="20" y2="18" />
              </svg>
            </button>
            <h1 id="pageTitle">
              {"Dashboard"}
            </h1>
          </div>
          <div className="topbar-right">
            <button className="theme-toggle" id="themeToggle" type="button" aria-label="Toggle Dark Mode">
              <svg id="themeIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z" />
              </svg>
              <span id="themeLabel">
                {"Dark"}
              </span>
            </button>
          </div>
        </div>
        <p id="registrarStatus" className="sr-only" role="status" aria-live="polite" />
        <section id="view-dashboard" aria-labelledby="pageTitle">
          <div className="hero">
            <div>
              <h2>
                {"Welcome, "}
                <span id="welcomeName">
                  {"Registrar"}
                </span>
              </h2>
              <p>
                {"Manage the prospectus, subject offerings, and student loads."}
              </p>
            </div>
            <button type="button" data-goto="offers">
              {"Manage Offers"}
            </button>
          </div>
          <div className="stats">
            <div className="stat-card">
              <div className="head">
                {"Total Students "}
                <span className="ic-pill" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
                  </svg>
                </span>
              </div>
              <div className="num" id="statStudents">
                {"–"}
              </div>
              <div className="sub">
                {"Across all majors"}
              </div>
            </div>
            <div className="stat-card">
              <div className="head">
                {"Subjects in Prospectus "}
                <span className="ic-pill" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="M2 9h20M9 9v11" />
                  </svg>
                </span>
              </div>
              <div className="num" id="statSubjects">
                {"–"}
              </div>
              <div className="sub">
                {"Major + General Education"}
              </div>
            </div>
            <div className="stat-card">
              <div className="head">
                {"Pending Offers "}
                <span className="ic-pill" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
                  </svg>
                </span>
              </div>
              <div className="num" id="statPending">
                {"–"}
              </div>
              <div className="sub">
                {"Awaiting confirmation"}
              </div>
            </div>
          </div>
          <div className="quick">
            <button type="button" className="quick-card" data-goto="prospectus">
              <span className="ic-pill" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="M2 9h20M9 9v11" />
                </svg>
              </span>
              <b>
                {"View Prospectus"}
              </b>
              <span>
                {"Browse all subjects"}
              </span>
            </button>
            <button type="button" className="quick-card" data-goto="prospectus" data-cat="MAJOR">
              <span className="ic-pill" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="4" width="20" height="14" rx="2" />
                  <path d="M8 22h8M12 18v4" />
                </svg>
              </span>
              <b>
                {"Major Subjects"}
              </b>
              <span>
                {"Filter major curriculum"}
              </span>
            </button>
            <button type="button" className="quick-card" data-goto="prospectus" data-cat="GE">
              <span className="ic-pill" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="M9 9v11M2 9h20M22 8v6a2 2 0 01-2 2h-3" />
                </svg>
              </span>
              <b>
                {"GE Subjects"}
              </b>
              <span>
                {"Filter General Education"}
              </span>
            </button>
            <button type="button" className="quick-card" data-goto="offers">
              <span className="ic-pill" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v8M8 12h8" />
                </svg>
              </span>
              <b>
                {"Offer a Subject"}
              </b>
              <span>
                {"Assign to a student"}
              </span>
            </button>
          </div>
        </section>
        <label htmlFor="registrarTerm">
          {"Academic semester"}
        </label>
        <select id="registrarTerm" aria-label="Academic semester" />
        <label htmlFor="registrarYear">
          {"Year level"}
        </label>
        <select id="registrarYear">
          <option value="">
            {"All year levels"}
          </option>
          <option value="1">
            {"1st Year"}
          </option>
          <option value="2">
            {"2nd Year"}
          </option>
          <option value="3">
            {"3rd Year"}
          </option>
          <option value="4">
            {"4th Year"}
          </option>
        </select>
        <section id="view-prospectus" className="hidden" aria-labelledby="pageTitle">
          <details className="panel mb-4" id="summerPublisher">
            <summary className="cursor-pointer font-semibold">
              {"Publish a Summer subject"}
            </summary>
            <p className="my-3 text-sm text-[var(--ink-600)]">
              {"Offer an existing subject for a failed-prerequisite retake or GE enrollment. Prerequisite rules still apply. Assign an instructor before enrollment opens."}
            </p>
            <form id="summerOfferingForm" className="grid max-w-xl gap-3 [&_label]:mb-1 [&_label]:block [&_label]:text-xs [&_label]:font-bold [&_label]:text-[var(--ink-600)] [&_input]:w-full [&_select]:w-full">
              <div>
                <label htmlFor="summerSubject">
                  {"Existing subject"}
                </label>
                <select id="summerSubject" required />
              </div>
              <div>
                <label htmlFor="summerSchoolYear">
                  {"School year"}
                </label>
                <input id="summerSchoolYear" required pattern="[0-9]{4}(?:-|–|—)[0-9]{4}" placeholder="2026-2027" />
              </div>
              <div>
                <label htmlFor="summerSchedule">
                  {"Schedule"}
                </label>
                <input id="summerSchedule" maxLength={200} placeholder="Schedule TBA" />
              </div>
              <button className="btn btn-primary justify-self-start" id="publishSummer" type="submit">
                {"Publish Summer offering"}
              </button>
              <p id="summerPublishStatus" className="m-0 text-sm" role="status" />
            </form>
          </details>
          <div className="panel">
            <div className="panel-head flex-wrap">
              <h3>
                {"Prospectus"}
              </h3>
              <div className="filters" id="prospectusFilters" role="group" aria-label="Filter subjects by category">
                <button type="button" className="chip active" data-cat="ALL">
                  {"All"}
                </button>
                <button type="button" className="chip" data-cat="MAJOR">
                  {"Major"}
                </button>
                <button type="button" className="chip" data-cat="GE">
                  {"GE"}
                </button>
              </div>
              <label className="sr-only" htmlFor="prospectusSearchField">
                {"Search by"}
              </label>
              <select id="prospectusSearchField" aria-label="Search by">
                <option value="all">
                  {"Code or title"}
                </option>
                <option value="code">
                  {"Code"}
                </option>
                <option value="title">
                  {"Title"}
                </option>
              </select>
              <label className="sr-only" htmlFor="prospectusSearch">
                {"Search subjects"}
              </label>
              <input type="search" id="prospectusSearch" placeholder="Search code or title…" />
            </div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <button className="btn btn-ghost" id="refreshProspectus" type="button">Refresh prospectus</button>
              <p id="prospectusRefreshError" className="m-0 text-sm text-[var(--danger)]" role="status" />
            </div>
            <div className="table-responsive">
              <table>
                <caption className="sr-only">
                  {"Course offerings in the prospectus"}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">
                      {"Code"}
                    </th>
                    <th scope="col">
                      {"Title"}
                    </th>
                    <th scope="col">
                      {"Units"}
                    </th>
                    <th scope="col">
                      {"Category"}
                    </th>
                    <th scope="col">
                      {"Year / Sem"}
                    </th>
                  </tr>
                </thead>
                <tbody id="prospectusBody" />
              </table>
            </div>
            <div id="prospectusEmpty" className="empty hidden">
              {"No subjects match this filter."}
            </div>
          </div>
        </section>
        <section id="view-offers" className="hidden" aria-labelledby="pageTitle">
          <div className="panel mb-[18px]">
            <div className="panel-head">
              <h3>
                {"Students"}
              </h3>
              <label className="sr-only" htmlFor="studentSearchField">
                {"Search students by"}
              </label>
              <select id="studentSearchField" aria-label="Search students by">
                <option value="name">
                  {"Name"}
                </option>
                <option value="studentNo">
                  {"Student No."}
                </option>
              </select>
              <label className="sr-only" htmlFor="studentSearch">
                {"Search students"}
              </label>
              <input type="search" id="studentSearch" placeholder="Search student name…" />
            </div>
            <div className="table-responsive">
              <table>
                <caption className="sr-only">
                  {"Approved students. Select a student to manage their subjects."}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">
                      {"Student No."}
                    </th>
                    <th scope="col">
                      {"Name"}
                    </th>
                    <th scope="col">
                      {"Major"}
                    </th>
                    <th scope="col">
                      {"Year"}
                    </th>
                  </tr>
                </thead>
                <tbody id="studentBody" />
              </table>
            </div>
            <div id="studentEmpty" className="empty hidden">
              {"No students match this search."}
            </div>
          </div>
          <div className="panel" id="studentDetailPanel" hidden>
            <div className="panel-head flex-wrap">
              <h3 id="studentDetailName">
                {"Student"}
              </h3>
              <button className="btn btn-primary" id="btnAddOffer" type="button">
                {"+ Offer Subject"}
              </button>
            </div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <button className="btn btn-ghost" id="refreshOffers" type="button">Refresh offers</button>
              <p id="offerEligibility" className="m-0 text-sm text-[var(--ink-600)]" />
              <p id="offerRefreshError" className="m-0 text-sm text-[var(--danger)]" role="status" />
            </div>
            <div className="table-responsive">
              <table>
                <caption className="sr-only">
                  {"Subjects offered to the selected student"}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">
                      {"Code"}
                    </th>
                    <th scope="col">
                      {"Title"}
                    </th>
                    <th scope="col">
                      {"Units"}
                    </th>
                    <th scope="col">
                      {"Category"}
                    </th>
                    <th scope="col">
                      {"Status"}
                    </th>
                    <th scope="col">
                      <span className="sr-only">
                        {"Actions"}
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody id="offersBody" />
              </table>
            </div>
            <div id="offersEmpty" className="empty hidden">
              {"No subjects offered yet."}
            </div>
          </div>
        </section>
        <section id="view-clearance" className="hidden" aria-labelledby="pageTitle" hidden>
          <dialog id="registrarClearanceConfirm" aria-labelledby="registrarClearanceConfirmTitle" aria-describedby="registrarClearanceConfirmMessage" className="m-auto max-w-[calc(100%-2rem)] rounded-xl border border-[var(--line)] bg-[var(--card)] p-5 text-[var(--ink-900)] backdrop:bg-black/50">
            <h3 id="registrarClearanceConfirmTitle" className="mb-2 font-bold">Confirm Registrar clearance</h3>
            <p id="registrarClearanceConfirmMessage" className="mb-4" />
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" id="registrarClearanceCancel" className="btn btn-ghost" autoFocus>Cancel</button>
              <button type="button" id="registrarClearanceApprove" className="btn btn-primary">Approve clearance</button>
            </div>
          </dialog>
          <div className="grid gap-4 min-[761px]:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.5fr)]">
            <div className="panel min-w-0">
              <div className="panel-head">
                <h3>
                  {"Student Clearance"}
                </h3>
              </div>
              <label className="sr-only" htmlFor="registrarClearanceSearch">
                {"Search students"}
              </label>
              <input id="registrarClearanceSearch" type="search" placeholder="Name, student number, or program…" className="mb-2.5 w-full min-w-0 rounded-[9px] border border-solid border-[var(--line)] bg-[var(--white)] px-3 py-2 text-[var(--ink-900)]" />
              <label htmlFor="registrarClearanceYear" className="my-1 block text-xs font-semibold text-[var(--ink-600)]">
                {"Year level"}
              </label>
              <select id="registrarClearanceYear" className="mb-2.5 w-full">
                <option value="">
                  {"All year levels"}
                </option>
                <option value="1">
                  {"1st Year"}
                </option>
                <option value="2">
                  {"2nd Year"}
                </option>
                <option value="3">
                  {"3rd Year"}
                </option>
                <option value="4">
                  {"4th Year"}
                </option>
              </select>
              <button className="btn btn-ghost mb-2.5 w-full" id="registrarClearanceRefresh" type="button">
                {"Refresh clearances"}
              </button>
              <div id="registrarClearanceStudents" className="mt-2 grid max-h-[34vh] gap-2 overflow-y-auto min-[761px]:max-h-[68vh]" role="group" aria-label="Students" />
              <p id="registrarClearanceLoadError" role="status" className="text-sm" />
            </div>
            <div className="panel min-w-0" id="registrarClearanceDetails" aria-live="polite">
              <RegistrarClearanceDetails />
            </div>
          </div>
        </section>
        <section id="view-messages" className="hidden" aria-labelledby="pageTitle">
          <div className="panel">
            <div className="card-head">
              <h2>
                {"Messages"}
              </h2>
              <button className="btn btn-primary" type="button" id="btnNewMessage">
                {"New message"}
              </button>
            </div>
            <p className="muted-note">
              {"\n                        Direct messages between you and students. Sent messages are part of the\n                        student's record and cannot be edited after sending.\n                    "}
            </p>
            <div className="msg-layout">
              <div className="msg-list-wrap">
                <div className="table-responsive">
                  <table>
                    <caption className="sr-only">
                      {"Message threads with students"}
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">
                          {"Student"}
                        </th>
                        <th scope="col">
                          {"Subject"}
                        </th>
                        <th scope="col">
                          {"Last message"}
                        </th>
                        <th scope="col">
                          {"Status"}
                        </th>
                      </tr>
                    </thead>
                    <tbody id="msgThreadsBody" />
                  </table>
                </div>
                <div id="msgThreadsEmpty" className="empty hidden">
                  {"\n                                No messages yet. Use “New message” to contact a student.\n                            "}
                </div>
              </div>
              <div className="msg-thread hidden" id="msgThreadPanel" aria-live="polite">
                <div className="msg-thread-head">
                  <div>
                    <div className="msg-peer" id="msgPeerName" />
                    <div className="muted-note" id="msgPeerMeta" />
                  </div>
                  <button className="btn" type="button" id="btnCloseThread">
                    {"Close"}
                  </button>
                </div>
                <div className="msg-history" id="msgHistory" />
                <form className="msg-reply" id="msgReplyForm">
                  <label className="sr-only" htmlFor="msgReplyBody">
                    {"Reply"}
                  </label>
                  <textarea id="msgReplyBody" rows={3} required placeholder="Write a reply to this student…" />
                  <button className="btn btn-primary" type="submit" id="btnSendReply">
                    {"Send reply"}
                  </button>
                </form>
              </div>
            </div>
          </div>
          <div className="card modal hidden" id="msgComposeModal" role="dialog" aria-modal="true" aria-labelledby="msgComposeTitle">
            <div className="card-head">
              <h2 id="msgComposeTitle">
                {"New message"}
              </h2>
            </div>
            <form id="msgComposeForm">
              <div className="field">
                <label htmlFor="msgRecipientSearch">
                  {"Student"}
                </label>
                <input type="text" id="msgRecipientSearch" autoComplete="off" placeholder="Search by name, ID number or email…" role="combobox" aria-expanded="false" aria-controls="msgRecipientList" aria-autocomplete="list" />
                <input type="hidden" id="msgRecipient" />
                <div className="msg-suggest hidden" id="msgRecipientList" role="listbox" aria-label="Matching students" />
              </div>
              <div className="field">
                <label htmlFor="msgSubject">
                  {"Subject"}
                </label>
                <input type="text" id="msgSubject" required maxLength={150} />
              </div>
              <div className="field">
                <label htmlFor="msgBody">
                  {"Message"}
                </label>
                <textarea id="msgBody" rows={5} required />
              </div>
              <div id="msgComposeError" className="form-error" hidden />
              <div className="modal-actions">
                <button className="btn" type="button" id="btnCancelCompose">
                  {"Cancel"}
                </button>
                <button className="btn btn-primary" type="submit" id="btnSendMessage">
                  {"Send"}
                </button>
              </div>
            </form>
          </div>
        </section>
        <section id="view-appointments" className="hidden" aria-labelledby="pageTitle">
          <div className="panel">
            <div className="card-head">
              <h2>
                {"Appointments"}
              </h2>
              <button className="btn" type="button" id="btnRefreshAppt">
                {"Refresh"}
              </button>
            </div>
            <p className="muted-note">
              {"\n                        Consultation requests from students. Confirming a time does not\n                        notify the student automatically: reply in Messages so they see\n                        it, which is also their copy of the arrangement.\n                    "}
            </p>
            <div className="table-wrap">
              <table>
                <caption className="sr-only">
                  {"Consultation requests"}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">
                      {"Student"}
                    </th>
                    <th scope="col">
                      {"Topic"}
                    </th>
                    <th scope="col">
                      {"Preferred"}
                    </th>
                    <th scope="col">
                      {"Mode"}
                    </th>
                    <th scope="col">
                      {"Status"}
                    </th>
                    <th scope="col">
                      {"Action"}
                    </th>
                  </tr>
                </thead>
                <tbody id="apptBody">
                  <tr>
                    <td colSpan={6} className="empty-cell">
                      {"Loading requests…"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div id="apptEmpty" className="empty-cell" hidden>
              {"\n                        No consultation requests.\n                    "}
            </div>
          </div>
          <div className="panel hidden" id="apptDetailCard">
            <div className="card-head">
              <h2 id="apptDetailTitle">
                {"Request"}
              </h2>
              <button className="btn" type="button" id="btnCloseApptDetail">
                {"Close"}
              </button>
            </div>
            <dl className="appt-detail" id="apptDetail" />
            <form id="apptActionForm">
              <div className="appt-when">
                <div className="field">
                  <label htmlFor="apptStatus">
                    {"Status"}
                  </label>
                  <select id="apptStatus">
                    <option value="pending">
                      {"Pending"}
                    </option>
                    <option value="confirmed">
                      {"Confirmed"}
                    </option>
                    <option value="declined">
                      {"Declined"}
                    </option>
                    <option value="completed">
                      {"Completed"}
                    </option>
                    <option value="no_show">
                      {"No show"}
                    </option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="apptDate">
                    {"Confirmed date"}
                  </label>
                  <input type="date" id="apptDate" />
                </div>
                <div className="field">
                  <label htmlFor="apptTime">
                    {"Confirmed time"}
                  </label>
                  <input type="time" id="apptTime" step="300" />
                  <p className="field-hint">
                    {"Manila time (UTC+8)."}
                  </p>
                </div>
              </div>
              <p className="muted-note" id="apptTimeNote" />
              <div className="field">
                <label htmlFor="apptNote">
                  {"Note to the student"}
                </label>
                <textarea id="apptNote" rows={2} maxLength={500} placeholder="Shown in the student's portal, e.g. bring your registration form." />
              </div>
              <div className="appt-actions">
                <button className="btn" type="button" id="btnApptMessage">
                  {"Message student"}
                </button>
                <button className="btn btn-primary" type="submit" id="btnApptSave">
                  {"Save"}
                </button>
              </div>
              <p className="muted-note" id="apptSaveNote" />
            </form>
          </div>
        </section>
      </main>
    </div>
    <dialog id="offerModal" aria-labelledby="offerModalTitle" aria-describedby="offerModalSub"
      className="m-auto w-[420px] max-w-[calc(100%-2rem)] rounded-xl border border-solid border-[var(--line)] bg-[var(--white)] p-6 text-[var(--ink-900)] shadow-lg backdrop:bg-black/50">
      <h3 id="offerModalTitle" className="mb-1 font-bold">Offer a Subject</h3>
      <p id="offerModalSub" className="mb-4 text-sm text-[var(--ink-600)]" />
      <label className="mb-1 block text-xs font-bold text-[var(--ink-600)]" htmlFor="offerCategory">Category</label>
      <select id="offerCategory" className="mb-3 w-full" autoFocus>
        <option value="ALL">All</option>
        <option value="MAJOR">Major</option>
        <option value="GE">GE</option>
      </select>
      <label className="mb-1 block text-xs font-bold text-[var(--ink-600)]" htmlFor="offerSubject">Subject</label>
      <select id="offerSubject" className="w-full" />
      <p id="offerSaveError" className="mt-2 text-sm text-[var(--danger)] empty:hidden" role="alert" />
      <div className="mt-5 flex flex-wrap justify-end gap-2.5">
        <button className="btn btn-ghost" id="btnCancelOffer" type="button">Cancel</button>
        <button className="btn btn-primary" id="btnConfirmOffer" type="button">Confirm Offer</button>
      </div>
    </dialog>
    <div id="toastHost" className="toast-host" role="status" aria-live="polite" />
  </>;
}
