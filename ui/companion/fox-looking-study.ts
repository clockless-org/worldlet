import type {AnatomyPose,JointControl} from './fox-anatomy.ts';
import {seatedSupportPose,plantForepaws} from './fox-seated-support.ts';
import {pulse} from './fox-skeleton.ts';

/** A seated, curious look around: orient the ears, attend to something high,
 * inspect the foreground, then notice the other side. No tool or implied task.
 * This remains a front-view performance, not a fabricated profile rotation. */
export function lookingStudy(milliseconds:number,reduced=false):{pose:AnatomyPose;frontPaws:readonly ('L'|'R')[];gazeDown:number}{
 if(!Number.isFinite(milliseconds)||milliseconds<0)throw Error('Invalid looking study time');
 const t=reduced?2600:Math.min(milliseconds,11200);
 const high=pulse(t,380,1050,2750,3850),near=pulse(t,4220,1000,6120,7350),other=pulse(t,7540,1000,9360,10800);
 const earHigh=pulse(t,80,420,2900,3700),earNear=pulse(t,3890,380,6240,7120),earOther=pulse(t,7230,370,9550,10600);
 const bodyHigh=pulse(t,680,1100,2820,4040),bodyNear=pulse(t,4650,980,6240,7510),bodyOther=pulse(t,7940,1000,9510,11050);
 const active=pulse(t,0,900,9900,11200),settle=pulse(t,9500,400,10050,11000);
 const pose:Record<string,JointControl>={
  ...seatedSupportPose(.12*active),
  chest:{angle:-.75*bodyHigh+.5*bodyNear+.8*bodyOther,x:-.0025*bodyHigh+.0025*bodyOther},
  head:{angle:-4.5*high+2.8*near+4.2*other,x:-.004*high+.004*other,y:-.006*high+.007*near-.002*other},
  earL:{angle:6*earHigh-2*earNear-3*earOther},earR:{angle:-2*earHigh+3*earNear-6*earOther},
  tailMid:{angle:reduced?0:1.5*Math.sin(t/1650)*active},tailTip:{angle:reduced?0:2*Math.sin(t/1650-.5)*active},
  scarfTail:{angle:1.2*bodyHigh-.8*bodyOther+.4*settle},
  lidL:{closure:reduced?0:Math.max(pulse(t,3720,80,3850,4010),pulse(t,7030,90,7170,7340),pulse(t,10200,80,10310,10470))},
  lidR:{closure:0}
 };
 pose.lidR={...pose.lidL};
 return {pose:plantForepaws(pose,['L','R']),frontPaws:[],gazeDown:.82*near};
}
