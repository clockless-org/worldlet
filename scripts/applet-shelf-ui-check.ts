// The Applet shelf (owner request 2026-10-09), driven through the real World UI with a faked native bridge: inside an
// Applet the recently used Applets stand above it, the open one in the middle and largest, the others smaller the
// further they stand; picking one slides the shelf and opens it; nothing closes from the shelf; the ones that do not
// fit wait behind "+N"; + opens a new page in the Browser with its address ready. The background crossfades while it switches.
import assert from 'node:assert/strict';
import type {Page} from 'playwright';
import {withBrowser,fileAccess,pageErrors,worldUrl} from './browser-test.ts';

await withBrowser(fileAccess,async browser=>{
 async function open(width=1440){
  const page=await browser.newPage({viewport:{width,height:880},reducedMotion:'reduce'}),errors=pageErrors(page);page.setDefaultTimeout(15000);
  await page.addInitScript(()=>{
   const w=window as any;w.calls=[];
   const features={nativeAppletLaunch:true,nativeCalendar:true,appleNotes:true,appleReminders:true,browserFoxOverlay:true,browserPictureInPicture:true,leadingWindowControls:true};
   w.webkit={messageHandlers:{worldlet:{async postMessage(b){
    if(/^browser(Show|Command)$/.test(b.action))w.calls.push(b);
    if(b.action==='snapshot')return {workspaceId:'applet-shelf-check',revision:0,activityRevision:0,hostCapabilities:{version:1,features},sources:[],knowledge:[],connections:[],worldItems:[],onboarding:{completed:true},sampleEnabled:false,cloudConsent:true};
    if(b.action==='modelStatus')return {available:true,cloudAllowed:true};
    if(b.action==='weatherLoad'||b.action==='appContent')return b.action==='appContent'?{pages:[]}:null;
    if(b.action==='browserCommand')return {ok:true,documentId:'fixture',elements:[]};
    if(b.action==='browserShow')setTimeout(()=>w.worldletBrowser({phase:'page',platform:b.platform,loading:false,url:b.url||'https://www.google.com/',title:'Page'}),0);
    return {ok:true};
   }}}};
  });
  await page.goto(worldUrl());
  await page.waitForFunction(()=>(document.querySelector<HTMLElement>('#notionWorld') as any)?.sceneMetrics?.camera?.settled&&!document.getElementById('worldStartup'));
  return {page,errors};
 }
 const active=(page:Page)=>page.evaluate(()=>(document.querySelector<HTMLElement>('#notionWorld') as any).sceneMetrics.active);
 async function enter(page:Page,id:string){
  await page.evaluate(id=>{if(location.hash==='#object='+id)history.replaceState(null,'','#');location.hash='object='+id;},id);
  await page.waitForFunction(id=>(document.querySelector<HTMLElement>('#notionWorld') as any).sceneMetrics.active===id&&document.querySelector<HTMLElement>('#notionWorld').dataset.depth==='object',id);
 }
 const shelf=(page:Page)=>page.evaluate(()=>{
  const box=(e:Element)=>{const r=e.getBoundingClientRect();return {x:r.x+r.width/2,width:r.width};};
  const nav=document.querySelector<HTMLElement>('.applet-shelf')!,panel=document.querySelector('#notionContent')!.getBoundingClientRect();
  const lane=nav.getBoundingClientRect();
  // A website page sits in its theme scene's region (ui/applets/scene), not under the shelf's lane.
  const inScene=document.querySelector('#notionWorld')!.hasAttribute('data-panel-scene');
  return {shown:!nav.hidden,middle:lane.x+lane.width/2,panel:{x:panel.x+panel.width/2,top:panel.top,width:inScene?0:panel.width},bottom:nav.getBoundingClientRect().bottom,
   more:(document.querySelector<HTMLElement>('.applet-shelf-more')!.hidden?'':document.querySelector('.applet-shelf-more')!.textContent),
   tabs:[...document.querySelectorAll<HTMLElement>('.applet-shelf-tab')].map(t=>({id:t.dataset.applet,current:t.hasAttribute('data-current'),distance:+t.dataset.distance!,
    name:t.querySelector('.applet-shelf-name')!.textContent,...box(t.querySelector('.applet-shelf-pick img:not([hidden]),.applet-shelf-mark:not([hidden])')!)}))};
 });
 const settle=(page:Page)=>page.waitForFunction(()=>[...document.querySelectorAll('.applet-shelf-tab')].every(t=>!t.getAnimations().length));
 // The ring: the open Applet is the one marked current, centered over the Applet's panel, and each step out is smaller.
 function assertRing(r:any,id:string,label:string){
  assert.ok(r.shown,label+': the shelf shows');
  const current=r.tabs.find((t:any)=>t.current);
  assert.equal(current?.id,id,label+': the open Applet is the current one');
  assert.equal(current.distance,0,label+': it stands in the middle');
  assert.ok(Math.abs(current.x-r.middle)<=1,label+': centered on the shelf '+JSON.stringify([current.x,r.middle]));
  if(r.panel.width)assert.ok(Math.abs(r.middle-r.panel.x)<=4,label+': the shelf is centered over the Applet '+JSON.stringify([r.middle,r.panel.x]));
  for(const t of r.tabs)if(t!==current){
   assert.ok(t.width<current.width,label+': '+t.id+' is smaller than the open Applet');
   const nearer=r.tabs.filter((o:any)=>o.distance<t.distance);
   for(const o of nearer)assert.ok(o.width>=t.width,label+': nearer Applets are no smaller');
  }
  if(r.panel.width)assert.ok(r.bottom<=r.panel.top,label+': the shelf stands above the Applet\'s panel');
 }

 const {page,errors}=await open();
 const visited=['app-google-calendar','app-x','app-gmail','app-youtube','app-browser'];
 for(const id of visited)await enter(page,id);
 await settle(page);
 let r=await shelf(page);
 assert.deepEqual(r.tabs.map((t:any)=>t.id).sort(),[...visited].sort(),'every recently used Applet stands on the shelf');
 assertRing(r,'app-browser','five Applets');
 assert.equal(r.more,'','no +N while all fit');
 // Picking a neighbour opens it and slides the shelf: the same ring, a new middle.
 const order=(r:any)=>[...r.tabs].sort((a:any,b:any)=>a.x-b.x).map((t:any)=>t.id);
 const before=order(r),right=r.tabs.find((t:any)=>t.distance===1&&t.x>r.middle);
 await page.locator(`.applet-shelf-tab[data-applet="${right.id}"] .applet-shelf-pick`).click();
 await page.waitForFunction(id=>(document.querySelector<HTMLElement>('#notionWorld') as any).sceneMetrics.active===id,right.id);
 await settle(page);r=await shelf(page);
 assertRing(r,right.id,'after picking '+right.id);
 const rotate=(a:string[],b:string[])=>a.length===b.length&&a.some((_,k)=>a.every((x,i)=>x===b[(i+k)%b.length]));
 assert.ok(rotate(order(r),before),'the ring keeps its order '+JSON.stringify([before,order(r)]));
 // A Thing cannot be closed from the shelf (owner request 2026-10-11): no close mark. Back, +N, + and the Thing's
 // controls share one row (owner request 2026-10-11: the buttons stood scattered).
 assert.equal(await page.locator('.applet-shelf-close').count(),0,'no close mark on the shelf');
 const row=await page.evaluate(()=>{const mid=(s:string)=>{const r=document.querySelector(s)!.getBoundingClientRect();return r.top+r.height/2;};return {bar:mid('#notionWorld>.applet-bar-left'),add:mid('.applet-shelf-new')};});
 assert.ok(Math.abs(row.add-row.bar)<=1,'+ stands on the bar\'s row '+JSON.stringify(row));
 // + opens a new page in the Browser with its address ready to type.
 await page.locator('.applet-shelf-new').click();
 await page.waitForFunction(()=>(document.querySelector<HTMLElement>('#notionWorld') as any).sceneMetrics.active==='app-browser');
 await page.waitForFunction(()=>document.activeElement?.closest('.browser-address'));
 // World beside Fox returns to the World, where the shelf rests.
 await page.locator('.world-capsule[title="World"]').click();
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld')!.dataset.depth!=='object');
 assert.equal((await shelf(page)).shown,false,'the World has no shelf');
 assert.deepEqual(errors,[]);
 await page.close();
 console.log('PASS the open Applet stands in the middle of the shelf, largest; picking a neighbour slides the same ring; nothing closes from it; + stands on the bar\'s row and opens the Browser\'s address.');

 // A narrower window holds fewer: the ones used longest ago wait behind +N and open from there.
 {
  const {page,errors}=await open(1000);
  const ids=['app-google-calendar','app-x','app-gmail','app-youtube','app-browser','app-google-calendar'];
  for(const id of ids)await enter(page,id);
  await settle(page);
  const r=await shelf(page);
  assertRing(r,'app-google-calendar','1000 wide');
  assert.ok(r.tabs.length<5&&r.more==='+'+(5-r.tabs.length),'+N counts the rest '+JSON.stringify([r.tabs.length,r.more]));
  await page.locator('.applet-shelf-more').click();
  const extra=page.locator('.applet-shelf-extra .applet-shelf-pick').first();
  await extra.waitFor();
  const title=await extra.getAttribute('title');
  await extra.click();
  await page.waitForFunction(()=>(document.querySelector<HTMLElement>('#notionWorld') as any).sceneMetrics.active!=='app-google-calendar');
  await settle(page);
  const after=await shelf(page);
  assert.equal('Open '+after.tabs.find((t:any)=>t.current).name,title,'an Applet from +N opens in the middle');
  assert.deepEqual(errors,[]);
  await page.close();
 }
 // A stacked narrow window has no shelf; the Applet's title stays.
 {
  const {page,errors}=await open(760);
  await enter(page,'app-google-calendar');
  assert.equal((await shelf(page)).shown,false,'no shelf in a stacked window');
  assert.deepEqual(errors,[]);
  await page.close();
 }
 console.log('PASS a narrower window puts the rest behind +N, which opens them; a stacked window has no shelf.');
});
