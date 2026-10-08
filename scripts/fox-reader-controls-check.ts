import assert from 'node:assert/strict';
import {fileAccess,launchTestBrowser,pageErrors,worldUrl} from './browser-test.ts';

// Both hosts render this shared navigation/guide lifecycle. Fictional records
// exercise UI ownership only; this does not validate account authorization.
const browser=await launchTestBrowser(fileAccess);
try {
 for(const platform of ['macos','windows']){
  const page=await browser.newPage();const errors=pageErrors(page);
  await page.addInitScript(platform=>{
   const w=window as any;
   w.worldletHost={version:1,platform,request:async body=>{
    if(body.action==='snapshot')return {
     platform,workspaceId:'reader-controls',revision:1,activityRevision:0,
     sources:['one','two'].map(id=>({id,title:'Fixture '+id,origin:'notion',revision:'1',enabled:true,moduleKey:'notion',connectionId:'notion',excerpt:'Fictional source'})),
     knowledge:['one','two'].map(id=>({sourceId:id,sourceRevision:'1',summary:'Fictional content '+id,theme:'factory',topic:'Fixture',facts:[]})),
     connections:[{id:'notion',provider:'notion',status:'connected',enabled:true}],
     sampleEnabled:false,onboarding:{completed:true},cloudConsent:false
    };
    return {ok:true};
   }};
  },platform);
  await page.goto(worldUrl());
  await page.waitForFunction(()=>!!(document.querySelector('#notionWorld') as any)?.sceneMetrics?.buildings.length);
  for(const id of ['one','two']){
   await page.evaluate(id=>{location.hash='note=source-'+id;},id);
   await page.waitForFunction(id=>{
    const content=document.querySelector<HTMLElement>('#notionContent');
    return !content?.hidden&&content?.textContent.includes('Fictional content '+id);
   },id);
   await page.evaluate(async()=>{await (window as any).worldletShowControls('connections');});
   await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld')?.dataset.foxGuide==='true');
   const accounts=await page.locator('#companionDialogue').textContent();
   assert.match(accounts,/Connected accounts\. Choose one to reconnect or disconnect it\./);
   assert.doesNotMatch(accounts,/different (?:Google )?account/,'Reconnect promises no other account; Google advice needs a Google connection');
   // Ordinary HUD refreshes must not mistake the reader becoming visible for
   // navigation and clear the guide a user just explicitly requested.
   await page.evaluate(()=>document.querySelector('#notionWorld').dispatchEvent(new Event('worldlet:recommendations')));
   assert.equal(await page.locator('#notionWorld').getAttribute('data-fox-guide'),'true');
  }
  await page.evaluate(()=>{location.hash='building=building-work';});
  await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld')?.dataset.depth==='building');
  assert.equal(await page.locator('#notionWorld').getAttribute('data-fox-guide'),'false','actual navigation still dismisses the old guide');
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: shared reader identity settles before Fox controls; guide survives HUD refresh and dismisses on navigation for both host envelopes.');
} finally {await browser.close();}
