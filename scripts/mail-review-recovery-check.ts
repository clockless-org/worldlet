// Offline UI event test: an uncertain send becomes read-only reconciliation, never resend.
import assert from 'node:assert/strict';
import {presentEmailReview,mountEmailReview} from '../ui/companion/fox-email-review.ts';
class Element {className='';textContent='';style:any={};type='';disabled=false;onclick:any;children:any[]=[];append(...children:any[]){this.children.push(...children);}}
(globalThis as any).document={createElement:()=>new Element()};
const draft={from:'me@example.com',to:'alex@example.com',subject:'Hello',body:'Reviewed content'};
let guide:any;const view=()=>({setGuide:(next:any)=>guide=next});
const calls:string[]=[];let found=false;
presentEmailReview(async(_action:string,{operation}:any)=>{calls.push(operation);if(operation==='send')throw Error('Lost reply');if(operation==='reconcile')return {status:found?'sent':'unknown'};throw Error('Unexpected write');},view,{id:'review',draft});
let [send,close]=guide.actions;
await send.onclick();
assert.deepEqual(calls,['send','reconcile']);assert.equal(send.textContent,'Check delivery');assert.equal(close.textContent,'Close');
assert.match(guide.text,/not confirmed/);
await send.onclick();assert.equal(calls.filter(x=>x==='send').length,1);assert.match(guide.text,/not confirmed/);
found=true;await send.onclick();assert.match(guide.text,/Sent to alex/);assert.deepEqual(guide.actions,[]);await Promise.resolve();assert.ok(calls.includes('acknowledge'),'Clean up only after rendering the confirmed result');
await send.onclick();assert.equal(calls.filter(x=>x==='send').length,1);
found=false;
presentEmailReview(async(_action:string,{operation}:any)=>{if(operation==='send')throw Error('Lost reply');if(operation==='reconcile')return {status:'unknown'};throw Error('Cannot cancel an attempted send');},view,{id:'review2',draft});
[send,close]=guide.actions;await send.onclick();await close.onclick();assert.match(guide.text,/unconfirmed/);assert.doesNotMatch(guide.text,/Nothing was sent/);
// Granting send access still requires a separate Send click.
let granted=false;const authCalls:string[]=[];
presentEmailReview(async(_action:string,{operation}:any)=>{authCalls.push(operation);if(operation==='authorize'){granted=true;return {ok:true};}return granted?{status:'sent'}:{needsAuthorization:true};},view,{id:'review3',draft});
[send]=guide.actions;await send.onclick();assert.equal(send.textContent,'Allow sending');await send.onclick();assert.deepEqual(authCalls,['send','authorize']);await send.onclick();assert.match(guide.text,/Sent to/);
console.log('PASS uncertain send auto-check, manual read-only retry, close wording, duplicate protection and separate authorization');

const resumedCalls:string[]=[];
presentEmailReview(async(_action:string,{operation}:any)=>{resumedCalls.push(operation);return {status:'unknown'};},view,{id:'restored',draft,attempted:true});
[send,close]=guide.actions;assert.equal(send.textContent,'Check delivery');await send.onclick();assert.deepEqual(resumedCalls,['reconcile'],'Restored attempts cannot resend');
console.log('PASS restored attempted draft only checks delivery');

const listeners:Record<string,Function>={};
(globalThis as any).window={addEventListener:(name:string,handler:Function)=>listeners[name]=handler};
const restoredOperations:string[]=[];
mountEmailReview(async(_action:string,{operation}:any)=>{restoredOperations.push(operation);return operation==='list'?{reviews:[{id:'saved',draft,attempted:true}]}:{status:'unknown'};},view);
await listeners['worldlet:email-drafts']();
assert.equal(guide.body.children.length,1);guide.body.children[0].onclick();
assert.equal(guide.actions[0].textContent,'Check delivery');await guide.actions[0].onclick();
assert.deepEqual(restoredOperations,['list','reconcile'],'Saved drafts entry must open immutable review without a send');
console.log('PASS saved-draft entry routes restored attempts to read-only recovery');

const listedOperations:string[]=[];
mountEmailReview(async(_action:string,{operation}:any)=>{listedOperations.push(operation);return operation==='list'?{reviews:[{id:'newest',draft:{...draft,to:'priya@example.com'},attempted:false},{id:'older',draft:{...draft,subject:'Older'},attempted:false},{id:'saved',draft,attempted:true}]}:{};},view);
await listeners['worldlet:email-drafts']();
assert.equal(guide.body.className,'fox-email-review');assert.match(guide.body.children[0].textContent,/To: priya@example\.com/);
assert.deepEqual(guide.actions.map((action:any)=>action.textContent),['Send','Cancel']);
assert.deepEqual(guide.body.children.slice(3).map((button:any)=>button.textContent),['Draft · Older','Check delivery · Hello']);
assert.deepEqual(listedOperations,['list'],'Opening saved drafts never sends');
console.log('PASS saved-draft entry keeps the newest pending draft open for review');
