// The daily cards, the first card and the replies the companion prepares by itself: the background work the companion
// starts without being asked, with its rules in context/store (daily.ts, replies.ts, follow-up.ts). Mounted by the
// Frame's World page (ui/frame/notion-world.ts), which passes what it owns as a host; values the page replaces later
// (the World, the companion's voice, the open Attention page) are read through getters, at the moment they are needed.
import type {World} from '../../contracts/world.ts';
import {timingBucket} from '../../agent/app/index.ts';
import {connectionLive} from '../../context/applets/index.ts';
import {artifactFollowUpRequest,readDailyArtifactsState,markDailyUse,markDailyMade,dayKey,dailyArtifactDue,dailyPlanned,dailyArtifactRequest,firstPrepRequest,readDailyRoutines,DAILY_ROUTINES_ON,DAILY_ROUTINE_NAMES,readPreparedRepliesState,preparedRepliesSettling,markReplyPrepared,backgroundBlocked,replyThread,replyCandidates,replyPrepareDue,replyPrepareRequest,replyPrepareStatus,foxWorkDone,type FoxWorkKind} from '../../context/store/index.ts';
import {turnIntoDock} from './artifact-turn.ts';

export type DailyCardsHost={
 data:()=>World;
 native:any;
 root:HTMLElement;
 $:(id:string)=>any;
 voice:()=>any;
 foxArtifact:{visible:boolean;close():void};
 requestArtifactPage:(artifact:any,open:boolean)=>unknown;
 takeFollowUpDraft:()=>any;
 attentionPage:()=>any;
 showDraftLine:(page:any)=>void;
 pages:()=>Map<any,any>;
 insideApplet:()=>boolean;
 inPageLayer:()=>boolean;
 reportProductEvent:(event:string,dimensions:Record<string,string>)=>void;
};

export function createDailyCards(host:DailyCardsHost){
 const {native,root,$,foxArtifact,requestArtifactPage,takeFollowUpDraft,showDraftLine,insideApplet,inPageLayer,reportProductEvent}=host;
 const data=host.data,voice=host.voice,attentionPage=host.attentionPage,pages=host.pages;
  // The day's plan in the morning and its summary in the evening (owner request 2026-10-06), each asked of Fox
  // once a day: the two default Routines, Today's prep at 7 AM and Wrap up today at 6 PM (owner decision 2026-10-11),
  // each on unless the person turned it off (host `dailyRoutines`, `worldlet:daily-routines`). The plan is the morning
  // brief, made before the person sits down (owner Order 2026-10-07), so
  // a hidden window or an open Applet does not hold it back; the summary waits for a day they used and for the World.
  // Neither runs beside a dialog or a turn in progress, nor before the first-run tour is over (Fox stays quiet
  // through it, #1948; Mac RCs 2983 and 2985 saw the plan take Fox's bubble from the first win). Automated
  // browsers (the RC's UI checks) never get an unasked turn. Nor while the tour's phone step, which comes after the
  // first win, is still to come or showing: the evening summary took the World from it (Mac RC 3035).
  const DAILY_ARTIFACT=/^(Plan|Summary) · /;
  const dailyKey='worldlet-daily-artifacts-'+(data().workspaceId||data().workspace);
  let daily=readDailyArtifactsState(null);try{daily=readDailyArtifactsState(JSON.parse(localStorage.getItem(dailyKey)||'null'));}catch{}
  const saveDaily=()=>{try{localStorage.setItem(dailyKey,JSON.stringify(daily));}catch{}announceDaily();};
  window.addEventListener('worldlet:product-event',(event:any)=>{if(event.detail?.event!=='user_engaged'||data().sample)return;daily=markDailyUse(daily,new Date());saveDaily();});
  let followUpAsking=false;
  let dailyAsking=false,dailyAsked:{kind:'plan'|'summary';day:string}|null=null,dailyShown=false;
  let routinesOn=DAILY_ROUTINES_ON;
  const setRoutines=(value:unknown)=>{routinesOn=readDailyRoutines(value);announceDaily();};
  if(!data().sample)void Promise.resolve(native?.dailyRoutines?.()).then(value=>{if(value)setRoutines(value);}).catch(()=>{});
  window.addEventListener('worldlet:daily-routines',(event:any)=>setRoutines(event.detail));
  // The morning brief and the day's summary are kept as cards in the Journal and arrive as an Attention item (Worth
  // Knowing) that opens the Journal on that card: the host saves it with the card (core dailyScheduleResult), by the
  // rule every scheduled result follows (docs/ATTENTION-CENTER.md). The Journal never opens by itself.
  function showDailyInJournal(artifact){
   const due=dailyAsked??{kind:/^Summary · /.test(String(artifact.title||''))?'summary':'plan',day:dayKey(new Date())};dailyShown=true;
   void Promise.resolve(native?.artifacts?.({operation:'save',artifact,scheduled:due.kind,day:due.day})).catch(()=>{}).then(()=>{window.dispatchEvent(new Event('worldlet:artifacts'));void requestArtifactPage(artifact,false);});
   return {ok:true,id:artifact.id,size:artifact.size,shown:'journal'};
  }
  // When the next brief and today's summary will be made, for the Task panel's Planned timeline (ui/world/task-panel.ts);
  // nothing in the practice world or before the first run is over, which makes neither.
  const announceDaily=()=>{const none=!!data().sample||!!native?.firstRun?.();window.dispatchEvent(new CustomEvent('worldlet:daily-planned',{detail:{planned:none?[]:dailyPlanned(daily,new Date(),routinesOn),paused:none?[]:(['plan','summary'] as const).filter(kind=>!routinesOn[kind])}}));};
  setTimeout(announceDaily,0);
  // The one gate for work Fox starts by itself (context/store/replies.ts backgroundBlocked): never in the practice
  // world, an automated browser, onboarding, the first-run tour (its phone step included) or beside another request.
  const backgroundMoment=()=>backgroundBlocked({sample:!!data().sample,automated:!!navigator.webdriver,onboarding:root.dataset.onboarding==='true'||root.dataset.onboardingLocked==='true',tour:!!root.dataset.tourStep,firstRun:!!native?.firstRun?.(),asking:dailyAsking||replyAsking||followUpAsking});
  const dailyPoll=setInterval(()=>{
    if(!root.isConnected){clearInterval(dailyPoll);return;}
    announceDaily();startFirstCard();
    if(backgroundMoment()||foxArtifact.visible||$('notionDialog').open||voice()?.active)return;
    const due=dailyArtifactDue(daily,new Date(),routinesOn);
    if(!due){void prepareReply();return;}
    if(due.kind==='summary'&&(document.hidden||insideApplet()||inPageLayer()))return;
    void askDaily(due);
  },30000);
  // What Fox is doing, for its name tag and the World's Task panel (worldlet:fox-status): the step while it works, then
  // empty with what was done, which closes its window in the panel (ui/world/task-panel.ts). Reply drafts made meanwhile
  // are counted from the host's worldlet:email-drafted.
  function backgroundWork(source:string,kind:FoxWorkKind,text:string,name?:string){
    let drafted=0;const count=()=>{drafted++;};
    window.addEventListener('worldlet:email-drafted',count);
    window.dispatchEvent(new CustomEvent('worldlet:fox-status',{detail:{source,text,...(name?{name}:{})}}));
    return {drafted:()=>drafted,end(ok:boolean){window.removeEventListener('worldlet:email-drafted',count);
     window.dispatchEvent(new CustomEvent('worldlet:fox-status',{detail:{source,text:'',...(ok?{done:foxWorkDone(kind,drafted)}:{})}}));}};
  }
  async function askDaily(due:{kind:'plan'|'summary';day:string},first=false){
    dailyAsking=true;dailyAsked=due;dailyShown=false;
    // What the brief holds, as the person wrote it (Morning brief in the Journal, or told to Fox).
    let brief:string|undefined;if(due.kind==='plan'&&!first)try{brief=await native?.morningBrief?.();}catch{}
    const before=daily;daily=markDailyMade(daily,due.kind,due.day);saveDaily();
    const request=first?{text:firstPrepRequest(due.day),displayText:DAILY_ROUTINE_NAMES.plan}:dailyArtifactRequest(due.kind,due.day,brief);
    // Made quietly in a background session beside the conversation (owner Orders 2026-10-07): no message in Fox's card
    // and no reply line, the person can talk to Fox meanwhile, and the long request never fills the conversation.
    const work=backgroundWork('daily',due.kind,due.kind==='plan'?DAILY_ROUTINE_NAMES.plan+': preparing your day…':DAILY_ROUTINE_NAMES.summary+': writing it up…',DAILY_ROUTINE_NAMES[due.kind]);
    let ok=true,failed='';
    // Other background work still running: asked again at the next poll. Any other failure, or a turn that ended with
    // no card, is said plainly as a Worth Doing item (host `artifacts` scheduleFailed), never silently dropped.
    await Promise.resolve(voice()?.background?.(request.text,{displayText:request.displayText}))
     .then(()=>{if(!dailyShown)failed='It finished without making the card.';})
     .catch(error=>{ok=false;const said=String(error?.message||'');if(/busy/i.test(said)){daily=before;saveDaily();}else failed=said||'Your Agent stopped.';})
     .finally(()=>{work.end(ok);dailyAsking=false;dailyAsked=null;});
    if(first)firstCardEnded(ok,failed);
    // Today's prep and Wrap up today are Worldlet's own routines (owner 2026-10-11 20:21 PDT: Production metrics); a run
    // put off because other work was busy did not run. The host leaves the practice world out.
    if(ok||failed){reportProductEvent('routine_completed',{routine_source:'worldlet',routine_status:failed?'failed':'ok'});if(!failed)reportProductEvent('task_completed',{task_kind:'routine'});}
    // The first card's failure is no Worth Doing item: the tour would pick it as the first thing to do together.
    if(failed&&!first)void Promise.resolve(native?.artifacts?.({operation:'scheduleFailed',scheduled:due.kind,day:due.day,reason:failed})).catch(()=>{});
  }
  // The first card (owner decision 2026-10-13): a new person's first Today's prep starts the moment their World first
  // opens, whatever the hour, in a background session beside the first-run tour, so the tour's pick step
  // (ui/frame/first-value.ts) finds a card Fox already made and approving it is the first win, with no Google
  // needed. It is the one background turn the first run allows; never in the practice world or an automated browser,
  // once per World (a busy background session asks again at the next poll), not with Today's prep paused, and not
  // with Mail connected.
  // `data()-first-card` tells the tour it is on its way (`preparing`), then `ready` or `failed`. Its steps are product
  // events (agent/app/ANALYTICS.md#the-first-card): started, ready (with how it ended), shown and approved.
  const firstCardKey='worldlet-first-card-'+(data().workspaceId||data().workspace);
  let firstCardStarted=0,routinesKnown=!native?.dailyRoutines;
  const firstCardEvent=(event:string,dimensions:Record<string,string>={},duration='')=>window.dispatchEvent(new CustomEvent('worldlet:product-event',{detail:{event,dimensions,duration}}));
  function startFirstCard(){
    if(data().sample||navigator.webdriver||!routinesKnown||!native?.firstRun?.()||!voice()?.background||!routinesOn.plan||dailyAsking||replyAsking||followUpAsking)return;
    // With Mail connected, the first thing to do together comes from the mail (a task outranks the card at the tour's pick
    // step) and a card made beside it competes with Fox's help on that task (Mac Alpha 4386's onboarding check):
    // the first card is for a World without mail.
    try{if(localStorage.getItem(firstCardKey))return;localStorage.setItem(firstCardKey,connectionLive(data().moduleConnections?.find(c=>c.provider==='gmail')||{})?'mail':'started');if(localStorage.getItem(firstCardKey)==='mail')return;}catch{return;}
    firstCardStarted=performance.now();root.dataset.firstCard='preparing';firstCardEvent('first_card_started');
    void askDaily({kind:'plan',day:dayKey(new Date())},true);
  }
  function firstCardEnded(ok:boolean,failed:string){
    // Other background work was running: the next poll starts it again.
    if(!ok&&!failed){try{localStorage.removeItem(firstCardKey);}catch{}delete root.dataset.firstCard;return;}
    const result=failed?(ok?'no_card':'failed'):'ok';
    root.dataset.firstCard=result==='ok'?'ready':'failed';
    try{localStorage.setItem(firstCardKey,result);}catch{}
    firstCardEvent('first_card_ready',{first_card_result:result},timingBucket(performance.now()-firstCardStarted));
  }
  if(!data().sample)void Promise.resolve(native?.dailyRoutines?.()).catch(()=>null).finally(()=>{routinesKnown=true;setTimeout(startFirstCard,0);});
  // A follow-up on an Artifact (context/store/follow-up.ts, owner request 2026-10-11): the card turns over and drops into
  // the Doing now side beside Fox, and its request runs in a background session beside the conversation; what it makes
  // comes back as a new card. Busy with other background work, it is an ordinary turn instead.
  function followUp(sent:string){
    const draft=takeFollowUpDraft();
    // The person's own request: only the practice world and work already running beside the conversation keep it a turn.
    if(!draft||!voice()?.background||data().sample||followUpAsking||dailyAsking||replyAsking)return false;
    const request=artifactFollowUpRequest(draft,sent),input=$('notionInput') as HTMLTextAreaElement|HTMLInputElement;
    input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));
    followUpAsking=true;
    const work=backgroundWork('follow-up','follow-up',request.status,request.name);
    void turnIntoDock(root,$('foxArtifact'),()=>{foxArtifact.close();delete root.dataset.attentionPreview;voice()?.sync();},{title:request.name,status:request.status});
    let ok=true;
    void Promise.resolve(voice().background(request.text,{displayText:request.displayText}))
     .catch(error=>{ok=false;if(/busy/i.test(String(error?.message||'')))voice()?.submit?.(sent);})
     // owner 2026-10-11 20:21 PDT: Production metrics: work the person asked Fox for finished in the background.
     .finally(()=>{work.end(ok);followUpAsking=false;if(ok)reportProductEvent('task_completed',{task_kind:'fox'});});
    return true;
  }
  // Replies Fox prepares by itself (owner decision 2026-10-09; rules in context/store/replies.ts): a new Worth Doing
  // item from a Gmail thread that waits for the person gets a reply draft in a background session, a reply card in
  // today's Journal that only the person sends. Each item once, a few a day, for someone who used Worldlet lately.
  const repliesKey='worldlet-prepared-replies-'+(data().workspaceId||data().workspace);
  let replies=readPreparedRepliesState(null);try{replies=readPreparedRepliesState(JSON.parse(localStorage.getItem(repliesKey)||'null'));}catch{}
  const saveReplies=()=>{try{localStorage.setItem(repliesKey,JSON.stringify(replies));}catch{}};
  let replyAsking=false;
  // The drafts waiting for review, by Gmail thread, so an Attention card can point at the draft made for it.
  let waitingDrafts:{id:string;thread:string;createdAt:number}[]=[];
  async function readDrafts(){
    if(!native?.emailReviews)return waitingDrafts=[];
    const list=await native.emailReviews();
    return waitingDrafts=(Array.isArray(list)?list:[]).filter(r=>r&&!r.attempted&&typeof r.id==='string').map(r=>({id:r.id,thread:String(r.draft?.threadId||''),createdAt:Number(r.createdAt)||0}));
  }
  window.addEventListener('worldlet:email-drafted',()=>{void readDrafts().then(()=>{if(attentionPage())showDraftLine(attentionPage());}).catch(()=>{});});
  async function prepareReply(){
    if(replyAsking||!native?.emailReviews||!voice()?.background)return;
    const now=new Date();
    if(!replies.since){replies=preparedRepliesSettling(replies,now);saveReplies();return;}
    const items=[...pages().values()].filter(p=>p.worldItemId).map(p=>({id:p.worldItemId,kind:p.worldItemKind,status:p.worldItemStatus,snoozedUntil:p.worldItemSnoozedUntil,ready:p.worldItemContentReady,title:p.worldItemSignal?.title||p.title,sources:p.worldItemSources,receivedAt:p.worldItemSignal?.receivedAt,occurredAt:p.worldItemSignal?.occurredAt,sourceUpdatedAt:p.worldItemSignal?.sourceUpdatedAt}));
    if(!replyCandidates(items,replies,{now}).length)return;
    replyAsking=true;
    try{
     const drafts=await readDrafts();
     if(!replyPrepareDue(replies,{now,daily,waiting:drafts.length}).due)return;
     const candidates=replyCandidates(items,replies,{now,drafted:drafts.map(d=>d.thread)});
     // An item whose thread already has a draft waiting (the morning brief's, say) counts as prepared, without asking.
     for(const item of items)if(!candidates.some(c=>c.id===item.id)&&drafts.some(d=>d.thread&&d.thread===replyThread(item))&&!replies.prepared.includes(item.id))replies=markReplyPrepared(replies,item.id,now,{asked:false,thread:replyThread(item)});
     saveReplies();
     const next=candidates[0];if(!next)return;
     const before=replies;replies=markReplyPrepared(replies,next.id,now,{thread:next.thread});saveReplies();
     const request=replyPrepareRequest(next),work=backgroundWork('reply','reply',replyPrepareStatus(next));
     let ok=true;
     // Busy with other background work: the item is asked again at the next poll.
     await Promise.resolve(voice().background(request.text,{displayText:request.displayText}))
      .catch(error=>{ok=false;if(/busy/i.test(String(error?.message||''))){replies=before;saveReplies();}})
      .finally(()=>work.end(ok));
    }catch{}finally{replyAsking=false;}
  }
 return {
  /** Whether an artifact's title makes it a daily card (the morning brief or the day's summary). */
  isDaily:(title:string)=>DAILY_ARTIFACT.test(title),
  showDailyInJournal,followUp,readDrafts,
  /** The reply drafts waiting for review, by Gmail thread, as last read. */
  waitingDrafts:()=>waitingDrafts,
 };
}
