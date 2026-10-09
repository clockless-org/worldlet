// Carrying the conversation between Applets (owner Order 2026-10-09), driven through the real World UI with a faked
// native bridge. The page in a website Applet moves to a site that has its own website Applet in the World: the World
// moves to that Applet (its title and place), the page it left is let go, and the conversation the person was having
// continues there instead of the new site starting its own (core/companion/conversation-place.ts, carriesConversation).
import assert from 'node:assert/strict';
import type {Page} from 'playwright';
import {launchTestBrowser,pageErrors,worldUrl} from './browser-test.ts';
const browser=await launchTestBrowser({args:['--allow-file-access-from-files']});
async function open(turnAt:number|null){
 const page=await browser.newPage({viewport:{width:1440,height:840},reducedMotion:'reduce'}),errors=pageErrors(page);page.setDefaultTimeout(15000);
 await page.addInitScript(turnAt=>{
  const w=window as any;w.calls=[];
  const features={localDataDeletion:true,nativeAppletLaunch:true,nativeCalendar:true,appleNotes:true,appleReminders:true,voiceMemos:true,folderManagement:false,backgroundSourceChecks:true,cancellableOrganization:false,deferredBackupRestore:false,cancellableTransferReview:false,browserBookmarks:true,installedAppDetection:true,browserFoxOverlay:true,browserPictureInPicture:false,leadingWindowControls:true};
  // One turn said on X a minute ago (or none): the conversation the page may carry.
  const thread=turnAt===null?[]:[{key:'fox-thread',userTextVersion:1,view:'',text:'',entries:[{id:'turn-1',key:'web:x.com',view:'',location:'X',user:'Can I share my project here?',text:'Self promotion is fine in the weekly thread.',steps:[],status:'done',at:Date.now()-turnAt}]}];
  w.webkit={messageHandlers:{worldlet:{async postMessage(b){
   if(/^browser(Show|Layout|Hide)$/.test(b.action))w.calls.push(b);
   if(b.action==='snapshot')return {workspaceId:'carry-check',revision:0,activityRevision:0,hostCapabilities:{version:1,features},sources:[],knowledge:[],connections:[],worldItems:[],onboarding:{completed:true},sampleEnabled:false,cloudConsent:true};
   if(b.action==='modelStatus')return {available:true,cloudAllowed:true};
   if(b.action==='conversationRecall')return b.rows?{ok:true}:thread;
   if(b.action==='weatherLoad'||b.action==='appContent')return b.action==='appContent'?{pages:[]}:null;
   if(b.action==='browserCommand')return {ok:true,documentId:'fixture',elements:[]};
   if(b.action==='browserShow')setTimeout(()=>w.worldletBrowser({phase:'page',platform:b.platform,loading:false,url:b.url||'https://x.com/home',title:'Home'}),0);
   return {ok:true};
  }}}};
 },turnAt);
 await page.goto(worldUrl());
 await page.waitForFunction(()=>(document.querySelector<HTMLElement>('#notionWorld') as any)?.sceneMetrics?.camera?.settled&&!document.getElementById('worldStartup'));
 return {page,errors};
}
const calls=(page:Page,action:string)=>page.evaluate(a=>(window as any).calls.filter(c=>c.action===a),action);
const host=(page:Page,value:any)=>page.evaluate(v=>(window as any).worldletBrowser(v),value);
async function enter(page:Page,key:string){
 await page.evaluate(id=>{location.hash='object='+id;},'app-'+key);
 await page.waitForFunction(k=>document.querySelector<HTMLElement>('#notionContent').dataset.applet===k&&!document.querySelector<HTMLElement>('#notionContent').hidden,key);
 await page.waitForFunction(()=>(window as any).calls.some(c=>c.action==='browserShow'));
}
const shots=process.env.CARRY_SHOTS;
const said='Self promotion is fine in the weekly thread.';
const dialogue=(page:Page)=>page.evaluate(()=>document.querySelector('#companionDialogue')?.textContent||'');
const title=(page:Page)=>page.evaluate(()=>document.querySelector('.companion-context .companion-name')?.textContent?.trim()||'');
async function moveToReddit(page:Page){
 // The page in the X Applet follows a link to Reddit; the host says so on X's engine.
 const platform=(await calls(page,'browserShow')).at(-1).platform;
 await host(page,{phase:'page',platform,loading:false,url:'https://www.reddit.com/r/test/',title:'r/test'});
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionContent').dataset.applet==='reddit');
 await page.waitForFunction(()=>(window as any).calls.some(c=>c.action==='browserShow'&&c.applet==='reddit'));
}
{
 const {page,errors}=await open(60000);
 await enter(page,'x');
 await page.waitForFunction(t=>document.querySelector('#companionDialogue')?.textContent?.includes(t),said);
 if(shots)await page.screenshot({path:shots+'/1-x.png'});
 await moveToReddit(page);
 assert.equal(await page.evaluate(()=>location.hash),'#object=app-reddit','the World moves to the Reddit Applet');
 assert.equal(await title(page),'Reddit','its title is Reddit');
 const shown=(await calls(page,'browserShow')).at(-1);
 assert.deepEqual({applet:shown.applet,url:shown.url,live:shown.live},{applet:'reddit',url:'https://www.reddit.com/r/test/',live:[]},'Reddit shows the page; X lets its page go');
 await page.waitForTimeout(300);
 assert.ok((await dialogue(page)).includes(said),'the conversation from X continues in Reddit');
 if(shots)await page.screenshot({path:shots+'/2-reddit.png'});
 // X opens on its own website next time, not on the page that moved on.
 await enter(page,'x');
 await page.waitForFunction(()=>(window as any).calls.filter(c=>c.action==='browserShow').at(-1)?.applet==='x');
 assert.notEqual((await calls(page,'browserShow')).at(-1).url,'https://www.reddit.com/r/test/');
 assert.deepEqual(errors,[]);await page.close();
 console.log('PASS a page that moves to another website Applet takes the World there, with its title, and the conversation goes with it.');
}
{
 // Nobody talked on X lately: Reddit is its own place, so its (empty) conversation shows.
 const {page,errors}=await open(30*60000);
 await enter(page,'x');
 await moveToReddit(page);
 assert.equal(await title(page),'Reddit');
 await page.waitForTimeout(300);
 assert.ok(!(await dialogue(page)).includes(said),'an old conversation stays where it was said');
 assert.deepEqual(errors,[]);await page.close();
 console.log('PASS without a recent turn the new website starts its own conversation.');
}
await browser.close();
