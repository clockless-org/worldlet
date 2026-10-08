// Authored daytime layers must retain registration across navigation and hover.
import assert from 'node:assert/strict';
import {withBrowser,fileAccess,worldUrl} from './browser-test.ts';

const DAY=1789491600000;
await withBrowser(fileAccess,async browser=>{
// Motion is Playwright's media emulation, as the sibling checks use it. The
// clock is a shim of Date alone: Playwright's fixed clock also holds
// performance.now, and the render loop schedules by it, so a page under that
// clock never redraws after the environment changes.
async function open({now=DAY,hash='',reduced=true}={}){
 const page=await browser.newPage({viewport:{width:1200,height:850},reducedMotion:reduced?'reduce':'no-preference'}),errors: string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(now=>{
  window.__now=now;const NativeDate=Date;window.Date=class extends NativeDate{constructor(...a: any[]){super(...((a.length?a:[window.__now]) as [any]));}static override now(){return window.__now;}} as DateConstructor;
  window.fixture={workspaceId:'replay',revision:0,activityRevision:0,sources:[],knowledge:[],worldChecks:[],cloudConsent:false,onboarding:{presets:['home'],completed:true},worldItems:[],connections:[],sampleEnabled:true,sampleUI:{},textScale:0};
  window.webkit={messageHandlers:{worldlet:{async postMessage(b: any){if(b.action==='snapshot')return structuredClone(window.fixture);if(b.action==='modelStatus')return {provider:'cloudflare',cloudAllowed:false};
   if(b.action==='weatherLoad')return {presentation:{recording:{lighting:'night',weather:'clear'}},place:{name:'San Francisco fixture',latitude:37.7749,longitude:-122.4194,timezone:'America/Los_Angeles'},weather:{code:0,cloud:0,wind:12,temperature:20,observedAt:Date.now(),fetchedAt:Date.now(),timezone:'America/Los_Angeles',sunrise:[],sunset:[]}};return {ok:true};}}}};
 },now);
 await page.goto(worldUrl()+(hash?'#'+hash:''));
 await settle(page);
 return {page,errors};
}
async function settle(page){
 await page.waitForFunction(()=>{const m=document.querySelector<HTMLElement>('#notionWorld')?.sceneMetrics;return m&&m.performance.frames>1&&m.camera.settled;},null,{timeout:30000});
 await page.waitForTimeout(1500);
}

 const {page,errors}=await open({hash:'building=building-home'});
 const p=await page.evaluate(()=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.modules.find(m=>m.id==='app-gmail').peekHit);
 await page.mouse.click(p.x,p.y);
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.active==='app-gmail');
 const brightness=await page.locator('.mail-shared-device').evaluate(e=>getComputedStyle(e).filter);
 assert.ok(!brightness.includes('brightness('),'operable mailbox stays bright at night');
 await page.getByRole('button',{name:'Pilot newsletter #6',exact:true}).click();
 for(const width of [1200,900]){
  await page.setViewportSize({width,height:850});await page.waitForTimeout(500);
  // Reading a mail its actions sit beside Fox, not in the top bar (owner feedback 2026-10-04); each keeps its full name.
  assert.equal(await page.locator('.applet-bar-side .world-capsule').count(),0,width+'px: the top bar holds no Applet actions');
  const labels=await page.locator('.fox-action-side .world-capsule').evaluateAll(nodes=>nodes.filter(e=>(e as HTMLElement).offsetWidth).map(e=>({text:e.querySelector('span')?.textContent,name:e.getAttribute('aria-label')||e.getAttribute('title')})));
  assert.ok(labels.length,width+'px: the mail\'s actions sit beside Fox');assert.ok(labels.every(e=>e.text&&e.name?.startsWith(e.text)),JSON.stringify(labels));
 }
 assert.deepEqual(errors,[]);
 console.log('PASS night mailbox click, email selection, bright artwork and named actions beside Fox at 1200/900px');
});
