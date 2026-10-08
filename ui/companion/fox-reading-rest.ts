import {readingClose} from './fox-reading-close.ts';
import type {ReadingFinishStart} from './fox-reading-finish.ts';
import {smootherUnit as ease} from './fox-skeleton.ts';
// Input clamping alone is insufficient: cancellation near t=1 can produce
// 1.0000000000000009 and abort the renderer's strict prop-range validation.
/** A visible supported endpoint: the book remains on the lap after release.
 * This study does not erase the prop or claim a cross-prop/live handoff. */
export function readingRest(start:ReadingFinishStart,elapsed:number,reduced=false){
 const close=readingClose(start,0),duration=close.duration+2800,t=reduced?duration:elapsed;
 const frame=readingClose(start,t,reduced),placement=ease((t-close.duration)/1400),release=ease((t-close.duration-1600)/1200);
 return {...frame,gazeDown:frame.gazeDown*(1-ease((t-close.duration-2200)/600)),reading:{...frame.reading,placement,release,completeRight:true},duration,
  phase:t<close.duration?frame.phase:t<close.duration+1400?'placing-book':t<close.duration+1600?'supported':t<duration?'releasing-book':'resting-book'};
}
