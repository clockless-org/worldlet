import {createAnatomyTransition} from './fox-anatomy-transition.ts';
import {workingStudy} from './fox-working-study.ts';
import {createWorkingHandling} from './fox-working-handling.ts';
import {createWorkingStowPlayer} from './fox-working-stow-player.ts';
import type {WorkingPlacement} from './fox-working-device.ts';
export type WorkingIntent='working'|'holding'|'resting'|'stowed';
// Live pacing is independent of the deliberately slow authoring reviews.
// Keep every contact/support phase; only retime the continuous physical paths.
export const WORKING_PLAYBACK_TIMING=Object.freeze({settle:650,lid:3200,carry:3600});
const duration=WORKING_PLAYBACK_TIMING.settle;
const ready=()=>workingStudy(4800,false,true,true);
/** Settle an arbitrary typing phase before touching the lid. One installed
 * workstation survives listening/rest/resume; no device visibility crossfade.
 * The owner supplies conversational head motion separately from occupied hands. */
export function createWorkingPlayer(){
 type Typing={kind:'typing';at:number;phase:number;ramp:boolean};
 type Settling={kind:'settling';at:number;phase:number;rate:number;acceleration:number;mixer:ReturnType<typeof createAnatomyTransition>};
 type Handling={kind:'handling';at:number;player:ReturnType<typeof createWorkingHandling>};
 type Stowing={kind:'stowing';at:number;player:ReturnType<typeof createWorkingStowPlayer>};
 let stage:Typing|Settling|Handling|Stowing|undefined,intent:WorkingIntent='working',intentAt=0,last=-Infinity;
 function typing(s:Typing,now:number){
  const dt=now-s.at,u=Math.min(1,dt/duration);
  // Integral of a quintic speed ramp. Resume starts with zero velocity and
  // acceleration, matching the supported open-device endpoint exactly.
  const offset=s.ramp?(dt>=duration?dt-duration/2:duration*(2.5*u**4-3*u**5+u**6)):dt;
  return {phase:s.phase+offset,rate:s.ramp?u**3*(10-15*u+6*u*u):1,acceleration:s.ramp&&u<1?30*u*u*(1-u)**2/duration:0};
 }
 const target=()=>intent==='working'?'open':intent==='holding'?'hold':'closed';
 const stowTarget=()=>intent==='working'?'front':intent==='holding'?'hold':'parked';
 function advance(now:number,reduced:boolean){
  // A hidden window may miss several boundaries. Follow the old intent at
  // actual arrival times before applying a new request at its event time.
  for(let transitions=0;transitions<5;transitions++){
   if(stage?.kind==='settling'&&(reduced||now>=stage.at+duration)){
    const at=reduced?now:stage.at+duration,player=createWorkingHandling('open',WORKING_PLAYBACK_TIMING.lid);stage={kind:'handling',at,player};player.sample(target(),at,reduced);
   }
   if(stage?.kind==='handling'){
    const f=stage.player.sample(target(),now,reduced);
    if(intent==='working'&&f.motion.complete&&f.motion.position===0)stage={kind:'typing',at:Math.max(stage.at,f.motion.arrival),phase:4800,ramp:true};
    else if(intent==='stowed'&&f.motion.complete&&f.motion.position===1){
     const at=reduced?now:Math.max(stage.at,f.motion.arrival,intentAt),player=createWorkingStowPlayer('front',WORKING_PLAYBACK_TIMING.carry);
     stage={kind:'stowing',at,player};player.sample('parked',at,reduced);continue;
    }
   }
   if(stage?.kind==='stowing'){
    const f=stage.player.sample(stowTarget(),now,reduced);
    if(intent==='working'&&f.readyToOpen){
     const at=reduced?now:Math.max(stage.at,f.motion.arrival),player=createWorkingHandling('closed',WORKING_PLAYBACK_TIMING.lid);
     stage={kind:'handling',at,player};player.sample('open',at,reduced);continue;
    }
   }
   return;
  }
  throw Error('Working lifecycle did not settle at a physical boundary');
 }
 return {sample(next:WorkingIntent,now:number,reduced=false){
  if(!['working','holding','resting','stowed'].includes(next))throw Error('Invalid working intent');
  if(!Number.isFinite(now)||now<0||now<last)throw Error('Working player requires monotonic finite time');
  stage??={kind:'typing',at:now,phase:0,ramp:false};advance(now,reduced);
  if(next!=='working'&&stage.kind==='typing'){
   const state=typing(stage,now),at=now,tau=120;
   const mixer=createAnatomyTransition((key,elapsed)=>{
    if(key==='ready'){const f=ready();return {...f,front:{L:1,R:1}};}
    const d=elapsed,e=Math.exp(-d/tau),phase=state.phase+state.rate*tau*(1-e)+(state.acceleration+state.rate/tau)*tau*tau*(1-(1+d/tau)*e);
    const f=workingStudy(phase,false,true);return {...f,front:{L:1,R:1}};
   },duration);
   mixer.sample('coast',0,at);mixer.sample('ready',0,at);
   stage={kind:'settling',at,...state,mixer};
  }
  if(intent!==next)intentAt=now;
  intent=next;last=now;advance(now,reduced);
  const front={workingPlacement:undefined as WorkingPlacement|undefined,workingCarry:false,parked:false};
  if(stage.kind==='typing'){
   const f=workingStudy(typing(stage,now).phase,reduced,true);
   return {...f,...front,workingLidClosure:0,phase:'typing',readyToLeave:false,nextBoundary:undefined as number|undefined,closedAt:undefined as number|undefined};
  }
  if(stage.kind==='settling'){
   const f=stage.mixer.sample('ready',now-stage.at,now,reduced);
   return {...f,...front,frontPaws:['L','R'] as const,workingLidClosure:0,phase:'settling-typing',readyToLeave:false,nextBoundary:stage.at+duration,closedAt:undefined as number|undefined};
  }
  if(stage.kind==='stowing'){
   const f=stage.player.sample(stowTarget(),now,reduced);
   return {...f,workingCarry:true,parked:f.readyToLeave,nextBoundary:f.motion.complete?undefined:f.motion.arrival,closedAt:f.readyToLeave?f.motion.arrival:undefined};
  }
  const f=stage.player.sample(target(),now,reduced);
  const closed=f.motion.complete&&f.motion.position===1;
  return {...f,...front,phase:f.phase,readyToLeave:closed,nextBoundary:f.motion.complete?undefined:f.motion.arrival,closedAt:closed?f.motion.arrival:undefined};
 },reset(){stage=undefined;intent='working';intentAt=0;last=-Infinity;}};
}
