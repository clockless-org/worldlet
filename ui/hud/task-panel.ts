// The World's Task panel on the right (owner layout 2026-10-10: Attention on the left, tasks on the right): what the
// person's Agent is doing now, what is planned and what was done today, so they can let it work without asking. It
// mirrors the Attention Center in the corner's own ink, without a card, so it never covers the Applets behind it.
// Core decides every row (core/tasks/task-panel.ts); this only draws them and goes where a row points:
// - Doing now: an Applet's row opens it; Fox's own background work is shown on its name tag as well.
// - Planned: a small read-only popover says when, how often and who runs it (view only in this first version).
// - Done today: a card Fox made opens the Journal on today's page; a scheduled job's result points at its Attention
//   item on the left; a check opens its Applet. More than four end in "N today · Journal".
// It reads the host's `taskPanel` every 30 seconds and after work starts or ends (`worldlet:routines`, `worldlet:job`,
// `worldlet:applet-task`, `worldlet:fox-status`). Hidden while there is nothing to show. In a narrow window it is a
// chip in the top-right that opens the same list; the stylesheet hides it in a short window, beside an open Applet or
// reader, and keeps only Planned during onboarding and the tour (ui/components/layout.css).
import {FOX_STATUS_EVENT} from '../companion/index.ts';
import {uiIcon} from '../components/index.ts';
import {appLogoSource} from '../applets/index.ts';
import {getApp} from '../../core/applets/index.ts';
import {taskPanel,type TaskPanel,type TaskRow,type TaskGroup,type TaskPanelInput} from '../../core/tasks/index.ts';
import {callHost} from '../../platform/bridge/host.ts';

const REFRESH_MS=30_000;
const GROUPS:[TaskGroup,string][]=[['now','Doing now'],['planned','Planned'],['done','Done today']];
const ICONS:Record<string,string>={'agent-job':'clock',fox:'spark',worldlet:'refresh',applet:'refresh',check:'refresh'};
const dayOf=(at:number)=>{const d=new Date(at);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};

export function mountTaskPanel(root:HTMLElement,{call=callHost,openApplet=(_id:string)=>{}}:{call?:(action:string,body?:object)=>Promise<any>;openApplet?:(id:string)=>void}={}){
 const panel=document.createElement('aside');panel.className='task-panel';panel.hidden=true;panel.setAttribute('aria-label','Tasks: doing now, planned and done today');
 const chip=document.createElement('button');chip.type='button';chip.className='task-panel-chip';chip.setAttribute('aria-expanded','false');
 const body=document.createElement('div');body.className='task-panel-body';
 const popover=document.createElement('div');popover.className='task-popover';popover.hidden=true;popover.setAttribute('role','dialog');popover.setAttribute('aria-label','Planned task');
 panel.append(chip,body,popover);root.append(panel);
 const keep=(e:Event)=>{e.stopPropagation();(e as any).worldletKeepFox=true;};
 panel.addEventListener('pointerdown',keep);
 const locked=()=>root.dataset.tourLock==='true'||root.dataset.tourSpotlight==='true';

 let input:TaskPanelInput={},timer=0,loading=false,model:TaskPanel|null=null;
 const fox=new Map<string,{source:string;text:string;at:number}>(),foxDone:{source:string;text:string;at:number}[]=[];

 function closePopover(){popover.hidden=true;popover.replaceChildren();body.querySelector('[aria-expanded=true]')?.setAttribute('aria-expanded','false');}
 function setOpen(open:boolean){panel.dataset.open=String(open);chip.setAttribute('aria-expanded',String(open));if(!open)closePopover();}
 chip.onclick=()=>setOpen(panel.dataset.open!=='true');
 document.addEventListener('pointerdown',e=>{if(!panel.contains(e.target as Node)){closePopover();if(panel.dataset.open==='true')setOpen(false);}},true);
 document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(!popover.hidden)closePopover();else if(panel.dataset.open==='true')setOpen(false);});

 function showPopover(row:TaskRow,button:HTMLElement){
  closePopover();button.setAttribute('aria-expanded','true');
  const title=document.createElement('strong');title.className='task-popover-title';title.textContent=row.title;
  const facts=document.createElement('dl');facts.className='task-popover-facts';
  for(const [label,value] of [['When',row.when||'On its own schedule'],['How often',row.every||''],['Runs on',row.by||'']] as [string,string][]){
   if(!value)continue;const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;facts.append(dt,dd);
  }
  popover.append(title,facts);
  const box=button.getBoundingClientRect(),own=panel.getBoundingClientRect();
  popover.style.top=Math.max(0,box.bottom-own.top+6)+'px';
  popover.hidden=false;
 }
 function go(row:TaskRow,button:HTMLElement){
  if(locked())return;
  if(row.group==='planned'){if(button.getAttribute('aria-expanded')==='true')closePopover();else showPopover(row,button);return;}
  const open=row.open;if(!open)return;
  setOpen(false);
  if('applet' in open){openApplet(open.applet);return;}
  if('attention' in open){
   const item=root.querySelector<HTMLElement>('.world-matter[data-world-item-id="'+CSS.escape(open.attention)+'"]');
   if(item){item.classList.remove('is-pointed');void item.offsetWidth;item.classList.add('is-pointed');item.focus({preventScroll:true});item.scrollIntoView({block:'nearest'});setTimeout(()=>item.classList.remove('is-pointed'),1800);return;}
   window.dispatchEvent(new CustomEvent('worldlet:journal-open',{detail:{day:dayOf(Date.now())}}));return;
  }
  if('journal' in open)window.dispatchEvent(new CustomEvent('worldlet:journal-open',{detail:{day:open.journal,...open.card?{card:open.card}:{}}}));
 }
 function rowButton(row:TaskRow){
  const item=document.createElement('li');item.className='task-item';
  const button=document.createElement('button');button.type='button';button.className='task-row';
  button.dataset.source=row.source;button.dataset.state=row.failed?'failed':row.group;button.dataset.taskId=row.id;
  if(row.group==='planned'){button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-expanded','false');}
  else if(!row.open)button.setAttribute('aria-disabled','true');
  const dot=document.createElement('span');dot.className='task-dot';dot.setAttribute('aria-hidden','true');
  const icon=document.createElement('span');icon.className='task-icon';icon.setAttribute('aria-hidden','true');
  const app=row.open&&'applet' in row.open?getApp(row.open.applet):null,logo=app?appLogoSource(app):'';
  if(logo){const img=document.createElement('img');img.src=logo;img.alt='';icon.append(img);}else icon.innerHTML=uiIcon(ICONS[row.source]||'refresh');
  const title=document.createElement('span');title.className='task-title';title.textContent=row.title+(row.detail?' · '+row.detail:'');
  const when=document.createElement('span');when.className='task-when';when.textContent=row.when;
  button.append(dot,icon,title);if(row.when)button.append(when);
  button.title=[row.title,row.detail,row.when].filter(Boolean).join(' · ');
  button.onclick=e=>{e.stopPropagation();go(row,button);};
  item.append(button);return item;
 }
 function render(){
  model=taskPanel({...input,fox:[...fox.values()],foxDone},Date.now());
  closePopover();body.replaceChildren();
  for(const [group,label] of GROUPS){
   const part=model[group];if(!part.total)continue;
   const section=document.createElement('section');section.className='task-group';section.dataset.group=group;section.setAttribute('aria-label',label);
   const heading=document.createElement('h2');heading.className='task-group-heading';heading.textContent=label;
   const list=document.createElement('ul');list.className='task-list';
   for(const row of part.rows)list.append(rowButton(row));
   section.append(heading,list);
   if(group==='done'&&part.more){
    const more=document.createElement('button');more.type='button';more.className='task-more task-journal';more.innerHTML=uiIcon('book');
    more.append(document.createTextNode(part.total+' today · Journal'));more.setAttribute('aria-label',part.total+' done today: open the Journal');
    more.onclick=e=>{e.stopPropagation();if(locked())return;setOpen(false);window.dispatchEvent(new CustomEvent('worldlet:journal-open',{detail:{day:dayOf(Date.now())}}));};
    section.append(more);
   }else if(part.more){
    const more=document.createElement('p');more.className='task-more';more.textContent='+'+part.more+' more';
    section.append(more);
   }
   body.append(section);
  }
  panel.dataset.planned=String(!!model.planned.total);
  panel.dataset.working=String(!!model.now.total);
  chip.replaceChildren();
  const chipDot=document.createElement('span');chipDot.className='task-dot';chipDot.setAttribute('aria-hidden','true');
  chip.append(chipDot,document.createTextNode(model.chip));
  chip.dataset.state=model.now.total?'now':'planned';
  panel.hidden=model.empty;
  if(model.empty)setOpen(false);
 }
 async function refresh(){
  clearTimeout(timer);timer=window.setTimeout(()=>void refresh(),REFRESH_MS);
  if(loading)return;loading=true;
  try{
   const result=await call('taskPanel');
   input=result&&!result.sample&&typeof result==='object'?{jobs:Array.isArray(result.jobs)?result.jobs:[],harness:typeof result.harness==='string'?result.harness:null,
    history:Array.isArray(result.history)?result.history:[],tasks:Array.isArray(result.tasks)?result.tasks:[],runs:Array.isArray(result.runs)?result.runs:[],working:Array.isArray(result.working)?result.working:[]}:{};
  }catch{/* A failed read keeps the last rows. */}
  finally{loading=false;}
  render();
 }
 const soon=()=>{setTimeout(()=>void refresh(),400);};
 // Fox's background work: the step while it works, then what it made (core/artifacts foxWorkDone), kept for today.
 window.addEventListener(FOX_STATUS_EVENT,(e:any)=>{
  const source=String(e.detail?.source||'work'),said=String(e.detail?.text||'').trim(),made=String(e.detail?.done||'').trim();
  const now=Date.now();
  if(said)fox.set(source,{source,text:said,at:fox.get(source)?.at??now});
  else{fox.delete(source);if(made)foxDone.push({source,text:made,at:now});}
  render();
 });
 for(const name of ['worldlet:routines','worldlet:job','worldlet:applet-task'])window.addEventListener(name,soon);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
 void refresh();
 return {panel,refresh};
}
