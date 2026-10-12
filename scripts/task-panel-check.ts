// The World's tasks beside Fox (core/tasks/task-panel.ts, core/tasks/next-run.ts): which rows go under Scheduled and Doing now,
// their order, every row kept (a side lists them all), only what the person set going (no Applet checks, no finished
// work), and the time text. Fixed clock, fictional jobs; no browser.
import assert from 'node:assert/strict';
import {nextCronRun,taskPanel,taskHowOften,routineEvery,routineDay,turnTaskName,TURN_TASK_SOURCE} from '../core/tasks/index.ts';

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
assert.equal(empty.empty,true);
assert.deepEqual([empty.routines.total,empty.now.total],[0,0]);
assert.deepEqual(Object.keys(empty).sort(),['empty','now','routines'],'two groups: no Done list');

// Routines: the person's Agent's jobs, soonest first; repeating ones without a time last; all of them. An Applet's own
// checks are not the person's routines and never show, planned or running (owner rule 2026-10-11).
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
 {id:'applet:apple-notes:check',owner:'apple-notes',status:'running',nextAt:null,execution:{startedAt:s('2026-10-10T07:29:00')}},
];
const history=[{seq:1,at:s('2026-10-10T07:00:00'),kind:'brought.older',body:{agent:'hermes',status:'bringing',brought:200,remaining:1300}}];
const planned=taskPanel({jobs,harness:'OpenClaw',...{tasks,history} as any},now,L);
assert.deepEqual(planned.routines.rows.map(r=>[r.title,r.when]),[['Call the dentist','7:50 AM'],['Morning brief','8:00 AM'],['Gym','Mon 6:30 AM'],['Flight prices','every hour'],['Paused one','Paused']],JSON.stringify(planned.routines.rows));
assert.equal(planned.routines.total,5,'every routine kept: the side’s list shows them all');
assert.equal(planned.now.total,0,'a running Applet check or Worldlet’s own housekeeping is not the person’s task');
assert.ok(planned.routines.rows.every(r=>r.group==='routines'));
const brief=planned.routines.rows.find(r=>r.id==='job:a')!;
assert.deepEqual([brief.source,brief.every,brief.by,brief.open],['agent-job','Every day','OpenClaw’s scheduler',{routine:'a'}]);
assert.deepEqual(planned.routines.rows.map(r=>[r.name,r.status,r.icon]),[['Call the dentist','7:50 AM','clock'],['Morning brief','8:00 AM','clock'],['Gym','Mon 6:30 AM','clock'],['Flight prices','every hour','clock'],['Paused one','Paused','clock']],'each card: its name, when it runs, a clock');
// Tomorrow's job.
assert.equal(taskPanel({jobs:[{id:'t',name:'Weather',kind:'prompt',paused:false,when:{cron:'0 6 * * *'}}] as any},now,L).routines.rows[0].when,'Tomorrow 6:00 AM');
assert.equal(taskPanel({jobs:[{id:'t',name:'Weather',kind:'prompt',paused:false,when:{everySeconds:3600}}] as any},now,L).routines.rows[0].when,'every hour');
// The day and time of each.
assert.deepEqual(planned.routines.rows.map(r=>[r.day,r.clock]),[['Today','7:50 AM'],['Today','8:00 AM'],['Mon','6:30 AM'],['Repeating','every hour'],['Paused','Every day']]);

// Doing now: Fox's work and Applets working on a task Fox handed them, newest first, one card each.
const doing=taskPanel({
 fox:[{source:'reply',text:'Drafting a reply: Answer Sam about the venue…',at:now-60_000}],
 working:[{id:'task-1',applet:'youtube',at:s('2026-10-10T07:25:00')},{id:'task-2',applet:'not-an-applet',at:s('2026-10-10T07:25:00')}],
},now,L);
assert.deepEqual(doing.now.rows.map(r=>r.title),['Drafting a reply: Answer Sam about the venue…','YouTube is working on a task'],JSON.stringify(doing.now.rows));
assert.equal(doing.now.total,2,'every running task has its own card');
assert.deepEqual(doing.now.rows[1].open,{applet:'app-youtube'});
assert.equal(doing.now.rows[0].open,undefined,'Fox’s own work opens nothing here');
assert.deepEqual(doing.now.rows.map(r=>[r.who,r.lines]),[['Fox',['Drafting a reply: Answer Sam about the venue…']],['YouTube',['Fox handed YouTube a task','YouTube is working on it']]]);
// Each running card: a short name, what it is doing, its picture, and how far along only when that is known.
assert.deepEqual(doing.now.rows.map(r=>[r.name,r.status,r.icon,r.progress]),[['Fox','Drafting a reply: Answer Sam about the venue…','fox',undefined],['YouTube','Working on a task from Fox','youtube',undefined]]);
// A page Fox drives comes first, its steps as lines.
const driving=taskPanel({page:{url:'https://www.example.com/courts?x=1',title:'Book a court',steps:[{text:'Opening the booking page',done:true},{text:'Choosing a court time',done:false}]},working:[{id:'task-1',applet:'youtube',at:s('2026-10-10T07:29:00')}]},now,L);
assert.deepEqual(driving.now.rows.map(r=>r.id),['page:example.com','applet:task-1'],'the page Fox drives first');
assert.deepEqual([driving.now.rows[0].title,driving.now.rows[0].detail,driving.now.rows[0].lines,driving.now.rows[0].open],['Fox is working on example.com','Choosing a court time',['✓ Opening the booking page','› Choosing a court time'],{url:'https://www.example.com/courts?x=1'}]);
assert.deepEqual([driving.now.rows[0].name,driving.now.rows[0].status,driving.now.rows[0].progress],['example.com','Choosing a court time',.5],'one of two steps done');
assert.equal(taskPanel({page:{url:'about:blank',title:''}},now,L).now.total,0,'not a web page: no card for it');

// The two default Routines, Today's prep and Wrap up today, stand on the Routines timeline (core/artifacts dailyPlanned).
{
 const daily=taskPanel({daily:[{kind:'summary',at:at('2026-10-10T18:00:00')},{kind:'plan',at:at('2026-10-11T07:00:00')},{kind:'plan',at:now-1}]},now,L);
 assert.deepEqual(daily.routines.rows.map(r=>[r.id,r.title,r.day,r.clock,r.by]),[['daily:summary','Wrap up today','Today','6:00 PM','Worldlet, with your Agent'],['daily:plan','Today’s prep','Tomorrow','7:00 AM','Worldlet, with your Agent']],'the summary tonight, the brief tomorrow; one due now is not planned');
 assert.equal(daily.routines.rows[1].every,'Every morning, while you use Worldlet');
}
// A turn in which Fox does something is a task named after the person's words, short.
assert.equal(turnTaskName('\n  Book a table for four at Nopa tonight at seven please\nthanks'),'Book a table for four at Nopa tonight a…');
assert.equal(turnTaskName('   '),'Fox');
{const turn=taskPanel({fox:[{source:TURN_TASK_SOURCE,text:'Opening Mail…',at:0,name:turnTaskName('Email Sam')}]},0);
 assert.deepEqual([turn.now.rows[0].id,turn.now.rows[0].name,turn.now.rows[0].status],['fox:turn','Email Sam','Opening Mail…']);}
console.log('PASS task panel: Routines and Doing now grouped and sorted with every row kept, one card each with its name, line and picture, only what the person set going (no Applet checks, no finished work), cron next runs and time text, Today’s prep and Wrap up today among the routines');
