import type {AnatomyPose,JointControl,RigPoint} from './fox-anatomy.ts';
import type {GraspControls} from './fox-grasp-study.ts';
import type {FoxAnimationPhase} from './fox-animation-phase.ts';
import {smoother} from './fox-skeleton.ts';

// Object ownership is attached by the performance player after pose blending.
// These clocks must never be interpolated toward a missing/zero clock.
export type ReadingPresentation={time:number;pageTime:number;reduced:boolean;turning:boolean;offset?:RigPoint;closure?:number;placement?:number;release?:number;completeRight?:boolean;restingOnly?:boolean;rightHand?:RigPoint};
export type AnatomyFrame={pose:AnatomyPose;front:Readonly<Record<'L'|'R',number>>;timingPhase?:FoxAnimationPhase;workDetail?:{weight:number;left:number;right:number};gazeDown?:number;gazeX?:number;pawTurnR?:number;graspR?:GraspControls;workstation?:number;workingLidClosure?:number;workingPlacement?:import('./fox-working-device.ts').WorkingPlacement;workingCarry?:boolean;workingParked?:boolean;magnifier?:number;magnifierPose?:AnatomyPose;searchDock?:boolean;reading?:ReadingPresentation;drafting?:{time:number;bodyTime:number;pauseWeight:number;reduced:boolean}};
type Sample=(state:string,elapsed:number,reduced:boolean)=>AnatomyFrame;
type Leaf={state:string;origin:number};
type Blend={from:Node;to:Leaf;start:number;duration:number};
type Node=Leaf|Blend;
const fields=['angle','x','y','closure'] as const;
/** Blend continuing source clips, not frozen poses. Quintic weights preserve
 * position/velocity/acceleration at interruption; convex weights cannot invent
 * angular overshoot. Missing channels explicitly mean rest. This is a study
 * mixer, independent of artwork, semantic routing and display cadence. */
export function createAnatomyTransition(sample:Sample,duration=650){
 if(!Number.isFinite(duration)||duration<=0)throw Error('Invalid transition duration');
 let node:Node|undefined,current='',last=-Infinity;
 function prune(n:Node,now:number):Node{
  if(!('from' in n))return n;
  if(now>=n.start+n.duration)return n.to;
  n.from=prune(n.from,now);return n;
 }
 function evaluate(n:Node,now:number):AnatomyFrame{
  if(!('from' in n))return sample(n.state,Math.max(0,now-n.origin),false);
  const a=evaluate(n.from,now),b=evaluate(n.to,now),t=smoother((now-n.start)/n.duration);
  const pose:Record<string,JointControl>={};
  for(const id of new Set([...Object.keys(a.pose),...Object.keys(b.pose)])){
   const value:JointControl={};
   for(const field of fields)if(a.pose[id]?.[field]!==undefined||b.pose[id]?.[field]!==undefined){
    const x=a.pose[id]?.[field]??0,y=b.pose[id]?.[field]??0;value[field]=x+(y-x)*t;
   }
   pose[id]=value;
  }
  const channels:Pick<AnatomyFrame,'gazeDown'|'gazeX'|'pawTurnR'|'workstation'|'magnifier'>={};
  for(const key of ['gazeDown','gazeX','pawTurnR','workstation','magnifier'] as const)if(a[key]!==undefined||b[key]!==undefined)channels[key]=Math.max(key==='gazeX'?-1:0,Math.min(1,(a[key]??0)+((b[key]??0)-(a[key]??0))*t));
  const graspR=a.graspR||b.graspR?Object.fromEntries((['thumb','index','middle','outer'] as const).map(id=>[id,Math.max(0,Math.min(1,(a.graspR?.[id]??0)+((b.graspR?.[id]??0)-(a.graspR?.[id]??0))*t))])) as GraspControls:undefined;
  const workDetail=a.workDetail||b.workDetail?Object.fromEntries((['weight','left','right'] as const).map(key=>[key,(a.workDetail?.[key]??0)+((b.workDetail?.[key]??0)-(a.workDetail?.[key]??0))*t])) as AnatomyFrame['workDetail']:undefined;
  return {...workDetail?{workDetail}:{},pose,front:{L:a.front.L+(b.front.L-a.front.L)*t,R:a.front.R+(b.front.R-a.front.R)*t},...channels,...graspR?{graspR}:{}};
 }
 return {
  sample(state:string,elapsed:number,now:number,reduced=false):AnatomyFrame{
   if(!Number.isFinite(now)||!Number.isFinite(elapsed)||now<last)throw Error('Anatomy transition requires a finite monotonic clock');
   last=now;
   if(!node||reduced){node={state,origin:now-elapsed};current=state;return sample(state,elapsed,reduced);}
   node=prune(node,now);
   if(state!==current){node={from:node,to:{state,origin:now-elapsed},start:now,duration};current=state;}
   return evaluate(node,now);
  },
  reset(){node=undefined;current='';last=-Infinity;}
 };
}
