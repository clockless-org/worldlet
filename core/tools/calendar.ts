import {CALENDAR_ALERT_MINUTES,CALENDAR_REPEATS,LOCAL_CALENDAR_LIMITS,calendarEventId,calendarOccurrences,localDay,occurrenceStart,readCalendarEvent,validCalendarEventId,type LocalCalendarEvent} from '../applets/index.ts';
// Fox works with the person's own calendar events (ui/applets/google-calendar/applet.md#local-events), the ones they
// make in the Calendar Applet: it sees them, adds them, changes them and deletes them. They stay on this computer.
const when={type:'string',maxLength:40,description:'A local date-time like 2026-10-09T13:00 (or with a UTC offset); for an all-day event a date like 2026-10-09.'};
export const calendarTools=[
 {type:'function',name:'manage_calendar',description:'The person\'s own events in Worldlet\'s Calendar, kept on this computer (Worldlet cannot write to a connected Google or iCloud calendar, so use this, not google-calendar/draft, whenever they ask to add, move or remove an event). list: their events between two dates (default the next 7 days), each time a repeating event happens listed on its own, with its ID. add: a new event; title and start are needed, an hour long unless end is given; timed events alert 10 minutes before unless alert is false; repeat daily, weekly or monthly when they ask. change: an event by ID, only the fields given (a new start keeps its length unless end is given). delete: an event by ID, only when the person asked in their own words; with day, just that day\'s time of a repeating event. Shows in Calendar, Attention and on their phone at once.',
  parameters:{type:'object',properties:{
   operation:{type:'string',enum:['list','add','change','delete']},
   from:{type:'string',maxLength:10,description:'list: first day, YYYY-MM-DD (default today).'},to:{type:'string',maxLength:10,description:'list: last day, YYYY-MM-DD (default 7 days on). At most 62 days.'},
   query:{type:'string',maxLength:100,description:'list: only events with these words in their title, place or notes.'},
   id:{type:'string',maxLength:20,description:'change, delete: the event ID from list.'},
   title:{type:'string',maxLength:LOCAL_CALENDAR_LIMITS.title},start:when,end:when,allDay:{type:'boolean'},
   location:{type:'string',maxLength:LOCAL_CALENDAR_LIMITS.location},notes:{type:'string',maxLength:LOCAL_CALENDAR_LIMITS.notes},
   alert:{type:'boolean',description:`Alert ${CALENDAR_ALERT_MINUTES} minutes before (timed events only).`},
   repeat:{type:'string',enum:[...CALENDAR_REPEATS]},
   day:{type:'string',maxLength:10,description:'delete: just this day (YYYY-MM-DD) of a repeating event.'},
  },required:['operation'],additionalProperties:false}},
];
export const CALENDAR_REQUIRED:Record<string,string[]>={list:[],add:['title','start'],change:['id'],delete:['id']};

const DAY=/^\d{4}-\d{2}-\d{2}$/,LIST_DAYS=62,LIST_MAX=60;
const addDays=(key:string,n:number)=>{const d=new Date(key+'T12:00:00');d.setDate(d.getDate()+n);return localDay(+d);};
const time=(iso:string)=>new Date(iso).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});
/** How Fox reads an event: its local times spelled out, so it never has to convert time zones. */
function shown(event:LocalCalendarEvent,start=event.start,end=event.end){
 const day=(d:string)=>new Date(d+'T12:00:00').toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});
 const at=event.allDay?(start===end?day(start)+', all day':day(start)+' – '+day(end)+', all day')
  :new Date(start).toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'})+', '+time(start)+' – '+time(end);
 return {id:event.id,title:event.title,when:at,start,end,allDay:event.allDay,
  ...event.location?{location:event.location}:{},...event.notes?{notes:event.notes}:{},
  ...event.repeat!=='none'?{repeat:event.repeat}:{},...!event.allDay?{alert:event.alert!=null}:{}};
}
/** A requested time as stored: all-day events keep the date, timed ones an instant. Null when it is not a time. */
function read(value:unknown,allDay:boolean){
 if(typeof value!=='string'||!value.trim())return null;
 const v=value.trim();
 if(allDay){const d=v.slice(0,10);return DAY.test(d)&&!Number.isNaN(Date.parse(d+'T12:00:00'))?d:null;}
 const t=new Date(DAY.test(v)?v+'T09:00:00':v).getTime();return Number.isFinite(t)?new Date(t).toISOString():null;
}

/** Runs manage_calendar through the host's calendarEvents action (the same one the Calendar Applet uses). */
export async function runCalendarTool(call:(action:string,body:any)=>Promise<any>,args:any,now=Date.now()){
 const events=():Promise<LocalCalendarEvent[]>=>Promise.resolve(call('calendarEvents',{operation:'list'})).then(r=>(r?.events||[]).flatMap((e:any)=>{const x=readCalendarEvent(e);return x?[x]:[];}));
 const save=async(event:any)=>{const r=await call('calendarEvents',{operation:'save',event});if(!r?.ok)return {error:r?.error||'The event was not saved.'};const saved=readCalendarEvent(r.event)!;return {ok:true,event:shown(saved)};};
 const op=args.operation;
 if(op==='list'){
  const from=DAY.test(args.from||'')?args.from:localDay(now),to=DAY.test(args.to||'')?args.to:addDays(from,7);
  if(to<from)return {error:'to must not be before from.'};
  const last=to>addDays(from,LIST_DAYS)?addDays(from,LIST_DAYS):to;
  const words=String(args.query||'').toLowerCase().split(/\s+/).filter(Boolean);
  const all=(await events()).filter(e=>words.every(w=>(e.title+' '+e.location+' '+e.notes).toLowerCase().includes(w)))
   .flatMap(e=>calendarOccurrences(e,from,last)).sort((a,b)=>occurrenceStart(a)-occurrenceStart(b));
  return {from,to:last,events:all.slice(0,LIST_MAX).map(o=>({...shown(o.event,o.start,o.end),...o.event.repeat!=='none'?{day:o.day}:{}})),
   ...all.length>LIST_MAX?{more:all.length-LIST_MAX}:{},scope:'Events the person made in Worldlet. Synced Google or iCloud events are read with the calendar source.'};
 }
 if(op==='add'){
  const allDay=args.allDay===true,start=read(args.start,allDay);
  if(!args.title?.trim())return {error:'An event needs a title.'};
  if(!start)return {error:'start is not a date'+(allDay?' (YYYY-MM-DD).':' and time (like 2026-10-09T13:00).')};
  const end=read(args.end,allDay)??(allDay?start:new Date(Date.parse(start)+3600000).toISOString());
  return save({id:calendarEventId(),title:args.title,start,end,allDay,location:args.location||'',notes:args.notes||'',alert:args.alert===false?null:CALENDAR_ALERT_MINUTES,repeat:args.repeat||'none',skip:[]});
 }
 if(!validCalendarEventId(args.id))return {error:'Use an event ID from manage_calendar list.'};
 const event=(await events()).find(e=>e.id===args.id);
 if(!event)return {error:'No such event. List the events again.'};
 if(op==='delete'){
  if(args.day!==undefined){
   if(event.repeat==='none'||!DAY.test(args.day))return {error:'day is only for one time of a repeating event, as listed.'};
   return save({...event,skip:[...event.skip,args.day]}).then(r=>'ok' in r?{ok:true,deleted:{...r.event,day:args.day}}:r);
  }
  const r=await call('calendarEvents',{operation:'delete',id:event.id});
  return r?.ok?{ok:true,deleted:shown(event)}:{error:r?.error||'The event was not deleted.'};
 }
 if(op==='change'){
  const allDay=typeof args.allDay==='boolean'?args.allDay:event.allDay;
  const start=args.start!==undefined?read(args.start,allDay):allDay===event.allDay?event.start:read(event.start,allDay);
  if(!start)return {error:'start is not a date'+(allDay?' (YYYY-MM-DD).':' and time.')};
  // A new start keeps the event's length unless a new end is given.
  const length=event.allDay?0:Date.parse(event.end)-Date.parse(event.start);
  const end=args.end!==undefined?read(args.end,allDay):allDay?(event.allDay?addDays(start,Math.round((+new Date(event.end+'T12:00:00')-+new Date(event.start+'T12:00:00'))/86400000)):start):new Date(Date.parse(start)+(length||3600000)).toISOString();
  if(!end)return {error:'end is not a date'+(allDay?' (YYYY-MM-DD).':' and time.')};
  return save({...event,...['title','location','notes','repeat'].reduce((o,k)=>args[k]!==undefined?{...o,[k]:args[k]}:o,{}),start,end,allDay,
   alert:typeof args.alert==='boolean'?(args.alert?CALENDAR_ALERT_MINUTES:null):event.allDay&&!allDay?CALENDAR_ALERT_MINUTES:event.alert});
 }
 return {error:'Unknown operation.'};
}
