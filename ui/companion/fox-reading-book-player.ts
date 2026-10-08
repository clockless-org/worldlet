import {createReadingClock} from './fox-reading-clock.ts';
import {readingFinish,type ReadingFinishStart} from './fox-reading-finish.ts';
import {createReadingHandling} from './fox-reading-handling.ts';
import {readingExpression,readingHandPoint} from './fox-reading-study.ts';
import {createReadingReplyMotion} from './fox-reading-reply.ts';
import {anatomyHold} from './fox-anatomy-hold.ts';
import type {ReadingPresentation} from './fox-anatomy-transition.ts';
import {smoother as ease} from './fox-skeleton.ts';

export type ReadingBookIntent='reading'|'listening'|'thinking'|'explaining'|'idle';
/** Own a single book across reading/conversation/idle. Page recovery is forward
 * only; the manipulation path may reverse. Automatic boundaries use their
 * actual completion time, never the observing RAF time. Other-prop ownership
 * is intentionally left to the performance player. */
export function createReadingBookPlayer(){
 let origin:number|undefined,last=-Infinity,intent:ReadingBookIntent='reading';
 let pages=createReadingClock(),destination:'held'|'rest'='held',resumeAt:number|undefined;
 let resumeGaze=1;
 let recovery:{start:ReadingFinishStart;at:number;settle:number}|undefined;
 let handling:{player:ReturnType<typeof createReadingHandling>;at:number;elapsed:number;deadline?:{at:number;elapsed:number}}|undefined;
 let reply:{player:ReturnType<typeof createReadingReplyMotion>;pageTime:number;at:number}|undefined;
 const advance=(now:number,reduced:boolean):{reading:ReadingPresentation;gazeDown:number;phase:string;nextBoundary?:number}=>{
  if(reply){
   const motion=reply.player.sample(intent==='explaining',now,reduced);
   if(intent==='explaining'||!motion.ready){
    const time=reduced?0:now-origin!,pageTime=reduced?0:reply.pageTime;
    const grip=readingHandPoint('R',time,pageTime,reduced);
    return {reading:{time,pageTime,reduced,turning:true,completeRight:true,rightHand:[grip[0]+motion.offset[0],grip[1]+motion.offset[1]]},
     gazeDown:reduced?0:1-ease((now-reply.at)/500),phase:intent==='explaining'?'held-book-reply':'regrasping-book',nextBoundary:destination==='rest'?motion.regraspAt:undefined};
   }
   // Rebuild the paused clock at contact, not at the RAF that observes it.
   // No page/handling clock is advanced while the right paw is away.
   const at=motion.regraspAt,pageTime=reply.pageTime;reply=undefined;
   pages=createReadingClock({pageTime,rate:0});pages.sample(intent==='reading',at);resumeAt=at;resumeGaze=0;
   if(destination==='rest'){
    const start={time:at-origin!,pageTime,rate:0,gazeDown:0};
    recovery={start,at,settle:readingFinish(start,0).duration-1600};
   }
  }
  if(recovery){
   const t=now-recovery.at;
   // Compare in the same absolute clock used by nextBoundary. Subtracting a
   // fractional origin can round below settle at the exact scheduled deadline.
   if(now<recovery.at+recovery.settle&&!reduced){const f=readingFinish(recovery.start,t);return {reading:f.reading,gazeDown:f.gazeDown,phase:'settling-page',nextBoundary:recovery.at+recovery.settle};}
   const at=reduced?now:recovery.at+recovery.settle;
   const player=createReadingHandling(recovery.start),first=player.sample(destination,0,reduced);
   handling={player,at,elapsed:0,deadline:first.motion.complete?undefined:{at:at+first.motion.arrival,elapsed:first.motion.arrival}};recovery=undefined;
  }
  if(handling){
   // Translate a reached absolute deadline back to its exact local value.
   // Keep local time monotonic when repeated samples share that rounded tick.
   handling.elapsed=Math.max(handling.elapsed,now-handling.at,handling.deadline&&now>=handling.deadline.at?handling.deadline.elapsed:0);
   const f=handling.player.sample(destination,handling.elapsed,reduced);
   handling.deadline=f.motion.complete?undefined:{at:handling.at+f.motion.arrival,elapsed:f.motion.arrival};
   if(f.motion.complete&&destination==='held'){
    resumeAt=handling.at+f.motion.arrival;resumeGaze=1;
    pages=createReadingClock({pageTime:f.reading.pageTime,rate:0});
    pages.sample(intent==='reading',resumeAt);handling=undefined;
    if(intent==='explaining'){
     reply={player:createReadingReplyMotion(),pageTime:f.reading.pageTime,at:resumeAt};
     reply.player.sample(true,resumeAt,reduced);
     return advance(now,reduced);
    }
   }else return {reading:f.reading,gazeDown:f.gazeDown,phase:f.phase,nextBoundary:f.motion.complete?undefined:handling.at+f.motion.arrival};
  }
  const clock=pages.sample(intent==='reading',now),gaze=readingExpression(clock.pageTime,reduced).gazeDown;
  return {reading:{time:now-origin!,pageTime:clock.pageTime,reduced,turning:true,completeRight:true},
   gazeDown:resumeAt===undefined?gaze:resumeGaze+(gaze-resumeGaze)*ease((now-resumeAt)/500),phase:'reading-book'};
 };
 return {
  sample(next:ReadingBookIntent,now:number,reduced=false){
   if(!['reading','listening','thinking','explaining','idle'].includes(next))throw Error('Unsupported book intent');
   if(!Number.isFinite(now)||now<0||now<last)throw Error('Book player requires monotonic finite time');
   if(origin===undefined){origin=now;pages.sample(true,now);}
   const previous=advance(now,reduced);
   if(next!==intent){
    if(next==='idle')destination='rest';else if(next==='reading')destination='held';
    // Conversation preserves the current destination, including a lap book.
    // Thinking/replying recover an in-flight leaf before holding. A reply's
    // hand-return gate owns any deferred rest request until both grips meet.
    if((next==='idle'||next==='thinking'||next==='explaining')&&!recovery&&!handling&&!reply){
     const clock=pages.sample(intent==='reading',now);
     const start={time:now-origin,pageTime:clock.pageTime,rate:clock.rate,gazeDown:previous.gazeDown};
     recovery={start,at:now,settle:readingFinish(start,0).duration-1600};
    }
    intent=next;
   }
   const f=advance(now,reduced),time=now-origin,body=anatomyHold('idle',time,reduced),eyes=readingExpression(time,reduced);
   last=now;
   return {...f,pose:{...body.pose,lidL:{closure:eyes.closure},lidR:{closure:eyes.closure}},front:{L:0,R:0},
    reading:{...f.reading,time:reduced?0:time,pageTime:reduced?0:f.reading.pageTime,reduced}};
  }
 };
}
