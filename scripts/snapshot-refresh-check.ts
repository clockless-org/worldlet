import assert from 'node:assert/strict';
import {withBrowser,fileAccess,pageErrors,worldUrl} from './browser-test.ts';
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=pageErrors(page);
 await page.addInitScript(()=>{
  const state={workspaceId:'snapshot-refresh',revision:1,activityRevision:1,sources:[],knowledge:[],worldItems:[],worldChecks:[],connections:[],onboarding:{completed:true},sampleEnabled:false,sampleUI:{},appUpdate:{visible:false},overlay:{version:1,created:{},edits:{},trash:{},receipts:{},undo:null}};
  (window as any).snapshotFixture=state;
  window.webkit={messageHandlers:{worldlet:{async postMessage(b){
   if(b.action==='snapshot')return structuredClone(state);
   if(b.action==='modelStatus')return {available:true};
   if(b.action==='foxPreferences')return {model:{name:'Fixture',ready:true}};
   if(b.action==='weatherLoad')return null;
   return {ok:true};
  }}}};
 });
 await page.goto(worldUrl());
 await page.waitForFunction(()=>!document.querySelector('#worldStartup')&&!!document.querySelector<HTMLElement>('#notionWorld')?.sceneMetrics?.renderer);
 const result=await page.evaluate(async()=>{
  let applied=0;window.addEventListener('worldlet:weather-opt-in',()=>applied++);
  const canvas=document.querySelector('canvas');
  const updates=Array.from({length:100},(_,i)=>window.worldletReceive({...structuredClone((window as any).snapshotFixture),activityRevision:i+2,appName:'Fixture '+i}));
  const deferred=applied===0;await Promise.all(updates);
  return {applied,deferred,title:document.title,sameScene:canvas===document.querySelector('canvas')};
 });
 assert.deepEqual(result,{applied:1,deferred:true,title:'Fixture 99',sameScene:true});
 if(process.env.WORLDLET_REFRESH_LOAD){
  const timings=await page.evaluate(async count=>{
   const state={...structuredClone((window as any).snapshotFixture),activityRevision:102,appName:'Large fixture',sources:Array.from({length:count},(_,i)=>({id:'load-'+i,title:'Fixture '+i,enabled:true,revision:'r1',origin:'gmail'})),knowledge:Array.from({length:count},(_,i)=>({sourceId:'load-'+i,sourceRevision:'r1',summary:'Fixture summary '.repeat(20),facts:[{text:'Fixture evidence'}],theme:'home'}))};
   const frames:number[]=[];let previous=0,frame=0;
   const tick=(time:number)=>{if(previous)frames.push(time-previous);previous=time;frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);
   await new Promise(resolve=>requestAnimationFrame(resolve));const start=performance.now();await window.worldletReceive(state);const refreshMs=performance.now()-start;
   await new Promise(resolve=>setTimeout(resolve,250));cancelAnimationFrame(frame);frames.sort((a,b)=>a-b);
   return {sources:count,refreshMs,frames:frames.length,max:frames.at(-1),p95:frames[Math.floor(frames.length*.95)],title:document.title};
  },Number(process.env.WORLDLET_REFRESH_LOAD));
  assert.equal(timings.title,'Large fixture');console.log('Full World background refresh fixture',timings);
 }
 assert.deepEqual(errors,[]);console.log('PASS actual World: 100 host snapshots -> one deferred refresh, newest state and existing scene retained');
});
