// Local calendar events (owner request 2026-10-06): Worldlet cannot write to a connected calendar, so an event the
// person makes in the Calendar Applet lives in this World only, in world.sqlite, beside the synced events it shows.
// These are the rules every host and the Applet apply (ui/applets/google-calendar/applet.md#local-events).

export interface LocalCalendarEvent {
 id:string;title:string;
 /** Timed: ISO instants. All-day: `YYYY-MM-DD`, `end` is the last day (inclusive). */
 start:string;end:string;allDay:boolean;
 location:string;notes:string;
 /** Minutes before a timed event starts that Worldlet alerts: 10, or null for no alert. All-day events have none. */
 alert:number|null;
 repeat:CalendarRepeat;
 /** Days (`YYYY-MM-DD`, local) a repeating event skips: occurrences the person deleted one at a time. */
 skip:string[];
 /** Seconds since 1970. */
 createdAt:number;updatedAt:number;
}
export type CalendarRepeat='none'|'daily'|'weekly'|'monthly';
export const CALENDAR_REPEATS:readonly CalendarRepeat[]=['none','daily','weekly','monthly'];
/** The one alert there is (owner: simple UX): this long before a timed event, or none. */
export const CALENDAR_ALERT_MINUTES=10;
export const LOCAL_CALENDAR_LIMITS=Object.freeze({events:5000,title:200,location:200,notes:4000,skip:500});
/** What a synced calendar's events are called beside these. */
export const LOCAL_CALENDAR_NAME='On this computer';
export const LOCAL_EVENT_TITLE='New Event';

const ID=/^ev-[a-z0-9]{12}$/,DAY=/^\d{4}-\d{2}-\d{2}$/;
const clip=(value:unknown,count:number)=>typeof value==='string'?[...value.trim()].slice(0,count).join(''):'';
export const validCalendarEventId=(id:unknown):id is string=>typeof id==='string'&&ID.test(id);
export function calendarEventId(random:()=>number=Math.random):string {
 const alphabet='abcdefghijklmnopqrstuvwxyz0123456789';
 return 'ev-'+Array.from({length:12},()=>alphabet[Math.floor(random()*alphabet.length)]).join('');
}
const day=(value:unknown)=>typeof value==='string'&&DAY.test(value)&&!Number.isNaN(Date.parse(value+'T12:00:00Z'))?value:null;
const noAlert=(value:unknown)=>value===null||value===false||value===0||value==='none';
const instant=(value:unknown)=>{if(typeof value!=='string'&&typeof value!=='number')return null;const t=new Date(value).getTime();return Number.isFinite(t)?t:null;};

/** A stored or requested event, normalized; null when it has no valid date. A timed event that would end at or
 * before it starts lasts 30 minutes; an all-day event ending before it starts lasts one day. */
export function readCalendarEvent(raw:any,now=Date.now()/1000):LocalCalendarEvent|null {
 if(!raw||typeof raw!=='object'||!validCalendarEventId(raw.id))return null;
 const allDay=raw.allDay===true;let start:string,end:string;
 if(allDay){
  const first=day(raw.start)??(instant(raw.start)!==null?localDay(instant(raw.start)!):null);if(!first)return null;
  const last=day(raw.end)??(instant(raw.end)!==null?localDay(instant(raw.end)!):null);
  start=first;end=last&&last>=first?last:first;
 }else{
  const from=instant(DAY.test(String(raw.start))?raw.start+'T09:00:00':raw.start);if(from===null)return null;
  const to=instant(raw.end);start=new Date(from).toISOString();end=new Date(to!==null&&to>from?to:from+30*60000).toISOString();
 }
 const createdAt=typeof raw.createdAt==='number'&&Number.isFinite(raw.createdAt)?raw.createdAt:now;
 const updatedAt=typeof raw.updatedAt==='number'&&Number.isFinite(raw.updatedAt)?raw.updatedAt:now;
 // A timed event alerts 10 minutes before unless the person turned it off; an all-day event never does.
 const alert=allDay||noAlert(raw.alert)?null:CALENDAR_ALERT_MINUTES;
 const repeat:CalendarRepeat=CALENDAR_REPEATS.includes(raw.repeat)?raw.repeat:'none';
 const skip=repeat==='none'||!Array.isArray(raw.skip)?[]:[...new Set(raw.skip.flatMap((d:unknown)=>day(d)?[d as string]:[]))].sort().slice(-LOCAL_CALENDAR_LIMITS.skip) as string[];
 return {id:raw.id,title:clip(raw.title,LOCAL_CALENDAR_LIMITS.title)||LOCAL_EVENT_TITLE,start,end,allDay,
  location:clip(raw.location,LOCAL_CALENDAR_LIMITS.location),notes:clip(raw.notes,LOCAL_CALENDAR_LIMITS.notes),alert,repeat,skip,createdAt,updatedAt};
}
/** Saving keeps when the event was made; everything else is the person's latest edit. */
export function mergeCalendarEvent(previous:LocalCalendarEvent|undefined,next:LocalCalendarEvent,now:number):LocalCalendarEvent {
 return {...next,createdAt:previous?.createdAt??now,updatedAt:now};
}
/** Earliest first; the cap keeps the newest edits. */
export function orderCalendarEvents(events:LocalCalendarEvent[]):{kept:LocalCalendarEvent[];forget:string[]} {
 const recent=[...events].sort((a,b)=>b.updatedAt-a.updatedAt);
 const kept=recent.slice(0,LOCAL_CALENDAR_LIMITS.events),forget=recent.slice(LOCAL_CALENDAR_LIMITS.events).map(e=>e.id);
 return {kept:kept.sort((a,b)=>eventStart(a)-eventStart(b)||a.id.localeCompare(b.id)),forget};
}
/** Start in milliseconds; an all-day event starts at local midnight. */
export function eventStart(event:Pick<LocalCalendarEvent,'start'|'allDay'>){return event.allDay?new Date(event.start+'T00:00:00').getTime():Date.parse(event.start);}
export function localDay(time:number){const d=new Date(time);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}

/** One time an event happens: the event itself, or one repeat of it. `day` is its first local day. */
export interface CalendarOccurrence {event:LocalCalendarEvent;day:string;start:string;end:string}
const noon=(key:string)=>new Date(key+'T12:00:00');
const days=(a:string,b:string)=>Math.round((+noon(b)-+noon(a))/86400000);
/** The `n`th repeat of a local date-time, kept at the same wall-clock time; null when the month has no such day. */
function repeatAt(base:Date,repeat:CalendarRepeat,n:number):Date|null {
 const d=new Date(base);
 if(repeat==='daily')d.setDate(d.getDate()+n);
 else if(repeat==='weekly')d.setDate(d.getDate()+7*n);
 else if(repeat==='monthly'){d.setDate(1);d.setMonth(d.getMonth()+n);d.setDate(base.getDate());if(d.getDate()!==base.getDate())return null;}
 else if(n)return null;
 return d;
}
/** Every time `event` happens on local days `first`..`last` (inclusive), earliest first. A monthly event on the 31st
 * skips shorter months, as Apple Calendar does. */
export function calendarOccurrences(event:LocalCalendarEvent,first:string,last:string):CalendarOccurrence[] {
 const out:CalendarOccurrence[]=[],skip=new Set(event.skip||[]),repeat=event.repeat||'none';
 const span=event.allDay?days(event.start,event.end):Math.max(0,days(localDay(Date.parse(event.start)),localDay(Date.parse(event.end)-1)));
 const base=event.allDay?noon(event.start):new Date(event.start),length=event.allDay?0:Date.parse(event.end)-Date.parse(event.start);
 const unit=repeat==='weekly'?7:repeat==='monthly'?31:1,lead=days(localDay(+base),first)-span-1;
 for(let n=repeat==='none'?0:Math.max(0,Math.floor(lead/unit)),guard=0;guard<1200;n++,guard++){
  const at=repeatAt(base,repeat,n);
  if(!at){if(repeat==='none')break;continue;}
  const key=localDay(+at);if(key>last)break;
  // All-day dates are counted from noon, so a daylight-saving change never moves them to another day.
  const lastDay=event.allDay?localDay(+at+span*86400000):localDay(+at+length-1);
  if(lastDay>=first&&!skip.has(key))
   out.push(event.allDay?{event,day:key,start:key,end:lastDay}:{event,day:key,start:at.toISOString(),end:new Date(+at+length).toISOString()});
  if(repeat==='none')break;
 }
 return out;
}
/** What is on soon, earliest first: timed events not yet over that start within `hours`, and today's all-day events. */
export function upcomingCalendarEvents(events:LocalCalendarEvent[],now=Date.now(),hours=24):CalendarOccurrence[] {
 const today=localDay(now),until=now+hours*3600000;
 return events.flatMap(e=>calendarOccurrences(e,today,localDay(until)))
  .filter(o=>o.event.allDay?o.start<=today&&o.end>=today:Date.parse(o.end)>now&&Date.parse(o.start)<until)
  .sort((a,b)=>occurrenceStart(a)-occurrenceStart(b));
}
export const occurrenceStart=(o:Pick<CalendarOccurrence,'start'|'event'>)=>o.event.allDay?new Date(o.start+'T00:00:00').getTime():Date.parse(o.start);
/** When an occurrence alerts, in milliseconds, or null. */
export const alertAt=(o:CalendarOccurrence)=>o.event.alert==null||o.event.allDay?null:Date.parse(o.start)-o.event.alert*60000;
/** Alerts due at `now` (their time has come and the event has not started yet), and when the next one is due. */
export function calendarAlerts(events:LocalCalendarEvent[],now=Date.now()):{due:CalendarOccurrence[];next:number|null} {
 const due:CalendarOccurrence[]=[];let next:number|null=null;
 for(const o of events.filter(e=>e.alert!=null&&!e.allDay).flatMap(e=>calendarOccurrences(e,localDay(now),localDay(now+8*86400000)))){
  const at=alertAt(o);if(at==null)continue;
  if(at<=now&&Date.parse(o.start)>now)due.push(o);
  else if(at>now&&(next==null||at<next))next=at;
 }
 return {due:due.sort((a,b)=>occurrenceStart(a)-occurrenceStart(b)),next};
}
