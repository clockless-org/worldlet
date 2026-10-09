// Synthetic bridge only. A grouped card keeps its place in the Attention focus set when a newly
// arriving exact duplicate becomes its lead (Core picks leads by ID): the card is not new (#929).
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {pageErrors,worldUrl,waitForWorld} from './browser-test.ts';
const browser=await chromium.launch({args:['--allow-file-access-from-files']});
try{
 const page=await browser.newPage({viewport:{width:1372,height:720},reducedMotion:'reduce'});
 const errors=pageErrors(page);
 await page.addInitScript(()=>{
  const w=window as any,update=(id:string)=>({id,provider:'gmail',kind:'update',status:'open',priority:'normal',title:'Quiet update '+id,reason:'A routine notice',summary:'A fictional update.',attentionContentVersion:1,sources:[{provider:'gmail',id:'source-'+id,quote:'Synthetic notice '+id}]});
  w.duplicate={...update('b-upd'),id:'a-dup'};
  w.fixture={workspaceId:'group-identity',revision:1,activityRevision:0,sources:[],knowledge:[],connections:[],worldItems:['b-upd','c-upd','d-upd'].map(update),onboarding:{completed:true,journeyStage:'finish',unlockedApplets:['app-gmail']},sampleEnabled:false};
  w.webkit={messageHandlers:{worldlet:{async postMessage(b){
   if(b.action==='snapshot')return structuredClone(w.fixture);
   if(b.action==='modelStatus')return {available:true,cloudAllowed:true};
   if(b.action==='appContent')return {pages:[]};
   return {ok:true};
  }}}};
 });
 await page.goto(worldUrl());
 await waitForWorld(page);
 // Work hours: Mail's quiet updates are not relevant now, so only the initial floor seats them.
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:attention-focus',{detail:{mode:'work'}})));
 const rows=()=>page.locator('.world-task-list .world-task-group:not([data-group=later]) .world-matter[data-world-item-id]').evaluateAll(n=>n.map(e=>e.getAttribute('data-world-item-id')));
 await page.waitForFunction(()=>document.querySelectorAll('.world-task-list .world-matter[data-world-item-id]').length===3);
 assert.deepEqual(await rows(),['b-upd','c-upd','d-upd']);
 // An exact duplicate of b-upd arrives; its ID sorts first, so it leads the grouped card.
 await page.evaluate(()=>{const w=window as any;w.fixture.worldItems.push(w.duplicate);w.fixture.revision++;w.worldletReceive(structuredClone(w.fixture));});
 await page.waitForFunction(()=>!document.querySelector('.world-matter[data-world-item-id="b-upd"]'));
 assert.deepEqual(await rows(),['a-dup','c-upd','d-upd'],'the grouped card keeps its seat and place when its lead changes');
 assert.deepEqual(errors,[]);
 console.log('PASS Attention group identity: a new duplicate that leads a grouped card does not make the card look new');
}finally{await browser.close();}
