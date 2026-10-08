// The Browser's tabs (owner request 2026-10-07, ui/browser/browser-device.ts, core/browser/browser-tabs.ts), driven
// through the real World UI with a faked native bridge: the strip above the page and outside its rect, + and the File
// menu's keys, each tab its own kept page ('browser', 'browser--2'…) shown, kept and released by the live budget, a
// released tab reopening at its last address, a link opened for a new tab, closing hand-over, the last tab leaving a home tab, the tabs kept
// over a reload, and website Applets without tabs. BROWSER_TABS_SHOT=<file> keeps a picture of three tabs at 1440×900.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {withBrowser,fileAccess,pageErrors,worldUrl} from './browser-test.ts';
const shot=process.env.BROWSER_TABS_SHOT;
const titles:Record<string,string>={'https://www.google.com/':'Google','https://flights.example.com/sfo':'Flights to San Francisco · Compare fares',
 'https://hotels.example.com/sf':'Hotels in San Francisco','https://cars.example.com/':'Car rental'};
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'}),errors=pageErrors(page);page.setDefaultTimeout(15000);
 await page.addInitScript(titles=>{
  const w=window as any;w.calls=[];
  const features={browserFoxOverlay:true,browserPictureInPicture:true,leadingWindowControls:true};
  w.webkit={messageHandlers:{worldlet:{async postMessage(b){
   if(/^browser(Show|Layout|Hide|Pip|Command)$/.test(b.action))w.calls.push(b);
   if(b.action==='snapshot')return {workspaceId:'browser-tabs-check',revision:0,activityRevision:0,hostCapabilities:{version:1,features,browserBudget:{livePages:2,foxTasks:1}},sources:[],knowledge:[],connections:[],worldItems:[],onboarding:{completed:true},sampleEnabled:false,cloudConsent:true};
   if(b.action==='modelStatus')return {available:true,cloudAllowed:true};
   if(b.action==='weatherLoad'||b.action==='appContent')return b.action==='appContent'?{pages:[]}:null;
   if(b.action==='browserCommand')return {ok:true};
   // The host's page reports its address once shown: a kept page its own, a new one the address it opened.
   // Like the host, only pages still alive (the one in view and the `live` ones) come back as they were.
   if(b.action==='browserShow'){const alive=w.alive?.has(b.applet),url=b.resume&&alive&&w.kept?.[b.applet]||b.url||'https://www.google.com/';w.alive=new Set([...b.live||[],b.applet]);if(!alive&&w.kept)delete w.kept[b.applet];w.opening=(w.opening||0)+1;setTimeout(()=>{w.opening--;w.worldletBrowser({phase:'page',platform:b.platform,loading:false,url,title:titles[url]||'Page'});},0);}
   return {ok:true};
  }}}};
 },titles);
 await page.goto(worldUrl());
 await page.waitForFunction(()=>(document.querySelector<HTMLElement>('#notionWorld') as any)?.sceneMetrics?.camera?.settled);
 const w=()=>page.evaluate(()=>(window as any).calls.filter((c:any)=>c.action==='browserShow').length);
 const nextShow=async(before:number)=>{await page.waitForFunction(n=>(window as any).calls.filter((c:any)=>c.action==='browserShow').length>n,before);return page.evaluate(()=>(window as any).calls.filter((c:any)=>c.action==='browserShow').at(-1));};
 const labels=()=>page.evaluate(()=>[...document.querySelectorAll('.browser-tabs .browser-tab')].map(t=>(t.hasAttribute('data-active')?'*':'')+t.querySelector('.browser-tab-pick').textContent));
 // The person goes somewhere in the tab in view once its page has opened (on Windows a zero timer can fire ~15ms late,
 // after the next step, and its report would take the tab back); the fake host keeps that address for the tab's page.
 const go=async(key:string,url:string)=>{await page.waitForFunction(()=>!(window as any).opening);await page.evaluate(([key,url,title])=>{const w=window as any;(w.kept||={})[key]=url;w.worldletBrowser({phase:'page',platform:'web',loading:false,url,title});},[key,url,titles[url]]);};
 const tabKeys=()=>page.evaluate(()=>[...document.querySelectorAll<HTMLElement>('.browser-tabs .browser-tab')].map(t=>t.dataset.tab));

 // The Browser always shows its strip: one tab and +, above the page and outside the page's rect.
 let shows=await w();
 await page.evaluate(()=>{location.hash='object=app-browser';});
 await page.locator('#notionContent[data-applet=browser] .browser-tabs').waitFor();
 let show=await nextShow(shows);
 assert.equal(show.applet,'browser');
 await page.waitForFunction(()=>document.querySelector('.browser-tabs .browser-tab-pick')?.textContent==='Google');
 assert.deepEqual(await labels(),['*Google']);
 const geometry=await page.evaluate(()=>{const strip=document.querySelector('.browser-tabs').getBoundingClientRect(),rect=(window as any).calls.filter((c:any)=>['browserShow','browserLayout'].includes(c.action)).at(-1).rect;return {stripBottom:strip.bottom,stripTop:strip.top,height:strip.height,rectY:rect.y};});
 assert.ok(geometry.rectY>=geometry.stripBottom,'the native page starts below the strip '+JSON.stringify(geometry));
 assert.ok(geometry.rectY-geometry.stripTop<=36,'the strip is slim '+JSON.stringify(geometry));
 await go('browser','https://flights.example.com/sfo');
 await page.waitForFunction(()=>document.querySelector('.browser-tabs .browser-tab-pick')?.textContent.startsWith('Flights'));

 // + opens a new tab on the home page as its own page; the first tab's page is kept.
 shows=await w();await page.locator('.browser-tab-new').click();show=await nextShow(shows);
 assert.equal(show.applet,'browser--2');assert.equal(show.url,'https://www.google.com/');assert.deepEqual(show.live,['browser']);
 await go('browser--2','https://hotels.example.com/sf');
 // ⌘T (the File menu's New Tab) is taken by the Browser.
 shows=await w();assert.equal(await page.evaluate(()=>(window as any).worldletBrowserNavigate('new-tab')),true);show=await nextShow(shows);
 assert.equal(show.applet,'browser--3');assert.deepEqual(show.live,['browser--2','browser']);
 await go('browser--3','https://cars.example.com/');
 await page.waitForFunction(()=>document.querySelectorAll('.browser-tabs .browser-tab').length===3&&document.querySelector('.browser-tab[data-active] .browser-tab-pick')?.textContent==='Car rental');
 assert.deepEqual(await labels(),['Flights to San Francisco · Compare fares','Hotels in San Francisco','*Car rental']);
 const long=await page.evaluate(()=>{const b=document.querySelector<HTMLElement>('.browser-tab .browser-tab-pick');return {cut:b.scrollWidth>b.clientWidth||getComputedStyle(b).textOverflow==='ellipsis'};});
 assert.ok(long.cut,'labels end in an ellipsis');
 if(shot){
  // The native page is drawn by the host, over the panel: a plain stand-in fills it for the picture.
  // The page's styles go through the CSSOM: the World's content policy refuses inline style attributes.
  await page.evaluate(()=>{
   const slot=document.querySelector<HTMLElement>('.browser-viewport'),box=(css:Partial<CSSStyleDeclaration>,text='')=>{const d=document.createElement('div');Object.assign(d.style,css);d.textContent=text;return d;};
   const body=box({padding:'28px 32px',font:'15px/1.6 system-ui',color:'#333'});
   body.append(box({font:'600 22px system-ui',marginBottom:'14px'},'Car rental · San Francisco'),box({height:'12px',width:'60%',background:'#eee',borderRadius:'6px',margin:'10px 0'}),
    box({height:'12px',width:'44%',background:'#eee',borderRadius:'6px',margin:'10px 0'}),box({height:'160px',background:'#f3f3f3',borderRadius:'10px',marginTop:'22px'}));
   slot.append(body);
  });
  fs.mkdirSync(path.dirname(shot),{recursive:true});await page.screenshot({path:shot});
  await page.evaluate(()=>{document.querySelector<HTMLElement>('.browser-viewport').innerHTML='';});
 }

 // Picking a kept tab brings its page back as it was.
 shows=await w();await page.locator('.browser-tab[data-tab=browser] .browser-tab-pick').click();show=await nextShow(shows);
 assert.equal(show.applet,'browser');assert.equal(show.resume,true);assert.equal(show.hold,undefined,'a kept page is not reopened');
 assert.deepEqual(show.live,['browser--3','browser--2']);
 await page.waitForFunction(()=>document.querySelector('.browser-tab[data-active]')?.getAttribute('data-tab')==='browser');
 // A fourth tab: the budget (two kept pages) releases the tab left longest ago, which reopens at its last address when picked.
 shows=await w();await page.locator('.browser-tab-new').click();show=await nextShow(shows);
 assert.equal(show.applet,'browser--4');assert.deepEqual(show.live,['browser','browser--3'],'the hotels tab is released');
 shows=await w();await page.locator('.browser-tab[data-tab="browser--2"] .browser-tab-pick').click();show=await nextShow(shows);
 assert.equal(show.applet,'browser--2');assert.equal(show.url,'https://hotels.example.com/sf','reopens at its last address');assert.equal(show.hold,true);
 // ⌘⇧[ and ⌘⇧] step through the tabs, round the ends.
 shows=await w();assert.equal(await page.evaluate(()=>(window as any).worldletBrowserNavigate('previous-tab')),true);show=await nextShow(shows);assert.equal(show.applet,'browser');
 shows=await w();await page.evaluate(()=>(window as any).worldletBrowserNavigate('previous-tab'));show=await nextShow(shows);assert.equal(show.applet,'browser--4','previous before the first is the last');
 shows=await w();await page.evaluate(()=>(window as any).worldletBrowserNavigate('next-tab'));show=await nextShow(shows);assert.equal(show.applet,'browser');

 // Closing: the active tab hands over to its right-hand neighbour; its page is no longer kept.
 shows=await w();await page.locator('.browser-tab[data-tab=browser] .browser-tab-close').click();show=await nextShow(shows);
 assert.equal(show.applet,'browser--2');assert.ok(!show.live.includes('browser'),'the closed tab\'s page goes');
 assert.deepEqual(await tabKeys(),['browser--2','browser--3','browser--4']);
 // ⌘W closes the active tab.
 shows=await w();assert.equal(await page.evaluate(()=>(window as any).worldletBrowserNavigate('close-tab')),true);show=await nextShow(shows);
 assert.equal(show.applet,'browser--3');assert.deepEqual(await tabKeys(),['browser--3','browser--4']);
 // Another tab's close keeps the page in view and releases that tab's kept page.
 shows=await w();await page.locator('.browser-tab[data-tab="browser--4"] .browser-tab-close').click();show=await nextShow(shows);
 assert.equal(show.applet,'browser--3');assert.equal(show.resume,true);assert.ok(!show.live.includes('browser--4'));
 // The last tab leaves one fresh tab on the home page, never an empty Browser.
 shows=await w();await page.locator('.browser-tab-close').click();show=await nextShow(shows);
 assert.equal(show.url,'https://www.google.com/');assert.notEqual(show.applet,'browser--3');assert.equal((await tabKeys()).length,1);
 await page.waitForFunction(()=>document.querySelector('.browser-tab[data-active] .browser-tab-pick')?.textContent==='Google');
 // A link the page opened for a new tab (target=_blank; the host reports `open-tab`) is the next tab, in front;
 // a background one (⌘-click) waits behind the page and opens at its address when picked.
 const openTab=(url:string,background:boolean)=>page.evaluate(([url,background])=>(window as any).worldletBrowser({phase:'open-tab',platform:'web',url,background}),[url,background] as const);
 const home=(await tabKeys())[0];
 shows=await w();await openTab('https://cars.example.com/',false);show=await nextShow(shows);
 assert.equal(show.url,'https://cars.example.com/');assert.deepEqual(show.live,[home]);
 const front=show.applet;assert.deepEqual(await tabKeys(),[home,front]);
 shows=await w();await openTab('https://hotels.example.com/sf',true);
 await page.waitForFunction(()=>document.querySelectorAll('.browser-tabs .browser-tab').length===3);
 assert.equal(await w(),shows,'a background tab opens no page yet');
 assert.equal(await page.evaluate(()=>document.querySelector<HTMLElement>('.browser-tab[data-active]')?.dataset.tab),front,'the page in view stays');
 const behind=(await tabKeys())[2];
 shows=await w();await page.locator(`.browser-tab[data-tab="${behind}"] .browser-tab-pick`).click();show=await nextShow(shows);
 assert.equal(show.applet,behind);assert.equal(show.url,'https://hotels.example.com/sf');
 for(const key of [behind,front]){shows=await w();await page.locator(`.browser-tab[data-tab="${key}"] .browser-tab-close`).click();await nextShow(shows);}
 assert.deepEqual(await tabKeys(),[home]);

 // The tabs stay over a reload, each at the last address the person reached.
 shows=await w();await page.locator('.browser-tab-new').click();show=await nextShow(shows);const second=show.applet;
 await go(second,'https://hotels.example.com/sf');
 await page.waitForFunction(()=>document.querySelector('.browser-tab[data-active] .browser-tab-pick')?.textContent==='Hotels in San Francisco');
 // Outside the Browser the tab keys are not taken: ⌘W closes the window there as before.
 await page.locator('.fox-action-left [data-slot=home]').click();
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld').dataset.depth==='overview');
 assert.equal(await page.evaluate(()=>(window as any).worldletBrowserNavigate('close-tab')),false);
 await page.reload();
 await page.waitForFunction(()=>(document.querySelector<HTMLElement>('#notionWorld') as any)?.sceneMetrics?.camera?.settled);

 // Website Applets keep one page: no strip.
 shows=await w();
 await page.evaluate(()=>{location.hash='object=app-youtube';});
 await page.locator('#notionContent[data-applet=youtube] .browser-viewport').waitFor();
 assert.equal(await page.locator('.browser-tabs').count(),0,'YouTube has no tab strip');
 // Each website Applet has its home page, the address it opens at; Home shows only away from it and goes back there
 // (owner request 2026-10-08: a kid on 小红书 could not get back).
 await nextShow(shows);
 const youtubeAt=async(url:string)=>{await page.waitForFunction(()=>!(window as any).opening);await page.evaluate(url=>(window as any).worldletBrowser({phase:'page',platform:'youtube',loading:false,url,title:'YouTube'}),url);};
 await youtubeAt('https://www.youtube.com/?app=desktop');
 assert.equal(await page.locator('.browser-home').isHidden(),true,'no Home on YouTube’s home page');
 await youtubeAt('https://www.youtube.com/watch?v=abc');
 assert.equal(await page.locator('.applet-bar-left>.browser-home:not([hidden])').count(),1,'Home stands on the left with Back and Forward (owner request 2026-10-08)');
 await page.locator('.browser-home:not([hidden])').click();
 await page.waitForFunction(()=>(window as any).calls.some((c:any)=>c.action==='browserCommand'&&c.operation==='open'&&c.args?.url==='https://www.youtube.com/'));
 await youtubeAt('https://www.youtube.com/');
 await page.locator('.browser-home[hidden]').waitFor({state:'attached'});

 shows=await w();
 await page.evaluate(()=>{location.hash='object=app-browser';});
 show=await nextShow(shows);
 assert.equal(show.applet,second);assert.equal(show.url,'https://hotels.example.com/sf');
 await page.waitForFunction(()=>document.querySelectorAll('.browser-tabs .browser-tab').length===2);
 assert.deepEqual(errors,[]);
 console.log('PASS Browser tabs: the strip above the page, + and ⌘T, kept and released pages by the budget, reopening at the last address, ⌘⇧[ ⌘⇧], closing hand-over and the last tab, kept over a reload; website Applets have none, and Home back to their own home page.');
});
