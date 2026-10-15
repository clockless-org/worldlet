import {attentionIcon} from '../../attention/index.ts';
import {node} from '../../components/index.ts';
import type {AppletSceneRegion} from '../scene/applet-scene.ts';
import {reminderView,visibleReminders,reminderDate,reminderCompleted} from './view-state.ts';
import {reminderRegions,renderReminderRegions} from './regions.ts';
/** Read-only native reminders, arranged on the theme's task board. Mutations are prepared with Fox. */
export function renderRemindersOpen(panel:HTMLElement,items:any[],value:any,owner:object,pick:(item:any)=>void,regions:readonly AppletSceneRegion[]=[]){
 const active=document.activeElement as HTMLInputElement|null;
 const ownsFocus=!!active&&(panel.contains(active)||regions.some(r=>r.element.contains(active)));
 const focus=ownsFocus?{id:active?.dataset.itemId,filter:active?.dataset.filter,label:active?.getAttribute('aria-label'),start:active?.selectionStart,end:active?.selectionEnd}:null;
 for(const region of regions){region.element.classList.remove('reminders-region','reminders-region-tasks','reminders-region-navigation','reminders-region-details','reminders-region-heading','reminders-region-status');if(region.element!==panel)region.element.replaceChildren();}
 panel.replaceChildren();
 const slots=reminderRegions(regions),result=slots?renderReminderRegions(panel,items,value,owner,pick,slots):renderReminderBoard(panel,items,value,owner,pick);
 if(focus){const roots=[panel,...regions.map(r=>r.element)],controls=roots.flatMap(r=>Array.from(r.querySelectorAll<HTMLElement>('button,input,select')));
  const replacement=controls.find(e=>focus.id?e.dataset.itemId===focus.id:focus.filter?e.dataset.filter===focus.filter:focus.label&&e.getAttribute('aria-label')===focus.label);
  replacement?.focus({preventScroll:true});if(replacement instanceof HTMLInputElement&&focus.start!=null&&['search','text'].includes(replacement.type))replacement.setSelectionRange(focus.start,focus.end);
 }
 return result;
}
function renderReminderBoard(panel:HTMLElement,items:any[],value:any,owner:object,pick:(item:any)=>void){
 const state=reminderView(owner);panel.classList.add('reminders-host');
 const board=node('section','reminders-board'),header=node('header','reminders-header'),title=node('h2','','Reminders');
 const now=new Date(value?.now||Date.now());header.append(title,node('p','',now.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'})));
 const controls=node('div','reminders-controls'),tabs=node('nav','reminders-tabs');tabs.setAttribute('aria-label','Reminder view');
 const select=node('select','reminders-lists') as HTMLSelectElement;select.setAttribute('aria-label','Reminder list');
 for(const name of ['',...new Set(items.map(i=>i.record?.list||'Reminders'))]){const option=node('option','',name||'All lists') as HTMLOptionElement;option.value=name;select.append(option);}
 if(!Array.from(select.options).some(o=>o.value===state.list))state.list='';select.value=state.list;
 const search=node('input','reminders-search') as HTMLInputElement;search.type='search';search.placeholder='Find a reminder…';search.setAttribute('aria-label','Search reminders');search.value=state.query;
 controls.append(tabs,select,search);const list=node('div','reminders-tasks');list.setAttribute('aria-label','Reminders');
 const footer=node('footer','reminders-footer');if(value?.reminders?.create){const add=node('button','','Add a reminder with Fox');add.type='button';add.onclick=()=>value.reminders.create();footer.append(add);}footer.append(node('small','','Synced reminders · Open a task for details'));
 board.append(header,controls,list,footer);panel.append(board);
 function paint(){
  tabs.replaceChildren();for(const [key,label] of [['all','All'],['today','Today'],['scheduled','Scheduled'],['completed','Completed']]){const b=node('button','',label);b.type='button';b.dataset.filter=key;b.setAttribute('aria-pressed',String(state.filter===key));b.onclick=()=>{state.filter=key;paint();tabs.querySelector<HTMLButtonElement>('[aria-pressed=true]')?.focus({preventScroll:true});};tabs.append(b);}
  const date=reminderDate,rows=visibleReminders(items,state,now);
  list.replaceChildren();let last='';
  for(const item of rows){const group=item.record?.list||'Reminders';if(group!==last){list.append(node('h3','reminders-group',group));last=group;}
   const row=node('button','reminders-task');row.type='button';row.dataset.itemId=item.id;row.setAttribute('aria-label',item.title);row.onclick=()=>pick(item);
   const check=node('input','reminders-check') as HTMLInputElement;check.type='checkbox';check.checked=reminderCompleted(item);check.disabled=true;check.tabIndex=-1;check.setAttribute('aria-label',check.checked?'Completed':'Not completed');
   const copy=node('span','reminders-copy');copy.append(node('strong','',item.title));const due=date(item);if(due){const time=node('time','',due.toLocaleDateString(undefined,{month:'short',day:'numeric'}));time.dateTime=due.toISOString();copy.append(time);}
   if(item.summary||item.context)copy.append(node('small','',item.summary||item.context));row.append(check,copy);if(item.attention){const mark=node('i','applet-attention applet-item-attention');mark.dataset.state=item.attention.state;mark.innerHTML=attentionIcon(item.attention.state,false,item.attention.priority);mark.setAttribute('aria-hidden','true');row.append(mark);}row.dataset.completed=String(check.checked);row.dataset.attention=String(!!item.attention);list.append(row);
  }
  if(!rows.length)list.append(node('p','reminders-empty',state.query||state.filter!=='all'?'No matching reminders.':value?.reading?'Reading reminders…':value?.error?'Could not read reminders.':value?.connected?'Nothing on your list.':'Connect Reminders with Fox to see your lists.'));
 }
 search.oninput=()=>{state.query=search.value;paint();};select.onchange=()=>{state.list=select.value;paint();};paint();return items;
}
