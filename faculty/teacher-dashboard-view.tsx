import { GradeHistoryDialog } from './gradebook-view';

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
              {"Faculty Portal"}
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
        <button className="nav-item" data-page="attendance">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
            <path d="M9 15l2 2 4-4" />
          </svg>
          {"\n        Attendance\n      "}
        </button>
        <button className="nav-item" data-page="announcements">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 11l18-5v12L3 14v-3z" />
            <path d="M7 14v4a2 2 0 002 2h1" />
          </svg>
          {"\n        Announcements\n      "}
        </button>
        <button className="nav-item" data-page="evaluations">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          {"\n        Student Feedback\n      "}
        </button>
        <button className="nav-item soon" title="Coming soon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 11.5a8.5 8.5 0 01-11.5 8L3 21l1.5-6.5A8.5 8.5 0 1121 11.5z" />
          </svg>
          {"\n        Messages\n        "}
          <span className="soon-badge">
            {"SOON"}
          </span>
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
          {"Faculty Access\n      "}
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
                  {"Faculty"}
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
                  {"Manage your classes, attendance, and grades."}
                </p>
              </div>
              <div className="hero-actions">
                <button className="btn btn-solid-w" data-goto="classes">
                  {"View My Classes"}
                </button>
              </div>
            </div>
            <div className="grid-3">
              <div className="stat">
                <div className="stat-top">
                  <span className="stat-label">
                    {"MY CLASSES"}
                  </span>
                  <div className="stat-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M22 10v6M2 10l10-5 10 5-10 5-10-5z" />
                    </svg>
                  </div>
                </div>
                <div className="stat-value" id="stat-classes">
                  {"—"}
                </div>
                <div className="stat-sub">
                  {"Current term"}
                </div>
              </div>
              <div className="stat c2">
                <div className="stat-top">
                  <span className="stat-label">
                    {"TOTAL STUDENTS"}
                  </span>
                  <div className="stat-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <circle cx="12" cy="8" r="4" />
                      <path d="M4 21a8 8 0 0116 0" />
                    </svg>
                  </div>
                </div>
                <div className="stat-value" id="stat-students">
                  {"—"}
                </div>
                <div className="stat-sub">
                  {"Across all sections"}
                </div>
              </div>
              <div className="stat c3">
                <div className="stat-top">
                  <span className="stat-label">
                    {"GRADES PENDING"}
                  </span>
                  <div className="stat-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 7v5l3 3" />
                    </svg>
                  </div>
                </div>
                <div className="stat-value" id="stat-pending">
                  {"—"}
                </div>
                <div className="stat-sub">
                  {"Students awaiting a final grade"}
                </div>
              </div>
            </div>
            <div className="quick-grid">
              <button className="quick-card" data-goto="attendance">
                <div className="quick-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <path d="M16 2v4M8 2v4M3 10h18" />
                  </svg>
                </div>
                <div className="t">
                  {"Take Attendance"}
                </div>
                <div className="d">
                  {"Mark today's roster"}
                </div>
              </button>
              <button className="quick-card" data-goto="announcements">
                <div className="quick-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 11l18-5v12L3 14v-3z" />
                  </svg>
                </div>
                <div className="t">
                  {"Post Announcement"}
                </div>
                <div className="d">
                  {"Notify your class"}
                </div>
              </button>
              <button className="quick-card" disabled style={{"opacity":"0.5","cursor":"not-allowed"}}>
                <div className="quick-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 11.5a8.5 8.5 0 01-11.5 8L3 21l1.5-6.5A8.5 8.5 0 1121 11.5z" />
                  </svg>
                </div>
                <div className="t">
                  {"Messages"}
                </div>
                <div className="d">
                  {"Coming soon"}
                </div>
              </button>
            </div>
          </section>
          <section className="page" id="page-classes">
            <div className="grid-2 grading-layout">
              <div className="card card-pad class-picker">
                <div className="card-head" style={{"display":"flex","justifyContent":"space-between","alignItems":"center"}}>
                  <h3>
                    {"My Classes"}
                  </h3>
                  <span className="sub">
                    {"Subjects are assigned by the dean."}
                  </span>
                </div>
                <label>
                  {"Semester"}
                  <select className="field-input grading-term-select" aria-label="Class semester" />
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
                <div id="courseList" className="grading-course-list" />
                <div id="noCoursesMsg" className="empty-state" style={{"display":"none"}}>
                  {"No course offerings are assigned to you\n                yet."}
                </div>
              </div>
              <div className="card card-pad grading-card" hidden>
                <div className="card-head">
                  <div>
                    <h3 id="selectedCourseTitle">
                      {"Select a class"}
                    </h3>
                  </div>
                  <details className="grading-class-details">
                    <summary>
                      {"Class details"}
                    </summary>
                    <div className="sub" id="selectedCourseSub" />
                    <button type="button" className="btn btn-ghost" id="classAuditLogBtn" style={{"display":"none","alignItems":"center","gap":"6px","fontSize":"12px","padding":"6px 12px"}} title="View all grade changes for this class">
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
                    {"Enter school grades directly, such as 1.00, 1.10, or 2.75. Enter the official Equivalent manually after Final; 4.00 is conditional and 5.00 is failed. Legacy percentage records are read-only pending school review. Use History beside a student to view saved revisions or revert a mistake. Save your changes before switching classes."}
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
                  <table id="rosterTable" style={{"display":"none"}}>
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
                    <tbody id="rosterBody" />
                  </table>
                </div>
                <div id="noRosterMsg" className="empty-state">
                  {"Pick a class from the left to view its roster."}
                </div>
                <div className="grading-actions">
                  <button type="button" className="btn btn-ghost lock-grades-btn" disabled>
                    {"Lock Grades"}
                  </button>
                  <span className="grading-save-status" role="status">
                    {"No unsaved changes"}
                  </span>
                  <button className="btn btn-primary" id="saveGradesBtn" disabled>
                    {"Save Grades"}
                  </button>
                </div>
              </div>
            </div>
          </section>
          <section className="page" id="page-attendance">
            <div className="card card-pad">
              <div className="card-head">
                <h3>
                  {"Take Attendance"}
                </h3>
                <div className="toolbar" style={{"display":"flex","gap":"10px","alignItems":"center","flexWrap":"wrap"}}>
                  <select id="attClassSelect" className="field-input" style={{"width":"auto","minWidth":"220px"}} aria-label="Select Class" title="Select Class" />
                  <input type="date" id="attDateInput" className="field-input" style={{"width":"auto"}} aria-label="Attendance Date" title="Attendance Date" />
                  <button className="btn btn-primary" id="saveAttendanceBtn" disabled>
                    {"Save Attendance"}
                  </button>
                </div>
              </div>
              <div className="table-responsive">
                <table id="attTable" style={{"display":"none"}}>
                  <thead>
                    <tr>
                      <th>
                        {"Student"}
                      </th>
                      <th>
                        {"Status"}
                      </th>
                    </tr>
                  </thead>
                  <tbody id="attBody" />
                </table>
              </div>
              <div id="noAttMsg" className="empty-state">
                {"Pick a class and date to take attendance."}
              </div>
            </div>
            <div className="card card-pad" style={{"marginTop":"20px"}}>
              <div className="card-head">
                <h3>
                  {"Recent Attendance"}
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
                        {"Class"}
                      </th>
                      <th>
                        {"Present"}
                      </th>
                      <th>
                        {"Absent"}
                      </th>
                      <th>
                        {"Late"}
                      </th>
                    </tr>
                  </thead>
                  <tbody id="attHistoryBody" />
                </table>
              </div>
              <div id="noAttHistoryMsg" className="empty-state" style={{"display":"none"}}>
                {"No attendance recorded yet."}
              </div>
            </div>
          </section>
          <section className="page" id="page-announcements">
            <div className="card card-pad">
              <div className="card-head">
                <h3>
                  {"Post an Announcement"}
                </h3>
              </div>
              <div className="form-row">
                <label htmlFor="annClassSelect">
                  {"Class"}
                </label>
                <select id="annClassSelect" className="field-input" />
              </div>
              <div className="form-row">
                <label htmlFor="annTitleInput">
                  {"Title"}
                </label>
                <input type="text" id="annTitleInput" className="field-input" placeholder="e.g. Quiz moved to next week" />
              </div>
              <div className="form-row">
                <label htmlFor="annMessageInput">
                  {"Message"}
                </label>
                <textarea id="annMessageInput" className="field-input" placeholder="Write your announcement…" />
              </div>
              <button className="btn btn-primary" id="postAnnouncementBtn">
                {"Post Announcement"}
              </button>
            </div>
            <div className="card card-pad" style={{"marginTop":"20px"}}>
              <div className="card-head">
                <h3>
                  {"Posted Announcements"}
                </h3>
              </div>
              <div id="announcementsList" />
              <div id="noAnnouncementsMsg" className="empty-state" style={{"display":"none"}}>
                {"No announcements posted yet."}
              </div>
            </div>
          </section>
          <section className="page" id="page-evaluations">
            <div className="card card-pad">
              <div className="card-head">
                <div>
                  <h3>
                    {"Student Evaluation Summary"}
                  </h3>
                  <div className="sub">
                    {"Anonymous aggregate feedback submitted by students for your classes"}
                  </div>
                </div>
              </div>
              <div id="evalSummaryCards" style={{"display":"grid","gridTemplateColumns":"repeat(auto-fit, minmax(180px, 1fr))","gap":"12px","marginBottom":"20px"}} />
              <div className="table-responsive">
                <table>
                  <thead>
                    <tr>
                      <th>
                        {"Term"}
                      </th>
                      <th>
                        {"Total Evals"}
                      </th>
                      <th>
                        {"Clarity"}
                      </th>
                      <th>
                        {"Knowledge"}
                      </th>
                      <th>
                        {"Availability"}
                      </th>
                      <th>
                        {"Fairness"}
                      </th>
                      <th>
                        {"Punctuality"}
                      </th>
                      <th>
                        {"Overall Rating"}
                      </th>
                    </tr>
                  </thead>
                  <tbody id="evalHistoryBody" />
                </table>
              </div>
              <div id="noEvalMsg" className="empty-state" style={{"display":"none"}}>
                {"No student evaluations recorded yet."}
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
    <GradeHistoryDialog />
    <div className="toast" id="toast" />
  </>;
}
