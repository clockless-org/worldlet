import {createPropPathClock} from './fox-prop-path-clock.ts';
import {workingStowPath} from './fox-working-stow-path.ts';
import {WORKING_STOW_DURATION} from './fox-working-stow-study.ts';

export type WorkingStowTarget='front'|'parked'|'hold';
/** Reversible closed-device handling. The same hands retain the same prop
 * through braking, conversation holds, retrieval and renewed stowing. This
 * controller does not own live state routing, parked depth or another prop. */
export function createWorkingStowPlayer(initial:'front'|'parked'='front',fullTravel=7200){
 if(initial!=='front'&&initial!=='parked')throw Error('Invalid initial stow location');
 const clock=createPropPathClock(initial==='parked'?1:0,fullTravel);
 return {sample(target:WorkingStowTarget,now:number,reduced=false){
  if(target!=='front'&&target!=='parked'&&target!=='hold')throw Error('Invalid stow destination');
  const motion=clock(target==='hold'?'hold':target==='parked'?1:0,now,reduced),frame=workingStowPath(motion.position*WORKING_STOW_DURATION);
  const reverse:Record<string,string>={'releasing-device':'reaching-parked-device','supported-device':'gripping-parked-device','lowering-device':'lifting-parked-device','carrying-device':'returning-device','lifting-device':'lowering-front-device','gripping-device':'supporting-front-device','reaching-device':'releasing-front-device'};
  const phase=motion.complete?(target==='hold'?'holding-device':target==='parked'?'parked-device':'front-device'):target==='hold'?'braking-device':motion.velocity<0?(reverse[frame.phase]??frame.phase):frame.phase;
  return {...frame,motion,phase,readyToLeave:motion.complete&&motion.position===1,readyToOpen:motion.complete&&motion.position===0};
 }};
}
export const WORKING_STOW_EVENTS:readonly (readonly [number,WorkingStowTarget])[]=[
 [0,'parked'],[3200,'hold'],[4800,'front'],[6500,'parked'],[8800,'hold'],[10500,'parked'],[15500,'front']
];
export function workingStowReview(now:number,reduced=false){
 const player=createWorkingStowPlayer();let target:WorkingStowTarget='front';
 for(const [at,next] of WORKING_STOW_EVENTS){if(at>now)break;target=next;player.sample(target,at,reduced);}
 return player.sample(target,now,reduced);
}
