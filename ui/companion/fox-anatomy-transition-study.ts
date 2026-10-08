import {anatomyStudy} from './fox-anatomy-clips.ts';
import type {AnatomyStudy} from './fox-anatomy-clips.ts';
import {createAnatomyTransition} from './fox-anatomy-transition.ts';

/** Deterministic scrubbable interruption review. These are authored review
 * events, never fabricated foreground/background task activity. */
export function anatomyTransitionStudy(now:number,reduced=false){
 const mixer=createAnatomyTransition((state,t,reduce)=>{
  const frame=anatomyStudy(state as AnatomyStudy,t,reduce);
  return {pose:frame.pose,front:{L:frame.frontPaws.includes('L')?1:0,R:frame.frontPaws.includes('R')?1:0},gazeDown:frame.gazeDown};
 });
 const events=[[0,'greeting'],[1500,'thinking'],[1800,'greeting'],[2600,'thinking']] as const;
 let state:AnatomyStudy='greeting',origin=0;
 for(const [time,next] of events){if(time>now)break;state=next;origin=time;mixer.sample(state,0,time,reduced);}
 const frame=mixer.sample(state,Math.max(0,now-origin),Math.max(0,now),reduced);
 // Convex joint angles do not imply a convex paw trajectory. Keep the elbow
 // folded during lateral shoulder travel rather than translating the entire
 // limb inward (which would detach it). This authored seated-arm corridor is
 // not a general IK solver. Its C1 correction is zero at rest and when unused.
 const upper=Math.max(0,Math.min(1,-(frame.pose.upperArmR?.angle??0)/80));
 const fold=Math.min(1,upper/.5),desired=-95*fold**3*(10-15*fold+6*fold**2),current=frame.pose.forearmR?.angle??0,d=current-desired;
 if(d>0)frame.pose={...frame.pose,forearmR:{...frame.pose.forearmR,angle:current-d*d/(d+.01)}};
 const wrist=frame.pose.pawR?.angle??0,wd=wrist+20*4*upper*(1-upper);
 if(wd>0)frame.pose={...frame.pose,pawR:{...frame.pose.pawR,angle:wrist-wd*wd/(wd+.01)}};
 // Release the outside toe while the planted paw rolls into/out of the fold.
 // The small vertical shoulder allowance matches the authored greeting pickup.
 frame.pose={...frame.pose,upperArmR:{...frame.pose.upperArmR,y:(frame.pose.upperArmR?.y??0)-.025*4*upper*(1-upper)}};
 // Only the thinking paw uses the front lane in this authored review. Keep
 // it solid until the entire interrupted reach has returned to rest; the
 // greeting arm stays behind the head. This is not a general depth solver.
 return {pose:frame.pose,frontMix:{L:frame.front.L>0?1:0,R:0},frontPaws:[],gazeDown:frame.gazeDown};
}
