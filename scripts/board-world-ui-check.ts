import assert from 'node:assert/strict';
import {withBrowser,fileAccess,pageErrors,worldUrl,waitForWorld} from './browser-test.ts';
// The Board Applet in the World (ui/applets/board/applet.md): with a board, its device carries the north-star number
// (the first tab's first number block); the device opens straight into the panel (Peek → Focus), where Fox offers its
// two actions; with no board the device is empty and the empty state opens Settings › Agents. Faked bridge,
// fictional board. The panel itself: board-ui-check.ts.
const tmp=process.env.TMPDIR||'/tmp';
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1440,height:960},reducedMotion:'reduce'});page.setDefaultTimeout(20000);
 const errors=pageErrors(page);
 await page.addInitScript(()=>{
  const w=window as any;w.calls=[];w.board='full';
  const definition={title:'Product',tabs:[{id:'growth',title:'Growth',blocks:[{id:'list',title:'Open pull requests',kind:'list',preset:'open-prs'},{id:'north-star',title:'Installs this week',kind:'number',preset:'funnel',goodAtLeast:100}]},{id:'health',title:'Health',blocks:[]}]};
  const view=(tabs:string[])=>({title:'Product',resolvedAt:'2026-10-15T17:05:00.000Z',tabs:[{id:'growth',title:'Growth',blocks:[
   {id:'list',title:'Open pull requests',kind:'list',preset:'open-prs',provider:'github',status:'ok',list:{items:[],more:false}},
   {id:'north-star',title:'Installs this week',kind:'number',preset:'funnel',provider:'posthog',status:'ok',number:{value:12345,tone:'good'}}]},{id:'health',title:'Health',blocks:[]}].filter(t=>tabs.includes(t.id))});
  w.fixture={workspaceId:'board-world',revision:0,sources:[],knowledge:[],worldItems:[],connections:[],sampleEnabled:false,cloudConsent:true,onboarding:{completed:true,unlockedApplets:['app-gmail','app-board']}};
  w.webkit={messageHandlers:{worldlet:{async postMessage(b:any){w.calls.push(b);
   if(b.action==='snapshot')return structuredClone(w.fixture);
   if(b.action==='modelStatus')return {available:true,cloudAllowed:true};
   if(b.action==='appContent')return {pages:[]};
   if(b.action==='weatherLoad')return null;
   if(b.action==='board'){if(w.board==='none')return {revision:0,definition:null,presets:[],view:null};return {revision:1,definition,presets:[],view:view(b.tab?[b.tab]:['growth','health'])};}
   return {ok:true};
  }}}};
 });
 await page.goto(process.env.WORLDLET_TEST_URL||worldUrl());await waitForWorld(page);
 const figure=()=>page.evaluate(()=>(document.querySelector('#notionWorld') as any)?.sceneMetrics?.modules?.find((m:any)=>m.id==='app-board')?.figure??null);
 await page.waitForFunction(()=>(document.querySelector('#notionWorld') as any)?.sceneMetrics?.modules?.find((m:any)=>m.id==='app-board')?.figure==='12.3K');
 assert.deepEqual(await page.evaluate(()=>(window as any).calls.filter((c:any)=>c.action==='board')),[{action:'board',operation:'read'}],'the World reads the board once for its number');
 await page.screenshot({path:tmp+'/board-world.png'});
 // Peek → Focus: the device opens the panel itself.
 await page.locator('.notion-pin[data-page="place-app-board"]').focus();await page.keyboard.press('Enter');
 const panel=page.locator('#notionContent[data-template=board] .board-applet');await panel.waitFor();
 await panel.locator('.board-card[data-block=north-star] .board-value',{hasText:'12,345'}).waitFor();
 // Fox's two actions in its action column, each title whole on one line, not cut to an ellipsis.
 for(const [id,label] of [['explain','Explain'],['changed','Changes']]){
  const action=page.locator(`.world-capsule[data-action-id="board:${id}"]`).first();await action.waitFor();
  assert.equal((await action.innerText()).trim(),label);
  assert.ok(await action.evaluate(el=>[el,...el.querySelectorAll('span')].every(e=>e.scrollWidth<=e.clientWidth+1)),label+' is cut short');
 }
 await page.screenshot({path:tmp+'/board-focus.png'});
 // Reading another tab leaves the number as it was; a read with no board empties the device.
 await panel.locator('.board-tab',{hasText:'Health'}).click();
 await panel.locator('.board-empty h2',{hasText:'Nothing on this tab yet.'}).waitFor();
 assert.equal(await figure(),'12.3K');
 await page.evaluate(()=>{(window as any).board='none';});
 await panel.getByRole('button',{name:'Refresh'}).click();
 await panel.locator('.board-empty h2',{hasText:'No board yet.'}).waitFor();
 await page.waitForFunction(()=>!(document.querySelector('#notionWorld') as any)?.sceneMetrics?.modules?.find((m:any)=>m.id==='app-board')?.figure);
 await panel.getByRole('button',{name:'Open Access'}).click();
 await page.locator('#companionInfo [data-part=access]').waitFor();
 assert.deepEqual([...new Set(await page.evaluate(()=>(window as any).calls.filter((c:any)=>c.action==='board').map((c:any)=>c.operation)))],['read'],'only board/read');
 assert.deepEqual(errors,[]);
});
console.log('PASS Board in the World: the north-star number on its device, Peek → Focus into the panel with Fox\'s two actions, another tab leaves the number, no board empties it, Open Access opens Settings › Agents');
