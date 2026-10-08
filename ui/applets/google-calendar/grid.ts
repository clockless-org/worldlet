import {node} from '../../components/index.ts';
import {calendarDay} from '../../world/index.ts';
import {calendarEventId,calendarOccurrences,localDay,CALENDAR_ALERT_MINUTES,LOCAL_CALENDAR_NAME,LOCAL_EVENT_TITLE,type LocalCalendarEvent} from '../../../core/applets/index.ts';
// Calendar's day and week pages are a time grid, like Apple Calendar: drag on empty time to make an event, drag an
// event to move it, drag its lower edge to change when it ends, click it to edit, Delete to remove it. Only the
// person's own events (applet.md#local-events) move; synced events open their original as before. A repeating event
// shows each time it happens; moving or editing one of them changes them all, and Delete can take just that one.

export const HOUR=40;
const SNAP=15,DAY_MINUTES=24*60,DRAG=4;
export type CalendarActions={save:(event:LocalCalendarEvent)=>unknown;remove:(id:string)=>unknown};
export type CalendarState={mode:'day'|'week'|'month';offset:number;scroll?:number|null;editing?:string|null;draft?:Record<string,any>|null;undo?:LocalCalendarEvent|null};

/** The person's own events as Calendar items, beside the synced ones. */
export function localCalendarItems(events:LocalCalendarEvent[]){
 return (events||[]).map(event=>({id:'local:'+event.id,title:event.title,context:event.location||'',curated:false,local:true,status:'open',
  start:event.start,end:event.end,allDay:event.allDay,when:'',record:{...event,calendar:LOCAL_CALENDAR_NAME}}));
}
const pad=(n:number)=>String(n).padStart(2,'0');
const clock=(d:Date)=>pad(d.getHours())+':'+pad(d.getMinutes());
const dayStart=(key:string)=>new Date(key+'T00:00:00');
const snap=(minutes:number,step=SNAP)=>Math.round(minutes/step)*step;
const clamp=(v:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,v));
const addDays=(key:string,n:number)=>{const d=dayStart(key);d.setDate(d.getDate()+n);return localDay(+d);};
const dayDiff=(a:string,b:string)=>Math.round((+dayStart(b)-+dayStart(a))/86400000);

/** When an item happens; a synced event without an end lasts an hour. */
export function itemRange(item){
 if(item.allDay){const first=calendarDay(item.start,true);const last=item.local?String(item.end||first).slice(0,10):first;return {allDay:true,first,last:last>=first?last:first};}
 const start=new Date(item.start);if(Number.isNaN(+start))return null;
 const rawEnd=new Date(item.end||item.record?.end||'');const end=Number.isNaN(+rawEnd)||+rawEnd<=+start?new Date(+start+3600000):rawEnd;
 return {allDay:false,start,end};
}
/** Side-by-side lanes for events that overlap in time, as Apple Calendar lays them out. */
export function calendarLanes(spans:{id:string,from:number,to:number}[]){
 const sorted=[...spans].sort((a,b)=>a.from-b.from||b.to-a.to),out=new Map<string,{lane:number,lanes:number}>();
 let group:{id:string,lane:number}[]=[],groupEnd=-Infinity,laneEnds:number[]=[];
 const close=()=>{for(const g of group)out.set(g.id,{lane:g.lane,lanes:laneEnds.length});group=[];laneEnds=[];};
 for(const s of sorted){
  if(s.from>=groupEnd)close();
  let lane=laneEnds.findIndex(end=>end<=s.from);if(lane<0){lane=laneEnds.length;laneEnds.push(s.to);}else laneEnds[lane]=s.to;
  group.push({id:s.id,lane});groupEnd=Math.max(groupEnd===-Infinity?s.to:groupEnd,s.to);
 }
 close();return out;
}
/** A new event: the dragged time, or an hour from the next full hour on the shown day. */
export function newCalendarEvent(day:string,from:number|null,to:number|null,allDay=false,now=Date.now()):LocalCalendarEvent {
 const t=now/1000;
 const fresh={id:calendarEventId(),title:LOCAL_EVENT_TITLE,location:'',notes:'',repeat:'none' as const,skip:[],createdAt:t,updatedAt:t};
 if(allDay)return {...fresh,start:day,end:day,allDay:true,alert:null};
 let start=from;if(start==null){const n=new Date(now);start=day===localDay(now)?Math.min((n.getHours()+1)*60,DAY_MINUTES-60):9*60;}
 const end=to!=null&&to>start?to:Math.min(start+60,DAY_MINUTES);
 const at=(m:number)=>{const d=dayStart(day);d.setMinutes(m);return d.toISOString();};
 return {...fresh,start:at(start),end:at(end),allDay:false,alert:CALENDAR_ALERT_MINUTES};
}

const REPEATS:Record<string,string>={none:'Never',daily:'Every Day',weekly:'Every Week',monthly:'Every Month'};
/** Each time a repeating event happens on the shown days, as its own item. It remembers which time it is and where
 * the event itself starts, so a change to it can be made to the event. */
function repeats(item,first:string,last:string){
 const {calendar:_,...event}=item.record;
 return calendarOccurrences(event,first,last).map(o=>({...item,id:'local:'+event.id+'@'+o.day,start:o.start,end:o.end,
  record:{...item.record,start:o.start,end:o.end,occurrence:o.day,occurrenceStart:o.start,seriesStart:event.start,seriesEnd:event.end}}));
}
/** The event to save for an edited item: one time of a repeating event moves the whole event by as much as it moved. */
export function series(view:any):LocalCalendarEvent {
 const {calendar:_c,occurrence,occurrenceStart,seriesStart,seriesEnd,...event}=view;
 if(!occurrence)return event;
 const wasAllDay=!/T/.test(occurrenceStart);
 if(event.allDay!==wasAllDay)return event;
 let start:string,end:string,shift:number;
 if(event.allDay){shift=dayDiff(occurrenceStart,event.start);start=addDays(seriesStart,shift);end=addDays(start,dayDiff(event.start,event.end));}
 else{const moved=Date.parse(event.start)-Date.parse(occurrenceStart),from=new Date(Date.parse(seriesStart)+moved);
  start=from.toISOString();end=new Date(+from+Date.parse(event.end)-Date.parse(event.start)).toISOString();shift=dayDiff(occurrence,localDay(Date.parse(event.start)));}
 // Days skipped one at a time move with the event.
 return {...event,start,end,skip:shift?(event.skip||[]).map((d:string)=>addDays(d,shift)):event.skip||[]};
}

export function renderCalendar({sheet,nav,body,items,value,state,days,itemButton,redraw}:{sheet:HTMLElement,nav:HTMLElement,body:HTMLElement,items:any[],value:any,state:CalendarState,days:Date[],itemButton:(item:any)=>HTMLElement,redraw:()=>void}){
 const actions:CalendarActions|null=value?.calendar||null,now=value?.now||Date.now(),today=calendarDay(new Date(now));
 const keys=days.map(d=>calendarDay(d)),grid=state.mode!=='month';
 items=items.flatMap(item=>item.local&&item.record?.repeat&&item.record.repeat!=='none'?repeats(item,keys[0],keys[keys.length-1]):[item]);
 // An item's key is its event ID, with the day for one time a repeating event happens.
 const own=(key:string):LocalCalendarEvent|undefined=>{const record=items.find(i=>i.local&&i.id==='local:'+key)?.record;if(!record)return undefined;const {calendar:_,...event}=record;return event;};
 // A save redraws the page through the host's new list, so nothing redraws after one.
 const save=(event:LocalCalendarEvent)=>{if(actions)void actions.save(series(event));};
 const edit=(id:string|null)=>{state.editing=id;state.draft=null;redraw();};
 const create=(event:LocalCalendarEvent)=>{state.editing=event.id;state.draft=null;state.undo=null;save(event);};
 // Today and New Event on the date row, as in Apple Calendar.
 const todayButton=node('button','home-calendar-today','Today');todayButton.type='button';todayButton.onclick=()=>{state.offset=0;state.scroll=null;redraw();};
 const add=node('button','home-calendar-add','+');add.type='button';add.setAttribute('aria-label','New event');add.title='New event';
 add.disabled=!actions;add.onclick=()=>{const day=keys.includes(today)?today:keys[0];create(newCalendarEvent(day,null,null,false,now));};
 nav.prepend(todayButton);nav.append(add);
 // What the person should know: a read in progress, an error, or that their events stay here.
 const connected=!!value?.connected,note=value?.error||(value?.reading?'Reading…':!connected?'Connect a calendar with Fox to see its events. Events you add stay on this computer.':'');
 if(state.undo&&actions){const undo=state.undo,line=node('p','home-calendar-note');line.append(node('span','','Event deleted.'));const b=node('button','home-calendar-undo','Undo');b.type='button';b.onclick=()=>{state.undo=null;save(undo);};line.append(b);sheet.insertBefore(line,body);setTimeout(()=>{if(state.undo===undo){state.undo=null;line.remove();}},8000);}
 else if(note)sheet.insertBefore(node('p','home-calendar-note',note),body);
 // Deleting one time a repeating event happens skips that day; Undo puts the event back as it was either way.
 const remove=(event:LocalCalendarEvent,one=false)=>{if(!actions)return;const whole=series(event),day=(event as any).occurrence;state.undo=whole;state.editing=null;state.draft=null;
  if(one&&day)void actions.save({...whole,skip:[...whole.skip||[],day]});else void actions.remove(whole.id);};

 const placed=items.map(item=>({item,range:itemRange(item)})).filter(p=>p.range);
 const onDay=(key:string,allDay:boolean)=>placed.filter(({range})=>allDay?range.allDay?key>=range.first&&key<=range.last:false:!range.allDay&&calendarDay(range.start)<=key&&calendarDay(new Date(+range.end-1))>=key);
 const buttons=new Map<string,HTMLElement>();
 const ownButton=(item)=>{
  const button=itemButton(item);
  if(!item.local)return button;
  const event=item.record as LocalCalendarEvent,key=item.id.replace(/^local:/,'');button.dataset.local='true';
  button.setAttribute('aria-label',[event.title,REPEATS[event.repeat]&&event.repeat!=='none'?REPEATS[event.repeat]:'',LOCAL_CALENDAR_NAME].filter(Boolean).join(' · '));
  if(event.repeat&&event.repeat!=='none')button.dataset.repeat=event.repeat;
  button.onclick=()=>{if(button.dataset.dragged==='true'){delete button.dataset.dragged;return;}edit(key);};
  button.onkeydown=e=>{if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();remove(own(key)||event,true);}};
  buttons.set(key,button);return button;
 };
 const columns:{key:string,column:HTMLElement,hours?:HTMLElement,allday?:HTMLElement}[]=[];
 if(grid){
  body.dataset.grid='time';body.style.setProperty('--calendar-days',String(days.length));
  const alldayRows=Math.max(0,...keys.map(k=>onDay(k,true).length));body.style.setProperty('--calendar-allday',String(alldayRows));
  const gutter=node('div','home-calendar-gutter');gutter.setAttribute('aria-hidden','true');gutter.append(node('div','home-calendar-dayhead'));
  const marks=node('div','home-calendar-hours');for(let h=1;h<24;h++){const d=new Date(2026,0,1,h);const label=node('span','',d.toLocaleTimeString(undefined,{hour:'numeric'}));label.style.top=h*HOUR+'px';marks.append(label);}
  gutter.append(marks);body.append(gutter);
 }
 for(const [index,day] of days.entries()){
  const key=keys[index],column=node('section','home-calendar-day');column.dataset.date=key;if(key===today)column.dataset.today='true';
  if(state.mode==='month'&&index===0)column.style.gridColumnStart=String((day.getDay()+6)%7+1);
  const label=node('time','',state.mode==='month'?String(day.getDate()):null);label.dateTime=key;
  if(grid)label.append(node('span','',day.toLocaleDateString(undefined,{weekday:'short'})),' ',node('b','',day.getDate()));
  if(!grid){
   column.append(label);
   const events=placed.filter(({range})=>range.allDay?key>=range.first&&key<=range.last:calendarDay(range.start)===key);
   for(const {item} of events)column.append(ownButton(item));
   const dayOpen=node('button','home-day-open',events.length?String(events.length)+' events':'Open day');dayOpen.type='button';dayOpen.setAttribute('aria-label',day.toLocaleDateString()+' · '+events.length+' events');dayOpen.onclick=()=>{const t=new Date(now);t.setHours(12,0,0,0);state.mode='day';state.offset=Math.round((+day-+t)/86400000);redraw();};column.append(dayOpen);
   column.ondblclick=e=>{if(!actions||(e.target as HTMLElement).closest('.home-leaf,.home-day-open'))return;create(newCalendarEvent(key,null,null,true,now));};
   columns.push({key,column,allday:column});body.append(column);continue;
  }
  const head=node('div','home-calendar-dayhead'),allday=node('div','home-calendar-allday');allday.setAttribute('aria-label','All-day events');head.append(label,allday);
  for(const {item} of onDay(key,true))allday.append(ownButton(item));
  allday.ondblclick=e=>{if(!actions||(e.target as HTMLElement).closest('.home-leaf'))return;create(newCalendarEvent(key,null,null,true,now));};
  const hours=node('div','home-calendar-hours');hours.setAttribute('aria-label',day.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'}));
  const timed=onDay(key,false),base=+dayStart(key);
  const span=(range)=>({from:clamp((+range.start-base)/60000,0,DAY_MINUTES),to:clamp((+range.end-base)/60000,0,DAY_MINUTES)});
  const lanes=calendarLanes(timed.map(({item,range})=>({id:item.id,...span(range)})));
  for(const {item,range} of timed.sort((a,b)=>+a.range.start-+b.range.start)){
   const {from,to}=span(range),lane=lanes.get(item.id)||{lane:0,lanes:1},button=ownButton(item);
   button.classList.add('home-calendar-event');button.style.top=from/60*HOUR+'px';button.style.height=Math.max((to-from)/60*HOUR,HOUR/4)+'px';
   button.style.left=`calc(${lane.lane/lane.lanes*100}% + 1px)`;button.style.width=`calc(${100/lane.lanes}% - 3px)`;
   if(to-from<45)button.dataset.short='true';
   if(item.local){const grip=node('span','home-calendar-resize');grip.setAttribute('aria-hidden','true');button.append(grip);}
   hours.append(button);
  }
  if(key===today){const line=node('i','home-calendar-now');const t=new Date(now);line.style.top=(t.getHours()*60+t.getMinutes())/60*HOUR+'px';line.setAttribute('aria-hidden','true');hours.append(line);}
  column.append(head,hours);columns.push({key,column,hours,allday});body.append(column);
 }
 if(grid){
  const firstHour=Math.min(8,...placed.filter(p=>!p.range.allDay&&keys.includes(calendarDay(p.range.start))).map(p=>p.range.start.getHours()));
  const top=state.scroll??Math.max(0,firstHour*HOUR-8);body.scrollTop=top;
  // Once laid out, try again in case the grid was too short to scroll yet; a scroll since then (by the person) wins.
  const placedAt=body.scrollTop;requestAnimationFrame(()=>{if(body.scrollTop===placedAt)body.scrollTop=top;});
  body.addEventListener('scroll',()=>{state.scroll=body.scrollTop;},{passive:true});
 }
 const undated=items.filter(item=>!itemRange(item)||(!item.allDay&&!calendarDay(item.start)));
 if(undated.length){const section=node('section','home-calendar-undated');section.append(node('h3','','Date not set'));for(const item of undated)section.append(itemButton(item));body.append(section);}
 if(actions)wire({body,columns,own,save,create,grid});
 const editing=state.editing?own(state.editing):undefined;
 if(editing)openEditor({sheet,anchor:buttons.get(state.editing!)||null,event:editing,state,save,remove,close:()=>edit(null)});
 else state.editing=null;
}

/** Pointer gestures on the grid and the month: make, move and stretch the person's own events. */
function wire({body,columns,own,save,create,grid}){
 const columnAt=(x:number,y:number)=>{for(const el of document.elementsFromPoint(x,y)){const c=(el as HTMLElement).closest?.('.home-calendar-day');if(c&&body.contains(c))return columns.find(col=>col.column===c)||null;}return null;};
 const minuteAt=(hours:HTMLElement,y:number)=>clamp(snap((y-hours.getBoundingClientRect().top)/HOUR*60),0,DAY_MINUTES);
 body.addEventListener('pointerdown',(e:PointerEvent)=>{
  if(e.button!==0)return;const target=e.target as HTMLElement;
  const button=target.closest('.home-leaf') as HTMLElement|null;
  if(button){if(button.dataset.local!=='true')return;const id=button.dataset.itemId?.replace(/^local:/,'');const event=id?own(id):undefined;if(!event)return;
   if(grid&&!event.allDay)return timedDrag(e,button,event,target.classList.contains('home-calendar-resize'));
   return dayDrag(e,button,event);}
  if(!grid)return;
  const col=columns.find(c=>c.hours===target);if(!col)return;
  e.preventDefault();const anchor=minuteAt(col.hours,e.clientY);let cur=anchor,moved=false;
  const draft=node('div','home-calendar-draft');draft.setAttribute('aria-hidden','true');
  const show=()=>{const from=Math.min(anchor,cur),to=Math.max(anchor,cur);draft.style.top=from/60*HOUR+'px';draft.style.height=Math.max(to-from,SNAP)/60*HOUR+'px';draft.textContent=label(col.key,from,Math.max(to,from+SNAP));};
  const move=(m:PointerEvent)=>{const next=minuteAt(col.hours,m.clientY);if(!moved&&Math.abs(m.clientY-e.clientY)<DRAG)return;if(!moved){moved=true;col.hours.append(draft);}cur=next;show();};
  const up=()=>{removeEventListener('pointermove',move);removeEventListener('pointerup',up);removeEventListener('pointercancel',up);draft.remove();
   if(!moved)return;const from=Math.min(anchor,cur),to=Math.max(anchor,cur,from+SNAP);create(newCalendarEvent(col.key,from,to));};
  addEventListener('pointermove',move);addEventListener('pointerup',up);addEventListener('pointercancel',up);
 });
 // Double-click on empty time makes an hour-long event there.
 if(grid)for(const col of columns)col.hours.addEventListener('dblclick',(e:MouseEvent)=>{if(e.target!==col.hours)return;const from=clamp(Math.floor((e.clientY-col.hours.getBoundingClientRect().top)/HOUR*2)*30,0,DAY_MINUTES-60);create(newCalendarEvent(col.key,from,from+60));});
 function timedDrag(e:PointerEvent,button:HTMLElement,event:LocalCalendarEvent,resize:boolean){
  e.preventDefault();const start=new Date(event.start),end=new Date(event.end),length=(+end-+start)/60000;
  const home=columns.find(c=>c.hours?.contains(button));if(!home)return;
  const startMinute=start.getHours()*60+start.getMinutes(),grab=minuteAt(home.hours,e.clientY)-startMinute;
  let moved=false,col=home,from=startMinute,to=startMinute+length;
  const move=(m:PointerEvent)=>{
   if(!moved&&Math.hypot(m.clientX-e.clientX,m.clientY-e.clientY)<DRAG)return;
   if(!moved){moved=true;button.dataset.dragging='true';}
   if(resize){to=Math.max(from+SNAP,minuteAt(col.hours,m.clientY));}
   else{const over=columnAt(m.clientX,m.clientY);if(over?.hours&&over!==col){col=over;col.hours.append(button);}from=clamp(minuteAt(col.hours,m.clientY)-grab,0,DAY_MINUTES-Math.min(length,DAY_MINUTES));to=from+length;}
   button.style.top=from/60*HOUR+'px';button.style.height=Math.max(to-from,SNAP)/60*HOUR+'px';if(!resize){button.style.left='1px';button.style.width='calc(100% - 3px)';}
  };
  const up=()=>{removeEventListener('pointermove',move);removeEventListener('pointerup',up);removeEventListener('pointercancel',up);delete button.dataset.dragging;
   if(!moved)return;button.dataset.dragged='true';
   const at=(m:number)=>{const d=dayStart(col.key);d.setMinutes(m);return d.toISOString();};
   const next={...event,start:at(from),end:at(to)};if(next.start!==event.start||next.end!==event.end)save(next);};
  addEventListener('pointermove',move);addEventListener('pointerup',up);addEventListener('pointercancel',up);
 }
 function dayDrag(e:PointerEvent,button:HTMLElement,event:LocalCalendarEvent){
  const home=columns.find(c=>c.allday?.contains(button));if(!home)return;
  let moved=false,over=home;
  const move=(m:PointerEvent)=>{if(!moved&&Math.hypot(m.clientX-e.clientX,m.clientY-e.clientY)<DRAG)return;moved=true;button.dataset.dragging='true';
   const next=columnAt(m.clientX,m.clientY);if(next&&next!==over){delete over.column.dataset.drop;over=next;}if(over!==home)over.column.dataset.drop='true';};
  const up=()=>{removeEventListener('pointermove',move);removeEventListener('pointerup',up);removeEventListener('pointercancel',up);delete button.dataset.dragging;delete over.column.dataset.drop;
   if(!moved)return;button.dataset.dragged='true';const shift=dayDiff(home.key,over.key);if(!shift)return;
   if(event.allDay)save({...event,start:addDays(event.start,shift),end:addDays(event.end,shift)});
   else{const ms=shift*86400000,move=(iso:string)=>{const d=new Date(iso),t=new Date(+d+ms);t.setHours(d.getHours(),d.getMinutes(),0,0);return t.toISOString();};save({...event,start:move(event.start),end:move(event.end)});}};
  addEventListener('pointermove',move);addEventListener('pointerup',up);addEventListener('pointercancel',up);
 }
}
function label(day:string,from:number,to:number){const d=dayStart(day),a=new Date(+d+from*60000),b=new Date(+d+to*60000);const f=(x:Date)=>x.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});return f(a)+' – '+f(b);}

/** The event's details beside it, like Apple Calendar's popover. Done or a click elsewhere saves; Esc leaves it as it was. */
function openEditor({sheet,anchor,event,state,save,remove,close}){
 const draft=state.draft&&state.draft.id===event.id?state.draft:null;
 const start=new Date(event.allDay?event.start+'T09:00:00':event.start),end=new Date(event.allDay?event.end+'T10:00:00':event.end);
 const form=node('form','home-event-editor');form.setAttribute('role','dialog');form.setAttribute('aria-label','Event details');
 const field=(name:string,type:string,value:string,labelText:string)=>{const input=node('input');input.name=name;input.type=type;input.value=value;input.setAttribute('aria-label',labelText);return input;};
 const title=field('title','text',draft?.title??event.title,'Title');title.className='home-event-title';title.maxLength=200;
 const location=field('location','text',draft?.location??event.location,'Location');location.placeholder='Add location';location.maxLength=200;
 const allDay=field('allDay','checkbox','','All-day');allDay.checked=draft?.allDay??event.allDay;
 const startDay=field('startDay','date',draft?.startDay??(event.allDay?event.start:localDay(+start)),'Start date'),startTime=field('startTime','time',draft?.startTime??clock(start),'Start time');
 const endDay=field('endDay','date',draft?.endDay??(event.allDay?event.end:localDay(+end)),'End date'),endTime=field('endTime','time',draft?.endTime??clock(end),'End time');
 const repeat=node('select') as HTMLSelectElement;repeat.name='repeat';repeat.setAttribute('aria-label','Repeat');
 for(const [value,text] of Object.entries(REPEATS)){const o=node('option','',text) as HTMLOptionElement;o.value=value;repeat.append(o);}
 repeat.value=draft?.repeat??event.repeat??'none';
 const alert=node('select') as HTMLSelectElement;alert.name='alert';alert.setAttribute('aria-label','Alert');
 for(const [value,text] of [[String(CALENDAR_ALERT_MINUTES),CALENDAR_ALERT_MINUTES+' minutes before'],['none','None']]){const o=node('option','',text) as HTMLOptionElement;o.value=value;alert.append(o);}
 alert.value=draft?.alert??(event.allDay?String(CALENDAR_ALERT_MINUTES):event.alert==null?'none':String(CALENDAR_ALERT_MINUTES));
 const notes=node('textarea');notes.name='notes';notes.value=draft?.notes??event.notes;notes.placeholder='Add notes';notes.setAttribute('aria-label','Notes');notes.maxLength=4000;notes.rows=3;
 const row=(text:string,...inputs:HTMLElement[])=>{const r=node('label','home-event-row');r.append(node('span','',text),...inputs);return r;};
 const dayLabel=node('label','home-event-check');dayLabel.append(allDay,node('span','','All-day'));
 const from=row('Starts',startDay,startTime),to=row('Ends',endDay,endTime);
 const alertRow=row('Alert',alert);
 const sync=()=>{startTime.hidden=endTime.hidden=alertRow.hidden=allDay.checked;};sync();
 const footer=node('footer','home-event-actions');
 const del=node('button','home-event-delete','Delete');del.type='button';
 const done=node('button','home-event-done','Done');done.type='submit';footer.append(del,done);
 // A repeating event asks which: just this time, or every time (Apple Calendar asks the same).
 del.onclick=()=>{
  if(!(event as any).occurrence){detach();remove(event);return;}
  const one=node('button','home-event-delete','Delete This Event'),all=node('button','home-event-delete','Delete All');one.type=all.type='button';
  one.onclick=()=>{detach();remove(event,true);};all.onclick=()=>{detach();remove(event);};
  footer.replaceChildren(one,all,done);one.focus();
 };
 form.append(title,location,dayLabel,from,to,row('Repeat',repeat),alertRow,notes,footer,node('small','home-event-calendar',LOCAL_CALENDAR_NAME));
 const values=()=>({id:event.id,title:title.value,location:location.value,allDay:allDay.checked,startDay:startDay.value,startTime:startTime.value,endDay:endDay.value,endTime:endTime.value,notes:notes.value,repeat:repeat.value,alert:alert.value});
 form.addEventListener('input',()=>{state.draft=values();sync();});
 const commit=()=>{const v=values();let next:LocalCalendarEvent;
  const kept={repeat:(REPEATS[v.repeat]?v.repeat:'none') as LocalCalendarEvent['repeat'],alert:v.allDay||v.alert==='none'?null:CALENDAR_ALERT_MINUTES};
  if(v.allDay)next={...event,...kept,title:v.title.trim()||LOCAL_EVENT_TITLE,location:v.location.trim(),notes:v.notes.trim(),allDay:true,start:v.startDay||localDay(+start),end:v.endDay>=v.startDay?v.endDay:v.startDay};
  else{const a=new Date((v.startDay||localDay(+start))+'T'+(v.startTime||'09:00')),b0=new Date((v.endDay||v.startDay)+'T'+(v.endTime||'10:00'));
   if(Number.isNaN(+a))return close();const b=Number.isNaN(+b0)||+b0<=+a?new Date(+a+(+end-+start>0?+end-+start:3600000)):b0;
   next={...event,...kept,title:v.title.trim()||LOCAL_EVENT_TITLE,location:v.location.trim(),notes:v.notes.trim(),allDay:false,start:a.toISOString(),end:b.toISOString()};}
  const changed=['title','location','notes','allDay','start','end','repeat','alert'].some(k=>next[k]!==event[k]);detach();if(changed){state.editing=null;state.draft=null;save(next);}else close();};
 form.onsubmit=e=>{e.preventDefault();commit();};
 form.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();detach();close();}};
 const outside=(e:PointerEvent)=>{if(!form.isConnected){detach();return;}if(!form.contains(e.target as Node))commit();};
 const detach=()=>document.removeEventListener('pointerdown',outside,true);
 setTimeout(()=>{if(form.isConnected)document.addEventListener('pointerdown',outside,true);});
 sheet.append(form);
 // Beside the event when there is room, else over the middle of the page.
 const place=()=>{
  const s=sheet.getBoundingClientRect(),f=form.getBoundingClientRect(),a=anchor?.isConnected?anchor.getBoundingClientRect():null;
  let left=(s.width-f.width)/2,top=(s.height-f.height)/2;
  if(a&&a.width){left=a.right-s.left+8;if(left+f.width>s.width-4)left=a.left-s.left-f.width-8;if(left<4)left=(s.width-f.width)/2;top=clamp(a.top-s.top,4,Math.max(4,s.height-f.height-4));}
  form.style.left=Math.max(4,left)+'px';form.style.top=Math.max(4,top)+'px';
 };
 place();requestAnimationFrame(place);
 if(!draft){title.focus({preventScroll:true});title.select();}
}
