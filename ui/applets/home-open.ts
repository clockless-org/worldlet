import {attentionIcon} from '../attention/index.ts';
import {calendarDay} from '../world/index.ts';
import {node} from '../components/index.ts';
import {renderCalendar,type CalendarState} from './google-calendar/grid.ts';
export {localCalendarItems} from './google-calendar/grid.ts';
export type HomeOpenState=CalendarState;
export function calendarWindow(now:number,mode:HomeOpenState['mode'],offset:number){
 const start=new Date(now);start.setHours(12,0,0,0);
 if(mode==='month'){start.setDate(1);start.setMonth(start.getMonth()+offset);}
 else{start.setDate(start.getDate()+offset*(mode==='week'?7:1));if(mode==='week')start.setDate(start.getDate()-((start.getDay()+6)%7));}
 const count=mode==='month'?new Date(start.getFullYear(),start.getMonth()+1,0).getDate():mode==='week'?7:1;
 return Array.from({length:count},(_,i)=>{const d=new Date(start);d.setDate(d.getDate()+i);return d;});
}
export function renderHomeOpen(panel,room,items,value,state:HomeOpenState,pick,redraw){
 const calendar=room.key==='google-calendar',notes=room.key==='apple-notes';panel.classList.add('home-open');
 panel.dataset.homeKind=calendar?'calendar':notes?'notes':'reminders';panel.dataset.calendarMode=state.mode;
 const sheet=node('section','home-open-sheet'),header=node('header','home-open-header'),title=node('h2','',room.title);panel.append(sheet);sheet.append(header);header.append(title);
 const art=(globalThis as any).__WORLDLET_25D_ASSETS__?.open?.[room.key];if(calendar&&art){const image=document.createElement('img');image.className='home-calendar-art';image.src=art;image.alt='';image.draggable=false;sheet.prepend(image);}
 const body=node('div','home-open-body');sheet.append(body);const shown=[];
 function itemButton(item){
  const button=node('button','home-leaf');button.type='button';button.dataset.itemId=item.id;button.dataset.attention=String(!!item.attention);button.title=item.record?.title||item.title;
  if(item.attention){const mark=node('i','applet-attention applet-item-attention');mark.dataset.state=item.attention.state;mark.innerHTML=attentionIcon(item.attention.state,false,item.attention.priority);mark.setAttribute('aria-hidden','true');button.append(mark);}
  if(!calendar&&!notes)button.append(node('span','home-task-check','○'));
  const text=node('span','home-leaf-text');text.append(node('strong','',item.title));
  const meta=calendar?(item.allDay?'All day':item.start?new Date(item.start).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}):'Time not set'):[item.record?.folder||item.record?.list,item.when].filter(Boolean).join(' · ');
  if(meta)text.append(node('small','',meta));
  if(notes&&(item.summary||item.context))text.append(node('p','',item.summary||item.context));
  button.append(text);button.onclick=()=>pick(item);shown.push(item);return button;
 }
 if(calendar){
  const modes=node('nav','home-calendar-modes');modes.setAttribute('aria-label','Calendar view');
  for(const mode of ['day','week','month'] as const){const b=node('button','',mode[0].toUpperCase()+mode.slice(1));b.type='button';b.setAttribute('aria-pressed',String(state.mode===mode));b.onclick=()=>{state.mode=mode;state.offset=0;state.editing=null;redraw();};modes.append(b);}header.append(modes);
  const days=calendarWindow(value?.now||Date.now(),state.mode,state.offset),nav=node('nav','home-calendar-navigation');nav.setAttribute('aria-label','Calendar dates');
  for(const [label,delta] of [['Previous',-1],['Next',1]] as const){const b=node('button','',delta<0?'‹':'›');b.type='button';b.setAttribute('aria-label',label+' '+state.mode);b.onclick=()=>{state.offset+=delta;state.editing=null;redraw();};nav.append(b);}
  const period=node('strong','',state.mode==='month'?days[0].toLocaleDateString(undefined,{month:'long',year:'numeric'}):days[0].toLocaleDateString(undefined,{month:'short',day:'numeric'})+(state.mode==='week'?' – '+days[6].toLocaleDateString(undefined,{month:'short',day:'numeric'}):''));nav.insertBefore(period,nav.lastChild);sheet.insertBefore(nav,body);
  renderCalendar({sheet,nav,body,items,value,state,days,itemButton,redraw});
 }else{
  const ordered=[...items].sort((a,b)=>Number(!!b.attention)-Number(!!a.attention));for(const item of ordered)body.append(itemButton(item));
 }
 if(!items.length&&!calendar)body.append(node('p','home-open-empty',value?.error||(value?.reading?'Reading…':value?.connected?(calendar?'No events saved.':notes?'Your notebook is ready.':'Nothing on your list.'):'Connect with Fox to see your '+(calendar?'calendar':notes?'notes':'reminders')+'.')));
 return shown;
}
