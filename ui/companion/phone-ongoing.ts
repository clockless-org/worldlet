// The companion's other windows and its ongoing things: the paired phone (mountPhoneBridge), the widgets for now, and
// the ongoing things Fox offers as themes (agent/tasks/README.md). Mounted by the Frame's World page
// (ui/frame/notion-world.ts) when it runs in the app; values the page replaces later (the World, the companion's voice,
// the HUD) are read through getters, at the moment they are needed.
import type {World} from '../../contracts/world.ts';
import {attentionPreviewData} from '../../agent/attention/index.ts';
import {foxSessions,ongoingLine,ongoingThemes,ongoingThemeRequest,isOngoingThemeId,type OngoingThing} from '../../agent/tasks/index.ts';
import {readArtifact} from '../../context/store/index.ts';
import {myAppletKind,appletStatus as appStatus} from '../../context/applets/index.ts';
import {phoneWebAddress} from '../../platform/web/index.ts';
import {lastUse} from '../world/index.ts';
import {mountPhoneBridge} from './phone-bridge.ts';

export type CompanionNativeHost={
 data:()=>World;
 native:any;
 root:any;
 voice:()=>any;
 nativeHUD:()=>any;
 sections:any[];
 regionLayout:any;
 notify:(text:string)=>void;
 visitObject:(id:string)=>void;
 previewAttention:(item:any)=>any;
 itemPage:(id:string)=>any;
 previewActions:(page:any)=>{label:string;run:()=>unknown}[];
 settleAttention:(...args:any[])=>any;
 artifactsShown:()=>number;
 setNextArtifactLabel:(label:string|null)=>void;
 setFirstValueOngoing:(value:{list:()=>{id:string,title:string,say:string}[],make:(id:string)=>Promise<boolean>})=>void;
 resetSourceIssues:()=>void;
};

export function mountCompanionNative(host:CompanionNativeHost){
 const {native,root,sections,regionLayout,notify,visitObject,previewAttention,itemPage,previewActions,settleAttention,setNextArtifactLabel,setFirstValueOngoing,resetSourceIssues}=host;
 const data=host.data,voice=host.voice,nativeHUD=host.nativeHUD,artifactsShown=host.artifactsShown;
  // The paired iPhone mirrors the Center and talks to Fox through this page (platform/web/README.md).
  let widgetsNow:any[]=[],phoneWorldLog:{lines:any[],now:any[]}={lines:[],now:[]};
  // Ongoing things (agent/tasks/README.md): proposals stand in Worth Doing as themes; each one kept earlier is a Thing of
  // its own, a device in the area Fox picked (app-job-…), with its own tile in the phone's Thing world and its own thread.
  let ongoingProposals:OngoingThing[]=[],ongoingKept:(OngoingThing&{recent:{text:string,at:string}[]})[]=[];
  // Every other brought conversation that looks like one job (agent/tasks ongoingCandidates): the phone lists each as a
  // thing of its own, and the first line said in one keeps it here (owner request 2026-10-11).
  let ongoingOthers:(OngoingThing&{recent:{text:string,at:string}[]})[]=[];
  // Today's Journal cards and the Task panel's cards, for the phone's Today and Tasks tabs.
  let journalToday:any[]=[],taskPanelNow:any=null;
  const ongoingDecide=async(id:string,operation:'later'|'decline')=>{if(native.ongoing)await native.ongoing({operation,id});};
  // What Fox offers from them is a theme, never one conversation (agent/tasks/themes.ts): the conversations about one part
  // of life, pulled together by Fox into one artifact laid out like every other (Kelvin 2026-10-07).
  const themesNow=()=>ongoingThemes(ongoingProposals,Date.now()/1000);
  const decideTheme=async(id:string,operation:'later'|'decline')=>{
   const theme=themesNow().find(t=>t.id===id);if(!theme)return null;
   for(const thing of theme.things)await ongoingDecide(thing.id,operation);
   ongoingProposals=ongoingProposals.filter(t=>!theme.things.some(x=>x.id===t.id));nativeHUD()?.sync();phone?.world();
   return theme;
  };
  // Asking for the page puts the theme off for a while (Not now's week), so the row leaves Worth Doing; Fox's turn makes
  // the artifact. Resolves when the turn is over, telling whether Fox showed one.
  const makeTheme=async(id:string)=>{
   const theme=await decideTheme(id,'later');if(!theme||!voice()?.ask)return false;
   const before=artifactsShown(),request=ongoingThemeRequest(theme);
   // The page comes from several past conversations, so its card says so instead of "From this conversation".
   setNextArtifactLabel(theme.label);
   await voice().ask(request.text,{displayText:request.displayText,icon:'spark'});
   for(let i=0;i<1500&&voice()?.active;i++)await new Promise(resolve=>setTimeout(resolve,400));
   setNextArtifactLabel(null);
   return artifactsShown()>before;
  };
  setFirstValueOngoing({list:()=>themesNow().map(t=>({id:t.id,title:t.title,say:t.say})),make:makeTheme});
  // Fox lays the offer out the way it lays out an item's card: why, then the choices.
  const offerOngoing=(id:string)=>{
   const theme=themesNow().find(t=>t.id===id);if(!theme||!voice()?.setGuide)return;
   const choice=(label:string,run:()=>Promise<unknown>)=>{
    const b=document.createElement('button');b.type='button';b.textContent=label;
    b.onclick=()=>{voice()?.setGuide?.(null);void run().catch(error=>notify(error?.message||String(error)));};
    return b;
   };
   voice().setGuide({source:'ongoing:'+id,takeover:true,text:theme.say,actions:[choice(theme.option,()=>makeTheme(id)),choice('Not now',()=>decideTheme(id,'later')),choice('Don\'t ask again',()=>decideTheme(id,'decline'))]});
   voice().revealGuide?.();
  };
  const phone=!data().sample&&native.phonePublish?mountPhoneBridge({publish:native.phonePublish,publishLive:value=>native.phonePublish(value,'live'),answer:(id,choice)=>native.harnessApproval?.(id,choice),ask:text=>voice()?.ask(text,{origin:'user',displayText:text}),
   // A line or the option chosen on the phone with an item's card open opens that card here too, so it joins the
   // item's own conversation and both screens show the same dialogue.
   askItem:(id,text)=>{previewAttention({worldItemId:id});return voice()?.ask(text,{origin:'user',displayText:text});},
   choose:id=>{if(id.startsWith('ongoing:'))return isOngoingThemeId(id.slice(8))?makeTheme(id.slice(8)):undefined;const page=itemPage(id);if(!page||!previewAttention({worldItemId:id}))return;return previewActions(page)[0]?.run();},
   itemFox:id=>{if(id.startsWith('ongoing:')){const theme=themesNow().find(t=>'ongoing:'+t.id===id);if(!theme)return null;return {say:theme.say,option:theme.option,turns:[]};}const page=itemPage(id);if(!page)return null;return {say:attentionPreviewData(page).suggestion,option:previewActions(page)[0]?.label||'',turns:voice()?.threadOf?.('attention:'+id)||[]};},
   // The Thing world (agent/app phoneApplets): the Things in this World with their lamps, what each is doing, the
   // world log, the widgets for now and each Thing's thread. A line said in a Thing's page opens it here first.
   askApplet:async(key,text)=>{
    let r=sections.find(s=>s.entity==='app'&&s.key===key);
    // A thing not kept yet becomes a Thing first, so the line joins its own thread; its device arrives with the
    // World update keeping it sends.
    if(!r&&ongoingOthers.some(t=>t.id===key)&&native.ongoing){
     try{await native.ongoing({operation:'keep',id:key});}catch{}
     for(let i=0;i<40&&!(r=sections.find(s=>s.entity==='app'&&s.key===key));i++)await new Promise(resolve=>setTimeout(resolve,150));
    }
    if(r&&root.appletLayout.has(r.moduleId))visitObject(r.moduleId);return voice()?.ask(text,{origin:'user',displayText:text});},
   openApplet:key=>{const r=sections.find(s=>s.entity==='app'&&s.key===key);if(r&&root.appletLayout.has(r.moduleId))visitObject(r.moduleId);},
   world:()=>({places:sections.filter(r=>r.entity==='app'&&r.key&&!r.ongoing&&!r.moment&&root.appletLayout.has(r.moduleId)).sort((a,b)=>lastUse(b,regionLayout)-lastUse(a,regionLayout)).map(r=>{const status=appStatus(r,data().moduleConnections||[]),phase=status.phase;
     return {key:r.key,title:r.title,provider:r.provider||r.key,label:status.label,source:!['browser','local','unavailable','planned'].includes(phase),mine:myAppletKind(r)??undefined,url:phoneWebAddress(r),
      state:['reading','syncing'].includes(phase)?'busy':status.failed?'failed':status.connected||status.usableWithoutLogin||['browser','local'].includes(phase)?'ready':'off'};}),
    now:phoneWorldLog.now,log:phoneWorldLog.lines,widgets:widgetsNow.map(w=>({id:w.id,title:w.title})),jobs:[...ongoingKept,...ongoingOthers].map(t=>({id:t.id,title:t.title,line:ongoingLine(t,Date.now()/1000),recent:t.recent})),thread:key=>voice()?.threadOf?.('object:app-'+key)||[]}),
   // On the phone, Done asks Fox for a theme's page, Later is Not now and Remove is Don't ask again.
   tasks:()=>taskPanelNow,journal:()=>journalToday,
   settle:(item,status,until)=>{if(!item.worldItemId.startsWith('ongoing:'))return settleAttention(item,status,until,{surface:'phone'});const id=item.worldItemId.slice(8);return status==='dismissed'?decideTheme(id,'decline'):until?decideTheme(id,'later'):makeTheme(id);},kindOf:id=>itemPage(id)?.worldItemKind,ready:()=>!!voice()&&root.dataset.onboardingLocked!=='true'}):null;
  if(phone)root.addEventListener('worldlet:fox-thread',()=>phone.refresh());
  window.addEventListener('worldlet:world-log',(event:any)=>{phoneWorldLog=event.detail||phoneWorldLog;phone?.world();});
  if(phone)root.addEventListener('worldlet:fox-live',(event:any)=>phone.live(event.detail));
  if(phone)window.addEventListener('worldlet:harness-approval',(event:any)=>phone.approval(event.detail));
  if(phone){root.addEventListener('worldlet:source-issues',(event:any)=>phone.accounts(event.detail||[]));resetSourceIssues();}
  // Widgets for now lead the Center (context/store/ARTIFACTS.md); the first one Fox makes puts the Widgets Thing on the
  // ground, and the panel opens it next.

  const loadWidgets=()=>{if(data().sample||!native.widgets)return;void native.widgets({operation:'list'}).then(result=>{widgetsNow=Array.isArray(result?.now)?result.now:[];nativeHUD()?.sync();phone?.world();}).catch(()=>{});};
  // A made Thing's device arrives with the World update the host sends with this event.
  window.addEventListener('worldlet:widgets',()=>loadWidgets());
  loadWidgets();
  const loadOngoing=async()=>{
   if(data().sample||!native.ongoing)return;
   try{
    const result=await native.ongoing({operation:'list'});
    ongoingProposals=Array.isArray(result?.proposals)?result.proposals.filter(t=>!(t.laterUntil>Date.now()/1000)):[];
    const kept:OngoingThing[]=Array.isArray(result?.kept)?result.kept:[];
    const withRecent=(list:OngoingThing[])=>Promise.all(list.map(async t=>{const r=await native.ongoing({operation:'turns',id:t.id,limit:4}).catch(()=>null);
     return {...t,recent:Array.isArray(r?.recent)?r.recent:[]};}));
    const others:OngoingThing[]=Array.isArray(result?.candidates)?result.candidates:[];
    // Fox's sessions beside its conversation (agent/tasks/fox-sessions.ts): the Things, then the other conversations.
    root.dispatchEvent(new CustomEvent('worldlet:fox-sessions',{detail:{sessions:foxSessions(kept,others),turns:(id:string)=>native.ongoing({operation:'turns',id,limit:24})}}));
    ongoingKept=await withRecent(kept);
    ongoingOthers=phone?await withRecent(others):[];
    nativeHUD()?.sync();phone?.world();
   }catch{}
  };
  window.addEventListener('worldlet:ongoing',()=>void loadOngoing());
  void loadOngoing();
  if(phone){
   window.addEventListener('worldlet:task-panel',(event:any)=>{taskPanelNow=event.detail??null;phone.world();});
   // Today's Journal, read again when a card is kept and every few minutes (the day turns over, the host keeps the
   // morning brief and the day's summary itself).
   const loadJournal=()=>{if(!native.artifacts)return;void Promise.resolve(native.artifacts({operation:'list'})).then(r=>{journalToday=(r?.artifacts||[]).map(readArtifact).filter(Boolean);phone.world();}).catch(()=>{});};
   window.addEventListener('worldlet:journal-changed',()=>loadJournal());
   setInterval(loadJournal,5*60_000);loadJournal();
  }
 return {
  /** The paired phone's bridge, or null in the practice world or without a phone. */
  phone,
  widgetsNow:()=>widgetsNow,
  themesNow,offerOngoing,
 };
}
