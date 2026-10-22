/** Calendar's measured papers retain actual local-event gestures and synced-record boundaries. */
import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {build} from 'esbuild';import {launchTestBrowser,pageErrors} from './browser-test.ts';
const bundle=await build({stdin:{contents:"export {mountAppletScene} from './ui/applets/scene/applet-scene.ts';export {renderHomeOpen,localCalendarItems} from './ui/applets/home-open.ts';",resolveDir:process.cwd(),loader:'ts'},bundle:true,format:'iife',globalName:'Calendar',write:false});
const browser=await launchTestBrowser();try{
 const page=await browser.newPage({viewport:{width:1500,height:844},reducedMotion:'reduce'}),errors=pageErrors(page,{console:true});
 await page.setContent('<!doctype html><title>Calendar paper geometry</title><main id="notionWorld" class="native-console" style="position:fixed;inset:0"><div id="host" class="pixi-applet-stage" data-scene="google-calendar" data-applet="google-calendar" style="position:absolute;inset:0"></div></main>');
 await page.addStyleTag({content:(await Promise.all(['dist/WorldletWeb/worldlet-ui.css','ui/frame/pixi-world.css','ui/applets/scene/applet-scene.css','ui/applets/google-calendar/open.css'].map(p=>readFile(p,'utf8')))).join('\n')});await page.addScriptTag({content:bundle.outputFiles[0].text});
 await page.evaluate(()=>{
  const w=window as any;w.now=+new Date(2026,9,8,12);w.state={mode:'week',offset:0};w.picks=[];w.saved=[];
  w.events=[{id:'read',title:'Reading',start:new Date(2026,9,8,10).toISOString(),end:new Date(2026,9,8,11).toISOString(),allDay:false,repeat:'none',skip:[],alert:10,location:'',notes:'',createdAt:w.now/1000,updatedAt:w.now/1000}];
  w.synced=[{id:'source',title:'Team session',start:new Date(2026,9,9,10).toISOString(),end:new Date(2026,9,9,11).toISOString(),record:{calendar:'Work calendar'}}];
  w.value={now:w.now,sample:true,connected:true,calendar:{save:e=>{w.saved.push(e);w.events=[...w.events.filter(x=>x.id!==e.id),e];w.render();},remove:id=>{w.events=w.events.filter(x=>x.id!==id);w.render();}}};
  w.scene=w.Calendar.mountAppletScene(document.getElementById('host'),'google-calendar',{shell:document.getElementById('notionWorld'),source:{registration:{imageSize:[1500,844],sha256:'0'.repeat(64),regions:[
   {id:'main',role:'primary',rect:[.08,.24,.6,.56],quad:[[.06,0],[1,.03],[.98,1],[0,.96]],material:'paper'},
   {id:'heading',role:'secondary',rect:[.08,.08,.25,.12],material:'paper'},
   {id:'toolbar',role:'secondary',rect:[.36,.08,.58,.12],material:'paper'},
   {id:'details',role:'secondary',rect:[.71,.24,.25,.34],material:'paper'},
   {id:'status',role:'secondary',rect:[.71,.64,.25,.14],material:'paper'}],companion:[.1,.85,.55,.1]}}});
  w.render=()=>{w.scene.primary.element.replaceChildren();w.Calendar.renderHomeOpen(w.scene.primary.element,{key:'google-calendar',title:'Calendar'},[...w.Calendar.localCalendarItems(w.events),...w.synced],w.value,w.state,item=>w.picks.push(item.id),w.render,w.scene.regions);};w.render();
 });
 await page.getByRole('heading',{name:'Reading',exact:true}).waitFor();assert.equal(await page.locator('.home-calendar-day').count(),7);assert.equal(await page.locator('.calendar-region').count(),5);
 const point=(day:string,hour:number,offset=0)=>page.evaluate(({day,hour,offset})=>{const e=document.querySelector('.home-calendar-day[data-date="'+day+'"] .home-calendar-hours')!,m=document.createElement('i');m.style.cssText='position:absolute;left:28px;top:'+(hour*50+offset)+'px;width:0;height:0;pointer-events:none';e.append(m);const r=m.getBoundingClientRect();m.remove();return {x:r.x,y:r.y};},{day,hour,offset});
 const drag=async(a:{x:number;y:number},b:{x:number;y:number})=>{await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:8});await page.mouse.up();};
 const date=(d:number,h:number)=>page.evaluate(([d,h])=>new Date(2026,9,d,Math.floor(h),(h%1)*60).toISOString(),[d,h]);
 const priorX=await page.locator('.home-open-body').evaluate(e=>{const x=e.scrollLeft;e.scrollLeft=0;return x;});
 const monday=await point('2026-10-05',10,8);assert.equal(await page.evaluate(p=>(document.elementFromPoint(p.x,p.y)?.closest('.home-calendar-day') as HTMLElement)?.dataset.date,monday),'2026-10-05','earlier weekdays remain reachable by scrolling');
 await page.locator('.home-open-body').evaluate((e,x)=>{e.scrollLeft=x;},priorX);
 await drag(await point('2026-10-08',10,8),await point('2026-10-08',11,8));assert.equal(await page.evaluate(()=>(window as any).events[0].start),await date(8,11));
 await drag(await point('2026-10-08',11,8),await point('2026-10-10',12,8));assert.equal(await page.evaluate(()=>(window as any).events[0].start),await date(10,12));
 await drag(await point('2026-10-10',13,-2),await point('2026-10-10',13.5));assert.equal(await page.evaluate(()=>(window as any).events[0].end),await date(10,13.5));
 await drag(await point('2026-10-09',13),await point('2026-10-09',14));await page.getByLabel('Title',{exact:true}).fill('New practice');await page.getByRole('button',{name:'Done',exact:true}).click();assert.equal(await page.evaluate(()=>(window as any).events.find(e=>e.title==='New practice').start),await date(9,13));
 assert.equal(await page.locator('.calendar-detail-title').innerText(),'New practice','a saved new event stays selected');
 const count=await page.evaluate(()=>(window as any).saved.length);await page.locator('.home-calendar-event[data-item-id=source]').click();assert.equal(await page.locator('.calendar-detail-title').innerText(),'Team session');await page.getByRole('button',{name:'Original',exact:true}).click();assert.deepEqual(await page.evaluate(()=>(window as any).picks),['source']);assert.equal(await page.evaluate(()=>(window as any).saved.length),count,'source event remains read-only');
 await page.getByRole('button',{name:'Next week',exact:true}).click();assert.equal(await page.locator('.home-calendar-day').first().getAttribute('data-date'),'2026-10-12');await page.getByRole('button',{name:'Today',exact:true}).click();
 await page.getByRole('button',{name:'Day',exact:true}).click();assert.equal(await page.locator('.home-calendar-day').count(),1);await page.getByRole('button',{name:'Month',exact:true}).click();assert.equal(await page.locator('.home-calendar-day').count(),31);
 // Overlapping records must not wrap their title over the time or bleed out of the timed card.
 await page.evaluate(()=>{const w=window as any;w.state={mode:'week',offset:0};w.synced=[];
  const base=w.events[0];w.events=[{...base,id:'long-title',title:'A long planning session with several participants',start:new Date(2026,9,8,10).toISOString(),end:new Date(2026,9,8,11).toISOString()},{...base,id:'overlap',title:'A second overlapping event',start:new Date(2026,9,8,10).toISOString(),end:new Date(2026,9,8,11).toISOString()},{...base,id:'brief',title:'Brief check-in',start:new Date(2026,9,8,12).toISOString(),end:new Date(2026,9,8,12,15).toISOString()},{...base,id:'medium',title:'Forty-five minute review',start:new Date(2026,9,8,13).toISOString(),end:new Date(2026,9,8,13,45).toISOString()}];w.render();
 });
 const long=page.locator('.home-calendar-event[data-item-id="local:long-title"]');
 const labelBounds=await long.evaluate(e=>{const title=e.querySelector('strong')!,time=e.querySelector('small')!,text=e.querySelector('.home-leaf-text')!;return {titleHeight:title.clientHeight,lineHeight:parseFloat(getComputedStyle(title).lineHeight),textHeight:text.scrollHeight,available:e.clientHeight-parseFloat(getComputedStyle(e).paddingTop)-parseFloat(getComputedStyle(e).paddingBottom),timeVisible:time.checkVisibility(),title:title.textContent,tooltip:e.getAttribute('title')};});
 assert.ok(labelBounds.titleHeight<=labelBounds.lineHeight+1,'overlapping titles occupy one line');assert.ok(labelBounds.textHeight<=labelBounds.available+1,'title and time fit inside the hour card');assert.equal(labelBounds.timeVisible,true);assert.equal(labelBounds.title,labelBounds.tooltip,'full title survives visual ellipsis');
 for(const id of ['brief','medium']){const card=page.locator('.home-calendar-event[data-item-id="local:'+id+'"]');assert.equal(await card.locator('small').isVisible(),false,'short cards leave room for the title');assert.ok(await card.evaluate(e=>e.querySelector('strong')!.clientHeight<=e.clientHeight),'short title fits the timed card');}
 await long.click();assert.equal(await page.locator('.calendar-detail-title').innerText(),labelBounds.title);await page.getByRole('button',{name:'Edit local event',exact:true}).click();assert.equal(await page.getByLabel('Title',{exact:true}).inputValue(),labelBounds.title);await page.keyboard.press('Escape');
 await page.evaluate(()=>(window as any).scene.destroy());assert.equal(await page.locator('.applet-scene').count(),0);assert.deepEqual(errors,[]);
 console.log('PASS projected Calendar: exact hour, cross-day drag, resize, create/edit, source boundary, dates, modes, overlapping/short card text and disposal at 1500 × 844');
}finally{await browser.close();}
