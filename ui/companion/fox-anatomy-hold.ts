import {restPerformance} from './fox-rest-performance.ts';
import {anatomyStudy} from './fox-anatomy-clips.ts';
import type {AnatomyPose,JointControl} from './fox-anatomy.ts';
import {createAnatomyTransition,type AnatomyFrame} from './fox-anatomy-transition.ts';
import {workingStudy} from './fox-working-study.ts';
import {searchingStudy} from './fox-searching-study.ts';
import {waitingStudy} from './fox-waiting-study.ts';
import {attentionStudy} from './fox-attention-study.ts';
import {thinkingSupport} from './fox-thinking-support.ts';
import {listeningSupport} from './fox-listening-support.ts';
import {explainingSupport} from './fox-explaining-support.ts';
import {idleSupport} from './fox-idle-support.ts';
import {blockedStudy} from './fox-blocked-study.ts';
import {smootherUnit as ease,pulse} from './fox-skeleton.ts';

/** States with an authored sustained pose so far. Do not silently map the other
 * catalog states to these: an unsupported performance is not finished artwork. */
export const ANATOMY_HOLD_STATES=['sleeping','pickup','idle','listening','thinking','explaining','working','searching','awaiting_user','awaiting_service','urgent','blocked'] as const;
export type AnatomyHoldState=typeof ANATOMY_HOLD_STATES[number];
function assertState(state:string):asserts state is AnatomyHoldState{
 if(!(ANATOMY_HOLD_STATES as readonly string[]).includes(state))throw Error('Unauthored anatomical hold: '+state);
}

/** Entry happens once; only low-amplitude secondary motion repeats. A sustained
 * task never replays a paw pickup or the finite study's exit. Pure elapsed-time
 * evaluation makes a hidden-window gap or a different display cadence safe. */
export function anatomyHold(state:AnatomyHoldState,elapsed:number,reduced=false,options:{cancelSignalsAfter?:number}={}):AnatomyFrame{
 assertState(state);if(!Number.isFinite(elapsed)||elapsed<0)throw Error('Invalid anatomical hold time');
 if(state==='sleeping'||state==='pickup'){const f=restPerformance(state,elapsed,reduced,options);return {pose:f.pose,front:{L:0,R:0}};}
 if(state==='blocked'){const {pose,gazeDown,pawTurnR}=blockedStudy(elapsed,reduced,true);return {pose,front:{L:0,R:1},gazeDown,pawTurnR};}
 if(state==='urgent'){const {pose,pawTurnR}=attentionStudy(state,elapsed,reduced,true);return {pose,front:{L:1,R:1},pawTurnR};}
 if(state==='awaiting_user'||state==='awaiting_service'){
  const {pose,gazeDown,pawTurnR,frontPaws}=waitingStudy(state,elapsed,reduced,true);
  return {pose,front:{L:frontPaws.includes('L')?1:0,R:frontPaws.includes('R')?1:0},gazeDown,pawTurnR};
 }
 if(state==='searching'){
  const {pose,gazeDown,magnifier}=searchingStudy(elapsed,reduced,true);
  return {pose,front:{L:1,R:1},gazeDown,magnifier};
 }
 if(state==='working'){
  const {pose,gazeDown,workstation}=workingStudy(elapsed,reduced,true);
  return {pose,front:{L:1,R:1},gazeDown,workstation};
 }
 const t=reduced?2600:elapsed;
 const base:ReturnType<typeof anatomyStudy>=state==='idle'?{pose:{} as AnatomyPose,frontPaws:[]}:anatomyStudy(state,Math.min(t,state==='listening'?1600:state==='explaining'?1500:2300),reduced,options);
 const pose:Record<string,JointControl>=Object.fromEntries(Object.entries(base.pose).map(([id,value])=>[id,{...value}]));
 const entering=ease(t/500),held=ease((t-1700)/700),cycle=t%7200;
 const blink=reduced?0:Math.max(pulse(cycle,2750,85,2870,3020),pulse(cycle,6050,75,6170,6290));
 pose.lidL={closure:blink};pose.lidR={closure:blink};
 const tail=reduced?0:entering*(state==='listening'?.35:1);
 pose.tailMid={angle:Math.sin(t/1000*1.1)*1.5*tail};pose.tailTip={angle:Math.sin(t/1000*1.1-.4)*2*tail};
 if(state==='listening'&&!reduced){
  pose.head.angle!+=.25*held*Math.sin((t-1700)/1500);
  const adjust=pulse(t%9000,5050,170,5300,5750);
  pose.earL.angle!-=2*adjust;pose.earR.angle!+=3*adjust;
 }
 if(state==='thinking'){
  pose.pawL={angle:reduced?0:ease((t-1700)/350)*1.5*Math.sin(t/1300)};
  const notice=reduced?0:held*pulse(t%11000,7200,240,7500,8050);
  pose.earR={angle:3*notice};
 }
 if(state==='explaining'&&!reduced){
  // Unequal phrase accents separated by real stillness. This is presentation
  // while the caller requests explaining, not fabricated agent activity.
  // The entry ends at 1500ms with zero channel velocities; do not replay its
  // pickup, wrist flip or exit every time a phrase completes.
  const phase=t%13600,cycleStart=t-phase;
  // Compare absolute phrase starts: a later loop must not resurrect an
  // emphasis after this performance has been interrupted.
  const admitted=(start:number)=>cycleStart+start<(options.cancelSignalsAfter??Infinity)?1:0;
  const first=admitted(1750)*pulse(phase,1750,400,2250,2750),second=admitted(3150)*pulse(phase,3150,430,3630,4160);
  const third=admitted(7050)*pulse(phase,7050,360,7580,8200),last=admitted(10700)*pulse(phase,10700,550,11400,12000),beat=first+.65*second+.4*third+.75*last;
  pose.upperArmR.angle!-=3*beat;pose.forearmR.angle!+=8*beat;pose.pawR.angle!-=9*beat;
  pose.head.angle!+=1.2*second+.7*last;pose.head.y=(pose.head.y??0)+.004*first+.0025*second+.002*third;
  pose.earL.angle!-=1.5*second;pose.earR.angle!+=2*second+last;
  Object.assign(pose,explainingSupport(pose,150<(options.cancelSignalsAfter??Infinity)?ease((t-150)/1050):0,beat));
 }
 const supported=state==='idle'?idleSupport(pose,t,reduced):state==='thinking'?thinkingSupport(pose,t,reduced,true):state==='listening'?listeningSupport(pose,t,reduced,true):pose;
 return {pose:supported,front:{L:base.frontPaws.includes('L')?1:0,R:base.frontPaws.includes('R')?1:0},...(base.pawTurnR===undefined?{}:{pawTurnR:base.pawTurnR})};
}

/** Presentation clock only: callers supply a real requested state. This module
 * does not infer work, read text, schedule tasks, or select a success outcome.
 * Same-state samples retain the entry origin; changes interrupt the continuing
 * source through the existing quintic mixer instead of freezing a screenshot. */
export function createAnatomyHoldPlayer(){
 const transitionMs=650;
 const mixer=createAnatomyTransition((state,t,reduced)=>{assertState(state);return anatomyHold(state,t,reduced);},transitionMs);
 const recentlyLeft=new Map<AnatomyHoldState,{origin:number;at:number}>();
 let current:AnatomyHoldState|undefined,origin=0,last=-Infinity;
 return {
  sample(state:AnatomyHoldState,now:number,reduced=false):AnatomyFrame{
   assertState(state);if(!Number.isFinite(now)||now<0||now<last)throw Error('Anatomical hold requires a finite monotonic clock');
   if(state!==current){
    if(current)recentlyLeft.set(current,{origin,at:now});
    // Reversing a still-running exit returns to the ongoing source phase, not
    // a second pickup. Once the exit has finished, a fresh entry is appropriate.
    const resume=recentlyLeft.get(state);origin=resume&&now-resume.at<=transitionMs?resume.origin:now;current=state;
   }
   last=now;const frame=mixer.sample(state,now-origin,now,reduced);
   // The authored seated graph approaches the chin/chest from the front and
   // offers the right palm outside the face. Reserve those lanes for the whole
   // reach/exit, including interruptions. Enter/leave at the planted pose,
   // where the distal skin does not overlap the head (render-tested). A fractional
   // transition weight is NOT opacity or a physically meaningful depth.
   // Do not generalize this union policy to future behind-face reaches.
   return {...frame,front:{L:frame.front.L>0?1:0,R:frame.front.R>0?1:0}};
  },
  reset(){current=undefined;origin=0;last=-Infinity;recentlyLeft.clear();mixer.reset();}
 };
}

/** Explicit review events, never live activity. Long holds cross the old 8s/9s
 * clip ends; a second switch during the first blend exercises interruption. */
export const ANATOMY_HOLD_REVIEW_EVENTS=[[0,'idle'],[800,'listening'],[14000,'thinking'],[30000,'listening'],[30300,'thinking'],[34000,'idle']] as const;
export const ANATOMY_CONVERSATION_REVIEW_EVENTS=[[0,'idle'],[600,'listening'],[5000,'thinking'],[10000,'explaining'],[23000,'listening'],[23300,'explaining'],[28000,'thinking'],[31500,'listening'],[36000,'idle']] as const;
export const ANATOMY_WAIT_REVIEW_EVENTS=[[0,'idle'],[500,'awaiting_service'],[12000,'awaiting_user'],[26000,'listening'],[26250,'awaiting_user'],[36000,'idle']] as const;
export function anatomyHoldReview(now:number,reduced=false,events:readonly (readonly [number,AnatomyHoldState])[]=ANATOMY_HOLD_REVIEW_EVENTS):AnatomyFrame{
 if(!Number.isFinite(now)||now<0)throw Error('Invalid anatomical review time');
 const player=createAnatomyHoldPlayer();let state:AnatomyHoldState='idle';
 for(const [at,next] of events){if(at>now)break;state=next;player.sample(state,at,reduced);}
 return player.sample(state,now,reduced);
}
