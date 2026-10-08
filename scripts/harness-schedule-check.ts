import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {afterScheduleCursor,harnessService,hermesScheduleJob,hermesScheduleRun,openClawScheduleJob,openClawScheduleRun,scheduleCursor,scheduleElsewhere,scheduleRunsAfter,scheduleStep,SCHEDULE_PUSH_MAX} from '../core/agent/index.ts';
import {hermesSchedule,openClawSchedule} from '../platform/electron/src/modules/agent-runtime/harness-schedule.ts';
import {createHarnessJobs} from '../platform/electron/src/modules/fox/harness-jobs.ts';
import {AGENT,PHONE} from '../platform/electron/src/host/services.ts';
import {WorldLedger} from '../platform/electron/src/store/ledger.ts';

// The person's scheduled jobs run on their own Agent's scheduler and each run comes back to the World
// (core/agent/PORTABILITY.md#scheduled-jobs-on-the-persons-own-agent): Core's rules for OpenClaw's and Hermes Agent's
// records and for what a run becomes, the host's read-only `files` readers against fixture folders (OpenClaw's
// task_runs, older cron_run_logs and JSONL run logs, its Gateway lock; Hermes Agent's run documents and ticker
// heartbeat), and the Harness-neutral consumer writing Attention items and phone notifications into a World.

const NOW=Date.parse('2026-10-08T09:00:00Z');
// Core: OpenClaw ---------------------------------------------------------------------------------
assert.deepEqual(openClawScheduleJob({id:'news',name:'Morning news',agentId:'main',enabled:true,schedule:{kind:'cron',expr:'0 8 * * *'},payload:{kind:'agentTurn',message:'Summarize the news.'},delivery:{mode:'announce',channel:'telegram'}}),
 {id:'news',name:'Morning news',kind:'prompt',paused:false,when:{cron:'0 8 * * *'},prompt:'Summarize the news.',agent:'main',delivery:'telegram'});
assert.deepEqual(openClawScheduleJob({id:'b',name:'Backup',enabled:false,schedule:{kind:'every',everyMs:3_600_000},payload:{kind:'command',command:'rsync'},delivery:{mode:'none'}}),
 {id:'b',name:'Backup',kind:'command',paused:true,when:{everySeconds:3600}});
assert.equal(openClawScheduleJob({id:'w',schedule:{kind:'cron',expr:'*/5 * * * *'},payload:{kind:'agentTurn',message:'x'},trigger:{script:'check.js'}})?.kind,'condition');
assert.equal(openClawScheduleJob({id:'h',schedule:{kind:'every',everyMs:60000},payload:{kind:'heartbeat'}}),null,'heartbeat monitors are machinery');
assert.equal(openClawScheduleJob({id:'x',payload:{kind:'agentTurn',message:'x'},schedule:{kind:'on-exit'}}),null,'no clock time');
assert.equal(openClawScheduleJob({id:'d',schedule:{kind:'cron',expr:'0 9 * * *'},payload:{kind:'agentTurn',message:'x'},delivery:{mode:'webhook',to:'https://example.com'}})?.delivery,'webhook');
const run=(patch:Record<string,unknown>)=>openClawScheduleRun({id:'r1',job:'news',at:NOW,status:'succeeded',summary:'Rain today.',...patch});
assert.deepEqual(run({}),{id:'r1',job:'news',at:NOW,status:'ok',output:'Rain today.'});
assert.equal(run({status:'failed',summary:null,error:'Model unreachable'})?.status,'failed');
assert.equal(run({status:'failed',summary:null,error:'Model unreachable'})?.output,'Model unreachable');
assert.equal(run({status:'timed_out'})?.status,'failed');
assert.equal(run({status:'failed',detail:{status:'skipped'}})?.status,'silent','a skipped run (stored as failed) is not a failure');
assert.equal(run({detail:{status:'ok',deliverySuppressionReason:'silent'}})?.status,'silent');
assert.equal(run({summary:'NO_REPLY'})?.status,'silent');
for(const status of ['running','cancelled'])assert.equal(run({status}),null,status);
assert.equal(run({at:NOW/1000})?.at,NOW,'seconds are read as milliseconds');
assert.equal(run({status:'ok'})?.status,'ok','older run logs say ok');

// Core: Hermes Agent ----------------------------------------------------------------------------------
assert.deepEqual(hermesScheduleJob({id:'j1',name:'Morning digest',prompt:'Summarize my inbox.',schedule:{kind:'cron',expr:'0 7 * * *'},enabled:true,deliver:'telegram'}),
 {id:'j1',name:'Morning digest',kind:'prompt',paused:false,when:{cron:'0 7 * * *'},prompt:'Summarize my inbox.',delivery:'telegram'});
assert.deepEqual(hermesScheduleJob({id:'j2',prompt:'Check the build',script:'w.py',schedule:{kind:'interval',minutes:5},state:'paused',deliver:'origin',origin:{platform:'discord'}}),
 {id:'j2',name:'Check the build',kind:'script',paused:true,when:{everySeconds:300},prompt:'Check the build',delivery:'discord'});
assert.equal(hermesScheduleJob({id:'j3',prompt:'x',schedule:{kind:'interval',minutes:5},deliver:'local'})?.delivery,undefined,'kept locally');
const header=(title:string)=>`# Cron Job: ${title}\n\n**Job ID:** j1\n**Run Time:** 2026-10-08 08:00:00\n**Schedule:** 0 7 * * *\n\n## Prompt\n\nSummarize my inbox.\n\n`;
assert.deepEqual(hermesScheduleRun('j1','2026-10-08_08-00-00.md',NOW,header('Morning digest')+'## Response\n\nThree emails need a reply.\n\n## Details\nNone.\n'),
 {id:'j1/2026-10-08_08-00-00.md',job:'j1',at:NOW,status:'ok',output:'Three emails need a reply.\n\n## Details\nNone.'},'the response is the rest of the document');
assert.deepEqual(hermesScheduleRun('j1','2026-10-08_08-00-00.md',NOW,header('Morning digest (FAILED)')+'## Error\n\n```\nTraceback (most recent call last):\n  File "x"\nRuntimeError: Provider quota exceeded\n```\n'),
 {id:'j1/2026-10-08_08-00-00.md',job:'j1',at:NOW,status:'failed',output:'RuntimeError: Provider quota exceeded'});
assert.equal(hermesScheduleRun('j1','2026-10-08_08-00-00.md',NOW,header('Morning digest')+'## Response\n\n[SILENT]\n')?.status,'silent');
assert.equal(hermesScheduleRun('j1','2026-10-08_08-00-00.md',NOW,'# Cron Job: Watch\n\n**Job ID:** j1\n**Run Time:** x\n\nScript gate returned `wakeAgent=false` — agent skipped.\n')?.status,'silent');
const blocked=hermesScheduleRun('j1','2026-10-08_08-00-00.md',NOW,'# Cron Job: Digest\n\n**Job ID:** j1\n**Run Time:** x\n**Status:** BLOCKED (configuration)\n\nThe pre-run configuration check found a problem.\n');
assert.equal(blocked?.status,'failed');assert.match(blocked!.output,/^The pre-run configuration check found a problem\.$/);
assert.equal(hermesScheduleRun('j1','notes.md',NOW,'x'),null,'only run documents');

// Core: cursors and the World's side ------------------------------------------------------------------
assert.equal(afterScheduleCursor({at:5,id:'b'},scheduleCursor({at:5,id:'a'})),true);
assert.equal(afterScheduleCursor({at:5,id:'a'},scheduleCursor({at:5,id:'a'})),false);
assert.equal(afterScheduleCursor({at:4,id:'z'},'5|a'),false);
const page=scheduleRunsAfter([{id:'b',job:'j',at:2,status:'ok',output:''},{id:'a',job:'j',at:2,status:'ok',output:''},{id:'c',job:'j',at:1,status:'ok',output:''}],'1|c',1);
assert.deepEqual([page.runs.map(r=>r.id),page.cursor],[['a'],'2|a']);
assert.deepEqual(scheduleElsewhere('openclaw',harnessService('openclaw','schedule')),['openclaw:']);
assert.deepEqual(scheduleElsewhere('hermes',harnessService('hermes','schedule')),['hermes:']);
assert.deepEqual(scheduleElsewhere('codex',harnessService('codex','schedule')),[],'no schedule service: Worldlet keeps running brought copies');
assert.deepEqual(scheduleElsewhere('x','worldlet'),[],'Worldlet standing in runs them itself');
const harness={id:'openclaw',title:'OpenClaw'};
const job={id:'news',name:'Morning news',kind:'prompt' as const,paused:false,when:{cron:'0 8 * * *'},delivery:'telegram'};
const ok={id:'r1',job:'news',at:NOW-60_000,status:'ok' as const,output:'Rain today. Take an umbrella.'};
const first=scheduleStep({harness,state:null,jobs:[job],runs:[ok],cursor:'c1',running:true,now:NOW});
assert.deepEqual([first.results,first.stopped,first.state],[[],null,{version:1,since:NOW,cursor:'c1'}],'the first poll only remembers where history ends');
const later=scheduleStep({harness,state:{version:1,since:NOW-3600_000},jobs:[job],runs:[ok,{...ok,id:'r2',status:'failed',output:''},{...ok,id:'r3',status:'silent'},{...ok,id:'old',at:NOW-7200_000}],cursor:'c2',running:true,now:NOW});
assert.equal(later.results.length,2,'a silent run and one from before Worldlet watched are not news');
const [result,failure]=later.results;
assert.equal(result.item.kind,'update');assert.equal(result.item.provider,'harness:openclaw');assert.equal(result.item.title,'Morning news');
assert.equal(result.item.reason,"From OpenClaw's scheduled job");assert.equal(result.item.attentionContentVersion,1);
assert.match(String(result.item.summary),/^Rain today\. Take an umbrella\.\n\nOpenClaw also sent it to telegram\.$/);
assert.deepEqual((result.item.sources as any[])[0],{provider:'harness:openclaw',id:'r1',quote:'Rain today. Take an umbrella.'});
assert.deepEqual(result.push,{kind:'routine',title:'Morning news',body:'Rain today. Take an umbrella.',collapse:'job-news'});
assert.equal(failure.item.kind,'task');assert.equal(failure.item.priority,'elevated');assert.equal(failure.item.attentionReason,'OpenClaw could not finish it');
assert.equal(failure.push?.body,'Did not finish: It stopped without saying why.');
const many=scheduleStep({harness,state:{version:1,since:0},jobs:[],runs:Array.from({length:5},(_,i)=>({...ok,id:'m'+i,job:'a b/c'})),running:null,now:NOW});
assert.equal(many.results.filter(r=>r.push).length,SCHEDULE_PUSH_MAX,'a burst pushes a few, the World keeps all');
assert.equal(many.results[0].item.title,'Scheduled job');assert.equal(many.results[0].push?.collapse,'job-a-b-c');
assert.equal(scheduleStep({harness,state:{version:1,since:0},jobs:[],runs:[{...ok,at:NOW-13*3600_000}],running:null,now:NOW}).results[0].push,null,'an old result is in the World, not pushed');
const stopped=scheduleStep({harness,state:{version:1,since:0},jobs:[job,{...job,id:'off',name:'Off',paused:true}],runs:[],running:false,start:'openclaw gateway install',now:NOW});
assert.equal(stopped.state.stoppedNoted,true);assert.equal(stopped.stopped?.item.kind,'task');
assert.match(String(stopped.stopped?.item.summary),/^Morning news run on OpenClaw's own scheduler, which is not running\. Start it with `openclaw gateway install`\./);
assert.equal(scheduleStep({harness,state:stopped.state,jobs:[job],runs:[],running:false,now:NOW}).stopped,null,'noted once');
assert.equal(scheduleStep({harness,state:stopped.state,jobs:[job],runs:[],running:true,now:NOW}).state.stoppedNoted,undefined,'noted again after it runs and stops');
assert.equal(scheduleStep({harness,state:{version:1,since:0},jobs:[{...job,paused:true}],runs:[],running:false,now:NOW}).stopped,null,'nothing waiting');
assert.equal(scheduleStep({harness,state:{version:1,since:0},jobs:[job],runs:[],running:null,now:NOW}).stopped,null,'cannot tell');
console.log('PASS scheduled jobs on the person’s own Agent, Core: OpenClaw and Hermes Agent jobs and runs, cursors, results as Worth Knowing or Worth Doing, pushes bounded, a stopped scheduler noted once');

// Host readers against fixture folders -----------------------------------------------------------------
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'worldlet-harness-schedule-'));
const write=(file:string,text:string)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);};
const digestOf=(root:string)=>{const hash=crypto.createHash('sha256');const walk=(dir:string)=>{for(const name of fs.readdirSync(dir).sort()){const file=path.join(dir,name),info=fs.lstatSync(file);hash.update(name);if(info.isDirectory())walk(file);else hash.update(info.mtimeMs+':'+fs.readFileSync(file).toString('hex'));}};walk(root);return hash.digest('hex');};
try{
 // OpenClaw 2026.9: cron_jobs and task_runs in the shared state database; the Gateway's lock while it runs.
 const home=path.join(scratch,'oc'),state=path.join(home,'.openclaw'),env={} as NodeJS.ProcessEnv;
 fs.mkdirSync(path.join(state,'state'),{recursive:true});
 const db=new DatabaseSync(path.join(state,'state','openclaw.sqlite'));
 db.exec(`CREATE TABLE cron_jobs(store_key TEXT,job_id TEXT,name TEXT,enabled INTEGER,agent_id TEXT,payload_kind TEXT,job_json TEXT,sort_order INTEGER,PRIMARY KEY(store_key,job_id));
  CREATE TABLE task_runs(task_id TEXT PRIMARY KEY,runtime TEXT NOT NULL,task_kind TEXT,source_id TEXT,status TEXT NOT NULL,ended_at INTEGER,error TEXT,terminal_summary TEXT,detail_json TEXT)`);
 db.prepare('INSERT INTO cron_jobs VALUES(?,?,?,?,?,?,?,?)').run('default','news','Morning news',1,'main','agentTurn',JSON.stringify({schedule:{kind:'cron',expr:'0 8 * * *'},payload:{kind:'agentTurn',message:'Summarize the news.'},delivery:{mode:'announce',channel:'telegram'}}),0);
 const task=db.prepare('INSERT INTO task_runs VALUES(?,?,?,?,?,?,?,?,?)');
 task.run('t1','cron','automation_run','news','succeeded',NOW-3000,null,'Old news.',JSON.stringify({kind:'cron-run',status:'ok'}));
 task.run('t2','cron','automation_run','news','running',null,null,null,null);
 task.run('t3','subagent',null,'x','succeeded',NOW-2000,null,'Not a cron run.',null);
 task.run('t4','cron','automation_run','news','cancelled',NOW-1000,null,null,null);
 db.close();
 const oc=openClawSchedule(home,env);
 const before=digestOf(state);
 assert.deepEqual((await oc.jobs()).map(j=>[j.id,j.name,j.delivery]),[['news','Morning news','telegram']]);
 let read=await oc.runs();
 assert.deepEqual(read.runs.map(r=>[r.id,r.status,r.output]),[['t1','ok','Old news.']],'finished cron runs only');
 assert.equal(read.cursor,`${NOW-1000}|t4`,'the cursor passes a cancelled run');
 assert.deepEqual(await oc.runs(read.cursor),{runs:[],cursor:read.cursor});
 assert.equal(await oc.running(),false,'no Gateway lock');
 const lock=path.join(state,'tmp',typeof process.getuid==='function'?'openclaw-'+process.getuid():'openclaw','gateway.state.lock');
 write(lock,JSON.stringify({pid:process.pid,role:'agent-embedded'}));
 assert.equal(await oc.running(),false,'an embedded turn is not the Gateway');
 write(lock,JSON.stringify({pid:process.pid,role:'gateway'}));
 assert.equal(await oc.running(),true);
 write(lock,'not json');
 assert.equal(await oc.running(),null,'an unreadable lock says nothing');
 fs.rmSync(path.join(state,'tmp'),{recursive:true});
 assert.equal(digestOf(state),before,'OpenClaw’s folder is only read');
 write(lock,JSON.stringify({pid:process.pid,role:'gateway'}));

 // The World's consumer: a first poll remembers where history ends; a later run becomes an item and a push.
 const world=new WorldLedger(path.join(scratch,'world'));
 const pushes:any[]=[];let changes=0;
 const agent:any={harness:{id:'openclaw',title:'OpenClaw'},schedule:()=>oc};
 const host:any={store:{writable:true,sampleEnabled:()=>false,ledger:()=>world,worldChanged:()=>{changes++;}},diagnostics:{record:(error:unknown)=>{throw error;}},
  optional:(name:string)=>name===AGENT?agent:name===PHONE?{notify:async(push:any)=>{pushes.push(push);return true;}}:undefined};
 let allowed=false;
 const jobs=createHarnessJobs(host,{allowed:()=>allowed});
 assert.deepEqual(jobs.elsewhere(),['openclaw:'],'brought OpenClaw copies wait for OpenClaw’s own scheduler');
 await jobs.poll();
 assert.equal(world.setting('harness-schedule:openclaw'),null,'nothing while not allowed (consent, sample world, setup)');
 allowed=true;
 await jobs.poll();
 assert.deepEqual(world.setting('harness-schedule:openclaw')?.cursor,`${NOW-1000}|t4`);
 assert.equal(world.records('items').length,0,'history from before is not news');
 assert.equal(pushes.length,0);
 const reopen=new DatabaseSync(path.join(state,'state','openclaw.sqlite'));
 // The poll judges age by the real clock (results over 12 hours old are not pushed), so the new run is from now.
 reopen.prepare('INSERT INTO task_runs VALUES(?,?,?,?,?,?,?,?,?)').run('t5','cron','automation_run','news','succeeded',Math.max(Date.now(),NOW+1000),null,'Sunny all day.',JSON.stringify({kind:'cron-run',status:'ok'}));
 reopen.close();
 const since=world.setting('harness-schedule:openclaw')!;
 world.saveSetting('harness-schedule:openclaw',{...since,since:0});
 await jobs.poll();
 const items=world.records('items');
 assert.equal(items.length,1);assert.equal(items[0].kind,'update');assert.equal(items[0].title,'Morning news');assert.match(String(items[0].summary),/^Sunny all day\./);
 assert.deepEqual(pushes,[{kind:'routine',title:'Morning news',body:'Sunny all day.',collapse:'job-news',open:{item:items[0].id},act:{attention:items[0].id}}]);
 assert.ok(changes>0,'the World page refreshes');
 await jobs.poll();
 assert.equal(world.records('items').length,1,'each run once');
 // The Gateway stops while a job waits: the World notes it once.
 fs.rmSync(lock);
 await jobs.poll();
 assert.equal(world.records('items').filter(item=>item.kind==='task').length,1,'a stopped Gateway is noted');
 assert.equal(pushes.at(-1).title,'OpenClaw\'s scheduled jobs are not running');
 await jobs.poll();
 assert.equal(world.records('items').length,2,'once');
 agent.harness={id:'codex',title:'Codex'};
 assert.deepEqual(jobs.elsewhere(),[],'a Harness without the service: Worldlet’s routines run brought copies as before');
 world.close();

 // Older OpenClaw: cron_run_logs, and before SQLite one JSONL file per job.
 const older=path.join(scratch,'oc-older'),olderState=path.join(older,'.openclaw');
 fs.mkdirSync(path.join(olderState,'state'),{recursive:true});
 const logs=new DatabaseSync(path.join(olderState,'state','openclaw.sqlite'));
 logs.exec('CREATE TABLE cron_run_logs(store_key TEXT,job_id TEXT,seq INTEGER,ts INTEGER,status TEXT,error TEXT,summary TEXT,run_id TEXT,entry_json TEXT)');
 logs.prepare('INSERT INTO cron_run_logs VALUES(?,?,?,?,?,?,?,?,?)').run('default','news',1,NOW,'ok',null,'Logged.',null,JSON.stringify({action:'finished',jobId:'news',ts:NOW,status:'ok'}));
 logs.close();
 assert.deepEqual((await openClawSchedule(older,{}).runs()).runs.map(r=>[r.id,r.output]),[[`news:${NOW}:1`,'Logged.']]);
 const jsonl=path.join(scratch,'oc-jsonl');
 write(path.join(jsonl,'.openclaw','cron','runs','news.jsonl'),[JSON.stringify({action:'started',jobId:'news',ts:NOW-5}),JSON.stringify({action:'finished',jobId:'news',ts:NOW,status:'error',error:'No model',runId:'x1'})].join('\n'));
 assert.deepEqual((await openClawSchedule(jsonl,{}).runs()).runs.map(r=>[r.id,r.status,r.output]),[['x1','failed','No model']]);

 // Hermes Agent: jobs.json, one run document per run, the ticker's heartbeat.
 const hermesHome=path.join(scratch,'hm'),hermes=path.join(hermesHome,'.hermes');
 write(path.join(hermes,'config.yaml'),'model:\n  default: x\n');
 write(path.join(hermes,'cron','jobs.json'),JSON.stringify({jobs:[{id:'j1',name:'Morning digest',prompt:'Summarize my inbox.',schedule:{kind:'cron',expr:'0 7 * * *'},enabled:true,deliver:'telegram'}]}));
 const doc=(name:string,text:string,at:number)=>{const file=path.join(hermes,'cron','output','j1',name);write(file,text);fs.utimesSync(file,at/1000,at/1000);};
 doc('2026-10-08_07-00-00.md',header('Morning digest')+'## Response\n\nTwo replies due.\n',NOW-7200_000);
 doc('2026-10-08_08-00-00.md',header('Morning digest')+'## Response\n\n[SILENT]\n',NOW-3600_000);
 const hm=hermesSchedule(hermesHome,{});
 const hermesBefore=digestOf(hermes);
 assert.deepEqual((await hm.jobs()).map(j=>[j.id,j.delivery]),[['j1','telegram']]);
 const runs=await hm.runs();
 assert.deepEqual(runs.runs.map(r=>[r.id,r.status]),[['j1/2026-10-08_07-00-00.md','ok'],['j1/2026-10-08_08-00-00.md','silent']]);
 assert.deepEqual(await hm.runs(runs.cursor),{runs:[],cursor:runs.cursor});
 assert.equal(await hm.running(),false,'no ticker heartbeat');
 write(path.join(hermes,'cron','ticker_heartbeat'),String(Date.now()/1000-30));
 assert.equal(await hm.running(),true);
 write(path.join(hermes,'cron','ticker_heartbeat'),String(Date.now()/1000-600));
 assert.equal(await hm.running(),false,'a stale heartbeat');
 fs.rmSync(path.join(hermes,'cron','ticker_heartbeat'));
 assert.equal(digestOf(hermes),hermesBefore,'Hermes Agent’s folder is only read');
 assert.equal(hm.start,'hermes gateway install');
}finally{fs.rmSync(scratch,{recursive:true,force:true});}
console.log('PASS scheduled jobs on the person’s own Agent, host: OpenClaw task_runs, cron_run_logs and JSONL run logs, its Gateway lock, Hermes Agent run documents and heartbeat, read-only; the World’s consumer turns a new run into one item and one push and notes a stopped scheduler once');
