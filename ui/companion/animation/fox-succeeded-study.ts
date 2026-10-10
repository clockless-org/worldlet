import type {AnatomyPose} from './fox-anatomy.ts';
import {seatedSupportPose,plantForepaws} from './fox-seated-support.ts';
import {pulse} from './fox-skeleton.ts';

/** Quiet completion, distinct from delighted's hop. Finish the hand motion,
 * plant, nod once, one tail swish with a damped return. No success text or
 * new work is inferred here; the caller owns the completion signal. */
export function succeededStudy(milliseconds:number,reduced=false,options:{cancelSignalsAfter?:number}={}):{pose:AnatomyPose;frontPaws:readonly ('L'|'R')[]}{
 if(!Number.isFinite(milliseconds)||milliseconds<0)throw Error('Invalid completion time');
 const t=reduced?1550:Math.min(milliseconds,3000),cutoff=options.cancelSignalsAfter??Infinity;
 const gather=pulse(t,0,350,650,1250),relief=pulse(t,200,550,1770,2600);
 const nod=1100<cutoff?pulse(t,1100,300,1450,1900):0;
 const follow=1100<cutoff?pulse(t,1220,320,1550,2050):0;
 const swish=reduced||1300>=cutoff?0:pulse(t,1300,380,1780,2300)-.25*pulse(t,2100,220,2390,2800);
 const tip=reduced||1300>=cutoff?0:pulse(t,1430,400,1910,2450)-.25*pulse(t,2220,220,2510,2940);
 const pose:AnatomyPose={
  ...seatedSupportPose(.12*gather+.14*nod),
  // Readable at the 144px HUD: lift with relief, then a single supported nod.
  // Translate/rotate the rigid head; never scale it or bounce the root.
  chest:{y:-.016*relief+.023*nod,angle:-1.4*relief+2*nod},
  head:{angle:3*nod,y:.016*nod},
  upperArmL:{angle:-10*gather,y:-.018*4*gather*(1-gather)},forearmL:{angle:-35*gather},pawL:{angle:3*gather},
  upperArmR:{angle:8*gather,y:-.018*4*gather*(1-gather)},forearmR:{angle:30*gather},pawR:{angle:-3*gather},
  earL:{angle:2*relief},earR:{angle:-1.5*relief},
  scarfTail:{angle:-2.4*follow},tailMid:{angle:3.5*swish},tailTip:{angle:6*tip},
  lidL:{closure:.32*nod},lidR:{closure:.32*nod}
 };
 const resting=plantForepaws(pose,['L','R']);
 const shoulder=(id:string)=>Object.fromEntries((['angle','x','y'] as const).map(k=>[k,(resting[id][k]??0)*(1-gather)+(pose[id][k]??0)*gather]));
 return {pose:{...pose,upperArmL:shoulder('upperArmL'),upperArmR:shoulder('upperArmR')},frontPaws:['L','R']};
}
