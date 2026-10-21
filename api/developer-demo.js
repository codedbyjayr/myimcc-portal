import { createClient } from '@supabase/supabase-js';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { verifyDeveloperAccess } from './developer-preview.js';

const paths = { student:'/student/dashboard.html', faculty:'/faculty/teacher-dashboard.html',
  dean:'/faculty/dean-dashboard.html', admin:'/admin/admin-dashboard.html',
  registrar:'/staff/registrar-dashboard.html', staff:'/staff/staff-dashboard.html' };
const rpc = 'get_class_roster|get_subject_instructor_options|get_dean_student_directory|list_student_records|get_student_record|helpdesk_recipient_id|save_course_offering_with_instructor|review_enrollment_request|cancel_enrollment_request|list_enrollment_request_history|get_enrollment_workspace|finalize_enrollment|lock_class_grades|set_enrollment_term|revert_grade|admin_set_profile_access|set_user_role|set_user_approval|set_user_active|initialize_student_clearances';
const authOptions = { persistSession:false, autoRefreshToken:false, detectSessionInUrl:false };
async function provisionDemo(access) {
  const service = createClient(access.url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:authOptions});
  const accounts = {}, created = [];
  try {
    for (const role of [...Object.keys(paths),'pending']) {
      const email = 'review.'+role+'.'+randomBytes(8).toString('hex')+'@example.invalid';
      const password = 'Review!A7-' + randomBytes(32).toString('hex');
      const {data,error} = await service.auth.admin.createUser({email,password,email_confirm:true,
        user_metadata:{full_name:'DEMO '+role},app_metadata:{imcc_review:true}});
      if (error || !data.user) throw Error('Demo account setup failed');
      created.push(data.user.id);
      accounts[role] = {id:data.user.id,email,password};
    }
    const {error} = await service.rpc('configure_demo_review',{p_accounts:accounts});
    if (error) throw Error('Demo record setup failed');
  } catch(error) {
    await Promise.allSettled(created.map(id=>service.auth.admin.deleteUser(id)));
    throw error;
  }
}
function ticketKey(secret) { return createHash('sha256').update(secret).digest(); }
function seal(value,secret) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', ticketKey(secret), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64url');
}
function open(value,secret) {
  if (typeof value !== 'string' || value.length>12000) throw Error('Invalid session');
  const data = Buffer.from(value,'base64url');
  const cipher = createDecipheriv('aes-256-gcm', ticketKey(secret), data.subarray(0,12));
  cipher.setAuthTag(data.subarray(12,28));
  return JSON.parse(Buffer.concat([cipher.update(data.subarray(28)),cipher.final()]).toString());
}

export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if (!['GET','POST'].includes(req.method)) return res.status(405).json({error:'Use GET or POST.'});
  const access = await verifyDeveloperAccess(req,res);
  if (!access) return;
  try {
    const input = req.method==='POST' ? req.body : {};
    if (!input || typeof input!=='object' || Array.isArray(input) || JSON.stringify(input).length>131072) {
      return res.status(400).json({error:'Invalid demo request.'});
    }
    let {data:status,error:statusError} = await access.client.rpc('developer_demo_status',{p_enable:input.action==='start'});
    if (statusError || !status?.available) return res.status(503).json({error:'Demo review is unavailable.'});
    if (req.method==='GET') return res.status(200).json({available:true,roles:Object.keys(status.accounts),expiresAt:status.expiresAt});
    const deadline = Date.parse(status.expiresAt);
    if (!(deadline>Date.now())) return res.status(403).json({error:'Demo review has expired.'});
    if (input.action==='start') {
      if (!Object.hasOwn(paths,input.role)) return res.status(400).json({error:'Demo role is unavailable.'});
      if (!Object.keys(status.accounts).length) {
        await provisionDemo(access);
        const updated = await access.client.rpc('developer_demo_status');
        if (updated.error) throw Error('Demo account setup failed');
        status=updated.data;
      }
      const account = Object.hasOwn(paths,input.role) && status.accounts[input.role];
      if (!account) return res.status(400).json({error:'Demo role is unavailable.'});
      const client = createClient(access.url,access.key,{auth:authOptions,db:{schema:'imcc_review'}});
      const login = await client.auth.signInWithPassword({email:account.email,password:account.password});
      const session = login.data.session;
      if (login.error || session?.user.id!==account.id) throw Error('Demo login unavailable');
      const expiresAt = Math.min(deadline,session.expires_at*1000,Date.now()+1800000);
      return res.status(200).json({role:input.role,user:{id:account.id,email:account.email},
        path:paths[input.role],expiresAt,
        ticket:seal({admin:access.user.id,role:input.role,id:account.id,token:session.access_token,expiresAt},status.ticketSecret)});
    }
    if (input.action!=='request') return res.status(400).json({error:'Unknown demo action.'});
    let session;
    try { session = open(input.ticket,status.ticketSecret); } catch { return res.status(401).json({error:'Invalid demo session.'}); }
    if (session.admin!==access.user.id || session.expiresAt<=Date.now() || status.accounts[session.role]?.id!==session.id) {
      return res.status(403).json({error:'Demo session has ended.'});
    }
    const resource = input.resource;
    const method = input.method;
    if (typeof resource!=='string' || resource.length>16000 || !resource.startsWith('/rest/v1/') || resource.includes('\\')
      || !['GET','HEAD','POST','PATCH','DELETE'].includes(method)) return res.status(400).json({error:'Invalid demo resource.'});
    const target = new URL(resource,access.url);
    if (target.origin!==new URL(access.url).origin || !new RegExp(`^/rest/v1/(?:[a-z_][a-z_0-9]*|rpc/(?:${rpc}))$`).test(target.pathname)) {
      return res.status(400).json({error:'Only demo dashboard data is available.'});
    }
    const headers = {apikey:access.key,Authorization:'Bearer '+session.token,
      'Accept-Profile':'imcc_review','Content-Profile':'imcc_review',Accept:'application/json'};
    if (['application/vnd.pgrst.object+json','application/vnd.pgrst.array+json'].includes(input.accept)) headers.Accept=input.accept;
    if (typeof input.prefer==='string' && input.prefer.split(',').every(p=>/^(return=(minimal|representation)|resolution=(merge-duplicates|ignore-duplicates)|count=(exact|planned|estimated)|missing=default)$/.test(p.trim()))) headers.Prefer=input.prefer;
    if (/^\d+-\d*$/.test(input.range || '')) headers.Range=input.range;
    let body;
    if (input.body!=null && !['GET','HEAD'].includes(method)) {
      body=JSON.stringify(input.body); headers['Content-Type']='application/json';
    }
    // The schema is fixed here; neither iframe input nor query parameters can select public.
    const response = await fetch(target,{method,headers,body,redirect:'error',signal:AbortSignal.timeout(15000)});
    res.setHeader('Content-Type','application/json');
    if (response.headers.has('content-range')) res.setHeader('Content-Range',response.headers.get('content-range'));
    return res.status(response.status).send(await response.text());
  } catch { return res.status(503).json({error:'Demo review is temporarily unavailable.'}); }
}
