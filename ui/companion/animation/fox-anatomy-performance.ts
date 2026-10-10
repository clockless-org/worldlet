import {smoother} from './fox-skeleton.ts';
import {anatomyStudy,ANATOMY_STUDY_DURATION,type AnatomyStudy} from './fox-anatomy-clips.ts';
import {anatomyHold,ANATOMY_HOLD_STATES,type AnatomyHoldState} from './fox-anatomy-hold.ts';
import {delightedStudy,DELIGHTED_TAKEOFF_MS} from './fox-delighted-study.ts';
import {attentionStudy} from './fox-attention-study.ts';
import {createReadingBookPlayer,type ReadingBookIntent} from './fox-reading-book-player.ts';
import {workingStudy} from './fox-working-study.ts';
import {createWorkingPlayer,type WorkingIntent} from './fox-working-player.ts';
import {searchingStudy} from './fox-searching-study.ts';
import {createSearchPickupPlayer,type SearchPickupIntent} from './fox-search-pickup-player.ts';
import {blockedStudy} from './fox-blocked-study.ts';
import {waitingStudy} from './fox-waiting-study.ts';
import {createDraftingPlayer} from './fox-drafting-player.ts';
import {draftingBodyFrame} from './fox-drafting-motion.ts';
import {createAnatomyTransition,type AnatomyFrame} from './fox-anatomy-transition.ts';
import {createOccupiedAttention} from './fox-occupied-attention.ts';

export type AnatomyPerformanceState=AnatomyStudy|AnatomyHoldState|'reading'|'drafting';
type DraftEpisode={clock:ReturnType<typeof createDraftingPlayer>;frame:ReturnType<ReturnType<typeof createDraftingPlayer>['sample']>};
type BookEpisode={player:ReturnType<typeof createReadingBookPlayer>;intent:ReadingBookIntent;detached?:boolean};
type TimedPropEpisode={origin:number;handling?:{player:ReturnType<typeof createWorkingPlayer>;frame:ReturnType<ReturnType<typeof createWorkingPlayer>['sample']>;intent:WorkingIntent;restOrigin?:number;leaveRest?:number};pickup?:{player:ReturnType<typeof createSearchPickupPlayer>;frame:ReturnType<ReturnType<typeof createSearchPickupPlayer>['sample']>;intent:SearchPickupIntent;restOrigin?:number;leaveRest?:number}};
type Instance={state:AnatomyPerformanceState;origin:number;exit?:number;groundedGreetingExit?:boolean;groundedExplanationExit?:boolean;cancelTakeoff:boolean;seatedDelight?:boolean;cancelAttentionAt?:number;cancelSignalsAt?:number;book?:BookEpisode;work?:TimedPropEpisode;search?:TimedPropEpisode;draft?:DraftEpisode};
const supported=new Set<string>([...ANATOMY_HOLD_STATES,...Object.keys(ANATOMY_STUDY_DURATION),'reading','drafting']);
const held=new Set<string>([...ANATOMY_HOLD_STATES,'reading','drafting']);
const propConversation=new Set<AnatomyPerformanceState>(['listening','thinking','explaining']);
const workRest=new Set<AnatomyPerformanceState>(['idle','looking','succeeded']);

/** Explicit caller-selected performances, not a task/idle scheduler. Finite
 * gestures run once; held work/conversation retains its clock. Each entry has
 * separate exit policy so cancelling an old takeoff cannot cancel a new one. */
export function createAnatomyPerformancePlayer(options:{searchPickup?:boolean;workHandling?:boolean;workStow?:boolean;occupiedAttention?:boolean}={}){
 if(options.workStow&&!options.workHandling)throw Error('Work stowing requires physical lid handling');
 const attention=createOccupiedAttention();
 const duration=650,instances=new Map<string,Instance>();let serial=0,current:string|undefined,last=-Infinity;
 let book:BookEpisode|undefined,work:TimedPropEpisode|undefined,sampleTime=0;
 let draft:DraftEpisode|undefined;
 let search:TimedPropEpisode|undefined;
 let installedWork:TimedPropEpisode|undefined;
 let installedVisible=false;
 let handoff:{state:AnatomyPerformanceState;at:number}|undefined;
 const expireWorkRest=(h:NonNullable<TimedPropEpisode['handling']>,now:number)=>{
  if(h.leaveRest!==undefined&&now>=h.leaveRest+duration){h.restOrigin=undefined;h.leaveRest=undefined;}
 };
 const mixer=createAnatomyTransition((key,elapsed,reduced)=>{
  const instance=instances.get(key);if(!instance)throw Error('Missing anatomical performance instance');
  if(instance.draft){const {time,pauseWeight,bodyTime}=instance.draft.frame;return {...draftingBodyFrame(time,reduced,pauseWeight,bodyTime),front:{L:0,R:0}};}
  if(instance.search?.pickup){
   const pickup=instance.search.pickup,f=pickup.frame;
   const pose={...(f.restTime!==undefined?anatomyHold('idle',f.restTime,reduced).pose:f.pose)};
   if(f.restTime===undefined&&pickup.restOrigin!==undefined&&pickup.leaveRest!==undefined){
    const t=Math.min(1,Math.max(0,(sampleTime-pickup.leaveRest)/650)),weight=1-t*t*t*(10+t*(-15+6*t));
    const ambient=anatomyHold('idle',sampleTime-pickup.restOrigin,reduced).pose;
    for(const [id,control] of Object.entries(ambient)){
     const mixed={...pose[id]};
     for(const field of ['angle','x','y','closure'] as const)if(control[field]!==undefined)mixed[field]=(mixed[field]??0)+control[field]!*weight;
     pose[id]=mixed;
    }
   }
   const gesture=instance.state==='looking'||instance.state==='succeeded'?instance.state:undefined;
   const expression=propConversation.has(instance.state)?anatomyHold(instance.state as AnatomyHoldState,elapsed,reduced)
    :gesture?{pose:reduced||elapsed<ANATOMY_STUDY_DURATION[gesture]?anatomyStudy(gesture,elapsed,reduced,{cancelSignalsAfter:instance.cancelSignalsAt}).pose:anatomyHold('idle',elapsed-ANATOMY_STUDY_DURATION[gesture],reduced).pose}:undefined;
   if(expression)for(const id of ['head','earL','earR','lidL','lidR'])pose[id]=expression.pose[id];
   // Complete with one nod/tail response while the occupied hands return the
   // tool. Do not replace those hands with the generic completion gesture.
   if(instance.state==='succeeded'&&expression)for(const id of ['tailMid','tailTip','scarfTail'])pose[id]=expression.pose[id];
   return {pose,front:{L:1,R:1},gazeDown:expression?0:f.gazeDown,graspR:f.graspR,magnifier:1};
  }
  if(instance.search&&(instance.state==='searching'||propConversation.has(instance.state))){
   const paused=instance.state!=='searching',frame=searchingStudy(sampleTime-instance.search.origin,reduced,true,paused);
   const conversation=paused?anatomyHold(instance.state as AnatomyHoldState,elapsed,reduced):undefined;
   const pose={...frame.pose};
   if(conversation)for(const id of ['head','earL','earR','lidL','lidR'])pose[id]=conversation.pose[id];
   return {pose,front:{L:1,R:1},gazeDown:paused?0:frame.gazeDown,magnifier:frame.magnifier};
  }
  if(instance.work&&(instance.state==='working'||propConversation.has(instance.state)||workRest.has(instance.state))){
   if(instance.work.handling){
    const handling=instance.work.handling,f=handling.frame,pose={...f.pose};
    if(handling.restOrigin!==undefined){
     const weight=reduced?1:smoother((sampleTime-handling.restOrigin)/650)*(handling.leaveRest===undefined?1:1-smoother((sampleTime-handling.leaveRest)/650));
     const ambient=anatomyHold('idle',sampleTime-handling.restOrigin,reduced).pose;
     for(const [id,control] of Object.entries(ambient)){pose[id]={...pose[id]};for(const key of ['angle','x','y','closure'] as const)if(control[key]!==undefined)pose[id][key]=(pose[id][key]??0)+control[key]!*weight;}
    }
    const gesture=instance.state==='looking'||instance.state==='succeeded'?instance.state:undefined;
    const expression=propConversation.has(instance.state)?anatomyHold(instance.state as AnatomyHoldState,elapsed,reduced):gesture?(reduced||elapsed<ANATOMY_STUDY_DURATION[gesture]?anatomyStudy(gesture,elapsed,reduced,{cancelSignalsAfter:instance.cancelSignalsAt}):anatomyHold('idle',elapsed-ANATOMY_STUDY_DURATION[gesture],reduced)):undefined;
    if(expression)for(const id of ['head','earL','earR','lidL','lidR'])pose[id]=expression.pose[id];
    // The installed device no longer owns the hands after it is closed.
    // Quiet body motion may continue without reopening or dissolving the lid.
    if(f.readyToLeave&&workRest.has(instance.state)){
     const restPose={...pose};
     if(expression)for(const id of ['head','earL','earR','lidL','lidR','tailMid','tailTip'])restPose[id]=expression.pose[id];
     return {pose:restPose,front:{L:1,R:1},workstation:1};
    }
    if(instance.state==='succeeded'&&expression)for(const id of ['tailMid','tailTip','scarfTail'])pose[id]=expression.pose[id];
    return {pose,front:{L:1,R:1},gazeDown:expression?0:f.gazeDown,workstation:f.workstation};
   }
   const paused=instance.state!=='working',frame=workingStudy(sampleTime-instance.work.origin,reduced,true,paused);
   // The workstation rests independently of the hands. On quiet rest, blend
   // the hands back to the authored resting pose without dissolving the desk
   // underneath them. Re-entering work retains this same installed device.
   if(workRest.has(instance.state)){
    const end=instance.state==='idle'?0:ANATOMY_STUDY_DURATION[instance.state as AnatomyStudy];
    let rest:AnatomyFrame;
    if(instance.state==='idle'||!reduced&&elapsed>=end)rest=anatomyHold('idle',instance.state==='idle'?elapsed:elapsed-end,reduced);
    else{
     const gesture=anatomyStudy(instance.state as AnatomyStudy,elapsed,reduced,{cancelSignalsAfter:instance.cancelSignalsAt});
     rest={pose:gesture.pose,front:{L:gesture.frontPaws.includes('L')?1:0,R:gesture.frontPaws.includes('R')?1:0},gazeDown:gesture.gazeDown,pawTurnR:gesture.pawTurnR};
    }
    return {...rest,workstation:frame.workstation};
   }
   const conversation=paused?anatomyHold(instance.state as AnatomyHoldState,elapsed,reduced):undefined;
   const pose={...frame.pose};
   // Keep the supported torso and occupied arms. Conversation supplies its
   // own attention/expression without adding a chin paw or free-hand gesture.
   if(conversation)for(const id of ['head','earL','earR','lidL','lidR'])pose[id]=conversation.pose[id];
   return {pose,front:{L:1,R:1},gazeDown:paused?0:frame.gazeDown,workstation:frame.workstation};
  }
  if(instance.state==='reading'||instance.state==='idle'&&instance.book){
   if(!instance.book)throw Error('Missing reading episode');
   const frame=instance.book.player.sample(instance.book.intent,sampleTime,reduced);
   return {pose:frame.pose,front:frame.front,gazeDown:frame.gazeDown};
  }
  if(instance.state==='urgent'&&instance.cancelAttentionAt!==undefined){const {pose,pawTurnR}=attentionStudy('urgent',elapsed,reduced,true,{cancelSignalsAfter:instance.cancelAttentionAt});return {pose,front:{L:1,R:1},pawTurnR};}
  if(instance.state==='blocked'&&instance.cancelSignalsAt!==undefined){const {pose,gazeDown,pawTurnR}=blockedStudy(elapsed,reduced,true,{cancelSignalsAfter:instance.cancelSignalsAt});return {pose,front:{L:0,R:1},gazeDown,pawTurnR};}
  if((instance.state==='awaiting_user'||instance.state==='awaiting_service')&&instance.cancelSignalsAt!==undefined){
   const {pose,gazeDown,pawTurnR,frontPaws}=waitingStudy(instance.state,elapsed,reduced,true,{cancelSignalsAfter:instance.cancelSignalsAt});
   return {pose,front:{L:frontPaws.includes('L')?1:0,R:frontPaws.includes('R')?1:0},gazeDown,pawTurnR};
  }
  if(held.has(instance.state)){
   const frame=anatomyHold(instance.state as AnatomyHoldState,elapsed,reduced,{cancelSignalsAfter:instance.cancelSignalsAt});
   if(instance.groundedExplanationExit&&instance.exit!==undefined&&!reduced){
    // Restore the .018 quadratic release-lift cross term lost by linear
    // pose mixing, plus .010 clearance for the outside painted toes.
    // The mixer supplies (1-w); both endpoints retain position/velocity.
    const u=Math.max(0,Math.min(1,(sampleTime-instance.exit)/duration)),w=u*u*u*(10+u*(-15+6*u));
    const fold=Math.max(0,Math.min(1,-(frame.pose.forearmR?.angle??0)/90));
    frame.pose={...frame.pose,upperArmR:{...frame.pose.upperArmR,y:(frame.pose.upperArmR?.y??0)-.112*w*fold*fold}};
   }
   return frame;
  }
  // A one-shot ends in the authored neutral pose, then continues quiet life.
  // Keep this instance's clock: do not repeat the gesture or infer new work.
  const end=ANATOMY_STUDY_DURATION[instance.state as AnatomyStudy];
  if(!reduced&&elapsed>=end)return anatomyHold('idle',elapsed-end);
  const frame:ReturnType<typeof anatomyStudy>=instance.state==='delighted'?delightedStudy(elapsed,reduced,{cancelTakeoff:instance.cancelTakeoff,seated:instance.seatedDelight}):anatomyStudy(instance.state as AnatomyStudy,elapsed,reduced,{cancelSignalsAfter:instance.cancelSignalsAt});
  if(instance.groundedGreetingExit&&instance.exit!==undefined&&!reduced){
   // Blending a folded elbow toward a planted arm must retain its release
   // arc. Linear interpolation of the authored .025*4*f*(1-f) shoulder lift
   // loses the quadratic cross term and rolls the outside toe below ground.
   // The mixer supplies (1-w). Restore the .025 arc cross term, plus .010
   // clearance for the outside painted toes during wrist rotation. Both
   // vanish at blend endpoints, preserving position and velocity.
   const u=Math.max(0,Math.min(1,(sampleTime-instance.exit)/duration)),w=u*u*u*(10+u*(-15+6*u));
   const fold=Math.max(0,Math.min(1,-(frame.pose.forearmR?.angle??0)/95));
   frame.pose={...frame.pose,upperArmR:{...frame.pose.upperArmR,y:(frame.pose.upperArmR?.y??0)-.14*w*fold*fold}};
  }
  return {pose:frame.pose,front:{L:frame.frontPaws.includes('L')?1:0,R:frame.frontPaws.includes('R')?1:0},gazeDown:frame.gazeDown,pawTurnR:frame.pawTurnR,workstation:frame.workstation,magnifier:frame.magnifier};
 },duration);
 return {
  sample(state:AnatomyPerformanceState,now:number,reduced=false):AnatomyFrame{
   if(!supported.has(state))throw Error('Unauthored anatomical performance: '+state);
   if(!Number.isFinite(now)||now<0||now<last)throw Error('Performance requires a finite monotonic clock');
   // Enter the queued performance at the actual hand-release boundary, even
   // when no RAF landed there. A newer request applies afterward at its own
   // event time; never rewind the prop controller to repair a missed frame.
   while(handoff&&now>=handoff.at){const next=handoff;handoff=undefined;this.sample(next.state,next.at,reduced);}
   handoff=undefined;
   sampleTime=now;
   const requested=state;
   let workIntentOverride:WorkingIntent|undefined;
   // Finish the leaf, close and support the book before allowing a new prop
   // or free-hand gesture. Keep the released book visible on the lap.
   if(book&&state!=='reading'&&!propConversation.has(state)&&state!=='idle'&&state!=='looking'){
    book.intent='idle';const f=book.player.sample('idle',now,reduced);
    if(f.phase!=='resting-book'){
     if(f.nextBoundary===undefined||f.nextBoundary<=now)throw Error(`Book handoff requires a future physical boundary: ${f.phase} at ${now}, next ${f.nextBoundary}`);
     handoff={state,at:f.nextBoundary};state='idle';
    }else book.detached=true;
   }
   if(work?.handling&&state!=='working'&&!propConversation.has(state)&&!workRest.has(state)){
    const intent=options.workStow?'stowed':'resting';
    expireWorkRest(work.handling,now);
    // Observe the previous intent before starting a new carry. A hidden
    // window may have completed lid closure without any intervening RAF;
    // retain that same rest-body origin instead of snapping to neutral.
    const before=work.handling.player.sample(work.handling.intent,now,reduced);
    if(before.readyToLeave){work.handling.restOrigin??=before.closedAt;work.handling.leaveRest=undefined;}
    const f=work.handling.player.sample(intent,now,reduced);work.handling.frame=f;work.handling.intent=intent;
    if(!f.readyToLeave){
     if(f.nextBoundary===undefined||f.nextBoundary<=now)throw Error('Working handoff requires a future physical boundary');
     handoff={state,at:f.nextBoundary};state='idle';workIntentOverride=intent;
    }
   }
   if(state==='searching'){
    if(!search){search={origin:now};if(options.searchPickup){const player=createSearchPickupPlayer();search.pickup={player,frame:player.sample(true,now,reduced),intent:true};}}
   }else if(!options.searchPickup&&!propConversation.has(state))search=undefined;
   if(search?.pickup){
    const intent=state==='searching'?true:propConversation.has(state)?'hold':false;
    if(intent!==search.pickup.intent){
     // Advance the old intent to this event boundary even after a hidden-frame
     // gap. Recovery phase must not depend on an intermediate RAF observation.
     const before=search.pickup.player.sample(search.pickup.intent,now,reduced);
     if(before.restTime!==undefined){search.pickup.restOrigin=now-before.restTime;search.pickup.leaveRest=undefined;}
     search.pickup.intent=intent;
    }
    search.pickup.frame=search.pickup.player.sample(intent,now,reduced);
    if(search.pickup.frame.restTime!==undefined){search.pickup.restOrigin=now-search.pickup.frame.restTime;search.pickup.leaveRest=undefined;}
    else if(search.pickup.restOrigin!==undefined){search.pickup.leaveRest??=now;if(now-search.pickup.leaveRest>=650){search.pickup.restOrigin=undefined;search.pickup.leaveRest=undefined;}}
    if(state!=='searching'&&!propConversation.has(state)&&!workRest.has(state)&&search.pickup.frame.restTime===undefined){
     const at=search.pickup.frame.restAt;
     if(at===undefined)throw Error('Search handoff must have a release boundary');
     handoff={state,at};state='idle';
    }
   }
   if(state==='drafting'&&!draft){const clock=createDraftingPlayer();draft={clock,frame:clock.sample(true,now)};}
   if(draft){draft.frame=draft.clock.sample(state==='drafting',now);if(state!=='drafting'&&state!=='listening')draft=undefined;}
   if(state==='working'){
    work??=options.workHandling&&installedWork?installedWork:{origin:now};
    if(options.workHandling&&!work.handling){const player=createWorkingPlayer();work.handling={player,frame:player.sample('working',now,reduced),intent:'working'};installedWork=work;}
   }
   else if(!propConversation.has(state)&&!workRest.has(state))work=undefined;
   if(work?.handling){
    const intent:WorkingIntent=workIntentOverride??(state==='working'?'working':propConversation.has(state)?'holding':'resting'),h=work.handling;
    expireWorkRest(h,now);
    if(intent!==h.intent){const before=h.player.sample(h.intent,now,reduced);if(before.readyToLeave){h.restOrigin??=before.closedAt;h.leaveRest=undefined;}h.intent=intent;}
    h.frame=h.player.sample(intent,now,reduced);
    if(h.frame.readyToLeave){h.restOrigin??=h.frame.closedAt;h.leaveRest=undefined;}
    else if(h.restOrigin!==undefined){h.leaveRest??=now;if(now-h.leaveRest>=650){h.restOrigin=undefined;h.leaveRest=undefined;}}
   }
   if(state==='reading'){book??={player:createReadingBookPlayer(),intent:'reading'};book.intent='reading';book.detached=false;}
   else if(book){
    book.intent=book.detached||state==='idle'||state==='looking'?'idle':state==='thinking'?'thinking':state==='explaining'?'explaining':'listening';
   }
   // A held object is not a blended clock or a fading set of duplicate arms.
   // Thinking with a book pauses the page and keeps both hands supporting it;
   // the thinking head/body still blend normally, without a third chin paw.
   // Like listening, it does not reverse an already requested lap placement.
   // Explaining frees one paw only after page recovery and restores its grip
   // before page/placement motion. A lap book stays put during conversation.
   // Reading/listening/thinking/explaining/idle and looking retain the book.
   // A released lap book no longer owns either arm; never blend object clocks.
   const bookFrame=book?.player.sample(book.intent,now,reduced);
   const reading=bookFrame?{...bookFrame.reading,...book?.detached?{restingOnly:true}:{}}:undefined;
   const instanceSearch=search&&(!search.pickup||state==='searching'||(!book||book.detached)&&!work&&!draft&&(propConversation.has(state)||workRest.has(state)))?search:undefined;
   if(!current||instances.get(current)!.state!==state){
    if(current){
     const previous=instances.get(current)!;previous.exit=now;
     previous.groundedGreetingExit=previous.state==='greeting'&&(state==='listening'||state==='idle');
     previous.groundedExplanationExit=previous.state==='explaining'&&!previous.book&&!previous.work&&!previous.search&&!previous.draft&&(state==='listening'||state==='idle');
     // Abort future takeoff, not the current pose. Once airborne, the normal
     // continuing-source blend preserves velocity and settles toward ground.
     if(previous.state==='delighted'&&now-previous.origin<=DELIGHTED_TAKEOFF_MS)previous.cancelTakeoff=true;
     // Do not issue a not-yet-started urgency signal while exiting or when
     // resuming this same reminder. A genuinely new entry gets fresh signals.
     if(previous.state==='urgent')previous.cancelAttentionAt=Math.min(previous.cancelAttentionAt??Infinity,now-previous.origin);
     if(['greeting','grooming','acknowledging','blocked','succeeded','stretching','farewell','yawning','waking','settle','awaiting_user','awaiting_service'].includes(previous.state))previous.cancelSignalsAt=now-previous.origin;
     if(previous.state==='explaining')previous.cancelSignalsAt=Math.min(previous.cancelSignalsAt??Infinity,now-previous.origin);
    }
    const resume=held.has(state)?[...instances].reverse().find(([,value])=>value.state===state&&value.book===book&&value.work===work&&value.search===instanceSearch&&value.draft===draft&&value.exit!==undefined&&now-value.exit<=duration):undefined;
    if(resume?.[1].groundedExplanationExit){
     // Keep the returning source's release arc alive in the nested blend.
     // Reuse its performance clock/cancellation, not its mutable exit leaf:
     // clearing that exit would drop the shoulder lift in a single frame.
     current=String(++serial);instances.set(current,{...resume[1],exit:undefined,groundedExplanationExit:false});
    }else if(resume){current=resume[0];resume[1].exit=undefined;}
    // Freeze support at entry: later retrieving this same book must not turn
    // an outgoing seated gesture into an airborne one inside the pose blend.
    else{current=String(++serial);instances.set(current,{state,origin:now,cancelTakeoff:false,...state==='delighted'?{seatedDelight:Boolean(book?.detached)}:{},...book?{book}:{},...work?{work}:{},...instanceSearch?{search:instanceSearch}:{},...draft?{draft}:{}});}
   }
   last=now;const body=mixer.sample(current,now-instances.get(current)!.origin,now,reduced);
   const frame=options.occupiedAttention?attention.sample(body,requested==='urgent',state!==requested,now,reduced):body;
   // Retired leaves are pruned by the mixer after the same duration. A later
   // same-state entry is a new gesture, not a resurrected cancelled takeoff.
   for(const [key,value] of instances)if(key!==current&&value.exit!==undefined&&now>=value.exit+duration)instances.delete(key);
   const pickup=search?.pickup;
   const device=installedWork?.handling?.frame;
   if(options.workStow&&device?.workstation===1)installedVisible=true;
   const retained=options.workStow&&device?{...installedVisible?{workstation:1}:{},workingLidClosure:device.workingLidClosure,workingPlacement:device.workingPlacement,workingCarry:device.workingCarry,workingParked:device.parked}:{};
   // Label the physical pipeline after ownership/gates have run. Requested
   // Delighted may still be closing a book; its later quiet continuation must
   // not overwrite timing evidence for the actual gesture. No pose changes.
   const handling=requested!==state||work?.handling?.frame.nextBoundary!==undefined
    ||bookFrame!==undefined&&!['reading-book','held-book-reply','resting-book'].includes(bookFrame.phase)
    ||pickup!==undefined&&pickup.intent===false&&pickup.frame.restTime===undefined;
   const blending=[...instances.values()].some(value=>value.exit!==undefined&&now<value.exit+duration);
   const settled=!held.has(state)&&now-instances.get(current)!.origin>=ANATOMY_STUDY_DURATION[state as AnatomyStudy];
   const timingPhase=reduced?'reduced':handling?'handling':blending?'blend':settled?'settled':'performing';
   return {...frame,timingPhase,front:{L:frame.front.L>0?1:0,R:frame.front.R>0?1:0},...device&&frame.workstation?{workingLidClosure:device.workingLidClosure}:{},...retained,...reading?{reading}:{},...draft?{drafting:{...draft.frame,reduced}}:{},...pickup?{magnifier:1,searchDock:true,magnifierPose:pickup.frame.attached?frame.pose:pickup.frame.magnifierPose}:{}};
  },
  currentPerformance(){const instance=current?instances.get(current):undefined;return instance?{state:instance.state,origin:instance.origin}:undefined;},
  reset(){mixer.reset();attention.reset();instances.clear();serial=0;current=undefined;last=-Infinity;book=undefined;work=undefined;installedWork=undefined;installedVisible=false;search=undefined;draft=undefined;handoff=undefined;sampleTime=0;}
 };
}

export const ANATOMY_RESPONSE_REVIEW_EVENTS=[[0,'idle'],[500,'delighted'],[750,'listening'],[2200,'delighted'],[2910,'listening'],[4600,'working'],[11000,'listening'],[12500,'idle']] as const;
export const ANATOMY_SEARCH_REVIEW_EVENTS=[[0,'idle'],[500,'searching'],[18000,'listening'],[18250,'searching'],[30000,'thinking'],[32000,'searching'],[40000,'idle']] as const;
export const ANATOMY_ATTENTION_REVIEW_EVENTS=[[0,'idle'],[500,'notifying'],[2600,'listening'],[4800,'urgent'],[6900,'listening'],[7150,'urgent'],[18000,'awaiting_user'],[22000,'idle']] as const;
export const ANATOMY_READING_REVIEW_EVENTS=[[0,'reading'],[5100,'listening'],[8000,'reading'],[16000,'listening'],[18500,'reading']] as const;
export const ANATOMY_BOOK_REVIEW_EVENTS=[[0,'reading'],[5100,'idle'],[6200,'reading'],[9000,'idle'],[12000,'reading'],[12600,'idle'],[21000,'listening'],[23000,'reading']] as const;
export const ANATOMY_GESTURE_REVIEW_EVENTS=[[0,'greeting'],[2020,'listening'],[4000,'grooming'],[6290,'listening'],[8000,'acknowledging'],[8790,'listening'],[10500,'greeting']] as const;
export function anatomyResponseReview(now:number,reduced=false,events:readonly (readonly [number,AnatomyPerformanceState])[]=ANATOMY_RESPONSE_REVIEW_EVENTS):AnatomyFrame{
 if(!Number.isFinite(now)||now<0)throw Error('Invalid response review time');
 const player=createAnatomyPerformancePlayer();let state:AnatomyPerformanceState='idle';
 for(const [at,next] of events){if(at>now)break;state=next;player.sample(state,at,reduced);}
 return player.sample(state,now,reduced);
}
