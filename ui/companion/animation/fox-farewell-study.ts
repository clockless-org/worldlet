import type {AnatomyPose} from './fox-anatomy.ts';
import {plantForepaws,seatedSupportPose} from './fox-seated-support.ts';
import {pulse as phrase} from './fox-skeleton.ts';
/** One soft goodbye, then a supported bow. Never owns or delays app quit. */
export function farewellStudy(milliseconds:number,reduced=false,options:{cancelSignalsAfter?:number}={}){
 if(!Number.isFinite(milliseconds)||milliseconds<0)throw Error('Invalid farewell clock');
 const t=reduced?1700:Math.min(milliseconds,4800),admit=(start:number)=>start<(options.cancelSignalsAfter??Infinity)?1:0;
 const fold=phrase(t,0,600,2500,3000),lift=phrase(t,180,950,2100,2650),support=phrase(t,0,600,2350,3000);
 const wave=admit(1250)*phrase(t,1250,380,1700,2070),bow=admit(3100)*phrase(t,3100,600,3820,4650);
 const follow=admit(3100)*phrase(t,3260,600,3990,4800);
 // Let the chest initiate the farewell bow, then the rigid head follows.
 // These are parts of the same admitted bow: interruption must not launch
 // a new nod or eye gesture after the user has started speaking.
 const nod=admit(3100)*phrase(t,3220,600,3940,4720);
 const softEyes=admit(3100)*phrase(t,3320,350,3850,4400);
 const pose:AnatomyPose={...seatedSupportPose(.28*support+.32*bow),
  chest:{angle:-1.8*support+2.1*bow,x:-.007*support,y:-.009*support+.013*bow},
  head:{angle:-1.5*lift+3.2*nod,y:.009*nod},
  upperArmR:{angle:-68*lift,y:-.025*4*fold*(1-fold)},forearmR:{angle:-95*fold},pawR:{angle:lift*(-10+22*wave)},
  earL:{angle:2.8*lift-2*bow},earR:{angle:-1.8*lift+1.5*follow},
  scarfTail:{angle:1.2*support-1.5*follow},tailMid:{angle:1.8*support-1.2*follow},tailTip:{angle:2.2*support-2*follow},
  lidL:{closure:.38*softEyes},lidR:{closure:.38*softEyes},
 };
 return {pose:plantForepaws(pose,fold===0?['L','R']:['L']),frontPaws:[] as const,pawTurnR:phrase(t,650,450,2060,2450)};
}
