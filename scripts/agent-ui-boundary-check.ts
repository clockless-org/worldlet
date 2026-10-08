import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {bundleScript,pageErrors} from './browser-test.ts';
const bundle=await bundleScript({stdin:{contents:"export {createFoxPreferences} from './ui/companion/fox-preferences.ts'; export {mountWorldOnboarding} from './ui/onboarding/world-onboarding.ts'; export {mountCompanionInfo} from './ui/companion/companion-info.ts';",resolveDir:process.cwd()},globalName:'AgentUI'});
const browser=await chromium.launch();
try{
 const page=await browser.newPage();const errors=pageErrors(page);
 await page.route('https://fixture.test/',route=>route.fulfill({contentType:'text/html',body:'<main id="world"><div id="pet"><button class="companion-avatar">Fox</button></div><div id="guide"></div></main>'}));await page.goto('https://fixture.test/');
 await page.addScriptTag({content:bundle});
 await page.evaluate(async()=>{
  const w=window as any;w.calls=[];
  const root=document.querySelector('#world'),pet=document.querySelector('#pet');
  const call=async(action,body)=>{w.calls.push({action,...body});if(action==='modelStatus')return {provider:'independent',available:true};if(action==='snapshot')return {connections:[]};return {};};
  const info=w.AgentUI.mountCompanionInfo({root,pet,call,getName:()=> 'Fox'});await info.open();
 });
 assert.match(await page.locator('.companion-info-panel').textContent(),/Your companion/);
 assert.doesNotMatch(await page.locator('.companion-info-panel').textContent(),/Hermes/);
 await page.getByRole('button',{name:'Close companion panel'}).click();
 await page.evaluate(()=>{
  const w=window as any,root=document.querySelector('#world');
  const flow=w.AgentUI.mountWorldOnboarding({root,call:async(action,body)=>{w.calls.push({action,...body});return {};},view:{metrics:{buildings:[]},setGuide(g){const box=document.querySelector('#guide');box.replaceChildren();if(g){box.append(document.createTextNode(g.text||''));if(g.body)box.append(g.body);}}},state:{sources:[],connections:[],knowledge:[],onboarding:{completed:true}}});
  flow.show('organize');
 });
 assert.doesNotMatch(await page.locator('#guide').textContent(),/Hermes/);
 await page.getByRole('button',{name:'Allow & organize'}).click();
 const request=await page.evaluate(()=>(window as any).calls.find(c=>c.action==='organizeSources'));
 assert.deepEqual(request,{action:'organizeSources',consent:true});
 await page.evaluate(async()=>{
  const w=window as any;
  w.preferences=w.AgentUI.createFoxPreferences({root:document.querySelector('#world'),setup(){},toggleSample(){},call:async(action,body)=>{
   w.calls.push({action,...body});
   if(action==='companionArchive'&&body.operation==='choose')return w.cancelChoice?{cancelled:true}:{id:'review-token',name:'Maple',memories:2,messages:7};
   return {ok:true};
  },view:{revealGuide(){},setGuide(g){const box=document.querySelector('#guide');box.replaceChildren();if(g){box.append(document.createTextNode(g.text||''));box.append(...(g.actions||[]));}}}});
  await w.preferences.show('data');
 });
 await page.getByRole('button',{name:'Transfer companion',exact:true}).click();
 await page.getByRole('button',{name:'Export companion',exact:true}).click();
 assert.equal(await page.evaluate(()=>(window as any).calls.filter(c=>c.action==='companionArchive'&&c.operation==='export').length),1);
 await page.getByRole('button',{name:'Back to data',exact:true}).click();
 await page.getByRole('button',{name:'Transfer companion',exact:true}).click();
 await page.getByRole('button',{name:'Import companion',exact:true}).click();
 assert.match(await page.locator('#guide').textContent(),/Maple.*2 memories and 7 messages/);
 const imports=()=>page.evaluate(()=>(window as any).calls.filter(c=>c.action==='companionArchive'&&c.operation==='import'));
 assert.deepEqual(await imports(),[],'choosing a file never imports it');
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 assert.deepEqual(await imports(),[],'cancelling review preserves the companion');
 await page.evaluate(()=>{(window as any).cancelChoice=true;});
 await page.getByRole('button',{name:'Import companion',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'Use this companion',exact:true}).count(),0,'cancelled picker does not expose stale confirmation');
 await page.evaluate(()=>{(window as any).cancelChoice=false;});
 await page.getByRole('button',{name:'Import companion',exact:true}).click();
 await page.getByRole('button',{name:'Use this companion',exact:true}).click();
 assert.deepEqual(await imports(),[{action:'companionArchive',operation:'import',id:'review-token'}]);
 assert.deepEqual(errors,[]);
 console.log('PASS independent Agent companion information and provider-neutral organize consent and reviewed companion transfer');
}finally{await browser.close();}
