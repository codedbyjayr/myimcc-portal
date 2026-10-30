import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../onboarding/select-role.js',import.meta.url),'utf8');
for(const role of ['student','faculty']) {
 const nodes={}, writes=[];
 const node=id=>nodes[id]??={value:'',hidden:false,disabled:false,required:false,addEventListener(event,fn){this[event]=fn;},replaceChildren(){},add(){}};
 node('requestedRole').value=role;
 node('fullName').value='Test Student';
 node('idNumber').value='TEST-001';
 let ready;
 const client={auth:{getUser:async()=>({data:{user:{id:'student',email:'test@example.invalid'}}})},from(table){
  return {select(){return this;},eq(){return this;},single:async()=>({data:{status:'onboarding',role:'student',is_active:true,program:'BSIT'}}),
   update(payload){writes.push(payload);return this;},then(resolve){resolve({data:[],error:null});}};
 }};
 const context=vm.createContext({window:{IMCC:{resolveRoute:()=>({kind:'redirect',url:'/onboarding/select-role.html'}),isCurrentPage:()=>true,
  fetchAll:async()=>({data:[{program:'BSIT',year_level:4}],error:null})},location:{}},
  document:{getElementById:node,addEventListener(event,fn){ready=fn;}},getSupabaseClientAsync:async()=>client,
  Option:function(text,value){this.text=text;this.value=value;},console,Date});
 vm.runInContext(source,context);
 await ready();
 assert.equal(node('studentAcademicFields').hidden,role!=='student');
 assert.equal(node('studentYear').required,role==='student');
 if(role==='student') {
  await node('onboardForm').submit({preventDefault(){}});
  assert.equal(writes.length,0,'Missing year must not submit');
  node('studentYear').value='4th Year';
 }
 await node('onboardForm').submit({preventDefault(){}});
 assert.equal(writes.length,1);
 assert.equal(writes[0].requested_role,role);
 if(role==='student') {
  assert.equal(writes[0].program,'BSIT');
  assert.equal(writes[0].year_level,'4th Year');
 } else assert(!('year_level' in writes[0]),'Faculty setup must not overwrite academic details');
}
console.log('Student setup: required academic details, saved selection and faculty requests passed.');
