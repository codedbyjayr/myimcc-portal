import { createClient } from '@supabase/supabase-js';
import process from 'node:process';
import { Buffer } from 'node:buffer';

const dashboards = Object.freeze({
  student: '/student/dashboard.html',
  faculty: '/faculty/teacher-dashboard.html',
  dean: '/faculty/dean-dashboard.html',
  registrar: '/staff/registrar-dashboard.html',
  staff: '/staff/staff-dashboard.html',
  admin: '/admin/admin-dashboard.html',
});

export async function verifyDeveloperAccess(req, res) {
  const deny = (status, error) => { res.status(status).json({ error }); return null; };
  const token = req.headers.authorization?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) return deny(401, 'Sign in to use dashboard preview.');
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return deny(503, 'Dashboard preview is not configured.');

  try {
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error } = await client.auth.getUser(token);
    if (error || !user) return deny(401, 'Your session has expired. Sign in again.');
    if (user.email?.toLowerCase() !== 'jlm33405@imcc.edu.ph' || !user.email_confirmed_at) {
      return deny(403, 'Developer preview access is not enabled for this account.');
    }
    // Decode assurance only after Auth has verified this exact token.
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    if (claims.aal !== 'aal2') return deny(403, 'Complete MFA before opening developer preview.');
    const { data: profile, error: profileError } = await client.from('profiles')
      .select('role,status,is_active').eq('id', user.id).single();
    if (profileError || !profile || profile.role !== 'admin'
      || profile.status !== 'approved' || profile.is_active !== true) {
      return deny(403, 'An approved, active admin account is required.');
    }
    return { client, user, token, url, key };
  } catch {
    res.status(503).json({ error: 'Dashboard preview is temporarily unavailable.' });
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Only GET is allowed.' });
  }
  const access = await verifyDeveloperAccess(req, res);
  if (!access) return;
  const { user, token, url, key } = access;
  try {
    const resource = new URL(req.url, 'http://localhost').searchParams.get('resource');
    if (resource !== null) {
      const target = new URL(resource, url);
      const readRpc = 'get_class_roster|get_subject_instructor_options|get_dean_student_directory|list_student_records|get_student_record|helpdesk_recipient_id|list_enrollment_request_history|get_enrollment_workspace';
      if (!resource.startsWith('/rest/v1/') || resource.includes('\\')
        || target.origin !== new URL(url).origin
        || !new RegExp(`^/rest/v1/(?:[a-z_][a-z_0-9]*|rpc/(?:${readRpc}))$`).test(target.pathname)) {
        return res.status(400).json({ message: 'Only dashboard data reads are allowed.' });
      }
      const headers = { apikey: key, Authorization: `Bearer ${token}`, Accept: 'application/json' };
      if (['application/vnd.pgrst.object+json', 'application/vnd.pgrst.array+json'].includes(req.headers['x-preview-accept'])) {
        headers.Accept = req.headers['x-preview-accept'];
      }
      if (/^count=(exact|planned|estimated)$/.test(req.headers['x-preview-prefer'] || '')) headers.Prefer = req.headers['x-preview-prefer'];
      if (/^\d+-\d*$/.test(req.headers['x-preview-range'] || '')) headers.Range = req.headers['x-preview-range'];
      // PostgREST runs GET inside a READ ONLY transaction; the caller's JWT keeps existing RLS in force.
      const response = await fetch(target.href, { method: 'GET', headers, redirect: 'error', signal: AbortSignal.timeout(15000) });
      res.setHeader('Content-Type', 'application/json');
      if (response.headers.has('content-range')) res.setHeader('Content-Range', response.headers.get('content-range'));
      return res.status(response.status).send(await response.text());
    }
    return res.status(200).json({ dashboards, user: { id: user.id, email: user.email } });
  } catch {
    return res.status(503).json({ error: 'Dashboard preview is temporarily unavailable.' });
  }
}
