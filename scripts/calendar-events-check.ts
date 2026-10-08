import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {LOCAL_CALENDAR_LIMITS,calendarAlerts,calendarEventId,calendarOccurrences,mergeCalendarEvent,orderCalendarEvents,readCalendarEvent,upcomingCalendarEvents,validCalendarEventId} from '../core/applets/index.ts';
import {runCalendarTool,worldActions} from '../core/tools/index.ts';
import {WorldLedger} from '../platform/electron/src/store/ledger.ts';
// The person's own calendar events (ui/applets/google-calendar/applet.md#local-events): IDs, reading a stored or
// requested event, saving one again, the World's limit, that world.sqlite keeps them across a reopen, repeats, alerts,
// what is coming up, and Fox's manage_calendar tool.

const id=calendarEventId(()=>0.5);
assert.match(id,/^ev-[a-z0-9]{12}$/);
assert.ok(validCalendarEventId(id)&&!validCalendarEventId('ev-../x')&&!validCalendarEventId('local:'+id));

const timed=readCalendarEvent({id,title:'  Dentist ',start:'2026-10-06T16:00:00Z',end:'2026-10-06T17:00:00Z',location:'Main St',notes:'Bring the form',extra:'dropped'},10)!;
assert.deepEqual(timed,{id,title:'Dentist',start:'2026-10-06T16:00:00.000Z',end:'2026-10-06T17:00:00.000Z',allDay:false,location:'Main St',notes:'Bring the form',alert:10,repeat:'none',skip:[],createdAt:10,updatedAt:10});
assert.equal(readCalendarEvent({id,title:'',start:'2026-10-06T16:00:00Z'})!.title,'New Event','An untitled event reads as New Event');
assert.equal(readCalendarEvent({id,start:'2026-10-06T16:00:00Z',end:'2026-10-06T15:00:00Z'})!.end,'2026-10-06T16:30:00.000Z','An event ending before it starts lasts 30 minutes');
assert.equal(readCalendarEvent({id,start:'not a date'}),null,'An event needs a date');
assert.equal(readCalendarEvent({id:'x',start:'2026-10-06T16:00:00Z'}),null,'An event needs a valid ID');
const allDay=readCalendarEvent({id,allDay:true,start:'2026-10-07',end:'2026-10-05'})!;
assert.deepEqual([allDay.start,allDay.end,allDay.allDay],['2026-10-07','2026-10-07',true],'An all-day event ending before it starts lasts one day');
assert.deepEqual([readCalendarEvent({id,allDay:true,start:'2026-10-07',end:'2026-10-09'})!.end],['2026-10-09'],'An all-day event keeps its last day');
assert.equal(readCalendarEvent({id,title:'x'.repeat(500),start:'2026-10-06T16:00:00Z'})!.title.length,LOCAL_CALENDAR_LIMITS.title);

const again=mergeCalendarEvent(timed,{...timed,title:'Dentist (moved)',createdAt:99},120);
assert.deepEqual([again.createdAt,again.updatedAt,again.title],[10,120,'Dentist (moved)'],'Saving keeps when the event was made');

const event=(n:number)=>readCalendarEvent({id:calendarEventId(()=>((n*7919)%1000)/1000+0.0001),title:'E'+n,start:new Date(Date.UTC(2026,9,1)+n*3600000).toISOString(),updatedAt:n},n)!;
const many=Array.from({length:LOCAL_CALENDAR_LIMITS.events+2},(_,i)=>({...event(i),id:'ev-'+String(i).padStart(12,'0')}));
const {kept,forget}=orderCalendarEvents(many);
assert.equal(kept.length,LOCAL_CALENDAR_LIMITS.events);
assert.deepEqual(forget,[many[1].id,many[0].id],'Past the limit the least recently edited go');
assert.ok(kept.every((e,i)=>i===0||Date.parse(kept[i-1].start)<=Date.parse(e.start)),'Earliest first');

// Alerts: 10 minutes before a timed event unless turned off; never for an all-day one. Repeats are one of four.
assert.equal(readCalendarEvent({id,start:'2026-10-06T16:00:00Z',alert:'none'})!.alert,null);
assert.equal(readCalendarEvent({id,start:'2026-10-06T16:00:00Z',alert:5})!.alert,10,'The only alert is 10 minutes before');
assert.equal(readCalendarEvent({id,allDay:true,start:'2026-10-07'})!.alert,null);
assert.equal(readCalendarEvent({id,start:'2026-10-06T16:00:00Z',repeat:'yearly'})!.repeat,'none');
assert.deepEqual(readCalendarEvent({id,start:'2026-10-06T16:00:00Z',skip:['2026-10-13']})!.skip,[],'Only a repeating event skips days');
assert.deepEqual(readCalendarEvent({id,start:'2026-10-06T16:00:00Z',repeat:'weekly',skip:['2026-10-13','bad','2026-10-13']})!.skip,['2026-10-13']);

// Repeats keep the wall-clock time (across the daylight-saving change, run in any TZ), skip deleted days, and a
// monthly event on the 31st skips the months without one.
const local=(y:number,m:number,d:number,h=9)=>new Date(y,m-1,d,h).toISOString();
const weekly=readCalendarEvent({id,title:'Swim',start:local(2026,10,27,9),end:local(2026,10,27,10),repeat:'weekly',skip:['2026-11-10']})!;
const swims=calendarOccurrences(weekly,'2026-10-20','2026-11-20');
assert.deepEqual(swims.map(o=>o.day),['2026-10-27','2026-11-03','2026-11-17']);
assert.ok(swims.every(o=>new Date(o.start).getHours()===9&&Date.parse(o.end)-Date.parse(o.start)===3600000),'Each time starts at 9 and lasts an hour');
assert.deepEqual(calendarOccurrences(weekly,'2026-10-01','2026-10-26'),[],'Nothing before it starts');
const monthly=readCalendarEvent({id,start:local(2026,1,31),repeat:'monthly'})!;
assert.deepEqual(calendarOccurrences(monthly,'2026-01-01','2026-06-30').map(o=>o.day),['2026-01-31','2026-03-31','2026-05-31']);
const daily=readCalendarEvent({id,start:local(2024,1,1,7),repeat:'daily'})!;
assert.deepEqual(calendarOccurrences(daily,'2026-10-06','2026-10-07').map(o=>o.day),['2026-10-06','2026-10-07'],'An old daily event still shows today');
const trip=readCalendarEvent({id,allDay:true,start:'2026-10-05',end:'2026-10-07'})!;
assert.deepEqual(calendarOccurrences(trip,'2026-10-07','2026-10-09').map(o=>[o.start,o.end]),[['2026-10-05','2026-10-07']],'A multi-day event shows on its last day');
assert.deepEqual(calendarOccurrences({...trip,repeat:'weekly'},'2026-10-12','2026-10-18').map(o=>[o.start,o.end]),[['2026-10-12','2026-10-14']]);

// Coming up and alerts.
const now=new Date(2026,9,6,12,55).getTime(),soon=readCalendarEvent({id:calendarEventId(()=>0.2),title:'Lunch',start:new Date(2026,9,6,13).toISOString()})!;
const later=readCalendarEvent({id:calendarEventId(()=>0.3),title:'Call',start:new Date(2026,9,6,15).toISOString(),alert:null})!;
const gone=readCalendarEvent({id:calendarEventId(()=>0.4),title:'Breakfast',start:new Date(2026,9,6,8).toISOString()})!;
const today=readCalendarEvent({id:calendarEventId(()=>0.5),title:'Holiday',allDay:true,start:localDayOf(now)})!;
function localDayOf(t:number){const d=new Date(t);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}
assert.deepEqual(upcomingCalendarEvents([later,gone,soon,today],now).map(o=>o.event.title),['Holiday','Lunch','Call'],'Coming up: not what is over, earliest first');
assert.deepEqual(calendarAlerts([soon,later,gone],now).due.map(o=>o.event.title),['Lunch'],'Lunch alerts 10 minutes before');
assert.equal(calendarAlerts([soon,later],now-10*60000).next,Date.parse(soon.start)-10*60000,'The next alert is known');
assert.equal(calendarAlerts([later],now).next,null,'An event without an alert never alerts');

// world.sqlite keeps them: saved, edited and deleted rows survive closing and reopening the World.
const root=fs.mkdtempSync(path.join(os.tmpdir(),'worldlet-calendar-'));
try{
 let ledger=new WorldLedger(root);
 const second=readCalendarEvent({id:calendarEventId(()=>0.1),title:'Trip',allDay:true,start:'2026-10-10',end:'2026-10-12'},5)!;
 ledger.saveCalendarEvents([timed,second]);ledger.saveCalendarEvents([again]);
 (ledger as any).db.close();ledger=new WorldLedger(root);
 const rows=ledger.calendarEventRows().map(row=>readCalendarEvent(row)!);
 assert.deepEqual(rows.map(e=>e.title).sort(),['Dentist (moved)','Trip']);
 ledger.saveCalendarEvents([],[second.id]);
 assert.deepEqual(ledger.calendarEventRows().map(row=>row.id),[id]);
 (ledger as any).db.close();
}finally{fs.rmSync(root,{recursive:true,force:true});}
// Fox's manage_calendar: list, add, change, delete (one time of a repeating event too), through the host's action.
{
 const store=new Map<string,any>(),calls:any[]=[];
 const call=async(action:string,body:any)=>{calls.push([action,body.operation]);assert.equal(action,'calendarEvents');
  if(body.operation==='list')return {events:[...store.values()]};
  if(body.operation==='save'){const e=readCalendarEvent(body.event)!;store.set(e.id,e);return {ok:true,event:e};}
  if(body.operation==='delete'){store.delete(body.id);return {ok:true};}};
 const at=new Date(2026,9,6,9).getTime();
 const added:any=await runCalendarTool(call,{operation:'add',title:'Lunch with Ana',start:'2026-10-09T13:00',location:'Cafe'},at);
 assert.ok(added.ok);assert.equal(added.event.title,'Lunch with Ana');assert.equal(added.event.alert,true);
 assert.equal(Date.parse(added.event.end)-Date.parse(added.event.start),3600000,'An hour unless an end is given');
 assert.equal(new Date(added.event.start).getHours(),13,'A local time stays local');
 assert.match((await runCalendarTool(call,{operation:'add',title:'x',start:'Friday'},at) as any).error,/not a date/);
 const yoga:any=await runCalendarTool(call,{operation:'add',title:'Yoga',start:'2026-10-07T07:00',end:'2026-10-07T07:45',repeat:'daily',alert:false},at);
 let list:any=await runCalendarTool(call,{operation:'list',from:'2026-10-07',to:'2026-10-09'},at);
 assert.deepEqual(list.events.map((e:any)=>e.title+(e.day?'@'+e.day:'')),['Yoga@2026-10-07','Yoga@2026-10-08','Yoga@2026-10-09','Lunch with Ana']);
 assert.equal((await runCalendarTool(call,{operation:'list',query:'ana'},at) as any).events.length,1,'list finds by words');
 const moved:any=await runCalendarTool(call,{operation:'change',id:added.event.id,start:'2026-10-09T14:00'},at);
 assert.equal(new Date(moved.event.start).getHours(),14);assert.equal(Date.parse(moved.event.end)-Date.parse(moved.event.start),3600000,'A new start keeps the length');
 assert.equal(moved.event.location,'Cafe','Fields not given stay');
 assert.ok((await runCalendarTool(call,{operation:'delete',id:yoga.event.id,day:'2026-10-08'},at) as any).ok);
 list=await runCalendarTool(call,{operation:'list',from:'2026-10-07',to:'2026-10-09',query:'yoga'},at);
 assert.deepEqual(list.events.map((e:any)=>e.day),['2026-10-07','2026-10-09'],'Deleting one day leaves the rest');
 assert.ok((await runCalendarTool(call,{operation:'delete',id:added.event.id},at) as any).ok);
 assert.deepEqual([...store.values()].map(e=>e.title),['Yoga']);
 assert.match((await runCalendarTool(call,{operation:'change',id:'ev-000000000000'},at) as any).error,/No such event/);
 // The gateway offers calendar/list, add, change, delete, each naming what it needs.
 const offered=worldActions().filter(a=>a.target==='calendar');
 assert.deepEqual(offered.map(a=>a.action+':'+a.parameters.required.join(',')),['list:','add:title,start','change:id','delete:id']);
 assert.match(worldActions().find(a=>a.target==='google-calendar'&&a.action==='draft')!.description,/calendar\/add/);
}
console.log('PASS local calendar events: IDs, reading, saving again, the limit, world.sqlite across a reopen, repeats, alerts, coming up, and Fox\'s manage_calendar');
