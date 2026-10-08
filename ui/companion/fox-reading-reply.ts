import {readingFinish,type ReadingFinishStart} from './fox-reading-finish.ts';
import {readingHandPoint} from './fox-reading-study.ts';
import {anatomyHold} from './fox-anatomy-hold.ts';
import type {ReadingPresentation} from './fox-anatomy-transition.ts';
import definition from '../../resources/styles/builtin/drafts/fox-states-v1/reading-rig.json' with {type:'json'};
import {createAnatomyTransition} from './fox-anatomy-transition.ts';
import {smootherUnit as ease} from './fox-skeleton.ts';
export function readingReplyGesture(t:number,reduced=false){
 if(!Number.isFinite(t)||t<0)throw Error('Invalid reply gesture time');
 const time=reduced?1800:t,offer=ease(time/850)*(1-ease((time-2400)/1200));
 const accent=reduced?0:ease((time-1150)/300)*(1-ease((time-1550)/450));
 const [dx,dy]=definition.reply.rightHandOffset;
 return {offset:[dx*offer,dy*offer-.009*accent] as const,head:{angle:3*offer+.8*accent,y:.003*accent}};
}

/** Starts only after the page has settled. Blend ongoing phrases on
 * interruption, never a frozen screenshot. The returned regrasp timestamp is
 * a safe boundary for resuming page/handling clocks. */
export function createReadingReplyMotion(){
 const duration=650;
 const mixer=createAnatomyTransition((state,t,reduced)=>{
  const g=readingReplyGesture(t,reduced);
  return state==='reply'?{pose:{hand:{x:g.offset[0],y:g.offset[1]},head:g.head},front:{L:0,R:1}}:{pose:{},front:{L:0,R:0}};
 },duration);
 let active:boolean|undefined,origin=0,leaveAt:number|undefined,last=-Infinity;
 return {
  sample(next:boolean,now:number,reduced=false){
   if(!Number.isFinite(now)||now<0||now<last)throw Error('Reply motion requires monotonic finite time');
   if(active===undefined){origin=now;leaveAt=next?undefined:now-duration;}
   else if(next!==active){
    if(next){if(leaveAt===undefined||now-leaveAt>duration)origin=now;leaveAt=undefined;}
    else leaveAt=now;
   }
   active=next;last=now;
   const frame=mixer.sample(next?'reply':'quiet',next?now-origin:0,now,reduced);
   const regraspAt=next?(reduced?Infinity:origin+3600):reduced?now:leaveAt!+duration;
   return {offset:[frame.pose.hand?.x||0,frame.pose.hand?.y||0] as const,
    head:{angle:frame.pose.head?.angle??0,y:frame.pose.head?.y??0},ready:now>=regraspAt,regraspAt};
  }
 };
}
/** Isolated physical phrase: recover the page, keep the left grip, offer the
 * right paw, then regrasp. Not a live state or interruptible scheduler yet. */
export function readingReply(start:ReadingFinishStart,elapsed:number,reduced=false){
 const settle=readingFinish(start,0).duration-1600,duration=settle+3600;
 if(!Number.isFinite(elapsed)||elapsed<0)throw Error('Invalid reading reply time');
 if(!reduced&&elapsed<settle)return {...readingFinish(start,elapsed),duration,phase:'recovering-page'};
 const t=reduced?1800:Math.max(0,elapsed-settle),time=reduced?0:start.time+elapsed;
 const settled=readingFinish(start,settle),pageTime=settled.reading.pageTime;
 const g=readingReplyGesture(t,reduced),grip=readingHandPoint('R',time,pageTime,reduced);
 const reading:ReadingPresentation={time,pageTime,reduced,turning:true,completeRight:true,
  rightHand:[grip[0]+g.offset[0],grip[1]+g.offset[1]]};
 const body=anatomyHold('idle',time,reduced);
 const pose={...body.pose,head:g.head};
 return {pose,front:{L:0,R:1},gazeDown:1-ease(t/500),reading,duration,
  phase:t<850?'offering-paw':t<2400?'reply-gesture':t<3600?'regrasping-book':'holding-book'};
}

export const READING_REPLY_INTERRUPTS=[[0,true],[1200,false],[1500,true],[1900,false],[2700,true],[5000,false]] as const;
/** Repeatable inspector replay; production must retain the controller instead
 * of reconstructing it per frame. The page remains settled throughout. */
export function readingReplyInterruptReview(elapsed:number,reduced=false){
 if(!Number.isFinite(elapsed)||elapsed<0)throw Error('Invalid reply review clock');
 const start={time:5100,pageTime:5100,rate:1},settle=readingFinish(start,0).duration-1600;
 const t=reduced?settle+1800:elapsed;
 if(t<settle)return readingReply(start,t);
 const controller=createReadingReplyMotion();let active=true;
 for(const [at,next] of READING_REPLY_INTERRUPTS){if(settle+at>t)break;controller.sample(next,settle+at,reduced);active=next;}
 const motion=controller.sample(active,t,reduced),time=reduced?0:start.time+t;
 const pageTime=readingFinish(start,settle).reading.pageTime;
 const grip=readingHandPoint('R',time,pageTime,reduced),body=anatomyHold('idle',time,reduced);
 return {pose:{...body.pose,head:motion.head},front:{L:0,R:1},gazeDown:1-ease((t-settle)/500),
  reading:{time,pageTime,reduced,turning:true,completeRight:true,rightHand:[grip[0]+motion.offset[0],grip[1]+motion.offset[1]] as const},
  phase:motion.ready?'regrasped':active?'replying':'returning-hand',duration:settle+6500};
}
