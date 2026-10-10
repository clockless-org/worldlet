// The World's top-right routines line (ui/hud/routines-line.ts, core/tasks/next-run.ts): how many routines the
// person's Agent runs and which runs next, read from its scheduler's jobs.
import assert from 'node:assert/strict';
import {nextCronRun,routineLine} from '../core/tasks/index.ts';

const at=(text:string)=>new Date(text).getTime();
const now=at('2026-10-10T07:30:00');
assert.equal(nextCronRun('0 8 * * *',now),at('2026-10-10T08:00:00'),'daily at 8: today');
assert.equal(nextCronRun('0 7 * * *',now),at('2026-10-11T07:00:00'),'daily at 7, already past: tomorrow');
assert.equal(nextCronRun('*/15 * * * *',now),at('2026-10-10T07:45:00'),'every 15 minutes');
assert.equal(nextCronRun('0 9 * * 1-5',now),at('2026-10-12T09:00:00'),'weekdays at 9, on a Saturday: Monday');
assert.equal(nextCronRun('30 18 * * 0,6',now),at('2026-10-10T18:30:00'),'weekends at 18:30');
assert.equal(nextCronRun('0 9 1 * *',now),null,'beyond eight days: no time shown');
assert.equal(nextCronRun('not a cron',now),null);
assert.equal(nextCronRun('61 * * * *',now),null);
const jobs=[
 {id:'a',name:'Morning brief',kind:'prompt',paused:false,when:{cron:'0 8 * * *'}},
 {id:'b',name:'Flight prices',kind:'prompt',paused:false,when:{everySeconds:3600}},
 {id:'c',name:'Paused one',kind:'prompt',paused:true,when:{cron:'0 7 * * *'}},
 {id:'d',name:'Call the dentist',kind:'prompt',paused:false,when:{at:at('2026-10-10T07:50:00')}},
 {id:'e',name:'Done already',kind:'prompt',paused:false,when:{at:at('2026-10-09T07:50:00')}}
] as any;
assert.deepEqual(routineLine(jobs,now),{count:3,next:{name:'Call the dentist',at:at('2026-10-10T07:50:00')},names:['Morning brief','Flight prices','Call the dentist'],
 rows:[{name:'Call the dentist',at:at('2026-10-10T07:50:00'),everySeconds:null},{name:'Morning brief',at:at('2026-10-10T08:00:00'),everySeconds:null},{name:'Flight prices',at:null,everySeconds:3600}]},
 'paused and past one-time jobs are left out; listed soonest first, an interval job last');
assert.deepEqual(routineLine([],now),{count:0,next:null,names:[],rows:[]});
console.log('PASS routines line: cron next run (lists, ranges, steps, weekdays), paused and past jobs left out, the soonest named');
