import {createPropPathClock} from './fox-prop-path-clock.ts';
import {workingCloseStudy} from './fox-working-close-study.ts';
export type WorkingHandlingTarget='open'|'closed'|'hold';
/** Physical hands/lid controller for review. A production caller must first
 * settle typing into the study's keyboard entry and retain this instance.
 * This does not yet route live conversation or invent task completion. */
export function createWorkingHandling(initial:'open'|'closed'='open',fullTravel=6200){
 if(initial!=='open'&&initial!=='closed')throw Error('Invalid initial working device state');
 const clock=createPropPathClock(initial==='closed'?1:0,fullTravel);
 return {sample(target:WorkingHandlingTarget,now:number,reduced=false){
  if(target!=='open'&&target!=='closed'&&target!=='hold')throw Error('Invalid working handling target');
  const motion=clock(target==='hold'?'hold':target==='closed'?1:0,now,reduced),frame=workingCloseStudy(motion.position*4400);
  const phase=motion.complete?(target==='hold'?'holding-device':target==='closed'?'closed-device':'ready-to-work'):target==='hold'?'settling-device':motion.velocity<0?'reopening-device':'closing-device';
  return {...frame,motion,phase};
 }};
}
export const WORKING_HANDLING_EVENTS:readonly (readonly [number,WorkingHandlingTarget])[]=[
 [0,'closed'],[2600,'hold'],[4500,'open'],[6200,'closed'],[9000,'hold'],[11000,'closed'],[16000,'open']
];
export function workingHandlingReview(now:number,reduced=false){
 const player=createWorkingHandling();let target:WorkingHandlingTarget='open';
 for(const [at,next] of WORKING_HANDLING_EVENTS){if(at>now)break;target=next;player.sample(target,at,reduced);}
 return player.sample(target,now,reduced);
}
