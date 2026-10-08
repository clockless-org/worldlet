import type {RigPoint} from './fox-anatomy.ts';
import {createDraftingPlayer} from './fox-drafting-player.ts';
import {draftingWritingArm,draftingBodyFrame} from './fox-drafting-motion.ts';
import {draftingArmPoint} from './fox-drafting-registration.ts';
import {smootherUnit as ease} from './fox-skeleton.ts';
export type DraftingPresentation={time:number;reduced?:boolean;pauseWeight?:number;tipTarget?:RigPoint;releaseTime?:number;notebookRestTime?:number};
export const DRAFTING_FINISH_MS=6500;
/** One continuous study from an arbitrary running stroke to supported rest.
 * This does not yet select live outcomes or hand off to another held prop. */
export function draftingFinish(strokeTime:number,elapsed:number,reduced=false){
 if(!Number.isFinite(strokeTime)||strokeTime<0||!Number.isFinite(elapsed)||elapsed<0)throw Error('Invalid drafting finish clock');
 const t=reduced?DRAFTING_FINISH_MS:elapsed,bodyTime=strokeTime+t;
 const clock=createDraftingPlayer();clock.sample(true,0);clock.sample(false,0);const stopped=clock.sample(false,Math.min(t,400));
 let drafting:DraftingPresentation,frame:ReturnType<typeof draftingBodyFrame>;
 if(t<400){drafting={time:strokeTime+stopped.time,pauseWeight:stopped.pauseWeight};frame=draftingBodyFrame(drafting.time,reduced,stopped.pauseWeight,bodyTime);}
 else if(t<1000){
  const a=draftingWritingArm(strokeTime+200,false,1).target,b=draftingArmPoint('writing',[715,912]),q=ease((t-400)/600);
  const tipTarget:RigPoint=[a[0]+(b[0]-a[0])*q,a[1]+(b[1]-a[1])*q-.01*Math.sin(Math.PI*q)**2];
  drafting={time:strokeTime+200,pauseWeight:1,tipTarget};frame=draftingBodyFrame(1500,reduced,1-q,bodyTime);
 }else{
  drafting=t<3500?{time:850,releaseTime:t-1000}:{time:850,notebookRestTime:t-3500};
  frame=draftingBodyFrame(1500,reduced,0,bodyTime);
 }
 return {...frame,drafting:{...drafting,reduced},phase:t<400?'braking':t<1000?'positioning':t<3500?'placing-pencil':t<DRAFTING_FINISH_MS?'lowering-notebook':'resting'};
}
