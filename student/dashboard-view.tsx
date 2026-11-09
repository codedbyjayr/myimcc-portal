import { CorLoadMessage } from './cor-view';
import { BillingContent } from './billing-view';
import { avatarClass, StudentProfile } from './profile-view';
import { StudentActivity, StudentSummary } from './summary-view';

export function EnrollmentCourses({ courses, selected, disabled }: {
  courses: { offering_id: string; code: string; title: string; units: number; instructor_name?: string;
    schedule?: string; enrollment_open: boolean; enrollmentStatus?: string; reviewNote?: string }[];
  selected: Set<string>;
  disabled: boolean;
}) {
  if (!courses.length) return <p className="text-sm text-[var(--ink-500)]">
    No subjects are available for your program and year in this term. Please check with your dean or registrar.
  </p>;
  return <>{courses.map(course => {
    const status = course.enrollmentStatus;
    const unavailable = disabled || !course.enrollment_open || ['pending', 'approved', 'enrolled', 'completed'].includes(status || '');
    const note = status === 'pending' ? 'Awaiting staff/dean approval'
      : status === 'enrolled' ? 'Enrolled'
      : status === 'approved' ? 'Approved'
      : status === 'rejected' ? `Request rejected — you may submit again${course.reviewNote ? `: ${course.reviewNote}` : ''}` : '';
    return <label key={course.offering_id} data-id={course.offering_id}
      className="mb-2.5 flex flex-wrap items-start gap-x-3 gap-y-2 rounded-xl border border-solid border-[var(--line)] px-4 py-3.5 has-checked:border-[var(--pink-200)] has-checked:bg-[var(--pink-50)] has-[:enabled]:cursor-pointer">
      <input type="checkbox" value={course.offering_id} aria-label={`${course.code} — ${course.title}`}
        defaultChecked={selected.has(course.offering_id)} disabled={unavailable}
        className="mt-0.5 size-5 shrink-0 accent-[var(--pink-600)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pink-600)]" />
      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
        <span className="block text-[13px] font-extrabold text-[var(--pink-600)]">{course.code}</span>
        <span className="block text-sm font-bold">{course.title}</span>
        {note && <span className="block text-xs text-[var(--ink-500)]">{note}</span>}
        <span className="block text-xs text-[var(--ink-500)]">{course.instructor_name || 'TBA'} · {course.schedule || 'Schedule TBA'}</span>
      </span>
      <span className="ml-auto text-xs text-[var(--ink-500)]">{course.units} units</span>
    </label>;
  })}</>;
}

export function GradeTerms({ terms }: {
  terms: { key: string; semester: string; school_year: string }[];
}) {
  return <>
    {terms.map(term => <option key={term.key} value={term.key}>{term.semester} — {term.school_year}</option>)}
  </>;
}

export function StudentGradeRows({ rows }: {
  rows: { code: string; title: string; instructor: string; units: number | string; periods: (string | null)[];
    final: string | null; equivalent: string; description: string; estimate: string; remark: string }[];
}) {
  if (!rows.length) return <tr><td colSpan={11} className="p-9! text-center text-[13px] text-[var(--ink-400)]">
    No grades recorded for this term yet. Once faculty encodes your grades, they will appear here.
  </td></tr>;

  return <>{rows.map((row, index) => <tr key={index}>
    <td className="or-num">{row.code}</td>
    <td>{row.title}</td>
    <td className="text-[var(--ink-500)]">{row.instructor}</td>
    <td>{row.units}</td>
    {row.periods.map((grade, period) => <td key={period}>
      {grade === null ? <span className="italic text-[var(--ink-300)]">—</span>
        : <span className="font-bold text-[var(--blue)]">{grade}</span>}
    </td>)}
    <td className={row.final === null ? 'italic text-[var(--ink-300)]' : 'font-bold text-[var(--green)]'}>{row.final ?? 'Pending'}</td>
    <td className="font-extrabold">{row.equivalent}<small className="block font-normal">{row.description}</small></td>
    <td><span className="inline-flex rounded-xl border border-solid border-[var(--pink-200)] bg-[var(--pink-50)] px-2 py-0.5 text-xs font-semibold text-[var(--pink-600)]">{row.estimate}</span></td>
    <td><span className={row.remark === 'Passed' ? 'badge badge-green' : 'badge badge-blue'}>{row.remark}</span></td>
  </tr>)}</>;
}

export function GradeInsight({ average, weakest }: { average: number | null; weakest?: { code: string; title: string } }) {
  if (average === null) return <>Estimates need school grades from completed periods and valid subject units. Legacy records require review.</>;
  return <>Estimated unit-weighted GWA of <b>{average.toFixed(2)}</b> — <b>{average <= 3 ? 'Estimated passing average' : 'Estimated average below passing'}</b>.
    {weakest && ` Focus on ${weakest.code} (${weakest.title}) for improvement.`}</>;
}

const clearanceStatuses = {
  cleared: { label: 'Cleared', badge: 'badge-green', dot: 'bg-[var(--green)]', detail: 'Digitally Signed & Cleared' },
  pending: { label: 'Pending', badge: 'badge-amber', dot: 'bg-[var(--amber)]', detail: 'Awaiting Department Review' },
  action_required: { label: 'Action Required', badge: 'badge-red', dot: 'bg-[var(--red)]', detail: 'Student Action Required' },
};

const clearanceOfficeIcons = [
  [/cashier|finance|accounting/i, 'cashier', 'text-[var(--green)]'],
  [/\bdsa\b|student affairs/i, 'dsa', 'text-[var(--pink-600)]'],
  [/dean/i, 'dean', 'text-[var(--pink-600)]'],
  [/guidance/i, 'guidance', 'text-[var(--amber)]'],
  [/lab|nursing arts|cybershack/i, 'laboratory', 'text-[var(--blue)]'],
  [/\blib\b|library/i, 'library', 'text-[var(--green)]'],
  [/medical|dental|clinic/i, 'medical', 'text-[var(--blue)]'],
  [/property|custodian/i, 'property', 'text-[var(--amber)]'],
  [/registrar|\breg\b/i, 'registrar', 'text-[var(--pink-600)]'],
  [/rotc|cwts/i, 'rotc', 'text-[var(--amber)]'],
] as const;

export function ClearanceCards({ departments }: {
  departments: { id?: string; department_code: string; department_name: string; status: string; officer_name?: string; note?: string | null }[];
}) {
  if (!departments.length) return <p className="col-span-full rounded-xl border border-dashed border-[var(--line)] bg-[var(--card)] p-[30px] text-center text-[var(--ink-500)]">
    No clearance records found for this term.
  </p>;

  return <>{departments.map(department => {
    const { department_code, department_name, status, officer_name, note } = department;
    const officeNote = note?.trim();
    const meta = clearanceStatuses[status === 'cleared' || status === 'action_required' ? status : 'pending'];
    const [, icon = 'registrar', color = 'text-[var(--pink-600)]'] =
      clearanceOfficeIcons.find(([office]) => office.test(`${department_code} ${department_name}`)) ?? [];
    return <div key={department.id ?? department_name} data-clearance-office={department_code}
      className="min-w-0 rounded-[14px] border border-solid border-[var(--line)] bg-[var(--card)] p-[18px] shadow-[var(--shadow-sm)]">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span aria-hidden="true" className={`flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-[var(--bg)] ${color}`}>
            <span data-office-icon={icon} className="size-[26px] bg-current mask-contain mask-center mask-no-repeat"
              style={{ maskImage: `url("icons/clearance/${icon}.png")` }} />
          </span>
          <div className="min-w-0 [overflow-wrap:anywhere]">
            <div className="text-[15px] font-bold text-[var(--ink-900)]">{department_name}</div>
            <div className="text-xs text-[var(--ink-500)]">{officer_name}</div>
          </div>
        </div>
        <span className={`badge shrink-0 ${meta.badge}`}>{meta.label}</span>
      </div>
      {(officeNote || status !== 'cleared') && <div className="mt-3 mb-2 rounded-lg bg-[var(--bg)] px-3 py-2.5 text-[13px] text-[var(--ink-700)]">
        <p className="m-0 font-semibold">{status === 'cleared' ? 'Office note' : 'Clearance requirements'}</p>
        <p className="m-0 mt-1 whitespace-pre-wrap [overflow-wrap:anywhere]">{officeNote || 'No requirements posted yet.'}</p>
      </div>}
      <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-500)]">
        <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${meta.dot}`} />{meta.detail}
      </div>
    </div>;
  })}</>;
}

export function ProspectusContent({ completionPercentage, unitsCompleted, totalUnits, bySemester }: {
  completionPercentage: number;
  unitsCompleted: number;
  totalUnits: number;
  bySemester: { year: number; semester: number; semesterLabel: string; courses: {
    code: string; title: string; units: number; lecUnits?: number | null; labUnits?: number | null;
    prerequisites?: string | null; isMajor: boolean; completed: boolean; enrolled: boolean; grade: string | null;
  }[] }[];
}) {
  return <>
    <div className="mb-6">
      <div role="progressbar" aria-labelledby="prospectusProgressText" aria-valuenow={completionPercentage}
        className="h-[9px] overflow-hidden rounded-full bg-[var(--line)]">
        <div className="h-full rounded-full bg-[var(--pink-600)]" style={{ width: `${completionPercentage}%` }} />
      </div>
      <p id="prospectusProgressText" className="mt-1 mb-0 text-xs font-bold text-[var(--ink-500)]">
        Overall Curriculum Completion: {completionPercentage}% ({unitsCompleted} / {totalUnits} units)
      </p>
    </div>
    {bySemester.map(term => <section key={`${term.year}-${term.semester}`} className="mb-5">
      <h3 className="mt-0 mb-3 flex items-center gap-1.5 border-0 border-b-2 border-solid border-[var(--line)] py-2.5 text-[15px] font-extrabold text-[var(--pink-600)]">
        <svg aria-hidden="true" className="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
        {term.semesterLabel}
      </h3>
      <ul className="m-0 list-none space-y-2 p-0">
        {term.courses.map(course => <li key={course.code}
          className={`flex items-center gap-2 rounded-[10px] border border-solid px-3 py-3 sm:gap-3 sm:px-3.5 ${course.completed
            ? 'border-[var(--green)] bg-[var(--green-bg)]' : 'border-[var(--line)] bg-[var(--card)]'} ${course.isMajor
            ? 'border-l-4 border-l-[var(--pink-600)]' : ''}`}>
          <span aria-hidden="true" className={`flex size-[22px] shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${course.completed
            ? 'bg-[var(--green)] text-[var(--card)]' : 'border-2 border-solid border-[var(--line)] text-[var(--ink-500)]'}`}>
            {course.completed ? '✓' : course.enrolled ? '⏳' : '○'}
          </span>
          <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-xs font-extrabold tracking-wide text-[var(--pink-600)]">{course.code}</span>
              {course.isMajor && <span className="rounded-xl bg-[var(--pink-600)] px-2 py-0.5 text-[10px] font-extrabold text-[var(--card)]">Major</span>}
              {course.prerequisites && course.prerequisites !== 'None' && <span className="rounded border border-solid border-[var(--line)] bg-[var(--bg)] px-1.5 text-[10px] text-[var(--ink-500)]">Prereq: {course.prerequisites}</span>}
            </div>
            <div className="mt-0.5 mb-[3px] text-[13px] font-bold text-[var(--ink-800)]">{course.title}</div>
            <div className="text-[11px] text-[var(--ink-500)]">
              {[course.lecUnits != null ? `${course.lecUnits} Lec` : '', course.labUnits ? `${course.labUnits} Lab` : ''].filter(Boolean).join(' · ')}
              {course.completed ? <span className="block">Completed{course.grade && <> · Final Grade: <strong>{course.grade}</strong></>}</span>
                : <span className="block">{course.enrolled ? 'Currently Enrolled' : 'Pending'}</span>}
            </div>
          </div>
          <div className="shrink-0 text-xs font-extrabold text-[var(--ink-700)] sm:text-[13px]">{course.units} Units</div>
        </li>)}
      </ul>
    </section>)}
  </>;
}

export default function DashboardView() {
  return <>
    <div className="app">
      <div className="sidebar-overlay" id="sidebarOverlay" />
      <aside className="sidebar" id="sidebar">
        <div className="brand">
          <div className="brand-mark">
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
            <div className="brand-name">
              {"MyIMCC"}
            </div>
            <div className="brand-sub">
              {"Student Portal"}
            </div>
          </div>
          <button className="sidebar-close-btn" id="sidebarCloseBtn" aria-label="Close Navigation" type="button">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="user-chip">
          <div className={avatarClass} id="sidebarAvatar" />
          <div>
            <div className="name" id="sidebarName">
              <span className="imcc-skel imcc-skel-inline" style={{"width":"110px","height":"16px"}} />
            </div>
            <div className="id" id="sidebarStudentNo">
              <span className="imcc-skel imcc-skel-inline" style={{"width":"70px","height":"12px"}} />
            </div>
          </div>
        </div>
        <div className="nav-label">
          {"Main Menu"}
        </div>
        <button className="nav-item" data-page="enrollment">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 20l9-5-9-5-9 5 9 5z" />
            <path d="M12 12L3 7l9-5 9 5-9 5z" />
          </svg>
          {"\n        Enrollment / Advising\n      "}
        </button>
        <button className="nav-item active" data-page="dashboard">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="9" rx="1.5" />
            <rect x="14" y="3" width="7" height="5" rx="1.5" />
            <rect x="14" y="12" width="7" height="9" rx="1.5" />
            <rect x="3" y="16" width="7" height="5" rx="1.5" />
          </svg>
          {"\n        Dashboard\n      "}
        </button>
        <button className="nav-item soon" type="button" disabled title="Coming soon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M3 10h18" />
          </svg>
          {"\n        Billing & History\n        "}
          <span className="soon-badge">Coming soon</span>
        </button>
        <button className="nav-item" data-page="grades">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          {"\n        Grades & Evaluation\n      "}
        </button>
        <button className="nav-item" data-page="clearance">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" />
            <path d="M8 12l3 3 5-6" />
          </svg>
          {"\n        Online Clearance\n      "}
        </button>
        <button className="nav-item" data-page="cor" id="corNavBtn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
            <path d="M16 13H8" />
            <path d="M16 17H8" />
          </svg>
          {"\n        Certificate (COR)\n      "}
        </button>
        <div className="nav-label">
          {"Quick Links"}
        </div>
        <div id="ssoLinksNav" />
        <div className="nav-label">
          {"Academics"}
        </div>
        <button className="nav-item soon" type="button" disabled title="Coming soon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
          {"\n        Attendance\n        "}
          <span className="soon-badge">
            {"Coming soon"}
          </span>
        </button>
        <button className="nav-item soon" type="button" disabled title="Coming soon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z" />
          </svg>
          {"\n        Faculty Evaluation\n        "}
          <span className="soon-badge">
            {"Coming soon"}
          </span>
        </button>
        <div className="nav-label">
          {"Account"}
        </div>
        <button className="nav-item soon" type="button" disabled title="Coming soon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" />
            <path d="M9.2 9a2.8 2.8 0 015.6 0c0 1.9-2.8 2.4-2.8 2.4" />
            <path d="M12 17h.01" />
          </svg>
          {"\n        Help\n        "}
          <span className="soon-badge">
            {"Coming soon"}
          </span>
        </button>
        <button className="nav-item soon" type="button" disabled title="Coming soon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 4h16v12H8l-4 4z" />
            <path d="M8 9h8M8 12h5" />
          </svg>
          {"\n        Messages\n        "}
          <span className="soon-badge">
            {"Coming soon"}
          </span>
        </button>
        <button className="nav-item" data-page="profile">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="8" r="5" />
            <path d="M20 21a8 8 0 00-16 0" />
          </svg>
          {"\n        My Profile\n      "}
        </button>
        <div className="sidebar-foot" id="sidebarFoot">
          {"\n        —"}
          <br />
          {"—\n      "}
        </div>
      </aside>
      <div className="main">
        <div className="banner" id="topBanner">
          {"Loading announcements…"}
        </div>
        <div className="topbar">
          <div className="topbar-left">
            <button className="menu-toggle" id="menuToggle" aria-label="Open Navigation" type="button">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <line x1="4" y1="6" x2="20" y2="6" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="18" x2="20" y2="18" />
              </svg>
            </button>
            <div className="page-title" id="pageTitle">
              {"Dashboard"}
            </div>
          </div>
          <div className="topbar-right">
            <div className="search">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4-4" />
              </svg>
              {"\n            Search portal...\n          "}
            </div>
            <div className="user-menu-wrap">
              <button className="icon-btn" id="bellBtn" title="Notifications" aria-label="Notifications">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 8a6 6 0 0112 0c0 5 2 6 2 6H4s2-1 2-6" />
                  <path d="M10 20a2 2 0 004 0" />
                </svg>
                <span className="dot" id="notifDot" aria-hidden="true" />
              </button>
              <div className="dropdown" id="bellDropdown" style={{"minWidth":"270px"}}>
                <div className="notif-title">
                  {"NOTIFICATIONS"}
                </div>
                <div id="notifList">
                  <div className="notif-item">
                    <div className="t">
                      <span className="imcc-skel imcc-skel-inline" style={{"width":"150px","height":"13px"}} />
                    </div>
                    <div className="d">
                      <span className="imcc-skel imcc-skel-inline" style={{"width":"90px","height":"11px"}} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <button className="theme-toggle" id="themeToggle">
              <svg id="themeIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z" />
              </svg>
              <span id="themeLabel">
                {"Dark"}
              </span>
            </button>
            <div className="user-menu-wrap">
              <button className="user-btn" id="userBtn">
                <div className={`${avatarClass} size-[30px]! text-[11px]!`} id="topAvatar" />
                <span id="topName">
                  {"Student"}
                </span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              <div className="dropdown" id="userDropdown">
                <button className="ddi" type="button" data-goto="cor">
                  {"View & Print COR"}
                </button>
                <button className="ddi" id="mfaSetupBtn">
                  {"Setup Google MFA"}
                </button>
                <a href="#" className="ddi" data-chat-open="true">
                  {"Help & Support"}
                </a>
                <button className="ddi" id="signOutBtn" style={{"color":"var(--red)","borderTop":"1px solid var(--line)","marginTop":"4px","paddingTop":"10px"}}>
                  {"Sign\n                Out"}
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="content">
          <section className="page active" id="page-dashboard">
            <div className="hero">
              <div>
                <h2 id="heroGreeting">
                  {"Welcome!"}
                </h2>
                <p id="heroSubtitle">
                  <span className="imcc-skel imcc-skel-inline" style={{"width":"170px","height":"14px"}} />
                </p>
                <div className="meta" id="sidebarMeta" />
              </div>
              <div className="hero-actions">
                <button className="btn btn-solid-w" data-goto="enrollment">
                  {"Enroll Now"}
                </button>
              </div>
            </div>
            <div id="dashboardSummary"><StudentSummary /></div>
            <div className="grid-2">
              <div className="card card-pad">
                <div className="card-head">
                  <h3>
                    {"Recent Activity"}
                  </h3>
                </div>
                <div id="activityList"><StudentActivity /></div>
              </div>
              <div className="card card-pad" id="deadlinesCard">
                <div className="card-head">
                  <h3>
                    {"Upcoming Deadlines"}
                  </h3>
                </div>
                <div className="deadline">
                  <div className="deadline-top">
                    <span className="t">
                      <span className="imcc-skel imcc-skel-inline" style={{"width":"140px","height":"14px"}} />
                    </span>
                    <span className="pill pill-soft">
                      <span className="imcc-skel imcc-skel-inline" style={{"width":"36px","height":"12px"}} />
                    </span>
                  </div>
                  <div className="d" style={{"color":"var(--ink-500)"}}>
                    <span className="imcc-skel imcc-skel-inline" style={{"width":"90px","height":"12px"}} />
                  </div>
                </div>
              </div>
            </div>
            <div style={{"height":"22px"}} />
            <div className="quick-grid">
              <button className="quick-card" data-goto="enrollment">
                <div className="quick-icon">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="M2 9h20M9 9v11" />
                  </svg>
                </div>
                <div className="t">
                  {"Enrollment"}
                </div>
                <div className="d">
                  {"Manage subject enrollment"}
                </div>
              </button>
              <button className="quick-card" data-goto="grades">
                <div className="quick-icon">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="9" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </div>
                <div className="t">
                  {"Grades"}
                </div>
                <div className="d">
                  {"Grades & Grade estimate"}
                </div>
              </button>
              <button className="quick-card" data-goto="clearance">
                <div className="quick-icon">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M8 12l3 3 5-6" />
                  </svg>
                </div>
                <div className="t">
                  {"Clearance"}
                </div>
                <div className="d">
                  {"Track department clearances"}
                </div>
              </button>
            </div>
          </section>
          <section className="page" id="page-enrollment">
            <div className="flex flex-wrap items-end gap-3">
              <label className="grid min-w-0 gap-1 text-sm font-bold" htmlFor="enrollmentTerm">
                Enrollment term
                <select id="enrollmentTerm" className="field-input min-w-0" />
              </label>
              <button type="button" id="refreshEnrollment" className="btn btn-ghost">Refresh enrollment</button>
            </div>
            <p id="enrollmentLockStatus" className="my-3 text-sm text-[var(--ink-600)]" role="status" />
            <div className="mb-5 flex flex-wrap items-center gap-2.5" id="enrollSteps">
              {['Course Selection', 'Confirmation'].map((label, index) =>
                <div key={label} id={`stepTab${index + 1}`}
                  className={`group flex items-center gap-2 text-sm font-bold text-[var(--ink-500)] [&.active]:text-[var(--pink-600)] ${index === 0 ? 'active' : ''}`}>
                  <span className="grid size-[26px] place-items-center rounded-full bg-[var(--line)] text-xs group-[.active]:bg-[var(--pink-600)] group-[.done]:bg-[var(--green)] group-[.active]:text-white group-[.done]:text-white">{index + 1}</span>
                  {label}
                </div>
              )}
            </div>
            <div className="card card-pad mb-4" id="enrollmentCompleteNote" hidden>
              <strong>
                {"Enrollment complete for this term."}
              </strong>
              <span className="text-[var(--ink-500)]">
                {" Your approved subjects are listed below. View your class schedule or Certificate of Registration from the Academics menu."}
              </span>
            </div>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <div>
                <div className="card card-pad" id="enrollStep1">
                  <div className="card-head">
                    <h3 id="enrollmentSectionTitle">
                      {"Available Courses"}
                    </h3>
                  </div>
                  <div id="courseList" />
                </div>
                <div className="card card-pad" id="enrollStep2" style={{"display":"none"}}>
                  <div className="px-5 py-10 text-center">
                    <div className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-[var(--green-bg)] text-[var(--green)]">
                      <svg aria-hidden="true" className="size-[30px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    </div>
                    <h3 className="mb-2">
                      {"Enrollment Request Submitted!"}
                    </h3>
                    <p className="mx-auto mb-5 max-w-[420px] text-sm text-[var(--ink-500)]">
                      {"Your subjects are awaiting staff/dean approval. Units will appear after approval. Check the enrollment page for request status."}
                    </p>
                    <button className="btn btn-primary" data-goto="dashboard">
                      {"Go to Dashboard"}
                    </button>
                  </div>
                </div>
              </div>
              <div className="card card-pad self-start lg:sticky lg:top-[90px]" id="enrollmentSummary">
                <div className="card-head">
                  <h3>
                    {"Selected Subjects"}
                  </h3>
                </div>
                <div className="text-sm text-[var(--ink-500)]" id="enrollmentSelectionCount">
                  {"0 units · 0 subjects"}
                </div>
                <p className="muted-note">
                  {"Submit your selected subjects for staff/dean approval."}
                </p>
                <button className="btn btn-primary mt-4 w-full justify-center" type="button" id="proceedBtn" disabled>
                  {"Enroll Now →"}
                </button>
              </div>
            </div>
          </section>
          <section className="page" id="page-billing">
            <div id="billingContent"><BillingContent money={String} date={String} /></div>
          </section>
          <section className="page" id="page-grades">
            <div className="grid-4">
              <div className="stat">
                <div className="stat-top">
                  <span className="stat-label">
                    {"CURRENT GWA"}
                  </span>
                </div>
                <div className="stat-value" id="grade-gwa">
                  {"—"}
                </div>
                <div className="stat-sub" id="grade-gwa-sub">
                  {"Loading…"}
                </div>
              </div>
              <div className="stat [border-left-color:var(--green)]!">
                <div className="stat-top">
                  <span className="stat-label">
                    {"HIGHEST GRADE"}
                  </span>
                </div>
                <div className="stat-value text-[var(--green)]!" id="grade-highest">
                  {"—"}
                </div>
                <div className="stat-sub" id="grade-highest-course">
                  {"Loading…"}
                </div>
              </div>
              <div className="stat c3">
                <div className="stat-top">
                  <span className="stat-label">
                    {"ESTIMATED GWA"}
                  </span>
                </div>
                <div className="stat-value" id="grade-ai">
                  {"—"}
                </div>
                <div className="stat-sub">
                  {"Available school grades · weighted by units"}
                </div>
              </div>
              <div className="stat [border-left-color:var(--blue)]!">
                <div className="stat-top">
                  <span className="stat-label">
                    {"SUBJECTS COMPLETED"}
                  </span>
                </div>
                <div className="stat-value text-[var(--blue)]!" id="grade-completed">
                  {"—"}
                </div>
                <div className="stat-sub">
                  {"Final grades released"}
                </div>
              </div>
            </div>
            <div className="card card-pad">
              <div className="card-head flex-col items-stretch! gap-4">
                <h3 id="gradesTitle">
                  <span id="gradesTitleText">Grades — Loading…</span>
                  <br />
                  <span className="text-xs font-medium text-[var(--ink-500)]" id="gradesSubtitle">Loading program info…</span>
                </h3>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-0 flex-[1_1_100%] min-[641px]:flex-[0_1_260px]">
                    <label className="mb-1.5 block text-xs font-bold text-[var(--ink-500)]" htmlFor="gradeTermSelect">Semester</label>
                    <select id="gradeTermSelect" className="field-input" />
                  </div>
                  <div className="min-w-0 flex-[1_1_100%] min-[641px]:flex-[0_1_260px]">
                    <label className="mb-1.5 block text-xs font-bold text-[var(--ink-500)]" htmlFor="gradeYearFilter">Year level</label>
                    <select id="gradeYearFilter" className="field-input">
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
                  </div>
                  <button className="btn btn-outline ml-auto w-full min-[641px]:w-auto" id="prospectusBtn" type="button">
                    {"View Degree Prospectus"}
                  </button>
                </div>
              </div>
              <div className="table-responsive">
                <table className="min-table-900">
                  <thead>
                    <tr>
                      <th>
                        {"SUBJECT CODE"}
                      </th>
                      <th>
                        {"COURSE TITLE"}
                      </th>
                      <th>
                        {"INSTRUCTOR"}
                      </th>
                      <th>
                        {"UNITS"}
                      </th>
                      <th>
                        {"PRE-LIM"}
                      </th>
                      <th>
                        {"MIDTERM"}
                      </th>
                      <th>
                        {"SEMI-FINALS"}
                      </th>
                      <th>
                        {"FINALS"}
                      </th>
                      <th>
                        {"EQUIVALENT"}
                      </th>
                      <th>
                        {"GRADE ESTIMATE"}
                      </th>
                      <th>
                        {"REMARK"}
                      </th>
                    </tr>
                  </thead>
                  <tbody id="gradesBody">
                    <tr><td colSpan={11} className="p-9! text-center text-[13px] text-[var(--ink-400)]"><span id="gradesLoadMessage" role="status">Loading grades…</span></td></tr>
                  </tbody>
                </table>
              </div>
              <div className="mt-5 flex gap-3.5 rounded-[14px] border border-solid border-[var(--pink-200)] bg-[var(--pink-50)] px-5 py-[18px]">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--pink-600)]">
                  <svg className="size-[18px]" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                    <rect x="4" y="8" width="16" height="12" rx="2" />
                    <path d="M8 8V5a4 4 0 018 0v3" />
                    <circle cx="9" cy="14" r="1" />
                    <circle cx="15" cy="14" r="1" />
                  </svg>
                </div>
                <div>
                  <h4 className="m-0 mb-1 text-sm font-bold text-[var(--pink-700)]">
                    {"Grade Estimate Insights"}
                  </h4>
                  <p id="aiInsightText" className="m-0 text-[13px] leading-[1.6] text-[var(--ink-700)]">
                    {"Loading grade estimate\n                  insights…"}
                  </p>
                  <div className="mt-2 text-[11px] text-[var(--ink-500)]">
                    {"Grade estimates are based\n                  on the equal-weight average of available school grades. Conditional grades and legacy percentage records are excluded. This is an estimate, not a validated AI prediction or an official result."}
                  </div>
                </div>
              </div>
            </div>
          </section>
          <section className="page" id="page-clearance">
            <div className="mb-5 rounded-[var(--radius)] border border-solid border-[var(--line)] bg-[var(--card)] px-[22px] py-5 shadow-[var(--shadow)]">
              <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-2">
                <h3 className="m-0 text-[15px]">Overall Clearance Progress</h3>
                <span className="text-xl font-extrabold text-[var(--pink-600)]" id="clearFrac">—</span>
              </div>
              <div aria-hidden="true" className="h-[9px] overflow-hidden rounded-full bg-[var(--line)]">
                <div className="h-full rounded-full bg-[var(--pink-600)] transition-[width] duration-[400ms] motion-reduce:transition-none" id="clearFill" style={{ width: '0%' }} />
              </div>
              <div className="mt-2 text-xs text-[var(--ink-500)]" id="clearRemaining" role="status">
                Loading clearance status…
              </div>
            </div>
            <div id="clearanceLoadError" hidden className="rounded-xl border border-solid border-[var(--line)] bg-[var(--card)] p-4 text-sm">
              Clearance records are unavailable. <button className="mini-btn ml-1" type="button" id="retryClearance">Retry</button>
            </div>
            <div className="grid grid-cols-1 gap-3 min-[580px]:grid-cols-2 min-[580px]:gap-3.5 lg:grid-cols-3 lg:gap-4" id="deptGrid" />
            <div className="mt-5 flex flex-wrap items-center justify-between gap-5 text-xs text-[var(--ink-500)]">
              <div className="flex flex-wrap gap-x-[18px] gap-y-2">
                {Object.values(clearanceStatuses).map(({ label, dot }) => <span key={label} className="flex items-center gap-1.5">
                  <span aria-hidden="true" className={`size-2 rounded-full ${dot}`} />{label}
                </span>)}
              </div>
              <a href="icons/clearance/credits.html">Icon credits</a>
            </div>
          </section>
          <section className="page" id="page-cor">
            <div className="no-print mb-5 flex flex-col gap-4 min-[641px]:flex-row min-[641px]:flex-wrap min-[641px]:items-center min-[641px]:justify-between">
              <div>
                <div className="text-sm font-bold">Official Certificate of Registration</div>
                <div className="mt-0.5 text-xs text-[var(--ink-500)]">Auto-generated from your current enrollment and billing records</div>
              </div>
              <button type="button" className="btn btn-primary disabled:cursor-not-allowed disabled:opacity-60" id="corPrintBtn" disabled>
                <svg aria-hidden="true" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 9V2h12v7" />
                  <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
                  <path d="M6 14h12v8H6z" />
                </svg>
                {"\n            Print Certificate"}
              </button>
            </div>
            <div id="corDocContainer">
              <CorLoadMessage />
            </div>
          </section>
          <section className="page" id="page-help">
            <div className="card card-pad">
              <div className="card-head">
                <h3>
                  {"Help"}
                </h3>
              </div>
              <p className="msg-note">
                {"Use the chat button to ask about the portal. You can also book a consultation below."}
              </p>
              <button className="btn btn-primary" type="button" data-chat-open="true">
                {"Open assistant"}
              </button>
            </div>
            <div className="card card-pad" id="bookCard">
              <div className="card-head">
                <h3>
                  {"Book a consultation"}
                </h3>
              </div>
              <p className="msg-note">
                {"\n              Choose a date and a time that suits you. This is a request, not a fixed\n              booking: a member of the Registrar's Office confirms the time and replies\n              in Messages.\n            "}
              </p>
              <form id="bookForm">
                <div className="field">
                  <label htmlFor="bookTopic">
                    {"What is it about?"}
                  </label>
                  <select id="bookTopic" required>
                    <option value="">
                      {"Choose a topic…"}
                    </option>
                    <option value="enrollment">
                      {"Enrollment"}
                    </option>
                    <option value="grades">
                      {"Grades & Evaluation"}
                    </option>
                    <option value="billing">
                      {"Billing & Payment"}
                    </option>
                    <option value="clearance">
                      {"Online Clearance"}
                    </option>
                    <option value="schedule">
                      {"Class Schedule"}
                    </option>
                    <option value="registration">
                      {"Registration"}
                    </option>
                    <option value="other">
                      {"Other"}
                    </option>
                  </select>
                </div>
                <div className="book-when">
                  <div className="field">
                    <label htmlFor="bookDate">
                      {"Preferred date"}
                    </label>
                    <input type="date" id="bookDate" required />
                  </div>
                  <div className="field">
                    <label htmlFor="bookTime">
                      {"Preferred time"}
                    </label>
                    <input type="time" id="bookTime" required step="300" />
                    <p className="field-hint">
                      {"Manila time (UTC+8)."}
                    </p>
                  </div>
                </div>
                <p className="muted-note" id="bookManilaNote" />
                <div className="field">
                  <label htmlFor="bookMode">
                    {"How would you like to meet?"}
                  </label>
                  <select id="bookMode" required>
                    <option value="in_person">
                      {"In person at the Registrar's Office"}
                    </option>
                    <option value="online">
                      {"Online"}
                    </option>
                    <option value="phone">
                      {"Phone call"}
                    </option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="bookNotes">
                    {"Anything staff should know?"}
                  </label>
                  <textarea id="bookNotes" rows={3} maxLength={1000} placeholder="Briefly describe the problem so staff can prepare." />
                </div>
                <div id="bookDeskWarning" className="msg-error" hidden />
                <div id="bookError" className="msg-error" hidden />
                <div className="msg-actions">
                  <button className="btn btn-primary" type="submit" id="bookSubmit">
                    {"Request consultation"}
                  </button>
                </div>
              </form>
              <div id="bookListWrap" className="book-list-wrap" hidden>
                <h4 className="book-list-title">
                  {"Your requests"}
                </h4>
                <div id="bookList" />
              </div>
            </div>
          </section>
          <section className="page" id="page-messages">
            <div className="card card-pad">
              <div className="card-head">
                <h3>
                  {"Messages"}
                </h3>
              </div>
              <p className="msg-note">
                {"\n                This is where the Registrar's Office replies to you. New\n                questions go to the portal assistant first, and anything it\n                cannot answer becomes a consultation request.\n              "}
              </p>
              <div className="msg-greeting" id="msgGreeting" hidden>
                <div className="msg-greeting-avatar" aria-hidden="true">
                  {"IM"}
                </div>
                <div className="msg-greeting-body">
                  <div className="msg-greeting-name">
                    {"Nothing here yet"}
                  </div>
                  <p>
                    {"\n                    Once you book a consultation, this is where the confirmed\n                    time and any replies from staff will appear.\n                  "}
                  </p>
                  <p className="msg-actions">
                    <button className="btn btn-primary" type="button" id="btnGotoHelp">
                      {"\n                      Ask the assistant\n                    "}
                    </button>
                    <button className="btn" type="button" id="btnGotoBooking">
                      {"\n                      Book a consultation\n                    "}
                    </button>
                  </p>
                  <p className="msg-greeting-meta">
                    {"\n                    Do not send personal or medical information over this channel.\n                  "}
                  </p>
                </div>
              </div>
              <div className="table-responsive">
                <table className="sched-table">
                  <caption className="sr-only">
                    {"Your conversations with school staff"}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">
                        {"From"}
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
                  <tbody id="msgThreadsBody">
                    <tr>
                      <td colSpan={4} className="table-empty">
                        {"Loading your messages…"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div id="msgEmpty" className="table-empty" hidden>
                {"\n                No conversations yet.\n              "}
              </div>
              <div className="msg-load-more">
                <button type="button" className="btn btn-outline" id="msgLoadMore" hidden>
                  {"\n                  Load older messages\n                "}
                </button>
                <p className="msg-note" id="msgOlderNote" hidden />
              </div>
            </div>
            <div className="card card-pad msg-thread hidden" id="msgThreadPanel" aria-live="polite">
              <div className="msg-thread-head">
                <div>
                  <div className="msg-peer" id="msgPeerName" />
                  <div className="msg-note" id="msgPeerMeta" />
                </div>
                <button className="mini-btn" type="button" id="btnCloseThread">
                  {"Close"}
                </button>
              </div>
              <div className="msg-history" id="msgHistory" />
              <form className="msg-reply" id="msgReplyForm">
                <label className="sr-only" htmlFor="msgReplyBody">
                  {"Reply"}
                </label>
                <textarea id="msgReplyBody" rows={3} required placeholder="Write a reply…" />
                <button className="btn btn-primary" type="submit" id="btnSendReply">
                  {"Send reply"}
                </button>
              </form>
            </div>
          </section>
          <section className="page" id="page-attendance">
            <div className="grid-4">
              <div className="stat">
                <div className="stat-top">
                  <span className="stat-label">
                    {"CLASSES TOTAL"}
                  </span>
                </div>
                <div className="stat-value" id="att-total">
                  {"—"}
                </div>
                <div className="stat-sub">
                  {"Scheduled sessions"}
                </div>
              </div>
              <div className="stat" style={{"borderLeftColor":"var(--green)"}}>
                <div className="stat-top">
                  <span className="stat-label">
                    {"PRESENT"}
                  </span>
                </div>
                <div className="stat-value" style={{"color":"var(--green)"}} id="att-present">
                  {"—"}
                </div>
                <div className="stat-sub">
                  {"Days attended"}
                </div>
              </div>
              <div className="stat" style={{"borderLeftColor":"var(--amber)"}}>
                <div className="stat-top">
                  <span className="stat-label">
                    {"LATE"}
                  </span>
                </div>
                <div className="stat-value" style={{"color":"var(--amber)"}} id="att-late">
                  {"—"}
                </div>
                <div className="stat-sub">
                  {"Late arrivals"}
                </div>
              </div>
              <div className="stat" style={{"borderLeftColor":"var(--red)"}}>
                <div className="stat-top">
                  <span className="stat-label">
                    {"ABSENT"}
                  </span>
                </div>
                <div className="stat-value" style={{"color":"var(--red)"}} id="att-absent">
                  {"—"}
                </div>
                <div className="stat-sub">
                  {"Missed classes"}
                </div>
              </div>
            </div>
            <div className="card card-pad">
              <div className="card-head">
                <h3>
                  {"Attendance History"}
                </h3>
              </div>
              <div className="table-responsive">
                <table>
                  <thead>
                    <tr>
                      <th>
                        {"Date"}
                      </th>
                      <th>
                        {"Course"}
                      </th>
                      <th>
                        {"Status"}
                      </th>
                      <th>
                        {"Notes"}
                      </th>
                    </tr>
                  </thead>
                  <tbody id="attBody">
                    <tr>
                      <td colSpan={4} style={{"textAlign":"center","padding":"20px","color":"var(--ink-300)"}}>
                        {"Loading attendance...\n                    "}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>
          <section className="page" id="page-evaluation">
            <div className="card card-pad" style={{"marginBottom":"18px"}}>
              <div className="card-head">
                <h3>
                  {"Faculty Evaluation"}
                </h3>
                <label htmlFor="evalYearFilter">
                  {"Filter by Year Level"}
                </label>
                <select id="evalYearFilter" className="field-input">
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
                <span className="pill pill-soft" id="evalTermPill" style={{"padding":"6px 12px"}}>
                  {"Loading…"}
                </span>
              </div>
              <p style={{"fontSize":"13px","color":"var(--ink-500)","marginTop":"-8px","marginBottom":"16px"}}>
                {"\n              Your feedback is "}
                <strong>
                  {"completely anonymous"}
                </strong>
                {". Instructors cannot see who submitted which\n              evaluation. Ratings are used to improve teaching quality. Please rate each instructor honestly based on\n              your\n              experience this semester.\n            "}
              </p>
              <div id="evalStatus" style={{"textAlign":"center","padding":"20px","color":"var(--ink-300)"}}>
                {"Loading evaluation forms…\n            "}
              </div>
              <div id="evalList" />
            </div>
          </section>
          <section className="page" id="page-profile">
            <StudentProfile />
          </section>
        </div>
      </div>
    </div>
    <div className="toast" id="toast">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M20 6L9 17l-5-5" />
      </svg>
      <span id="toastMsg" />
    </div>
    <button className="chat-fab" id="chatFab" type="button" popoverTarget="chatPanel" aria-label="Open Help assistant" aria-controls="chatPanel" aria-expanded="false" aria-haspopup="dialog">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
      </svg>
    </button>
    <div className="chat-panel" id="chatPanel" popover="auto" role="dialog" aria-labelledby="chatTitle">
      <div className="card-head">
        <h3 id="chatTitle">
          {"Portal Assistant"}
        </h3>
        <button className="btn btn-ghost" type="button" id="chatClose" popoverTarget="chatPanel" popoverTargetAction="hide" aria-label="Close assistant">
          {"×"}
        </button>
      </div>
      <details className="help-suggest" id="helpSuggestions" open>
        <summary>Common questions</summary>
        <div className="help-suggest-buttons">
        <button className="help-chip" type="button" data-ask="How do I enroll in a subject?">
          {"How do I enroll?"}
        </button>
        <button className="help-chip" type="button" data-ask="How do I check my grades?">
          {"How do I check my grades?"}
        </button>
        <button className="help-chip" type="button" data-ask="How do I get my online clearance?">
          {"Online clearance"}
        </button>
        <button className="help-chip" type="button" data-ask="How do I view my class schedule?">
          {"Class schedule"}
        </button>
        <button className="help-chip" type="button" data-ask="How do I see my balance and payment history?">
          {"Balance & payments"}
        </button>
        <button className="help-chip" type="button" data-ask="How do I get my Certificate of Registration?">
          {"Certificate of Registration"}
        </button>
        </div>
      </details>
      <div className="help-log" id="helpLog" role="log" aria-live="polite" aria-label="Conversation with the help assistant">
        <article className="msg-item msg-item-bot">
          <div className="msg-item-head">
            <span>
              {"Portal Assistant"}
            </span>
          </div>
          <div className="msg-item-body">
            {"\n          Ask me a question about the portal or school processes, for example\n          how to enroll or how to request your Certificate of Registration. I\n          answer from published articles and show you which one I used.\n        "}
          </div>
        </article>
      </div>
      <form className="msg-reply" id="helpForm">
        <label className="sr-only" htmlFor="helpInput">
          {"Your question"}
        </label>
        <textarea id="helpInput" rows={2} required maxLength={1000} placeholder="Ask a question…" />
        <button className="btn btn-primary" type="submit" id="helpSend">
          {"Ask"}
        </button>
      </form>
      <p className="help-footnote">
        I explain school processes. I cannot view or change your personal records.
      </p>
    </div>
    <div className="modal-backdrop" id="mfaModal" style={{"display":"none"}}>
      <div className="modal-card">
        <div style={{"display":"flex","justifyContent":"space-between","alignItems":"center","marginBottom":"16px"}}>
          <h3 style={{"margin":"0px","fontSize":"18px","color":"var(--ink-900)"}}>
            {"Google Authenticator (TOTP) MFA"}
          </h3>
          <button id="mfaCloseBtn" style={{"background":"none","fontSize":"24px","cursor":"pointer","color":"var(--ink-500)"}}>
            {"×"}
          </button>
        </div>
        <p style={{"fontSize":"13px","color":"var(--ink-500)","marginBottom":"16px"}}>
          {"Scan the QR code below using Google\n        Authenticator or Authy, then enter your 6-digit verification code."}
        </p>
        <div style={{"textAlign":"center","marginBottom":"16px"}}>
          <img id="mfaQrImg" alt="MFA QR Code" style={{"width":"160px","height":"160px","borderRadius":"8px","border":"1px solid var(--line)","background":"rgb(255, 255, 255)"}} />
          <div id="mfaSecretText" style={{"fontFamily":"monospace","fontWeight":"700","fontSize":"12px","marginTop":"8px","color":"var(--ink-700)","wordBreak":"break-all"}} />
        </div>
        <div style={{"marginBottom":"16px"}}>
          <label style={{"fontSize":"12px","fontWeight":"600","display":"block","marginBottom":"6px","color":"var(--ink-700)"}}>
            {"Enter\n          6-Digit Verification Code:"}
          </label>
          <input type="text" id="mfaCodeInput" className="field-input" maxLength={6} placeholder="123456" style={{"textAlign":"center","letterSpacing":"4px","fontWeight":"700","fontSize":"16px"}} />
        </div>
        <button id="mfaConfirmBtn" className="btn btn-primary" style={{"width":"100%","justifyContent":"center"}}>
          {"Verify &\n        Activate MFA"}
        </button>
      </div>
    </div>
    <dialog id="prospectusModal" aria-labelledby="prospectusTitle" aria-describedby="prospectusSubtitle"
      className="m-auto w-[calc(100%-20px)] max-w-[800px] overflow-hidden rounded-[18px] border-0 bg-[var(--card)] p-0 text-[var(--ink-900)] shadow-xl backdrop:bg-black/50 sm:w-[calc(100%-40px)]">
      <div className="flex max-h-[80dvh] flex-col">
        <header className="flex shrink-0 items-start justify-between gap-3 border-0 border-b border-solid border-[var(--line)] px-5 py-4 sm:px-7 sm:py-6">
          <div>
            <h2 id="prospectusTitle" className="mt-0 mb-1 text-xl font-extrabold">Degree Prospectus</h2>
            <p id="prospectusSubtitle" className="m-0 text-[13px] text-[var(--ink-500)]">Program Course Curriculum</p>
          </div>
          <button id="prospectusClose" type="button" aria-label="Close degree prospectus"
            className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-solid border-[var(--line)] bg-[var(--bg)] text-lg font-bold text-[var(--ink-700)] hover:bg-[var(--pink-50)] hover:text-[var(--pink-600)]">×</button>
        </header>
        <div id="prospectusContainer" className="min-h-0 overflow-y-auto overscroll-contain px-5 py-4 sm:px-7 sm:py-5" />
      </div>
    </dialog>
  </>;
}
