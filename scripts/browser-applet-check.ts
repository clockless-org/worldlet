import assert from 'node:assert/strict';
import {appletForWebsite} from '../ui/browser/applet-match.ts';
import {bundleScript,withBrowser} from './browser-test.ts';
for(const [url,key] of [['https://github.com/a/b','github'],['https://mail.google.com/mail/u/0','gmail'],['https://calendar.google.com','google-calendar'],['https://www.youtube.com/watch?v=1','youtube'],['https://team.notion.site/test','notion'],['https://worldlet.ai/games/play/snake/','random-game'],['https://www.nytimes.com/games/wordle/index.html','wordle']])assert.equal(appletForWebsite(url)?.key,key);
for(const url of ['https://youtube.com.evil.test','https://example.com/?url=https://github.com','https://accounts.google.com','https://evil.test/youtube.com','file:///github.com','https://worldlet.ai/','https://www.nytimes.com/2026/10/05/world/news.html','https://poki.com/'])assert.equal(appletForWebsite(url),null);
const bundle=await bundleScript({entryPoints:['ui/browser/browser-device.ts'],globalName:'BrowserPanel'});
await withBrowser(async browser=>{
 const page=await browser.newPage();await page.setContent('<main><dialog id="notionDialog"></dialog><section style="width:700px;height:600px"></section></main>');await page.addScriptTag({content:bundle});
 await page.evaluate(()=>{const root:any=document.querySelector('main'),content=document.querySelector('section');(window as any).installed=new Set();(window as any).opened=[];root.appletLayout={available:()=>true,has:id=>(window as any).installed.has(id),add:async id=>(window as any).installed.add(id)};(window as any).panel=(window as any).BrowserPanel.createBrowserPanel({root,content,native:{browser:{call:async()=>({})}},notify:()=>{},openApplet:id=>(window as any).opened.push(id)});(window as any).panel.mount('browser',{url:'https://github.com/test',platform:'web'});});
 await page.getByRole('button',{name:'Add GitHub to World'}).click();
 assert.deepEqual(await page.evaluate(()=>(window as any).opened),['app-github']);
 await page.getByRole('button',{name:'Open GitHub Applet'}).click();
 assert.equal(await page.evaluate(()=>(window as any).installed.size),1);
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:browser',{detail:{phase:'page',platform:'web',url:'https://example.com',loading:false}})));
 assert.equal(await page.locator('.browser-applet-offer:not(.browser-sign-in-offer)').isVisible(),false);
 await page.evaluate(()=>(window as any).panel.mount('gmail',{url:'https://mail.google.com',platform:'web'}));
 assert.equal(await page.locator('.browser-applet-offer:not(.browser-sign-in-offer)').isVisible(),false,'only generic Browser offers the switch');
 console.log('PASS website matching, one-click add/open, no duplicates, navigation clears offer.');
 // Make Applet at the top of the Browser (core/applets/site-applet.ts): any public site becomes an Applet; a made one opens.
 const made=await browser.newPage();await made.setContent('<main><dialog id="notionDialog"></dialog><section style="width:700px;height:600px"></section></main>');await made.addScriptTag({content:bundle});
 await made.evaluate(()=>{const w=window as any,root:any=document.querySelector('main'),content=document.querySelector('section');w.opened=[];w.made=[];w.notes=[];root.appletLayout={available:()=>true,has:()=>false,add:async()=>{}};
  w.panel=w.BrowserPanel.createBrowserPanel({root,content,native:{browser:{call:async()=>({})}},notify:m=>w.notes.push(m),openApplet:id=>w.opened.push(id),
   madeApplets:{find:url=>w.made.find(m=>new URL(url).hostname===m.host)||null,make:async page=>{w.asked=page;return {id:'app-site-abc123',title:'Excalidraw'};}}});
  w.panel.mount('browser',{url:'https://www.google.com/',platform:'web'});
  window.dispatchEvent(new CustomEvent('worldlet:browser',{detail:{phase:'page',platform:'web',url:'https://excalidraw.com/#room=1',title:'Excalidraw | Hand-drawn look & feel',loading:false}}));});
 await made.getByRole('button',{name:'Make Applet'}).click();
 assert.deepEqual(await made.evaluate(()=>[(window as any).asked,(window as any).notes]),[{title:'Excalidraw | Hand-drawn look & feel',url:'https://excalidraw.com/#room=1'},['Excalidraw is now an Applet in your World']]);
 await made.getByRole('button',{name:'Open Applet'}).click();
 assert.deepEqual(await made.evaluate(()=>(window as any).opened),['app-site-abc123'],'a site already made opens its Applet');
 await made.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:browser',{detail:{phase:'page',platform:'web',url:'https://github.com/a',title:'GitHub',loading:false}})));
 assert.equal(await made.locator('.browser-make-applet').isVisible(),false,'a catalog site keeps its own offer');
 // A game's site is not the game (owner Order 2026-10-06): worldlet.ai itself gets Make Applet, not the Random game.
 await made.evaluate(()=>window.dispatchEvent(new CustomEvent('worldlet:browser',{detail:{phase:'page',platform:'web',url:'https://worldlet.ai/',title:'Worldlet',loading:false}})));
 await made.getByRole('button',{name:'Make Applet'}).waitFor({state:'visible'});
 assert.equal(await made.locator('.browser-applet-offer:not(.browser-sign-in-offer)').isVisible(),false,'a game Applet does not claim the rest of its site');
 await made.evaluate(()=>(window as any).panel.mount('youtube',{url:'https://www.youtube.com/',platform:'web'}));
 assert.equal(await made.locator('.browser-make-applet').isVisible(),false,'only the generic Browser offers Make Applet');
 console.log('PASS Make Applet: any public site, the page sent as is, a made site opens, catalog sites and website Applets excluded.');
 // Refresh in the toolbar of every website Applet and the Browser (owner requests 2026-10-05 and 2026-10-09): it reloads the page shown.
 const fresh=await browser.newPage();await fresh.setContent('<style>.browser-viewport{height:400px}</style><main><dialog id="notionDialog"></dialog><div class="applet-bar-controls"></div><section style="width:700px;height:600px"></section></main>');await fresh.addScriptTag({content:bundle});
 await fresh.evaluate(()=>{const w=window as any,root:any=document.querySelector('main'),content=document.querySelector('section');w.commands=[];root.appletLayout={available:()=>true,has:()=>false,add:async()=>{}};
  w.panel=w.BrowserPanel.createBrowserPanel({root,content,native:{browser:{call:async()=>({}),command:async(operation:string)=>{w.commands.push(operation);return {ok:true};}}},notify:()=>{}});});
 assert.equal(await fresh.locator('.browser-refresh').isVisible(),false,'no Refresh before a page shows');
 for(const [key,url] of [['app-xiaohongshu','https://www.xiaohongshu.com/explore'],['browser','https://www.google.com/']]){
  await fresh.evaluate(([key,url])=>(window as any).panel.mount(key,{url,platform:'web'}),[key,url]);
  const button=fresh.locator('.browser-toolbar>.browser-refresh');
  await button.waitFor({state:'visible'});
  assert.equal(await fresh.getByRole('button',{name:'Refresh'}).count(),1,'one Refresh, named for screen readers: '+key);
  await button.click();
 }
 assert.deepEqual(await fresh.evaluate(()=>(window as any).commands),['reload','reload'],'Refresh reloads the page shown');
 await fresh.evaluate(()=>{document.querySelector('section')!.hidden=true;});
 await fresh.locator('.browser-refresh').waitFor({state:'hidden'});
 console.log('PASS Refresh: in the toolbar of website Applets and the Browser while a page shows, reloading it.');
});
