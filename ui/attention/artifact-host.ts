// The cards the companion shows and the Journal that keeps them: every card is kept as an artifact
// (context/store/ARTIFACTS.md), laid out as a page in the theme's style when it is large enough, drafted into a next step
// the person sends, and opened again from the Journal. Mounted by the Frame's World page (ui/frame/notion-world.ts),
// which passes what it owns as a host; values it replaces later (the World, the companion's voice) are read through
// getters, at the moment they are needed.
import type {World} from '../../contracts/world.ts';
import {type ArtifactFollowUpDraft,artifactPageActions,artifactRenderMode,readArtifact,backgroundBlocked} from '../../context/store/index.ts';
import {momentAppletId} from '../../context/applets/index.ts';
import {mountFoxArtifact} from './fox-artifact.ts';
import {flyIntoJournal} from './journal-book.ts';
import {artifactPageSpec} from './artifact-spec.ts';

export type ArtifactHostOptions={
 data:()=>World;
 native:any;
 root:any;
 $:(id:string)=>any;
 voice:()=>any;
 sections:any[];
 renderMarkdown:(markdown:string,options?:any)=>any;
 openWorldURL:(href:string,from?:any)=>unknown;
 insideApplet:()=>boolean;
 previewAttention:(item:any)=>any;
 closeAttentionPreview:(restoreFocus?:boolean)=>void;
 visitObject:(id:string)=>void;
 notify:(text:string)=>void;
};

export function createArtifactHost(host:ArtifactHostOptions){
 const {native,root,$,sections,renderMarkdown,openWorldURL,insideApplet,previewAttention,closeAttentionPreview,visitObject,notify}=host;
 const data=host.data,voice=host.voice;
 // Every card Fox shows is kept as an artifact (context/store/ARTIFACTS.md); the person finds it again in Fox's panel.
 let shownArtifact:any=null,artifactsShown=0,nextArtifactLabel:string|null=null;
 // The last save, so a page is asked for only once its artifact is kept.
 let keeping:Promise<unknown>=Promise.resolve();
 const keepArtifact=(artifact)=>{if(native?.artifacts)keeping=Promise.resolve(native.artifacts({operation:'save',artifact})).then(()=>window.dispatchEvent(new Event('worldlet:journal-changed'))).catch(()=>{});};
 const foxArtifact=mountFoxArtifact(root,renderMarkdown,putArtifactAway,href=>openWorldURL(href),size=>{if(shownArtifact){shownArtifact={...shownArtifact,size};keepArtifact(shownArtifact);}},
  // A next step on the card drafts the person's request in Fox's message bar; it goes to Fox only when they send it,
  // so a card made from untrusted content can never speak for them (context/store/ARTIFACTS.md#actions).
  action=>draftRequest(action),
  // What the person ticks or sets on the card's blocks is kept with it, so the Journal and a reopened card show it.
  blocks=>{if(shownArtifact){shownArtifact={...shownArtifact,blocks};keepArtifact(shownArtifact);}},
  native?.artifactPages);
 function putArtifactAway(){flyIntoJournal(root,$('foxArtifact'));foxArtifact.close();delete root.dataset.attentionPreview;voice()?.sync();}
 // The next step picked on the open card, until it is sent: sent while the card is still open, it runs in the
 // background as a follow-up beside Fox (context/store/follow-up.ts, followUp below).
 // An emptied bar drops it.
 let followUpDraft:ArtifactFollowUpDraft|null=null,followUpWatched=false;
 function draftRequest(action:{request:string}){if(shownArtifact&&foxArtifact.visible)followUpDraft={id:String(shownArtifact.id),title:String(shownArtifact.title||''),request:action.request};const input=root.querySelector('#notionInput') as HTMLTextAreaElement|HTMLInputElement|null;if(!input)return;
  if(!followUpWatched){followUpWatched=true;input.addEventListener('input',()=>{if(!input.value.trim())followUpDraft=null;});}input.value=action.request;input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();input.setSelectionRange?.(input.value.length,input.value.length);}
 // Theme-driven Artifacts (context/store/ARTIFACTS.md#theme-driven-artifacts): an answer shown at medium or large size in
 // the World is laid out as a page in the theme's style by a quiet background task; the template card shows until then.
 async function requestArtifactPage(artifact:{id:string;kind:'answer'|'attention';size:'small'|'medium'|'large'},inApplet=insideApplet()){
  if(!native?.artifactPages||artifactRenderMode(artifact,{theme:true,generator:true,inApplet})!=='page')return;
  // Work Fox starts by itself waits out the practice world, onboarding, the tour, the first run and automated browsers.
  if(backgroundBlocked({sample:!!data().sample,automated:!!navigator.webdriver,onboarding:root.dataset.onboarding==='true'||root.dataset.onboardingLocked==='true',tour:!!root.dataset.tourStep,firstRun:!!native?.firstRun?.(),asking:false}))return;
  const look=await artifactPageSpec();if(!look)return;
  await keeping;
  const result:any=await native.artifactPages({operation:'make',id:artifact.id,size:artifact.size,spec:look.spec,materials:look.materials}).catch(()=>null);
  if(result?.ready)foxArtifact.page(artifact.id);
 }
 async function showKeptPage(id:string){
  if(!native?.artifactPages)return;
  const result:any=await native.artifactPages({operation:'get',id}).catch(()=>null);
  if(result?.page)foxArtifact.page(id);
 }
 // A page became ready, or the person clicked one of its actions: it drafts Fox's own request, as a next step does.
 window.addEventListener('worldlet:artifact-page',(event:any)=>{
  const {id,ready,action}=event.detail||{};if(typeof id!=='string')return;
  if(ready===true)foxArtifact.page(id);
  if(typeof action==='number'&&shownArtifact?.id===id&&foxArtifact.shownId===id){const chosen=artifactPageActions(shownArtifact)[action];if(chosen)draftRequest(chosen);}
 });
 function showArtifact(args,artifact){
  const result=foxArtifact.show(args);
  if(result.ok){artifactsShown++;closeAttentionPreview(false);root.dataset.attentionPreview='true';voice()?.sync();shownArtifact=artifact?{...artifact,size:result.size}:null;if(shownArtifact)keepArtifact(shownArtifact);}
  return result;
 }
 async function openArtifact(id):Promise<{error?:string;[key:string]:unknown}>{
  if(!native?.artifacts)return {error:'The practice world keeps no artifacts.'};
  const artifact=readArtifact((await native.artifacts({operation:'get',id}))?.artifact);
  if(!artifact)return {error:'That artifact is not in this World any more.'};
  // An Attention card opens on its item while the item is in the World, with its outcomes.
  if(artifact.origin.type==='attention'&&previewAttention({worldItemId:artifact.origin.item}))return {ok:true,id:artifact.id,title:artifact.title};
  const label=artifact.kind==='attention'?(artifact.category||'Attention')+' · earlier':'From an earlier conversation';
  const shown=showArtifact({id:artifact.id,title:artifact.title,body:artifact.body||' ',brief:artifact.brief||null,detail:artifact.detail||null,chart:artifact.chart,size:artifact.size,actions:artifact.actions,blocks:artifact.blocks||null,tone:artifact.tone||null,art:artifact.art||null,label},artifact.kind==='answer'?artifact:null);
  if(shown.ok&&artifact.kind==='answer')void showKeptPage(artifact.id);
  return shown;
 }
 // A page Fox made is an Applet while its moment lasts or once kept; a finished one comes back when the person keeps it.
 async function openMade(widget:string,keep:boolean){
  const applet=momentAppletId(widget);
  if(keep){if(!native?.widgets)return;try{await native.widgets({operation:'pin',id:widget});}catch(error){notify(error.message||'Could not bring it back.');return;}}
  const here=()=>sections.some(r=>r.moduleId===applet);
  for(let tries=0;tries<25&&!here();tries++)await new Promise(resolve=>setTimeout(resolve,120));
  if(here())visitObject(applet);else notify('That Thing is not in this World any more.');
 }
 // Fox's line pointed to an Attention item (ui/companion/fox-proactive.ts): its card opens, or the person hears it is settled.
 window.addEventListener('worldlet:attention-open',(event:any)=>{
  const id=event.detail?.id;
  if(typeof id==='string'&&id&&!previewAttention({worldItemId:id}))notify('That card is not in Attention any more.');
 });
 window.addEventListener('worldlet:artifact-open',(event:any)=>{
  const detail=event.detail||{};
  if(typeof detail.made==='string'){void openMade(detail.made,detail.keep===true);return;}
  void openArtifact(String(detail.id||'')).then(result=>{if(result?.error)notify(result.error);});
 });
 return {
  /** The card on screen (ui/attention fox-artifact). */
  foxArtifact,
  /** The artifact the open card shows, or null; clear() forgets it when an Attention card takes its place. */
  shown:()=>shownArtifact,clearShown:()=>{shownArtifact=null;},
  /** How many cards have been shown, so a turn can tell whether it showed one. */
  count:()=>artifactsShown,
  /** The label the next card carries instead of "From this conversation"; taking it clears it. */
  takeNextLabel:()=>{const label=nextArtifactLabel;nextArtifactLabel=null;return label;},setNextLabel:(label:string|null)=>{nextArtifactLabel=label;},
  /** The next step picked on the open card, until it is sent; taking it clears it. */
  followUpDraft:()=>followUpDraft,takeFollowUpDraft:()=>{const draft=followUpDraft;followUpDraft=null;return draft;},
  keep:keepArtifact,putAway:putArtifactAway,draft:draftRequest,requestPage:requestArtifactPage,show:showArtifact,open:openArtifact,
 };
}
