import { mountDashboard } from '../shared/dashboard-workspace';

const field = 'box-border w-full rounded-lg border border-[#312A3B] bg-[#141019] p-3 font-sans text-sm text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E7338A]';
const label = 'mb-1.5 block text-xs font-semibold uppercase text-[#A79FB5]';
const button = 'w-full cursor-pointer rounded-lg border-0 bg-[#9D175B] p-3.5 font-sans text-[15px] font-bold text-white hover:bg-[#81134B] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E7338A] disabled:cursor-not-allowed disabled:opacity-60';

function SelectRole() {
  return <main className="box-border flex min-h-screen items-center justify-center p-5 font-sans">
    <section aria-labelledby="onboardTitle" className="box-border w-full max-w-[440px] rounded-2xl border border-[#312A3B] bg-[#1D1724] p-5 shadow-[0_20px_25px_-5px_rgba(0,0,0,0.5)] sm:p-8">
      <h1 id="onboardTitle" className="mt-0 mb-2 font-heading text-[22px] font-extrabold text-white">Complete Profile</h1>
      <p className="mt-0 mb-6 text-sm leading-normal text-[#A79FB5]">Please supply your details and choose your primary portal role for administrator verification.</p>
      <form id="onboardForm">
        <div className="mb-[18px]">
          <label className={label} htmlFor="fullName">Full Name</label>
          <input className={field} type="text" id="fullName" placeholder="e.g. Juan Cruz" autoComplete="name" required />
        </div>
        <div className="mb-[18px]">
          <label className={label} htmlFor="idNumber">School ID / Employee Number</label>
          <input className={field} type="text" id="idNumber" placeholder="e.g. 2024-1049" required />
        </div>
        <div className="mb-[18px]">
          <label className={label} htmlFor="requestedRole">I am requesting access as a:</label>
          <select className={field} id="requestedRole" aria-describedby="roleHint" required>
            <option value="student">Student</option>
            <option value="faculty">Faculty / Instructor</option>
            <option value="staff">Administrative Staff</option>
            <option value="dean">Dean</option>
            <option value="registrar">Registrar</option>
          </select>
          <p id="roleHint" className="mt-2 mb-0 text-xs leading-normal text-[#A79FB5]">
            Only student accounts with an institutional student address are confirmed automatically.
            Faculty, staff, dean and registrar requests are reviewed by an administrator before access is granted.
          </p>
        </div>
        <div id="studentAcademicFields">
          <div className="mb-[18px]">
            <label className={label} htmlFor="studentProgram">Program</label>
            <select className={field} id="studentProgram" aria-describedby="academicHint" required>
              <option value="">Loading programs…</option>
            </select>
          </div>
          <div className="mb-[18px]">
            <label className={label} htmlFor="studentYear">Year Level</label>
            <select className={field} id="studentYear" aria-describedby="academicHint" required>
              <option value="">Choose your year level</option>
              <option>1st Year</option>
              <option>2nd Year</option>
              <option>3rd Year</option>
              <option>4th Year</option>
            </select>
            <p id="academicHint" className="mt-2 mb-0 text-xs text-[#A79FB5]">Use the program and year on your school record. These determine which subjects you can request.</p>
          </div>
        </div>
        <div id="formError" className="mb-3 text-sm text-red-300" role="alert" hidden />
        <button type="submit" className={button} id="submitBtn" disabled>Submit for Approval</button>
      </form>
      <div className="rounded-lg border border-[#312A3B] border-l-4 border-l-red-400 bg-red-500/10 p-4" id="onboardBlocked" hidden>
        <div role="alert">
          <h2 id="onboardBlockedTitle" className="mt-0 mb-2 text-base">Access not available</h2>
          <p id="onboardBlockedMessage" className="mt-0 mb-3 text-sm leading-normal text-[#A79FB5]" />
        </div>
        <button type="button" className={button} id="onboardSignOut">Sign out</button>
      </div>
    </section>
  </main>;
}

mountDashboard(<SelectRole />);
