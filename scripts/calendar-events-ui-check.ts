// Calendar's own events (ui/applets/google-calendar/applet.md#local-events), as in Apple Calendar: drag on empty
// time to make one, drag it to another time and day, drag its lower edge, edit it, delete it (and undo), make one
// with + or a double-click, move an all-day one in Month, repeat one weekly and choose its alert. Synced events stay read only.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {bundleScript} from './browser-test.ts';
const result=await bundleScript({entryPoints:['ui/applets/home-open.ts'],globalName:'Home'});
const browser=await chromium.launch(process.platform==='win32'?{channel:'msedge'}:{});
try{
 const page=await browser.newPage({viewport:{width:1280,height:850},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setContent('<main id="notionWorld" class="native-console" style="position:fixed;inset:0;background:#879a82"><section class="pixi-applet-stage home-open" data-installation="true" data-animated-device="true" style="position:absolute;inset:10% 35% 8% 4%"></section></main>');
 for(const file of ['dist/WorldletWeb/worldlet-ui.css','ui/shell/pixi-world.css'])await page.addStyleTag({content:await readFile(file,'utf8')});await page.addScriptTag({content:result});
 await page.evaluate(()=>{const w=window as any;w.now=new Date(2026,8,28,10,20).getTime();w.state={mode:'week',offset:0};w.events=[];w.picks=[];
  w.synced=[{id:'s1',title:'Design review',start:new Date(2026,8,28,9).toISOString(),record:{end:new Date(2026,8,28,10,30).toISOString()}},{id:'s2',title:'Standup',start:new Date(2026,8,28,10).toISOString()},{id:'s3',title:'Holiday',start:'2026-09-30',allDay:true}];
  // Like the World: a save or delete redraws through the new list at once.
  w.render=()=>{const panel=document.querySelector('section');panel.replaceChildren();w.Home.renderHomeOpen(panel,{key:'google-calendar',title:'Calendar'},[...w.synced,...w.Home.localCalendarItems(w.events)],{now:w.now,connected:true,calendar:{save:e=>{w.events=[...w.events.filter(x=>x.id!==e.id),e];w.render();},remove:id=>{w.events=w.events.filter(x=>x.id!==id);w.render();}}},w.state,i=>w.picks.push(i.id),()=>w.render());};w.render();});
 const events=()=>page.evaluate(()=>(window as any).events.map(e=>({title:e.title,start:e.start,end:e.end,allDay:e.allDay})));
 const at=(d:number,h:number,m=0)=>page.evaluate(([d,h,m])=>new Date(2026,d>20?8:9,d,h,m).toISOString(),[d,h,m]);
 const hours=(date:string)=>page.locator(`.home-calendar-day[data-date="${date}"] .home-calendar-hours`);
 const scrollTo=(hour:number)=>page.locator('.home-open-body').evaluate((e,h)=>{e.scrollTop=h*40;},hour);
 assert.equal(await page.locator('.home-calendar-day').count(),7);
 assert.equal(await page.locator('.home-calendar-gutter').count(),1,'Week is a time grid with an hour gutter');
 const lanes=await page.locator('.home-calendar-event').evaluateAll(els=>els.map(e=>Math.round(e.getBoundingClientRect().width)));
 assert.ok(lanes.length===2&&lanes.every(w=>w<60),'Overlapping events share the day side by side: '+lanes);
 assert.equal(await page.locator('.home-calendar-allday .home-leaf').count(),1,'All-day events sit above the hours');

 // Drag on empty time: Wednesday 1:00–2:30 PM, then name it.
 await scrollTo(12);let box=(await hours('2026-09-30').boundingBox())!;
 await page.mouse.move(box.x+20,box.y+13*40+2);await page.mouse.down();await page.mouse.move(box.x+20,box.y+14*40,{steps:4});
 assert.equal(await page.locator('.home-calendar-draft').count(),1,'The dragged time shows while dragging');
 await page.mouse.move(box.x+20,box.y+14.5*40,{steps:4});await page.mouse.up();
 assert.deepEqual(await events(),[{title:'New Event',start:await at(30,13),end:await at(30,14,30),allDay:false}]);
 assert.ok(await page.locator('.home-event-editor .home-event-title').evaluate(e=>e===document.activeElement),'The new event opens for its title');
 await page.keyboard.type('Dentist');await page.keyboard.press('Enter');
 assert.equal(await page.locator('.home-event-editor').count(),0);
 assert.equal((await events())[0].title,'Dentist');
 const mine=page.locator('.home-leaf[data-local=true]');
 assert.equal(await mine.getAttribute('aria-label'),'Dentist · On this computer','Own events say where they live');

 // Move it to Thursday 3 PM, then stretch it to 5 PM.
 await scrollTo(12);let ev=(await mine.boundingBox())!;box=(await hours('2026-10-01').boundingBox())!;
 await page.mouse.move(ev.x+20,ev.y+6);await page.mouse.down();await page.mouse.move(box.x+20,box.y+15*40+6,{steps:6});await page.mouse.up();
 assert.deepEqual((await events())[0],{title:'Dentist',start:await at(1,15),end:await at(1,16,30),allDay:false},'Dragging moves the event in time and day');
 assert.equal(await page.locator('.home-event-editor').count(),0,'A drag does not open the editor');
 await scrollTo(14);ev=(await mine.boundingBox())!;box=(await hours('2026-10-01').boundingBox())!;
 await page.mouse.move(ev.x+20,ev.y+ev.height-3);await page.mouse.down();await page.mouse.move(ev.x+20,box.y+17*40,{steps:5});await page.mouse.up();
 assert.equal((await events())[0].end,await at(1,17),'The lower edge changes the end');

 // Synced events are read only: dragging one changes nothing, clicking opens it.
 await scrollTo(8);const theirs=page.locator('.home-calendar-event:not([data-local])').first();const tb=(await theirs.boundingBox())!;
 await page.mouse.move(tb.x+10,tb.y+6);await page.mouse.down();await page.mouse.move(tb.x+10,tb.y+120,{steps:4});await page.mouse.up();
 assert.equal(await page.locator('.home-calendar-draft').count(),0);assert.equal((await events()).length,1);
 await theirs.click();assert.deepEqual(await page.evaluate(()=>(window as any).picks),['s1']);

 // Edit: location, all-day; Esc leaves it as it was; Delete removes; Undo brings it back; the Delete key too.
 await scrollTo(15);await mine.click();await page.getByLabel('Location').fill('Main St');await page.keyboard.press('Escape');
 assert.equal((await events())[0].title,'Dentist');assert.equal(await page.evaluate(()=>(window as any).events[0].location),'','Esc keeps the event as it was');
 await scrollTo(15);await mine.click();await page.getByLabel('Location').fill('Main St');await page.getByRole('button',{name:'Done'}).click();
 assert.equal(await page.evaluate(()=>(window as any).events[0].location),'Main St');
 await scrollTo(15);await mine.click();await page.getByRole('button',{name:'Delete'}).click();
 assert.equal((await events()).length,0);
 await page.getByRole('button',{name:'Undo'}).click();assert.equal((await events())[0].title,'Dentist','Undo brings a deleted event back');
 await scrollTo(15);await mine.focus();await page.keyboard.press('Delete');assert.equal((await events()).length,0,'The Delete key removes the selected event');

 // + makes an hour from the next full hour today; a double-click on empty time makes an hour there.
 await page.getByRole('button',{name:'New event'}).click();await page.keyboard.press('Escape');
 assert.deepEqual((await events())[0],{title:'New Event',start:await at(28,11),end:await at(28,12),allDay:false});
 await scrollTo(16);box=(await hours('2026-10-02').boundingBox())!;await page.mouse.dblclick(box.x+20,box.y+18*40+10);await page.keyboard.press('Escape');
 assert.equal((await events())[1].start,await at(2,18),'A double-click makes an event at that hour');

 // Month: a double-click makes an all-day event; dragging it moves it to another day.
 await page.getByRole('button',{name:'Month',exact:true}).click();
 await page.locator('.home-calendar-day[data-date="2026-09-15"]').dblclick({position:{x:8,y:8}});await page.keyboard.type('Trip');await page.keyboard.press('Enter');
 const trip=page.locator('.home-leaf[data-local=true]',{hasText:'Trip'}),from=(await trip.boundingBox())!,to=(await page.locator('.home-calendar-day[data-date="2026-09-17"]').boundingBox())!;
 await page.mouse.move(from.x+10,from.y+6);await page.mouse.down();await page.mouse.move(to.x+20,to.y+20,{steps:6});await page.mouse.up();
 assert.deepEqual((await events()).find(e=>e.title==='Trip'),{title:'Trip',start:'2026-09-17',end:'2026-09-17',allDay:true});
 await page.getByRole('button',{name:'Week',exact:true}).click();await page.getByRole('button',{name:'Previous week'}).click();await page.getByRole('button',{name:'Previous week'}).click();
 assert.equal(await page.locator('.home-calendar-allday .home-leaf[data-local=true]').count(),1,'The all-day event shows in its week');
 await page.getByRole('button',{name:'Today'}).click();assert.equal(await page.locator('.home-calendar-day[data-today=true]').count(),1);

 // Repeat: a weekly event shows every week; moving one time moves them all; Delete can take just that time, and Undo
 // brings it back. Alerts: 10 minutes before or none, and none for all-day events.
 const named=(title:string)=>page.evaluate(t=>(window as any).events.find(e=>e.title===t),title);
 const first=await page.evaluate(s=>(window as any).events.find(e=>e.start===s).id,await at(28,11));
 await scrollTo(10);await page.locator(`.home-leaf[data-item-id="local:${first}"]`).click();
 assert.equal(await page.getByLabel('Repeat').inputValue(),'none');assert.equal(await page.getByLabel('Alert').inputValue(),'10','A timed event alerts 10 minutes before');
 await page.getByLabel('Title').fill('Weekly sync');await page.getByLabel('Repeat').selectOption('weekly');await page.getByLabel('Alert').selectOption('none');
 await page.getByRole('button',{name:'Done'}).click();
 let sync=await named('Weekly sync');assert.deepEqual([sync.repeat,sync.alert,sync.start],['weekly',null,await at(28,11)]);
 await page.getByRole('button',{name:'Next week'}).click();
 const weekly=page.locator('.home-leaf[data-local=true][data-repeat=weekly]');
 assert.equal(await weekly.count(),1,'A weekly event shows the next week');
 assert.equal(await weekly.getAttribute('data-item-id'),'local:'+first+'@2026-10-05');
 assert.equal(await weekly.getAttribute('aria-label'),'Weekly sync · Every Week · On this computer');
 await scrollTo(10);let wb=(await weekly.boundingBox())!;box=(await hours('2026-10-05').boundingBox())!;
 await page.mouse.move(wb.x+20,wb.y+6);await page.mouse.down();await page.mouse.move(wb.x+20,box.y+13*40+6,{steps:6});await page.mouse.up();
 sync=await named('Weekly sync');assert.deepEqual([sync.start,sync.end],[await at(28,13),await at(28,14)],'Moving one time moves the whole event');
 await scrollTo(12);await weekly.click();await page.getByRole('button',{name:'Delete'}).click();await page.getByRole('button',{name:'Delete This Event'}).click();
 assert.deepEqual((await named('Weekly sync')).skip,['2026-10-05']);assert.equal(await weekly.count(),0,'Deleting one time leaves the others');
 await page.getByRole('button',{name:'Undo'}).click();assert.deepEqual((await named('Weekly sync')).skip,[]);assert.equal(await weekly.count(),1);
 await scrollTo(12);await weekly.click();await page.getByRole('checkbox',{name:'All-day'}).check();assert.ok(await page.getByLabel('Alert').isHidden(),'All-day events have no alert');await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Today'}).click();

 // Narrow: the week still fits.
 await page.setViewportSize({width:600,height:740});await page.evaluate(()=>(window as any).render());
 assert.ok(await page.locator('.home-open-body').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'Narrow week fits without horizontal scrolling');
 // Without a way to save (the practice fixture of other checks), nothing can be made.
 await page.evaluate(()=>{const w=window as any,panel=document.querySelector('section');panel.replaceChildren();w.Home.renderHomeOpen(panel,{key:'google-calendar',title:'Calendar'},w.synced,{now:w.now,connected:false},w.state,()=>{},()=>{});});
 assert.ok(await page.getByRole('button',{name:'New event'}).isDisabled());
 assert.match(await page.locator('.home-calendar-note').textContent(),/Events you add stay on this computer/);
 assert.deepEqual(errors,[]);
 console.log('PASS Calendar events: drag to make, move and stretch; edit, delete and undo; + and double-click; Month all-day move; weekly repeat and its one-time delete; alert choice; synced read only');
}finally{await browser.close();}
