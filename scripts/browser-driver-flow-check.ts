import assert from 'node:assert/strict';
import {browserDriverStart,browserDriverNext} from '../core/browser/index.ts';
const refs={e1:{role:'combobox',name:'Search'}};
const base={documentId:'d1',revision:'d2',refs,url:'https://example.com'};
assert.ok(browserDriverStart({...base,args:{operation:'click',documentId:'stale',ref:'e1'}}).result.error);
function prepare(operation:string,attributes:Record<string,unknown>={}){
 let flow=browserDriverStart({...base,args:{operation,documentId:'d1',ref:'e1',text:'query'}});
 while(flow.stage==='attribute'){
  const key=flow.argv[3];flow=browserDriverNext({flow,response:{value:key==='type'?'text':attributes[key]??null}});
 }
 return flow;
}
assert.deepEqual(prepare('fill').argv,['fill','@e1','query']);
assert.ok(prepare('fill',{readonly:''}).result.error);
assert.ok(prepare('fill',{autocomplete:'one-time-code'}).result.error);
assert.equal(prepare('prepare').result.editable,true);
// One Core rule decides receipts; a submit intent always records one. No approval step exists.
function prepared(intent:string,refs:Record<string,unknown>){
 let flow=browserDriverStart({...base,refs,args:{operation:'prepare',intent,documentId:'d1',ref:'e1'}});
 while(!flow.result)flow=browserDriverNext({flow,response:{value:null,text:''}});
 return flow.result;
}
assert.equal(prepared('click',refs).receipt,false);assert.equal(prepared('submit',refs).receipt,true);
assert.equal(prepared('click',{e1:{role:'button',name:'Accept terms'}}).receipt,true);assert.ok(!(('requires'+'Confirmation') in prepared('click',{e1:{role:'button',name:'Accept terms'}})));
const focus=prepare('submit');assert.deepEqual(focus.argv,['focus','@e1']);
const submit=browserDriverNext({flow:focus,response:{}});assert.deepEqual(submit.argv,['press','Enter']);assert.equal(submit.consume,true);
assert.equal(browserDriverNext({flow:submit,response:{}}).result.action,'submitted');
assert.equal(prepare('click').consume,true);
const snapshot=browserDriverStart({...base,args:{operation:'snapshot'}});
let view=browserDriverNext({flow:snapshot,response:{refs:{...refs,e2:{role:'textbox',name:'Secret fixture'},e3:{role:'textbox',name:'Billing'}},snapshot:'Search [ref=e1]\nSecret fixture [ref=e2]\nBilling [ref=e3]'}});
while(view.argv){
 const [, ,ref,attribute]=view.argv;
 view=browserDriverNext({flow:view,response:{value:ref==='@e2'&&attribute==='type'?'password':ref==='@e3'&&attribute==='autocomplete'?'cc-number':null}});
}
assert.equal(view.documentId,'d2');assert.equal(view.result.driver,'agent-browser');
assert.deepEqual(Object.keys(view.refs),['e1']);
assert.ok(!view.result.text.includes('Secret fixture'));assert.ok(!view.result.text.includes('Billing'));
assert.ok(browserDriverStart({...base,refs:view.refs,args:{operation:'fill',documentId:'d1',ref:'e2',text:'x'}}).result.error);
assert.equal(browserDriverStart({...base,args:{operation:'scroll'}}).consume,true);
console.log('PASS shared browser command flow: snapshots, stale refs, editable fields, sensitive fields, Core receipt decisions and consumed click/submit/scroll');
