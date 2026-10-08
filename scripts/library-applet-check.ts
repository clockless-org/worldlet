import assert from 'node:assert/strict';
import {withBrowser,fileAccess,pageErrors,worldUrl,leaveApplet} from './browser-test.ts';
import os from 'node:os';
import path from 'node:path';
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1280,height:850},reducedMotion:'reduce'}),errors=pageErrors(page);
 page.setDefaultTimeout(15000);
 await page.addInitScript(()=>{
  window.calls=[];let vault=false;
  window.fixture={workspaceId:'library-test',revision:0,sources:[],knowledge:[],worldItems:[],worldChecks:[],cloudConsent:true,connections:[{id:'notion',provider:'notion',syncStatus:'connected',connected:true}],onboarding:{completed:true},sampleEnabled:false,sampleUI:{},overlay:{version:1,created:{},edits:{},trash:{},receipts:{},undo:null}};
  const notes=provider=>Array.from({length:6},(_,i)=>({id:provider==='notion'?('a'.repeat(31)+i):'folder/Note '+i+'.md',title:provider+' note '+i,url:'https://www.notion.so/'+('a'.repeat(31)+i)}));
  window.webkit={messageHandlers:{worldlet:{async postMessage(b){calls.push(b);
   if(b.action==='snapshot')return structuredClone(fixture);
   if(b.action==='modelStatus')return {available:true,cloudAllowed:true};
   if(b.action==='foxPreferences')return {model:{name:'F',ready:true,provider:'custom'},cloudConsent:true};
   if(b.action==='appContent')return {pages:notes('notion')};
   if(b.action==='notionContent')return {page:{title:'Notion original',markdown:'# Native Notion original\n\nReadable source content.'}};
   if(b.action==='obsidianContent'){
    if(b.operation==='choose')vault=true;if(b.operation==='disconnect')vault=false;
    if(b.operation==='read')return {title:b.id,text:'# Native Obsidian original\n\nLocal Markdown source.'};
    return {connected:vault,pages:vault?notes('obsidian'):[],scope:'Fixture vault · Read only'};
   }
   if(b.action==='weatherLoad')return null;
   return {ok:true};
  }}}};
 });
 await page.goto(worldUrl());
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld')?.sceneMetrics?.modules.length>0);
 for(const key of ['notion','obsidian']){
  await page.evaluate(k=>location.hash='object=app-'+k,key);
  await page.locator('.pixi-applet-stage').waitFor();
  if(key==='obsidian')await page.getByRole('button',{name:'Choose vault',exact:true}).click();
  // Every page shows at once; more than the places scroll in the item area instead of paging (#2048).
  await page.waitForFunction(()=>document.querySelectorAll('.pixi-stage-item').length===6);
  assert.equal(await page.locator('.pixi-open-pagination').count(),0,'no page arrows');
  assert.equal(await page.locator('#notionContent').isVisible(),false);
  await page.screenshot({path:path.join(os.tmpdir(),'library-'+key+'-open.png')});
  await page.locator('.pixi-stage-item').first().click();
  await page.getByText(key==='notion'?'Readable source content.':'Local Markdown source.',{exact:true}).waitFor();
  await page.locator('.pixi-selected-item').waitFor();
  // The Applet's immersive background paints its device, so the Pixi device is not duplicated.
  await page.waitForFunction(k=>{const m=document.querySelector<HTMLElement>('#notionWorld').sceneMetrics;return m.focusRoom?.key===k&&m.focusRoom.framing==='scene-fit'&&m.presentation.deviceVisible===false;},key);
  const item=await page.locator('.pixi-selected-item').boundingBox(),next=await page.getByRole('button',{name:'Next item',exact:true}).boundingBox();
  assert.ok(next.x>=item.x+item.width,'item navigation stays outside');
  await page.getByRole('button',{name:'Next item',exact:true}).click();
  await page.waitForFunction(k=>calls.filter(c=>c.action===(k==='notion'?'notionContent':'obsidianContent')&&['read','fetch'].includes(c.operation)).length>=2,key);
  await page.screenshot({path:path.join(os.tmpdir(),'library-'+key+'-focus.png')});
  if(key==='notion'){
    const selected=await page.locator('.pixi-selected-item').innerText();
    await page.locator('.applet-mode-web').click();
    await page.locator('.browser-viewport').waitFor();
    assert.equal(await page.locator('#notionWorld').getAttribute('data-page'),'app-notion');
    await page.waitForFunction(()=>calls.some(c=>c.action==='browserShow'&&c.url?.includes('notion.so/')));
    await page.locator('.applet-mode-native').click();
    await page.locator('.app-source-body').waitFor();
    await page.waitForFunction(text=>(document.querySelector('.pixi-selected-item') as HTMLElement|null)?.innerText===text,selected);
    await page.waitForFunction(()=>calls.some(c=>c.action==='browserHide'));
  }else assert.equal(await page.locator('.applet-mode-toggle').count(),0);
  await leaveApplet(page);
  await page.locator('.pixi-applet-stage').waitFor();
 }
 assert.deepEqual(errors,[]);
 console.log('PASS Library native Open showing every page, Focus originals, selected device, outside navigation, web escape and return.');
});
