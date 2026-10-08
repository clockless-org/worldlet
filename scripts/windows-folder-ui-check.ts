import assert from 'node:assert/strict';
import {bundleScript,withBrowser,pageErrors} from './browser-test.ts';
import {APPLET_REGION_TITLES} from '../core/applets/regions.ts';
declare global {var FolderUI:any;var folderCalls:any[];var folderState:any;var folderGuide:any;var cancelFolder:boolean;var finishOrganization:any;}
await withBrowser(async browser=>{
 const page=await browser.newPage(),errors=pageErrors(page);
 const bundle=await bundleScript({entryPoints:['ui/onboarding/world-onboarding.ts'],globalName:'FolderUI'});
 await page.setContent('<main><div id="guide"></div></main>');await page.addScriptTag({content:bundle});
 await page.evaluate(()=>{
  folderCalls=[];cancelFolder=false;folderState={platform:'windows',onboarding:{completed:true},sources:[{id:'original',title:'Existing original',enabled:true}],knowledge:[],connections:[],cloudConsent:false};
  const call=async(action,body:any={})=>{folderCalls.push({action,...body});
   if(action==='snapshot')return structuredClone(folderState);
   if(action==='onboarding'&&body.operation==='region'){folderState.onboarding.establishedRegions=['home',body.region];folderGuide.update(structuredClone(folderState));return {ok:true};}
   if(action==='connect'){if(cancelFolder)return {cancelled:true};folderState.connections=[{id:'folder-fixture',provider:'folder',label:'My notes',connected:true}];return {connected:true};}
   if(action==='folderConnection'){if(body.operation==='disconnect')folderState.connections=[];return {ok:true,imported:2};}
   if(action==='organizeSources')return new Promise((resolve,reject)=>{finishOrganization={resolve,reject};});
   if(action==='agentCancel'){finishOrganization.reject(Error('Organization cancelled. Completed sources are kept.'));return {ok:true};}
   throw Error('Unexpected action '+action);
  };
  const view={metrics:{buildings:[]},revealGuide(){},setGuide(value){const guide=document.getElementById('guide');guide.replaceChildren();if(value?.text)guide.append(document.createTextNode(value.text));if(value?.body)guide.append(value.body);for(const b of value?.actions||[])guide.append(b);}};
  folderGuide=FolderUI.mountWorldOnboarding({root:document.querySelector('main'),state:folderState,call,view});folderGuide.show('sources','health');
 });
 await page.getByText('Use an existing source',{exact:true}).click();await page.getByRole('button',{name:'Existing original',exact:true}).click();
 await page.getByRole('button',{name:'Explore '+APPLET_REGION_TITLES.health,exact:true}).waitFor();
 assert.ok(await page.evaluate(()=>folderCalls.some(c=>c.action==='onboarding'&&c.operation==='region'&&c.region==='health'&&c.sourceIds[0]==='original')));
 await page.evaluate(()=>folderGuide.show('sources','library'));
 await page.getByText('Add something of your own',{exact:true}).click();await page.getByRole('button',{name:'Connect local folder…',exact:true}).click();
 await page.getByRole('button',{name:'Sync folder',exact:true}).waitFor();
 assert.match(await page.locator('#guide').innerText(),/My notes/);
 assert.doesNotMatch(await page.locator('#guide').innerText(),/sign.in|Start lets Fox|Nothing is copied/i);
 await page.getByRole('button',{name:'Sync folder',exact:true}).click();
 await page.getByText('Folder synced. 2 new or updated files; saved copies of removed files are kept.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Disconnect folder',exact:true}).click();
 await page.getByText('Folder disconnected. Saved originals are kept.',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Sync folder',exact:true}).count(),0);
 await page.evaluate(()=>cancelFolder=true);await page.getByText('Add something of your own',{exact:true}).click();
 await page.getByRole('button',{name:'Connect local folder…',exact:true}).click();await page.getByText('Add something of your own',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Sync folder',exact:true}).count(),0);
 const calls=await page.evaluate(()=>folderCalls);
 assert.ok(calls.some(c=>c.action==='connect'&&c.provider==='folder'&&c.region==='library'));
 assert.deepEqual(calls.filter(c=>c.action==='folderConnection').map(c=>[c.operation,c.id]),[['sync','folder-fixture'],['disconnect','folder-fixture']]);
 assert.ok(!calls.some(c=>c.action==='foxPreferences'));assert.deepEqual(errors,[]);
 await page.evaluate(()=>folderGuide.show('organize'));
 await page.getByRole('button',{name:'Allow & organize',exact:true}).click();
 await page.getByRole('button',{name:'Stop organizing',exact:true}).click();
 await page.getByText('Organization cancelled. Completed sources are kept.',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Stop organizing',exact:true}).count(),0);
 assert.ok(await page.getByRole('button',{name:'Allow & organize',exact:true}).isEnabled());
 await page.getByRole('button',{name:'Allow & organize',exact:true}).click();
 await page.evaluate(()=>finishOrganization.resolve({ok:true,organized:1}));
 await page.getByRole('button',{name:'Stop organizing',exact:true}).waitFor({state:'detached'});
 assert.ok(await page.evaluate(()=>folderCalls.filter(c=>c.action==='organizeSources').every(c=>c.consent===true)));
 assert.deepEqual(errors,[]);
 console.log('PASS Windows source organization guide: explicit consent, enabled cancellation during busy work, visible failure and retry.');
 console.log('PASS Windows source guide: existing-source region readiness, native folder selection routing, truthful local-copy text, manual sync, disconnect, cancellation and unchanged model consent.');
});
