// Owner decision: the Attention Center's Later list holds what is not for now, the held-back
// backlog and what the person put off with a card's Later. The Center is two pages (owner decision
// 2026-10-03): Now, the screen-sized focus set, and one screen below it Later. Scrolling the Center
// up or its foot button (Later, with a count) turns to Later; scrolling down from Later's top, its
// Now button or a click on empty space comes back, and none of them changes what is in focus. Later
// rows keep their category colours but read quieter (owner decision 2026-10-02). A snoozed item
// returns when its time comes.
import assert from 'node:assert/strict';
import {launchTestBrowser} from './browser-test.ts';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const browser=await launchTestBrowser({args:['--allow-file-access-from-files']});
try{
 const page=await browser.newPage({viewport:{width:1372,height:720},reducedMotion:'reduce'});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{const w=window as any;
  const items=Array.from({length:14},(_,i)=>({id:'task-'+i,provider:'gmail',kind:'task',status:'open',priority:i<3?'high':'normal',title:'Follow up item '+(i+1),reason:'Needs a reply this week',observedAt:new Date(Date.now()-(i+1)*3600000).toISOString(),summary:'A fictional follow-up.',attentionContentVersion:1,sources:[{provider:'gmail',id:'t'+i,quote:'q'}]}));
  w.fixture={workspaceId:'later',revision:1,activityRevision:0,sources:[],knowledge:[],connections:[],worldItems:items,onboarding:{completed:true,journeyStage:'finish',unlockedApplets:['app-gmail']},sampleEnabled:false};
  w.webkit={messageHandlers:{worldlet:{async postMessage(b){
   if(b.action==='snapshot')return structuredClone(w.fixture);
   if(b.action==='modelStatus')return {available:true,cloudAllowed:true};
   if(b.action==='appContent')return {pages:[]};
   if(b.action==='worldItemStatus'){const item=w.fixture.worldItems.find(i=>i.id===b.id);item.status=b.status;item.snoozedUntil=b.snoozedUntil;return {ok:true};}
   return {ok:true};
  }}}};});
 await page.goto(pathToFileURL(path.resolve('dist/WorldletWeb/index.html')).href);
 await page.waitForFunction(()=>document.querySelector<any>('#notionWorld')?.sceneMetrics?.renderer==='pixi-webgl');
 const ids=(group:string)=>page.locator(`.world-task-list .world-task-group${group==='later'?'[data-group=later]':':not([data-group=later])'} .world-matter[data-world-item-id]`).evaluateAll(n=>n.map(e=>e.getAttribute('data-world-item-id')));
 const preview=page.locator('#attentionPreview');
 await page.getByRole('button',{name:'Go to Later',exact:true}).waitFor({timeout:20000});
 const focus=await ids('now');
 assert.ok(focus.length>0&&focus.length<14,'the screen holds a focus set and the backlog waits');
 assert.equal(await page.locator('.world-task-group[data-group=later]').count(),0,'Later is closed until asked for');
 // Every row says when, first in the key-facts line under its title (#1281).
 assert.ok(await page.locator('.world-task-group:not([data-group=later]) .world-matter').evaluateAll(rows=>rows.every(r=>{const t=r.querySelector('.world-task-objective .world-task-time');return !!t&&/\S/.test(t.textContent)&&r.querySelector('.world-task-objective').firstElementChild===t;})),'every row leads its key facts with a time');
 // The Later button is centered across the Center and quieter than the rows (#1281).
 const toggle=await page.evaluate(()=>{const b=document.querySelector<HTMLElement>('.world-task-more-button').getBoundingClientRect(),l=document.querySelector<HTMLElement>('.world-task-list').getBoundingClientRect(),row=document.querySelector<HTMLElement>('.world-matter .world-task-title');return {offset:Math.abs((b.left+b.width/2)-(l.left+l.width/2)),opacity:+getComputedStyle(document.querySelector('.world-task-more-button')).opacity,rowOpacity:+getComputedStyle(row).opacity};});
 assert.ok(toggle.offset<2,'Later button is centered: '+JSON.stringify(toggle));
 assert.ok(toggle.opacity<toggle.rowOpacity,'Later button is lighter than the rows: '+JSON.stringify(toggle));
 await page.getByRole('button',{name:'Go to Later',exact:true}).click();
 await page.getByRole('button',{name:'Back to Now',exact:true}).waitFor();
 const backlog=await ids('later');
 assert.deepEqual(await ids('now'),[],'Later is its own page: Now turned away');
 assert.equal(backlog.length,14-focus.length,'Later lists the held-back backlog: '+JSON.stringify({focus,backlog}));
 assert.deepEqual(await page.locator('.world-attention-zone').evaluateAll(z=>z.map(e=>[e.getAttribute('data-zone'),e.querySelector('.world-attention-zone-title').textContent])),[['later','Later']],'the page is titled Later');
 assert.equal(await page.locator('.world-attention-later').evaluate(el=>getComputedStyle(el).overflowY),'auto','Later scrolls');
 assert.ok(await page.locator('.world-matter-later').first().evaluate(el=>+getComputedStyle(el).opacity<1),'Later reads quieter than Now');
 const hidePlace=()=>page.getByRole('button',{name:'Back to Now',exact:true}).evaluate(el=>{const r=el.getBoundingClientRect(),t=document.querySelector('.world-task-tracker').getBoundingClientRect();return Math.round(t.bottom-r.bottom);});
 const hideAt=await hidePlace();
 assert.ok(hideAt>=0&&hideAt<40,'Now sits at the foot of the Center: '+hideAt);
 // A Later row keeps its own category colour and is marked as put off.
 const marked=await page.locator('.world-task-group[data-group=later] .world-matter').evaluateAll(rows=>rows.map(r=>({later:r.classList.contains('world-matter-later'),state:r.getAttribute('data-matter-state'),rule:getComputedStyle(r).borderLeftStyle})));
 assert.ok(marked.every(r=>r.later&&r.rule==='dashed'&&r.state),'Later rows are marked: '+JSON.stringify(marked));
 // A click on empty space beside the rows closes Later at once.
 const box=await page.locator('.world-task-tracker').boundingBox();
 await page.mouse.click(Math.max(5,box.x-60),box.y+box.height/2);
 await page.getByRole('button',{name:'Go to Later',exact:true}).waitFor();
 assert.deepEqual(await ids('now'),focus,'a click beside Later returns to the same focus');
 await page.getByRole('button',{name:'Go to Later',exact:true}).click();
 await page.getByRole('button',{name:'Back to Now',exact:true}).click();
 await page.getByRole('button',{name:'Go to Later',exact:true}).waitFor();
 // Scrolling the Center up turns to Later; scrolling down from Later's top turns back.
 const row=await page.locator('.world-matter').first().boundingBox();
 await page.waitForTimeout(800);
 await page.mouse.move(row.x+row.width/2,row.y+row.height/2);
 await page.mouse.wheel(0,240);
 await page.getByRole('button',{name:'Back to Now',exact:true}).waitFor();
 assert.deepEqual(await ids('later'),backlog,'a scroll up shows Later');
 await page.waitForTimeout(800);
 const laterRow=await page.locator('.world-matter-later').first().boundingBox();
 await page.mouse.move(laterRow.x+laterRow.width/2,laterRow.y+laterRow.height/2);
 await page.mouse.wheel(0,-240);
 await page.getByRole('button',{name:'Go to Later',exact:true}).waitFor();
 assert.deepEqual(await ids('now'),focus,'a scroll down from Later returns to the same Now');
 // A card's Later puts the item off: it leaves the focus list and waits in Later.
 const putOff=focus[0];
 assert.equal(await page.locator('.world-task-group[data-group=later]').count(),0);
 await page.locator(`.world-task-group:not([data-group=later]) .world-matter[data-world-item-id="${putOff}"]`).click();
 await preview.waitFor({state:'visible'});
 await preview.getByRole('button',{name:'Later',exact:true}).click();
 await page.waitForFunction(id=>!document.querySelector(`.world-matter[data-world-item-id="${id}"]`),putOff);
 assert.ok(!(await ids('now')).includes(putOff),'the item left the focus list');
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Go to Later',exact:true}).click();
 await page.waitForFunction(id=>!!document.querySelector(`.world-task-group[data-group=later] .world-matter[data-world-item-id="${id}"]`),putOff);
 assert.match(await page.locator(`.world-task-group[data-group=later] .world-matter[data-world-item-id="${putOff}"] .world-task-time`).innerText(),/^Back /,'a put-off row says when it comes back');
 assert.equal(await hidePlace(),hideAt,'Now keeps its place');
 assert.ok(await page.evaluate(id=>Date.parse((window as any).fixture.worldItems.find(i=>i.id===id).snoozedUntil)>Date.now(),putOff),'Later saved a future time');
 await page.getByRole('button',{name:'Back to Now',exact:true}).click();
 await page.getByRole('button',{name:'Go to Later',exact:true}).waitFor();
 assert.equal(await page.locator('.world-task-group[data-group=later]').count(),0,'Now closes Later');
 assert.ok(await page.locator('.world-task-list').evaluate(el=>el.scrollHeight<=el.clientHeight+1&&!el.classList.contains('is-expanded')),'Now trims back to what the screen shows');
 assert.ok(!(await ids('now')).includes(putOff),'a put-off item stays in Later while snoozed');
 // When its time comes, the item returns to the focus list.
 await page.evaluate(id=>{const w=window as any;w.fixture.worldItems.find(i=>i.id===id).snoozedUntil=new Date(Date.now()-1000).toISOString();w.fixture.revision++;w.worldletReceive(structuredClone(w.fixture));},putOff);
 await page.waitForFunction(id=>!!document.querySelector(`.world-task-group:not([data-group=later]) .world-matter[data-world-item-id="${id}"]`),putOff);
 assert.deepEqual(errors,[]);
 console.log(`PASS Attention Later: ${focus.length} in focus, the Later button or a scroll up turns to the ${backlog.length} in Later, Now, a scroll down or a click beside it returns to focus, a card's Later moves its item there, Now trims back, and the item returns when its time comes`);
}finally{await browser.close();}
