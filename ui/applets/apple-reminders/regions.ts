import {node,uiIcon,facts} from '../../style/index.ts';
import type {AppletSceneRegion} from '../scene/applet-scene.ts';
import {reminderView,visibleReminders,reminderCompleted,reminderList,reminderDate} from './view-state.ts';
/** The host assigns semantic surfaces; the package only measures the paper they sit on. */
export function reminderRegions(regions:readonly AppletSceneRegion[]){
 const get=(id:string)=>regions.find(r=>r.id===id&&!r.element.hidden)?.element;
 const navigation=get('navigation'),details=get('details'),heading=get('heading'),status=get('status');
 return navigation&&details&&heading&&status?{navigation,details,heading,status}:null;
}
export function renderReminderRegions(panel:HTMLElement,items:any[],value:any,owner:object,pick:(item:any)=>void,slots:NonNullable<ReturnType<typeof reminderRegions>>){
 const state=reminderView(owner),now=new Date(value?.now||Date.now());
 const regions={tasks:panel,...slots};for(const [name,region] of Object.entries(regions)){region.replaceChildren();region.classList.add('reminders-region','reminders-region-'+name);}
 panel.classList.add('reminders-host');
 const icon=(name:string)=>{const span=node('span','reminders-icon');span.setAttribute('aria-hidden','true');if(name==='completed'){span.textContent='✓';span.classList.add('reminders-completed-icon');}else span.innerHTML=uiIcon(name);return span;};
 const button=(label:string,run:()=>void,cls='')=>{const b=node('button',cls,label);b.type='button';b.onclick=run;return b;};
 const header=node('header','reminders-region-heading'),title=node('h2','',value?.sample?'Reminders · Demo':'Reminders'),searchBox=node('label','reminders-region-searchbox');
 const search=node('input','reminders-search');search.type='search';search.placeholder='Search reminders…';search.setAttribute('aria-label','Search reminders');search.value=state.query;searchBox.append(icon('search'),search);
 header.append(title,searchBox,node('span','reminders-readonly','Read-only'));slots.heading.append(header);
 const navigation=node('nav','reminders-region-navigation');navigation.setAttribute('aria-label','Reminder view');slots.navigation.append(navigation);
 const board=node('section','reminders-board reminders-region-board'),heading=node('h3','reminders-view-title'),list=node('div','reminders-tasks');list.setAttribute('aria-label','Reminders');board.append(heading,list);panel.append(board);
 const footer=node('footer','reminders-region-status');footer.append(node('span','',value?.scope||(value?.sample?'Demo reminders · Read-only.':'Synced reminders · Read-only.')));if(value?.reminders?.create)footer.append(button('Add with Fox',()=>value.reminders.create()));slots.status.append(footer);
 const categories=[['all','All reminders','file'],['today','Today','calendar'],['scheduled','Scheduled','clock'],['completed','Completed','completed']];
 function paintNavigation(){
  navigation.replaceChildren();for(const [key,label,glyph] of categories){const b=button(label,()=>{state.filter=key;paintNavigation();paintList();navigation.querySelector<HTMLButtonElement>('[aria-pressed=true]')?.focus({preventScroll:true});});b.prepend(icon(glyph));b.dataset.filter=key;b.setAttribute('aria-pressed',String(state.filter===key));navigation.append(b);}
  const groups=[...new Set(items.map(reminderList))];if(state.list&&!groups.includes(state.list))state.list='';
  if(groups.length>1){const select=node('select','reminders-lists');select.setAttribute('aria-label','Reminder list');for(const group of ['',...groups]){const option=node('option','',group||'All lists');option.value=group;select.append(option);}select.value=state.list;select.onchange=()=>{state.list=select.value;paintList();};navigation.append(select);}
 }
 function paintDetails(item){
  const detail=slots.details;detail.replaceChildren();detail.setAttribute('aria-label','Selected reminder');detail.setAttribute('aria-live','polite');
  if(!item){detail.append(node('p','reminders-empty','Select a reminder to see its details.'));return;}
  detail.append(node('h3','reminders-detail-title',item.title));
  const due=reminderDate(item),when=due?due.toDateString()===now.toDateString()?'Today':due.toLocaleDateString(undefined,{month:'short',day:'numeric'}):'Not scheduled';
  detail.append(facts([['List',reminderList(item)],['Due',when],['Source',value?.sample?'Demo reminders':'System Reminders']]));
  detail.append(node('p','reminders-preview-label','Read-only preview'));
  const original=button('',()=>pick(item),'reminders-original');original.setAttribute('aria-label','Open original reminder: '+item.title);original.append(node('strong','',item.title),node('small','',String(item.record?.text||item.summary||item.context||'Open the original reminder for details.')));detail.append(original);
 }
 function paintList(){
  const rows=visibleReminders(items,state,now);if(!rows.some(i=>i.id===state.selected))state.selected=rows[0]?.id||'';
  heading.textContent=state.filter==='all'&&rows.length&&rows.every(i=>reminderDate(i)?.toDateString()===now.toDateString())?'Today':categories.find(c=>c[0]===state.filter)?.[1]||'Reminders';
  list.replaceChildren();
  for(const item of rows){
   const row=button('',()=>{state.selected=item.id;paintList();list.querySelector<HTMLButtonElement>('[aria-pressed=true]')?.focus({preventScroll:true});},'reminders-task');row.dataset.itemId=item.id;row.dataset.completed=String(reminderCompleted(item));row.setAttribute('aria-label',item.title);row.setAttribute('aria-pressed',String(state.selected===item.id));
   const check=node('input','reminders-check');check.type='checkbox';check.checked=reminderCompleted(item);check.disabled=true;check.tabIndex=-1;check.setAttribute('aria-label',check.checked?'Completed':'Not completed');
   const copy=node('span','reminders-copy');copy.append(node('strong','',item.title),node('small','',reminderList(item)));row.append(check,copy);list.append(row);
  }
  if(!rows.length)list.append(node('p','reminders-empty',items.length?'No matching reminders.':value?.reading?'Reading reminders…':value?.error?'Could not read reminders.':value?.connected?'Nothing on your list.':'Connect Reminders with Fox to see your lists.'));
  paintDetails(rows.find(i=>i.id===state.selected));
 }
 search.oninput=()=>{state.query=search.value;paintList();};paintNavigation();paintList();return items;
}
