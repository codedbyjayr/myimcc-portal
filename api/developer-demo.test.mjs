import assert from 'node:assert/strict';
import handler from './developer-demo.js';
const originalFetch=globalThis.fetch, originalUrl=process.env.SUPABASE_URL, originalKey=process.env.SUPABASE_ANON_KEY;
process.env.SUPABASE_URL='https://main-demo.invalid'; process.env.SUPABASE_ANON_KEY='public-key';
const jwt=claims=>'header.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.signature';
const parentToken=jwt({aal:'aal2'}), demoToken=jwt({sub:'demo-dean',exp:Math.floor(Date.now()/1000)+3600});
const developer={id:'developer',email:'jlm33405@imcc.edu.ph',email_confirmed_at:'2026-10-20'};
let mainUser=developer, active=true, available=true, expired=false;
const status=()=>({available,expiresAt:new Date(Date.now()+(expired ? -1000:3600000)).toISOString(),ticketSecret:'secret'.repeat(12),
  accounts:{dean:{id:'demo-dean',email:'review.dean.fixture@example.invalid',password:'hidden-password'.repeat(4)}}});
let forwarded=[];
globalThis.fetch=async (input,options={})=>{
  const url=new URL(String(input)), headers=new Headers(options.headers);
  assert.equal(url.origin,'https://main-demo.invalid');
  if(url.pathname==='/auth/v1/user') return Response.json(mainUser);
  if(url.pathname==='/rest/v1/profiles' && headers.get('accept-profile')!=='imcc_review') return Response.json({role:'admin',status:'approved',is_active:active});
  if(url.pathname==='/rest/v1/rpc/developer_demo_status') return Response.json(status());
  if(url.pathname==='/auth/v1/token') {
    const credentials=JSON.parse(options.body);
    assert.equal(credentials.email,status().accounts.dean.email);
    return Response.json({access_token:demoToken,refresh_token:'never-exposed',token_type:'bearer',expires_in:3600,user:{id:'demo-dean',email:credentials.email}});
  }
  assert.equal(headers.get('authorization'),'Bearer '+demoToken,'Use actual demo identity, never developer token');
  assert.equal(headers.get('accept-profile'),'imcc_review');
  assert.equal(headers.get('content-profile'),'imcc_review');
  forwarded.push({url,options});
  return Response.json([{id:1}],{headers:{'content-range':'0-0/1'}});
};
async function request(body,method=body?'POST':'GET',token=parentToken){
  const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(body){this.body=body;return this;},send(body){this.body=body;return this;}};
  await handler({method,url:'/api/developer-demo',headers:{authorization:'Bearer '+token},body},res);
  assert.equal(res.headers['Cache-Control'],'no-store'); return res;
}
try {
  const metadata=await request(); assert.equal(metadata.code,200);
  assert.deepEqual(Object.keys(metadata.body).sort(),['available','expiresAt','roles']);
  assert.equal((await request(undefined,'DELETE')).code,405);
  assert.equal((await request(undefined,'GET',jwt({aal:'aal1'}))).code,403);
  mainUser={...developer,email:'another@imcc.edu.ph'}; assert.equal((await request()).code,403); mainUser=developer;
  active=false; assert.equal((await request()).code,403);active=true;
  const started=await request({action:'start',role:'dean'});assert.equal(started.code,200);
  assert(!JSON.stringify(started.body).includes(demoToken));
  assert(!JSON.stringify(started.body).includes('hidden-password'));
  assert(!JSON.stringify(started.body).includes('never-exposed'));
  const ticket=started.body.ticket;
  const send=(resource,method='PATCH',extra={})=>request({action:'request',ticket,resource,method,body:{note:'Fictional review'},...extra});
  assert.equal((await send('/rest/v1/course_offerings?id=eq.1','PATCH',{prefer:'return=representation'})).code,200);
  assert.equal(forwarded.length,1);
  for(const resource of ['https://other.invalid/rest/v1/profiles','//other.invalid/rest/v1/profiles','/auth/v1/admin/users','/rest/v1/../auth/v1/user','/rest/v1/rpc/developer_demo_status','/rest/v1/rpc/configure_demo_review','/rest/v1/profiles\\other']) {
    assert.equal((await send(resource)).code,400,resource);
  }
  assert.equal((await send('/rest/v1/profiles','PUT')).code,400);
  assert.equal((await send('/rest/v1/profiles','GET',{ticket:ticket+'tampered'})).code,401);
  expired=true;assert.equal((await send('/rest/v1/profiles')).code,403);expired=false;
  available=false;assert.equal((await send('/rest/v1/profiles')).code,503);available=true;
  assert.equal(forwarded.length,1,'Denied requests must never reach data tables');
  assert.equal((await request({action:'start',role:'owner'})).code,400);
  console.log('Demo API: verified admin/MFA, opaque sessions, fixed review schema, path restrictions and revocation passed.');
} finally {
  globalThis.fetch=originalFetch;
  if(originalUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=originalUrl;
  if(originalKey===undefined)delete process.env.SUPABASE_ANON_KEY;else process.env.SUPABASE_ANON_KEY=originalKey;
}
