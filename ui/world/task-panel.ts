// The World's tasks beside Fox (owner request 2026-10-11: "小狐狸在两边，中间是我们直接跟他交流的入口，两边就是这种任务正在
// 运行啊或者即将运行的"). Fox and its message bar stay in the middle as the way to talk to the Agent; the scheduled
// Routines stand on Fox's left and what the Agent is doing now on its right (owner request 2026-10-11, "routines 放左边
// … 正在做的 task 放右边"), each one small card in the same style:
// its picture, a short name and one line of what it is doing or when it runs. A running card has a turning ring and a
// thin bar under it (how far along when that is known); a coming routine has a clock. What is finished lives only in
// the Journal. Core decides every row and its words (agent/tasks/task-panel.ts); this only draws them:
// - Up to two cards a side in a wide World, one in a narrower one, then "+N" for the rest; under 820px wide only the
//   count, which opens the whole list.
// - A card moves to where its work is: a Routine that starts runs across from the left to the right, and a turn in
//   which Fox does something (a tool runs) rises from the message bar into the right as a card of its own, gone when
//   the turn ends.
// - A running card opens a small window above it with everything that task said (the step, when it started, who does
//   it), or, while Fox drives a web page, the page itself. A routine opens a popover saying when, how often and who
//   runs it, with its own controls (owner request 2026-10-12, "左边的 routines 要可以删除可以重启可以修改"): an Agent's job
//   can Run now, Pause or Resume, Edit (its name, what it does and when) and Remove, each the Agent's own command (host
//   `harnessSchedule`, as in Settings › Agents › Your Agent › Routines) after one plain question in the popover; Worldlet's two daily
//   Routines Pause or Resume (Worldlet's own setting, never the Agent). A paused one stays as a Paused card to resume.
// It reads the host's `taskPanel` every 30 seconds and after work starts or ends (`worldlet:routines`, `worldlet:job`,
// `worldlet:applet-task`, `worldlet:fox-status`). Hidden while there is nothing to show; the stylesheet hides it in a
// short window and beside an open Applet or reader, and keeps only Routines during
// onboarding and the tour (ui/style/layout.css).
import {FOX_STATUS_EVENT} from '../companion/index.ts';
import {routineTimePicker,routineWhenLine,scheduleWhen} from '../settings/index.ts';
import {companionStill,themeAppletIcon} from '../style/index.ts';
import {taskPanel,routineClock,type TaskPanel,type TaskRow,type TaskPanelInput} from '../../agent/tasks/index.ts';
import {callHost} from '../../platform/bridge/host.ts';

const REFRESH_MS=30_000;
/** How often the picture of Fox's page is taken again while Fox drives one. */
const PAGE_MS=3000;
/** Status lines kept for a running task's window. */
const LOG_MAX=40;
/** How long the pointer rests on a card before its window opens, and has left before it closes. */
const HOVER_MS=150;
/** How long a Routine card that left is remembered, so its work's card can come from it. */
const MOVE_MS=90_000;
/** How long what a Routine's last change said stays in its popover. */
const NOTE_MS=15_000;
/** Cards a side: two in a wide World, one in a narrower one, none (only the count) in a narrow one. */
const cardsASide=()=>innerWidth>=1260?2:innerWidth>=820?1:0;
const CLOCK='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>';
/** A small button in a routine's popover. */
const action=(label:string,name:string,run:()=>void,primary=false)=>{const b=el('button','task-action'+(primary?' primary':''),label);b.type='button';b.dataset.action=name;b.onclick=e=>{e.stopPropagation();run();};return b;};
const lowerFirst=(text:string)=>text.charAt(0).toLowerCase()+text.slice(1);
const el=<K extends keyof HTMLElementTagNameMap>(tag:K,cls='',text?:string)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};

export function mountTaskPanel(root:HTMLElement,{call=callHost,openApplet=(_id:string)=>{}}:{call?:(action:string,body?:object)=>Promise<any>;openApplet?:(id:string)=>void}={}){
 const panel=el('aside','task-panel');panel.hidden=true;panel.setAttribute('aria-label','Tasks: scheduled and doing now');
 const side=(group:'now'|'routines',label:string)=>{
  const part=el('section','task-group');part.dataset.group=group;part.setAttribute('aria-label',label);
  const cards=el('div','task-cards'),more=el('button','task-more');more.type='button';more.setAttribute('aria-haspopup','dialog');
  part.append(el('h2','task-group-heading',label),cards,more);
  return {part,cards,more};
 };
 const now=side('now','Doing now'),next=side('routines','Scheduled');
 const popover=el('div','task-popover');popover.hidden=true;popover.setAttribute('role','dialog');
 panel.append(now.part,next.part,popover);root.append(panel);
 panel.addEventListener('pointerdown',e=>{e.stopPropagation();(e as any).worldletKeepFox=true;});
 const locked=()=>root.dataset.tourLock==='true'||root.dataset.tourSpotlight==='true';

 /** The Agent whose jobs these are, and whether its Routine cards offer its controls. */
 let agent={harness:'',title:'',changes:false};
 /** A routine's popover being worked in (a question, the edit form or a change on its way): it is not drawn again under
  * the person, and pointing away does not close it. `note` is what the last change said, shown when it opens again. */
 let busy=false,note:{id:string;text:string;at:number}|null=null;
 let paused:('plan'|'summary')[]=[];
 let input:TaskPanelInput={},timer=0,pageTimer=0,loading=false,model:TaskPanel|null=null,limit=cardsASide();
 /** What the popover shows: a task's id, or the whole list of a side. */
 let shown='';
 let page:{url:string;title:string;image:string;steps:{text:string;done:boolean}[]}|null=null,pageJson='null';
 const fox=new Map<string,{source:string;text:string;at:number;name?:string}>();
 let daily:{kind:'plan'|'summary';at:number}[]=[];
 /** What each running task has said, oldest first, kept while it runs: its window's lines. */
 const logs=new Map<string,{at:number;text:string}[]>();

 /** Whether the open window was clicked open (it stays) rather than pointed at (it goes with the pointer). */
 let pinned=false,hover=0;
 popover.addEventListener('pointerleave',()=>{if(!pinned&&!busy)hover=window.setTimeout(()=>{if(!pinned&&!popover.matches(':hover')&&!panel.querySelector('.task-card:hover'))closePopover();},HOVER_MS);});
 function closePopover(){
  popover.hidden=true;popover.replaceChildren();shown='';pinned=false;busy=false;
  for(const open of panel.querySelectorAll('[aria-expanded=true]'))open.setAttribute('aria-expanded','false');
 }
 document.addEventListener('pointerdown',e=>{if(!panel.contains(e.target as Node))closePopover();},true);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!popover.hidden)closePopover();});
 addEventListener('resize',()=>{const next=cardsASide();if(next!==limit){limit=next;render();}});

 /** The popover stands above what opened it, inside the World. */
 function place(anchor:HTMLElement){
  popover.hidden=false;
  const box=anchor.getBoundingClientRect(),width=popover.offsetWidth;
  popover.style.left=Math.max(12,Math.min(innerWidth-width-12,anchor.closest('[data-group=routines]')?box.right-width:box.left))+'px';
  popover.style.bottom=Math.max(12,innerHeight-box.top+8)+'px';
  anchor.setAttribute('aria-expanded','true');
 }
 function go(row:TaskRow){
  const open=row.open;if(!open)return;
  closePopover();
  if('applet' in open){openApplet(open.applet);return;}
  if('url' in open)window.dispatchEvent(new CustomEvent('worldlet:open-url',{detail:{url:open.url}}));
 }
 /** A routine: when, how often and who runs it, then its controls. */
 function routineFacts(row:TaskRow){
  const facts=el('dl','task-popover-facts');
  for(const [label,value] of [['When',row.when||'On its own schedule'],['How often',row.every||''],['Runs on',row.by||'']] as [string,string][]){
   if(value)facts.append(el('dt','',label),el('dd','',value));
  }
  const said=el('p','task-routine-said');said.setAttribute('role','status');
  if(note?.id===row.id&&Date.now()-note.at<NOTE_MS)said.textContent=note.text;
  const controls=routineControls(row,said);
  return [el('strong','task-popover-title',row.title),facts,...controls?[controls]:[],said];
 }
 /** After a change: say so, and read the Routines again (Settings hears of it too). */
 function changed(row:TaskRow,text:string){
  note={id:row.id,text,at:Date.now()};busy=false;
  window.dispatchEvent(new CustomEvent('worldlet:routines',{detail:{changed:true}}));
  void refresh();
 }
 /** The buttons a routine's popover offers, or null when its Agent keeps them read-only here. */
 function routineControls(row:TaskRow,said:HTMLElement):HTMLElement|null {
  const routine=row.routine;if(!routine)return null;
  const bar=el('div','task-routine-actions');
  if('daily' in routine){
   // Worldlet's own setting (host `foxPreferenceChange` `daily_routines`): the page plans it again or stops planning it.
   bar.append(action(routine.paused?'Resume':'Pause',routine.paused?'resume':'pause',()=>{
    busy=true;pinned=true;said.textContent='';
    void call('foxPreferenceChange',{setting:'daily_routines',value:{[routine.daily]:routine.paused}}).then(()=>changed(row,routine.paused?`“${row.title}” runs again.`:`“${row.title}” is paused.`),
     (e:Error)=>{busy=false;said.textContent=e?.message||'Could not change it.';});
   },routine.paused));
   return bar;
  }
  if(!agent.changes||!agent.harness)return null;
  const name=row.title,title=agent.title||'Your Agent';
  /** One plain question in the popover, then the Agent's own command (previewed first, as Settings does). */
  const ask=async(request:Record<string,unknown>,question:string,verb:string,done:string)=>{
   busy=true;pinned=true;said.textContent='';
   let preview:{confirm:string};
   try{preview=await call('harnessSchedule',{operation:'preview',harness:agent.harness,job:routine.job,...request});}
   catch(e){busy=false;said.textContent=(e as Error)?.message||'Could not prepare that.';bar.replaceChildren(...buttons());return;}
   const confirm=el('div','task-routine-confirm');confirm.setAttribute('role','group');
   confirm.append(el('span','',question),action(verb,'confirm',()=>{
    said.textContent=request.change==='run'?`${title} is running it…`:`${title} is working on it…`;
    for(const b of confirm.querySelectorAll('button'))b.disabled=true;
    void call('harnessSchedule',{operation:'change',confirm:preview.confirm}).then(()=>changed(row,done),(e:Error)=>{
     busy=false;said.textContent=`${title} did not do it: `+(e?.message||'try again.').replace(`${title} did not do it: `,'');bar.replaceChildren(...buttons());
    });
   },true),action('Cancel','cancel',()=>{busy=false;said.textContent='Nothing was changed.';bar.replaceChildren(...buttons());}));
   bar.replaceChildren(confirm);
  };
  /** Edit: its name, what it does (a prompt job; empty keeps it) and when; only what the person changed is sent. */
  const edit=()=>{
   busy=true;pinned=true;said.textContent='';
   const form=el('div','task-routine-form');
   const newName=el('input','task-routine-input');newName.value=name;newName.maxLength=80;newName.setAttribute('aria-label','Routine name');
   const prompt=el('textarea','task-routine-input');prompt.rows=2;prompt.maxLength=2000;prompt.placeholder='What it should do. Leave empty to keep it as it is.';prompt.setAttribute('aria-label','What it should do');
   const picker=routineTimePicker(routine.when);let moved=false;
   picker.element.addEventListener('input',()=>{moved=true;});picker.element.addEventListener('change',()=>{moved=true;});
   form.append(newName,...routine.kind==='prompt'?[prompt]:[],picker.element,action('Save','save',()=>{
    const request:Record<string,unknown>={change:'edit'},parts:string[]=[],next=newName.value.trim(),what=prompt.value.trim();
    if(next&&next!==name){request.name=next;parts.push(`call it “${next}”`);}
    if(what){request.prompt=what;parts.push('do what you wrote');}
    if(moved){const schedule=picker.read();if(!schedule){said.textContent='Choose when it runs.';return;}request.schedule=schedule;parts.push('run '+lowerFirst(routineWhenLine(scheduleWhen(schedule))));}
    if(!parts.length){said.textContent='Nothing to change yet.';return;}
    void ask(request,`${title} will change “${name}” to ${parts.join(', ')}.`,'Change',`“${next||name}” is changed.`);
   },true),action('Cancel','cancel',()=>{busy=false;said.textContent='';bar.replaceChildren(...buttons());}));
   bar.replaceChildren(form);newName.focus();
  };
  const buttons=()=>[
   action('Run now','run',()=>void ask({change:'run'},`${title} will run “${name}” once now.`,'Run now',`“${name}” ran.`)),
   routine.paused?action('Resume','resume',()=>void ask({change:'resume'},`${title} will resume “${name}”. It runs on its schedule again.`,'Resume',`“${name}” runs on its schedule again.`))
    :action('Pause','pause',()=>void ask({change:'pause'},`${title} will pause “${name}”. It does not run until you resume it.`,'Pause',`“${name}” is paused.`)),
   action('Edit','edit',edit),
   action('Remove','remove',()=>void ask({change:'remove'},`${title} will remove “${name}”. This can’t be undone.`,'Remove',`“${name}” was removed.`)),
  ];
  bar.append(...buttons());
  return bar;
 }
 /** A running task's window: the step, when it started, who does it, and every line it said, Fox in its corner. */
 function terminal(row:TaskRow){
  const screen=el('div','task-terminal');
  const facts=el('span','task-terminal-facts');
  for(const [label,value] of [['step',row.title],['started',row.at?routineClock(Math.min(row.at,Date.now())):''],['by',row.who||'Fox']] as [string,string][])if(value)facts.append(el('span','task-terminal-fact',label+': '+value));
  const lines=el('span','task-terminal-lines');
  for(const line of logs.get(row.id)??[]){const item=el('span','task-terminal-line');item.append(el('span','task-terminal-time',routineClock(line.at).replace(/\s?[AP]M$/i,'')),document.createTextNode(line.text));lines.append(item);}
  const cursor=el('span','task-terminal-cursor');cursor.setAttribute('aria-hidden','true');lines.append(cursor);
  const avatar=el('img','task-terminal-fox');avatar.src=companionStill();avatar.alt='';
  screen.append(facts,lines,avatar);
  return screen;
 }
 /** The page Fox drives, larger than its card's picture; a click opens it. */
 function pageWindow(row:TaskRow){
  const open=el('button','task-page');open.type='button';
  if(page?.image){const img=el('img');img.src=page.image;img.alt='';open.append(img);}
  open.append(el('span','task-page-step',row.detail?'Fox · '+row.detail:'Fox is working on this page'));
  open.setAttribute('aria-label','Open '+row.name);
  open.onclick=e=>{e.stopPropagation();go(row);};
  return open;
 }
 function showTask(row:TaskRow,anchor:HTMLElement){
  closePopover();shown=row.id;
  popover.dataset.kind=row.group==='routines'?'routine':'task';
  popover.setAttribute('aria-label',row.name);
  if(row.group==='routines')popover.append(...routineFacts(row));
  else popover.append(el('strong','task-popover-title',row.name),row.url&&page?pageWindow(row):terminal(row));
  place(anchor);
 }
 function showAll(group:'now'|'routines',anchor:HTMLElement){
  closePopover();shown='all:'+group;
  popover.dataset.kind='list';popover.setAttribute('aria-label',group==='now'?'Doing now':'Scheduled');
  const list=el('div','task-list');
  for(const row of model?.[group].rows??[])list.append(card(row,true));
  popover.append(el('strong','task-popover-title',group==='now'?'Doing now':'Scheduled'),list);
  place(anchor);
 }
 function card(row:TaskRow,inList=false){
  const button=el('button','task-card');button.type='button';
  button.dataset.taskId=row.id;button.dataset.source=row.source;button.dataset.state=row.group==='now'?'running':'next';
  const icon=el('span','task-card-icon');
  const picture=row.url&&page?.image?page.image:row.icon==='fox'?companionStill():row.icon==='clock'?'':themeAppletIcon(row.icon)||'';
  if(picture){const img=el('img');img.src=picture;img.alt='';icon.append(img);}else icon.innerHTML=CLOCK;
  icon.dataset.icon=row.url&&page?.image?'page':row.icon==='fox'||row.icon==='clock'?row.icon:'applet';
  const text=el('span','task-card-text');text.append(el('span','task-title',row.name),el('span','task-when',row.status));
  button.append(icon,text);
  if(row.group==='now'){
   const bar=el('span','task-card-bar'),fill=el('i');
   if(typeof row.progress==='number')fill.style.width=Math.round(Math.max(.04,Math.min(1,row.progress))*100)+'%';else bar.dataset.unknown='true';
   bar.append(fill);button.append(bar);
  }
  button.title=[row.title,row.group==='now'?row.status:row.when].filter(Boolean).join(' · ');
  button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-expanded','false');
  // Pointing at a card opens its window above it, like a dock (owner request 2026-10-11: "鼠标移上去，然后它上面显示一个大的
  // 框"); it closes when the pointer leaves card and window. A click keeps it open until a click elsewhere.
  if(!inList){
   button.onpointerenter=e=>{if(e.pointerType!=='mouse'||locked()||pinned)return;clearTimeout(hover);hover=window.setTimeout(()=>{if(shown!==row.id)showTask(row,button);},HOVER_MS);};
   button.onpointerleave=()=>{clearTimeout(hover);if(!pinned)hover=window.setTimeout(()=>{if(!pinned&&!busy&&!popover.matches(':hover')&&!button.matches(':hover'))closePopover();},HOVER_MS);};
  }
  button.onclick=e=>{
   e.stopPropagation();clearTimeout(hover);if(locked())return;
   if(shown===row.id&&pinned){closePopover();return;}
   pinned=true;if(shown===row.id)return;
   // A card in a side's whole list opens its window where the list stood.
   showTask(row,inList?(row.group==='now'?now:next).more:button);pinned=true;
  };
  return button;
 }
 function remember(row:TaskRow){
  const log=logs.get(row.id)??[];
  for(const text of row.lines??[])if(!log.some(line=>line.text===text))log.push({at:Date.now(),text});
  logs.set(row.id,log.slice(-LOG_MAX));
 }
 function fill(group:'now'|'routines',{part,cards,more}:{part:HTMLElement;cards:HTMLElement;more:HTMLButtonElement}){
  const rows=model![group].rows;
  part.hidden=!rows.length;
  cards.replaceChildren(...rows.slice(0,limit).map(row=>card(row)));
  const rest=rows.length-Math.min(limit,rows.length);
  more.hidden=!rest;
  more.textContent=limit?'+'+rest:(group==='now'?'Doing now ':'Scheduled ')+rows.length;
  more.setAttribute('aria-label',(group==='now'?'Doing now':'Scheduled')+': all '+rows.length);
  more.dataset.count=limit?'more':'all';
  more.onclick=e=>{e.stopPropagation();if(locked())return;if(shown==='all:'+group)closePopover();else{showAll(group,more);pinned=true;}};
 }
 /** Where each Routine card last stood, by its name, kept a while after it leaves: a Routine's card goes when its time
  * comes, often a redraw before its work reports in. */
 const lastSeen=new Map<string,{box:DOMRect;at:number}>();
 /** Each running card's id before a redraw, with the Routine cards' places noted. */
 function before(){
  for(const c of next.cards.querySelectorAll<HTMLElement>('.task-card')){const name=c.querySelector('.task-title')?.textContent||'';if(name)lastSeen.set(name,{box:c.getBoundingClientRect(),at:Date.now()});}
  for(const [name,seen] of lastSeen)if(Date.now()-seen.at>MOVE_MS)lastSeen.delete(name);
  return new Set([...now.cards.querySelectorAll<HTMLElement>('.task-card')].map(c=>c.dataset.taskId!));
 }
 /** A new running card comes from where its work was: the Routine card of the same name on the left, or, for a turn of
  * the conversation, the message bar. Cards that came some other way (a follow-up turns into its place,
  * ui/attention/artifact-turn.ts) simply appear. */
 function arrive(running:Set<string>){
  if(panel.hidden)return;
  const still=matchMedia('(prefers-reduced-motion: reduce)').matches;
  for(const c of now.cards.querySelectorAll<HTMLElement>('.task-card')){
   if(running.has(c.dataset.taskId!)||typeof c.animate!=='function')continue;
   const name=c.querySelector('.task-title')?.textContent||'',to=c.getBoundingClientRect();
   const bar=c.dataset.taskId==='fox:turn'?root.querySelector<HTMLElement>('.companion-text-entry')?.getBoundingClientRect():undefined;
   const from=lastSeen.get(name)?.box??(bar?.width?bar:undefined);
   if(!from?.width||!to.width)continue;
   c.dataset.arrived=lastSeen.has(name)?'routine':'bar';
   if(still)continue;
   const dx=from.left+from.width/2-(to.left+to.width/2),dy=from.top+from.height/2-(to.top+to.height/2);
   c.animate([{transform:`translate(${dx}px,${dy}px) scale(${Math.min(1,from.width/to.width)})`,opacity:.4},{transform:'none',opacity:1}],{duration:520,easing:'cubic-bezier(.3,.7,.3,1)'});
  }
 }
 function render(){
  model=taskPanel({...input,page,fox:[...fox.values()],daily,dailyPaused:paused},Date.now());
  // The paired phone's Tasks tab shows the same cards (ui/companion/phone-bridge.ts).
  window.dispatchEvent(new CustomEvent('worldlet:task-panel',{detail:model}));
  for(const row of model.now.rows)remember(row);
  const live=new Set(model.now.rows.map(row=>row.id));for(const id of logs.keys())if(!live.has(id))logs.delete(id);
  // An open window or list is drawn again with what is new, or closes when its task has ended.
  const open=shown,anchorOf=(id:string)=>panel.querySelector<HTMLElement>(`.task-card[data-task-id="${CSS.escape(id)}"]`);
  const was=before();
  fill('now',now);fill('routines',next);
  panel.dataset.routines=String(!!model.routines.total);
  panel.dataset.working=String(!!model.now.total);
  panel.hidden=model.empty;
  arrive(was);
  if(!open||busy)return;
  const keep=pinned;closePopover();pinned=keep;
  if(open.startsWith('all:')){const group=open.slice(4) as 'now'|'routines',more=(group==='now'?now:next).more;if(model[group].total&&!more.hidden)showAll(group,more);return;}
  const row=[...model.now.rows,...model.routines.rows].find(r=>r.id===open),anchor=row&&(anchorOf(row.id)||(row.group==='now'?now:next).more);
  if(row&&anchor&&!anchor.hidden)showTask(row,anchor);
 }
 async function refresh(){
  clearTimeout(timer);timer=window.setTimeout(()=>void refresh(),REFRESH_MS);
  if(loading)return;loading=true;
  try{
   const result=await call('taskPanel');
   agent=result&&!result.sample&&typeof result==='object'?{harness:typeof result.harnessId==='string'?result.harnessId:'',title:typeof result.harness==='string'?result.harness:'',changes:result.changes===true}:{harness:'',title:'',changes:false};
   input=result&&!result.sample&&typeof result==='object'?{jobs:Array.isArray(result.jobs)?result.jobs:[],harness:typeof result.harness==='string'?result.harness:null,
    working:Array.isArray(result.working)?result.working:[]}:{};
  }catch{/* A failed read keeps the last rows. */}
  finally{loading=false;}
  render();
 }
 // The page Fox drives, read again every few seconds while the World is visible: cheap when there is none.
 async function readPage(){
  clearTimeout(pageTimer);pageTimer=window.setTimeout(()=>void readPage(),PAGE_MS);
  if(document.hidden)return;
  let next:typeof page=null;
  try{const value=(await call('taskPanelPage'))?.page;if(value&&typeof value.url==='string')next={url:value.url,title:String(value.title||''),image:typeof value.image==='string'&&value.image.startsWith('data:image/')?value.image:'',steps:Array.isArray(value.steps)?value.steps:[]};}catch{}
  // The last page's text is kept, so its picture is not turned into text again on every read.
  const json=JSON.stringify(next),changed=json!==pageJson;page=next;pageJson=json;
  if(changed)render();
 }
 const soon=()=>{setTimeout(()=>void refresh(),400);};
 // Fox's background work: its card while it works; what it made goes to the Journal, not here.
 window.addEventListener(FOX_STATUS_EVENT,(e:any)=>{
  const source=String(e.detail?.source||'work'),said=String(e.detail?.text||'').trim(),name=typeof e.detail?.name==='string'?e.detail.name:undefined;
  if(said)fox.set(source,{source,text:said,at:fox.get(source)?.at??Date.now(),...(name?{name}:{})});else fox.delete(source);
  render();
 });
 // When Fox makes the next morning brief and today's summary, from the page that asks for them (ui/shell/notion-world.ts).
 window.addEventListener('worldlet:daily-planned',(e:any)=>{
  const next=(Array.isArray(e.detail?.planned)?e.detail.planned:[]).filter((p:any)=>(p?.kind==='plan'||p?.kind==='summary')&&Number.isFinite(p.at)).slice(0,2);
  const off=(Array.isArray(e.detail?.paused)?e.detail.paused:[]).filter((k:any)=>k==='plan'||k==='summary');
  if(JSON.stringify(next)!==JSON.stringify(daily)||JSON.stringify(off)!==JSON.stringify(paused)){daily=next;paused=off;render();}
 });
 for(const name of ['worldlet:routines','worldlet:job','worldlet:applet-task'])window.addEventListener(name,soon);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){void refresh();void readPage();}});
 void refresh();void readPage();
 return {panel,refresh};
}
