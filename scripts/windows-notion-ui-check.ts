import assert from 'node:assert/strict';
import {bundleScript,withBrowser,pageErrors} from './browser-test.ts';

declare global {var NotionSetup:any;var notionGuide:any;var notionState:any;var notionCalls:any[];var notionPending:any;var notionHang:boolean;}
await withBrowser(async browser=>{
 const page=await browser.newPage(),errors=pageErrors(page);
 const bundle=await bundleScript({entryPoints:['ui/onboarding/world-onboarding.ts'],globalName:'NotionSetup'});
 await page.setContent('<main><div id="guide"></div></main>');await page.addScriptTag({content:bundle});
 await page.evaluate(()=>{
  notionCalls=[];notionHang=false;notionState={platform:'windows',onboarding:{completed:true},sources:[],knowledge:[],connections:[],cloudConsent:false};
  const call=async(action,body:any={})=>{
   notionCalls.push({action,...body});
   if(action==='snapshot')return structuredClone(notionState);
   if(action==='connect'){
    if(notionHang)return new Promise((_,reject)=>{notionPending=reject;});
    notionState.connections=[{id:'hermes-notion',provider:'notion',connected:true,transport:'hermes'}];return {connected:true};
   }
   if(action==='connectCancel'){notionPending(Error('Cancelled'));return {ok:true};}
   if(action==='disconnectSource'){notionState.connections=[];return {ok:true};}
   throw Error('Unexpected native action '+action);
  };
  const view={metrics:{buildings:[]},revealGuide(){},openApplet(id){notionCalls.push({action:'openApplet',id});},setGuide(value){const guide=document.getElementById('guide');guide.replaceChildren();if(value?.text)guide.append(document.createTextNode(value.text));if(value?.body)guide.append(value.body);for(const b of value?.actions||[])guide.append(b);}};
  notionGuide=NotionSetup.mountWorldOnboarding({root:document.querySelector('main'),state:notionState,call,view});notionGuide.show('connection','library','notion');
 });
 await page.getByRole('button',{name:'Open Notion',exact:true}).waitFor();
 const text=await page.locator('#guide').innerText();assert.match(text,/Notion is connected/);assert.match(text,/Background checks.*not available/);assert.doesNotMatch(text,/every 30 minutes|Start lets Fox|Reading Notion now/);
 await page.getByRole('button',{name:'Open Notion',exact:true}).click();
 assert.ok(await page.evaluate(()=>notionCalls.some(c=>c.action==='openApplet'&&c.id==='app-notion')));
 assert.ok(await page.evaluate(()=>!notionCalls.some(c=>c.action==='foxPreferences')));
 await page.evaluate(()=>notionGuide.show('connection','library','notion'));
 await page.getByRole('button',{name:'Disconnect Notion',exact:true}).click();
 await page.getByRole('button',{name:'Connect Notion',exact:true}).waitFor();
 await page.evaluate(()=>notionHang=true);await page.getByRole('button',{name:'Connect Notion',exact:true}).click();
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.getByRole('button',{name:'Try again',exact:true}).waitFor();assert.match(await page.locator('#guide').innerText(),/Connection cancelled/);
 for(const provider of ['apple-notes','apple-reminders','voice-memos']){
  const before=await page.evaluate(()=>notionCalls.length);
  await page.evaluate(provider=>notionGuide.show('connection','home',provider),provider);
  assert.match(await page.locator('#guide').innerText(),/does not support this system Applet/);
  assert.equal(await page.evaluate(()=>notionCalls.length),before,'unsupported connection never reaches native execution');
 }
 assert.deepEqual(errors,[]);
 console.log('PASS Windows Notion guide: native connect/disconnect/cancel routes, open shelf and truthful background/model-consent behavior.');
});
