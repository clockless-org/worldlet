import {seatedSupportPose,plantForepaws} from './fox-seated-support.ts';
import type {AnatomyPose} from './fox-anatomy.ts';
import {smootherUnit as ease,pulse} from './fox-skeleton.ts';
export type WaitingState='awaiting_user'|'awaiting_service';

/** Waiting is an externally requested condition, never inferred from silence.
 * Invite once or glance once, then hold quietly. No fake progress/result,
 * repeated beckoning, impatient foot tapping or extra conversational bubble. */
export function waitingStudy(state:WaitingState,milliseconds:number,reduced=false,sustained=false,options:{cancelSignalsAfter?:number}={}):{pose:AnatomyPose;frontPaws:readonly ('L'|'R')[];gazeDown:number;pawTurnR:number}{
 if(state!=='awaiting_user'&&state!=='awaiting_service')throw Error('Invalid waiting state');
 if(!Number.isFinite(milliseconds)||milliseconds<0)throw Error('Invalid waiting study time');
 const user=state==='awaiting_user',t=reduced?(user?2800:6500):sustained?milliseconds:Math.min(milliseconds,12000);
 // Retiring waits may finish an already-started phrase, but must not begin
 // a new invitation or glance after the user has interrupted them.
 const admit=(start:number)=>start<(options.cancelSignalsAfter??Infinity)?1:0;
 const leave=sustained?1:1-ease((t-10000)/2000),reach=admit(180)*ease((t-180)/1250)*leave,attend=admit(80)*ease((t-80)/700)*leave;
 // Invite once, then give the user space to decide. A permanently presented
 // palm reads like continuing explanation, not a quiet wait for input.
 const offer=user?reach*(1-ease((t-2800)/1700)):reach;
 const glance=user?0:admit(1800)*pulse(t,1800,900,3200,4550)*leave;
 const breathe=reduced?0:ease(t/1600)*leave*Math.sin(t/1700)*.0012;
 const cycle=t%9700,blink=reduced?0:Math.max(pulse(cycle,4950,85,5080,5250),pulse(cycle,8100,75,8220,8370))*leave;
 const pose:AnatomyPose={
  ...seatedSupportPose((user?.16:.28)*reach),
  chest:{x:user?.006*attend:0,y:breathe+(user?.006*attend:0),angle:user?1.2*attend:0},
  upperArmL:{angle:user?0:-10*reach,y:user?0:-.016*4*reach*(1-reach)},
  forearmL:{angle:user?0:-35*reach},pawL:{angle:user?0:2*reach},
  upperArmR:{angle:(user?6:12)*offer,y:-.022*4*offer*(1-offer)},
  forearmR:{angle:(user?-87:30)*offer},pawR:{angle:(user?7:-3)*offer},
  head:{angle:(user?5.2:0)*attend+1.8*glance,y:(user?.002:0)*attend+.006*glance},
  earL:{angle:(user?2:1.2)*attend-1.3*glance},earR:{angle:(user?-1.5:-1)*attend+2*glance},
  tailMid:{angle:reduced?0:.45*Math.sin(t/2200)*attend},tailTip:{angle:reduced?0:.6*Math.sin(t/2200-.45)*attend},
  lidL:{closure:blink},lidR:{closure:blink}
 };
 let supported=pose;
 if(user){
  supported=plantForepaws(pose,['L']);const planted=plantForepaws(supported,['R']);
  const shoulder=Object.fromEntries((['angle','x','y'] as const).map(k=>[k,(planted.upperArmR[k]??0)*(1-offer)+(pose.upperArmR[k]??0)*offer]));
  supported={...supported,upperArmR:shoulder};
 }
 return {pose:supported,frontPaws:user?['R']:['L','R'],gazeDown:.8*glance,pawTurnR:user?admit(180)*ease((t-700)/900)*(1-ease((t-2550)/700)):0};
}
