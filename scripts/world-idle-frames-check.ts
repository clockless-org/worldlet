// Idle World redraw budget (ui/world/frame-budget.ts). A settled World drew 60 frames a second for
// good and kept the app's renderer and GPU processes busy while nobody used it. This holds the
// rule and the World's real redraw rate in a headless browser: full rate after input, capped once
// settled, lower while another window is in front and almost none with motion reduced.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {FOX_FRAME_RATE,WORLD_FRAME_RATE,environmentShifted,foxFrameRate,frameDue,worldFrameRate} from '../ui/world/frame-budget.ts';
import {pageErrors,worldUrl} from './browser-test.ts';

const R=WORLD_FRAME_RATE;
assert.equal(worldFrameRate({moving:true,windowActive:false,animated:false}),R.moving,'anything moving draws at the full rate');
assert.equal(worldFrameRate({moving:false,windowActive:true,animated:true}),R.settled);
assert.equal(worldFrameRate({moving:false,windowActive:false,animated:true}),R.inactive);
assert.equal(worldFrameRate({moving:false,windowActive:true,animated:false}),R.still);
assert.ok(R.settled<=30&&R.inactive<=15&&R.still<=5,'a settled World stays at or below half the display rate');
assert.equal(foxFrameRate({moving:true,windowActive:false}),FOX_FRAME_RATE.moving);
assert.ok(foxFrameRate({moving:false,windowActive:true})<=30&&foxFrameRate({moving:false,windowActive:false})<=20);
assert.equal(frameDue(100,0,30),true,'the first frame draws');
assert.equal(frameDue(1000+1000/30-1,1000,30),true,'a display frame a little early still draws');
assert.equal(frameDue(1000+1000/60,1000,30),false,'every other 60 Hz frame is skipped at 30');
const sky={kind:'clear',night:false,daylight:.62,progress:.71,cloud:.2,wind:8,windFrom:250};
assert.equal(environmentShifted(sky,{...sky,daylight:.623,progress:.712}),false,'the 15-second clock tick re-sending the sky does not wake the World');
assert.equal(environmentShifted(sky,{...sky,daylight:.58}),true,'a lighting preview step wakes it');
assert.equal(environmentShifted(sky,{...sky,kind:'rain'}),true,'a weather change wakes it');
assert.equal(environmentShifted({},sky),true,'the first environment wakes it');

const browser=await chromium.launch({args:['--allow-file-access-from-files']});
async function open(reduced:boolean){
 const page=await browser.newPage({viewport:{width:1200,height:850},reducedMotion:reduced?'reduce':'no-preference'}),errors=pageErrors(page);
 await page.addInitScript(()=>{
  // Count the World's WebGL2 work (Fox draws through its own WebGL1 context).
  const counts=(window as any).__worldGL={draws:0,targets:0};
  for(const [name,key] of [['drawElements','draws'],['drawArrays','draws'],['bindFramebuffer','targets']] as const){const f=(WebGL2RenderingContext.prototype as any)[name];(WebGL2RenderingContext.prototype as any)[name]=function(...a:any[]){counts[key]++;return f.apply(this,a);};}
  (window as any).fixture={workspaceId:'idle',revision:0,activityRevision:0,sources:[],knowledge:[],worldChecks:[],cloudConsent:false,onboarding:{presets:['home'],completed:true},worldItems:[],connections:[],sampleEnabled:true,sampleUI:{},textScale:0};
  (window as any).webkit={messageHandlers:{worldlet:{async postMessage(b:any){if(b.action==='snapshot')return structuredClone((window as any).fixture);if(b.action==='modelStatus')return {provider:'cloudflare',cloudAllowed:false};return {ok:true};}}}};
 });
 await page.goto(worldUrl());
 await page.waitForFunction(()=>{const m=(document.querySelector('#notionWorld') as any)?.sceneMetrics;return m&&m.performance.frames>1&&m.camera.settled;},null,{timeout:30000});
 return {page,errors};
}
/** World frames drawn and animation frames the browser delivered, per second over `ms`, while
 * `during` runs. A slow software-rendering host delivers fewer animation frames than the budget,
 * so the World's rate is judged against what the browser offered. */
function rate(page:any,ms=2000,wiggle=false):Promise<{world:number;raf:number}>{
 return page.evaluate(([ms,wiggle]:[number,boolean])=>new Promise(done=>{
  const world=(document.querySelector('#notionWorld') as any),start=world.sceneMetrics.performance.frames,began=performance.now();
  let raf=0,ended=false;const count=()=>{if(ended)return;raf++;requestAnimationFrame(count);};requestAnimationFrame(count);
  const move=()=>window.dispatchEvent(new PointerEvent('pointermove',{clientX:300+Math.random()*10,clientY:300}));
  const timer=wiggle?setInterval(move,50):0;if(wiggle)move();
  setTimeout(()=>{ended=true;clearInterval(timer);const s=(performance.now()-began)/1000;done({world:(world.sceneMetrics.performance.frames-start)/s,raf:raf/s});},ms);
 }),[ms,wiggle]);
}
/** WebGL2 draw calls and render-target switches per World frame over `ms`. A settled overview used to
 * re-blur every Applet's shadow and run two full-screen color passes each frame (189 draws and 162
 * target switches); shadows are now baked and the plate's tone and grade are one pass. */
function glWork(page:any,ms=2000):Promise<{draws:number;targets:number;frames:number}>{
 return page.evaluate((ms:number)=>new Promise(done=>{
  const gl=(window as any).__worldGL,world=(document.querySelector('#notionWorld') as any),start={...gl},frames=world.sceneMetrics.performance.frames;
  setTimeout(()=>{const n=Math.max(1,world.sceneMetrics.performance.frames-frames);done({draws:(gl.draws-start.draws)/n,targets:(gl.targets-start.targets)/n,frames:n});},ms);
 }),ms);
}
const fps=(r:{world:number;raf:number})=>`${r.world.toFixed(1)} of ${r.raf.toFixed(1)} offered`;
const settle=(page:any)=>page.waitForTimeout(R.wakeMs+1500);

try{
 const {page,errors}=await open(false);
 await page.evaluate(()=>window.dispatchEvent(new Event('worldlet:app-active')));
 await settle(page);
 const settled=await rate(page);
 assert.ok(settled.world<=R.settled+4,`a settled World draws at most about ${R.settled} frames a second (${fps(settled)})`);
 assert.ok(settled.world>=Math.min(settled.raf,R.settled)/3,`ambient motion keeps drawing (${fps(settled)})`);
 const work=await glWork(page);
 assert.ok(work.frames>=2,'the settled World drew while its work was counted');
 assert.ok(work.draws<=30,`a settled overview stays within 30 draw calls a frame (${work.draws.toFixed(1)})`);
 assert.ok(work.targets<=6,`a settled overview switches render targets at most 6 times a frame (${work.targets.toFixed(1)})`);
 // Input wakes it to the full rate at once: every frame the browser offers, up to the display's.
 const moving=await rate(page,1500,true);
 assert.ok(moving.world>=Math.min(moving.raf,R.moving)*.8-1,`pointer movement draws at the full rate (${fps(moving)})`);
 // Another window in front.
 await page.evaluate(()=>window.dispatchEvent(new Event('worldlet:app-inactive')));
 await settle(page);
 const inactive=await rate(page);
 assert.ok(inactive.world<=R.inactive+3,`an inactive World draws at most about ${R.inactive} frames a second (${fps(inactive)})`);
 assert.deepEqual(errors,[]);
 await page.close();

 const still=await open(true);
 await settle(still.page);
 const reduced=await rate(still.page,3000);
 assert.ok(reduced.world<=R.still+2,`with motion reduced a settled World draws at most about ${R.still} frames a second (${fps(reduced)})`);
 assert.deepEqual(still.errors,[]);
 console.log(`PASS idle World frame budget, frames a second: settled ${fps(settled)}, moving ${fps(moving)}, inactive ${fps(inactive)}, reduced motion ${fps(reduced)}; per settled frame ${work.draws.toFixed(1)} draw calls, ${work.targets.toFixed(1)} render-target switches.`);
}finally{await browser.close();}
