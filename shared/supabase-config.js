const DEFAULT_SUPABASE_URL = 'https://dusiokpfmkhutptomrqg.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1c2lva3BmbWtodXRwdG9tcnFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwMjczMzgsImV4cCI6MjEwMTYwMzMzOH0.pBjIXmcesFDU_lHDbhQA1CduWqxEY1SeaRgVh51fuKI';

let SUPABASE_URL = (window.__ENV__ && window.__ENV__.SUPABASE_URL) || DEFAULT_SUPABASE_URL;
const SUPABASE_ANON_KEY = (window.__ENV__ && window.__ENV__.SUPABASE_ANON_KEY) || DEFAULT_SUPABASE_ANON_KEY;

if (SUPABASE_URL) {
  // Normalize SUPABASE_URL in case it has /rest/v1 or trailing slashes
  SUPABASE_URL = SUPABASE_URL.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
}

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Supabase environment variables missing.");
} else {
  // Initialize Supabase client
  const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      flowType: 'pkce',
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true
    }
  });

  // Expose client globally under both custom and standard aliases
  window.__myimcc_supabase_client__ = client;
  window.supabaseClient = client;

  window.dispatchEvent(new Event('supabase:ready'));
}

// Backward-compatibility helper for scripts expecting getSupabaseClientAsync()
async function getSupabaseClientAsync() {
  if (window.__myimcc_supabase_client__) {
    return window.__myimcc_supabase_client__;
  }
  throw new Error("Supabase client is not initialized.");
}