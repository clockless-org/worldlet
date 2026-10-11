// The World's Task panel (core/tasks/task-panel.ts, core/tasks/next-run.ts): which rows go under Doing now, Planned and
// Done today, their order and limits, how a day of one Applet's checks folds into one row, failed rows, today only,
// and the time text. Fixed clock, fictional jobs; no browser.
import assert from 'node:assert/strict';
import {nextCronRun,taskPanel,taskPanelScheduleRuns,taskHowOften,routineEvery,routineDay,TASK_PANEL_LIMITS} from '../core/tasks/index.ts';

const at=(text:string)=>new Date(text).getTime();
const now=at('2026-10-10T07:30:00');
const s=(text:string)=>at(text)/1000;
const L='en-US';

// When a cron job runs next.
assert.equal(nextCronRun('0 8 * * *',now),at('2026-10-10T08:00:00'),'daily at 8: today');
assert.equal(nextCronRun('0 7 * * *',now),at('2026-10-11T07:00:00'),'daily at 7, already past: tomorrow');
assert.equal(nextCronRun('*/15 * * * *',now),at('2026-10-10T07:45:00'),'every 15 minutes');
assert.equal(nextCronRun('0 9 * * 1-5',now),at('2026-10-12T09:00:00'),'weekdays at 9, on a Saturday: Monday');
assert.equal(nextCronRun('30 18 * * 0,6',now),at('2026-10-10T18:30:00'),'weekends at 18:30');
assert.equal(nextCronRun('0 9 1 * *',now),null,'beyond eight days: no time shown');
assert.equal(nextCronRun('not a cron',now),null);
assert.equal(nextCronRun('61 * * * *',now),null);

// Time words.
assert.equal(routineEvery(3600),'every hour');assert.equal(routineEvery(1800),'every 30 min');assert.equal(routineEvery(172800),'every 2 days');
assert.equal(routineDay(at('2026-10-11T06:00:00'),now,L),'Tomorrow');assert.equal(routineDay(at('2026-10-12T06:00:00'),now,L),'Mon');
assert.equal(taskHowOften({cron:'0 6 * * *'}),'Every day');assert.equal(taskHowOften({cron:'0 9 * * 1-5'}),'Every weekday');
assert.equal(taskHowOften({cron:'0 17 * * 5'}),'Every Friday');assert.equal(taskHowOften({cron:'*/15 * * * *'}),'Every 15 min');
assert.equal(taskHowOften({cron:'5 * * * *'}),'Every hour');assert.equal(taskHowOften({cron:'0 9 1 * *'}),'Every month');
assert.equal(taskHowOften({everySeconds:3600}),'Every hour');assert.equal(taskHowOften({at:now+1}),'Once');assert.equal(taskHowOften({cron:'0 9 1,15 * *'}),'On its own schedule');

// Empty: nothing to show.
const empty=taskPanel({},now,L);
assert.equal(empty.empty,true);assert.equal(empty.chip,'');
assert.deepEqual([empty.now.total,empty.planned.total,empty.done.total],[0,0,0]);

// Planned: the Agent's jobs and the next source checks, soonest first; repeating ones without a time last; four, then +N.
const jobs=[
 {id:'a',name:'Morning brief',kind:'prompt',paused:false,when:{cron:'0 8 * * *'}},
 {id:'b',name:'Flight prices',kind:'prompt',paused:false,when:{everySeconds:3600}},
 {id:'c',name:'Paused one',kind:'prompt',paused:true,when:{cron:'0 7 * * *'}},
 {id:'d',name:'Call the dentist',kind:'prompt',paused:false,when:{at:at('2026-10-10T07:50:00')}},
 {id:'e',name:'Done already',kind:'prompt',paused:false,when:{at:at('2026-10-09T07:50:00')}},
 {id:'f',name:'Gym',kind:'prompt',paused:false,when:{cron:'30 6 * * 1,3,5'}},
] as any;
const tasks=[
 {id:'applet:gmail:check',owner:'gmail',status:'queued',nextAt:s('2026-10-10T07:40:00'),enabled:true},
 {id:'applet:google-calendar:check',owner:'google-calendar',status:'paused',nextAt:s('2026-10-10T07:35:00'),enabled:false},
 {id:'applet:apple-notes:check',owner:'apple-notes',status:'running',nextAt:null,execution:{startedAt:s('2026-10-10T07:29:00')}},
 {id:'attention:center',owner:'attention-center',status:'queued',nextAt:s('2026-10-10T07:31:00')},
];
const planned=taskPanel({jobs,tasks,harness:'OpenClaw'},now,L);
assert.deepEqual(planned.planned.rows.map(r=>[r.title,r.when]),[['Check Mail','7:40 AM'],['Call the dentist','7:50 AM'],['Morning brief','8:00 AM'],['Gym','Mon 6:30 AM']],JSON.stringify(planned.planned.rows));
assert.equal(planned.planned.more,1,'Flight prices, every hour, is the fifth');assert.equal(planned.planned.total,5);
const brief=planned.planned.rows.find(r=>r.id==='job:a')!;
assert.deepEqual([brief.source,brief.every,brief.by,brief.open],['agent-job','Every day','OpenClaw’s scheduler',{routine:'a'}]);
const mail=planned.planned.rows[0];
assert.deepEqual([mail.source,mail.by,mail.open],['check','Worldlet',{applet:'app-gmail'}]);
assert.equal(TASK_PANEL_LIMITS.planned,4);
// Tomorrow's job.
assert.equal(taskPanel({jobs:[{id:'t',name:'Weather',kind:'prompt',paused:false,when:{cron:'0 6 * * *'}}] as any},now,L).planned.rows[0].when,'Tomorrow 6:00 AM');
assert.equal(taskPanel({jobs:[{id:'t',name:'Weather',kind:'prompt',paused:false,when:{everySeconds:3600}}] as any},now,L).planned.rows[0].when,'every hour');
// A running check is Doing now, never Planned.
assert.deepEqual(planned.now.rows.map(r=>[r.title,r.when,r.source]),[['Checking Notes','In progress','check']]);
assert.equal(planned.chip,'Doing now 1 · Planned 5');

// Doing now: Fox's work, Applets working, checks running and older conversations coming in, newest first; three, then +N.
const doing=taskPanel({
 fox:[{source:'reply',text:'Drafting a reply: Answer Sam about the venue…',at:now-60_000}],
 working:[{id:'task-1',applet:'youtube',at:s('2026-10-10T07:25:00')},{id:'task-2',applet:'not-an-applet',at:s('2026-10-10T07:25:00')}],
 tasks,
 history:[{seq:1,at:s('2026-10-10T07:00:00'),kind:'brought.older',body:{agent:'hermes',status:'bringing',brought:200,remaining:1300}}],
},now,L);
assert.deepEqual(doing.now.rows.map(r=>r.title),['Drafting a reply: Answer Sam about the venue…','Checking Notes','YouTube is working on a task'],JSON.stringify(doing.now.rows));
assert.equal(doing.now.more,1,'the older conversations are the fourth');assert.equal(doing.now.total,4);
assert.deepEqual(doing.now.rows[2].open,{applet:'app-youtube'});
assert.equal(doing.now.rows[0].open,undefined,'Fox’s own work opens nothing here');

// Done today: newest first, a day of one Applet's checks folded, failures marked, yesterday left out, four then the total.
const history=[
 {seq:1,at:s('2026-10-09T23:00:00'),kind:'routine.run',body:{status:'complete',name:'Yesterday’s job'}},
 ...[1,2,3,4,5,6].map(n=>({seq:10+n,at:s(`2026-10-10T0${n}:00:00`),kind:'applet.check',key:'gmail',body:{status:'complete'}})),
 {seq:20,at:s('2026-10-10T06:30:00'),kind:'applet.check',key:'gmail',body:{status:'started'}},
 {seq:21,at:s('2026-10-10T05:30:00'),kind:'applet.check',key:'google-calendar',body:{status:'complete'}},
 {seq:22,at:s('2026-10-10T06:40:00'),kind:'applet.check',key:'google-calendar',body:{status:'error'}},
 {seq:23,at:s('2026-10-10T04:10:00'),kind:'applet.check',key:'apple-notes',body:{status:'error'}},
 {seq:24,at:s('2026-10-10T04:20:00'),kind:'applet.check',key:'apple-notes',body:{status:'complete'}},
 {seq:30,at:s('2026-10-10T06:50:00'),kind:'applet.task',key:'youtube',body:{status:'started',runId:'task-9'}},
 {seq:31,at:s('2026-10-10T07:00:00'),kind:'applet.task',key:'youtube',body:{status:'failed',runId:'task-9'}},
 {seq:32,at:s('2026-10-10T07:05:00'),kind:'routine.run',body:{status:'complete',name:'Water the plants',late:true}},
 {seq:33,at:s('2026-10-10T07:10:00'),kind:'brought.older',body:{agent:'hermes',status:'complete',brought:1500,remaining:0}},
];
const runs=taskPanelScheduleRuns([
 {id:'w1',provider:'harness:openclaw',kind:'update',title:'Weather',occurredAt:new Date(at('2026-10-10T07:15:00')).toISOString(),sources:[{id:'run-1'}]},
 {id:'w2',provider:'harness:openclaw',kind:'task',title:'Flight prices',occurredAt:new Date(at('2026-10-10T07:20:00')).toISOString(),sources:[{id:'run-2'}]},
 {id:'w3',provider:'harness:openclaw',kind:'task',title:'Start OpenClaw’s scheduler',occurredAt:new Date(at('2026-10-10T07:21:00')).toISOString(),sources:[{id:'scheduler-stopped:1'}]},
 {id:'w4',provider:'harness:openclaw',kind:'update',title:'Yesterday',occurredAt:new Date(at('2026-10-09T07:21:00')).toISOString(),sources:[{id:'run-0'}]},
 {id:'w5',provider:'gmail',kind:'task',title:'Mail item',occurredAt:new Date(at('2026-10-10T07:22:00')).toISOString(),sources:[{id:'m'}]},
],now);
assert.deepEqual(runs,[{id:'w1',title:'Weather',at:at('2026-10-10T07:15:00')},{id:'w2',title:'Flight prices',at:at('2026-10-10T07:20:00'),failed:true}],'today’s runs; the stopped-scheduler note and other items are not runs');
const done=taskPanel({history,runs,foxDone:[{source:'reply',text:'1 reply ready',at:at('2026-10-10T07:25:00')}]},now,L);
assert.deepEqual(done.done.rows.map(r=>[r.title,r.detail,r.when,!!r.failed]),[
 ['1 reply ready','','7:25 AM',false],
 ['Flight prices','Not finished','7:20 AM',true],
 ['Weather','','7:15 AM',false],
 ['Brought older Hermes Agent conversations','1,500 conversations','7:10 AM',false],
],JSON.stringify(done.done.rows));
assert.equal(done.done.total,10);assert.equal(done.done.more,6);
assert.equal(done.chip,'Done today 10');
// The history alone: the next rows, and two more checks (Calendar, Notes) behind them.
const folded=taskPanel({history},now,L);
assert.deepEqual(folded.done.rows.map(r=>r.title+(r.detail?' · '+r.detail:'')),['Brought older Hermes Agent conversations · 1,500 conversations','Water the plants · Ran late','YouTube couldn’t finish a task · Not finished','Calendar check didn’t finish · will retry'],JSON.stringify(folded.done.rows));
assert.equal(folded.done.total,7,'then Checked Mail, Calendar and Notes; Notes’ earlier failure was retried and is not shown; yesterday’s run is left out');
const mailChecks=taskPanel({history:history.filter(r=>r.key==='gmail')},now,L).done;
assert.deepEqual(mailChecks.rows.map(r=>[r.title,r.detail,r.when,r.count]),[['Checked Mail','6 times','6:00 AM',6]],'six checks of Mail are one row; one still running adds nothing');
assert.deepEqual(mailChecks.rows[0].open,{applet:'app-gmail'});
const failures=taskPanel({history:history.filter(r=>r.kind==='applet.check')},now,L).done.rows.filter(r=>r.failed).map(r=>r.id);
assert.deepEqual(failures,['check-failed:google-calendar'],'only a failure newer than the last success');
assert.deepEqual(done.done.rows[0].open,{journal:'2026-10-10'},'what Fox made opens the Journal on today’s page');
assert.deepEqual(done.done.rows[1].open,{attention:'w2'},'a scheduled job’s result points at its Attention item');
console.log('PASS task panel: Doing now, Planned and Done today grouped, sorted and capped (3, 4, 4 then +N or the day’s total), a day of one Applet’s checks folded, retried failures dropped, failed rows marked, today only, cron next runs and time text');
