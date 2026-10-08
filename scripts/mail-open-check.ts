import assert from 'node:assert/strict';
import {mailMatters,mailCategory} from '../ui/applets/gmail/open.ts';
import {coreAppletItems} from '../ui/world/applet-content.ts';
const raw=(id,threadId)=>({id,title:'Same subject',record:{id,title:'Same subject',threadId}});
const groups=mailMatters([raw('a','one'),raw('b','one'),raw('c','two'),raw('d',undefined)]);
assert.equal(groups.length,3);assert.equal(groups[0].messageCount,2);assert.equal(groups[2].messageCount,1);
const projected=coreAppletItems('gmail',[{id:'a',threadId:'one',title:'Original subject'},{id:'b',threadId:'one',title:'Re: Original subject'}],[{worldItemId:'task',sourceProvider:'gmail',sourceId:'world-item:task',title:'Reply about the proposal',worldItemSources:[{provider:'gmail',id:'thread:one'}],worldItemSignal:{priority:'high'},worldItemKind:'task',worldItemStatus:'open'}]);
assert.equal(projected.length,1);assert.equal(projected[0].record.title,'Original subject');assert.equal(projected[0].record.messageCount,2);
console.log('PASS mail matters: exact thread identity, source subject, multi-message layers, no title-based grouping.');

assert.equal(mailCategory({record:{labelIds:['CATEGORY_PROMOTIONS']}}),'promotions');
assert.equal(mailCategory({record:{labelIds:['SPAM','CATEGORY_PROMOTIONS']}}),'spam');
assert.equal(mailCategory({attention:{state:'task'},record:{labelIds:['SPAM']}}),'attention');
assert.equal(mailCategory({record:{title:'Special offer'}}),'other','never infer spam from a title');

// Exercise the actual Open renderer with more than nine attention threads.
const {build}=await import('esbuild'),{readFile}=await import('node:fs/promises'),{launchTestBrowser}=await import('./browser-test.ts');
const bundle=await build({entryPoints:['ui/applets/gmail/open.ts'],bundle:true,format:'iife',globalName:'MailOpen',write:false});
const browser=await launchTestBrowser();
try{
 const page=await browser.newPage({viewport:{width:1440,height:950}});
 await page.setContent('<div id="notionWorld" style="position:absolute;inset:0;background:#b8c1a0;font-family:system-ui"><section class="pixi-applet-stage" data-installation="true" data-applet="gmail"></section></div>');
 await page.addStyleTag({content:await readFile('ui/shell/pixi-world.css','utf8')});
 await page.addScriptTag({content:bundle.outputFiles[0].text});
 const artRoot='resources/styles/builtin/assets/applets/gmail/mail-parts/';
 await page.evaluate(parts=>(window as any).__WORLDLET_25D_ASSETS__={mailParts:Object.fromEntries(Object.entries(parts).map(([key,data])=>[key,URL.createObjectURL(new Blob([Uint8Array.from(atob(data.split(',')[1]),c=>c.charCodeAt(0))],{type:'image/png'}))]))},{board:'data:image/png;base64,'+(await readFile(artRoot+'wall-board-v5.png')).toString('base64'),'pinned-envelope':'data:image/png;base64,'+(await readFile(artRoot+'pinned-envelope-v2.png')).toString('base64')});
 await page.evaluate(()=>{const items=Array.from({length:13},(_,i)=>({id:String(i),title:['Review the launch plan','Confirm Friday’s meeting','Feedback on the proposal'][i%3],attention:i<12?{state:'task',priority:'high'}:null,record:{title:['Review the launch plan','Confirm Friday’s meeting','Feedback on the proposal'][i%3],from:['Alice Chen <alice@example.com>','Sam Miller <sam@example.com>','Jamie Lee <jamie@example.com>'][i%3],date:new Date(Date.now()-3600000*(i+1)).toISOString(),threadId:String(i)}}));(window as any).MailOpen.renderMailOpen(document.querySelector('section'),items,{connected:true},{},item=>(window as any).picked=item.id,()=>{});});
 assert.equal(await page.locator('.pixi-stage-item').count(),9);
 assert.equal(await page.locator('.mail-open-piles,.mail-board-pages').count(),0);
 assert.equal(await page.getByRole('heading',{name:'Needs Attention'}).count(),1);
 await page.locator('.pixi-stage-item').first().click();assert.equal(await page.evaluate(()=>(window as any).picked),'0');
 const fit=await page.locator('.mail-open-desk').evaluate((desk:HTMLElement)=>desk.scrollHeight<=desk.clientHeight&&desk.scrollWidth<=desk.clientWidth);assert.ok(fit,'nine letters fit without scrolling');
 await page.locator('.mail-board-paint').waitFor();
 await page.evaluate(async()=>{for(const img of document.querySelectorAll<HTMLImageElement>('.mail-board-paint,.mail-envelope-paint'))await img.decode();});
 await page.screenshot({path:'/tmp/mail-attention-board.png'});
 for(const width of [1440,1000,600]){
  await page.setViewportSize({width,height:950});
  assert.ok(await page.locator('.pixi-stage-item').evaluateAll(cards=>cards.every(card=>{
   const stamp=card.querySelector('.mail-envelope-avatar'),paint=card.querySelector('.mail-envelope-front'),a=stamp.getBoundingClientRect(),b=paint.getBoundingClientRect(),css=getComputedStyle(stamp);
   const overlap=selector=>{const r=card.querySelector(selector).getBoundingClientRect();return a.left<r.right&&a.right>r.left&&a.top<r.bottom&&a.bottom>r.top;};
   return stamp.parentElement===paint&&css.borderTopWidth==='0px'&&css.outlineStyle==='none'&&a.left>b.left+b.width*.8&&!overlap('strong')&&!overlap('.mail-letter-sender');
  })),'one painted stamp, portrait inset and text do not overlap at '+width);
 }
 await page.setViewportSize({width:1440,height:950});
 await page.screenshot({path:'/tmp/mail-stamp-fixed.png'});
 await page.evaluate(()=>{const panel=document.querySelector('section');panel.replaceChildren();(window as any).MailOpen.renderMailOpen(panel,[],{connected:true},{},()=>{},()=>{});});
 assert.equal(await page.locator('.mail-idle-pin').count(),0);
 assert.equal(await page.locator('.mail-board-empty,.mail-board-note').count(),0);
 console.log('PASS Mail attention board: nine threads, no bins, no scrolling, selectable envelopes.');
}finally{await browser.close();}
