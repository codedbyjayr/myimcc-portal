// shared/supabase-config.js
const SUPABASE_URL = 'https://YOUR_SUPABASE_PROJECT_ID.supabase.co'; // Replace with your actual URL
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';                 // Replace with your actual Anon Key

let _supabaseInstance = null;

async function getSupabaseClientAsync() {
  if (_supabaseInstance) return _supabaseInstance;

  try {
    // Attempt dynamic API fetch if running on server backend
    const res = await fetch('/api/config');
    if (res.ok) {
      const config = await res.json();
      _supabaseInstance = window.supabase.createClient(config.supabaseUrl, config.supabaseKey);
      return _supabaseInstance;
    }
  } catch (e) {
    console.warn("Backend /api/config unavailable, falling back to static config.");
  }

  // Fallback for static hosting (GitHub Pages)
  if (window.supabase) {
    _supabaseInstance = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return _supabaseInstance;
  } else {
    throw new Error("Supabase CDN library not loaded.");
  }
}