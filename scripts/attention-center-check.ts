import {attentionWhen} from '../ui/attention/matter-copy.ts';
import {processedAttentionContent} from '../core/attention/attention-content.ts';
import {finishSourceCheck,startSourceCheck} from '../core/tasks/source-checks.ts';
import {interruptsBackground} from '../core/tasks/background-work.ts';
import assert from 'node:assert/strict';
import {APP_DEFINITIONS} from '../core/applets/catalog.ts';
import {attentionCompletion,attentionPlanCurrent,discardedAttentionRemovals,matchingAttentionID,observeAttention,attentionDependencies,attentionCurrent,projectAttention,planAttention,startAttentionBudget,finishAttentionBudget,suppressedAttention,weatherObservationText,validateAttentionRegistrations,ATTENTION_BACKLOG_SECONDS,ATTENTION_COALESCE_SECONDS,ATTENTION_FULL_SEEDS} from '../core/attention/attention-center.ts';
import {updateWorldItem} from '../core/items/world-item-state.ts';
import type {AttentionRegistration,AttentionFact,AttentionBudget} from '../contracts/attention.ts';
const now=Date.parse('2026-09-24T12:00:00Z')/1000;
const registration=(provider:string):AttentionRegistration=>({version:1,provider,reader:'source-reader',intervalMinutes:30,freshnessMinutes:120});
assert.equal(validateAttentionRegistrations(APP_DEFINITIONS.flatMap(a=>a.attention?[a.attention]:[])).length,7);
assert.throws(()=>validateAttentionRegistrations([registration('gmail'),registration('gmail')]));
// Weather drift keeps the prior text (same revision, no model pass); a new condition or a 3° move publishes.
const sunny=weatherObservationText('Sunny',18.4);
assert.equal(sunny,'Current weather: Sunny, 18°. This is not a forecast.');
assert.equal(weatherObservationText('Sunny',20.4,sunny),sunny);
assert.equal(weatherObservationText('Sunny',21,sunny),'Current weather: Sunny, 21°. This is not a forecast.');
assert.equal(weatherObservationText('Light rain',18,sunny),'Current weather: Light rain, 18°. This is not a forecast.');
assert.equal(weatherObservationText('Sunny',-1.6,'No current weather observation.'),'Current weather: Sunny, -2°. This is not a forecast.');
assert.equal(weatherObservationText('Sunny',-3,'Current weather: Sunny, -1°. This is not a forecast.'),'Current weather: Sunny, -1°. This is not a forecast.');
let facts:AttentionFact[]=[];
const event={id:'stable-occurrence',sourceId:'event:10am',title:'Tennis practice',text:'Practice tennis at 10 AM.',attributes:{start:'2026-09-26T10:00:00Z',end:'2026-09-26T11:00:00Z'}};
facts=observeAttention(facts,registration('google-calendar'),[event],now);
const first={kind:'event',attentionContentVersion:1,attentionDependencies:[{id:facts[0].id,revision:facts[0].revision}]};
const repeat=observeAttention(facts,registration('google-calendar'),[event],now+60);
assert.equal(repeat[0].revision,facts[0].revision,'unchanged reads preserve dependency version');
const moved=observeAttention(repeat,registration('google-calendar'),[{...event,sourceId:'event:11am',attributes:{start:'2026-09-26T11:00:00Z',end:'2026-09-26T12:00:00Z'}}],now+120);
assert.equal(moved[0].id,facts[0].id,'rescheduling retains the fact key');
assert.equal(projectAttention([{...first,status:'open'}],moved,now,['google-calendar'])[0].status,'candidate','old evidence stops signaling immediately');
const cancelled=observeAttention(moved,registration('google-calendar'),[{...event,removed:true}],now+180);
assert.ok(cancelled[0].removed,'cancellation marks the fact removed instead of signaling');
assert.equal(observeAttention(moved,registration('google-calendar'),[],now+180).length,1,'partial or empty reads are not deletion');

// Tennis is a fixture of a generic multi-source evaluator contract, never a production tennis rule.
facts=observeAttention(facts,registration('gmail'),[{id:'sam-thread',title:'Sam and tennis',text:'I am back in town. We should play tennis soon.'}],now);
facts=observeAttention(facts,registration('weather'),[{id:'forecast',title:'Saturday tennis forecast',text:'Saturday forecast: clear at Riverside.'}],now);
facts=observeAttention(facts,registration('courts'),[{id:'court-2',title:'Riverside tennis',text:'Court 2 available Saturday at 10 AM. Not booked.'}],now);
const providers=['google-calendar','gmail','weather','courts'];
const proposal={attentionContentVersion:1,provider:'gmail',kind:'task',title:'Tennis with Sam',context:'Consider a Saturday game.',summary:'Sam’s availability and your free time still need confirmation.',sources:[{provider:'gmail',id:'sam-thread',quote:'We should play tennis soon.'},{provider:'weather',id:'forecast',quote:'Saturday forecast: clear at Riverside.'},{provider:'courts',id:'court-2',quote:'Court 2 available Saturday at 10 AM.'}]};
const dependencies=attentionDependencies(proposal,facts);
const item={...proposal,id:'tennis',status:'open',attentionDependencies:dependencies};
assert(attentionCurrent(dependencies,facts,now,providers));
const plan=planAttention(facts,{},now,providers,[item])!;assert(plan.facts.length>=4);
const seedProviders=(p:typeof plan)=>new Set(p.seeds.map(seed=>p.facts.find(f=>f.id===seed.id)!.provider));
assert.equal(seedProviders(plan).size,1,'one provider per seed batch; related context still spans Applets');
assert(new Set(plan.facts.map(f=>f.provider)).size>=3,'cross-source context survives provider-scoped seeds');
let budget:AttentionBudget=startAttentionBudget({},now);
budget=finishAttentionBudget(budget,plan,now+1,true,facts);
assert.equal(budget.nextAt,now+6,'a new account\'s first passes follow quickly so Mail is not held behind Calendar');
assert.equal(finishAttentionBudget({...budget,attempts:4},plan,now+1,true,facts).nextAt,now+31,'later passes coalesce bursts');
// Later passes wait for a burst (S releases Mail five records at a time) unless a full batch is ready.
{
 const later={...finishAttentionBudget({...budget,attempts:4},plan,now+1,true,facts),seen:Object.fromEntries(facts.map(f=>[f.id,f.revision]))};
 assert.equal(later.coalesceUntil,now+1+ATTENTION_COALESCE_SECONDS);
 assert.equal(budget.coalesceUntil,0,'the day\'s first passes never wait for a burst');
 const one=observeAttention(facts,registration('gmail'),[{id:'new-1',title:'Invoice due',text:'Invoice 42 is due October 9.'}],now+40);
 assert.equal(planAttention(one,later,now+40,providers,[item]),null,'a partial batch waits for the rest of the burst');
 assert.ok(planAttention(one,later,now+1+ATTENTION_COALESCE_SECONDS,providers,[item]),'then runs');
 const burst=observeAttention(facts,registration('gmail'),Array.from({length:ATTENTION_FULL_SEEDS},(_,i)=>({id:'burst-'+i,title:'Invoice '+i,text:'Invoice '+i+' is due October 9.'})),now+40);
 assert.equal(planAttention(burst,later,now+40,providers,[item])!.seeds.length,ATTENTION_FULL_SEEDS,'a full batch never waits');
}
// A first Mail scan (#1720): S analysis publishes a record or two per batch for hours. Without the
// backlog hold every coalescing window ended in a partial M pass. Bound the passes for the whole scan.
{
 const scan=(backlogAware:boolean)=>{
  const mail=registration('gmail'),start=now+86400,batches=257,every=45,run=60;
  let facts:AttentionFact[]=[],budget:AttentionBudget={},passes=0,first=Infinity,published=0,runningUntil=-1,current:ReturnType<typeof planAttention>=null,done=start;
  for(let clock=start;clock<start+batches*every+3600;clock++){
   const offset=clock-start;
   if(offset%every===0&&offset/every<batches){
    // S candidates come from about one record in three, released together with their batch.
    const count=[0,1,2,0,1][(offset/every)%5];
    if(count)facts=observeAttention(facts,mail,Array.from({length:count},(_,i)=>({id:'scan-'+(published+i),title:'Thread '+(published+i),text:'Invoice '+(published+i)+' is due October 9.'})),clock);
    published+=count;
   }
   if(current&&clock>=runningUntil){budget=finishAttentionBudget(budget,current,clock,true,facts);current=null;}
   if(current||clock<(budget.nextAt||0))continue;
   const backlog=backlogAware&&offset<batches*every?['gmail']:[];
   const next=planAttention(facts,budget,clock,['gmail'],[],[],backlog);
   if(!next)continue;
   budget=startAttentionBudget(budget,clock);current=next;runningUntil=clock+run;passes++;first=Math.min(first,clock-start);done=clock+run;
  }
  const unseen=facts.filter(f=>budget.seen?.[f.id]!==f.revision).length;
  return {passes,first,published,unseen,drained:done-(start+(batches-1)*every)};
 };
 const before=scan(false),after=scan(true);
 assert.equal(after.unseen,0,'every finding of the scan still reaches the Center');
 assert.equal(after.first,before.first,'the first finding is not delayed');
 assert.ok(after.drained<=ATTENTION_BACKLOG_SECONDS,'the rest runs soon after the backlog drains');
 // A full batch per eight findings plus one partial pass per backlog window, plus the quick first passes.
 const bound=Math.ceil(after.published/ATTENTION_FULL_SEEDS)+Math.ceil(257*45/ATTENTION_BACKLOG_SECONDS)+3;
 assert.ok(after.passes<=bound,`first scan used ${after.passes} synthesis passes; bound ${bound}`);
 assert.ok(after.passes*2<=before.passes,`backlog hold at least halves first-scan passes (${before.passes} → ${after.passes})`);
 console.log(`PASS first scan of ${after.published} findings: ${before.passes} → ${after.passes} synthesis passes (bound ${bound})`);
}
// Every other provider's changes follow in their own passes after the cooldown.
let passes=1,clock=now+1;
for(let next=planAttention(facts,budget,clock+31,providers,[item]);next;next=planAttention(facts,budget,clock+31,providers,[item])){
 assert.equal(seedProviders(next).size,1);clock+=31;passes++;
 budget=finishAttentionBudget(startAttentionBudget(budget,clock),next,clock,true,facts);
}
assert.equal(passes,new Set(facts.map(f=>f.provider)).size,'each provider drains in its own bounded pass');
assert.equal(planAttention(facts,budget,clock+29,providers),null,'coalesce under the model cooldown');
// Unchanged observations do not cause another model pass after the cooldown.
assert.equal(planAttention(facts,budget,now+901,providers,[item]),null);
const rain=observeAttention(facts,registration('weather'),[{id:'forecast',title:'Forecast changed',text:'Storm warning. Outdoor courts closed.'}],now+1900);
assert(!attentionCurrent(dependencies,rain,now+1900,providers));
const changedPlan=planAttention(rain,budget,now+1900,providers,[item])!;
assert(changedPlan.facts.some(f=>f.provider==='gmail'),'changed dependencies retrieve the related matter even without matching words');
const dismissed=updateWorldItem(item,'dismissed','2026-09-24T12:01:00Z');
assert(suppressedAttention({...proposal,provider:'courts',title:'Play Saturday'},[dismissed]),'primary Applet changes cannot bypass user feedback');
// Two unrelated tasks may share context without sharing an obligation.
const delivery={...proposal,sources:[{provider:'gmail',id:'delivery-thread'},{provider:'weather',id:'forecast'}]};
assert(!suppressedAttention(delivery,[dismissed]),'weather overlap must not hide an unrelated task');
assert.equal(matchingAttentionID(delivery,[dismissed]),null,'context overlap must not inherit an old ID/status');
assert.equal(matchingAttentionID({...proposal,title:'Reworded',sources:proposal.sources.slice(0,1)},[dismissed]),'tennis','owning evidence preserves decisions through wording/context changes');
assert(!suppressedAttention({...delivery,provider:'weather'},[dismissed]),'owner changes require continuity of both owners');
assert(!suppressedAttention({...proposal,kind:'update'},[dismissed]),'different kinds do not share decisions');
assert(!suppressedAttention(proposal,[{...dismissed,statusOrigin:'agent'}]),'agent settlement can be reconsidered');
assert(!suppressedAttention({...proposal,provider:undefined},[dismissed]),'malformed ownership does not match');
const anotherObligation={...proposal,sources:[{provider:'gmail',id:'sam-thread',quote:'Please send the signed agreement.'}]};
assert(!suppressedAttention(anotherObligation,[dismissed]),'separate same-thread obligation must remain visible');
assert.equal(matchingAttentionID(anotherObligation,[dismissed]),null,'separate obligation must not inherit completed ID');
assert(suppressedAttention({...proposal,sources:[{provider:'gmail',remoteId:'sam-thread',id:'local-alias',quote:'  WE should play   tennis soon. '}]},[dismissed]),'whitespace/case or local alias changes retain exact evidence identity');
assert(!suppressedAttention({...proposal,sources:[{provider:'gmail',id:'sam-thread'}]},[dismissed]),'missing evidence must not suppress source-wide');
assert.equal(projectAttention([dismissed],rain,now+1900,providers)[0].status,'dismissed');
assert.equal(matchingAttentionID({...proposal,provider:'café',sources:[{...proposal.sources[0],provider:'café'}]},[{...dismissed,provider:'café',sources:[{...proposal.sources[0],provider:'café'}]}]),'tennis','canonically equivalent owner evidence matches like Swift');
const cjk=observeAttention(observeAttention([],registration('gmail'),[{id:'zh-1',title:'网球练习',text:'周六上午在河边打网球。'}],now),registration('notes'),[{id:'zh-2',title:'河边球场',text:'周六可以打网球。'}],now);
assert(cjk.every(f=>f.keys.includes('网球')),'Chinese text shares segmented keys, not whole-sentence runs');
assert.deepEqual(observeAttention([],registration('gmail'),[{id:'latin',title:'Riverside tennis',text:'Court available Saturday.'}],now)[0].keys,['available','court','riverside','saturday','tennis'],'space-delimited keys are unchanged');
assert.equal(projectAttention([{...item,status:'read',statusOrigin:'user'}],rain,now+1900,providers)[0].status,'candidate','read tasks also lose invalidated support');
assert(!attentionCurrent(dependencies,facts,now,['gmail']),'revoked source cannot support a composite');
const exhausted={day:Math.floor(now/86400),attempts:240};assert.equal(planAttention(facts,exhausted,now,providers),null);
const failed=finishAttentionBudget(startAttentionBudget({},now),plan,now,false,facts);
assert.equal(failed.nextAt,now+120);assert.equal(failed.seen,undefined,'failed passes never consume changes');
assert.throws(()=>attentionDependencies({...proposal,sources:[{provider:'gmail',id:'invented'}]},facts));
assert.throws(()=>observeAttention(facts,registration('gmail'),[{id:'x',text:'a'},{id:'x',text:'b'}],now));
{
 // Date-only provider days become the local calendar day with its offset, on every host.
 const day=observeAttention([],registration('google-calendar'),[{...event,id:'all-day',attributes:{start:'2026-10-03',end:'2026-10-04',allDay:true}}],now)[0];
 const offset=-new Date(2026,9,3).getTimezoneOffset();
 assert.match(day.attributes.start as string,/^2026-10-03T00:00:00[+-]\d\d:\d\d$/);
 assert.equal(new Date(day.attributes.start as string).getTime(),new Date(2026,9,3).getTime());assert.ok(Number.isFinite(offset));
 assert.equal(observeAttention([],registration('google-calendar'),[{...event,id:'timed',attributes:{start:'2026-10-03T09:00:00Z'}}],now)[0].attributes.start,'2026-10-03T09:00:00Z');
}
console.log('PASS attention registration, Calendar updates/cancellation, incremental Tennis dependencies, suppression, expiry, permissions and bounded synthesis budget.');

const timestamped=observeAttention([],registration('weather'),[{id:'current',text:'Clear',observedAt:now-7000}],now);
assert.equal(timestamped[0].expiresAt,now+200,'cached weather must not gain freshness when saved again');
const late=observeAttention(timestamped,registration('weather'),[{id:'current',text:'Older storm',observedAt:now-7100}],now);
assert.equal(late[0].text,'Clear','out-of-order observations cannot replace newer facts');

// The observation contract accepts 12k; do not silently discard evidence after 4k.
const {attentionReads}=await import('../core/attention/attention-reads.ts');
const reads=attentionReads('gmail');
assert.equal(reads.length,4);assert.equal(reads.reduce((n,r)=>n+r.limit,0),50);
assert.ok(reads.some(r=>r.query?.includes('90d')));
const longFact=observeAttention([],{version:1,provider:'gmail',reader:'source-reader',intervalMinutes:30,freshnessMinutes:1440},[{id:'late-date',text:'Intro '.repeat(800)+'Confirmed October 15',attributes:{partial:true}}],100);
assert.ok(longFact[0].text.includes('October 15'));assert.equal(longFact[0].attributes.partial,true);
console.log('PASS bounded mail search coverage and late-body evidence preservation');

const {attentionFailure}=await import('../core/attention/attention-failure.ts');
assert.equal(attentionFailure('The included model allowance for this day is used. It resets at 2026-09-27T00:00:00.000Z.',Date.parse('2026-09-26T20:00:00Z')/1000).nextAt,Date.parse('2026-09-27T00:00:00Z')/1000+5);
assert.deepEqual(attentionFailure('Private provider failure',100),{code:'synthesis_failed'});
console.log('PASS allowance retries wait for reset and diagnostics omit raw errors');

const completedHistory=observeAttention([],registration('gmail'),Array.from({length:20},(_,i)=>({id:'old-'+i,text:'Already completed',removed:true})),now);
const urgentCalendar=observeAttention(completedHistory,registration('google-calendar'),[{id:'today-conference',text:'Conference is confirmed',attributes:{start:new Date((now-3600)*1000).toISOString(),end:new Date((now+3600)*1000).toISOString()}}],now);
const currentPlan=planAttention(urgentCalendar,{},now,['gmail','google-calendar']);
assert.equal(currentPlan?.seeds.length,1);assert.equal(currentPlan?.facts[0].sourceId,'today-conference');
const cancellationPlan=planAttention(completedHistory,{},now,['gmail'],[{sources:[{provider:'gmail',id:'old-0'}]}]);
assert.equal(cancellationPlan?.seeds.length,1,'Cancellation of an existing matter must still be reviewed');
console.log('PASS current commitments outrank unrelated completed history; relevant cancellations survive');

const meetings=observeAttention([],registration('google-calendar'),Array.from({length:12},(_,i)=>({id:'meeting-'+i,text:'Confirmed team meeting',attributes:{start:new Date((now+(12-i)*3600)*1000).toISOString(),end:new Date((now+(13-i)*3600)*1000).toISOString()}})),now);
const meetingPlan=planAttention(meetings,{},now,['google-calendar'])!;
assert.deepEqual(meetingPlan.facts.slice(0,3).map(f=>f.sourceId),['meeting-11','meeting-10','meeting-9'],'Nearest meetings must reach synthesis before later commitments');
const {attentionOrder}=await import('../core/attention/attention-focus.ts');
const ordered=attentionOrder([3,1,2].map(day=>({state:'event',start:(now+day*86400)*1000})),{region:()=>'',importance:()=>1});
assert.deepEqual(ordered.map(i=>i.start),[1,2,3].map(day=>(now+day*86400)*1000),'Meetings with equal urgency still sort chronologically');
console.log('PASS nearest meetings prioritized for synthesis and Coming Up display');

const scheduled=startSourceCheck({id:'gmail',provider:'gmail',enabled:true,intervalMinutes:30},100);
const retry=finishSourceCheck(scheduled,scheduled,'error',150);
assert.equal(retry.nextAt,180);
assert.equal(finishSourceCheck(retry,retry,'error',220).nextAt,280);
assert.equal(finishSourceCheck(scheduled,scheduled,'cancelled',150).nextAt,155);
assert.equal(finishSourceCheck(scheduled,{...scheduled,enabled:false,nextAt:9000},'error',150).nextAt,9000);
assert.equal(finishSourceCheck(scheduled,{...scheduled,intervalMinutes:60,nextAt:9000},'error',150).nextAt,9000);
assert.equal(finishSourceCheck(retry,retry,'complete',220).failures,undefined);
for(const action of ['usageEvent','foxTiming','snapshot','agentToolResult'])assert.equal(interruptsBackground({action}),false);
for(const action of ['agentChat','disconnectSource','setSampleEnabled','unknown'])assert.equal(interruptsBackground({action}),true);
assert.equal(interruptsBackground({action:'foxPreferences',cloudConsent:false}),true);
assert.equal(interruptsBackground({action:'onboarding',operation:'setup'}),false);
console.log('PASS shared source completion/backoff and background admission policy.');

// Output budgets reject verbose model copy; they must never silently cut its meaning.
const conciseBrief={title:'Check Windows Sign-In',reason:'An unfamiliar device accessed your account.',summary:'Review the sign-in if this was not you.'};
assert.equal(processedAttentionContent(conciseBrief).reason,conciseBrief.reason);
assert.throws(()=>processedAttentionContent({...conciseBrief,reason:'One two three four five six seven eight nine'}),/8 words/);
assert.throws(()=>processedAttentionContent({...conciseBrief,reason:'x'.repeat(57)}),/56 characters/);
assert.equal(processedAttentionContent({...conciseBrief,reason:'陌生设备登录了你的账号，请确认是否本人操作。'}).title,conciseBrief.title);
console.log('PASS concise Attention reasons reject overflow without truncation');

assert.equal(finishSourceCheck(scheduled,scheduled,'error',150,'401 Unauthorized').waitReason,'authorization');
assert.equal(finishSourceCheck(scheduled,scheduled,'error',150,'network offline').nextAt,180);
assert.ok(Number(finishSourceCheck(scheduled,scheduled,'error',150,'worldlet_daily_allowance').nextAt)>1000);
assert.equal(finishSourceCheck(scheduled,{...scheduled,enabled:false,nextAt:9000},'error',150,'network offline').nextAt,9000);
// Cache bounds must apply backpressure rather than silently discard registered input.
let full:AttentionFact[]=[];
for(let i=0;i<80;i++)full=observeAttention(full,registration('gmail'),[{id:`pending-${i}`,text:'Unprocessed input'}],now);
const pending=full.map(f=>({id:f.id,consumerId:'attention:center',entityId:f.id,revision:f.revision,provider:f.provider,status:'pending' as const,createdAt:now}));
assert.throws(()=>observeAttention(full,registration('gmail'),[{id:'new',text:'New input'}],now+1,pending),/capacity/);
assert.equal(full.length,80);
const released=pending.map((d,i)=>i===0?{...d,status:'acknowledged' as const}:d);
const accepted=observeAttention(full,registration('gmail'),[{id:'new',text:'New input'}],now+1,released);
assert.equal(accepted.length,80);
assert.ok(accepted.some(f=>f.sourceId==='new'));
for(const d of released.filter(d=>d.status==='pending'))assert.ok(accepted.some(f=>f.id===d.entityId));
assert.equal(observeAttention(full,registration('gmail'),[{id:'pending-0',text:'Updated input'}],now+1,pending).length,80);
assert.equal(observeAttention(full,registration('gmail'),[{id:'new',text:'New input'}],now+7201,pending).length,80);

// The old 24-pass ceiling could strand an initial scan. Keep processing registered work.
assert(planAttention(facts,{day:Math.floor(now/86400),attempts:24},now,providers));
assert(planAttention(facts,{day:Math.floor(now/86400),attempts:239},now,providers));
assert(planAttention(facts.map(f=>({...f,expiresAt:now+172800})),exhausted,now+86400,providers),'daily guard must reset without losing pending work');

{
 const before={...startAttentionBudget({failures:4},now),seen:{already:1}};
 const yielded=finishAttentionBudget(before,plan,now,false,facts,false,true);
 assert.equal(yielded.nextAt,now+30);
 assert.equal(yielded.failures,0);
 assert.deepEqual(yielded.seen,before.seen,'yield cannot acknowledge unfinished input');
 assert.equal(yielded.attempts,before.attempts,'yield retains daily model usage');
 assert.equal(yielded.lastSweepAt,before.lastSweepAt,'yield cannot complete a sweep');
 assert.equal(finishAttentionBudget(before,plan,now,false,facts,true,true).nextAt,now+60,'cancellation dominates continuation');
 assert.equal(finishAttentionBudget(before,plan,now,false,facts).nextAt,now+900,'real errors retain backoff');
}

{
 const removed={...facts[0],id:'recurrence-context',sourceId:'original-event',removed:true};
 const linked={...item,sources:[{provider:removed.provider,id:'original-event',quote:'original'}],attentionDependencies:[]} as any;
 assert.deepEqual(discardedAttentionRemovals([removed],[],[removed.provider]),[{id:removed.id,revision:removed.revision}]);
 assert.deepEqual(discardedAttentionRemovals([removed],[linked],[removed.provider]),[],'source-linked cancellations still need review');
 assert.deepEqual(discardedAttentionRemovals([removed],[],[]),[],'paused or unauthorized providers are not consumed');
 const selected=planAttention([removed],{},now,[removed.provider],[linked]);
 assert.equal(selected?.seeds[0].id,removed.id,'custom context identity cannot hide a referenced cancellation');
 // #1609: the tombstone of a changed recurrence came first in the snapshot, so a finding quoting the live occurrence
 // depended on the removed fact and every save failed as "Attention context changed".
 const live={...facts[0],id:'recurrence-live',sourceId:'original-event',removed:false};
 const cited={...proposal,sources:[{provider:removed.provider,id:'original-event',quote:'Practice tennis at 10 AM.'}]};
 const pair=[removed,live];
 assert.deepEqual(attentionDependencies(cited,pair),[{id:live.id,revision:live.revision}]);
 assert(attentionCurrent(attentionDependencies(cited,pair),pair,now,[removed.provider]),'a live occurrence stays current beside its tombstone');
 assert.deepEqual(attentionDependencies(cited,[removed]),[{id:removed.id,revision:removed.revision}],'a lone tombstone is still found');
}

// A lease alone cannot authorize results derived from superseded input.
{
 const snapshot=JSON.stringify({plan,facts});
 assert.equal(attentionPlanCurrent(plan,facts,now,providers),true);
 assert.equal(attentionPlanCurrent(plan,facts,now,[]),false);
 assert.equal(attentionPlanCurrent(plan,facts.map(f=>({...f,revision:f.revision+1})),now,providers),false);
 assert.equal(attentionPlanCurrent(plan,facts.map(f=>({...f,expiresAt:now})),now,providers),false);
 assert.equal(attentionPlanCurrent(plan,[],now,providers),false);
 assert.equal(attentionPlanCurrent({...plan,facts:[]},facts,now,providers),false);
 assert.equal(attentionPlanCurrent(plan,facts,NaN,providers),false);
 const removed=plan.facts.map(f=>({...f,removed:true}));
 assert.equal(attentionPlanCurrent({...plan,facts:removed},removed,now,providers),true,'removals still require processing');
 assert.equal(JSON.stringify({plan,facts}),snapshot);
 console.log('PASS shared Center plan revision, expiry and authorization fence');
}

{
 const rows=plan.seeds.map(seed=>({id:seed.id,consumerId:'attention:center',entityId:seed.id,revision:seed.revision,provider:plan.facts.find(f=>f.id===seed.id)!.provider,status:'acknowledged' as const,createdAt:now}));
 const input={plan,facts,providers,deliveries:rows,now,success:true,cancelled:false,yielded:false};
 assert.deepEqual(attentionCompletion(input),{success:true,cancelled:false,yielded:false});
 for(const deliveries of [[],rows.map(r=>({...r,status:'pending' as const})),rows.map(r=>({...r,consumerId:'another'})),rows.map(r=>({...r,revision:'old'}))]){
  assert.equal(attentionCompletion({...input,deliveries}).success,false,'completion cannot manufacture receipts');
 }
 assert.deepEqual(attentionCompletion({...input,cancelled:true}),{success:false,cancelled:true,yielded:false});
 assert.deepEqual(attentionCompletion({...input,providers:[]}),{success:false,cancelled:true,yielded:false});
 assert.deepEqual(attentionCompletion({...input,success:false,yielded:true}),{success:false,cancelled:false,yielded:true});
 assert.equal(attentionCompletion({...input,success:false}).success,false,'old receipts do not override a failed sweep');
 assert.deepEqual(attentionCompletion({...input,facts:facts.map(f=>({...f,revision:f.revision+1}))}),{success:true,cancelled:false,yielded:false},'committed exact-revision seeds survive a later related-context change');
assert.equal(attentionCompletion({...input,deliveries:[],facts:facts.map(f=>({...f,revision:f.revision+1}))}).cancelled,true,'uncommitted stale input retries as cancelled');
 console.log('PASS shared completion requires current input and committed receipts');
}

const {attentionExecution,attentionFollowupReads}=await import('../core/attention/index.ts');
assert.equal(attentionExecution('synthesis').timeoutSeconds,600);
assert.ok(attentionExecution('synthesis').prompt?.includes('Reuse existing IDs'));
assert.match(attentionExecution('synthesis').prompt!,/read it[\s\S]*using query_world_items, then submit with upsert_world_items/,'the synthesis prompt names the tools that read and submit the context');
assert.deepEqual(attentionExecution('collection','gmail').reads,reads);
assert.equal(attentionExecution('collection','gmail').timeoutSeconds,240);
assert.throws(()=>attentionExecution('unknown'));
assert.throws(()=>attentionExecution('collection'));
const indexed=[{id:null},{id:' '},{id:'one'},{id:'one'},...Array.from({length:8},(_,i)=>({id:String(i)}))];
assert.deepEqual(attentionFollowupReads('notion',indexed).map(r=>r.id),['one','0','1','2','3']);
assert.deepEqual(attentionFollowupReads('gmail',indexed),[]);
assert.deepEqual(attentionFollowupReads('notion',[]),[]);
console.log('PASS shared Attention execution budgets, synthesis instructions and receipt-based bounded follow-up reads');
const timingNow=new Date('2026-09-27T12:00:00Z');
assert.equal(attentionWhen({state:'event',start:'2026-09-27T14:00:00Z'},{now:timingNow}).relative,'Starts · in 2 hr.');
assert.equal(attentionWhen({state:'needsAction',dueAt:'2026-10-01T12:00:00Z'},{now:timingNow}).relative,'Due · in 4 days');
assert.equal(attentionWhen({state:'unseen',occurredAt:'2026-09-27T10:00:00Z'},{now:timingNow}).relative,'Occurred · 2 hr. ago');
assert.equal(attentionWhen({state:'unseen',updatedAt:timingNow.toISOString()},{now:timingNow}),null);
assert.equal(attentionWhen({state:'needsAction',dueAt:'bad'},{now:timingNow}),null);
assert.equal(attentionWhen({state:'event',start:'2026-09-27T11:00:00Z',end:'2026-09-27T13:00:00Z'},{now:timingNow}).relative,'Starts · Now');
assert.throws(()=>processedAttentionContent({...conciseBrief,dueAt:'tomorrow'}),/ISO8601/);
assert.equal(processedAttentionContent({...conciseBrief,occurredAt:'2026-09-27T10:00:00Z'}).occurredAt,'2026-09-27T10:00:00Z');
console.log('PASS three-section timestamp semantics and missing-time omission');
{
 // An email's own picture: one verified HTTPS address carried as a fact attribute and on its reference (owner Order 2026-10-08).
 const {attentionImageURL,attentionPictureFits,attentionSourceImage}=await import('../core/attention/source-image.ts');
 assert.equal(attentionImageURL('https://cdn.example.com/launch/hero.jpg?w=1200'),'https://cdn.example.com/launch/hero.jpg?w=1200');
 for(const bad of ['http://cdn.example.com/a.jpg','https://127.0.0.1/a.jpg','https://localhost/a.jpg','https://cdn.example.com:8443/a.jpg','https://u:p@cdn.example.com/a.jpg','https://open.example.com/a.jpg','https://cdn.example.com/pixel.gif','https://cdn.example.com/brand-logo.png','javascript:alert(1)',42,'https://x.example.com/'+'a'.repeat(2000)])assert.equal(attentionImageURL(bad),'',String(bad).slice(0,60));
 assert(attentionPictureFits(1200,600)&&!attentionPictureFits(120,60)&&!attentionPictureFits(1600,200)&&!attentionPictureFits(400,900));
 assert.equal(attentionSourceImage([{provider:'gmail',id:'a'},{provider:'gmail',id:'b',image:'https://cdn.example.com/b.jpg'}]),'https://cdn.example.com/b.jpg');
 const mail=registration('gmail'),observed=observeAttention([],mail,[{id:'thread:a',title:'Launch',text:'Launch day',attributes:{image:'https://cdn.example.com/b.jpg'}},{id:'thread:b',title:'Promo',text:'Sale',attributes:{image:'https://track.example.com/p.gif'}}],now);
 assert.equal(observed.find(f=>f.sourceId==='thread:a')!.attributes.image,'https://cdn.example.com/b.jpg');
 assert.equal(observed.find(f=>f.sourceId==='thread:b')!.attributes.image,undefined);
 console.log('PASS email pictures: verified HTTPS addresses only, kept on mail facts, and only pictures large enough fill a card');
}
