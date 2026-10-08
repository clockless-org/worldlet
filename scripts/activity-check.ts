import assert from 'node:assert/strict';
import {activityObserve,activityEvent,activityURL} from '../core/activity/index.ts';
import {invoke} from '../core/index.ts';
import type {ActivityEndReason} from '../contracts/activity.ts';
const page={url:'https://example.com/a?token=secret',title:'Page',text:'Visible text',documentId:'doc1',visible:true,truncated:false};
const input={id:'one',surfaceId:'browser',at:100,tick:1000,active:true,page};
let result=activityObserve(input);
assert.equal(result.events[0].kind,'activity.page.opened');assert.equal(result.state?.url,'https://example.com/a');
result=activityObserve({...input,id:'two',at:103,tick:4000,state:result.state});
assert.equal(result.events[0].data.visibleMs,3000);assert(!result.events.some(e=>e.kind==='activity.page.content'));
result=activityObserve({...input,id:'three',at:200,tick:101000,state:result.state});
assert.equal(result.events[0].data.visibleMs,5000);assert(result.events.some(e=>e.kind==='activity.capture.gap'));
result=activityObserve({...input,id:'four',tick:104000,state:result.state,active:false});
assert(!result.events.some(e=>e.kind==='activity.page.dwell'));
result=activityObserve({...input,id:'five',tick:107000,state:result.state,page:{...page,documentId:'doc2',text:'New'}});
assert(result.events.some(e=>e.kind==='activity.page.closed'));assert(result.events.some(e=>e.kind==='activity.page.opened'));
assert.equal(activityObserve({...input,id:'six',tick:110000,state:result.state,active:false,close:true}).state,null);
const event=activityEvent({id:'event',surfaceId:'world',at:100,kind:'ui.click',data:{label:'Bearer secret',password:'password',target:'mail'}});
assert(!JSON.stringify(event).includes('password'));assert(!JSON.stringify(event).includes('Bearer secret'));
assert.throws(()=>activityEvent({id:'event',surfaceId:'world',at:100,kind:'run.succeeded'}));
const first=activityObserve(input);const queryVisit=activityObserve({...input,id:'query',tick:2000,state:first.state,page:{...page,url:'https://example.com/a?q=second'}});assert(queryVisit.events.some(e=>e.kind==='activity.page.opened'));assert(!JSON.stringify(queryVisit.events).includes('q=second'));
assert.equal(activityURL('file:///private/key'),'');assert.equal(activityURL('https://user:pass@site.com/a#secret'),'https://site.com/a');
console.log('PASS activity correlation, sampled dwell, clock gaps, background exclusion, revisit, close, redaction and closed event vocabulary');

const longText='long paragraph '.repeat(10000);
const chunks=activityObserve({...input,page:{...page,text:longText}}).events.filter(e=>e.kind==='activity.page.content');
assert.equal(chunks.map(e=>e.data.text).join(''),longText);assert(chunks.length>1);assert(chunks.every(e=>e.data.snapshotId==='one'));

// Coverage is an explicit limitation, not evidence of attached frames/workers or completed actions.
const coverage={scope:'document' as const,frameElements:2,workers:'not-observed' as const};
const covered=activityObserve({...input,page:{...page,coverage}});
assert(covered.events.some(e=>e.kind==='activity.capture.gap'&&e.data.reason==='document-only-coverage'&&e.data.frameElements===2&&e.data.workers==='not-observed'));
const repeated=activityObserve({...input,id:'repeat',tick:2000,state:covered.state,page:{...page,coverage}});
assert(!repeated.events.some(e=>e.data.reason==='document-only-coverage'));
const added=activityObserve({...input,id:'frame',tick:3000,state:repeated.state,page:{...page,coverage:{...coverage,frameElements:3}}});
assert(added.events.some(e=>e.data.reason==='document-only-coverage'&&e.data.frameElements===3));
assert.throws(()=>activityObserve({...input,page:{...page,coverage:{...coverage,frameElements:-1}}}));
const excluded=activityObserve({...input,id:'excluded',tick:4000,state:added.state,page:{...page,omitted:'sensitive-page',title:'PRIVATE TITLE',text:'PRIVATE TEXT',clicks:[{tag:'button',label:'PRIVATE LABEL'}],interactions:[{type:'click',label:'PRIVATE INTERACTION'}]}});
assert(!JSON.stringify(excluded).includes('PRIVATE'));
assert(!excluded.events.some(e=>['activity.page.dwell','activity.page.click','activity.page.interaction'].includes(e.kind)));
assert.equal(excluded.state?.active,false);
const navigated=activityObserve({...input,id:'navigation',tick:4000,state:covered.state,page:{...page,url:'https://example.com/b'}});
assert(!navigated.events.some(e=>e.kind==='activity.page.dwell'));
assert(!covered.events.some(e=>/read|completed|succeeded/.test(e.kind)));
console.log('PASS document-only coverage gaps, deduplication, privacy exclusion and navigation dwell boundaries');

// Closing is a boundary, never a final sample: even a delayed close carrying an
// old page cannot manufacture dwell or content. The final unsampled interval is
// explicitly unknown; no part of it is assumed to have been observed.
for(const reason of ['navigation','hidden','closed','popup','unavailable'] as ActivityEndReason[]){
 const closed=activityObserve({...input,id:'end',tick:100000,state:covered.state,close:true,endReason:reason});
 assert.equal(closed.state,null);
 assert.deepEqual(closed.events.map(e=>[e.kind,e.data.reason]),[['activity.capture.gap','visit-ended-between-samples'],['activity.page.closed',reason]]);
 assert.equal(closed.events[0].data.unobservedMs,99000);
 assert.equal(closed.events[1].data.totalVisibleMs,0);
 assert.equal(activityObserve({...input,id:'end-again',state:closed.state,close:true,endReason:reason}).events.length,0);
 const resumed=activityObserve({...input,id:'resume',state:closed.state,tick:103000});
 assert.equal(resumed.state?.visitId,'resume');
 assert(!resumed.events.some(e=>e.kind==='activity.page.dwell'));
}
assert.throws(()=>activityObserve({...input,endReason:'hidden'}));
assert.equal(JSON.parse(invoke('activityObserve',JSON.stringify({...input,close:'true'}))).ok,false);
assert.equal(JSON.parse(invoke('activityObserve',JSON.stringify({...input,close:true,endReason:'succeeded'}))).ok,false);
const inactive=activityObserve({...input,page:undefined,id:'inactive',state:covered.state,tick:2000,active:false});
assert.deepEqual(inactive.events.map(e=>[e.kind,e.data.active]),[['activity.page.visibility',false]]);
assert.equal(activityObserve({...input,page:undefined,id:'still-inactive',state:inactive.state,tick:3000,active:false}).events.length,0);
assert(!activityObserve({...input,id:'focused-again',state:inactive.state,tick:4000}).events.some(e=>e.kind==='activity.page.dwell'));
for(const active of [true,false]){
 const envelope=JSON.parse(invoke('activityEvent',JSON.stringify({id:'popup',surfaceId:'browser',at:100,kind:'capture.popup',data:{active,url:'https://private.test/?credential=private',title:'PRIVATE',status:'succeeded'}})));
 assert.equal(envelope.ok,true);
 assert.equal(envelope.value.kind,'activity.capture.gap');
 assert.deepEqual(envelope.value.data,{reason:'popup-coverage',active,scope:'popup-stack',content:'not-observed',targetInventory:'unavailable'});
}
assert.throws(()=>activityEvent({id:'bad-popup',surfaceId:'browser',at:100,kind:'capture.popup',data:{active:'true'}}));
console.log('PASS lifecycle reason validation, no close-time dwell, independent resumed visits, inactivity edges and payload-free popup coverage');
