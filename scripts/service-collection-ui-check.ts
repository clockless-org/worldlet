import assert from 'node:assert/strict';
import fs from 'node:fs';
import {withBrowser,bundleScript,pageErrors} from './browser-test.ts';

await withBrowser(async browser=>{
 const page=await browser.newPage({viewport:{width:900,height:900}}),errors=pageErrors(page,{console:true});
 await page.setContent('<!doctype html><title>Worldlet collection settings check</title><main class="native-console" style="max-width:620px;margin:20px auto;font:14px system-ui;--control-fill:#f0f3ed;--control-ink:#203b30;--hud-paper-ink:#203b30;--hud-muted:#5b6b60;--ui-font-ui:system-ui"><h2>Connections</h2><div id="settings"></div></main>');
 await page.addStyleTag({content:fs.readFileSync('ui/companion/companion-panel.css','utf8')});
 await page.addStyleTag({content:fs.readFileSync('ui/components/hud.css','utf8')});
 await page.addScriptTag({content:await bundleScript({entryPoints:['ui/companion/service-collection.ts'],globalName:'CollectionSettings'})});
 await page.evaluate(async()=>{
  const w=window as any;w.calls=[];w.presets=[];w.jobs=[];w.refused=false;w.listRefused=false;w.connectRefused=false;
  const call=async(action:string,body:any={})=>{
   w.calls.push({action,...body});
   if(body.operation==='list'&&w.listRefused)throw Error('Collection settings are unavailable.');
   if(action==='servicePresets'){
    if(body.operation==='save'){w.presets=w.presets.filter(p=>p.id!==body.preset.id);w.presets.push(body.preset);return {preset:body.preset,presets:w.presets};}
    return {presets:w.presets};
   }
   if(action==='serviceSync'){
    if(body.operation==='configure'){
     if(w.refused)throw Error('Connect this Service before enabling sync.');
     const old=w.jobs.find(j=>j.id===body.id);w.jobs=w.jobs.filter(j=>j.id!==body.id);
     w.jobs.push({...old,id:body.id,available:true,check:{enabled:body.enabled,intervalMinutes:body.intervalMinutes,nextAt:2_000_000_000}});
    }
    return {jobs:w.jobs};
   }
   if(action==='connect'){if(w.connectRefused)throw Error('Sign-in cancelled.');return {ok:true};}
   throw Error('Unexpected settings action');
  };
  w.draw=async()=>{document.querySelector('#settings')!.replaceChildren();await w.CollectionSettings.showServiceCollection(document.querySelector('#settings'),call,()=>true);};
  await w.draw();
 });
 assert.equal(await page.title(),'Worldlet collection settings check');
 assert.match(await page.locator('main').innerText(),/No pages are saved yet/);
 assert.deepEqual(await page.evaluate(()=>(window as any).calls.map(c=>c.operation)),['list','list'],'opening settings reads status only');
 await page.getByLabel('Page name',{exact:true}).fill('Project notes');
 await page.getByLabel('Notion page URL or ID',{exact:true}).fill('not-a-page');
 await page.getByRole('button',{name:'Save and enable',exact:true}).click();
 assert.equal(await page.evaluate(()=>(window as any).calls.some(c=>c.operation==='save')),false,'invalid page identifiers never reach storage');
 await page.getByLabel('Notion page URL or ID',{exact:true}).fill('https://www.notion.so/Project-11111111222233334444555555555555');
 await page.getByLabel('Collect every',{exact:true}).selectOption('60');
 await page.getByRole('button',{name:'Save and enable',exact:true}).click();
 await page.getByText('Waiting for first collection',{exact:true}).waitFor();
 const writes=await page.evaluate(()=>(window as any).calls.filter(c=>c.operation==='save'||c.operation==='configure'));
 assert.deepEqual(writes,[{action:'servicePresets',operation:'save',preset:{id:'notion-11111111222233334444555555555555',name:'Project notes',provider:'notion',read:{operation:'read',id:'11111111222233334444555555555555'}}},{action:'serviceSync',operation:'configure',id:'notion-11111111222233334444555555555555',enabled:true,intervalMinutes:60}]);
 await page.evaluate(()=>{const w=window as any;w.jobs[0].snapshotAt=1_900_000_000;w.jobs[0].check.lastStatus='complete';});
 await page.getByRole('button',{name:'Refresh status',exact:true}).click();
 await page.getByText('Saved',{exact:true}).waitFor();
 await page.evaluate(()=>{(window as any).jobs[0].available=false;});
 await page.getByRole('button',{name:'Refresh status',exact:true}).click();
 await page.getByText('Connection or page selection changed — enable again',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Enable again',exact:true}).click();
 await page.getByText('Saved',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>(window as any).jobs[0].available),true,'the owner can renew an unavailable collection without pausing first');
 await page.getByRole('button',{name:'Pause',exact:true}).click();
 await page.getByText('Paused',{exact:true}).waitFor();
 await page.evaluate(()=>{(window as any).refused=true;});
 await page.getByRole('button',{name:'Enable',exact:true}).click();
 await page.getByText('Connect this Service before enabling sync.',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>(window as any).calls.some(c=>c.action==='connect')),false,'missing permission never starts OAuth automatically');
 await page.getByLabel('Page name',{exact:true}).fill('Another page');
 await page.getByLabel('Notion page URL or ID',{exact:true}).fill('aaaaaaaa222233334444555555555555');
 await page.getByRole('button',{name:'Save and enable',exact:true}).click();
 await page.getByText('Connect this Service before enabling sync.',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>(window as any).presets.length),2,'a failed enable keeps the explicitly saved preset');
 assert.equal(await page.evaluate(()=>(window as any).jobs.length),1,'a failed enable creates no active job');
 await page.evaluate(()=>{(window as any).connectRefused=true;});
 await page.getByRole('button',{name:'Connect Notion',exact:true}).click();
 await page.getByText('Sign-in cancelled.',{exact:true}).waitFor();
 await page.evaluate(async()=>{const w=window as any;w.listRefused=true;await w.draw();});
 await page.getByText('Collection settings are unavailable.',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Save and enable',exact:true}).count(),0);
 await page.evaluate(async()=>{const w=window as any;w.listRefused=false;await w.draw();});
 assert.equal(await page.locator('main [role="alert"]').count(),0);
 assert.deepEqual(errors,[]);
 const screenshot=process.argv.includes('--screenshot')?process.argv[process.argv.indexOf('--screenshot')+1]:'';
 if(screenshot)await page.screenshot({path:screenshot,fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'narrow settings do not overflow horizontally');
 if(screenshot)await page.screenshot({path:screenshot.replace(/\.png$/,'-narrow.png'),fullPage:true});
});
console.log('PASS saved Notion settings: explicit selection/interval, status-only opening, canonical preset, saved/paused states, connection renewal, partial-save and list failures, cancelled sign-in, no automatic OAuth, narrow layout');
