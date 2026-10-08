import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {APP_DEFINITIONS} from '../core/applets/catalog.ts';
import {validateAppletRuntimes,appletReadPlan,finishAppletPage,type AppletRuntimeSpec} from '../core/applets/runtime.ts';
import {dueSourceCheck} from '../core/scheduling/source-checks.ts';
const rows=validateAppletRuntimes(APP_DEFINITIONS.map(a=>JSON.parse(readFileSync(`ui/applets/${a.key}/runtime.json`,'utf8'))));
for(const app of APP_DEFINITIONS)assert.match(readFileSync(`ui/applets/${app.key}/applet.md`,'utf8'),/## Status/);
const mail=rows.find(r=>r.provider==='gmail')!;
let cursor:any={},now=1_800_000_000;
for(let page=0;page<51;page++){
 const plan=appletReadPlan(mail,cursor,now+page);
 assert.equal(plan.query,'in:anywhere');assert.equal(plan.startedAt,now);
 cursor=finishAppletPage(mail,cursor,plan,{records:[],scannedCount:plan.limit,nextPageToken:`page-${page+1}`},now+page);
 assert.equal(cursor.scanned,Math.min(1000,5+page*20));
 assert.equal(cursor.hasMore,page<50);
}
assert.equal(cursor.initialComplete,true);assert.equal(cursor.coverage,'bounded');
const restored=JSON.parse(JSON.stringify(cursor));
assert.equal(appletReadPlan(mail,restored,now+1800).query,`after:${now-86400}`);
const noSubscriber={...mail,publishAttention:false};
assert.deepEqual(appletReadPlan(noSubscriber,restored,now+1800),appletReadPlan(mail,restored,now+1800));
assert.throws(()=>finishAppletPage(mail,{},appletReadPlan(mail,{},now),{scannedCount:21},now));
assert.throws(()=>validateAppletRuntimes([mail,{...mail,key:'duplicate'}]));
const calendar=rows.find(r=>r.provider==='google-calendar')!;
const cp=appletReadPlan(calendar,{},now),cc=finishAppletPage(calendar,{},cp,{scannedCount:cp.limit,nextPageToken:'next'},now+5);
assert.equal(appletReadPlan(calendar,cc,now+60).windowStart,now,'Calendar paging must keep the same time window');
assert.equal(appletReadPlan(calendar,cc,now+60).pageToken,'next');
assert.equal(finishAppletPage(calendar,cc,appletReadPlan(calendar,cc,now+60),{records:[],scannedCount:0},now+61).hasMore,false);
assert.equal(dueSourceCheck([{provider:'gmail',enabled:true,nextAt:10},{provider:'google-calendar',enabled:true,nextAt:1}],['gmail','google-calendar'],20)?.provider,'google-calendar');
assert.equal(rows.find(r=>r.key==='youtube')?.mode,'website');
console.log(`PASS ${rows.length} Applet contracts; 1,000-message checkpoint/restart, optional Attention, stable Calendar paging and fair scheduling`);
// Author declarations drive the same read/checkpoint contract consumed by hosts.
const v2=JSON.parse(readFileSync('ui/applets/gmail/runtime.json','utf8'));
assert.equal(v2.version,2);
assert.deepEqual(validateAppletRuntimes([v2])[0],mail);
const changed=structuredClone(v2);changed.tasks[0].intervalMinutes=45;
changed.tasks.forEach((t:any)=>t.batchSize=7);
const compiled=validateAppletRuntimes([changed])[0];
assert.equal(compiled.intervalMinutes,45);
assert.equal(appletReadPlan(changed,{initialComplete:true},now).limit,7);
const invalid=structuredClone(v2);invalid.tasks[0].handler='shell.exec';
assert.throws(()=>validateAppletRuntimes([invalid]));
const duplicate=structuredClone(v2);duplicate.tasks.push({...duplicate.tasks[0]});
assert.throws(()=>validateAppletRuntimes([duplicate]));
const wrongLane=structuredClone(v2);wrongLane.tasks[1].pool='interactive';
assert.throws(()=>validateAppletRuntimes([wrongLane]));
const noAnalysis=structuredClone(v2);noAnalysis.tasks=noAnalysis.tasks.slice(0,1);
assert.equal(validateAppletRuntimes([noAnalysis])[0].analysis,'structured');
assert.deepEqual(validateAppletRuntimes([mail])[0],mail,'v1 runtime compatibility');
console.log('PASS v2 task compilation, policy edits, trusted handlers and v1 compatibility');
const timed=structuredClone(v2);timed.tasks[0].timeoutSeconds=45;timed.tasks[1].timeoutSeconds=90;
const timedSpec=validateAppletRuntimes([timed])[0];
assert.equal(timedSpec.syncTimeoutSeconds,45);assert.equal(timedSpec.analysisTimeoutSeconds,90);
for(const value of [0,14,601,1.5,'90']){const bad=structuredClone(timed);bad.tasks[0].timeoutSeconds=value;assert.throws(()=>validateAppletRuntimes([bad]));}

const independent=structuredClone(v2);independent.tasks[1].batchSize=3;independent.tasks[1].highWaterMark=60;
const policy=validateAppletRuntimes([independent])[0];
assert.equal(policy.pageSize,20);assert.equal(policy.analysisBatchSize,3);assert.equal(policy.analysisHighWaterMark,60);
assert.equal(appletReadPlan(independent,{initialComplete:true},now).limit,20);
for(const size of [0,21,1.5]){const bad=structuredClone(independent);bad.tasks[1].batchSize=size;assert.throws(()=>validateAppletRuntimes([bad]));}
for(const cap of [19,1001,1.5]){const bad=structuredClone(independent);bad.tasks[1].highWaterMark=cap;assert.throws(()=>validateAppletRuntimes([bad]));}
console.log('PASS independent analysis batches and bounded declarative backpressure');

for(const reader of ['shell.exec','missing-handler',''])assert.throws(()=>validateAppletRuntimes([{...mail,reader}]));
assert.throws(()=>validateAppletRuntimes([{...mail,initialLimit:0}]));
const website=rows.find(r=>r.key==='youtube')!;
assert.throws(()=>appletReadPlan(website,{},now),'website must not enter scheduled collection');
const first=appletReadPlan(mail,{},now);
assert.equal(first.limit,5);
assert.throws(()=>finishAppletPage(mail,{},first,{scannedCount:6},now),'receipt cannot exceed the requested first page');
assert.throws(()=>finishAppletPage(mail,{}, {...first,provider:'notion'},{scannedCount:1},now));
const last=appletReadPlan(mail,{pageToken:'last',scanned:999,startedAt:now,query:'in:anywhere'},now);
assert.equal(last.limit,1);
assert.throws(()=>finishAppletPage(mail,{},last,{scannedCount:2},now),'initial cap cannot be exceeded by an oversized receipt');
console.log('PASS scheduled handler admission and request-sized page receipt bounds');

// Bad package policy must fail before either host admits jobs.
for(const bad of [null,[],{...v2,version:3},{...v2,intervalMinutes:30},{...v2,permissions:['all']},{...mail,key:123},{...mail,provider:''}])assert.throws(()=>validateAppletRuntimes([bad] as any));
for(const patch of [{intervalMinute:30},{handler:'shell.exec'},{trigger:'startup'}]){
 const bad=structuredClone(v2);Object.assign(bad.tasks[0],patch);assert.throws(()=>validateAppletRuntimes([bad]));
}
for(const patch of [{tasks:[]},{intervalMinutes:30},{analysis:'source-small'},{publishAttention:true},{reader:'shell.exec'}])assert.throws(()=>validateAppletRuntimes([{...website,...patch}] as any));
assert.throws(()=>validateAppletRuntimes({} as any));
console.log('PASS strict package versions, identity, task fields and background capability admission');
