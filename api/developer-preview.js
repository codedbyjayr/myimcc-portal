import { createClient } from '@supabase/supabase-js';

const dashboards = Object.freeze({
  student: '/student/dashboard.html',
  faculty: '/faculty/teacher-dashboard.html',
  dean: '/faculty/dean-dashboard.html',
  registrar: '/staff/registrar-dashboard.html',
  staff: '/staff/staff-dashboard.html',
  admin: '/admin/admin-dashboard.html',
});

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Only GET is allowed.' });
  }
  const token = req.headers.authorization?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) return res.status(401).json({ error: 'Sign in to use dashboard preview.' });
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return res.status(503).json({ error: 'Dashboard preview is not configured.' });

  try {
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error } = await client.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Your session has expired. Sign in again.' });
    if (user.email?.toLowerCase() !== 'jlm33405@imcc.edu.ph' || !user.email_confirmed_at) {
      return res.status(403).json({ error: 'Developer preview access is not enabled for this account.' });
    }
    // Decode assurance only after Auth has verified this exact token.
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    if (claims.aal !== 'aal2') return res.status(403).json({ error: 'Complete MFA before opening developer preview.' });
    const { data: profile, error: profileError } = await client.from('profiles')
      .select('role,status,is_active').eq('id', user.id).single();
    if (profileError || !profile || profile.role !== 'admin'
      || profile.status !== 'approved' || profile.is_active !== true) {
      return res.status(403).json({ error: 'An approved, active admin account is required.' });
    }
    // Preview serves layout locations only. No user records, write calls or role changes.
    return res.status(200).json({ dashboards });
  } catch {
    return res.status(503).json({ error: 'Dashboard preview is temporarily unavailable.' });
  }
}
