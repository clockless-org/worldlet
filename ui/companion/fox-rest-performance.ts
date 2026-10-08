import type {AnatomyPose} from './fox-anatomy.ts';
import {plantForepaws,seatedSupportPose} from './fox-seated-support.ts';
import {smootherUnit as ease,pulse as phrase} from './fox-skeleton.ts';

export const REST_DURATIONS={yawning:5400,waking:3600,settle:1600} as const;
export const REST_STATES=['yawning','sleeping','waking','pickup','settle'] as const;
export type RestState=typeof REST_STATES[number];
/** Seated rest uses the accepted anatomy. The yawn is covered by a paw: no
 * invented mouth plate, stretched muzzle, or curled silhouette replacement. */
export function restPerformance(state:RestState,elapsed:number,reduced=false,options:{cancelSignalsAfter?:number}={}){
 if(!Number.isFinite(elapsed)||elapsed<0)throw Error('Invalid rest performance clock');
 const t=reduced?(state==='sleeping'?5000:state==='pickup'?1200:0):elapsed;
 const admit=(at:number)=>at<(options.cancelSignalsAfter??Infinity)?1:0;
 let pose:AnatomyPose={},frontPaws:readonly ('L'|'R')[]=[];
 if(state==='sleeping'){
  const lower=ease(t/2800),breath=reduced?0:ease((t-2800)/1200)*phrase((t-2800+7200)%7200,0,2400,2900,7200);
  const ear=reduced?0:phrase(t%29000,21600,320,22000,23000);
  pose=plantForepaws({...seatedSupportPose(.68*lower),
   chest:{angle:2.2*lower,y:.018*lower-.009*breath},head:{angle:5*lower,y:.027*lower-.002*breath},
   lidL:{closure:ease((t-180)/1800)},lidR:{closure:ease((t-300)/1800)},
   earL:{angle:-4.5*lower+1.7*ear},earR:{angle:3*lower-.6*ear},
   scarfTail:{angle:1.6*lower-.6*breath},tailMid:{angle:1.8*lower},tailTip:{angle:-2*lower-.4*breath},
  },['L','R']);
 }else if(state==='yawning'){
  const brace=phrase(t,0,650,3850,5400),inhale=admit(300)*phrase(t,300,1100,2400,4200);
  const cover=admit(500)*phrase(t,500,950,3350,4800),exhale=admit(3250)*phrase(t,3250,550,4200,5400);
  const lag=admit(300)*phrase(t,500,1200,2800,4800);
  pose=plantForepaws({...seatedSupportPose(.25*brace+.28*exhale),
   chest:{angle:-1.8*inhale+1.1*exhale,y:-.028*inhale+.01*exhale},
   head:{angle:-3.2*inhale+1.6*exhale,y:.020*inhale},
   upperArmL:{angle:-48*cover,y:-.055*cover-.025*4*cover*(1-cover)},forearmL:{angle:-95*cover},pawL:{angle:7*cover},
   lidL:{closure:.94*inhale},lidR:{closure:.98*inhale},earL:{angle:-4*inhale},earR:{angle:3*lag},
   scarfTail:{angle:-2*lag},tailMid:{angle:-1.4*lag},tailTip:{angle:2.5*lag},
  },['R']);frontPaws=['L'];
 }else if(state==='waking'){
  // Start from the sleeping contact pose, then notice -> open eyes -> lift ->
  // reorient. The continuing-source mixer handles an early interruption.
  const lower=1-ease((t-400)/2100),notice=phrase(t,0,350,1700,3100),stretch=admit(800)*phrase(t,800,900,1950,3350);
  const blink=admit(1580)*phrase(t,1580,85,1700,1980);
  pose=plantForepaws({...seatedSupportPose(.68*lower),
   chest:{angle:2.2*lower-1.2*stretch,y:.018*lower-.016*stretch},head:{angle:5*lower-1.8*notice,y:.027*lower},
   lidL:{closure:Math.max(1-ease((t-180)/900),.82*blink)},lidR:{closure:Math.max(1-ease((t-310)/1000),.88*blink)},
   earL:{angle:-4.5*lower+6*notice},earR:{angle:3*lower-3*phrase(t,150,450,1900,3300)},
   scarfTail:{angle:1.6*lower-1.3*stretch},tailMid:{angle:1.8*lower-1.2*stretch},tailTip:{angle:-2*lower+2*stretch},
  },['L','R']);
 }else if(state==='pickup'){
  const lift=ease(t/550),tuck=ease((t-100)/650),lag=reduced?0:ease((t-250)/900)*Math.sin((t-250)/1500);
  pose={root:{y:-.025*lift},chest:{angle:-1.2*lift},head:{angle:1.4*lift},
   upperArmL:{angle:-8*tuck,y:-.018*tuck},forearmL:{angle:-18*tuck},pawL:{angle:7*tuck},
   upperArmR:{angle:6*tuck,y:-.018*tuck},forearmR:{angle:16*tuck},pawR:{angle:-5*tuck},
   earL:{angle:5*lift},earR:{angle:-3*lift},tailMid:{angle:-2*lift+.7*lag},tailTip:{angle:4*lift+1.1*lag},scarfTail:{angle:-3*lift+.5*lag}};
 }else{
  const land=1-ease(t/550),compress=phrase(t,120,400,580,1150),recover=phrase(t,700,200,1050,1600);
  pose=plantForepaws({...seatedSupportPose(.55*compress),root:{y:-.025*land},
   chest:{angle:1.8*compress-.6*recover,y:.014*compress-.006*recover},head:{angle:-.8*compress+.4*recover},
   earL:{angle:-2.5*compress+recover},earR:{angle:1.6*compress-.5*recover},
   tailMid:{angle:-1.5*compress+.7*recover},tailTip:{angle:2.5*compress-1.3*recover},scarfTail:{angle:1.8*compress-recover},
  },['L','R']);
 }
 if(reduced&&state!=='sleeping'&&state!=='pickup')pose={};
 return {pose,frontPaws};
}
