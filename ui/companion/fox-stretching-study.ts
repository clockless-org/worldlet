import type {AnatomyPose} from './fox-anatomy.ts';
import {plantForepaws,seatedSupportPose} from './fox-seated-support.ts';
import {pulse as phrase} from './fox-skeleton.ts';
/** One supported seated stretch: brace, open the chest, release, settle.
 * No root translation, face scaling, repetitive bounce or inferred work. */
export function stretchingStudy(milliseconds:number,reduced=false,options:{cancelSignalsAfter?:number}={}){
 if(!Number.isFinite(milliseconds)||milliseconds<0)throw Error('Invalid stretch clock');
 if(reduced)return {pose:{} as AnatomyPose,frontPaws:[] as const};
 const t=Math.min(6200,milliseconds),admit=(start:number)=>start<(options.cancelSignalsAfter??Infinity)?1:0;
 const brace=phrase(t,0,650,4200,5700),reach=admit(650)*phrase(t,650,1250,3050,4850);
 const release=admit(4300)*phrase(t,4300,550,5000,6200),lag=admit(650)*phrase(t,850,1350,3400,5400);
 const pose:AnatomyPose={...seatedSupportPose(.24*brace+.34*release),
  chest:{angle:-2.5*reach+1.6*release,x:-.007*reach+.008*release,y:.006*brace-.048*reach+.009*release},
  head:{angle:.5*reach-.8*release,y:.022*reach},
  earL:{angle:-4*reach+1.3*release},earR:{angle:3.2*lag-.8*release},
  lidL:{closure:reach},lidR:{closure:reach},
  scarfTail:{angle:-3.5*lag+1.1*release},
  tailMid:{angle:-3*lag+1.4*release},tailTip:{angle:4.5*lag-2*release},
 };
 return {pose:plantForepaws(pose,['L','R']),frontPaws:[] as const};
}
