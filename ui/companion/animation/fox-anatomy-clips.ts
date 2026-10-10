import type {AnatomyPose,JointControl} from './fox-anatomy.ts';
import {seatedSupportPose,plantForepaws} from './fox-seated-support.ts';
import {workingStudy} from './fox-working-study.ts';
import {delightedStudy} from './fox-delighted-study.ts';
import {searchingStudy} from './fox-searching-study.ts';
import {lookingStudy} from './fox-looking-study.ts';
import {waitingStudy} from './fox-waiting-study.ts';
import {attentionStudy} from './fox-attention-study.ts';
import {thinkingSupport} from './fox-thinking-support.ts';
import {listeningSupport} from './fox-listening-support.ts';
import {explainingSupport} from './fox-explaining-support.ts';
import {blockedStudy} from './fox-blocked-study.ts';
import {succeededStudy} from './fox-succeeded-study.ts';
import {stretchingStudy} from './fox-stretching-study.ts';
import {restPerformance,REST_DURATIONS,type RestState} from './fox-rest-performance.ts';
import {farewellStudy} from './fox-farewell-study.ts';
import {pulse as envelope} from './fox-skeleton.ts';

/** Registration benchmark clips, NOT the complete 32-state runtime. Keep
 * art registration separate from semantic routing and clip timing. */
export type AnatomyStudy=keyof typeof ANATOMY_STUDY_DURATION;
export const ANATOMY_STUDY_DURATION={...REST_DURATIONS,greeting:4400,thinking:9000,acknowledging:2400,grooming:5200,listening:8000,explaining:6200,working:10000,delighted:2800,searching:10000,looking:11200,awaiting_user:12000,awaiting_service:12000,notifying:5600,urgent:8000,blocked:12000,succeeded:3000,stretching:6200,farewell:4800} as const;
export function anatomyStudy(state:AnatomyStudy,milliseconds:number,reduced=false,options:{cancelSignalsAfter?:number}={}):{pose:AnatomyPose;frontPaws:readonly ('L'|'R')[];gazeDown?:number;pawTurnR?:number;workstation?:number;magnifier?:number}{
 if(state in REST_DURATIONS)return restPerformance(state as RestState,milliseconds,reduced,options);
 if(state==='stretching')return stretchingStudy(milliseconds,reduced,options);
 if(state==='farewell')return farewellStudy(milliseconds,reduced,options);
 if(state==='working')return workingStudy(milliseconds,reduced);
 if(state==='blocked')return blockedStudy(milliseconds,reduced,false,options);
 if(state==='succeeded')return succeededStudy(milliseconds,reduced,options);
 if(state==='delighted')return delightedStudy(milliseconds,reduced);
 if(state==='searching')return searchingStudy(milliseconds,reduced);
 if(state==='looking')return lookingStudy(milliseconds,reduced);
 if(state==='awaiting_user'||state==='awaiting_service')return waitingStudy(state,milliseconds,reduced,false,options);
 if(state==='notifying'||state==='urgent')return attentionStudy(state,milliseconds,reduced);
 const duration=ANATOMY_STUDY_DURATION[state],t=reduced?(state==='greeting'?1650:state==='acknowledging'?1250:state==='grooming'?2200:2600):Math.max(0,Math.min(duration,milliseconds));
 // Suppress only phrases that have not begun at interruption. Started
 // phrases keep advancing under the outgoing blend, preserving velocity.
 const admitted=(start:number)=>start<(options.cancelSignalsAfter??Infinity)?1:0;
 const breathPhase=t/1000,blink=reduced?0:envelope(t,2100,65,2210,2320),secondary=envelope(t,0,500,duration-700,duration);
 const pose:Record<string,JointControl>={
  lidL:{closure:blink},lidR:{closure:blink},
  tailMid:{angle:reduced?0:Math.sin(breathPhase*1.1)*1.5*secondary},tailTip:{angle:reduced?0:Math.sin(breathPhase*1.1-.4)*2*secondary}
 };
 if(state==='explaining'){
  // A two-phrase explanation: gather the left paw, offer the right palm,
  // pause, a smaller second emphasis, then turn/plant it again. No waving
  // loop and no lip movement without a real speech signal.
  const offer=admitted(150)*envelope(t,150,1050,4650,6000),gather=admitted(350)*envelope(t,350,800,4250,5600);
  const first=admitted(1750)*envelope(t,1750,400,2250,2750),second=admitted(3150)*envelope(t,3150,430,3630,4160),beat=first+.65*second;
  pose.upperArmR={angle:-5*offer-3*beat,y:-.018*4*offer*(1-offer)};
  pose.forearmR={angle:-90*offer+8*beat};pose.pawR={angle:10*offer-9*beat};
  pose.upperArmL={angle:-18*gather};pose.forearmL={angle:-65*gather};pose.pawL={angle:6*gather};
  const look=admitted(850)*envelope(t,850,500,3870,4450);
  pose.head={angle:-2*look+1.2*second,y:.004*first+.0025*second};
  pose.earL={angle:3*offer-1.5*second};pose.earR={angle:-2*look+2*second};
  pose.lidL={closure:reduced?0:envelope(t,2770,90,2910,3090)};pose.lidR={closure:pose.lidL.closure};
  return {pose:explainingSupport(pose,offer,beat),frontPaws:['L','R'],pawTurnR:admitted(800)*envelope(t,800,700,4270,4880)};
 }
 if(state==='listening'){
  // Ears orient before the head. The planted paws remain completely still;
  // listening is receptive, not another wave, work mime or repetitive nod.
  const orient=envelope(t,40,430,6720,7650),focus=envelope(t,280,1000,6600,8000);
  const follow=envelope(t,3650,460,4190,4760),earAdjust=envelope(t,5050,170,5300,5750);
  pose.head={angle:5.5*focus+.7*follow,y:.004*focus+.003*follow};
  pose.earL={angle:6*orient-2*earAdjust};pose.earR={angle:-4*orient+3*earAdjust};
  const blink=reduced?0:Math.max(envelope(t,2750,85,2870,3020),envelope(t,6050,75,6170,6290));
  pose.lidL={closure:blink};pose.lidR={closure:blink};
  // Damp the idle tail while attending; do not suggest restless activity.
  pose.tailMid.angle!*=.35;pose.tailTip.angle!*=.35;
  return {pose:listeningSupport(pose,t,reduced),frontPaws:[]};
 }
 if(state==='grooming'){
  const touch=admitted(180)*envelope(t,180,850,3950,5100),stroke=admitted(1200)*envelope(t,1200,450,1720,2050)+admitted(2350)*envelope(t,2350,500,2920,3250);
  const brace=admitted(40)*envelope(t,40,650,4050,5200);
  // Settle onto the left paw before brushing. The chest follows the two
  // strokes instead of staying frozen behind the moving hand; scarf lag
  // resolves separately after the hand has inspected and returned.
  const lag=admitted(1200)*envelope(t,1320,450,1840,2180)+admitted(2350)*envelope(t,2470,500,3040,3390);
  Object.assign(pose,seatedSupportPose(.22*brace+.07*stroke));
  pose.chest={angle:1.4*brace-1.2*stroke,x:.006*brace-.003*stroke,y:.005*brace-.005*stroke};
  pose.scarfTail={angle:-1.1*brace+.9*lag};
  pose.upperArmR={angle:(-25+7*stroke)*touch,y:-.012*4*touch*(1-touch)};
  pose.forearmR={angle:(95-20*stroke)*touch};pose.pawR={angle:(-8+12*stroke)*touch};
  pose.head={angle:2*touch,y:.004*touch};pose.earL={angle:2*touch};pose.earR={angle:-3*touch};
  return {pose:plantForepaws(pose,['L']),frontPaws:['R'],gazeDown:.75*touch};
 }
 if(state==='acknowledging'){
  const touch=admitted(80)*envelope(t,80,720,1650,2350),nod=admitted(850)*envelope(t,850,330,1270,1660),notice=admitted(0)*envelope(t,0,300,1500,2200);
  // A small supported bow answers the user, rather than moving the head
  // alone. The offering left arm follows the chest; the right stays down.
  Object.assign(pose,seatedSupportPose(.15*touch+.13*nod));
  pose.chest={angle:.6*touch+2*nod,x:-.002*touch,y:-.005*touch+.008*nod};
  pose.scarfTail={angle:-.6*touch-.8*admitted(850)*envelope(t,960,340,1400,1800)};
  pose.upperArmL={angle:-20*touch,y:-.012*4*touch*(1-touch)};pose.forearmL={angle:-70*touch};pose.pawL={angle:8*touch};
  pose.head={angle:1.5*nod,y:.010*nod};pose.earL={angle:3*notice};pose.earR={angle:-2*notice};
  pose.lidL={closure:.12*nod};pose.lidR={closure:.12*nod};
  return {pose:plantForepaws(pose,['R']),frontPaws:['L']};
 }
 if(state==='greeting'){
  const lift=admitted(180)*envelope(t,180,900,3200,4000),fold=admitted(80)*envelope(t,80,550,3850,4350);
  const first=admitted(1220)*envelope(t,1220,250,1570,1900),second=admitted(2080)*envelope(t,2080,220,2390,2760);
  const perk=admitted(60)*envelope(t,60,420,2850,3800),orient=admitted(350)*envelope(t,350,600,2950,4200);
  const support=admitted(0)*envelope(t,0,600,2920,3750),welcome=admitted(40)*envelope(t,40,800,2750,3800);
  const settle=admitted(3020)*envelope(t,3020,250,3380,3900),follow=admitted(350)*envelope(t,350,900,3050,4400);
  // The shoulder follows each wrist phrase instead of freezing for the
  // entire raised-paw hold. The second response is smaller and later;
  // the seated support absorbs it without lifting the planted contacts.
  const response=reduced?0:admitted(1220)*envelope(t,1300,300,1720,2060)+.6*admitted(2080)*envelope(t,2200,260,2510,2890);
  const scarfResponse=reduced?0:admitted(1220)*envelope(t,1420,310,1830,2200)+.6*admitted(2080)*envelope(t,2330,270,2630,3020);
  // Transfer weight toward the planted left paw before raising the right.
  // Chest lift/lean is independent of seated pelvis compression; the head is
  // carried rigidly, not stretched with the torso. Soles keep their anchors.
  Object.assign(pose,seatedSupportPose(.32*support+.16*settle+.08*response));
  pose.chest={angle:-3.6*welcome+.7*settle-.8*response,x:-.013*welcome-.003*response,y:-.020*welcome+.002*settle-.008*response};
  pose.scarfTail={angle:2.2*follow+.9*scarfResponse};
  pose.tailMid={angle:reduced?0:3.2*follow-1.3*settle};
  // Distal tail lag belongs to the already-started 350ms follow-through.
  pose.tailTip={angle:reduced?0:4.8*admitted(350)*envelope(t,500,1000,3250,4400)-1.5*settle};
  // Ears anticipate the wave; a small rigid head tilt settles after the paw.
  // Ear cartilage has its own pinned-root skin, never the face's deformation.
  pose.earL={angle:5*perk};pose.earR={angle:-3.5*perk};pose.head={angle:-2.25*orient+.45*response};
  // Fold before raising, lower before opening: a straight-arm sideways sweep
  // would leave the original canvas even though the final pose fits inside it.
  // A small shoulder lift releases the planted paw before the elbow folds;
  // rotation alone rolls its outside toe below the ground during takeoff.
  pose.upperArmR={angle:-80*lift,y:-.025*4*fold*(1-fold)};pose.forearmR={angle:-95*fold};
  // Open the existing painted palm before two uneven, diminishing wrist
  // phrases. No metronomic sine-wave hand, alpha dissolve or face stretching.
  pose.pawR={angle:lift*(-12+24*first+17*second)};
  return {pose:plantForepaws(pose,['L']),frontPaws:[],pawTurnR:admitted(650)*envelope(t,650,480,2840,3170)};
 }
 const reach=envelope(t,250,1250,7400,8900),hold=envelope(t,1700,350,6800,7200);
 pose.upperArmL={angle:-48*reach};pose.forearmL={angle:-95*reach};
 pose.pawL={angle:reduced?0:hold*1.5*Math.sin(t/1300)};
 return {pose:thinkingSupport(pose,t,reduced),frontPaws:['L']};
}
