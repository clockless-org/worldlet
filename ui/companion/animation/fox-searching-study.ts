import {seatedSupportPose} from './fox-seated-support.ts';
import type {AnatomyPose} from './fox-anatomy.ts';
import {smootherUnit as ease,pulse} from './fox-skeleton.ts';
/** Two unequal search sweeps, an inspection pause, then a final recheck.
 * Explicit foreground-search presentation; no invented result or completion. */
export function searchingStudy(milliseconds:number,reduced=false,sustained=false,paused=false):{pose:AnatomyPose;frontPaws:readonly ('L'|'R')[];gazeDown:number;magnifier:number}{
 if(!Number.isFinite(milliseconds)||milliseconds<0)throw Error('Invalid searching study time');
 const t=reduced?4500:sustained?milliseconds:Math.min(milliseconds,10000),reach=sustained?ease((t-100)/1000):pulse(t,100,1000,8200,9700);
 // Only scan/inspect repeats; both seam poses have still wrists and a neutral
 // scan. The held grip, prop visibility and tail clock never restart.
 const phase=sustained&&t>=7600?1200+(t-7600)%6400:t;
 const first=pulse(phase,1450,600,2350,3200),second=pulse(phase,3200,750,4900,5700),recheck=pulse(phase,6200,400,7000,7450),scan=paused?0:first-.7*second+.35*recheck;
 const inspect=paused?0:pulse(phase,4200,400,4800,5300),headScan=paused?0:pulse(phase,1260,500,2250,3000)-.7*pulse(phase,3020,600,4800,5550)+.35*pulse(phase,6060,350,6900,7300);
 return {pose:{
  ...seatedSupportPose(.15*reach),chest:{angle:1.2*scan,x:.003*scan},
  upperArmR:{angle:(8+4*scan)*reach,y:-.022*4*reach*(1-reach)},forearmR:{angle:(-90+3*scan)*reach},pawR:{angle:2*inspect},
  upperArmL:{angle:-15*reach},forearmL:{angle:-40*reach},pawL:{angle:3*reach},
  head:{angle:3*headScan+1.3*inspect,y:.006*inspect},earL:{angle:2*reach+2*headScan},earR:{angle:-2*reach-headScan},
  tailMid:{angle:reduced?0:.5*Math.sin(t/1700)*reach},tailTip:{angle:reduced?0:.8*Math.sin(t/1700-.4)*reach},
  lidL:{closure:reduced?0:pulse(phase,5500,80,5620,5770)},lidR:{closure:reduced?0:pulse(phase,5500,80,5620,5770)}
 },frontPaws:['L','R'],gazeDown:(.6+.3*inspect)*reach,magnifier:sustained?ease((t-950)/450):pulse(t,950,450,7600,8100)};
}
