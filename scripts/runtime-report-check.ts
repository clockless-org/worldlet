import assert from 'node:assert/strict';
import {runtimeTaskReport} from '../core/scheduling/runtime-report.ts';
const row={id:'applet:gmail:analyze',ownerId:'gmail',pool:'source-analysis',status:'waiting',waitReason:'retry_at',nextAt:100,lastSuccessAt:50,text:'private',account:'private@example.com',error:'private error'};
let report=runtimeTaskReport({tasks:[row],checks:[{provider:'gmail',enabled:false}],deliveries:[{consumerId:'attention:center',provider:'gmail',status:'pending'}]});
assert.equal(report.rows[0].status,'paused');
assert.equal(report.rows[0].pendingDeliveries,1);
assert.equal(report.rows[0].lastSuccessAt,50);
assert.equal(JSON.stringify(report).includes('private'),false);
report=runtimeTaskReport({tasks:[{...row,ownerId:'private@example.com'}]});
assert.equal(report.rows.length,0);
console.log('PASS task report state, pause, counts and privacy allowlist');
report=runtimeTaskReport({tasks:[{...row,ownerId:'attention-center'}],deliveries:[{consumerId:'attention:center',status:'quarantined'},{consumerId:'other',status:'quarantined'}]});
assert.equal(report.rows[0].quarantinedDeliveries,1);

report=runtimeTaskReport({now:500,tasks:[],checks:[{provider:'gmail',enabled:true}],analysis:[{provider:'gmail',pending:120}],deliveries:[{consumerId:'attention:center',provider:'gmail',status:'pending',createdAt:320},{consumerId:'other',provider:'gmail',status:'pending',createdAt:1}]});
assert.deepEqual(report.rows.map(row=>row.id),['applet:gmail:check','applet:gmail:analyze','attention:center']);
assert.equal(report.rows[1].pendingAnalysis,120);
assert.equal(report.rows[0].pendingDeliveries,1);
assert.equal(report.rows[2].oldestPendingSeconds,180);
assert.equal(report.rows[2].status,'queued');
console.log('PASS never-claimed task visibility, full backlog and isolated Center delivery age');

const run={id:'run',taskId:row.id,status:'failed',startedAt:100,finishedAt:145,errorCode:'offline',text:'secret',account:'private@example.com'};
report=runtimeTaskReport({tasks:[row],runs:[run],now:200});
assert.equal(report.rows[0].execution?.durationSeconds,45);
assert.equal(report.rows[0].execution?.errorCode,'offline');
assert.ok(!JSON.stringify(report).includes('secret'));assert.ok(!JSON.stringify(report).includes('private@example.com'));
report=runtimeTaskReport({tasks:[{...row,status:'running',runId:'run'}],runs:[{...run,status:'running',finishedAt:undefined,deadlineAt:300,errorCode:'private@example.com'}],now:200});
assert.equal(report.rows[0].execution?.durationSeconds,100);assert.equal(report.rows[0].execution?.deadlineRemainingSeconds,100);
assert.equal(report.rows[0].execution?.errorCode,null);
report=runtimeTaskReport({tasks:[{...row,status:'running',runId:'other'}],runs:[run],now:200});
assert.equal(report.rows[0].execution,null,'Do not present an old run as current execution');

const pending=[{consumerId:'attention:center',provider:'gmail',status:'pending',createdAt:90}];
report=runtimeTaskReport({tasks:[],deliveries:pending,now:100,budget:{day:0,attempts:240,nextAt:95}});
assert.equal(report.rows[0].status,'waiting');
assert.equal(report.rows[0].waitReason,'model_budget');
assert.equal(report.rows[0].nextAt,86400);
assert.deepEqual(report.rows[0].consumerBudget,{attempts:240,limit:240});
report=runtimeTaskReport({tasks:[],deliveries:pending,now:86400,budget:{day:0,attempts:240,nextAt:95}});
assert.equal(report.rows[0].status,'queued');
assert.equal(report.rows[0].waitReason,null);
assert.equal(report.rows[0].consumerBudget.attempts,0);
console.log('PASS Center daily admission and inspector reset agree');

const backlogInput={now:500,tasks:[{id:'applet:gmail:check',ownerId:'gmail',pool:'source-io',status:'waiting',waitReason:'retry_at'}],checks:[{provider:'gmail',enabled:true,nextAt:400}],analysis:[{provider:'gmail',pending:100,highWaterMark:100}]};
report=runtimeTaskReport(backlogInput);
assert.equal(report.rows[0].waitReason,'analysis_backlog');assert.equal(report.rows[0].nextAt,null);
assert.equal(report.rows[0].analysisHighWaterMark,100);
report=runtimeTaskReport({...backlogInput,analysis:[{provider:'gmail',pending:99,highWaterMark:100}]});
assert.equal(report.rows[0].waitReason,'retry_at');assert.equal(report.rows[0].nextAt,400);
report=runtimeTaskReport({...backlogInput,checks:[{provider:'gmail',enabled:false}]});
assert.equal(report.rows[0].status,'paused');assert.notEqual(report.rows[0].waitReason,'analysis_backlog');
report=runtimeTaskReport({...backlogInput,tasks:[{...backlogInput.tasks[0],status:'running'}]});
assert.equal(report.rows[0].status,'running');assert.notEqual(report.rows[0].waitReason,'analysis_backlog');
console.log('PASS actual source backpressure is visible without overriding running or paused tasks');

for(const code of ['lease_expired','generation_changed']){
 const result=runtimeTaskReport({tasks:[row],runs:[{...run,status:'interrupted',errorCode:code}],now:200});
 assert.equal(result.rows[0].execution?.errorCode,code);
}
