import assert from 'node:assert/strict';
import {beginBrowserReceipt,observeBrowserReceipt,resolveBrowserReceipt} from '../core/browser/index.ts';
const now=1000,task={id:'task',kind:'task',title:'Review request',status:'open',sources:[{id:'mail',quote:'original'}]};
const input={id:'receipt',label:'Submit',origin:'https://example.com',attemptKey:'doc:1',taskID:'task',items:[task],receipts:[],now};
const row=beginBrowserReceipt(input),saved=JSON.stringify(row);
assert.equal(row.status,'unverified');assert.equal(row.taskID,task.id);
assert.throws(()=>beginBrowserReceipt({...input,origin:'https://example.com/?token=secret'}));
assert.throws(()=>beginBrowserReceipt({...input,origin:'https://user@example.com'}));
assert.throws(()=>beginBrowserReceipt({...input,taskID:'missing'}));
assert.throws(()=>beginBrowserReceipt({...input,id:'another',receipts:[row]}),/already attempted/);
assert.throws(()=>beginBrowserReceipt({...input,id:'another',attemptKey:'doc:2',receipts:[row]}),/Check the previous step first/);
// Once the previous step was inspected, the next step of a multi-step flow (cancel, then confirm) proceeds.
assert.equal(beginBrowserReceipt({...input,id:'another',attemptKey:'doc2:5',receipts:[{...row,inspectedAt:new Date(input.now*1000).toISOString()}]}).status,'unverified');
assert.throws(()=>beginBrowserReceipt({...input,id:'another',receipts:[{...row,inspectedAt:new Date(input.now*1000).toISOString()}]}),/already attempted/,'the same control never repeats');
assert.throws(()=>resolveBrowserReceipt({receipt:row,done:true,items:[task],now}),/Check the result/);
const observed=observeBrowserReceipt(row,row.origin,now);
assert.equal(observeBrowserReceipt(observed,'https://other.example.com',now+1).inspectedAt,undefined);
for(const clock of [now-1,now+300,NaN])assert.throws(()=>resolveBrowserReceipt({receipt:observed,done:true,items:[task],now:clock}));
const done=resolveBrowserReceipt({receipt:observed,done:true,items:[{sources:task.sources,status:'open',title:task.title,kind:'task',id:'task'}],now:now+1});
assert.equal(done.completeTaskID,'task');assert.equal(done.receipt.task,undefined);assert.equal(done.event,'verified');
assert.throws(()=>resolveBrowserReceipt({receipt:observed,done:true,items:[{...task,status:'dismissed'}],now}),/changed/);
assert.throws(()=>resolveBrowserReceipt({receipt:observed,done:true,items:[],now}),/changed/);
// A synthesis refresh rewords the task while Fox works on it: still the same obligation.
assert.equal(resolveBrowserReceipt({receipt:observed,done:true,items:[{...task,title:'Review the request',summary:'Reworded.',runId:'later',updatedAt:'2026-10-01T00:00:00Z'}],now:now+1}).completeTaskID,'task');
// Changed evidence, timing or kind is a different obligation.
for(const changed of [{sources:[{id:'mail',quote:'other'}]},{due:'2026-10-02'},{kind:'finding'}])
 assert.throws(()=>resolveBrowserReceipt({receipt:observed,done:true,items:[{...task,...changed}],now:now+1}),/changed/);
// A task already settled (e.g. reviewed as resolved) still accepts the person's confirmation, once.
const settled=resolveBrowserReceipt({receipt:observed,done:true,items:[{...task,status:'done',assessment:'resolved'}],now:now+1});
assert.equal(settled.event,'verified');assert.equal(settled.completeTaskID,undefined,'no second completion');
assert.throws(()=>resolveBrowserReceipt({receipt:done.receipt,done:true,items:[task],now}),/already reviewed/);
const declined=resolveBrowserReceipt({receipt:row,done:false,items:[],now});
assert.equal(declined.completeTaskID,undefined);assert.equal(declined.event,'not_completed');
assert.equal(JSON.stringify(row),saved);assert.equal(task.status,'open');
console.log('PASS browser receipts: duplicate attempts, origin privacy, inspection freshness, changed/deleted task fencing (presentation refresh allowed), confirming an already-settled task and immutable decisions');
