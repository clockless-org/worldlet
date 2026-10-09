// Focus on website pages (core/browser/page-focus.ts): the page script (platform/bridge/page-focus.ts) in a real
// Chromium page, and the Focus switch in a website Applet's top bar (ui/browser/browser-device.ts). An article page
// shows only its article over the page and gives the page back when Focus turns off; an app page keeps its page with
// its distractions hidden; a page someone writes in is never an article; a single-page site's new address drops the
// old article. The switch, after Back, is pressed while Focus is on, sends the person's choice, and brings Focus back after Fox.
import assert from 'node:assert/strict';
import {pageFocusPlan} from '../core/browser/index.ts';
import {bundleScript,pageErrors,withBrowser} from './browser-test.ts';

const focus=await bundleScript({entryPoints:['platform/bridge/page-focus.ts'],target:'es2022'});
const panel=await bundleScript({entryPoints:['ui/browser/browser-device.ts'],globalName:'BrowserPanel'});
const paragraph=(n:number)=>`<p>Paragraph ${n} of the story. The river town rebuilt its old stone bridge this autumn, and the people who cross it every morning say the walk feels different now: slower, quieter, with the water loud underneath and the hills close on both sides.</p>`;
const ARTICLE=`<!doctype html><html><head><title>The bridge - Valley News</title></head><body>
<header><nav><a href="/">Home</a> <a href="/world">World</a> <a href="/sport">Sport</a></nav></header>
<aside class="rail"><h3>Most read</h3><ul>${'<li><a href="/x">Another story you might like</a></li>'.repeat(8)}</ul></aside>
<main><article><h1>The bridge</h1><p class="byline">By A. Writer</p>${Array.from({length:12},(_,i)=>paragraph(i+1)).join('')}</article></main>
<ins class="adsbygoogle" style="display:block;width:300px;height:250px">ad</ins><div id="onetrust-consent-sdk" style="position:fixed;inset:auto 0 0 0;height:120px">We use cookies</div>
<footer>${'<a href="/about">About</a> '.repeat(10)}</footer></body></html>`;
const APP=`<!doctype html><html><head><title>Feed</title><style>#secondary{width:300px;height:300px}.trends{width:300px;height:100px}</style></head><body><main id="feed">${'<div class="post">A post in the feed</div>'.repeat(20)}</main>
<div id="secondary"><div id="related">Recommended for you</div></div><div class="trends">Trending now</div><ins class="adsbygoogle">ad</ins></body></html>`;

await withBrowser(async browser=>{
 // An article page: only the article shows, in a closed shadow root over the page (opened here to read it).
 const page=await browser.newPage({viewport:{width:1100,height:800}});const errors=pageErrors(page);
 await page.addInitScript(()=>{const attach=Element.prototype.attachShadow;Element.prototype.attachShadow=function(options){return attach.call(this,{...options,mode:'open'});};});
 await page.route('https://news.example/**',route=>route.fulfill({contentType:'text/html',body:ARTICLE}));
 await page.goto('https://news.example/2026/bridge');
 await page.addScriptTag({content:focus});
 const plan=pageFocusPlan('https://news.example/2026/bridge')!;
 assert.deepEqual(await page.evaluate(plan=>(window as any).worldletPageFocus(plan),plan),{on:true,hidden:2,reader:true});
 const shown=await page.evaluate(()=>{const overlay=document.querySelector('worldlet-focus') as HTMLElement,root=overlay.shadowRoot!,r=overlay.getBoundingClientRect();
  return {cover:[r.x,r.y,r.width,r.height],title:root.querySelector('h1')?.textContent,site:root.querySelector('.site')?.textContent,paragraphs:root.querySelectorAll('p').length,
   text:root.textContent,overflow:getComputedStyle(document.documentElement).overflow,ad:getComputedStyle(document.querySelector('ins')!).display,consent:getComputedStyle(document.querySelector('#onetrust-consent-sdk')!).display};});
 assert.deepEqual(shown.cover,[0,0,1100,800],'the article covers the page');
 assert.match(shown.title!,/^The bridge/);
 assert.ok(shown.paragraphs>=12,'every paragraph of the article '+shown.paragraphs);
 assert.ok(!/Most read|Another story|We use cookies/.test(shown.text!),'none of the rail, the cookie wall or the footer');
 assert.deepEqual([shown.overflow,shown.ad,shown.consent],['hidden','none','none'],'the page behind stays still; ads and the cookie wall hide');
 if(process.env.WORLDLET_SHOTS)await page.screenshot({path:process.env.WORLDLET_SHOTS+'/page-focus-article.png'});
 // Off: the page is exactly as it was.
 assert.deepEqual(await page.evaluate(plan=>(window as any).worldletPageFocus({...plan,on:false}),plan),{on:false,hidden:0,reader:false});
 assert.deepEqual(await page.evaluate(()=>[!!document.querySelector('worldlet-focus'),document.documentElement.style.overflow,getComputedStyle(document.querySelector('ins')!).display,!!document.getElementById('worldlet-focus-style')]),[false,'','block',false],'Focus off gives the whole page back');
 // On again, then the single-page site moves to another address: the old article goes, the new one gets its look.
 await page.evaluate(plan=>(window as any).worldletPageFocus(plan),plan);
 await page.evaluate(()=>{history.pushState(null,'','/2026/next');document.querySelector('article')!.innerHTML='<p>Short.</p>';});
 await page.waitForFunction(()=>!document.querySelector('worldlet-focus'),null,{timeout:3000});
 await page.waitForTimeout(1600);
 assert.equal(await page.evaluate(()=>!!document.querySelector('worldlet-focus')),false,'a page without an article stays the page');
 assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('ins')!).display),'none','its rules stay in place');

 // An app page keeps its page: its site's rules (here YouTube's) and the saved ones hide what distracts.
 const app=await browser.newPage();const appErrors=pageErrors(app);
 await app.route('https://www.youtube.com/**',route=>route.fulfill({contentType:'text/html',body:APP}));
 await app.goto('https://www.youtube.com/');await app.addScriptTag({content:focus});
 const appPlan={...pageFocusPlan('https://www.youtube.com/')!};appPlan.hide=[...appPlan.hide,'#secondary','.trends','div[','body'];
 const result=await app.evaluate(plan=>(window as any).worldletPageFocus(plan),appPlan);
 assert.deepEqual(result,{on:true,hidden:4,reader:false},'#related, #secondary, .trends and the ad; a broken rule and body are skipped');
 assert.deepEqual(await app.evaluate(()=>['#feed','#secondary','.trends'].map(s=>getComputedStyle(document.querySelector(s)!).display)),['block','none','none']);
 assert.equal(await app.evaluate(()=>!!document.querySelector('worldlet-focus')),false,'no article on an app site');
 // Fox's outline of the page lists its parts as the site draws them (Focus's rules set aside), each with a selector Fox
 // can save, and opens up the part holding most of the page instead of listing it.
 const outline=await app.evaluate(()=>(window as any).worldletPageFocus.outline());
 const listed=outline.items.map((item:any)=>item.selector);
 assert.ok(listed.includes('#secondary')&&listed.includes('div.trends'),'the side parts, also ones Focus hides now '+JSON.stringify(listed));
 assert.ok(!listed.includes('#feed'),'not the part with most of the page '+JSON.stringify(listed));
 assert.ok(outline.items.every((item:any)=>item.box.length===4&&typeof item.share==='number'&&typeof item.text==='string'));
 assert.equal(await app.evaluate(()=>getComputedStyle(document.querySelector('#secondary')!).display),'none','and the rules are back after');

 // Where the person writes, the page stays the page even on an article site.
 const editor=await browser.newPage();
 await editor.route('https://blog.example/**',route=>route.fulfill({contentType:'text/html',body:ARTICLE.replace('<article>','<article contenteditable="true">')}));
 await editor.goto('https://blog.example/draft');await editor.addScriptTag({content:focus});
 assert.equal((await editor.evaluate(plan=>(window as any).worldletPageFocus(plan),pageFocusPlan('https://blog.example/draft')!)).reader,false,'an editor is never an article');
 assert.deepEqual([...errors,...appErrors],[]);
 console.log('PASS page focus script: the article alone over a still page and the whole page back when off, app sites keep their page minus their rules, editors stay pages, a new address drops the old article, and the outline lists the side parts for Fox.');

 // The Focus switch, at the end of the page's toolbar (owner request 2026-10-09), after Back, Forward, Refresh, Home and the address.
 const bar=await browser.newPage();await bar.setContent('<style>.browser-viewport{height:400px}</style><main><dialog id="notionDialog"></dialog><div class="applet-bar-left"><button id="notionBack">Back</button></div><div class="applet-bar-controls"></div><section style="width:700px;height:600px"></section></main>');await bar.addScriptTag({content:panel});
 await bar.evaluate(()=>{const w=window as any,root:any=document.querySelector('main'),content=document.querySelector('section');w.commands=[];w.answer={ok:true,on:false,reader:false};root.appletLayout={available:()=>true,has:()=>false,add:async()=>{}};
  w.panel=w.BrowserPanel.createBrowserPanel({root,content,native:{browser:{call:async()=>({}),command:async(operation:string,args:any)=>{w.commands.push([operation,args]);return w.answer;}}},notify:()=>{}});
  w.panel.mount('browser',{url:'https://news.example/2026/bridge',platform:'web'});});
 const button=bar.locator('.browser-toolbar>.browser-focus');
 await bar.locator('.browser-refresh').waitFor({state:'visible'});
 assert.equal(await button.isVisible(),false,'no switch until the host says what Focus does on the page');
 assert.equal(await button.evaluate(b=>(b as HTMLElement).hidden),false,'its place is kept meanwhile, so nothing beside it jumps when it shows');
 const report=(detail:object)=>bar.evaluate(detail=>window.dispatchEvent(new CustomEvent('worldlet:browser',{detail:{phase:'focus',platform:'web',...detail}})),detail);
 await report({available:true,on:true,reader:true});
 await button.waitFor({state:'visible'});
 assert.deepEqual(await bar.evaluate(()=>[...document.querySelectorAll('.browser-toolbar>button:not([hidden])')].map(b=>b.textContent)),['Back','Forward','Refresh','Home','Focus'],'Focus ends the toolbar');
 assert.equal(await bar.getByRole('button',{name:'Focus'}).getAttribute('aria-pressed'),'true','pressed while Focus is on');
 assert.match((await button.getAttribute('title'))!,/only the article/);
 // The same Applet drawn again (a World update re-visits it) keeps the bar as it is: nothing flashes off
 // and on (owner report 2026-10-06, YouTube).
 const flashes=await bar.evaluate(async()=>{const w=window as any,seen:string[]=[];
  const watch=new MutationObserver(list=>{for(const m of list)seen.push((m.target as HTMLElement).className+' '+m.attributeName);});
  for(const e of document.querySelectorAll('.browser-focus,.browser-refresh,.browser-back,.browser-forward'))watch.observe(e,{attributes:true,attributeFilter:['hidden','style']});
  document.querySelector('section')!.replaceChildren();w.panel.mount('browser',{url:'https://news.example/2026/bridge',platform:'web'});
  await new Promise(r=>setTimeout(r,200));watch.disconnect();return seen;});
 assert.deepEqual(flashes,[],'a re-render of the open Applet leaves Back, Forward, Focus and Refresh in place');
 assert.equal(await button.isVisible(),true);
 await button.click();
 await bar.waitForFunction(()=>document.querySelector('.browser-focus')!.getAttribute('aria-pressed')==='false');
 // Paused while Fox works on the page: a press turns it back on.
 await bar.evaluate(()=>{(window as any).answer={ok:true,on:true,reader:false};});
 await report({available:true,on:true,paused:true});
 assert.equal(await button.getAttribute('aria-pressed'),'false');assert.match((await button.getAttribute('title'))!,/while Fox works/);
 await button.click();
 await bar.waitForFunction(()=>document.querySelector('.browser-focus')!.getAttribute('aria-pressed')==='true');
 assert.deepEqual(await bar.evaluate(()=>(window as any).commands),[['focus',{on:false}],['focus',{on:true}]],'the person\'s choice goes to the host');
 // Fox reads the site's outline and saves the parts to hide through the same panel, without navigating.
 await bar.evaluate(async()=>{const w=window as any;w.commands=[];await w.panel.agent({operation:'outline'});await w.panel.agent({operation:'focus',hide:['#secondary']});});
 assert.deepEqual(await bar.evaluate(()=>(window as any).commands),[['outline',{}],['focus',{hide:['#secondary']}]],'Fox\'s outline and rules go to the host');
 await report({available:false,on:false});
 await button.waitFor({state:'hidden'});
 console.log('PASS Focus switch: at the end of the toolbar once the host reports, pressed while on, the choice sent, back on after Fox, gone where Focus does not apply.');
});
