import type {AnatomyPose} from './fox-anatomy.ts';
import {seatedSupportPose,plantForepaws} from './fox-seated-support.ts';
import {smoother as ease} from './fox-skeleton.ts';
const pulse=(t:number,start:number,rise:number,fall:number,end:number)=>ease((t-start)/rise)*(1-ease((t-fall)/(end-fall)));

/** A real error, not impatience or an invented task: stop, inspect once, then
 * turn toward the user and offer one paw. Never shake, repeat a plea or cry. */
export function blockedStudy(milliseconds:number,reduced=false,sustained=false,options:{cancelSignalsAfter?:number}={}):{pose:AnatomyPose;frontPaws:readonly ('L'|'R')[];gazeDown:number;pawTurnR:number}{
 if(!Number.isFinite(milliseconds)||milliseconds<0)throw Error('Invalid blocked time');
 const t=reduced?3800:sustained?milliseconds:Math.min(milliseconds,12000),cutoff=options.cancelSignalsAfter??Infinity;
 const exit=sustained?1:1-ease((t-10000)/2000),stop=ease(t/650)*exit;
 const inspect=650<cutoff?pulse(t,650,550,1500,2350)*exit:0;
 const offer=2000<cutoff?ease((t-2000)/1150)*exit:0;
 const turn=1850<cutoff?ease((t-1850)/850)*exit:0;
 const breath=reduced?0:ease((t-3600)/900)*Math.sin((t-3600)/1900)*.0012*exit;
 const blink=reduced?0:pulse(t%10300,5200,85,5350,5540)*exit;
 const pose:AnatomyPose={
  ...seatedSupportPose(.22*stop+.10*inspect),
  chest:{angle:1.4*inspect-1.2*offer,x:-.004*offer,y:.006*stop+.004*inspect-.005*offer+breath},
  head:{angle:1.3*inspect-4*turn,y:.008*inspect},
  earL:{angle:-3.5*stop+2*turn},earR:{angle:2*stop-3*turn},
  upperArmR:{angle:3*offer,y:-.020*4*offer*(1-offer)},forearmR:{angle:-83*offer},pawR:{angle:9*offer},
  scarfTail:{angle:-.6*stop+.8*offer},tailMid:{angle:-1.2*stop},tailTip:{angle:-1.8*stop},
  lidL:{closure:blink},lidR:{closure:blink}
 };
 const supported=plantForepaws(pose,['L']),resting=plantForepaws(pose,['R']).upperArmR!;
 // Both paws support the initial pause/inspection. Release the right support
 // with the offer, otherwise chest compression pushes the resting toes down.
 const upperArmR=Object.fromEntries((['angle','x','y'] as const).map(k=>[k,(resting[k]??0)*(1-offer)+(pose.upperArmR[k]??0)*offer]));
 return {pose:{...supported,upperArmR},frontPaws:['R'],gazeDown:.8*inspect,pawTurnR:2000<cutoff?ease((t-2450)/800)*(sustained?1:1-ease((t-10000)/700)):0};
}
