// The World's Task panel on the right (owner layout 2026-10-10: Attention on the left, tasks on the right; owner
// feedback 2026-10-11: float on the World like the Attention Center, planned work as a timeline going down, and what
// has started as a small window with Fox working in it). It shows what the person's Agent is doing now, what is
// planned and what was done today, so they can let it work without asking. Core decides every row
// (core/tasks/task-panel.ts); this only draws them and goes where a row points:
// - Doing now: one small window for the newest work. When Fox drives a web page it shows that page, small, refreshed
//   every few seconds (host `taskPanelPage`), and a click opens the page; otherwise a dark terminal window with Fox in
//   its corner and the last few status lines, and a click opens its whole log (the step, when it started, who does
//   it). Several at once: "+N more" under the window.
// - Planned: a timeline going down from Now, each row's time beside its dot, under the day it runs; a row opens a
//   small read-only popover saying when, how often and who runs it (view only in this first version). Fox's next
//   morning brief and today's summary stand there too, from the page that asks for them (`worldlet:daily-planned`).
// - Done today: a short list under the timeline; a card Fox made opens the Journal on today's page, a scheduled job's
//   result points at its Attention item on the left, a check opens its Applet. More than four end in "N today · Journal".
// It reads the host's `taskPanel` every 30 seconds and after work starts or ends (`worldlet:routines`, `worldlet:job`,
// `worldlet:applet-task`, `worldlet:fox-status`). Hidden while there is nothing to show. In a narrow window it is a
// chip in the top-right that opens the same panel; the stylesheet hides it in a short window, beside an open Applet or
// reader, and keeps only Planned during onboarding and the tour (ui/components/layout.css).
import {FOX_STATUS_EVENT} from '../companion/index.ts';
import {uiIcon} from '../components/index.ts';
import {appLogoSource} from '../applets/index.ts';
import {companionStill} from '../themes/index.ts';
import {getApp} from '../../core/applets/index.ts';
import {taskPanel,routineClock,type TaskPanel,type TaskRow,type TaskPanelInput} from '../../core/tasks/index.ts';
import {callHost} from '../../platform/bridge/host.ts';

const REFRESH_MS=30_000;
/** How often the window's picture of Fox's page is taken again while Fox drives one. */
const PAGE_MS=3000;
/** Status lines the terminal window shows; its open log keeps up to LOG_MAX. */
const TERMINAL_LINES=4,LOG_MAX=40;
const ICONS:Record<string,string>={'agent-job':'clock',fox:'spark',worldlet:'refresh',applet:'refresh',check:'refresh'};
const dayOf=(at:number)=>{const d=new Date(at);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
const el=<K extends keyof HTMLElementTagNameMap>(tag:K,cls='',text?:string)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};

export function mountTaskPanel(root:HTMLElement,{call=callHost,openApplet=(_id:string)=>{}}:{call?:(action:string,body?:object)=>Promise<any>;openApplet?:(id:string)=>void}={}){
 const panel=el('aside','task-panel');panel.hidden=true;panel.setAttribute('aria-label','Tasks: doing now, planned and done today');
 const chip=el('button','task-panel-chip');chip.type='button';chip.setAttribute('aria-expanded','false');
 const body=el('div','task-panel-body');
 const popover=el('div','task-popover');popover.hidden=true;popover.setAttribute('role','dialog');popover.setAttribute('aria-label','Planned task');
 panel.append(chip,body,popover);root.append(panel);
 panel.addEventListener('pointerdown',e=>{e.stopPropagation();(e as any).worldletKeepFox=true;});
 const locked=()=>root.dataset.tourLock==='true'||root.dataset.tourSpotlight==='true';

 let input:TaskPanelInput={},timer=0,pageTimer=0,loading=false,model:TaskPanel|null=null,expanded='';
 let page:{url:string;title:string;image:string;steps:{text:string;done:boolean}[]}|null=null;
 const fox=new Map<string,{source:string;text:string;at:number}>(),foxDone:{source:string;text:string;at:number}[]=[];
 let daily:{kind:'plan'|'summary';at:number}[]=[];
 /** What each running task has said, oldest first, kept while it runs: the terminal's lines and its open log. */
 const logs=new Map<string,{at:number;text:string}[]>();

 function closePopover(){popover.hidden=true;popover.replaceChildren();body.querySelector('.task-step[aria-expanded=true]')?.setAttribute('aria-expanded','false');}
 function setOpen(open:boolean){panel.dataset.open=String(open);chip.setAttribute('aria-expanded',String(open));if(!open)closePopover();}
 chip.onclick=()=>setOpen(panel.dataset.open!=='true');
 document.addEventListener('pointerdown',e=>{if(!panel.contains(e.target as Node)){closePopover();if(panel.dataset.open==='true')setOpen(false);}},true);
 document.addEventListener('keydown',e=>{
  if(e.key!=='Escape')return;
  if(!popover.hidden)closePopover();else if(expanded){expanded='';render();}else if(panel.dataset.open==='true')setOpen(false);
 });

 function showPopover(row:TaskRow,button:HTMLElement){
  closePopover();button.setAttribute('aria-expanded','true');
  const facts=el('dl','task-popover-facts');
  for(const [label,value] of [['When',row.when||'On its own schedule'],['How often',row.every||''],['Runs on',row.by||'']] as [string,string][]){
   if(value)facts.append(el('dt','',label),el('dd','',value));
  }
  popover.append(el('strong','task-popover-title',row.title),facts);
  const box=button.getBoundingClientRect(),own=panel.getBoundingClientRect();
  popover.style.top=Math.max(0,box.bottom-own.top+6)+'px';
  popover.hidden=false;
 }
 function go(row:TaskRow){
  if(locked())return;
  const open=row.open;if(!open)return;
  setOpen(false);
  if('applet' in open){openApplet(open.applet);return;}
  if('url' in open){window.dispatchEvent(new CustomEvent('worldlet:open-url',{detail:{url:open.url}}));return;}
  if('attention' in open){
   const item=root.querySelector<HTMLElement>('.world-matter[data-world-item-id="'+CSS.escape(open.attention)+'"]');
   if(item){item.classList.remove('is-pointed');void item.offsetWidth;item.classList.add('is-pointed');item.focus({preventScroll:true});item.scrollIntoView({block:'nearest'});setTimeout(()=>item.classList.remove('is-pointed'),1800);return;}
   window.dispatchEvent(new CustomEvent('worldlet:journal-open',{detail:{day:dayOf(Date.now())}}));return;
  }
  if('journal' in open)window.dispatchEvent(new CustomEvent('worldlet:journal-open',{detail:{day:open.journal,...open.card?{card:open.card}:{}}}));
 }
 const section=(group:string,label:string)=>{const part=el('section','task-group');part.dataset.group=group;part.setAttribute('aria-label',label);part.append(el('h2','task-group-heading',label));return part;};

 // Doing now: one window. ----------------------------------------------------------------------------------------
 function remember(row:TaskRow){
  const log=logs.get(row.id)??[];
  for(const text of row.lines??[])if(!log.some(line=>line.text===text))log.push({at:Date.now(),text});
  logs.set(row.id,log.slice(-LOG_MAX));
 }
 function windowCard(row:TaskRow,others:TaskRow[],behind:number){
  const part=section('now','Doing now');
  const card=el('button','task-window');card.type='button';card.dataset.taskId=row.id;
  const pageMode=!!row.url&&!!page;
  card.dataset.mode=pageMode?'page':'terminal';
  const bar=el('span','task-window-bar');
  bar.append(el('span','task-window-lights'),el('span','task-window-title',pageMode?row.title.replace(/^Fox is working on /,''):row.who||'Fox'));
  if(pageMode){
   const shot=el('span','task-window-page');
   if(page!.image){const img=el('img');img.src=page!.image;img.alt='';shot.append(img);}
   const step=el('span','task-window-step',row.detail?'Fox · '+row.detail:'Fox is working on this page');
   card.append(bar,shot,step);
   card.setAttribute('aria-label',row.title+(row.detail?': '+row.detail:'')+'. Open the page');
  }else{
   const isOpen=expanded===row.id;
   card.setAttribute('aria-expanded',String(isOpen));
   const screen=el('span','task-terminal');
   const avatar=el('img','task-terminal-fox');avatar.src=companionStill();avatar.alt='';
   const log=logs.get(row.id)??[];
   if(isOpen){
    const facts=el('span','task-terminal-facts');
    for(const [label,value] of [['step',row.title],['started',row.at?routineClock(Math.min(row.at,Date.now())):''],['by',row.who||'Fox']] as [string,string][])if(value)facts.append(el('span','task-terminal-fact',label+': '+value));
    screen.append(facts);
   }
   const lines=el('span','task-terminal-lines');
   for(const line of isOpen?log:log.slice(-TERMINAL_LINES)){const item=el('span','task-terminal-line');item.append(el('span','task-terminal-time',routineClock(line.at).replace(/\s?[AP]M$/i,'')),document.createTextNode(line.text));lines.append(item);}
   const cursor=el('span','task-terminal-cursor');cursor.setAttribute('aria-hidden','true');lines.append(cursor);
   screen.append(avatar,lines);
   card.append(bar,screen);
   card.setAttribute('aria-label',row.title+'. '+(isOpen?'Close':'Open')+' its status');
  }
  card.title=[row.title,row.detail].filter(Boolean).join(' · ');
  card.onclick=e=>{
   e.stopPropagation();if(locked())return;
   if(card.dataset.mode==='page'){go(row);return;}
   expanded=expanded===row.id?'':row.id;render();
  };
  part.append(card);
  if(behind){
   const more=el('p','task-more','+'+behind+' more'+(others.length?' · '+others.map(o=>o.title).join(', '):''));
   more.title=others.map(o=>o.title).join('\n');part.append(more);
  }
  return part;
 }
 // Planned: a timeline going down from Now. ---------------------------------------------------------------------
 function timeline(rows:TaskRow[],more:number){
  const part=section('planned','Planned');
  const list=el('ol','task-timeline');
  const nowMark=el('li','task-timeline-now');nowMark.append(el('span','','Now'),el('span'));list.append(nowMark);
  let day='';
  for(const row of rows){
   const label=row.day||'';
   if(label&&label!==day&&label!=='Today'){day=label;list.append(el('li','task-timeline-day',label));}else if(label)day=label;
   const item=el('li','task-timeline-item');
   const step=el('button','task-step');step.type='button';step.dataset.taskId=row.id;step.dataset.source=row.source;
   step.setAttribute('aria-haspopup','dialog');step.setAttribute('aria-expanded','false');
   step.append(el('span','task-time',row.clock||row.when),el('span','task-dot'),el('span','task-title',row.title));
   step.title=[row.title,row.when].filter(Boolean).join(' · ');
   step.onclick=e=>{e.stopPropagation();if(locked())return;if(step.getAttribute('aria-expanded')==='true')closePopover();else showPopover(row,step);};
   item.append(step);list.append(item);
  }
  part.append(list);
  if(more)part.append(el('p','task-more','+'+more+' more'));
  return part;
 }
 // Done today: a short list. -------------------------------------------------------------------------------------
 function doneList(rows:TaskRow[],total:number,more:number){
  const part=section('done','Done today');
  const list=el('ul','task-list');
  for(const row of rows){
   const item=el('li','task-item'),button=el('button','task-row');button.type='button';
   button.dataset.source=row.source;button.dataset.state=row.failed?'failed':'done';button.dataset.taskId=row.id;
   if(!row.open)button.setAttribute('aria-disabled','true');
   const icon=el('span','task-icon');icon.setAttribute('aria-hidden','true');
   const app=row.open&&'applet' in row.open?getApp(row.open.applet):null,logo=app?appLogoSource(app):'';
   if(logo){const img=el('img');img.src=logo;img.alt='';icon.append(img);}else icon.innerHTML=uiIcon(ICONS[row.source]||'refresh');
   button.append(el('span','task-dot'),icon,el('span','task-title',row.title+(row.detail?' · '+row.detail:'')),el('span','task-when',row.when));
   button.title=[row.title,row.detail,row.when].filter(Boolean).join(' · ');
   button.onclick=e=>{e.stopPropagation();go(row);};
   item.append(button);list.append(item);
  }
  part.append(list);
  if(more){
   const journal=el('button','task-more task-journal');journal.type='button';journal.innerHTML=uiIcon('book');
   journal.append(document.createTextNode(total+' today · Journal'));journal.setAttribute('aria-label',total+' done today: open the Journal');
   journal.onclick=e=>{e.stopPropagation();if(locked())return;setOpen(false);window.dispatchEvent(new CustomEvent('worldlet:journal-open',{detail:{day:dayOf(Date.now())}}));};
   part.append(journal);
  }
  return part;
 }
 function render(){
  model=taskPanel({...input,page,fox:[...fox.values()],foxDone,daily},Date.now());
  for(const row of model.now.rows)remember(row);
  const live=new Set(model.now.rows.map(row=>row.id));for(const id of logs.keys())if(!live.has(id))logs.delete(id);
  if(expanded&&!live.has(expanded))expanded='';
  closePopover();body.replaceChildren();
  if(model.now.total){const [first,...rest]=model.now.rows;body.append(windowCard(first,rest,model.now.total-1));}
  if(model.planned.total)body.append(timeline(model.planned.rows,model.planned.more));
  if(model.done.total)body.append(doneList(model.done.rows,model.done.total,model.done.more));
  panel.dataset.planned=String(!!model.planned.total);
  panel.dataset.working=String(!!model.now.total);
  chip.replaceChildren(el('span','task-dot'),document.createTextNode(model.chip));
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
 // The page Fox drives, read again every few seconds while the window is visible: cheap when there is none.
 async function readPage(){
  clearTimeout(pageTimer);pageTimer=window.setTimeout(()=>void readPage(),PAGE_MS);
  if(document.hidden)return;
  let next:typeof page=null;
  try{const value=(await call('taskPanelPage'))?.page;if(value&&typeof value.url==='string')next={url:value.url,title:String(value.title||''),image:typeof value.image==='string'&&value.image.startsWith('data:image/')?value.image:'',steps:Array.isArray(value.steps)?value.steps:[]};}catch{}
  const changed=JSON.stringify(next)!==JSON.stringify(page);page=next;
  if(changed)render();
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
 // When Fox makes the next morning brief and today's summary, from the page that asks for them (ui/shell/notion-world.ts).
 window.addEventListener('worldlet:daily-planned',(e:any)=>{
  const next=(Array.isArray(e.detail?.planned)?e.detail.planned:[]).filter((p:any)=>(p?.kind==='plan'||p?.kind==='summary')&&Number.isFinite(p.at)).slice(0,2);
  if(JSON.stringify(next)!==JSON.stringify(daily)){daily=next;render();}
 });
 for(const name of ['worldlet:routines','worldlet:job','worldlet:applet-task'])window.addEventListener(name,soon);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){void refresh();void readPage();}});
 void refresh();void readPage();
 return {panel,refresh};
}
