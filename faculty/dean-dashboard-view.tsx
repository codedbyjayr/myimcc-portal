import { GradeHistoryDialog } from './gradebook-view';

export function DeanEnrollmentStats({ students, programs, average, finals, retention, offerings }: {
  students: number; programs: number; average: string; finals: number; retention: number | null; offerings: number;
}) {
  const cards = [
    { label: 'TOTAL STUDENTS', value: students, sub: `Across ${programs} program${programs === 1 ? '' : 's'}`,
      icon: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0116 0" /></> },
    { label: 'AVG. DEPARTMENT GWA', value: average, sub: `From ${finals} recorded final${finals === 1 ? '' : 's'}`,
      icon: <><circle cx="12" cy="12" r="9" /><path d="M9 12l2 2 4-4" /></> },
    { label: 'RETENTION RATE', value: retention === null ? '—' : `${retention.toFixed(0)}%`,
      sub: retention === null ? 'Not enough term data yet' : 'Latest vs. prior term', icon: <path d="M3 12l6 6 12-12" /> },
    { label: 'ACTIVE OFFERINGS', value: offerings, sub: 'All recorded terms', icon: <path d="M22 10v6M2 10l10-5 10 5-10 5-10-5z" /> },
  ];
  return <>{cards.map(({ label, value, sub, icon }, index) => <div className={`stat c${index + 1}`} key={label}>
    <div className="stat-top"><span className="stat-label">{label}</span><div className="stat-icon">
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">{icon}</svg>
    </div></div>
    <div className="stat-value">{value}</div>
    <div className="stat-sub">{sub}</div>
  </div>)}</>;
}

export function DeanOverviewBars({ rows, empty }: {
  rows: { label: string; value: number | string; width: number; color?: 'ok' | 'danger' }[]; empty?: string;
}) {
  if (!rows.length) return <div className="empty-state">{empty}</div>;
  return <>{rows.map(({ label, value, width, color }) => <div className="bar-row" key={label}>
    <div className="bar-label" title={label}>{label}</div>
    <div className="bar-track" aria-hidden="true">
      <div className={`bar-fill ${color ?? ''}`} style={{ width: `${width.toFixed(0)}%` }} />
    </div>
    <div className="bar-value">{value}</div>
  </div>)}</>;
}

export function DeanPerformanceStats({ passed, failed, pending }: { passed: number; failed: number; pending: number }) {
  return <div className="grid grid-cols-3 gap-3">
    {([
      ['Passed', passed, 'border-l-[var(--green)]!', 'text-[var(--green)]!'],
      ['Failed', failed, 'border-l-[var(--red)]!', 'text-[var(--red)]!'],
      ['Pending', pending, 'border-l-[var(--amber)]!', 'text-[var(--amber)]!'],
    ] as const).map(([label, count, border, color]) => <div className={`stat ${border}`} key={label}>
      <div className="stat-label">{label}</div>
      <div className={`stat-value text-[22px]! ${color}`}>{count}</div>
    </div>)}
  </div>;
}

export function DeanFlaggedCourses({ rows }: {
  rows: { code: string | null; program?: string | null; total: number; failed: number }[];
}) {
  return <>{rows.map(({ code, program, total, failed }) => <tr key={code ?? 'Unknown'}>
    <td><b>{code}</b></td><td>{program || '—'}</td><td>{total}</td>
    <td><span className="badge badge-red">{(failed / total * 100).toFixed(0)}%</span></td>
  </tr>)}</>;
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
              {"Dean Portal"}
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
          <div className="avatar" id="sidebarAvatar" />
          <div>
            <div className="name" id="sidebarName">
              <span className="imcc-skel imcc-skel-inline" style={{"width":"110px","height":"16px"}} />
            </div>
            <div className="id" id="sidebarDept">
              <span className="imcc-skel imcc-skel-inline" style={{"width":"70px","height":"12px"}} />
            </div>
          </div>
        </div>
        <div className="nav-label">
          {"Main Menu"}
        </div>
        <a className="nav-item" href="../staff/enrollment-requests.html">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="5" y="4" width="14" height="18" rx="2" />
            <path d="M9 4V2h6v2M9 10h6M9 14h6M9 18h4" />
          </svg>
          <span>
            {"Enrollment Requests"}
          </span>
        </a>
        <button className="nav-item" data-page="records">
          {"View Records"}
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
        <button className="nav-item" data-page="classes">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 10v6M2 10l10-5 10 5-10 5-10-5z" />
            <path d="M6 12v5c0 1.5 3 3 6 3s6-1.5 6-3v-5" />
          </svg>
          {"\n        My Classes\n      "}
        </button>
        <button className="nav-item" data-page="faculty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="9" cy="8" r="3.2" />
            <path d="M3 20a6 6 0 0112 0" />
            <circle cx="18" cy="8" r="2.6" />
            <path d="M15.5 13.2A5 5 0 0121 20" />
          </svg>
          {"\n        Faculty & Schedule\n      "}
        </button>
        <button className="nav-item" data-page="compliance">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6l8-3z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
          {"\n        Student Compliance\n      "}
        </button>
        <div className="nav-label">
          {"Quick Links"}
        </div>
        <div id="ssoLinksNav" />
        <div className="nav-label">
          {"Account"}
        </div>
        <button className="nav-item" data-page="profile">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="8" r="5" />
            <path d="M20 21a8 8 0 00-16 0" />
          </svg>
          {"\n        My Profile\n      "}
        </button>
        <div className="sidebar-foot">
          {"\n        MyIMCC Portal"}
          <br />
          {"Dean Access\n      "}
        </div>
      </aside>
      <div className="main">
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
                <div className="avatar" id="topAvatar" style={{"width":"30px","height":"30px","fontSize":"11px"}} />
                <span id="topName">
                  {"Dean"}
                </span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              <div className="dropdown" id="userDropdown">
                <button className="ddi" type="button" data-goto="profile">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
                  </svg>
                  {"\n                My Profile"}
                </button>
                <button className="ddi" id="signOutBtn" style={{"color":"var(--red)","borderTop":"1px solid var(--line)","marginTop":"4px","paddingTop":"10px"}}>
                  {"Sign\n                Out"}
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="content">
          <section className="page active" id="page-dashboard">
            <div className="card card-pad" style={{"marginBottom":"16px"}}>
              <div className="card-head">
                <h3>
                  {"Enrollment Notifications"}
                </h3>
                <button type="button" className="btn btn-ghost" id="refreshEnrollmentNotifications">
                  {"Refresh"}
                </button>
              </div>
              <div id="enrollmentNotifications" aria-live="polite">
                {"Loading notifications…"}
              </div>
            </div>
            <div className="hero">
              <div>
                <h2>
                  {"Welcome!"}
                </h2>
                <p>
                  {"Enrollment, academic performance, and department health at a glance."}
                </p>
              </div>
              <div className="hero-actions">
                <button className="btn btn-solid-w" data-goto="faculty">
                  {"Assign Faculty"}
                </button>
              </div>
            </div>
            <div className="grid-4" id="enrollmentStats" />
            <div className="grid-2">
              <div className="card card-pad">
                <div className="card-head">
                  <div>
                    <h3>
                      {"Enrollment by Program"}
                    </h3>
                    <div className="sub">
                      {"Approved students per program"}
                    </div>
                  </div>
                </div>
                <div id="programBars" />
              </div>
              <div className="card card-pad">
                <div className="card-head">
                  <div>
                    <h3>
                      {"Semester Enrollment Trend"}
                    </h3>
                    <div className="sub">
                      {"Distinct enrolled students per term"}
                    </div>
                  </div>
                </div>
                <div id="semesterTrendBars" />
              </div>
            </div>
            <div className="grid-2" style={{"marginTop":"20px"}}>
              <div className="card card-pad">
                <div className="card-head">
                  <div>
                    <h3>
                      {"Academic Performance"}
                    </h3>
                    <div className="sub">
                      {"Passing vs. failing, all recorded finals"}
                    </div>
                  </div>
                </div>
                <div id="performanceStats" />
                <div id="passFailBars" style={{"marginTop":"14px"}} />
              </div>
              <div className="card card-pad">
                <div className="card-head">
                  <div>
                    <h3>
                      {"Courses Flagged for High Failure Rate"}
                    </h3>
                    <div className="sub">
                      {"≥ 30% of recorded finals marked Failed"}
                    </div>
                  </div>
                </div>
                <div className="table-responsive">
                  <table>
                    <thead>
                      <tr>
                        <th>
                          {"Course"}
                        </th>
                        <th>
                          {"Program"}
                        </th>
                        <th>
                          {"Finals"}
                        </th>
                        <th>
                          {"Rate"}
                        </th>
                      </tr>
                    </thead>
                    <tbody id="flaggedCoursesBody" />
                  </table>
                </div>
                <div id="noFlaggedMsg" className="empty-state" style={{"display":"none"}}>
                  {"No courses currently exceed the\n                failure-rate threshold."}
                </div>
              </div>
            </div>
          </section>
          <section className="page" id="page-classes">
            <div className="grid-2 grading-layout">
              <div className="card card-pad class-picker">
                <div className="card-head" style={{"display":"flex","justifyContent":"space-between","alignItems":"center"}}>
                  <h3>
                    {"Classes & Grading"}
                  </h3>
                  <button className="btn btn-primary" id="deanAddClassBtn" style={{"padding":"6px 12px","fontSize":"12px"}}>
                    {"+ Add\n                  Subject"}
                  </button>
                </div>
                <div style={{"display":"flex","gap":"6px","marginBottom":"12px"}}>
                  <button type="button" className="btn btn-primary" id="deanScopeMyBtn" style={{"flex":"1 1 0%","fontSize":"12px","padding":"6px"}}>
                    {"My Classes"}
                  </button>
                  <button type="button" className="btn btn-ghost" id="deanScopeAllBtn" style={{"flex":"1 1 0%","fontSize":"12px","padding":"6px"}}>
                    {"All Classes"}
                  </button>
                </div>
                <label>
                  {"Semester and Academic Year"}
                  <select className="field-input grading-term-select" aria-label="Class semester and academic year" />
                </label>
                <label>
                  {"Year level"}
                  <select className="field-input grading-year-select" aria-label="Class year level">
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
                </label>
                <label className="mobile-class-picker">
                  {"Class"}
                  <select className="field-input grading-class-select" aria-label="Select class" />
                </label>
                <div id="myCourseList" className="grading-course-list" />
                <div id="noMyCoursesMsg" className="empty-state" style={{"display":"none"}}>
                  {"No course offerings found."}
                </div>
              </div>
              <div className="card card-pad grading-card" hidden>
                <div className="card-head">
                  <div>
                    <h3 id="selectedMyCourseTitle">
                      {"Select a class"}
                    </h3>
                  </div>
                  <details className="grading-class-details">
                    <summary>
                      {"Class details"}
                    </summary>
                    <div className="sub" id="selectedMyCourseSub" />
                    <button type="button" className="btn btn-ghost" id="deanClassAuditLogBtn" style={{"display":"none","alignItems":"center","gap":"6px","fontSize":"12px","padding":"6px 12px"}} title="View all grade changes for this class">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {"\n                    Class Grade History\n                  "}
                    </button>
                  </details>
                </div>
                <details className="grading-help">
                  <summary>
                    {"Grading help"}
                  </summary>
                  <p>
                    {"Enter school grades directly, such as 1.00, 1.10, or 2.75. Enter the official Equivalent manually\n                  after Final; 4.00 is conditional and 5.00 is failed. Legacy percentage records are read-only pending\n                  school review. Use History beside a student to view saved revisions or revert a mistake. Save your\n                  changes before switching classes."}
                  </p>
                </details>
                <label className="grading-period-control">
                  {"Grading period"}
                  <select className="field-input grading-period" aria-label="Grading period">
                    <option value="2">
                      {"Prelim"}
                    </option>
                    <option value="3">
                      {"Midterm"}
                    </option>
                    <option value="4">
                      {"Semifinal"}
                    </option>
                    <option value="5">
                      {"Final"}
                    </option>
                    <option value="6">
                      {"Equivalent"}
                    </option>
                  </select>
                </label>
                <div className="table-responsive grading-table-wrap" tabIndex={0} role="region" aria-label="Class grade table">
                  <table id="myRosterTable" style={{"display":"none"}}>
                    <thead>
                      <tr>
                        <th>
                          {"Student"}
                        </th>
                        <th>
                          {"Pre-Lim"}
                        </th>
                        <th>
                          {"Midterm"}
                        </th>
                        <th>
                          {"Semi-Final"}
                        </th>
                        <th>
                          {"Final"}
                        </th>
                        <th>
                          {"Equivalent"}
                        </th>
                        <th>
                          {"Remark"}
                        </th>
                        <th style={{"textAlign":"center"}}>
                          {"History"}
                        </th>
                      </tr>
                    </thead>
                    <tbody id="myRosterBody" />
                  </table>
                </div>
                <div id="noMyRosterMsg" className="empty-state">
                  {"Pick a class from the left to view its roster."}
                </div>
                <div className="grading-actions">
                  <button type="button" className="btn btn-ghost lock-grades-btn" disabled>
                    {"Lock\n                  Grades"}
                  </button>
                  <span className="grading-save-status" role="status">
                    {"No unsaved changes"}
                  </span>
                  <button className="btn btn-primary" id="saveMyGradesBtn" disabled>
                    {"Save Grades"}
                  </button>
                </div>
              </div>
            </div>
          </section>
          <section className="page" id="page-faculty">
            <div className="card card-pad">
              <div className="card-head">
                <div>
                  <h3>
                    {"Teaching Workloads"}
                  </h3>
                  <div className="sub">
                    {"Total credit units and sections per faculty member, selected term"}
                  </div>
                </div>
              </div>
              <div className="table-responsive">
                <table>
                  <thead>
                    <tr>
                      <th>
                        {"Faculty"}
                      </th>
                      <th>
                        {"Sections"}
                      </th>
                      <th>
                        {"Total Load (Units)"}
                      </th>
                      <th>Load status</th>
                    </tr>
                  </thead>
                  <tbody id="workloadBody" />
                </table>
              </div>
              <div id="noWorkloadMsg" className="empty-state" style={{"display":"none"}}>
                {"No course offerings found for the current\n              term."}
              </div>
            </div>
            <div className="card card-pad mt-5">
              <div className="card-head">
                <div>
                  <h3>
                    {"Course Offerings & Faculty Assignment"}
                  </h3>
                  <div className="sub">
                    {"Manage subjects and assign instructors — saves instantly"}
                  </div>
                </div>
                <div className="offering-toolbar">
                  <select id="assignSemesterFilter" className="field-input" aria-label="Filter by Semester" title="Filter by Semester" />
                  <select id="assignYearFilter" className="field-input" aria-label="Assignment year level">
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
                  <button className="btn btn-primary" data-modal="courseOffering">
                    {"+ Add Subject Offering"}
                  </button>
                </div>
              </div>
              <div className="table-responsive">
                <table>
                  <thead>
                    <tr>
                      <th>
                        {"Code"}
                      </th>
                      <th>
                        {"Course Title"}
                      </th>
                      <th>
                        {"Program"}
                      </th>
                      <th>
                        {"Schedule"}
                      </th>
                      <th>
                        {"Assigned Faculty"}
                      </th>
                      <th>
                        {"Actions"}
                      </th>
                    </tr>
                  </thead>
                  <tbody id="assignBody" />
                </table>
              </div>
              <div id="noOfferingsMsg" className="empty-state" style={{"display":"none"}}>
                {"No course offerings found for this term.\n            "}
              </div>
            </div>
          </section>
          <section className="page" id="page-compliance">
            <div className="grid-2 record-layout">
              <div className="card card-pad record-picker">
                <h3>
                  {"Student Clearance"}
                </h3>
                <label htmlFor="clearanceSearch">
                  {"Search students"}
                </label>
                <input id="clearanceSearch" className="field-input" type="search" placeholder="Name, student number, or program" />
                <div style={{"display":"grid","gridTemplateColumns":"1fr 1fr","gap":"8px","marginTop":"10px","marginBottom":"8px"}}>
                  <div>
                    <label htmlFor="clearanceCourseFilter" style={{"fontSize":"12px","color":"var(--ink-500)","display":"block","marginBottom":"4px"}}>
                      {"Course"}
                    </label>
                    <select id="clearanceCourseFilter" className="field-input" aria-label="Filter by course or program">
                      <option value="">
                        {"All courses"}
                      </option>
                      <option value="BSIT">
                        {"BSIT"}
                      </option>
                      <option value="BSCS">
                        {"BSCS"}
                      </option>
                      <option value="BSIS">
                        {"BSIS"}
                      </option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="clearanceYearFilter" style={{"fontSize":"12px","color":"var(--ink-500)","display":"block","marginBottom":"4px"}}>
                      {"Year level"}
                    </label>
                    <select id="clearanceYearFilter" className="field-input" aria-label="Filter by year level">
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
                </div>
                <div id="clearanceStudents" className="record-student-list" role="group" aria-label="Students" />
              </div>
              <div className="card card-pad record-detail">
                <h3 id="clearanceTitle">
                  {"Select a student"}
                </h3>
                <div id="clearanceDetails" role="status" />
              </div>
            </div>
          </section>
          <section className="page" id="page-records">
            <div className="grid-2 record-layout">
              <div className="card card-pad record-picker">
                <h3>
                  {"Student Records"}
                </h3>
                <label htmlFor="recordSearch">
                  {"Search students"}
                </label>
                <input id="recordSearch" className="field-input" type="search" placeholder="Name, student number, or program" />
                <div id="recordStudents" className="record-student-list" role="group" aria-label="Students" />
              </div>
              <div className="card card-pad record-detail">
                <h3 id="recordTitle">
                  {"Select a student"}
                </h3>
                <div id="recordDetails" role="status">
                  {"Choose a student to view their records."}
                </div>
              </div>
            </div>
          </section>
          <section className="page" id="page-profile">
            <div className="card card-pad" style={{"maxWidth":"520px"}}>
              <div className="card-head">
                <h3>
                  {"My Profile"}
                </h3>
              </div>
              <div id="profileFields" />
            </div>
          </section>
        </div>
      </div>
    </div>
    <dialog className="modal-overlay course-offering-modal m-0 box-border h-full max-h-none w-full max-w-none border-0"
      id="modalOverlay" aria-labelledby="modalTitle">
      <div className="modal-box">
        <h3 id="modalTitle">
          {"Add Subject / Course Offering"}
        </h3>
        <form id="modalForm" />
        <div className="modal-actions">
          <button type="button" className="btn-outline btn" id="modalCancelBtn">
            {"Cancel"}
          </button>
          <button type="button" className="btn btn-primary" id="modalSaveBtn">
            {"Save"}
          </button>
        </div>
      </div>
    </dialog>
    <GradeHistoryDialog />
    <div className="toast" id="toast" />
  </>;
}
