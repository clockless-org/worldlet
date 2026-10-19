import {attentionIcon} from '../../attention/index.ts';
import {node} from '../../style/index.ts';
/** Read-only native reminders, arranged on the theme's task board. Mutations are prepared with Fox. */
const boards=new WeakMap<object,{filter:string;list:string;query:string}>();
export function renderRemindersOpen(panel:HTMLElement,items:any[],value:any,owner:object,pick:(item:any)=>void){
 const state=boards.get(owner)||{filter:'all',list:'',query:''};boards.set(owner,state);panel.classList.add('reminders-host');
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
  tabs.replaceChildren();for(const [key,label] of [['all','All'],['today','Today'],['scheduled','Scheduled']]){const b=node('button','',label);b.type='button';b.setAttribute('aria-pressed',String(state.filter===key));b.onclick=()=>{state.filter=key;paint();};tabs.append(b);}
  const date=item=>{const raw=item.record?.due||item.start;if(!raw)return null;const d=new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(raw))?raw+'T12:00:00':raw);return Number.isNaN(+d)?null:d;};
  const rows=items.filter(i=>(!state.list||(i.record?.list||'Reminders')===state.list)&&(!state.query||[i.title,i.summary,i.record?.list].join(' ').toLowerCase().includes(state.query.toLowerCase()))&&(state.filter==='all'||state.filter==='scheduled'&&date(i)||state.filter==='today'&&date(i)?.toDateString()===now.toDateString()));
  const groups=[...new Set(items.map(i=>i.record?.list||'Reminders'))];
  rows.sort((a,b)=>groups.indexOf(a.record?.list||'Reminders')-groups.indexOf(b.record?.list||'Reminders')||Number(!!b.attention)-Number(!!a.attention)||+(date(a)||Infinity)-+(date(b)||Infinity));
  list.replaceChildren();let last='';
  for(const item of rows){const group=item.record?.list||'Reminders';if(group!==last){list.append(node('h3','reminders-group',group));last=group;}
   const row=node('button','reminders-task');row.type='button';row.dataset.itemId=item.id;row.setAttribute('aria-label',item.title);row.onclick=()=>pick(item);
   const check=node('input','reminders-check') as HTMLInputElement;check.type='checkbox';check.checked=item.record?.completed===true||item.record?.completed==='true';check.disabled=true;check.tabIndex=-1;check.setAttribute('aria-label',check.checked?'Completed':'Not completed');
   const copy=node('span','reminders-copy');copy.append(node('strong','',item.title));const due=date(item);if(due){const time=node('time','',due.toLocaleDateString(undefined,{month:'short',day:'numeric'}));time.dateTime=due.toISOString();copy.append(time);}
   if(item.summary||item.context)copy.append(node('small','',item.summary||item.context));row.append(check,copy);if(item.attention){const mark=node('i','applet-attention applet-item-attention');mark.dataset.state=item.attention.state;mark.innerHTML=attentionIcon(item.attention.state,false,item.attention.priority);mark.setAttribute('aria-hidden','true');row.append(mark);}row.dataset.completed=String(check.checked);row.dataset.attention=String(!!item.attention);list.append(row);
  }
  if(!rows.length)list.append(node('p','reminders-empty',state.query||state.filter!=='all'?'No matching reminders.':value?.reading?'Reading reminders…':value?.error?'Could not read reminders.':value?.connected?'Nothing on your list.':'Connect Reminders with Fox to see your lists.'));
 }
 search.oninput=()=>{state.query=search.value;paint();};select.onchange=()=>{state.list=select.value;paint();};paint();return items;
}
