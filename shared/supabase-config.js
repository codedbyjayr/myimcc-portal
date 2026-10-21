
let SUPABASE_URL = window.__ENV__?.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.__ENV__?.SUPABASE_ANON_KEY;

if (SUPABASE_URL) {
  // Normalize SUPABASE_URL in case it has /rest/v1 or trailing slashes
  SUPABASE_URL = SUPABASE_URL.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
}

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("Supabase environment configuration is missing.");
} else {
  // Safe storage adapter with in-memory fallback if localStorage is blocked by Tracking Prevention or Private Browsing
  const getSafeStorage = () => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const testKey = '__sb_test__';
        window.localStorage.setItem(testKey, testKey);
        window.localStorage.removeItem(testKey);
        return window.localStorage;
      }
    } catch (e) {
      console.warn('localStorage is restricted by browser tracking prevention or privacy settings. Falling back to memory storage.', e);
    }
    const memStore = {};
    return {
      getItem: (key) => memStore[key] ?? null,
      setItem: (key, value) => { memStore[key] = String(value); },
      removeItem: (key) => { delete memStore[key]; }
    };
  };

  // Initialize Supabase client
  const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      flowType: 'pkce',
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
      storage: getSafeStorage(),
      storageKey: 'myimcc-auth-token'
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