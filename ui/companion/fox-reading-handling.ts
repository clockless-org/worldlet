import {anatomyHold} from './fox-anatomy-hold.ts';
import {readingExpression} from './fox-reading-study.ts';
import {readingFinish,type ReadingFinishStart} from './fox-reading-finish.ts';
import {readingRest} from './fox-reading-rest.ts';
import {createPropPathClock} from './fox-prop-path-clock.ts';

type Target='held'|'rest';
/** One physical book path, not two fading poses. A bounded quintic retains
 * position, velocity and acceleration when the requested destination changes.
 * The Bezier convex hull proves the path stays inside the authored interval. */
function createHandlingClock(initial:Target){
 const clock=createPropPathClock(initial==='rest'?1:0);
 return (next:Target,now:number,reduced:boolean)=>{
  return {...clock(next==='rest'?1:0,now,reduced),target:next};
 };
}

/** Begins after page recovery, with both paws supporting the book. It never
 * rewinds an in-flight leaf. Live page recovery and arm-surface handoff belong
 * to the owning performance player and are not silently approximated here. */
export function createReadingHandling(start:ReadingFinishStart,initial:Target='held'){
 if(initial!=='held'&&initial!=='rest')throw Error('Unknown initial book position');
 const finish=readingFinish(start,0),settled=finish.duration-1600;
 const end=readingRest(start,0).duration,span=end-settled;
 const origin=initial==='rest'?end:settled,pageTime=readingFinish(start,settled).reading.pageTime;
 const clock=createHandlingClock(initial);
 return {
  sample(target:Target,elapsed:number,reduced=false){
   if(target!=='rest'&&target!=='held')throw Error('Unknown book destination');
   const motion=clock(target,elapsed,reduced),path=readingRest(start,settled+motion.position*span);
   const time=start.time+origin+elapsed,body=anatomyHold('idle',time,reduced),eyes=readingExpression(time,reduced);
   const reversePhases:Record<string,string>={'releasing-book':'regrasping-book','supported':'gripping-book','placing-book':'lifting-book','closing-book':'opening-book','lowering-book':'raising-book'};
   const phase=motion.complete?(target==='rest'?'resting-book':'ready-to-read'):motion.velocity<0?(reversePhases[path.phase]??path.phase):path.phase;
   return {...path,pose:{...body.pose,lidL:{closure:eyes.closure},lidR:{closure:eyes.closure}},
    gazeDown:1-path.reading.release,reading:{...path.reading,time,pageTime,reduced},phase,motion};
  }
 };
}

export const READING_HANDLING_EVENTS:readonly (readonly [number,Target])[]=[
 [0,'rest'],[2600,'held'],[3550,'rest'],[9000,'held'],[11300,'rest'],[12300,'held']
];
export function readingHandlingReview(elapsed:number,reduced=false,events=READING_HANDLING_EVENTS){
 const player=createReadingHandling({time:6800,pageTime:6800,rate:0});let target:Target='held';
 for(const [at,next] of events){if(at>elapsed)break;target=next;player.sample(target,at,reduced);}
 return player.sample(target,elapsed,reduced);
}
