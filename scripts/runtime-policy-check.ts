import assert from 'node:assert/strict';
import {runtimeFailure,analysisPlan,nextSourceWake,sourceReadProviders} from '../core/scheduling/runtime-policy.ts';
const now=1800000000;
assert.equal(runtimeFailure({now,failures:0,message:'network offline private@example.com'}).waitReason,'network');
assert.equal(runtimeFailure({now,failures:0,message:'401 Unauthorized'}).waitReason,'authorization');
assert.equal(runtimeFailure({now,failures:0,message:'429 rate limit'}).waitReason,'rate_limit');
const quota=runtimeFailure({now,failures:0,message:'worldlet_daily_allowance'});
assert.equal(quota.waitReason,'model_budget');assert.ok(quota.nextAt!>now+900);
assert.equal(runtimeFailure({now,failures:9,message:'failed'}).nextAt,now+900);
assert.equal(runtimeFailure({now,failures:4,cancelled:true}).failures,4);
assert.deepEqual(runtimeFailure({now,failures:2,message:'Source changed during analysis; retry the current revision.'}),{code:'source_changed',waitReason:'retry_at',nextAt:now+5,failures:2});
assert.ok(!JSON.stringify(runtimeFailure({now,failures:0,message:'private@example.com failed'})).includes('private'));
const candidates=[{provider:'gmail',pending:20},{provider:'notion',pending:3}],tasks=[{id:'applet:gmail:analyze',nextAt:now+600}];
assert.equal(analysisPlan({candidates,tasks,now,foreground:false}).provider,'notion');
assert.equal(analysisPlan({candidates,tasks,now,foreground:true}).waitSeconds,1);
assert.equal(analysisPlan({candidates:candidates.slice(0,1),tasks,now,foreground:false}).waitSeconds,60);
assert.equal(analysisPlan({candidates:[],tasks,now,foreground:false}).waitSeconds,null);
console.log('PASS typed retry, quota reset, bounded backoff, cancellation and fair analysis admission');

assert.equal(nextSourceWake([{enabled:true,nextAt:now+5}],now),5);
assert.equal(nextSourceWake([{enabled:true,nextAt:now-100}],now),5);
assert.equal(nextSourceWake([{enabled:false,nextAt:now}],now),60);
assert.equal(nextSourceWake([{enabled:true,nextAt:now+30}],now),30);

assert.deepEqual(sourceReadProviders(['gmail','google-calendar'],['gmail']),['google-calendar']);
assert.deepEqual(sourceReadProviders(['notion'],['gmail','google-calendar']),[]);

assert.equal(analysisPlan({candidates,tasks,now,foreground:true,independentLane:true}).provider,'notion');
assert.equal(analysisPlan({candidates:candidates.slice(0,1),tasks,now,foreground:true,independentLane:true}).waitSeconds,60);

const pressure=runtimeFailure({message:'Attention delivery capacity reached; retry after pending context is consumed.',now,failures:2});
assert.equal(pressure.waitReason,'resource');assert.equal(pressure.nextAt,now+5);assert.equal(pressure.failures,2);

for(const message of ['Please reconnect Gmail','Authorization expired','Permission denied: grant access']){
 const failure=runtimeFailure({message,now,failures:0});
 assert.equal(failure.waitReason,'authorization');assert.equal(failure.nextAt,now+1800);
 assert.ok(!JSON.stringify(failure).includes(message));
}

const partial={message:'Applet analysis did not cover every supplied source record; retry remaining analysis.',now,failures:7};
assert.equal(runtimeFailure({...partial,madeProgress:true}).nextAt,now+5);
assert.equal(runtimeFailure({...partial,madeProgress:true}).failures,0);
assert.equal(runtimeFailure(partial).nextAt,now+900,'no-progress output retains backoff');
assert.equal(runtimeFailure({...partial,message:'worldlet_daily_allowance',madeProgress:true}).waitReason,'model_budget');
assert.equal(runtimeFailure({...partial,message:'Please reconnect Gmail',madeProgress:true}).waitReason,'authorization');
console.log('PASS partial progress continues promptly without bypassing quota or authorization');

// #1386: an operator pause keeps its hourly deadline through Applet scheduling.
for(const message of ['worldlet_model_paused','Worldlet model request failed: included AI is paused right now.']){
 assert.deepEqual(runtimeFailure({now,failures:0,message}),{code:'service_paused',waitReason:'model_budget',nextAt:now+3600,failures:1});
 assert.equal(runtimeFailure({now,failures:9,message}).nextAt,now+3600,'repeated pauses stay hourly');
 assert.equal(runtimeFailure({now,failures:0,message,madeProgress:true}).code,'service_paused');
}
assert.deepEqual(runtimeFailure({now,failures:3,message:'service_paused'}),{code:'service_paused',waitReason:'model_budget',nextAt:now+3600,failures:4},'restored code keeps the hourly wait');
assert.equal(runtimeFailure({now,failures:0,message:'worldlet_service_credits'}).nextAt,now+900);
assert.equal(runtimeFailure({now,failures:0,message:'update_required'}).nextAt,now+21600);
assert.equal(runtimeFailure({now,failures:0,message:'constructor'}).code,'operation_failed');
assert.equal(runtimeFailure({now,failures:0,message:'model_allowance'}).code,'operation_failed','allowance reset time is not recoverable from the code');
{
 const {claimRuntimeTask,finishRuntimeTask}=await import('../core/scheduling/runtime-tasks.ts');
 const claim=claimRuntimeTask({task:undefined,taskId:'applet:gmail:analyze',ownerId:'gmail',pool:'source-analysis',generation:0,runId:'paused-1',now,leaseSeconds:660})!;
 const decided=runtimeFailure({now,failures:0,message:'worldlet_model_paused'});
 const saved=finishRuntimeTask({...claim,now,generation:0,status:'failed',nextAt:decided.nextAt,errorCode:decided.code,waitReason:decided.waitReason,failures:decided.failures})!.task;
 assert.equal(saved.nextAt,now+3600);
 const restored=JSON.parse(JSON.stringify(saved)),gmail=[{provider:'gmail',pending:5}];
 assert.equal(analysisPlan({candidates:gmail,tasks:[restored],now:now+1800,foreground:false,independentLane:true}).provider,null,'no retry before the deadline after restart');
 assert.equal(analysisPlan({candidates:gmail,tasks:[restored],now:now+3600,foreground:false,independentLane:true}).provider,'gmail','retries once the hour passes');
}
console.log('PASS included-model pause keeps the hourly retry through repeated failures and restart');

const {claimRuntimeTask,finishRuntimeTask}=await import('../core/scheduling/runtime-tasks.ts');
const fairTasks:any[]=[],order:string[]=[];
for(let i=0;i<8;i++){
 const clock=now+i*10,provider=analysisPlan({candidates,tasks:fairTasks,now:clock,foreground:false}).provider!;
 order.push(provider);
 const claim=claimRuntimeTask({task:fairTasks.find(t=>t.ownerId===provider),taskId:`applet:${provider}:analyze`,ownerId:provider,pool:'source-analysis',generation:0,runId:`slice-${i}`,now:clock,leaseSeconds:30})!;
 assert.equal(claim.task.lastStartedAt,clock);
 const settled=finishRuntimeTask({...claim,now:clock+1,generation:0,status:'yielded',nextAt:clock+5})!;
 const index=fairTasks.findIndex(t=>t.ownerId===provider);
 if(index<0)fairTasks.push(settled.task);else fairTasks[index]=settled.task;
}
assert.deepEqual(order,['gmail','notion','gmail','notion','gmail','notion','gmail','notion']);
assert.ok(fairTasks.every(t=>t.lastSuccessAt===undefined),'fairness must not fake completion');
assert.equal(analysisPlan({candidates,tasks:[{id:'applet:gmail:analyze',lastStartedAt:now,lastSuccessAt:0},{id:'applet:notion:analyze',lastSuccessAt:now-100}],now:now+5,foreground:false}).provider,'notion','legacy success time remains a fallback');
console.log('PASS repeated yielded slices rotate fairly without pretending successful completion');

const {runtimeTaskLease,runtimeRunPrune}=await import('../core/scheduling/index.ts');
const {invoke}=await import('../core/index.ts');
assert.equal(runtimeTaskLease({taskId:'applet:mail:check'}),300);
assert.equal(runtimeTaskLease({taskId:'applet:mail:analyze'}),660);
assert.equal(runtimeTaskLease({taskId:'attention'}),660);
assert.equal(runtimeTaskLease({taskId:'applet:mail:check',spec:{syncTimeoutSeconds:30}}),90);
assert.equal(runtimeTaskLease({taskId:'applet:mail:analyze',spec:{analysisTimeoutSeconds:120}}),180);
assert.throws(()=>runtimeTaskLease({taskId:'a:check',spec:{syncTimeoutSeconds:-1}}));
const history=Array.from({length:105},(_,i)=>({id:`run-${i}`,taskId:'mail',status:'succeeded',startedAt:i}));
const original=JSON.stringify(history);
const rows=[...history,{id:'live',taskId:'mail',status:'running',startedAt:-1},{id:'other',taskId:'calendar',status:'failed',startedAt:-2}];
assert.deepEqual(runtimeRunPrune({taskId:'mail',runs:rows}),['run-4','run-3','run-2','run-1','run-0']);
assert.equal(JSON.stringify(history),original,'policy must not mutate the ledger snapshot');
assert.deepEqual(runtimeRunPrune({taskId:'mail',runs:history.slice(0,100)}),[]);
assert.deepEqual(JSON.parse(invoke('runtimeRunPrune',JSON.stringify({taskId:'mail',runs:rows}))).value,['run-4','run-3','run-2','run-1','run-0']);
assert.deepEqual(JSON.parse(invoke('runtimeTaskLease',JSON.stringify({taskId:'a:check',spec:{syncTimeoutSeconds:30}}))),{ok:true,value:90});
console.log('PASS shared lease and bounded history preserve live/foreign runs through native JSON boundary');
