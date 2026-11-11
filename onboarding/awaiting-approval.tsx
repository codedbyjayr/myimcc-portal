import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './awaiting-approval.css';

const pending = {
  title: 'Account Pending Approval',
  message: 'Your registration request has been submitted to the administrator. You will be able to access your dashboard once your account is reviewed and approved.',
};
const messages = {
  rejected: {
    title: 'Access Request Not Approved',
    message: 'An administrator reviewed your account and declined it. Waiting here will not change that. If you believe this is a mistake, contact the Registrar or your department administrator.',
  },
  suspended: {
    title: 'Account Suspended',
    message: 'Your portal access has been suspended. Please contact the Registrar or your department administrator to have it restored.',
  },
};

function AwaitingApproval() {
  const [copy, setCopy] = useState(pending);
  const [error, setError] = useState('');
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function refresh() {
      try {
        const client = await window.getSupabaseClientAsync();
        const { data: { user }, error: authError } = await client.auth.getUser();
        if (cancelled) return;
        if (authError && authError.name !== 'AuthSessionMissingError') throw authError;
        if (!user) {
          window.location.href = '../auth/login.html';
          return;
        }
        const { data: profile, error: profileError } = await client
          .from('profiles').select('status, role, is_active').eq('id', user.id).single();
        if (cancelled) return;
        if (profileError) throw profileError;
        if (!profile) return;

        const route = window.IMCC.resolveRoute(profile);
        if (route.kind === 'redirect' && route.url && !window.IMCC.isCurrentPage(route.url)) {
          window.location.href = route.url;
          return;
        }
        setCopy(messages[route.kind as keyof typeof messages] || pending);
      } catch {
        // Keep the last known account status during a temporary connection failure.
      } finally {
        if (!cancelled) timer = setTimeout(refresh, 20000);
      }
    }

    void refresh();
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);

  async function signOut() {
    setSigningOut(true);
    setError('');
    try {
      const client = await window.getSupabaseClientAsync();
      const { error } = await client.auth.signOut();
      if (error) throw error;
      window.location.href = '../auth/login.html';
    } catch {
      setError('Unable to sign out. Please try again.');
      setSigningOut(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#141019] p-5 font-sans text-[#F3EEF7]">
      <section aria-labelledby="pendingTitle" className="w-full max-w-[440px] rounded-2xl border border-[#312A3B] bg-[#1D1724] px-8 py-10 text-center shadow-[0_20px_25px_-5px_rgba(0,0,0,0.5)]">
        <div aria-hidden="true" className="mb-5 inline-flex size-16 items-center justify-center rounded-full bg-[#C77A08]/16 text-[#C77A08]">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
        </div>
        <div aria-live="polite" aria-atomic="true">
          <h1 id="pendingTitle" className="mt-0 mb-3 font-heading text-[22px] font-extrabold">{copy.title}</h1>
          <p id="pendingMessage" className="mt-0 mb-7 text-sm leading-[1.6] text-[#A79FB5]">{copy.message}</p>
        </div>
        <button id="signOutBtn" type="button" onClick={signOut} disabled={signingOut} className="cursor-pointer rounded-lg bg-transparent border border-[#312A3B] px-5 py-2.5 font-sans text-base font-semibold transition-colors hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#E7338A] disabled:cursor-wait disabled:opacity-60">
          {signingOut ? 'Signing Out…' : 'Sign Out'}
        </button>
        {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<AwaitingApproval />);
