import {readingRest} from './fox-reading-rest.ts';
import {readingFinish,type ReadingFinishStart} from './fox-reading-finish.ts';
/** Resume only from the supported rest endpoint. Reverse the manipulation,
 * never the page or the character's breathing/blinking clock. */
export function readingResume(start:ReadingFinishStart,elapsed:number,reduced=false){
 if(!Number.isFinite(elapsed)||elapsed<0)throw Error('Invalid reading resume clock');
 const end=readingRest(start,readingRest(start,0).duration),finish=readingFinish(start,0),settled=finish.duration-1600;
 const duration=end.duration-settled,t=reduced?duration:elapsed;
 const reverse=Math.max(settled,end.duration-t),manipulation=readingRest(start,reverse);
 const alive=readingFinish({...start,time:end.reading.time,pageTime:end.reading.pageTime,rate:0,gazeDown:0},t,reduced);
 const gaze=Math.min(1,t/600),gazeDown=gaze**3*(10+gaze*(-15+6*gaze));
 return {...manipulation,pose:alive.pose,gazeDown,
  reading:{...manipulation.reading,time:end.reading.time+t,pageTime:end.reading.pageTime,reduced},duration,
  phase:t<1200?'regrasping-book':t<1400?'gripping-book':t<2800?'lifting-book':t<4600?'opening-book':t<duration?'raising-book':'ready-to-read'};
}
