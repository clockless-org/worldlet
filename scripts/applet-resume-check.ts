// Website Applets resume where the person left off (core/browser/page-resume.ts), driven
// through the real World UI with a faked native bridge: leave and re-enter returns to the
// last page, pages survive a reload/restart, each Applet keeps its own page, Fox's pages
// are not remembered, the practice world never reads or writes the real world's pages, and
// the shared media hold keeps a resumed page silent until the person interacts with it.
import assert from 'node:assert/strict';
import {withBrowser,fileAccess,pageErrors,worldUrl,leaveApplet} from './browser-test.ts';
import path from 'node:path';
import dataset from '../ui/world/sample-persona.json' with {type:'json'};
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1280,height:850},reducedMotion:'reduce'}),errors=pageErrors(page);
 await page.addInitScript(({datasetId})=>{
  const w=window as any;w.calls=[];w.failURL=null;
  const sample=localStorage.getItem('__resume-sample')==='1';
  const homes={web:'https://www.google.com/',x:'https://x.com/home',youtube:'https://www.youtube.com/',tiktok:'https://www.tiktok.com/'};
  // The native Browser panel reports each page it shows; a restore shows the requested page.
  const report=(platform:string,url:string)=>setTimeout(()=>w.worldletBrowser({phase:'page',platform,loading:false,url,title:'Page · '+url}),0);
  w.browse=(url:string)=>{const shown=w.calls.filter(c=>c.action==='browserShow').at(-1);w.worldletBrowser({phase:'page',platform:shown.platform,loading:false,url,title:'Page · '+url});};
  w.webkit={messageHandlers:{worldlet:{async postMessage(b){
   w.calls.push(b);
   if(b.action==='snapshot')return {workspaceId:'resume-check',revision:0,activityRevision:0,sources:[],knowledge:[],connections:[],worldItems:[],onboarding:{completed:true},cloudConsent:true,
    sampleEnabled:sample,...sample?{sampleUI:{'dataset-version':datasetId},overlay:{version:1,created:{},edits:{},trash:{},receipts:{},undo:null},layout:null,appUpdate:{visible:false}}:{}};
   if(b.action==='modelStatus')return {available:true,cloudAllowed:true};
   if(b.action==='weatherLoad'||b.action==='appContent')return b.action==='appContent'?{pages:[]}:null;
   if(b.action==='browserShow'){
    if(b.url&&b.url===w.failURL)throw Error('Choose a valid HTTPS page for this browser.');
    report(b.platform,b.url||homes[b.platform]);
   }
   if(b.action==='agentChat'&&b.text==='Take me back to that video'){
    const result=await w.worldletAgentTool(b.id,{name:'browse_web',id:crypto.randomUUID(),args:{operation:'open',url:w.remembered}});
    return {message:result.error||'Opened.'};
   }
   if(b.action==='agentChat'&&b.text.startsWith('Open ')){
    const result=await w.worldletAgentTool(b.id,{name:'browse_web',id:crypto.randomUUID(),args:{operation:'open',url:b.text.slice(5)}});
    return {message:result.error||'Opened.'};
   }
   return {ok:true};
  }}}};
 },{datasetId:dataset.id});
 const url=worldUrl();
 const boot=async()=>{await page.goto(url);await page.waitForFunction(()=>(document.querySelector<HTMLElement>('#notionWorld') as any)?.sceneMetrics?.camera?.settled);};
 const calls=(action:string)=>page.evaluate(a=>(window as any).calls.filter(c=>c.action===a),action);
 const count=async(action:string)=>(await calls(action)).length;
 const open=async(key:string)=>{
  const shows=await count('browserShow');
  // Leaving may keep the hash; a changed hash is what opens the Applet.
  await page.evaluate(id=>{if(location.hash==='#object='+id)history.replaceState(null,'','#');location.hash='object='+id;},'app-'+key);
  await page.waitForFunction(k=>document.querySelector<HTMLElement>('#notionContent').dataset.applet===k&&!document.querySelector<HTMLElement>('#notionContent').hidden,key);
  await page.waitForFunction(n=>(window as any).calls.filter(c=>c.action==='browserShow').length>n,shows);
  return (await calls('browserShow')).at(-1);
 };
 const leave=async()=>{
  const hides=await count('browserHide');
  await leaveApplet(page);
  await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionContent').hidden);
  await page.waitForFunction(n=>(window as any).calls.filter(c=>c.action==='browserHide').length>n,hides);
  return (await calls('browserHide')).at(-1);
 };
 const browse=(address:string)=>page.evaluate(u=>(window as any).browse(u),address);
 const watch='https://www.youtube.com/watch?v=dQw4w9WgXcQ',post='https://x.com/worldlet/status/1',title='https://www.netflix.com/title/80100172';

 await boot();
 // First visit: nothing remembered, the Applet opens its start page and asks to resume a kept page.
 let shown=await open('youtube');
 assert.deepEqual({applet:shown.applet,resume:shown.resume,hold:shown.hold,url:shown.url,live:shown.live},{applet:'youtube',resume:true,hold:undefined,url:undefined,live:[]});
 await browse(watch);
 let hidden=await leave();
 assert.deepEqual(hidden.live,['youtube'],'leaving keeps the page alive for a quick return');
 shown=await open('youtube');
 assert.equal(shown.url,watch,'re-entering returns to the last page');assert.equal(shown.resume,true);assert.deepEqual(shown.live,[]);
 assert.equal(shown.hold,true,'a remembered page opens with its media held');
 // Separate pages: X and Netflix each keep their own, whichever way the person leaves.
 await leave();
 shown=await open('x');
 assert.equal(shown.url,undefined);assert.deepEqual(shown.live,['youtube']);
 await browse(post);
 shown=await open('netflix');
 assert.equal(shown.url,'https://www.netflix.com/browse');assert.equal(shown.platform,'web');assert.deepEqual(shown.live,['x','youtube'],'switching Applets directly keeps the previous page');
 await browse(title);
 hidden=await leave();
 assert.deepEqual(hidden.live,['netflix','x'],'at most two hidden pages stay alive');
 for(const [key,expected] of [['youtube',watch],['x',post],['netflix',title]] as const){
  shown=await open(key);assert.equal(shown.url,expected,key+' keeps its own page');await leave();
 }
 console.log('PASS leaving and re-entering a website Applet returns to its last page; YouTube, X and Netflix keep separate pages; at most two hidden pages stay alive.');

 // Fox's navigation is Fox's: a page it opened is not remembered as the person's.
 await open('x');
 const fox=page.locator('#notionInput'),input=page.locator('#notionInput');
 await fox.click();await input.fill('Open https://x.com/fox/status/9');await input.press('Enter');
 await page.waitForFunction(()=>(window as any).calls.some(c=>c.action==='browserShow'&&c.url==='https://x.com/fox/status/9'));
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld').dataset.replyBusy==='false');
 const foxShow=(await calls('browserShow')).at(-1);
 assert.equal(foxShow.resume,false,'a page Fox opens is not a resume');assert.equal(foxShow.hold,undefined,'Fox\'s page plays as the site decides');
 await leave();
 shown=await open('x');assert.equal(shown.url,post,'Fox\'s page does not replace the person\'s');
 await leave();

 // Reload/restart: live pages are gone, the remembered page opens instead.
 await boot();
 for(const [key,expected] of [['youtube',watch],['netflix',title],['x',post]] as const){
  shown=await open(key);assert.equal(shown.url,expected,key+' survives a restart');assert.equal(shown.resume,true);assert.equal(shown.hold,true);await leave();
 }
 // The remembered address goes only to the local Browser panel: no Fox turn, analytics or other host call carries it.
 const carriers=await page.evaluate(pages=>(window as any).calls.filter(c=>c.action!=='browserShow'&&pages.some(p=>JSON.stringify(c).includes(p))).map(c=>c.action),[watch,post,title]);
 assert.deepEqual(carriers,[],'restored pages stay local');
 // A remembered page is not an address the person gave: Fox's navigation gate still refuses to
 // open it, with its query data, when the person did not name it (#671, tool-policy.ts).
 await page.evaluate(u=>{(window as any).remembered=u;},watch);
 const showsBefore=await count('browserShow'),bubble=page.locator('#companionDialogue');
 if(!await input.isVisible())await fox.click();
 await input.fill('Take me back to that video');await input.press('Enter');
 await bubble.getByLabel('Current reply').getByText(/Not opened/).waitFor();
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld').dataset.replyBusy==='false');
 assert.equal((await calls('browserShow')).slice(showsBefore).some(c=>c.url===watch),false,'Fox did not open the remembered page on its own');
 // A remembered page the host refuses is forgotten; the Applet opens its start page.
 await page.evaluate(u=>{(window as any).failURL=u;},watch);
 const before=await count('browserShow');
 await page.evaluate(()=>{history.replaceState(null,'','#');location.hash='object=app-youtube';});
 await page.waitForFunction(n=>(window as any).calls.filter(c=>c.action==='browserShow').length>=n+2,before);
 const retry=(await calls('browserShow')).slice(before);
 assert.equal(retry[0].url,watch);assert.equal(retry[1].url,undefined,'the start page opens after a refused restore');assert.equal(retry[1].hold,undefined);
 await leave();await page.evaluate(()=>{(window as any).failURL=null;});
 shown=await open('youtube');assert.notEqual(shown.url,watch,'the refused page is forgotten');
 await browse(watch);await leave();
 console.log('PASS remembered pages survive a reload/restart; Fox-opened pages are not remembered; a refused restore falls back to the start page.');

 // The practice world never reads or writes the real world's pages.
 await page.evaluate(()=>localStorage.setItem('__resume-sample','1'));await boot();
 assert.equal(await page.evaluate(()=>document.querySelector<HTMLElement>('.native-console').dataset.sample),'true');
 shown=await open('youtube');assert.equal(shown.url,undefined,'practice YouTube does not open the real world\'s page');
 await browse('https://www.youtube.com/watch?v=practice00');await leave();
 shown=await open('youtube');assert.equal(shown.url,'https://www.youtube.com/watch?v=practice00','practice resumes within its own session');await leave();
 await page.evaluate(()=>localStorage.removeItem('__resume-sample'));await boot();
 shown=await open('youtube');assert.equal(shown.url,watch,'the real world keeps its page after practice');await leave();
 assert.deepEqual(errors,[]);
 console.log('PASS practice-world pages stay in that session and never reach the real world.');

 // The shared media hold (platform/bridge/media-hold.js, built into WorldletWeb/browser/): hosts
 // run it on a kept or remembered page. Site-started playback stays paused until real input.
 const media=await browser.newPage();
 await media.setContent('<main style="height:600px"><video muted width="160" height="90"></video></main>');
 const video=()=>media.evaluate(()=>{const v=document.querySelector('video');return {paused:v.paused,time:v.currentTime};});
 assert.equal(await media.evaluate(async()=>{
  const canvas=document.createElement('canvas'),g=canvas.getContext('2d');setInterval(()=>{g.fillStyle=`hsl(${Date.now()%360},60%,50%)`;g.fillRect(0,0,16,16);},40);
  const v=document.querySelector('video');v.srcObject=canvas.captureStream(15);await v.play();return v.paused;
 }),false,'the fixture video plays');
 await media.addScriptTag({path:path.resolve('dist/WorldletWeb/browser/media-hold.js')});
 assert.equal((await video()).paused,true,'holding pauses what is playing');
 await media.evaluate(()=>document.querySelector('video').play().catch(()=>{}));
 await media.waitForTimeout(200);
 assert.equal((await video()).paused,true,'the site cannot restart playback on its own');
 await media.evaluate(()=>{document.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));return document.querySelector('video').play().catch(()=>{});});
 await media.waitForTimeout(200);
 assert.equal((await video()).paused,true,'a synthetic event is not the person');
 await media.mouse.click(40,300);
 await media.evaluate(()=>document.querySelector('video').play());
 await media.waitForTimeout(200);
 assert.equal((await video()).paused,false,'after the person interacts, playback works normally');
 await media.close();
 console.log('PASS the shared media hold pauses resumed media and site-started playback until the person interacts.');
});
