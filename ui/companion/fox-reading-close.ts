import {readingFinish,type ReadingFinishStart} from './fox-reading-finish.ts';
import {smootherUnit as ease} from './fox-skeleton.ts';
// Preserve the physical [0,1] contract after floating-point evaluation too.
/** Closing follows page recovery and lowering. The endpoint is still held;
 * placement/release is deliberately not represented by an alpha disappearance. */
export function readingClose(start:ReadingFinishStart,elapsed:number,reduced=false){
 const base=readingFinish(start,0),duration=base.duration+1800,t=reduced?duration:elapsed;
 const frame=readingFinish(start,t,reduced),closure=ease((t-base.duration)/1800);
 return {...frame,reading:{...frame.reading,closure},duration,phase:t<base.duration?frame.phase:t<duration?'closing-book':'held-closed'};
}
