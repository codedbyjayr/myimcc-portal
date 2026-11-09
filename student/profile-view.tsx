export const avatarClass = 'avatar overflow-hidden [&_img]:size-full [&_img]:object-cover';

const card = 'min-w-0 rounded-xl border border-[var(--line)] bg-[var(--card)] p-4 sm:p-5';
const title = 'mt-0 mb-4 text-base font-bold';
const input = 'box-border w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 font-sans text-sm text-[var(--ink-900)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pink-600)]';

export function StudentProfile() {
  return <div className="grid gap-4 lg:grid-cols-2">
    <section className={card} aria-labelledby="profileInfoTitle">
      <h3 id="profileInfoTitle" className={title}>Profile Information</h3>
      <div className="mb-5 flex items-center gap-4">
        <div className={`${avatarClass} size-16! shrink-0 text-[22px]!`} id="profileAvatar" />
        <div className="min-w-0 wrap-anywhere">
          <div className="text-lg font-extrabold" id="profileName">—</div>
          <div className="text-sm text-[var(--ink-500)]" id="profileEmail">—</div>
        </div>
      </div>
      <dl className="m-0 divide-y divide-[var(--line)] text-sm">
        {[
          ['Student No.', 'profileStudentNo'],
          ['Program', 'profileProgram'],
          ['Year Level', 'profileYear'],
          ['Section', 'profileSection'],
          ['Phone', 'profilePhone'],
          ['Address', 'profileAddress'],
        ].map(([label, id]) =>
          <div key={id} className="flex justify-between gap-4 py-2.5">
            <dt className="shrink-0 font-semibold">{label}</dt>
            <dd id={id} className="m-0 text-right font-bold wrap-anywhere">—</dd>
          </div>
        )}
      </dl>
    </section>
    <section className={card} aria-labelledby="profileContactTitle">
      <h3 id="profileContactTitle" className={title}>Edit Contact Info</h3>
      {[
        ['Phone Number', 'editPhone', 'tel', '0912 345 6789'],
        ['Address', 'editAddress', 'text', 'Iligan City'],
        ['Avatar URL', 'editAvatar', 'text', 'https://...'],
      ].map(([label, id, type, placeholder]) =>
        <div className="mb-3" key={id}>
          <label htmlFor={id} className="mb-1 block text-xs font-semibold">{label}</label>
          <input className={input} type={type} id={id} placeholder={placeholder} />
        </div>
      )}
      <button type="button" className="btn btn-primary mt-2 w-full justify-center" id="saveProfileBtn">Save Changes</button>
      <div className="mt-4 border-t border-[var(--line)] pt-4">
        <h4 className="mt-0 mb-2 text-xs font-bold uppercase text-[var(--ink-500)]">Security</h4>
        <button type="button" className="btn btn-outline w-full justify-center" id="changePassBtn">Change Password</button>
        <p className="mt-2 mb-0 text-xs text-[var(--ink-500)]">Password changes are handled by Supabase Auth. You will receive a reset email at your school address.</p>
      </div>
    </section>
  </div>;
}
