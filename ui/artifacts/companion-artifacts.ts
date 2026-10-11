import DOMPurify from 'dompurify';
import {renderArtifactBlocks,artifactPicture} from './artifact-blocks.ts';
import {fitArtifact} from './artifact-fit.ts';
import {modelMarkdown} from '../components/index.ts';
import {artifactBrief,artifactFitSteps,journalDays,madeArtifacts,readArtifact,type Artifact,type JournalDay,type MadeArtifact} from '../../core/artifacts/index.ts';
/** The Journal (owner decisions 2026-10-06 and 2026-10-07; a book of its own, 2026-10-08; a timeline, 2026-10-11):
 * everything Fox produced in this World, one kind of thing, an artifact, kept day by day. Inside the book one page
 * scrolls through the days, newest first: each day has its date on the left and its cards in time order on the right,
 * each at its size (large two by two, medium two by one, small one cell): the plan first, the summary last, Attention
 * cards, answers, meeting summaries, themes and pages Fox made between, each named by where it came from
 * (`journalOrigin`). Older days come in as the person scrolls. Opening one shows it again in the World; × forgets it (a
 * made page's own Applet deletes it). It reads again while it is open and something changes.
 * The morning brief (owner Order 2026-10-07), and Fox by itself for a new mail task (owner decision 2026-10-09,
 * core/artifacts/replies.ts), leave a reply draft for each mail that waits for the person, a card of its own on today's page: Send sends that exact draft, Edit changes its words in place, Skip drops it. Morning brief
 * in the head says, in the person's words, what the 6 AM brief holds. */
type Reply={id:string;kind:'reply';title:string;to:string;draft:Record<string,string>;createdAt:number;updatedAt:number};
type Entry=Artifact|MadeArtifact|Reply;
// Days drawn at a time; older ones follow as the timeline scrolls near its end.
const DAYS_AT_ONCE=7;
// A card's time of day. One formatter for every card: toLocaleTimeString with options builds a new one per call. An
// out-of-range time still reads "Invalid Date", as toLocaleTimeString gives, where the formatter would throw.
const CLOCK=new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'});
const clock=(seconds:number)=>{const at=new Date(seconds*1000);return Number.isNaN(at.getTime())?String(at):CLOCK.format(at);};
export function createCompanionArtifacts({call,open,openMade,review}:{call:(action:string,body?:any)=>Promise<any>;open:(id:string)=>void;openMade:(id:string,keep:boolean)=>void;review?:(detail:{id:string;draft:Record<string,string>;attempted:boolean})=>void}){
 const el=(tag:string,cls='',text='')=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text)node.textContent=text;return node;};
 const section=el('section','companion-info-section companion-artifacts companion-journal');section.dataset.section='Journal';
 const head=el('div','companion-journal-head'),heading=el('h3','','Journal'),turn=el('div','companion-journal-turn');
 const briefButton=el('button','companion-journal-brief-open','Morning brief') as HTMLButtonElement;briefButton.type='button';briefButton.setAttribute('aria-expanded','false');
 turn.append(briefButton);
 head.append(heading,turn);
 // One page that scrolls through the days, newest first.
 const timeline=el('div','companion-journal-timeline'),status=el('p','companion-info-note');status.setAttribute('role','status');
 const more=el('div','companion-journal-more');more.setAttribute('aria-hidden','true');
 const leaf=el('div','companion-journal-leaf');
 // What the 6 AM brief holds, one part a line, in the person's words; empty restores the default.
 const brief=el('form','companion-journal-brief') as HTMLFormElement;brief.hidden=true;
 const briefLabel=el('label','companion-journal-brief-label','Every morning at 7, Today’s prep holds these parts, one a line.') as HTMLLabelElement;
 const briefText=el('textarea','companion-journal-brief-text') as HTMLTextAreaElement;briefText.rows=4;briefText.maxLength=240;briefText.id='companionMorningBrief';briefLabel.htmlFor=briefText.id;
 const briefSave=el('button','companion-journal-brief-save','Save') as HTMLButtonElement,briefNote=el('span','companion-journal-brief-note');
 briefNote.setAttribute('role','status');
 brief.append(briefLabel,briefText,briefSave,briefNote);
 leaf.append(head,brief,status,timeline);
 section.append(leaf);
 briefButton.onclick=async()=>{
  brief.hidden=!brief.hidden;briefButton.setAttribute('aria-expanded',String(!brief.hidden));briefNote.textContent='';
  if(brief.hidden)return;
  try{const info=await call('foxPreferences');briefText.value=typeof info?.morningBrief==='string'?info.morningBrief:'';}catch{}
  briefText.focus();
 };
 brief.onsubmit=async event=>{
  event.preventDefault();briefSave.disabled=true;
  try{const result=await call('foxPreferenceChange',{setting:'morning_brief',value:briefText.value});if(typeof result?.morningBrief==='string')briefText.value=result.morningBrief;briefNote.textContent='Saved. Tomorrow’s brief follows it.';}
  catch(error){briefNote.textContent=error?.message||'Could not save it. Try again.';}
  finally{briefSave.disabled=false;}
 };
 let artifacts:Entry[]=[],days:JournalDay<Entry>[]=[],day='',focus='',drawn=0,active=false,version=0;
 // A card shows its Markdown as the card does, without links or pictures: opening it is how to use them.
 function body(markdown:string){
  const holder=el('div','companion-journal-body');
  holder.append(DOMPurify.sanitize(modelMarkdown.parse(markdown) as string,{ALLOWED_TAGS:['p','h1','h2','h3','h4','h5','h6','ul','ol','li','strong','em','del','s','blockquote','code','br','table','thead','tbody','tr','th','td','span'],ALLOWED_ATTR:[],RETURN_DOM_FRAGMENT:true}));
  return holder;
 }
 const forgetReply=(id:string)=>{artifacts=artifacts.filter(a=>a.id!==id);draw();};
 function replyCard(entry:JournalDay<Entry>['entries'][number]){
  let reply=entry.artifact as Reply,busy=false;
  const li=el('li','companion-artifact companion-reply');li.dataset.artifactId=reply.id;li.dataset.kind='reply';li.dataset.size=entry.size;
  const top=el('span','companion-artifact-origin');top.append(el('span','','Reply · '+reply.to),el('time','',clock(reply.createdAt)));
  const text=el('p','companion-reply-text',reply.draft.body||''),edit=el('textarea','companion-reply-edit') as HTMLTextAreaElement;edit.hidden=true;edit.setAttribute('aria-label','Reply to '+reply.to);
  const note=el('span','companion-reply-note');note.setAttribute('role','status');
  const actions=el('div','companion-reply-actions'),send=el('button','companion-reply-send','Send') as HTMLButtonElement,change=el('button','','Edit') as HTMLButtonElement,skip=el('button','','Skip') as HTMLButtonElement;
  const buttons=[send,change,skip];
  for(const b of buttons)b.type='button';
  actions.append(send,change,skip,note);
  li.append(top,el('strong','companion-artifact-title',reply.title),text,edit,actions);
  const work=async(task:()=>Promise<void>)=>{if(busy)return;busy=true;for(const b of buttons)b.disabled=true;note.textContent='';
   try{await task();}catch(error){note.textContent=error?.message||'That did not work. Try again.';}finally{busy=false;for(const b of buttons)b.disabled=false;}};
  // Send: exactly the stored draft. A read-only Google connection, or a send that was tried and not confirmed,
  // continues in Fox's email review, which asks for send access or checks delivery and never sends a second copy.
  send.onclick=()=>work(async()=>{
   if(!edit.hidden){note.textContent='Save your edit first.';return;}
   let result:any;
   try{result=await call('emailAction',{operation:'send',id:reply.id});}
   catch(error){const now=await call('emailAction',{operation:'list'}).catch(()=>null),mine=(now?.reviews||[]).find((r:any)=>r.id===reply.id);if(mine?.attempted){review?.({id:reply.id,draft:reply.draft,attempted:true});return;}throw error;}
   if(result?.needsAuthorization){review?.({id:reply.id,draft:reply.draft,attempted:false});return;}
   if(result?.status!=='sent'){review?.({id:reply.id,draft:reply.draft,attempted:true});return;}
   void Promise.resolve(call('emailAction',{operation:'acknowledge',id:reply.id})).catch(()=>{});
   forgetReply(reply.id);status.hidden=false;status.textContent='Sent to '+reply.to+'.';
  });
  change.onclick=()=>work(async()=>{
   if(edit.hidden){edit.value=reply.draft.body||'';edit.hidden=false;text.hidden=true;change.textContent='Save';edit.focus();return;}
   const result=await call('emailAction',{operation:'revise',id:reply.id,body:edit.value});
   reply={...reply,id:result.id,draft:result.draft};li.dataset.artifactId=reply.id;
   artifacts=artifacts.map(a=>a===entry.artifact?reply:a);
   text.textContent=reply.draft.body||'';edit.hidden=true;text.hidden=false;change.textContent='Edit';note.textContent='Saved.';
  });
  skip.onclick=()=>work(async()=>{await call('emailAction',{operation:'cancel',id:reply.id});forgetReply(reply.id);});
  return li;
 }
 function card(entry:JournalDay<Entry>['entries'][number]){
  if(entry.artifact.kind==='reply')return replyCard(entry);
  const artifact=entry.artifact as Artifact|MadeArtifact,made=artifact.kind==='made'?artifact as MadeArtifact:null;
  const li=el('li','companion-artifact'),openButton=el('button','companion-artifact-open') as HTMLButtonElement;
  li.dataset.artifactId=artifact.id;li.dataset.kind=artifact.kind;li.dataset.size=entry.size;if(!made&&(artifact as Artifact).tone)li.dataset.tone=(artifact as Artifact).tone!;openButton.type='button';
  const when=clock(entry.at);
  const top=el('span','companion-artifact-origin');top.append(el('span','',entry.origin),el('time','',when));
  // The Journal keeps the card as it was shown (owner request 2026-10-08: "journal 里保留卡片"): its paper, its picture,
  // its tone and every part of it, only smaller.
  const picture=artifact.kind==='answer'?artifactPicture({title:artifact.title,body:(artifact as Artifact).body,art:(artifact as Artifact).art,tone:(artifact as Artifact).tone}):null;
  if(picture){const art=el('img','companion-artifact-art') as HTMLImageElement;art.src=picture;art.alt='';art.loading='lazy';art.decoding='async';li.dataset.art='illustration';li.append(art);}
  openButton.append(top,el('strong','companion-artifact-title',artifact.title));
  if(made)openButton.append(el('span','companion-artifact-preview',made.state==='kept'?'Kept':made.state==='now'?'Open until '+new Date(made.endsAt*1000).toLocaleString(undefined,{weekday:'short',hour:'numeric',minute:'2-digit'}):'Finished'),...(made.body?[el('span','companion-artifact-preview',made.body)]:[]));
  else{
   // The card never scrolls (owner Order 2026-10-09): it shows the fullest version its cell holds, down to the brief, as
   // the World card does, once it stands on the page. Its blocks show still, as the person left them; they work again
   // when the card opens in the World.
   const kept=artifact as Artifact,content=el('div','companion-artifact-content');openButton.append(content);
   const steps=artifactFitSteps({body:kept.body.trim()?kept.body:'',detail:kept.detail,blocks:kept.blocks});
   const fit=()=>{if(openButton.isConnected&&openButton.clientHeight)fitArtifact(openButton,steps,step=>content.replaceChildren(...(step.text==='brief'?[el('p','companion-artifact-brief',artifactBrief(kept))]:[...(kept.body.trim()||step.text==='detail'?[body(step.text==='detail'?kept.detail!:kept.body)]:[]),...(step.blocks?[renderArtifactBlocks(kept.blocks!.slice(0,step.blocks))]:[])])));};
   fitting.set(openButton,fit);cardFits.observe(openButton);
  }
  openButton.onclick=()=>made?openMade(made.id,false):open(artifact.id);
  li.append(openButton);
  // A finished page comes back as an Applet only when the person keeps it.
  if(made){
   if(made.state==='finished'){const keep=el('button','companion-artifact-keep','Keep and open') as HTMLButtonElement;keep.type='button';keep.onclick=()=>openMade(made.id,true);li.append(keep);openButton.disabled=true;openButton.title='Its moment is over. Keep it to open it again.';}
   return li;
  }
  const forget=el('button','companion-artifact-forget','×') as HTMLButtonElement;forget.type='button';
  forget.setAttribute('aria-label','Forget '+artifact.title);forget.title='Forget';
  forget.onclick=async()=>{forget.disabled=true;try{await call('artifacts',{operation:'delete',id:artifact.id});artifacts=artifacts.filter(a=>a.id!==artifact.id);draw();}catch(error){status.hidden=false;status.textContent=error?.message||'Could not forget it. Try again.';forget.disabled=false;}};
  li.append(forget);return li;
 }
 // Each card fits again when its cell changes size (a narrow window, the book opening).
 const fitting=new WeakMap<Element,()=>void>(),cardFits=new ResizeObserver(entries=>{for(const entry of entries)fitting.get(entry.target)?.();});
 function dayBlock(page:JournalDay<Entry>){
  const block=el('section','companion-journal-day');block.dataset.day=page.day;block.setAttribute('aria-label',page.label);
  const date=new Date(...page.day.split('-').map((n,i)=>Number(n)-(i===1?1:0)) as [number,number,number]);
  const dated=el('header','companion-journal-date');
  dated.append(el('span','companion-journal-numeral',String(date.getDate())),el('strong','companion-journal-label',page.label),el('span','companion-journal-weekday',date.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'})));
  dated.firstElementChild!.setAttribute('aria-hidden','true');
  const list=el('ul','companion-journal-grid');list.setAttribute('aria-label',page.label);
  for(const entry of page.entries)list.append(card(entry));
  block.append(dated,list);
  return block;
 }
 // Draws days up to `until` (at least DAYS_AT_ONCE), and keeps the marker that brings older ones last.
 function extend(until=0){
  const end=Math.min(days.length,Math.max(drawn+DAYS_AT_ONCE,until));
  more.remove();
  for(const page of days.slice(drawn,end))timeline.append(dayBlock(page));
  drawn=end;
  if(drawn<days.length){timeline.append(more);older.observe(more);}
 }
 const older=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)&&drawn<days.length)extend();},{root:timeline,rootMargin:'0px 0px 480px 0px'});
 function draw(){
  cardFits.disconnect();older.disconnect();
  days=journalDays(artifacts);
  const top=timeline.scrollTop;
  timeline.replaceChildren();drawn=0;
  status.hidden=days.length>0;
  if(!days.length)status.textContent='Your journal is empty. Open an Attention card, or ask Fox to lay something out, and it is kept here, day by day.';
  // Opening on a day draws down to it and scrolls there; a redraw while open keeps the place.
  const wanted=day?days.findIndex(p=>p.day===day):-1;
  extend(wanted+1);
  if(wanted>0)timeline.querySelector<HTMLElement>(`.companion-journal-day[data-day="${days[wanted].day}"]`)?.scrollIntoView({block:'start'});
  else timeline.scrollTop=day?0:top;
  day='';
  // The card the book was opened for: in view and marked a moment.
  const card=focus?[...timeline.querySelectorAll<HTMLElement>('.companion-artifact')].find(li=>li.dataset.artifactId===focus):null;
  if(card){focus='';card.dataset.focused='true';card.scrollIntoView({block:'nearest'});setTimeout(()=>{delete card.dataset.focused;},2400);}
  for(const button of timeline.querySelectorAll('.companion-artifact-open'))fitting.get(button)?.();
 }
 async function load(){
  const mine=++version;
  // The sample world has no mailbox: its Journal holds no reply drafts and never reaches the mail bridge.
  const sample=document.querySelector<HTMLElement>('.native-console')?.dataset.sample==='true';
  const [kept,made,mail]=await Promise.all([call('artifacts',{operation:'list'}).catch(()=>null),call('widgets',{operation:'list'}).catch(()=>null),sample?null:call('emailAction',{operation:'list'}).catch(()=>null)]);
  if(mine!==version)return;
  // A draft still waiting stands on today's page, however early it was made.
  const now=new Date(),today=new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime()/1000;
  const replies:Reply[]=(Array.isArray(mail?.reviews)?mail.reviews:[]).filter((r:any)=>r&&!r.attempted&&typeof r.id==='string'&&r.draft&&typeof r.draft.to==='string').map((r:any)=>{
   const at=Math.max(Number(r.createdAt)||today,today);
   return {id:r.id,kind:'reply',title:String(r.draft.subject||'(No subject)').slice(0,120),to:String(r.draft.to).replace(/\s*<[^>]*>\s*$/,'').slice(0,80)||r.draft.to,draft:r.draft,createdAt:at,updatedAt:at};
  });
  artifacts=[...(Array.isArray(kept?.artifacts)?kept.artifacts:[]).map(readArtifact).filter(Boolean) as Artifact[],...madeArtifacts(made||{}),...replies];
  draw();
 }
 for(const name of ['worldlet:artifacts','worldlet:widgets','worldlet:email-drafted'])window.addEventListener(name,()=>{if(active)void load();});
 draw();
 return {element:section,start(open='',card=''){active=true;day=open||'today';focus=card;void load();},stop(){active=false;focus='';}};
}
