import assert from 'node:assert/strict';
import {mailMetadata} from '../ui/applets/gmail/metadata.ts';
import {coreAppletItems} from '../ui/world/applet-content.ts';
import {calendarWindow} from '../ui/applets/home-open.ts';
import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';
import {bundleScript} from './browser-test.ts';
assert.equal(mailMetadata({from:'',text:'From: Alice <alice@example.com>\nDate: Tue, 29 Sep 2026 10:00:00 GMT\n\nHi'}).from,'Alice <alice@example.com>');
assert.equal(mailMetadata({headers:[{name:'From',value:'Bob <bob@example.com>'}]}).from,'Bob <bob@example.com>');
assert.equal(mailMetadata({text:'Hello there\nFrom: not a sender header'}).from,'');
const items=coreAppletItems('gmail',[],[{id:'original',markdown:'From: Alice <alice@example.com>\n\nHello'},{worldItemId:'a',sourceProvider:'gmail',sourceId:'world-item:a',title:'Review draft',worldItemSources:[{provider:'gmail',id:'original'}]}]);assert.equal(items[0].record.from,'Alice <alice@example.com>');
assert.equal(calendarWindow(new Date(2028,1,29).getTime(),'month',0).length,29);
assert.equal(calendarWindow(new Date(2026,11,31).getTime(),'month',1)[0].getFullYear(),2027);
const result=await bundleScript({entryPoints:['ui/applets/home-open.ts'],globalName:'Home'});
const browser=await chromium.launch();try{
 const page=await browser.newPage({viewport:{width:1440,height:940},reducedMotion:'reduce'});
 await page.setContent('<main id="notionWorld" class="native-console" style="position:fixed;inset:0;background:#879a82"><section class="pixi-applet-stage"></section></main>');
 for(const file of ['dist/WorldletWeb/worldlet-ui.css','ui/shell/pixi-world.css'])await page.addStyleTag({content:await readFile(file,'utf8')});await page.addScriptTag({content:result});
 await page.evaluate(()=>{const w=window as any;w.picks=[];w.now=new Date(2026,8,28,12).getTime();w.state={mode:'week',offset:0};w.records=Array.from({length:11},(_,i)=>({id:String(i),title:'Design review '+i,start:new Date(2026,8,28,9+i%8).toISOString(),when:'Today',context:'Project plans',record:{list:'Work',folder:'Project notes'}}));w.render=(key='google-calendar')=>{const panel=document.querySelector('section');panel.replaceChildren();w.Home.renderHomeOpen(panel,{key,title:key==='google-calendar'?'Calendar':key==='apple-notes'?'Notes':'Reminders'},w.records,{now:w.now,connected:true},w.state,i=>w.picks.push(i.id),()=>w.render(key));};w.render();});
 assert.equal(await page.locator('.home-calendar-day').count(),7);
 await page.getByRole('button',{name:'Month',exact:true}).click();assert.equal(await page.locator('.home-calendar-day').count(),30);
 await page.getByRole('button',{name:'Next month'}).click();assert.equal(await page.locator('.home-calendar-day').count(),31);
 await page.getByRole('button',{name:'Day',exact:true}).click();assert.equal(await page.locator('.home-calendar-day').count(),1);
 await page.locator('.home-leaf').first().click();assert.equal(await page.evaluate(()=>(window as any).picks[0]),'0');
 for(const key of ['apple-notes','apple-reminders']){await page.evaluate(key=>(window as any).render(key),key);assert.equal(await page.locator('.home-leaf').count(),11);await page.locator('.home-leaf').last().scrollIntoViewIfNeeded();await page.locator('.home-leaf').last().click();assert.equal(await page.evaluate(()=>(window as any).picks.at(-1)),'10');}
 await page.setViewportSize({width:600,height:700});await page.evaluate(()=>{(window as any).state.mode='month';(window as any).render();});
 assert(await page.locator('.home-open-body').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'Narrow month fits without horizontal scrolling');
 await page.locator('.home-day-open').first().click();assert.equal(await page.locator('.home-calendar-day').count(),1);
 console.log('PASS source sender recovery; leap/year boundaries; day/week/month navigation; all notes/tasks reachable and selectable');
}finally{await browser.close();}
