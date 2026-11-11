function AccountListError({ list }: { list: 'pending' | 'approved' }) {
  return <div id={`${list}LoadError`} className="mb-3 rounded-md border border-[var(--surface-border)] p-3 text-sm" hidden>
    <p role="alert" className="mb-2" />
    <button type="button" className="btn-logout" aria-label={`Retry ${list} users`}>Retry</button>
  </div>;
}

export default function DashboardView() {
  return <>
    <div className="header">
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
          <div className="brand-text">
            {"MyIMCC"}
          </div>
          <div className="brand-sub-text">
            {"ADMIN PORTAL"}
          </div>
        </div>
      </div>
      <div className="user-info">
        <label id="developerPreviewControl" hidden>
          {"View as role\n        "}
          <select id="previewRole" className="role-select" aria-controls="developerPreview" disabled>
            <option value="admin">
              {"Admin"}
            </option>
            <option value="student">
              {"Student"}
            </option>
            <option value="faculty">
              {"Faculty"}
            </option>
            <option value="dean">
              {"Dean"}
            </option>
            <option value="registrar">
              {"Registrar"}
            </option>
            <option value="staff">
              {"Staff"}
            </option>
          </select>
        </label>
        <button id="temporaryRoleTest" className="btn-logout" type="button" hidden>
          {"Try selected role (demo)"}
        </button>
        <span id="adminEmail" style={{"color":"var(--text-muted)","fontSize":"14px"}}>
          <span className="imcc-skel imcc-skel-inline" style={{"width":"140px","height":"14px","verticalAlign":"middle"}} />
        </span>
        <button id="logoutBtn" className="btn-logout">
          {"Sign Out"}
        </button>
      </div>
    </div>
    <section id="developerPreview" className="dashboard-card" aria-label="Developer role view" hidden>
      <div className="card-title">
        <span id="previewStatus" role="status" />
        <button id="exitPreview" className="btn-logout" type="button">
          {"Back to Admin"}
        </button>
      </div>
      <p className="preview-note">
        {"Read only · Uses your admin account's permitted data. No role changes or user impersonation."}
      </p>
      <iframe id="previewFrame" title="Role dashboard" sandbox="allow-scripts" referrerPolicy="no-referrer" hidden />
    </section>
    <main id="adminWorkspace">
      <div className="filter-bar">
        <div className="filter-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
          <input type="text" id="searchInput" placeholder="Search by name, email, ID number, or role…" autoComplete="off" aria-label="Search users" title="Search users" />
        </div>
        <select id="courseFilter" className="role-select" aria-label="Filter by course" title="Filter by course">
          <option value="">
            {"All Courses"}
          </option>
        </select>
        <button type="button" id="clearFiltersBtn" className="btn-logout" style={{"display":"none"}}>
          {"Clear Filters"}
        </button>
      </div>
      <div className="dashboard-card">
        <div className="card-title">
          <span>
            {"Pending Access Requests"}
          </span>
          <span id="pendingCount" className="badge badge-pending">
            {"Loading…"}
          </span>
        </div>
        <AccountListError list="pending" />
        <div id="pendingTableWrap" className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>
                  {"Full Name"}
                </th>
                <th>
                  {"Email"}
                </th>
                <th>
                  {"ID Number"}
                </th>
                <th>
                  {"Course"}
                </th>
                <th>
                  {"Assign Role"}
                </th>
                <th>
                  {"Actions"}
                </th>
              </tr>
            </thead>
            <tbody id="pendingTableBody" />
          </table>
          <div id="noPendingMsg" className="empty-state" style={{"display":"none"}}>
            {"No pending registration requests found."}
          </div>
        </div>
      </div>
      <div className="dashboard-card">
        <div className="card-title">
          {"Approved Portal Users & Role Management"}
        </div>
        <div id="roleSaveStatus" role="status" />
        <div id="accessSaveStatus" role="status" />
        <dialog id="accessDialog" aria-labelledby="accessTitle" aria-describedby="accessMessage" className="m-auto w-[28rem] max-w-[calc(100%-2rem)] rounded-xl border border-[var(--surface-border)] bg-[var(--surface)] p-5 text-[var(--text-main)] backdrop:bg-black/50">
          <h2 id="accessTitle" className="mb-2 text-lg font-bold" />
          <p id="accessMessage" className="mb-4 text-sm" />
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" id="cancelAccess" className="btn-logout" autoFocus>Cancel</button>
            <button type="button" id="confirmAccess" className="btn-logout" />
          </div>
        </dialog>
        <AccountListError list="approved" />
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>
                  {"Full Name"}
                </th>
                <th>
                  {"Email"}
                </th>
                <th>
                  {"ID Number"}
                </th>
                <th>
                  {"Course"}
                </th>
                <th>
                  {"Assigned Role"}
                </th>
                <th>
                  {"Status"}
                </th>
                <th>
                  {"Actions"}
                </th>
              </tr>
            </thead>
            <tbody id="approvedTableBody" />
          </table>
        </div>
        <div id="noApprovedMsg" className="empty-state" style={{"display":"none"}}>
          {"No users match your search or filter."}
        </div>
      </div>
    </main>
  </>;
}
