import type {AnatomyPose} from './fox-anatomy.ts';
import {seatedSupportPose,plantForepaws} from './fox-seated-support.ts';
import {smootherUnit as ease,pulse} from './fox-skeleton.ts';
export type AttentionStudy='notifying'|'urgent';

/** Caller-authorized attention only. A quiet single raised paw is distinct
 * from the upright two-paw urgent signal. No flashing, invented item, looping
 * wave, or task success inference. Urgent signals happen only on entrance. */
export function attentionStudy(state:AttentionStudy,milliseconds:number,reduced=false,sustained=false,options:{cancelSignalsAfter?:number}={}):{pose:AnatomyPose;frontPaws:readonly ('L'|'R')[];pawTurnR:number}{
 if(state!=='notifying'&&state!=='urgent')throw Error('Invalid attention study');
 if(!Number.isFinite(milliseconds)||milliseconds<0)throw Error('Invalid attention time');
 const cutoff=options.cancelSignalsAfter??Infinity;
 if(Number.isNaN(cutoff)||cutoff<0)throw Error('Invalid attention cancellation time');
 const urgent=state==='urgent',duration=urgent?8000:5600,t=reduced?(urgent?3500:2100):sustained&&urgent?milliseconds:Math.min(milliseconds,duration);
 const exit=sustained&&urgent?1:1-ease((t-(urgent?6100:3900))/(urgent?1900:1700));
 const attend=ease((t-50)/(urgent?500:650))*exit;
 // Fold before raising; lower before unfolding. Synchronous straight-arm
 // interpolation sweeps outside the painted canvas despite a safe end pose.
 const lift=ease((t-320)/(urgent?750:1050))*(sustained&&urgent?1:1-ease((t-(urgent?6000:3500))/(urgent?1400:1450)));
 const fold=ease((t-80)/550)*(sustained&&urgent?1:1-ease((t-(urgent?7000:4750))/(urgent?1000:850)));
 const first=1450<cutoff?pulse(t,1450,240,1760,2150):0,second=2380<cutoff?pulse(t,2380,250,2740,3220):0,beat=urgent?(first+.8*second)*exit:0;
 const breathe=reduced?0:ease((t-3300)/1200)*Math.sin(t/1700)*.0009*exit;
 const blink=reduced?0:pulse(t%(urgent?11000:5600),4300,85,4440,4630)*exit;
 const pose:AnatomyPose={
  ...seatedSupportPose((urgent?.08:.10)*attend),
  chest:{y:(urgent?-.007:-.002)*attend+breathe},
  head:{angle:(urgent?-.6:-2)*attend,y:(urgent?-.004:0)*attend+.002*beat},
  earL:{angle:(urgent?7:4)*attend},earR:{angle:(urgent?-7:-2.5)*attend},
  upperArmR:{angle:(urgent?-48:-60)*lift+2*beat,x:(urgent?-.006:-.018)*lift,y:-.026*4*fold*(1-fold)},
  forearmR:{angle:-95*fold+6*beat},pawR:{angle:urgent?-10*lift-8*beat:lift*(-16+22*pulse(t,1250,450,3300,3600))},
  upperArmL:{angle:urgent?-32*lift-2*beat:0,y:urgent?-.020*4*fold*(1-fold):0},
  forearmL:{angle:urgent?-72*fold-5*beat:0},pawL:{angle:urgent?4*lift+7*beat:0},
  tailMid:{angle:reduced?0:.55*Math.sin(t/1600)*attend},tailTip:{angle:reduced?0:.8*Math.sin(t/1600-.4)*attend},
  lidL:{closure:blink},lidR:{closure:blink}
 };
 return {pose:urgent?pose:plantForepaws(pose,['L']),frontPaws:urgent?['L','R']:['R'],pawTurnR:ease((t-800)/600)*(sustained&&urgent?1:1-ease((t-(urgent?5900:3300))/700))};
}
