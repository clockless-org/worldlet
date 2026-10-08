import assert from 'node:assert/strict';
import {withBrowser,fileAccess,pageErrors,worldUrl} from './browser-test.ts';

await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=pageErrors(page);
 await page.addInitScript(()=>{
  window.webkit={messageHandlers:{worldlet:{async postMessage(b){
   if(b.action==='snapshot')return {workspaceId:'attention-idle',revision:1,activityRevision:1,sources:[],knowledge:[],worldItems:[],connections:[],sampleEnabled:true,sampleUI:{},appUpdate:{visible:false}};
   if(b.action==='modelStatus')return {available:true};
   if(b.action==='foxPreferences')return {model:{name:'Fixture',ready:true}};
   if(b.action==='weatherLoad')return null;
   return {ok:true};
  }}}};
 });
 await page.goto(worldUrl());
 await page.waitForFunction(()=>!document.querySelector('#worldStartup')&&document.querySelectorAll('.world-matter').length>0);
 await page.evaluate(()=>document.fonts.ready);
 await page.waitForTimeout(1000);
 const unchanged=await page.evaluate(async()=>{
  const root=document.querySelector('#notionWorld'),list=root.querySelector('.world-task-list'),first=list.firstElementChild;
  const mutations:MutationRecord[]=[];const observer=new MutationObserver(rows=>mutations.push(...rows));observer.observe(list,{childList:true,subtree:true,attributes:true});
  for(let i=0;i<30;i++)root.dispatchEvent(new Event('worldlet:recommendations'));
  await new Promise(resolve=>setTimeout(resolve,0));observer.disconnect();
  return {mutations:mutations.length,same:first===list.firstElementChild};
 });
 assert.deepEqual(unchanged,{mutations:0,same:true});
 // Hidden-Applet -> overview and smaller -> larger must restore fitted rows.
 await page.evaluate(()=>{location.hash='object=app-gmail';});
 await page.waitForTimeout(400);
 await page.evaluate(()=>{location.hash='';});
 await page.waitForTimeout(400);
 for(const height of [650,1000]){
  await page.setViewportSize({width:1440,height});await page.waitForTimeout(150);
  const fit=await page.locator('.world-task-list').evaluate((list:HTMLElement)=>({count:list.querySelectorAll('.world-matter').length,fits:list.scrollHeight<=list.clientHeight+1}));
  assert.ok(fit.count>0&&fit.fits,JSON.stringify(fit));
 }
 assert.deepEqual(errors,[]);
 console.log('PASS unchanged Attention: 30 syncs, zero DOM mutations; Applet return and resize refit');
});
