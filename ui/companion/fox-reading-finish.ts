import {anatomyHold} from './fox-anatomy-hold.ts';
import {readingExpression} from './fox-reading-study.ts';
import type {ReadingPresentation} from './fox-anatomy-transition.ts';
import {smoother as ease} from './fox-skeleton.ts';
export type ReadingFinishStart={time:number;pageTime:number;rate:number;gazeDown?:number};
/** First physical exit segment: finish an in-flight leaf, recover the right
 * grip, then lower the still-open book. Closing/releasing it is separate work.
 * The sampled clock is absolute, so sparse RAF samples cannot skip a phase. */
export function readingFinish(start:ReadingFinishStart,elapsed:number,reduced=false){
 if([start.time,start.pageTime,start.rate,elapsed].some(v=>!Number.isFinite(v)||v<0)||start.rate>1)throw Error('Invalid reading finish clock');
 if(start.gazeDown!==undefined&&(!Number.isFinite(start.gazeDown)||start.gazeDown<0||start.gazeDown>1))throw Error('Invalid reading finish gaze');
 const phase=start.pageTime%9000,finishPage=phase>=4180&&phase<6600;
 const distance=finishPage?6800-phase:120*start.rate;
 const settleMs=finishPage?Math.min(Math.max(600,distance*1.4),2*distance/Math.max(.1,start.rate)):start.rate?240:0;
 const duration=settleMs+1600,t=reduced?duration:elapsed,u=settleMs?Math.min(1,t/settleMs):1;
 // Quintic Hermite clock: preserve incoming page speed, stop with zero
 // acceleration, and never reverse the paper to an earlier frame.
 const v=start.rate*settleMs;
 const travel=v*u+(10*distance-6*v)*u**3+(-15*distance+8*v)*u**4+(6*distance-3*v)*u**5;
 const lowered=ease((t-settleMs)/1600),time=start.time+t;
 const eyes=readingExpression(time,reduced),body=anatomyHold('idle',time,reduced);
 const gaze=start.gazeDown??readingExpression(start.pageTime,reduced).gazeDown;
 const reading:ReadingPresentation={time,pageTime:start.pageTime+travel,reduced,turning:true,completeRight:true,offset:[0,.085*lowered]};
 return {pose:{...body.pose,lidL:{closure:eyes.closure},lidR:{closure:eyes.closure}},front:{L:0,R:0},gazeDown:gaze+(1-gaze)*ease(t/500),reading,duration,phase:t<settleMs?'settling-page':t<duration?'lowering-book':'held-low'};
}
