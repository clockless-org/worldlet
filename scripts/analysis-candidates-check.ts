import assert from 'node:assert/strict';
import {mergeAnalysisCandidates as merge} from '../core/applets/analysis-candidates.ts';
const candidate={provider:'gmail',title:'Reply',sources:[{id:'thread',quote:'Please reply'}]};
assert.deepEqual(merge([candidate],[{sources:candidate.sources,title:'Reply',provider:'gmail'}]),[candidate]);
assert.equal(merge([candidate],[{...candidate,title:'Schedule meeting'}]).length,2,'same evidence may support different obligations');
assert.deepEqual(merge([{...candidate,id:'one'}],[{...candidate,id:'one',title:'Updated'}]).map(r=>r.title),['Updated']);
assert.equal(merge([{...candidate,id:'one'}],[{...candidate,id:'one',provider:'notion'}]).length,2);
const full=Array.from({length:1000},(_,i)=>({...candidate,id:String(i)}));
assert.equal(merge(full,[full[0]]).length,1000);
assert.throws(()=>merge(full,[{...candidate,id:'overflow'}]));
assert.equal(full[0].title,'Reply','merge must not mutate its inputs');
console.log('PASS candidate replay dedup, explicit updates, distinct obligations and bounded staging');

const {analysisSourceContent:source}=await import('../core/applets/analysis-candidates.ts');
const record={id:'one',text:'Same body',title:'Original',url:'https://example.com',observedAt:1};
assert.equal(source(record),source({...record,observedAt:99}),'poll time must not invalidate content');
assert.equal(source(record),source({url:record.url,text:record.text,id:record.id,title:record.title}));
for(const change of [{title:'Changed'},{url:'https://example.com/new'},{cancelled:true},{start:'2026-10-01T10:00:00Z'}])assert.notEqual(source(record),source({...record,...change}));
console.log('PASS source versions include structured evidence and ignore poll timestamps');

const {orderAnalysisRecords:order}=await import('../core/applets/analysis-candidates.ts');
const queue=[{id:'bad',text:'bad'},{id:'next',text:'next'},{id:'last',text:'last'}];
let attempted:Record<string,number>={};
assert.deepEqual(order(queue,attempted),queue);
for(const [i,id] of ['bad','next','last','bad'].entries()){
 assert.equal(order(queue,attempted)[0].id,id);
 attempted=JSON.parse(JSON.stringify({...attempted,[id]:i+1}));
}
assert.equal(order([{id:'new',text:'new'},...queue],attempted)[0].id,'new');
assert.equal(queue[0].id,'bad','ordering leaves stored observations unchanged');
console.log('PASS failed records rotate without acknowledgement and new sources get a first attempt');

const {analysisBatch:batch}=await import('../core/applets/analysis-candidates.ts');
const large=Array.from({length:20},(_,i)=>({id:String(i),text:'x'.repeat(12000)}));
assert.equal(batch(large,20).length,2);
assert.equal(batch(large,1).length,1);
assert.equal(batch(queue,20).length,3);
assert.deepEqual(batch([{id:'huge',text:'x'.repeat(40000)},...queue],20),[{id:'huge',text:'x'.repeat(40000)}]);
let rest=[...large],covered=0;
while(rest.length){const page=batch(rest,20);covered+=page.length;rest=rest.slice(page.length);}
assert.equal(covered,20,'size budget must not drop records');
assert.equal(large[0].text.length,12000,'body must remain intact');
assert.throws(()=>batch(queue,0));
console.log('PASS whole-record character budget, count bound, oversized isolation and complete coverage');

// A Calendar event's times are the provider's facts: upsert_world_items projects them before the candidate rules run,
// so a model-written start or end never rejects the event (#1609, platform/electron/src/modules/attention/tools.ts).
const {appletCandidateContent:content}=await import('../core/applets/candidate-content.ts');
const {calendarItemTimes:times}=await import('../core/items/world-item-projection.ts');
const meeting={provider:'google-calendar',kind:'event',title:'Design review',reason:'Review the launch plan',summary:'Design review with the launch team.',
 start:'tomorrow at 3pm',end:'2026-10-06T14:00:00-07:00',sources:[{provider:'google-calendar',id:'event-1',quote:'Design review'}]};
const evidence={'google-calendar:event-1':{provider:'google-calendar',id:'event-1',text:'Design review',start:'2026-10-07T15:00:00-07:00',end:'2026-10-07T16:00:00-07:00'}};
assert.throws(()=>content(meeting),/Events need a date|Invalid event end time/);
const projected=content(times(meeting,evidence));
assert.deepEqual([projected.start,projected.end],['2026-10-07T15:00:00-07:00','2026-10-07T16:00:00-07:00']);
console.log('PASS Calendar candidates take event times from the provider before validation');
