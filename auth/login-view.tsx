import type { ReactNode } from 'react';

const panelTitle = 'm-0 mb-2 font-heading text-2xl font-extrabold sm:text-[30px]';
const description = 'm-0 mb-5 text-sm leading-relaxed text-[#d7b9ca] sm:mb-7';
const label = 'mb-2 block text-sm font-bold';
const input = 'box-border min-h-11 w-full rounded-xl border border-solid border-[#68334f] bg-[#1b0c16] px-3.5 py-3 text-base text-[#fff2fa] placeholder:text-[#b896ab] focus:border-[#f477b1] focus:outline-2 focus:outline-offset-2 focus:outline-[#f477b1]';
const button = 'inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-0 bg-[#c22160] px-4 py-3 font-sans text-sm font-bold text-white hover:enabled:bg-[#ad1b53] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f477b1] disabled:cursor-not-allowed disabled:opacity-65';
const linkButton = 'cursor-pointer rounded border-0 bg-transparent p-1 text-sm font-semibold text-[#f9a8d1] underline underline-offset-4 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2';

const undergraduate = [
  ['BS Nursing', 'Bachelor of Science in Nursing'],
  ['BS Midwifery', 'Bachelor of Science in Midwifery'],
  ['BS Medical Technology', 'Bachelor of Science in Medical Technology'],
  ['BS Radiologic Technology', 'Bachelor of Science in Radiologic Technology'],
  ['BS Criminology', 'Bachelor of Science in Criminology'],
  ['BS Social Work', 'Bachelor of Science in Social Work'],
  ['BS Biology', 'Bachelor of Science in Biology'],
  ['BSBA', 'Bachelor of Science in Business Administration'],
  ['BSIT', 'Bachelor of Science in Information Technology'],
  ['BSHT', 'Bachelor of Science in Hospitality Technology'],
  ['BSTM', 'Bachelor of Science in Tourism Management'],
  ['BECEd', 'Bachelor of Early Childhood Education'],
  ['BEEd', 'Bachelor of Elementary Education'],
  ['BSEd', 'Bachelor of Secondary Education'],
  ['BSNEd', 'Bachelor of Special Needs Education'],
];
const graduate = [
  ['MPM', 'Master in Public Management'],
  ['MM-EdM', 'Master in Management Major in Educational Management'],
  ['MM-HRM', 'Master in Management Major in Human Resource Management'],
];

function Programs({ title, programs }: { title: string; programs: string[][] }) {
  return <section className="mb-4">
    <h3 className="m-0 mb-2 text-xs font-bold tracking-wide text-[#f9a8d1] uppercase">{title}</h3>
    <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
      {programs.map(([name, fullName]) => <li key={name} title={fullName}
        className="rounded-md border border-solid border-[#6c3552] bg-[#361327] px-2.5 py-1 text-xs">{name}</li>)}
    </ul>
  </section>;
}

function Notice({ title, children }: { title: string; children: ReactNode }) {
  return <div className="mt-6 border-0 border-t border-solid border-[#66334f] pt-3 text-center">
    <h2 className="m-0 mb-2 text-xs font-bold">{title}</h2>
    <p className="m-0 text-xs leading-relaxed text-[#d7b9ca]">{children}</p>
  </div>;
}

function FormError({ id }: { id: string }) {
  return <p id={id} role="alert" hidden className="my-3 rounded-lg bg-[#49152c] px-3 py-2 text-sm text-[#ffd2df]" />;
}

function CodeForm({ step, children }: { step: 'enroll' | 'challenge'; children: ReactNode }) {
  return <form id={step + 'Form'} noValidate>
    <label htmlFor={step + 'CodeInput'} className={label}>6-Digit Authenticator Code</label>
    <input id={step + 'CodeInput'} type="text" inputMode="numeric" autoComplete="one-time-code"
      maxLength={6} required placeholder="123456" className={input + ' text-center font-mono tracking-[0.35em]'} />
    <FormError id={step + 'Error'} />
    <button type="submit" id={step + 'Btn'} className={button + ' mt-4'}>{children}</button>
  </form>;
}

export default function LoginView() {
  return <main className="grid min-h-dvh bg-[#11050c] font-sans text-[#fff2fa] min-[901px]:grid-cols-2">
    <section aria-label="Portal sign-in" className="flex justify-center px-4 pt-7 pb-5 sm:px-8 sm:pt-12 min-[901px]:items-center min-[901px]:py-12">
      <div className="w-full max-w-[460px]">
        <div className="mb-6 flex items-center gap-3 sm:mb-9">
          <svg viewBox="0 0 42 42" className="hidden size-11 shrink-0 min-[901px]:block" aria-hidden="true" fill="none">
            <rect width="42" height="42" rx="10" fill="#E32B4F" />
            <circle cx="21" cy="11.5" r="2.2" fill="#FFFFFF" />
            <path d="M21 15V28.5M9.5 27.5V14L19.5 21.5M32.5 27.5V14L22.5 21.5M9.5 27.5C13.5 25 17.5 25.5 21 28.5C24.5 25.5 28.5 25 32.5 27.5" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <img src="imcc-logo.jpg" alt="IMCC Official Seal" width={48} height={48} className="size-12 shrink-0 rounded-lg object-contain min-[901px]:hidden" />
          <div>
            <div className="font-heading text-lg font-extrabold">
              <span className="hidden min-[901px]:inline">MyIMCC</span>
              <span className="min-[901px]:hidden">Iligan Medical Center College</span>
            </div>
            <div className="text-xs font-bold tracking-wide text-[#f9a8d1] uppercase">EduLink Portal</div>
          </div>
        </div>
        <div id="stepSso">
          <h1 className={panelTitle}>Institutional Sign-In</h1>
          <p className={description}>Sign in with Google using your official school email account.</p>
          <form id="ssoForm" noValidate>
            <label htmlFor="emailInput" className={label}>Institutional School Email <span className="text-xs font-normal text-[#d7b9ca]">(Optional hint)</span></label>
            <input type="email" id="emailInput" placeholder="name@imcc.edu.ph" autoComplete="email" className={input} />
            <FormError id="ssoError" />
            <button type="submit" id="ssoBtn" disabled className={button + ' mt-4'}>
              <svg className="size-[18px] shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.761H12.545z" />
              </svg>
              <span id="ssoBtnText">Sign In with Google Account</span>
            </button>
          </form>
          <div id="demoAccessCard" hidden className="mt-5 rounded-xl border border-solid border-[#68334f] bg-[#2e1022] p-4">
            <h2 className="m-0 text-sm font-bold">Evaluator / Demo Access</h2>
            <p className="text-xs text-[#d7b9ca]">Use one-click sign-in or the demo credentials below.</p>
            <div className="mb-3 text-xs [overflow-wrap:anywhere]">
              <div><b>Email:</b> <code id="demoEmailText">—</code></div>
              <div><b>Password:</b> <code id="demoPasswordText">—</code></div>
            </div>
            <button type="button" id="demoStudentBtn" className={button}>One-Click Sign In as Demo Student</button>
            <div id="demoStatus" role="status" className="mt-2 text-xs data-[state=error]:text-[#ff9db8]" />
          </div>
        </div>
        <div id="stepEnroll" hidden>
          <h1 className={panelTitle}>Sync 2FA App</h1>
          <p className={description}>Scan the QR code with Google Authenticator to pair your app.</p>
          <div className="my-4 text-center">
            <img id="enrollQrImg" alt="MFA QR Code" width={160} height={160} className="rounded-lg bg-white p-2" />
            <div id="enrollSecret" className="my-2 font-mono text-sm [overflow-wrap:anywhere]">••••••••••••••••••••</div>
            <button type="button" id="toggleSecretBtn" className={linkButton}>Show Key</button>
          </div>
          <CodeForm step="enroll">Verify &amp; Activate 2FA</CodeForm>
          <div className="mt-3 text-center">
            <button type="button" id="skipEnrollBtn" className={linkButton}>Skip for now — continue to dashboard</button>
          </div>
        </div>
        <div id="stepChallenge" hidden>
          <h1 className={panelTitle}>Two-Factor Verification</h1>
          <p className={description}>Enter the six-digit code from your Google Authenticator app.</p>
          <CodeForm step="challenge">Verify TOTP Code</CodeForm>
          <div className="mt-3 text-center">
            <button type="button" id="resetMfaBtn" className={linkButton}>Lost your Authenticator code? Reset &amp; re-scan the QR code</button>
          </div>
        </div>
        <div id="stepUnauthorized" hidden className="py-5 text-center">
          <h1 className={panelTitle} tabIndex={-1}>Institutional Account Required</h1>
          <p className={description}>Please sign in using your official school account (<b>@imcc.edu.ph</b>).</p>
          <button type="button" id="retrySsoBtn" className={button}>← Return to Sign-In</button>
        </div>
        <Notice title="Security Notice">Use your official school account. Two-factor verification applies to staff accounts and is available to students. Contact <b>IT Services (support@imcc.edu.ph)</b> for account assistance.</Notice>
      </div>
    </section>
    <section aria-label="About Iligan Medical Center College"
      className="flex justify-center px-4 pt-3 pb-9 sm:px-8 min-[901px]:items-center min-[901px]:border-0 min-[901px]:border-l min-[901px]:border-solid min-[901px]:border-[#68334f] min-[901px]:bg-[radial-gradient(ellipse_at_top,#522039,#1d0a17_70%)] min-[901px]:py-12">
      <div className="w-full max-w-[460px]">
        <div className="mb-6 hidden items-center gap-3 min-[901px]:flex">
          <img src="imcc-logo.jpg" alt="IMCC Official Seal" width={56} height={56} className="size-14 shrink-0 rounded-lg object-contain" />
          <div>
            <div className="font-heading text-lg font-extrabold">Iligan Medical Center College</div>
            <div className="text-xs font-bold tracking-wide text-[#f9a8d1] uppercase">San Miguel, Iligan City • Est. 1975</div>
          </div>
        </div>
        <div className="hidden min-[901px]:block">
          <h2 className={panelTitle}>Academic Gateway</h2>
          <p className={description}>Official single sign-on portal for students, faculty, and administrative staff.</p>
        </div>
        <div className="mb-4 rounded-xl border border-solid border-[#68334f] bg-[#2e1022] p-4">
          <h3 className="m-0 mb-2 text-xs font-bold tracking-wide text-[#f9a8d1] uppercase">Institutional Philosophy</h3>
          <p className="m-0 text-sm leading-relaxed text-[#fff2fa]">“Committed to developing globally competitive, compassionate healthcare practitioners, educators, and leaders anchored in academic excellence and community service.”</p>
        </div>
        <Programs title="Undergraduate Programs" programs={undergraduate} />
        <Programs title="Graduate Programs" programs={graduate} />
        <Notice title="Official Accreditation">Recognized by the <b>Commission on Higher Education (CHED)</b> and Department of Education (DepEd).</Notice>
      </div>
    </section>
  </main>;
}
