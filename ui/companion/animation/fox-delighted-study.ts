import type {AnatomyPose} from './fox-anatomy.ts';
import {seatedSupportPose} from './fox-seated-support.ts';
import {pulse} from './fox-skeleton.ts';
export const DELIGHTED_TAKEOFF_MS=380;

/** One intentional delighted response, never an idle timer or a success signal.
 * Chest anticipation, whole-body lift, gathered paws and delayed ear/tail
 * recovery are separate controls. Face geometry is always rigid. */
export function delightedStudy(milliseconds:number,reduced=false,options:{cancelTakeoff?:boolean;seated?:boolean}={}):{pose:AnatomyPose;frontPaws:readonly ('L'|'R')[]}{
 if(!Number.isFinite(milliseconds)||milliseconds<0)throw Error('Invalid delighted study time');
 const t=reduced?800:Math.min(milliseconds,2800);
 const prepare=reduced||options.seated?0:pulse(t,0,250,290,550),landing=reduced||options.seated?0:pulse(t,1040,110,1200,1500);
 const flight=reduced||options.cancelTakeoff||options.seated?0:Math.sin(Math.PI*Math.max(0,Math.min(1,(t-DELIGHTED_TAKEOFF_MS)/660)))**2;
 const gather=pulse(t,170,380,1420,2200),perk=pulse(t,110,340,1640,2500);
 const follow=reduced?0:pulse(t,620,380,1060,1900),settle=reduced?0:pulse(t,1450,200,1750,2280);
 const nuzzle=pulse(t,530,420,1220,1740);
 // A released lap book is still supported by the seated body. Express joy
 // through gathering paws, a warm head tuck and an ear/tail follow-through,
 // not an unheld book flying with a jump or a phantom landing compression.
 const seated=options.seated?1:0;
 return {pose:{
  ...seatedSupportPose(prepare*.85+landing*.65),
  root:{y:-.023*flight},chest:{y:.002*prepare+.001*landing},
  upperArmL:{angle:-15*gather-20*nuzzle,y:-.016*4*gather*(1-gather)},forearmL:{angle:-75*gather-15*nuzzle},pawL:{angle:8*gather+4*nuzzle},
  upperArmR:{angle:-25*gather,y:-.014*4*gather*(1-gather)},forearmR:{angle:90*gather},pawR:{angle:-8*gather},
  head:{angle:1.5*prepare-1.3*flight+.8*settle+(2+seated)*nuzzle,y:.002*landing+(.004+.002*seated)*nuzzle},
  earL:{angle:(4+seated)*perk-2*follow},earR:{angle:-(3+seated)*perk+2.5*follow},
  tailMid:{angle:(3+seated)*follow-1.5*settle},tailTip:{angle:(5+seated)*follow-2*settle},
  lidL:{closure:reduced?.08:.18*landing},lidR:{closure:reduced?.08:.18*landing}
 },frontPaws:['L','R']};
}
