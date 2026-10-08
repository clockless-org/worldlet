import {launchTestBrowser} from './browser-test.ts';
import {installActivityCollector} from '../platform/bridge/activity-collector.js';
import assert from 'node:assert/strict';
import {activityObserve,activityEvent} from '../core/activity/index.ts';
import type {ActivityPage} from '../contracts/activity.ts';
type Observation={text:string;clicks:unknown[];edits:Array<{characters:number}>;omitted?:string};
const browser=await launchTestBrowser();
try {
 console.log('Test browser version: '+browser.version()+' (not WebView2/CEF acceptance)');
 const page=await browser.newPage();
 await page.route('https://activity.test/**',route=>route.fulfill({contentType:'text/html',body:'<h1>Visible story</h1><form>PRIVATE FORM <input value="secret"></form><button id="next">Next</button><div style="margin-top:1500px">Offscreen</div>'}));
 await page.goto('https://activity.test/');
 const source='('+installActivityCollector.toString()+')().read()';
 await page.evaluate<Observation>(source);await page.click('#next');
 const value=await page.evaluate<Observation>(source);
 assert(value.text.includes('Visible story')&&!value.text.includes('PRIVATE')&&!value.text.includes('Offscreen'));
 assert.equal(value.clicks.length,1);
 // An isolated-world reporting binding flushes the clicked document before navigation.
 await page.evaluate('window.__observed=[];window.worldletActivity=json=>window.__observed.push(JSON.parse(json))');
 await page.click('#next');assert.equal(await page.evaluate('window.__observed.length'),1);
 assert.equal((await page.evaluate<Observation>(source)).clicks.length,0);
 await page.fill('input','private draft');
 const edited=await page.evaluate<Observation>(source);assert.equal(edited.edits.at(-1)?.characters,13);assert(!JSON.stringify(edited).includes('private draft'));
 await page.evaluate(()=>document.body.innerHTML='<input type="password"><p>Never store</p>');
 const hidden=await page.evaluate<Observation>(source);assert.equal(hidden.text,'');assert.equal(hidden.omitted,'sensitive-page');
 // Content changes must arrive through the generic recorder, without another host poll.
 await page.evaluate(()=>document.body.innerHTML='<h1 id="live">Before</h1><div id="space">Plain surface</div>');
 await page.evaluate('window.__observed=[]');
 await page.locator('#live').evaluate(el=>el.textContent='Dynamically loaded article');
 await page.waitForFunction('window.__observed.some(p=>p.text.includes("Dynamically loaded article"))');
 await page.click('#space');
 assert(await page.evaluate('window.__observed.some(p=>p.interactions.some(e=>e.type==="click"&&e.target==="space"))'));
 // After the first reading, a long page is read in idle-time slices, never in one task that
 // holds up the page's animation frames (owner report 2026-10-06: Xiaohongshu stuttered).
 const sliced=await page.evaluate(async()=>{
  const w=window as any;const api=w.__worldletActivityV2;
  let slices=0;const idle=w.requestIdleCallback;w.requestIdleCallback=(f:any,o:any)=>idle((d:any)=>{slices++;f(d);},o);
  document.body.insertAdjacentHTML('beforeend','<div>'+Array.from({length:6000},(_,i)=>'<p><span>Feed note '+i+'</span> <b>by author '+i+'</b></p>').join('')+'</div>');
  w.__observed=[];document.getElementById('live')!.textContent='Sliced reading';
  await new Promise(r=>setTimeout(r,1100));
  const started=performance.now();api.flush();const flushMs=performance.now()-started;
  const stale=!w.__observed.some((p:any)=>p.text.includes('Sliced reading'));
  while(!w.__observed.some((p:any)=>p.text.includes('Sliced reading')))await new Promise(r=>setTimeout(r,20));
  w.requestIdleCallback=idle;return {flushMs,stale,slices};
 });
 assert(sliced.stale&&sliced.slices>1,'a later reading runs in idle slices: '+JSON.stringify(sliced));
 // The exact same collector can observe trusted World HUDs through a different transport.
 await page.evaluate('window.__worldletActivityV2.stop();window.__observed=[]');
 await page.evaluate('('+installActivityCollector.toString()+')({root:document.body,url:"https://worldlet.local/world",sink:p=>window.__observed.push(p)})');
 await page.locator('#live').evaluate(el=>el.textContent='World HUD detail');
 await page.waitForFunction('window.__observed.some(p=>p.url==="https://worldlet.local/world"&&p.text.includes("World HUD detail"))');
 // Same-text pushState must still emit navigation on the next collector flush.
 await page.evaluate('window.__worldletActivityV2.stop();window.__observed=[]');
 await page.evaluate('('+installActivityCollector.toString()+')({sink:p=>window.__observed.push(p)}).flush()');
 await page.evaluate('window.__observed=[];history.pushState({},"","/unchanged?page=2");window.__worldletActivityV2.flush()');
 assert(await page.evaluate('window.__observed.some(p=>p.url.endsWith("/unchanged?page=2"))'));
 // Frame presence is recorded as a gap without accessing either document.
 await page.route('https://other.activity.test/**',route=>route.fulfill({contentType:'text/html',body:'CROSS ORIGIN PRIVATE'}));
 await page.evaluate(()=>{
  document.body.insertAdjacentHTML('beforeend','<iframe srcdoc="SAME ORIGIN PRIVATE"></iframe><iframe src="https://other.activity.test/frame"></iframe>');
 });
 await page.waitForFunction('window.__observed.some(p=>p.coverage?.frameElements===2)');
 assert(await page.evaluate('window.__observed.every(p=>!p.text.includes("ORIGIN PRIVATE")&&p.coverage.workers==="not-observed")'));
 // A private transition drops an earlier queued edit; neither buffers nor title leak through read().
 await page.evaluate('window.__worldletActivityV2.stop();delete window.worldletActivity');
 await page.evaluate(()=>document.body.innerHTML='<input id="draft"><h1>Public</h1>');
 await page.evaluate('('+installActivityCollector.toString()+')()');
 await page.fill('#draft','queued-private-draft');
 await page.evaluate(()=>{document.title='PRIVATE TITLE';document.body.innerHTML='<input type="password">';});
 const privateValue=await page.evaluate<Observation>(source);
 assert.equal(privateValue.edits.length,0);assert.equal(privateValue.clicks.length,0);
 assert(!JSON.stringify(privateValue).includes('PRIVATE TITLE'));
 // Disabling the supplied capture gate discards queued facts and clears the deduplication cache.
 await page.evaluate('window.__worldletActivityV2.stop();window.__enabled=true;window.__observed=[]');
 await page.evaluate(()=>document.body.innerHTML='<input id="draft"><h1>Resumed</h1>');
 await page.evaluate('('+installActivityCollector.toString()+')({enabled:()=>window.__enabled})');
 await page.fill('#draft','paused-private-draft');
 await page.evaluate('window.__enabled=false;window.__worldletActivityV2.flush();window.__enabled=true');
 const resumed=await page.evaluate<Observation>(source);assert.equal(resumed.edits.length,0);
 assert(!JSON.stringify(resumed).includes('paused-private-draft'));
 // Standalone Chrome supplies actual window facts; Core consumes the same boundary
 // inputs as the native adapters. This does not exercise WebView2/CEF wiring.
 await page.context().route('https://activity.test/popup',route=>route.fulfill({contentType:'text/html',body:'<title>PRIVATE POPUP TITLE</title><h1>PRIVATE POPUP BODY</h1>'}));
 const beforePopup=await page.evaluate<ActivityPage>(source);
 const visit=activityObserve({id:'before-popup',surfaceId:'fixture',at:100,tick:1000,active:true,page:beforePopup});
 const popupWait=page.waitForEvent('popup');
 await page.evaluate(()=>window.open('https://activity.test/popup'));
 const popup=await popupWait;await popup.waitForLoadState();
 const boundary=activityObserve({id:'popup-boundary',surfaceId:'fixture',at:101,tick:2000,active:false,close:true,endReason:'popup',state:visit.state});
 const popupFacts=[true,false].map(active=>activityEvent({id:'popup-'+active,surfaceId:'fixture',at:102,kind:'capture.popup',data:{active}}));
 await popup.close();
 const afterPopup=activityObserve({id:'after-popup',surfaceId:'fixture',at:110,tick:11000,active:true,state:boundary.state,page:await page.evaluate<ActivityPage>(source)});
 assert.equal(boundary.events.at(-1)?.data.reason,'popup');
 assert.equal(afterPopup.state?.visitId,'after-popup');
 assert(!afterPopup.events.some(e=>e.kind==='activity.page.dwell'));
 assert(!JSON.stringify([...boundary.events,...popupFacts,...afterPopup.events]).includes('PRIVATE POPUP'));
 assert(popupFacts.every(e=>e.kind==='activity.capture.gap'&&e.data.content==='not-observed'));
 console.log('PASS standalone Chromium popup lifecycle facts through Core; popup payload absent and resumed visit independent (native wiring untested)');
 console.log('PASS same-text SPA navigation, frame coverage boundaries, privacy transition and capture-gate buffer discard');
 console.log('PASS Chromium viewport content, click queue/flush, form exclusion and sensitive-page omission');
}finally{await browser.close();}
