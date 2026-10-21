import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
for(const path of ['faculty/dean-dashboard.js','review-assets/faculty/dean-dashboard.js']) {
 const source=readFileSync(path,'utf8');
 const search={value:'',setAttribute(){},addEventListener(_,fn){this.input=fn;}};
 const select={value:'',style:{},after(){},replaceChildren(...options){this.options=options;},add(option){this.options.push(option);}};
 const context={getEl:id=>id==='field_catalog_search'?search:select,document:{createElement:()=>({setAttribute(){}})},Option:function(text,value){this.text=text;this.value=value;},state:{courses:[{code:'CAP 102',title:'Capstone Research',units:3},{code:'IAS 102',title:'Information Assurance',units:3}]}};
 vm.runInNewContext(source.slice(source.indexOf("            const search = getEl('field_catalog_search');"),source.indexOf('            const isEdit =',source.indexOf("            const search = getEl('field_catalog_search');"))),context);
 assert.equal(select.size,5);assert.equal(select.options.length,3);
 search.value='research';search.input();assert.equal(select.options[1].value,'CAP 102');
 search.value=' iAs ';search.input();assert.equal(select.options[1].value,'IAS 102');
 search.value='no match';search.input();assert.equal(select.options.length,1);assert.match(select.options[0].text,/No subjects found/);
 search.value='';search.input();assert.equal(select.options.length,3);
}
console.log('Subject search: code, title, whitespace, empty results and clear recovery passed for normal and demo sources.');

