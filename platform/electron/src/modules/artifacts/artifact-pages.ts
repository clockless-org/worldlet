import {WebContentsView} from 'electron';
import {ARTIFACT_PAGE_LIMITS,ARTIFACT_PAGE_MAKER,ARTIFACT_PAGE_ROOM,artifactPageActions,artifactPageBrief,artifactPageBudget,artifactPageDocument,artifactPageProblems,artifactPageTask,artifactPageTrialProblems,placeArtifactMaterials,readArtifact,readArtifactPage,readArtifactPageConsole,readArtifactPageSpec,validArtifactId,type Artifact,type ArtifactPage,type ArtifactPageSpec} from '../../../../../core/artifacts/index.ts';
import {WorldletError} from '../../files.ts';
import {FOX,type FoxService} from '../../host/services.ts';
import type {Host,Row} from '../../host/types.ts';
import {Surface} from '../browser/surface.ts';
import {closeGameView,gameURL,gameWebPreferences,lockGameContents,placeGameView,tryMadeGame} from '../games/trial.ts';

/** One page being written: the artifact, the size it is for, the theme's look and its materials as data addresses. */
interface Job {id:string;size:'medium'|'large';spec:ArtifactPageSpec;materials:Record<string,string>}
const DATA_IMAGE=/^data:image\/(?:png|webp|jpeg|svg\+xml);base64,[A-Za-z0-9+/=]+$/;
const materialsOf=(value:unknown,spec:ArtifactPageSpec)=>Object.fromEntries(Object.entries(value&&typeof value==='object'?value as Row:{}).filter(([id,uri])=>spec.materials.some(m=>m.id===id)&&typeof uri==='string'&&uri.length<=600_000&&DATA_IMAGE.test(uri))) as Record<string,string>;

/** Artifact pages (core/artifacts/README.md#theme-driven-artifacts). After the World shows an answer at medium or large
 * size, it asks for a page: the Agent writes the card as one HTML page in the theme's style in a quiet background task,
 * Worldlet checks it, tries it out of sight at the card's room and keeps it beside the artifact. The World then shows
 * it in a sandboxed view of its own over the card, in the Game Factory's offline session, with no bridge but its
 * console lines: what the person set on it (kept), an action they clicked (drafted in the message bar by the page) and
 * the room it needs (scaled down to fit, never scrolled). */
export function installArtifactPages(host:Host){
 const {store,page}=host;
 const fox=()=>host.use<FoxService>(FOX);
 const own=()=>store.writable&&!store.sampleEnabled();
 const jobs=new Map<string,Job>();
 let waiting:Job|null=null,made:{day:string;count:number}|null=null;
 const artifact=(id:string):Artifact|null=>validArtifactId(id)?store.ledger().artifactRows().map(readArtifact).find(a=>a?.id===id)??null:null;
 const kept=(id:string):ArtifactPage|null=>{try{return validArtifactId(id)?readArtifactPage(store.ledger().artifactPage(id)):null;}catch(error){host.diagnostics.record(error,'artifactPages');return null;}};
 const prune=()=>{for(const id of jobs.keys())if(fox().appletTask(id)!==ARTIFACT_PAGE_MAKER.id)jobs.delete(id);};
 const today=()=>new Date().toLocaleDateString('sv');

 function start(job:Job){
  const card=artifact(job.id);if(!card)return {ok:false,error:'That artifact is not in this world.'};
  const budget=artifactPageBudget(made,today());if(!budget.allowed)return {ok:false,error:'Enough pages were made today; this card stays as it is.'};
  const result=fox().makeArtifactPage({task:artifactPageTask(card),request:`Lay out the card “${card.title}” Fox showed`});
  if(typeof result.id==='string'){jobs.set(result.id,job);made=budget.next;}
  return {ok:true,started:true};
 }
 // One page is written at a time; the newest card waiting goes next.
 const next=setInterval(()=>{
  if(!waiting)return;
  try{prune();if(jobs.size)return;const job=waiting;waiting=null;start(job);}
  catch(error){host.diagnostics.record(error,'artifactPages');}
 },5000);

 // The page shown over the card: one at a time.
 const surface=new Surface(host);
 let view:WebContentsView|null=null,shown='',zoom=1,rect:Row={};
 function hide(){const old=view;view=null;shown='';if(old)closeGameView(surface,old);}
 function show(id:string,at:Row){
  const record=kept(id),card=artifact(id);if(!record||!card)throw new WorldletError('That card has no page.');
  const parent=surface.parent();if(!parent)throw new WorldletError('The World window is unavailable.');
  hide();
  const next=new WebContentsView({webPreferences:gameWebPreferences()});
  next.setBackgroundColor('#00000000');
  const contents=next.webContents;lockGameContents(contents);
  contents.on('console-message',details=>{
   if(view!==next)return;
   const report=readArtifactPageConsole(details.message);if(!report)return;
   if(report.state)try{const current=kept(id);if(current&&own())store.ledger().saveArtifactPage({...current,state:report.state,updatedAt:Date.now()/1000});}catch(error){host.diagnostics.record(error,'artifactPages');}
   if(typeof report.action==='number')page.event('worldlet:artifact-page',{id,action:report.action});
   // A page taller than its rectangle is scaled down until it fits; it never scrolls.
   if(report.fit&&report.fit.height&&report.fit.scrollHeight>report.fit.height+2&&zoom>.5){zoom=Math.max(.5,Math.floor(zoom*report.fit.height/report.fit.scrollHeight*100)/100);contents.setZoomFactor(zoom);}
  });
  view=next;shown=id;zoom=1;parent.addChildView(next);
  void contents.loadURL(gameURL(artifactPageDocument(record.html,{seed:{state:record.state},actions:artifactPageActions(card).length}))).catch(()=>{});
  layout(at);
 }
 function layout(at:Row){if(view&&placeGameView(surface,view,at))rect=at;}

 host.register({
  artifactPages:async request=>{
   const operation=typeof request.operation==='string'?request.operation:'';
   const id=String(request.id??'');
   if(operation==='hide'){hide();return {ok:true};}
   if(operation==='layout'){layout(request.rect??{});return {ok:true};}
   if(operation==='get'){const record=kept(id);return {page:record?{size:record.size,theme:record.theme,updatedAt:record.updatedAt}:null};}
   if(operation==='show'){if(id===shown&&view){layout(request.rect??rect);return {ok:true};}show(id,request.rect??{});return {ok:true};}
   if(operation==='make'){
    if(!own())return {ok:false,error:'Pages are made in your own world.'};
    const card=artifact(id),spec=readArtifactPageSpec(request.spec),size=request.size==='large'?'large':request.size==='medium'?'medium':null;
    if(!card||card.kind!=='answer'||!spec||!size)return {ok:false,error:'Only a card Fox laid out in conversation, at medium or large size, gets a page.'};
    const record=kept(id);if(record&&record.theme===spec.theme&&record.size===size)return {ok:true,ready:true};
    const job:Job={id,size,spec,materials:materialsOf(request.materials,spec)};
    prune();
    if([...jobs.values()].some(j=>j.id===id))return {ok:true,started:true};
    if(jobs.size){waiting=job;return {ok:true,queued:true};}
    try{return start(job);}catch(error){return {ok:false,error:(error as Error).message||'No page now.'};}
   }
   throw new WorldletError('Unknown artifact page request.');
  },
  artifactPageBrief:async request=>{
   const task=typeof request.task==='string'?request.task:'',job=jobs.get(task);
   if(!job||fox().appletTask(task)!==ARTIFACT_PAGE_MAKER.id)throw new WorldletError('Only the Artifact page task can read this.');
   if(String(request.id??'')!==job.id)throw new WorldletError(`This task lays out ${job.id} only.`);
   const card=artifact(job.id);if(!card)throw new WorldletError('That card is no longer in this world. Stop here.');
   return artifactPageBrief(card,job.spec,job.size);
  },
  artifactPageSave:async request=>{
   const task=typeof request.task==='string'?request.task:'',job=jobs.get(task);
   if(!job||fox().appletTask(task)!==ARTIFACT_PAGE_MAKER.id)throw new WorldletError('Only the Artifact page task can save a page.');
   if(String(request.id??'')!==job.id)throw new WorldletError(`This task lays out ${job.id} only.`);
   const card=artifact(job.id);if(!card)throw new WorldletError('That card is no longer in this world. Stop here.');
   const source=typeof request.html==='string'?request.html:'';
   let problems=artifactPageProblems(source,job.spec.materials.map(m=>m.id));
   const html=placeArtifactMaterials(source,job.materials);
   if(!problems.length&&html.length>ARTIFACT_PAGE_LIMITS.storedBytes)problems=['With its materials the page is too large. Use fewer materials.'];
   if(!problems.length){
    const room=ARTIFACT_PAGE_ROOM[job.size];let fit=null;
    const read=(line:string)=>{const report=readArtifactPageConsole(line);if(report?.fit)fit=report.fit;return report?(report.error?{error:report.error}:{}):null;};
    problems=await tryMadeGame(artifactPageDocument(html,{actions:artifactPageActions(card).length}),{width:room.width,height:room.height,read,problems:report=>artifactPageTrialProblems({...report,fit})});
   }
   if(problems.length)return {ok:false,problems,message:'Not saved yet. Fix every problem, then save the whole page again.'};
   const t=Date.now()/1000;
   store.ledger().saveArtifactPage({id:job.id,html,size:job.size,theme:job.spec.theme,state:{},createdAt:t,updatedAt:t});
   const ids=store.ledger().artifactPageIds();if(ids.length>ARTIFACT_PAGE_LIMITS.pages)store.ledger().deleteArtifactPages(ids.slice(ARTIFACT_PAGE_LIMITS.pages));
   if(shown===job.id)hide();
   page.event('worldlet:artifact-page',{id:job.id,ready:true});
   return {ok:true,message:'Saved and tried at the card’s size. The World shows it now. Reply with the single word Done.'};
  },
 });
 host.onPageReload(hide);
 host.onQuit(()=>{clearInterval(next);hide();});
}
