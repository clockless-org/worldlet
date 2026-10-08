import assert from 'node:assert/strict';
import {withBrowser,fileAccess,pageErrors,worldUrl} from './browser-test.ts';
import {activityPose,ambientPose} from '../ui/companion/companion-life.ts';
import {companionPose} from '../ui/companion/companion-frames.ts';
assert.equal(companionPose('idle',180000),'idle');
assert.equal(ambientPose(7400),null);
assert.equal(ambientPose(8000),'looking');
assert.equal(ambientPose(19000),'looking');
assert.equal(ambientPose(9500),null);
for(let t=0;t<66000;t+=100)assert.notEqual(ambientPose(t),'turning','No unsolicited idle spinning');
assert.equal(activityPose('working','Reading your email',{activity:'reading',source:'tool'}),'reading');
assert.equal(activityPose('working','Writing a draft',{activity:'drafting',source:'tool'}),'drafting');
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1380,height:900},reducedMotion:'reduce'}),errors=pageErrors(page);
 await page.addInitScript(()=>{const w=window as any;w.webkit={messageHandlers:{worldlet:{async postMessage(b){
  if(b.action==='snapshot')return {workspaceId:'life-fixture',revision:0,sources:[],knowledge:[],connections:[],onboarding:{completed:true},sampleEnabled:false,cloudConsent:true};
  if(b.action==='modelStatus')return {available:true,cloudAllowed:true};
  if(b.action==='companionProfile')return {name:'Fox'};
  if(b.action==='agentChat'){w.lifeAgentId=b.body?.id||b.id;await new Promise(r=>w.finishLife=r);return {message:'The requested work is complete.'};}
  return {ok:true};
 }}}};});
 await page.goto(worldUrl());
 await page.locator('#worldStartup').waitFor({state:'detached'});
 const fox=page.locator('.companion-avatar'),before=await fox.boundingBox();
 // One task: under software rendering a frame can outlast the 280 ms hold-to-talk timer before a real move lands.
 await fox.evaluate((el,[x,y])=>{const at=(type:string,dx:number,dy:number)=>el.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:1,pointerType:'mouse',isPrimary:true,button:0,buttons:type==='pointerup'?0:1,clientX:x+dx,clientY:y+dy}));
  at('pointerdown',0,0);for(let i=1;i<=4;i++)at('pointermove',-40*i,-20*i);at('pointerup',-160,-80);},[before.x+before.width/2,before.y+before.height/2]);
 const after=await fox.boundingBox();assert(after.x<before.x-100,'World Fox can be dragged');
 assert(await page.evaluate(()=>!!localStorage.getItem('worldlet.companion.position')));
 assert.equal(await page.evaluate(()=>(document.querySelector('.notion-world') as HTMLElement).dataset.entryExpanded),'false','Dragging does not open typing');assert.equal(await page.locator('#companionInfo').isVisible(),false,'Dragging does not open the panel');
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:job',{detail:{busy:true,status:'Mail is checking for updates'}})));
 assert.equal(await page.locator('.companion-life-bubble').count(),0,'No separate progress/tip/completion bubbles');
 assert.equal(await fox.getAttribute('data-activity'),'idle','Applet work does not claim Fox is busy');
 assert.doesNotMatch(await page.locator('.companion-text-entry').innerText(),/checking for updates/);
 await page.locator('#notionInput').click();await page.locator('#notionInput').fill('Help with this task');await page.locator('#notionInput').press('Enter');
 await page.waitForFunction(()=>typeof (window as any).finishLife==='function');
 await page.locator('.companion-asked',{hasText:'Help with this task'}).waitFor();
 assert.equal(await page.locator('.companion-head-status').isVisible(),false,'Progress is on the working card, not a thinking window above the head');
 // An authored Fox (Rive in every channel) performs each activity; the painted fallback groups them.
 const authored=await page.evaluate(()=>{const a=(window as any).__WORLDLET_ENV_ASSETS__;return Boolean(a?.companionRive||a?.companionAnatomy);});
 const toolStates=[['read_content_page','reading','reading'],['find_content','searching','searching'],['external_compare','comparing','working'],['external_calculate','calculating','working']] as const;
 for(const [name,activity,presentation] of toolStates){
  await page.evaluate(({name,activity})=>{const w=window as any;w.worldletAgentEvent(w.lifeAgentId,{type:'progress',name,activity});},{name,activity});
  assert.equal(await fox.getAttribute('data-semantic-state'),activity);
  assert.equal(await fox.getAttribute('data-activity'),authored?activity:presentation);
 }
 await page.evaluate(()=>{const w=window as any;w.worldletAgentEvent(w.lifeAgentId,{type:'status',stage:'waiting'});});
 assert.equal(await fox.getAttribute('data-semantic-state'),'awaiting_service');
 assert.equal(await fox.getAttribute('data-activity'),authored?'awaiting_service':'listening');
 assert.equal(await page.locator('.companion-thought').isVisible(),false,'Waiting is not active thinking');
 await page.evaluate(()=>{const w=window as any;w.worldletAgentEvent(w.lifeAgentId,{type:'progress',name:'read_content_page'});});
 assert.equal(await fox.getAttribute('data-activity'),'reading');
 assert.equal(await page.locator('.companion-dialogue').count(),1);
 assert.doesNotMatch(await page.locator('.companion-text-entry').innerText(),/Getting ready|Thinking|progress/);
 await page.screenshot({path:'/tmp/fox-foreground-activity.png'});
 await page.evaluate(()=>(window as any).finishLife());await page.getByText('The requested work is complete.',{exact:false}).first().waitFor();
 assert.equal(await page.locator('.companion-thought').isVisible(),false);
 assert.equal(await page.locator('.companion-life-bubble').count(),0,'No completion notice');
 await page.locator('#notionInput').evaluate(e=>(e as HTMLInputElement).blur());
 for(const viewport of [{width:375,height:812},{width:812,height:375}]){
  await page.setViewportSize(viewport);await page.waitForTimeout(350);
  const bounds=await fox.boundingBox();assert(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=viewport.width,'Dragged Fox remains on screen');
 }
 await page.setViewportSize({width:1380,height:900});await page.waitForTimeout(350);
 await page.reload();await page.locator('#worldStartup').waitFor({state:'detached'});
 assert.equal(await page.locator('#notionHUD').getAttribute('data-positioned'),'true','Saved anchor is restored');
 assert.deepEqual(errors,[]);console.log('PASS Companion life: typed tool/stage routing, explicit visual fallback, waiting dots, no three-minute sleep, world drag, saved anchor, one dialogue and no progress/completion bubbles');
});
