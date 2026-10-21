import handler from '../../../api/developer-demo.js';
import { corsHeaders } from '../_shared/cors.ts';

// The same tested handler runs here with Supabase's server-only runtime credentials.
Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok',{headers:corsHeaders});
  if (Number(request.headers.get('content-length') || 0)>131072) return new Response('Request too large',{status:413,headers:corsHeaders});
  let body;
  if (request.method==='POST') {
    const text=await request.text();
    if (text.length>131072) return new Response('Request too large',{status:413,headers:corsHeaders});
    try { body=JSON.parse(text); } catch { return new Response('Invalid JSON',{status:400,headers:corsHeaders}); }
  }
  let status=200, output='';
  const headers: Record<string,string>={...corsHeaders};
  const response = {
    setHeader(name:string,value:string){headers[name]=value;},
    status(code:number){status=code;return this;},
    json(value:unknown){headers['Content-Type']='application/json';output=JSON.stringify(value);return this;},
    send(value:string){output=value;return this;},
  };
  await handler({method:request.method,url:request.url,headers:Object.fromEntries(request.headers),body},response);
  return new Response(status===204 ? null : output,{status,headers});
});
