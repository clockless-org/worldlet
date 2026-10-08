// Real upstream binary + private provider + Chromium; no real accounts or model.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {chromium} from 'playwright';
import {browserDriverStart,browserDriverNext} from '../core/browser/index.ts';
const python=process.env.WORLDLET_TOOLS_PYTHON,binary=process.env.WORLDLET_AGENT_BROWSER;
if(!python||!binary)throw Error('Set WORLDLET_TOOLS_PYTHON and WORLDLET_AGENT_BROWSER to installed runtimes.');
const browser=await chromium.launch();
const page=await browser.newPage();
await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:`<title>Fixture</title><h1>Mailbox</h1><input role="combobox" aria-label="Search" type="text"><input type="password" aria-label="Secret fixture" value="credential-canary"><button type="button">Search tools</button><script>document.querySelector('input').addEventListener('keydown',e=>{if(e.key==='Enter')document.querySelector('h1').textContent='Submitted'});document.querySelector('button').onclick=()=>document.querySelector('h1').textContent='Clicked';</script>`}));
await page.goto('https://browser.example/');
const cdp=await page.context().newCDPSession(page);
const child=spawn(python,['-u','platform/browser/agent_browser.py',binary],{stdio:['pipe','pipe','pipe']});
const send=(message:any)=>{if(!child.stdin.destroyed)child.stdin.write(JSON.stringify(message)+'\n');};
const waiters=new Map<string,{resolve:(data:any)=>void;reject:(e:Error)=>void}>();
let failure='';child.stderr.on('data',d=>failure+=d.toString().slice(0,1000));
child.on('exit',()=>{for(const waiter of waiters.values())waiter.reject(Error('Driver exited: '+failure));waiters.clear();});
createInterface({input:child.stdout}).on('line',async line=>{
 const value=JSON.parse(line);
 if(value.kind==='cdp'){
  const {id,method,params}=value.message;
  try {send({kind:'cdp',message:{id,result:await cdp.send(method,params||{})}});}
  catch {send({kind:'cdp',message:{id,error:{code:-32000,message:'Fixture CDP failed'}}});}
 }else if(value.kind==='result'){
  const pending=waiters.get(value.id);waiters.delete(value.id);
  if(value.response.success)pending?.resolve(value.response.data||{});else pending?.reject(Error(value.response.error));
 }
});
for(const event of ['Page.frameNavigated','Page.navigatedWithinDocument','Page.frameDetached','Page.loadEventFired','Page.domContentEventFired','Runtime.executionContextCreated','Runtime.executionContextDestroyed','Runtime.executionContextsCleared','Network.requestWillBeSent','Network.responseReceived','Network.loadingFinished','Network.loadingFailed'])cdp.on(event as any,params=>send({kind:'cdp',message:{method:event,params}}));
let sequence=0,documentId='',refs={};
async function run(args:any){
 const revision='doc-'+(++sequence);
 let flow=browserDriverStart({args,documentId,refs,url:page.url(),revision});
 while(flow.argv){
  if(flow.consume){documentId='';refs={};}
  const id=String(++sequence);
  const response=await new Promise<any>((resolve,reject)=>{
   const timer=setTimeout(()=>{waiters.delete(id);reject(Error('Driver timed out'));},40_000);
   waiters.set(id,{resolve:data=>{clearTimeout(timer);resolve(data);},reject:e=>{clearTimeout(timer);reject(e);}});
   send({kind:'command',id,argv:flow.argv});
  });
  flow=browserDriverNext({flow,response});
 }
 if(flow.refs){refs=flow.refs;documentId=flow.documentId;}
 return flow.result;
}
// A control by its accessible name: the snapshot text names each with its [ref=…].
function control(snapshot:any,label:string){
 const line=String(snapshot.text).split('\n').find(line=>line.includes('"'+label+'"')&&line.includes('ref='));
 const ref=line?.match(/ref=(e\d+)/)?.[1];
 return ref?{ref,label}:snapshot.elements?.find((e:any)=>e.label===label);
}
try {
 const snapshot=await run({operation:'snapshot'});
 assert.equal(snapshot.driver,'agent-browser');assert.ok(!snapshot.text.includes('credential-canary'));
 assert.ok(!control(snapshot,'Secret fixture'));
 assert.ok(!snapshot.text.includes('Secret fixture'));
 const field=control(snapshot,'Search');assert.ok(field);
 const args={documentId:snapshot.documentId,ref:field.ref};
 assert.equal((await run({...args,operation:'fill',text:'Worldlet'})).ok,true);
 assert.equal(await page.locator('input').first().inputValue(),'Worldlet');
 assert.equal((await run({...args,operation:'submit'})).ok,true);
 assert.equal(await page.locator('h1').innerText(),'Submitted');
 assert.ok((await run({...args,operation:'submit'})).error);
 const fresh=await run({operation:'snapshot'}),button=control(fresh,'Search tools');
 assert.equal((await run({operation:'prepare',documentId:fresh.documentId,ref:button.ref})).receipt,false);
 assert.equal((await run({operation:'click',documentId:fresh.documentId,ref:button.ref})).ok,true);
 assert.equal(await page.locator('h1').innerText(),'Clicked');
 // Multi-page comparison -> request draft -> review -> direct submit -> receipt.
 // All pages and writes are isolated fixtures, never external accounts.
 await page.unroute('**/*');
 await page.route('**/*',route=>{
  const path=new URL(route.request().url()).pathname;
  const pages:Record<string,string>={
   '/compare':'<h1>Compare plans</h1><p>Basic: $10 monthly. Pro: $20 monthly.</p><a href="/policy">Refund policy</a>',
   '/policy':'<h1>Refund policy</h1><p>Duplicate charges are eligible within 30 days.</p><a href="/request">Request review</a>',
   '/request':'<h1>Draft request</h1><form action="/review"><label>Reason<input name="reason"></label><button>Review draft</button></form>',
   '/review':'<h1>Review request</h1><p>Duplicate charge. Nothing submitted yet.</p><form action="/receipt"><button>Submit request</button></form>',
   '/receipt':'<h1>Request received</h1><p>Confirmation TEST-123. Refund not yet approved.</p>'
  };
  return route.fulfill({contentType:'text/html',body:pages[path]||'<h1>Missing fixture</h1>'});
 });
 await page.goto('https://browser.example/compare');
 async function clickObserved(label:string,receipt:boolean){
  const snap=await run({operation:'snapshot'}),element=control(snap,label);assert.ok(element,label);
  const target={documentId:snap.documentId,ref:element.ref};
  const policy=await run({...target,operation:'prepare'});assert.equal(policy.receipt,receipt,label);
  assert.equal((await run({...target,operation:'click'})).ok,true);
 }
 assert.match((await run({operation:'snapshot'})).text,/Basic: \$10 monthly/);
 await clickObserved('Refund policy',false);
 await clickObserved('Request review',false);
 const draft=await run({operation:'snapshot'}),reason=control(draft,'Reason');assert.ok(reason);
 assert.equal((await run({operation:'fill',documentId:draft.documentId,ref:reason.ref,text:'Duplicate charge'})).ok,true);
 await clickObserved('Review draft',true);
 assert.match((await run({operation:'snapshot'})).text,/Nothing submitted yet/);
 await clickObserved('Submit request',true);
 const receipt=await run({operation:'snapshot'});
 assert.match(receipt.text,/Confirmation TEST-123/);assert.match(receipt.text,/Refund not yet approved/);
 console.log('PASS multi-page comparison, policy, form fill, receipt boundaries and receipt readback (isolated fixture).');
 console.log('PASS actual agent-browser/private provider/Chromium: snapshot, secret omission, editable combobox, Enter, stale-submit rejection, prepared click');
} finally {
 send({kind:'stop'});child.stdin.end();
 await new Promise<void>(resolve=>{if(child.exitCode!==null)return resolve();const timer=setTimeout(()=>{child.kill();resolve();},4000);child.once('exit',()=>{clearTimeout(timer);resolve();});});
 await browser.close();
}
