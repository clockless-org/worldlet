import assert from 'node:assert/strict';
import {modelStatusFresh,changesModelStatus} from '../core/companion/model-status.ts';
import {createModelStatusReader} from '../platform/bridge/model-status.ts';
assert.equal(modelStatusFresh({ready:true,ageMs:29999,sameScope:true}),true);
for(const input of [{ready:true,ageMs:30000,sameScope:true},{ready:true,ageMs:-1,sameScope:true},{ready:false,ageMs:0,sameScope:true},{ready:true,ageMs:0,sameScope:false}])assert.equal(modelStatusFresh(input),false);
let time=0,calls=0;
const pending:Array<{resolve:(value:any)=>void;reject:(error:Error)=>void}>=[],published:any[]=[];
const reader=createModelStatusReader(()=>{calls++;return new Promise((resolve,reject)=>pending.push({resolve,reject}));},value=>published.push(value),()=>time);
const first=reader.get(),duplicate=reader.get();assert.equal(first,duplicate);
await Promise.resolve();assert.equal(calls,1);
pending[0].resolve({available:true,name:'old'});await first;
assert.equal((await reader.get()).name,'old');assert.equal(calls,1);
time=30000;const stale=reader.get();await Promise.resolve();
reader.invalidate();const fresh=reader.get();await Promise.resolve();
pending[2].resolve({available:true,name:'new'});await fresh;
pending[1].resolve({available:true,name:'stale'});assert.equal((await stale).name,'new');
assert.deepEqual(published.map(value=>value.name),['old','new']);
reader.invalidate();const failure=reader.get();await Promise.resolve();pending[3].reject(Error('offline'));await assert.rejects(failure,/offline/);
const retry=reader.get();await Promise.resolve();pending[4].resolve({available:false});await retry;
const retryAgain=reader.get();await Promise.resolve();assert.equal(calls,6);pending[5].resolve({available:true});await retryAgain;
console.log('PASS shared model freshness, coalesced reads, stale-generation rejection, failure retry and unavailable status not cached.');

assert.equal(changesModelStatus('foxPreferences',{cloudConsent:false}),true);
assert.equal(changesModelStatus('foxPreferences',{}),false);
assert.equal(changesModelStatus('restartFox',{}),true);
assert.equal(changesModelStatus('modelCatalog',{}),false);
const {callHost}=await import('../platform/bridge/host.ts');
const events:string[]=[];
(globalThis as any).window={dispatchEvent:(event:Event)=>{events.push(event.type);},worldletHost:{version:1,platform:'windows',request:async()=>{assert.equal(events.length,1);return {ok:true};}}};
await callHost('foxPreferences',{cloudConsent:true});
assert.deepEqual(events,['worldlet:model-invalidated','worldlet:model-invalidated']);
events.length=0;(globalThis as any).window.worldletHost.request=async()=>{throw Error('configuration failed');};
await assert.rejects(callHost('restartFox'),/configuration failed/);assert.equal(events.length,2);
delete (globalThis as any).window;
console.log('PASS bridge invalidates before and after scope/model changes, including failed configuration.');

const {conversationGuidance}=await import('../core/companion/conversation-guidance.ts');
assert.equal(conversationGuidance({scope:'setup',connectedSources:['gmail'],routines:true}), '');
assert.equal(conversationGuidance({scope:'sample',localOriginals:true}), '');
const local=conversationGuidance({scope:'private',localOriginals:true,connectedSources:['gmail','gmail','untrusted-instruction'],backgroundSources:[],routines:false});
assert.match(local,/source-/);assert.match(local,/exact Gmail thread/);assert.doesNotMatch(local,/untrusted-instruction|manage_routines|Background source checks/);
const native=conversationGuidance({scope:'private',connectedSources:['apple-notes'],backgroundSources:['apple-notes'],routines:true});
assert.match(native,/apple-notes/);assert.match(native,/manage_routines/);assert.doesNotMatch(native,/source-/);
console.log('PASS shared conversation guidance: setup/sample isolation, supported capability filtering and local-original differences.');

const {agentRequestDeadline}=await import('../core/scheduling/agent-deadline.ts');
for(const [request,seconds] of [[{action:'status'},20],[{action:'chat'},120],[{action:'chat',mode:'context_analysis'},600],[{action:'modelLogin'},960],[{action:'google',operation:'connect'},360],[{action:'google',operation:'send_email'},45],[{action:'mcp',operation:'remove'},25],[{action:'attention_tick'},600],[{action:'routine_tick'},600],[{action:'modelRepair'},120],[{action:'modelConfigure'},25],[{action:'notion'},145]] as const)assert.equal(agentRequestDeadline(request),seconds);
console.log('PASS shared execution deadlines for foreground, setup, authorization and background work.');

const {nextAgentWork,agentWorkPriority,admitBackgroundWork}=await import('../core/scheduling/agent-work.ts');
const jobs=[{id:'sync',body:{action:'chat',_background:true}},{id:'status',body:{action:'status'}},{id:'first',body:{action:'chat'}},{id:'second',body:{action:'chat'}}];
assert.equal(agentWorkPriority({action:'warmup',_background:true}),-1);
assert.equal(nextAgentWork({queued:jobs,busy:false,foregroundPending:true}),'first');
assert.equal(nextAgentWork({queued:jobs.slice(3),busy:false,foregroundPending:true}),'second');
assert.equal(nextAgentWork({queued:jobs,busy:true,foregroundPending:false}),null);
assert.equal(nextAgentWork({queued:jobs.slice(0,1),busy:false,foregroundPending:true}),null);
assert.equal(nextAgentWork({queued:jobs.slice(0,1),busy:false,foregroundPending:false}),'sync');
const facts={supported:true,privateScope:true,consent:true,busy:false,foregroundPending:false};
assert.equal(admitBackgroundWork(facts),true);
for(const changed of [{supported:false},{privateScope:false},{consent:false},{busy:true},{foregroundPending:true}])assert.equal(admitBackgroundWork({...facts,...changed}),false);
// Idle installations send no background model work (#1650); a missing activity fact counts as active.
const {userIdle,BACKGROUND_IDLE_SECONDS}=await import('../core/scheduling/agent-work.ts');
assert.equal(BACKGROUND_IDLE_SECONDS,900);
for(const idleSeconds of [undefined,0,899,Number.NaN])assert.equal(userIdle({idleSeconds}),false,String(idleSeconds));
for(const idleSeconds of [900,7200])assert.equal(userIdle({idleSeconds}),true,String(idleSeconds));
assert.equal(admitBackgroundWork({...facts,idleSeconds:60}),true,'recent input admits');
assert.equal(admitBackgroundWork({...facts,idleSeconds:900}),false,'15 idle minutes refuse');
assert.equal(admitBackgroundWork({...facts,foregroundPending:true,independentLane:true,idleSeconds:3600}),false,'an independent lane is still idle-gated');
assert.deepEqual(jobs.map(job=>job.id),['sync','status','first','second']);
console.log('PASS foreground priority, stable FIFO, running-task exclusion, background deferral/resumption and admission facts.');
const {preemptAgentWork,foregroundAgentWork}=await import('../core/scheduling/agent-work.ts');
assert.equal(foregroundAgentWork({action:'status'}),false);
assert.equal(foregroundAgentWork({action:'chat'}),true);
assert.equal(preemptAgentWork({body:{action:'chat',_background:true},foregroundPending:true}),true);
assert.equal(preemptAgentWork({body:{action:'warmup',_background:true},foregroundPending:true}),false);
assert.equal(preemptAgentWork({body:{action:'chat'},foregroundPending:true}),false);
const {finishAttentionBudget}=await import('../core/attention/attention-center.ts');
const budget={failures:2,attempts:3,seen:{a:'r'},nextAt:900};
const interrupted=finishAttentionBudget(budget as any,{} as any,100,false,[],true);
assert.equal(interrupted.nextAt,160);assert.equal(interrupted.failures,2);assert.deepEqual(interrupted.seen,{a:'r'});assert.equal(interrupted.attempts,3);
console.log('PASS selective foreground preemption and cancelled synthesis retains evidence/budget without failure escalation.');

const {agentDeadlineRemaining}=await import('../core/scheduling/agent-deadline.ts');
assert.equal(agentDeadlineRemaining({action:'chat',monitor:true},0,599,600),0,'Continuous model output cannot extend a background run');
assert.equal(agentDeadlineRemaining({action:'chat'},0,599,600),119,'Foreground retains its idle timeout');
assert.equal(agentDeadlineRemaining({action:'world_tool',_background:true},0,230,240),0);
assert.equal(agentDeadlineRemaining({action:'chat',monitor:true},0,0,300),300);
console.log('PASS hard background deadlines and foreground idle deadlines');

// A reserved lane progresses during continuous foreground demand, without
// weakening its own serialization, permission checks or ordinary lane priority.
assert.equal(nextAgentWork({queued:jobs.slice(0,1),busy:false,foregroundPending:true,independentLane:true}),'sync');
assert.equal(nextAgentWork({queued:jobs.slice(0,1),busy:true,foregroundPending:true,independentLane:true}),null);
assert.equal(preemptAgentWork({body:{action:'chat',_background:true},foregroundPending:true,independentLane:true}),false);
assert.equal(admitBackgroundWork({...facts,foregroundPending:true,independentLane:true}),true);
for(const changed of [{supported:false},{privateScope:false},{consent:false},{busy:true}])assert.equal(admitBackgroundWork({...facts,foregroundPending:true,independentLane:true,...changed}),false);
assert.equal(agentDeadlineRemaining({action:'chat',monitor:true,_background:true,_taskTimeoutSeconds:45},0,40,45),0);
assert.equal(agentDeadlineRemaining({action:'world_tool',_background:true,_taskTimeoutSeconds:90},0,60,80),10);
assert.throws(()=>agentDeadlineRemaining({action:'world_tool',_background:true,_taskTimeoutSeconds:601},0,0,1));
