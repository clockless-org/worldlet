// Fox routines after the computer slept (core/tasks/routine-catch-up.ts): each routine whose
// time passed runs once, not once per missed slot, and the world log says it ran late.
// The Electron wiring (powerMonitor resume wakes the clock) is module `fox` in test:electron.
import assert from 'node:assert/strict';
import {ROUTINE_LATE_MS,routinesDueAfterGap} from '../core/tasks/index.ts';
import {worldLogLines} from '../core/activity/index.ts';

const now=Date.parse('2026-10-04T09:30:00Z'),at=(ms:number)=>new Date(now-ms).toISOString();
const hour=3600_000,day=24*hour;
// Slept from 07:00 to 09:30 through the 08:00 news digest: one missed slot runs once, late.
assert.deepEqual(routinesDueAfterGap([{id:'news',name:'Morning news',nextRunAt:at(90*60_000)}],now),
 [{id:'news',name:'Morning news',scheduledAt:at(90*60_000),late:true}],'one missed slot: runs once, late');
// Slept three days through an hourly flight-price watch: Hermes keeps the first missed slot, so
// seventy-odd missed slots still come out as one run.
assert.deepEqual(routinesDueAfterGap([{id:'flights',name:'Flight prices',nextRunAt:at(3*day)}],now).map(r=>[r.id,r.late]),[['flights',true]],'many missed slots: runs once');
// "Remind me at 9am", slept from 07:00 to 09:30: the one-time routine runs once, late, instead of
// being dropped; once run, Hermes marks it completed.
assert.deepEqual(routinesDueAfterGap([{id:'remind',name:'Call the dentist',state:'scheduled',nextRunAt:at(30*60_000)}],now).map(r=>[r.id,r.late]),[['remind',true]],'missed one-time routine: runs once, late');
assert.deepEqual(routinesDueAfterGap([{id:'remind',state:'completed',nextRunAt:null}],now),[],'one-time routine already run: nothing');
// Nothing missed: the next run is still ahead.
assert.deepEqual(routinesDueAfterGap([{id:'news',nextRunAt:new Date(now+hour).toISOString()},{id:'none',nextRunAt:null}],now),[],'nothing missed: nothing runs');
// A paused or disabled routine stays paused, however long the computer slept.
assert.deepEqual(routinesDueAfterGap([{id:'a',enabled:false,nextRunAt:at(day)},{id:'b',state:'paused',nextRunAt:at(day)},{id:'c',state:'completed',nextRunAt:at(day)}],now),[],'disabled routine: nothing');
// Due within the minute clock's slack is on time, not late; a routine listed twice runs once.
assert.deepEqual(routinesDueAfterGap([{id:'x',nextRunAt:at(ROUTINE_LATE_MS-1000)},{id:'x',nextRunAt:at(ROUTINE_LATE_MS-1000)}],now).map(r=>[r.id,r.late,r.name]),[['x',false,'Scheduled task']]);
// Several routines missed in one sleep: each once, oldest first.
assert.deepEqual(routinesDueAfterGap([{id:'late',nextRunAt:at(hour)},{id:'early',nextRunAt:at(2*hour)},{id:'ahead',nextRunAt:new Date(now+60_000).toISOString()}],now).map(r=>r.id),['early','late']);
// The world log: a late run says so; an on-time run and a failure read plainly.
const t=now/1000;
assert.deepEqual(worldLogLines([
 {seq:1,at:t,kind:'routine.run',body:{id:'1',status:'complete',name:'Morning news',late:true}},
 {seq:2,at:t+60,kind:'routine.run',body:{id:'2',status:'complete',name:'Flight prices',late:false}},
 {seq:3,at:t+120,kind:'routine.run',body:{id:'3',status:'failed',name:'Inbox digest',late:true}},
]).map(l=>[l.who,l.text,l.failed??false]),[['fox','Fox ran Morning news late',false],['fox','Fox ran Flight prices',false],['fox','Fox couldn’t finish Inbox digest (late)',true]]);
console.log('PASS routine catch-up: a routine missed while asleep runs once (one or many slots, or one-time), none when nothing was missed or it is paused, and the world log says it ran late');
