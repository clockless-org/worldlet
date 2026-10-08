import {Notification} from 'electron';
import {calendarAlerts,mergeCalendarEvent,orderCalendarEvents,readCalendarEvent,validCalendarEventId,type CalendarOccurrence,type LocalCalendarEvent} from '../../../../../core/applets/index.ts';
import {WorldletError} from '../../files.ts';
import type {Host} from '../../host/types.ts';

/** Local calendar events (ui/applets/google-calendar/applet.md#local-events). Worldlet cannot write to a connected
 * calendar, so the events the person makes, moves and deletes in the Calendar Applet are kept in this World's
 * `calendar_events` table. The practice world keeps its events in memory for the session. An event's alert is a
 * Mac or Windows notification 10 minutes before it starts, while Worldlet runs; clicking it shows that day in Calendar. */
export function installCalendar(host:Host){
 const {store,page}=host;
 const practice=new Map<string,LocalCalendarEvent>();
 const own=()=>store.writable&&!store.sampleEnabled();
 const all=():LocalCalendarEvent[]=>{
  if(!own())return [...practice.values()];
  try{return store.ledger().calendarEventRows().flatMap(row=>{const event=readCalendarEvent(row);return event?[event]:[];});}
  catch(error){host.diagnostics.record(error,'calendar');return [];}
 };
 const changed=(id='')=>{page.event('worldlet:calendar-events',{id});alerts();};
 // Alerts: each time an event happens alerts once. One that came due while Worldlet was closed still shows if the event
 // has not started yet.
 const alerted=new Set<string>(),showing=new Set<Notification>();let timer:ReturnType<typeof setTimeout>|null=null,stopped=false;
 const notify=(o:CalendarOccurrence)=>{
  if(!Notification.isSupported())return;
  const start=new Date(o.start),minutes=Math.max(1,Math.round((+start-Date.now())/60000));
  const body=[start.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})+' · in '+minutes+' min',o.event.location].filter(Boolean).join(' · ');
  const note=new Notification({title:o.event.title,body});showing.add(note);
  note.on('click',()=>{const w=host.window();if(w){if(w.isMinimized())w.restore();w.show();w.focus();}page.event('worldlet:calendar-open',{day:o.day});});
  note.on('close',()=>showing.delete(note));note.show();
 };
 function alerts(){
  if(timer)clearTimeout(timer);timer=null;if(stopped)return;
  const now=Date.now(),{due,next}=calendarAlerts(all(),now);
  for(const o of due){const key=o.event.id+'@'+o.start;if(alerted.has(key))continue;alerted.add(key);try{notify(o);}catch(error){host.diagnostics.record(error,'calendar-alert');}}
  if(alerted.size>500)for(const key of [...alerted].slice(0,alerted.size-500))alerted.delete(key);
  // Looked at again when the next alert is due, and at least every few hours in case the clock jumped.
  timer=setTimeout(alerts,Math.max(1000,Math.min(next==null?Infinity:next-now,3*3600000)));
 }
 host.onPageLoaded(()=>alerts());
 host.onQuit(()=>{stopped=true;if(timer)clearTimeout(timer);});
 host.register({
  calendarEvents:async request=>{
   const operation=typeof request.operation==='string'?request.operation:'list';
   if(operation==='list')return {events:orderCalendarEvents(all()).kept};
   if(operation==='save'){
    const now=Date.now()/1000,next=readCalendarEvent({...(request.event as object),createdAt:now,updatedAt:now});
    if(!next)throw new WorldletError('That event needs a valid date.');
    const list=all(),saved=mergeCalendarEvent(list.find(e=>e.id===next.id),next,now);
    const {forget}=orderCalendarEvents([saved,...list.filter(e=>e.id!==saved.id)]);
    if(own())store.ledger().saveCalendarEvents([saved as any],forget);
    else{practice.set(saved.id,saved);for(const id of forget)practice.delete(id);}
    changed(saved.id);
    return {ok:true,event:saved};
   }
   if(operation==='delete'){
    const id=String(request.id??'');
    if(!validCalendarEventId(id))throw new WorldletError('That is not an event.');
    if(own())store.ledger().saveCalendarEvents([],[id]);else practice.delete(id);
    changed(id);
    return {ok:true};
   }
   throw new WorldletError('Unknown request.');
  },
 });
}
