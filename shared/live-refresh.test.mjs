import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('./live-refresh.js',import.meta.url),'utf8');
for (const demo of [undefined,false,true]) {
 const events={}, timers=new Map(), listeners=[], calls=[]; let interval, n=0, removed=0, complete;
 const channel={on(type,spec,fn){listeners.push({spec,fn});return this;},subscribe(fn){this.status=fn;}};
 const doc={hidden:false,addEventListener:(k,v)=>events[k]=v,removeEventListener:k=>delete events[k]};
 const client={channel:()=>channel,removeChannel:()=>removed++};
 const context={document:doc,console,Math,setTimeout:fn=>{timers.set(++n,fn);return n;},clearTimeout:id=>timers.delete(id),setInterval:fn=>{interval=fn;return 1;},clearInterval:()=>interval=null,addEventListener:(k,v)=>events[k]=v,removeEventListener:k=>delete events[k],IMCC_DEVELOPER_VIEW:demo};context.window=context;
 vm.runInNewContext(source,context);
 const stop=context.imccLiveRefresh(client,[{table:'grades',filter:'student_id=eq.own'}],async batch=>{calls.push(batch);if(complete)await new Promise(resolve=>complete=resolve);});
 async function flush(){const fns=[...timers.values()];timers.clear();for(const fn of fns)await fn();}
 if(demo===undefined){assert.equal(listeners.length,2);assert(listeners.every(l=>l.spec.filter==='student_id=eq.own'));listeners[0].fn();listeners[1].fn();await flush();assert.equal(calls.length,1);assert.deepEqual([...calls[0]],['grades']);}
 else assert.equal(listeners.length,0,'Brokered role views never open public sockets');
 const before=calls.length;doc.hidden=true;interval();await flush();assert.equal(calls.length,before);
 doc.hidden=false;events.visibilitychange();await flush();assert.equal(calls.length,before+1);
 interval();await flush();assert.equal(calls.length,before+2);
 stop();stop();assert.equal(timers.size,0);assert.equal(interval,null);assert.equal(removed,demo===undefined?1:0);assert.equal(events.online,undefined);
}
console.log('Live refresh: event coalescing, student filters, hidden tabs, fallback, demo isolation and cleanup passed.');
