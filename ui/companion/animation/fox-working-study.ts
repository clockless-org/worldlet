import type {AnatomyPose} from './fox-anatomy.ts';
import {FOX_WORKING_RIG} from './fox-working-device.ts';
import {workingSupport} from './fox-working-support.ts';
import {workingContact} from './fox-working-contact.ts';
import {smootherUnit as ease,pulse} from './fox-skeleton.ts';
/** Authored finite/sustained review, not a task scheduler or fake progress indicator.
 * Separate arm/wrist contacts and a real pause make execution readable even
 * when the screen deliberately contains no invented task output. */
export function workingStudy(milliseconds:number,reduced=false,sustained=false,paused=false):{pose:AnatomyPose;frontPaws:readonly ('L'|'R')[];gazeDown:number;workstation:number}{
 if(!Number.isFinite(milliseconds)||milliseconds<0)throw Error('Invalid working study time');
 const t=reduced?2600:sustained?milliseconds:Math.min(10000,milliseconds);
 // Repeat only the two operation phrases and inspection, never the reach or
 // prop arrival. Both ends of the cycle have still wrists and neutral gaze.
 const phase=sustained&&t>=8250?1200+(t-8250)%7050:t;
 const reach=sustained?ease((t-150)/1050):pulse(t,150,1050,8250,9700),inspect=paused?1:pulse(phase,4300,500,5250,5850);
 const tap=(side:'L'|'R')=>reduced||paused?0:Math.max(0,...FOX_WORKING_RIG.tapTimes[side].map(at=>pulse(phase,at,160,at+180,at+250)));
 const left=tap('L'),right=tap('R'),p=FOX_WORKING_RIG.contactPose;
 const blink=reduced?0:Math.max(pulse(phase,3920,75,4040,4200),pulse(phase,7960,75,8080,8240));
 const pose:AnatomyPose={
  upperArmL:{angle:(p.upperArmL+4*left)*reach,y:-.025*4*reach*(1-reach)-.006*left*reach},
  forearmL:{angle:(p.forearmL-5*left)*reach},pawL:{angle:8*left*reach},
  upperArmR:{angle:(p.upperArmR-4*right)*reach,y:-.018*4*reach*(1-reach)-.006*right*reach},
  forearmR:{angle:(p.forearmR+5*right)*reach},pawR:{angle:6*right*reach},
  head:{angle:2*reach-inspect,y:.008*reach-.005*inspect},earL:{angle:-2*reach+2*inspect},earR:{angle:-3*reach+4*inspect},
  lidL:{closure:blink},lidR:{closure:blink},tailMid:{angle:reduced?0:.6*Math.sin(t/1800)*reach},tailTip:{angle:reduced?0:Math.sin(t/1800-.4)*reach}
 };
 return {pose:workingContact(workingSupport(pose,reach,inspect,t,reduced),reach,left,right),frontPaws:['L','R'],gazeDown:.9*reach*(1-.8*inspect),workstation:sustained?ease(t/550):pulse(t,0,550,9400,10000)};
}
