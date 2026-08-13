const SUPABASE_URL = window.__ENV__?.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.__ENV__?.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Supabase environment variables missing from window.__ENV__.");
} else {
  // Initialize Supabase client
  const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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