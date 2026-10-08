import {marked} from 'marked';
import DOMPurify from 'dompurify';
import {renderArtifactBlocks,artifactPicture} from './artifact-blocks.ts';
import {journalPages,madeArtifacts,readArtifact,type Artifact,type JournalPage,type MadeArtifact} from '../../core/artifacts/index.ts';
/** The Journal (owner decisions 2026-10-06 and 2026-10-07; a book of its own, 2026-10-08): every card Fox showed in this
 * World, together one journal with a page a day. The book lies open on a day: its cards stand in time order on the left
 * leaf, then the right, two columns each, each at its size (large two by two, medium two by one, small one cell): the
 * plan first, the summary last, Attention cards, answers, meeting summaries, themes and pages Fox made between. ‹ › at
 * the page corners and the day tabs on the book's edge turn the pages; a day with more cards than the book holds scrolls
 * inside its right leaf, and a narrow window shows one leaf. Opening one shows it again in the World; × forgets it (a made page's own
 * Applet deletes it). It reads again while it is open and something changes.
 * The morning brief (owner Order 2026-10-07) leaves a reply draft for each mail that waits for the person, a card of
 * its own on today's page: Send sends that exact draft, Edit changes its words in place, Skip drops it. Morning brief
 * in the head says, in the person's words, what the 6 AM brief holds. */
type Reply={id:string;kind:'reply';title:string;to:string;draft:Record<string,string>;createdAt:number;updatedAt:number};
type Entry=Artifact|MadeArtifact|Reply;
const CHIPS=5;
export function createCompanionArtifacts({call,open,openMade,review}:{call:(action:string,body?:any)=>Promise<any>;open:(id:string)=>void;openMade:(id:string,keep:boolean)=>void;review?:(detail:{id:string;draft:Record<string,string>;attempted:boolean})=>void}){
 const el=(tag:string,cls='',text='')=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text)node.textContent=text;return node;};
 const section=el('section','companion-info-section companion-artifacts companion-journal');section.dataset.section='Journal';
 const head=el('div','companion-journal-head'),heading=el('h3'),days=el('div','companion-journal-days'),turn=el('div','companion-journal-turn');
 const numeral=el('span','companion-journal-numeral'),dated=el('div','companion-journal-dated');numeral.setAttribute('aria-hidden','true');
 days.setAttribute('role','group');days.setAttribute('aria-label','Days');
 const older=el('button','companion-journal-arrow','‹') as HTMLButtonElement,newer=el('button','companion-journal-arrow','›') as HTMLButtonElement;
 older.type=newer.type='button';older.setAttribute('aria-label','Earlier day');newer.setAttribute('aria-label','Later day');
 const briefButton=el('button','companion-journal-brief-open','Morning brief') as HTMLButtonElement;briefButton.type='button';briefButton.setAttribute('aria-expanded','false');
 older.classList.add('companion-journal-older');newer.classList.add('companion-journal-newer');
 turn.append(briefButton);
 dated.append(heading);
 head.append(numeral,dated,turn);
 // Two leaves, each its own scroller: the day fills the left leaf first, then the right.
 const leftPage=el('div','companion-journal-page'),rightPage=el('div','companion-journal-page'),status=el('p','companion-info-note');status.setAttribute('role','status');
 const leftLeaf=el('div','companion-journal-leaf companion-journal-leaf-left'),rightLeaf=el('div','companion-journal-leaf companion-journal-leaf-right'),spread=el('div','companion-journal-spread');
 // What the 6 AM brief holds, one part a line, in the person's words; empty restores the default.
 const brief=el('form','companion-journal-brief') as HTMLFormElement;brief.hidden=true;
 const briefLabel=el('label','companion-journal-brief-label','Every morning at 6, Fox makes your brief with these parts, one a line.') as HTMLLabelElement;
 const briefText=el('textarea','companion-journal-brief-text') as HTMLTextAreaElement;briefText.rows=4;briefText.maxLength=240;briefText.id='companionMorningBrief';briefLabel.htmlFor=briefText.id;
 const briefSave=el('button','companion-journal-brief-save','Save') as HTMLButtonElement,briefNote=el('span','companion-journal-brief-note');
 briefNote.setAttribute('role','status');
 brief.append(briefLabel,briefText,briefSave,briefNote);
 leftLeaf.append(head,brief,status,leftPage,older);rightLeaf.append(rightPage,newer);
 spread.append(leftLeaf,rightLeaf);
 section.append(spread,days);
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
 let artifacts:Entry[]=[],pages:JournalPage<Entry>[]=[],day='',active=false,version=0;
 older.onclick=()=>{const i=pages.findIndex(p=>p.day===day);if(i<pages.length-1){day=pages[i+1].day;draw();}};
 newer.onclick=()=>{const i=pages.findIndex(p=>p.day===day);if(i>0){day=pages[i-1].day;draw();}};
 // A card shows its Markdown as the card does, without links or pictures: opening it is how to use them.
 function body(markdown:string){
  const holder=el('div','companion-journal-body');
  holder.append(DOMPurify.sanitize(marked.parse(markdown) as string,{ALLOWED_TAGS:['p','h1','h2','h3','h4','h5','h6','ul','ol','li','strong','em','del','s','blockquote','code','br','table','thead','tbody','tr','th','td','span'],ALLOWED_ATTR:[],RETURN_DOM_FRAGMENT:true}));
  return holder;
 }
 const forgetReply=(id:string)=>{artifacts=artifacts.filter(a=>a.id!==id);draw();};
 function replyCard(entry:JournalPage<Entry>['entries'][number]){
  let reply=entry.artifact as Reply,busy=false;
  const li=el('li','companion-artifact companion-reply');li.dataset.artifactId=reply.id;li.dataset.kind='reply';li.dataset.size=entry.size;
  const top=el('span','companion-artifact-origin');top.append(el('span','','Reply · '+reply.to),el('time','',new Date(reply.createdAt*1000).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})));
  const text=el('p','companion-reply-text',reply.draft.body||''),edit=el('textarea','companion-reply-edit') as HTMLTextAreaElement;edit.hidden=true;edit.setAttribute('aria-label','Reply to '+reply.to);
  const note=el('span','companion-reply-note');note.setAttribute('role','status');
  const actions=el('div','companion-reply-actions'),send=el('button','companion-reply-send','Send') as HTMLButtonElement,change=el('button','','Edit') as HTMLButtonElement,skip=el('button','','Skip') as HTMLButtonElement;
  for(const b of [send,change,skip])b.type='button';
  actions.append(send,change,skip,note);
  li.append(top,el('strong','companion-artifact-title',reply.title),text,edit,actions);
  const work=async(task:()=>Promise<void>)=>{if(busy)return;busy=true;for(const b of [send,change,skip])b.disabled=true;note.textContent='';
   try{await task();}catch(error){note.textContent=error?.message||'That did not work. Try again.';}finally{busy=false;for(const b of [send,change,skip])b.disabled=false;}};
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
 function card(entry:JournalPage<Entry>['entries'][number]){
  if(entry.artifact.kind==='reply')return replyCard(entry);
  const artifact=entry.artifact as Artifact|MadeArtifact,made=artifact.kind==='made'?artifact as MadeArtifact:null;
  const li=el('li','companion-artifact'),openButton=el('button','companion-artifact-open') as HTMLButtonElement;
  li.dataset.artifactId=artifact.id;li.dataset.kind=artifact.kind;li.dataset.size=entry.size;if(!made&&(artifact as Artifact).tone)li.dataset.tone=(artifact as Artifact).tone!;openButton.type='button';
  const when=new Date(entry.at*1000).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});
  const origin=made?'Made by Fox':artifact.kind==='attention'?(artifact as Artifact).category||'Attention':/^Plan · /.test(artifact.title)?'Plan':/^Summary · /.test(artifact.title)?'Summary':/ · Summary$/.test(artifact.title)?'Meeting':'Conversation';
  const top=el('span','companion-artifact-origin');top.append(el('span','',origin),el('time','',when));
  // The Journal keeps the card as it was shown (owner request 2026-10-08: "journal 里保留卡片"): its paper, its picture,
  // its tone and every part of it, only smaller.
  const picture=artifact.kind==='answer'?artifactPicture({title:artifact.title,body:(artifact as Artifact).body,art:(artifact as Artifact).art,tone:(artifact as Artifact).tone}):null;
  if(picture){const art=el('img','companion-artifact-art') as HTMLImageElement;art.src=picture;art.alt='';art.loading='lazy';art.decoding='async';li.dataset.art='illustration';li.append(art);}
  openButton.append(top,el('strong','companion-artifact-title',artifact.title));
  if(made)openButton.append(el('span','companion-artifact-preview',made.state==='kept'?'Applet, kept':made.state==='now'?'Applet until '+new Date(made.endsAt*1000).toLocaleString(undefined,{weekday:'short',hour:'numeric',minute:'2-digit'}):'Finished'),...(made.body?[el('span','companion-artifact-preview',made.body)]:[]));
  else if(artifact.body.trim())openButton.append(body(artifact.body));
  // Its blocks show still, as the person left them; they work again when the card opens in the World.
  if(!made&&(artifact as Artifact).blocks?.length)openButton.append(renderArtifactBlocks((artifact as Artifact).blocks!));
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
 const rowHeight=()=>parseFloat(getComputedStyle(section).getPropertyValue('--journal-row'))||132;
 function draw(){
  pages=journalPages(artifacts);
  if(!pages.some(p=>p.day===day))day=pages[0]?.day||'';
  const index=pages.findIndex(p=>p.day===day),page=pages[index];
  // The page names its date; the chips say Today and Yesterday.
  const date=page?new Date(...page.day.split('-').map((n,i)=>Number(n)-(i===1?1:0)) as [number,number,number]):null;
  heading.textContent=date?date.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'}):'Journal';
  numeral.textContent=date?String(date.getDate()):'';
  older.disabled=!page||index>=pages.length-1;newer.disabled=!page||index<=0;
  // The chips name the days nearest the page shown.
  const from=Math.max(0,Math.min(index-Math.floor(CHIPS/2),pages.length-CHIPS));
  days.replaceChildren(...pages.slice(from,from+CHIPS).map(p=>{const b=el('button','companion-journal-day',p.label.replace(/^(\w{3}), /,'')) as HTMLButtonElement;b.type='button';b.dataset.day=p.day;b.setAttribute('aria-pressed',String(p.day===day));b.onclick=()=>{day=p.day;draw();};return b;}));
  status.hidden=!!page;
  if(!page)status.textContent='Your journal is empty. Open an Attention card, or ask Fox to lay something out, and it is kept here, a page a day.';
  const left=el('ul','companion-journal-grid'),right=el('ul','companion-journal-grid');if(page){left.setAttribute('aria-label',page.label);right.setAttribute('aria-label',page.label+', continued');}
  // The left leaf takes cards in order while they fit its rows; the rest go on the right, which scrolls when full.
  const one=section.clientWidth>0&&section.clientWidth<760,rows=Math.max(2,Math.floor((leftPage.clientHeight+12)/(rowHeight()+12))||3);
  let used=0,turned=one;
  for(const entry of page?.entries||[]){
   const cells=entry.size==='large'||entry.artifact.kind==='reply'?4:entry.size==='medium'?2:1;
   if(!turned&&used+cells>rows*2)turned=true;
   (turned&&!one?right:left).append(card(entry));if(!turned)used+=cells;
  }
  section.dataset.leaves=one?'1':'2';
  leftPage.replaceChildren(left);rightPage.replaceChildren(right);leftPage.scrollTop=rightPage.scrollTop=0;
 }
 async function load(){
  const mine=++version;
  // The sample world has no mailbox: its Journal holds no reply drafts and never reaches the mail bridge.
  const sample=document.querySelector<HTMLElement>('.native-console')?.dataset.sample==='true';
  const [kept,made,mail]=await Promise.all([call('artifacts',{operation:'list'}).catch(()=>null),call('widgets',{operation:'list'}).catch(()=>null),sample?null:call('emailAction',{operation:'list'}).catch(()=>null)]);
  if(mine!==version)return;
  // A draft still waiting stands on today's page, however early it was made.
  const now=new Date(),today=new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime()/1000;
  const replies:Reply[]=(Array.isArray(mail?.reviews)?mail.reviews:[]).filter((r:any)=>!r.attempted&&typeof r?.id==='string'&&r.draft&&typeof r.draft.to==='string').map((r:any)=>{
   const at=Math.max(Number(r.createdAt)||today,today);
   return {id:r.id,kind:'reply',title:String(r.draft.subject||'(No subject)').slice(0,120),to:String(r.draft.to).replace(/\s*<[^>]*>\s*$/,'').slice(0,80)||r.draft.to,draft:r.draft,createdAt:at,updatedAt:at};
  });
  artifacts=[...(Array.isArray(kept?.artifacts)?kept.artifacts:[]).map(readArtifact).filter(Boolean) as Artifact[],...madeArtifacts(made||{}),...replies];
  draw();
 }
 for(const name of ['worldlet:artifacts','worldlet:widgets','worldlet:email-drafted'])window.addEventListener(name,()=>{if(active)void load();});
 draw();
 return {element:section,start(open=''){active=true;day=open;void load();},stop(){active=false;}};
}
