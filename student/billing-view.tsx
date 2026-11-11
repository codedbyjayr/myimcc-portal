type Amount = number | string | null | undefined;
type Installment = { id: string; name: string; due_date?: string | null; amount: Amount; status: string };
type Transaction = { id: string; or_number?: string | null; txn_date: string; description?: string; channel?: string; amount: Amount };
type Billing = {
  totalPaid: number;
  balance: Amount;
  totalAssessment: number;
  tuitionTotal: number;
  miscTotal: number;
  activeSemester: string;
  activeSchoolYear: string;
  enrolledCourses: { code: string; title: string; units: Amount; fee: Amount }[];
  miscFeesList: { id: string; name: string; amount: Amount }[];
  installments: Installment[];
  transactions: Transaction[];
};

const card = 'min-w-0 rounded-xl border border-[var(--line)] bg-[var(--card)] p-4 sm:p-5';
const title = 'm-0 text-base font-extrabold';
const button = 'cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--card)] px-3 py-1.5 text-xs font-bold text-[var(--pink-600)] hover:bg-[var(--pink-50)] focus-visible:outline-2 focus-visible:outline-offset-2';
const scroll = 'min-w-0 overflow-x-auto rounded-lg border border-[var(--line)]';
const table = 'w-full min-w-[24rem] border-collapse text-sm';
const amount = 'text-right whitespace-nowrap tabular-nums';

export function BillingContent({ billing, money, date }: {
  billing?: Billing;
  money: (value: Amount) => string;
  date: (value: string) => string;
}) {
  const installments = billing?.installments ?? [];
  const pending = installments.filter(row => row.status === 'pending');
  const next = pending[0];
  const transactions = billing?.transactions ?? [];

  return <>
    <div className="mb-4 grid gap-4 sm:grid-cols-3">
      {[
        ['TOTAL PAID', 'bill-totalpaid', billing ? money(billing.totalPaid) : '—', 'All time', 'text-[var(--green)]'],
        ['CURRENT BALANCE', 'bill-balance', billing ? money(billing.balance) : '—', 'This semester', 'text-[var(--ink-900)]'],
        ['NEXT PAYMENT', 'bill-nextdate', next?.due_date ? date(next.due_date).split(',')[0] : next ? 'See schedule' : '—',
          next ? next.name.toLowerCase() : billing ? 'nothing due' : 'Loading…', 'text-[var(--red)]'],
      ].map(([label, id, value, detail, color]) =>
        <div className={card} key={id}>
          <div className="text-xs font-bold text-[var(--ink-500)]">{label}</div>
          <div id={id} className={`my-1 text-xl font-extrabold tabular-nums ${color}`}>{value}</div>
          <div className="text-xs text-[var(--ink-500)]">{detail}</div>
        </div>
      )}
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      <section aria-labelledby="billing-history-title" className={card}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className={title} id="billing-history-title">Transaction History</h3>
          <button type="button" className={button} id="exportBtn">⭳ Export CSV</button>
        </div>
        <div className={scroll} role="region" aria-labelledby="billing-history-title" tabIndex={0}>
          <table className={table}>
            <thead><tr><th scope="col">OR Number</th><th scope="col">Date</th><th scope="col">Description</th><th scope="col">Channel</th><th scope="col" className={amount}>Amount</th><th scope="col"><span className="sr-only">Receipt</span></th></tr></thead>
            <tbody id="txnBody">
              {transactions.map((row, index) => <tr key={row.id ?? index}>
                <td className="font-mono font-bold text-[var(--pink-600)]">{row.or_number || '—'}</td>
                <td>{date(row.txn_date)}</td><td>{row.description}</td><td>{row.channel}</td>
                <td className={`${amount} font-bold text-[var(--green)]`}>{money(row.amount)}</td>
                <td><button className={button} type="button" data-receipt={row.or_number ?? ''}>View</button></td>
              </tr>)}
              {!transactions.length && <tr><td colSpan={6} className="py-5 text-center text-[var(--ink-500)]">{billing ? 'No transaction records found.' : 'Loading…'}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <div className="grid min-w-0 content-start gap-4">
        <section className={card}>
          <h3 className={title}>Upcoming Payments</h3>
          <div className="mt-3 grid gap-2 text-sm">
            {!billing ? <p>Loading…</p> : !installments.length ? <div className="text-[var(--ink-500)]">
              <strong className="block text-[var(--ink-900)]">No payment schedule published</strong>
              Pay at the Cashier's Office or through your designated payment channel.
            </div> : !pending.length ? <p className="font-semibold text-[var(--green)]">✓ All installments recorded as paid</p> :
              pending.map((row, index) => <div key={row.id ?? index} className="rounded-lg border border-[var(--line)] bg-[var(--bg)] p-3">
                <div className="flex flex-wrap justify-between gap-2 font-semibold"><span>{row.name}</span><span className="text-xs text-[var(--red)]">PENDING</span></div>
                <div className="my-1 text-lg font-extrabold text-[var(--pink-600)]">{money(row.amount)}</div>
                <div className="text-xs text-[var(--ink-500)]">{row.due_date ? `Due: ${date(row.due_date)}` : 'Due date not set'}</div>
                <div className="mt-2 text-xs text-[var(--ink-500)]">Pay at the Cashier's Office. Payment status is recorded by cashier staff.</div>
              </div>)}
          </div>
        </section>
        <section className={card}>
          <h3 className={title}>Installment Plan</h3>
          {!billing ? <p className="text-sm">Loading…</p> : !installments.length ?
            <p className="text-sm text-[var(--ink-500)]">No installment schedule has been published yet. Your assessed balance is shown above. Please confirm payment terms with the Cashier's Office.</p> :
            <ul className="m-0 list-none divide-y divide-[var(--line)] p-0 text-sm">
              {installments.map((row, index) => <li className="flex items-start justify-between gap-3 py-2.5" key={row.id ?? index}>
                <div><strong>{row.name}</strong><div className="text-xs text-[var(--ink-500)]">{row.due_date ? `Due ${date(row.due_date)}` : 'No due date set'}</div></div>
                <div className={`text-right font-bold ${row.status === 'paid' ? 'text-[var(--green)]' : 'text-[var(--pink-600)]'}`}>
                  {money(row.amount)}<div className="text-xs">{row.status === 'paid' ? '✓ PAID' : 'PENDING'}</div>
                </div>
              </li>)}
            </ul>}
        </section>
      </div>
    </div>
    <section className={`${card} mt-4`}>
      <h3 className={`${title} mb-3`}>Fee Assessment &amp; Payment Breakdown</h3>
      {!billing ? <p className="text-sm">Loading…</p> : <div className="grid gap-4">
        <div className={scroll} role="region" aria-label="Enrolled subjects and fees" tabIndex={0}>
          <table className={table}>
            <caption className="bg-[var(--bg)] p-3 text-left font-bold">Enrolled Subjects — {billing.activeSemester} {billing.activeSchoolYear}</caption>
            <thead><tr><th scope="col">Code</th><th scope="col">Subject</th><th scope="col" className={amount}>Units</th><th scope="col" className={amount}>Fee</th></tr></thead>
            <tbody>
              {billing.enrolledCourses.map((row, index) => <tr key={index}><td>{row.code}</td><td>{row.title}</td><td className={amount}>{Number(row.units || 0).toFixed(1)} u</td><td className={amount}>{money(row.fee)}</td></tr>)}
              {!billing.enrolledCourses.length && <tr><td colSpan={4} className="text-center">No enrolled subjects this term.</td></tr>}
              {billing.miscFeesList.map((row, index) => <tr key={row.id ?? index}><td colSpan={3}>{row.name}</td><td className={amount}>{money(row.amount)}</td></tr>)}
            </tbody>
            <tfoot className="border-t border-[var(--line)] bg-[var(--bg)] font-bold">
              <tr><td colSpan={3}>Tuition Subtotal</td><td className={amount}>{money(billing.tuitionTotal)}</td></tr>
              {!!billing.miscTotal && <tr><td colSpan={3}>Miscellaneous Fees</td><td className={amount}>{money(billing.miscTotal)}</td></tr>}
              <tr className="text-[var(--pink-600)]"><td colSpan={3}>Total Assessment</td><td className={amount}>{money(billing.totalAssessment)}</td></tr>
            </tfoot>
          </table>
        </div>
        {!!installments.length && <div className={scroll} role="region" aria-label="Per-term payment schedule" tabIndex={0}>
          <table className={table}>
            <caption className="bg-[var(--bg)] p-3 text-left font-bold">Per-Term Payment Schedule</caption>
            <thead><tr><th scope="col">Term</th><th scope="col">Due Date</th><th scope="col" className={amount}>Amount</th><th scope="col">Status</th></tr></thead>
            <tbody>
              {installments.map((row, index) => <tr key={row.id ?? index}>
                <td>{row.name}</td><td>{row.due_date ? date(row.due_date) : 'TBA'}</td><td className={amount}>{money(row.amount)}</td>
                <td>{row.status === 'paid' ? '✓ PAID' : `${billing.totalAssessment > 0 ? Math.round(Number(row.amount) / billing.totalAssessment * 100) : 0}%`}</td>
              </tr>)}
            </tbody>
            <tfoot className="border-t border-[var(--line)] bg-[var(--bg)] font-bold">
              <tr className="text-[var(--green)]"><td colSpan={2}>Total Paid</td><td className={amount}>{money(billing.totalPaid)}</td><td /></tr>
              <tr className="text-[var(--red)]"><td colSpan={2}>Remaining Balance</td><td className={amount}>{money(billing.balance)}</td><td /></tr>
            </tfoot>
          </table>
        </div>}
      </div>}
    </section>
  </>;
}
