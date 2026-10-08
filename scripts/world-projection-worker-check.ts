import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
const worker=await build({entryPoints:['ui/world/world-projection-worker.ts'],bundle:true,format:'iife',minify:true,write:false});
const client=await build({entryPoints:['ui/world/world-projection-client.ts'],bundle:true,format:'iife',globalName:'projectionClient',define:{__WORLDLET_PROJECTION_WORKER__:JSON.stringify(worker.outputFiles[0].text)},write:false});
const sync=await build({entryPoints:['ui/world/world-projection.ts'],bundle:true,format:'iife',globalName:'projectionSync',write:false});
const browser=await chromium.launch();
try{
 const page=await browser.newPage();await page.setContent('<p>Projection fixture</p>');await page.addScriptTag({content:client.outputFiles[0].text});await page.addScriptTag({content:sync.outputFiles[0].text});
 const result=await page.evaluate(async()=>{
  const api=(window as any).projectionClient.createWorldProjector();
  const state={workspaceId:'worker-fixture',revision:1,onboarding:{completed:true},connections:[],worldItems:[],sources:Array.from({length:4000},(_,i)=>({id:'s'+i,title:'Source '+i,enabled:i%5!==0,revision:'r1',origin:'gmail'})),knowledge:Array.from({length:4000},(_,i)=>({sourceId:'s'+i,sourceRevision:i%7===0?'old':'r1',summary:'Fixture summary '+i,facts:[{text:'Grounded fixture fact.'}],theme:'home'}))};
  const start=performance.now(),expected=(window as any).projectionSync.projectNativeWorld(state),syncMs=performance.now()-start;
  let ticks=0;const timer=setInterval(()=>ticks++,0),workerStart=performance.now();const actual=await api.project(state);const workerMs=performance.now()-workerStart;clearInterval(timer);
  if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('Worker projection differs');
  const frozen=JSON.stringify(actual);actual.pages[0].title='UI-owned change';const again=await api.project(state);if(JSON.stringify(again)!==frozen)throw Error('Worker state leaked');
  let rejected=false;try{await api.project({...state,knowledge:null});}catch{rejected=true;}if(!rejected)throw Error('Invalid projection was accepted');
  await api.project({...state,sources:[],knowledge:[]});
  const cancelled=api.project(state);api.dispose();try{await cancelled;throw Error('Cancellation accepted');}catch(error){if(!error.message.includes('cancelled'))throw error;}
  return {sources:state.sources.length,pages:expected.pages.length,syncMs,workerMs,uiTicksDuringWorker:ticks};
 });
 assert.ok(result.uiTicksDuringWorker>0);console.log('PASS exact worker parity, UI event-loop progress, independent results, failure recovery and cancellation',result);
}finally{await browser.close();}
