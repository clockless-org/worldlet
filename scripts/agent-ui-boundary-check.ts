import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {bundleScript,pageErrors} from './browser-test.ts';
const bundle=await bundleScript({stdin:{contents:"export {createFoxPreferences} from './ui/settings/fox-preferences.ts'; export {mountWorldOnboarding} from './ui/shell/world-onboarding.ts'; export {mountCompanionInfo} from './ui/companion/companion-info.ts';",resolveDir:process.cwd()},globalName:'AgentUI'});
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
 assert.deepEqual(errors,[]);
 console.log('PASS independent Agent companion information and provider-neutral organize consent');
}finally{await browser.close();}
