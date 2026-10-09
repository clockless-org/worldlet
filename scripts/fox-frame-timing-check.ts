import {diagnosticReport,diagnosticError} from '../core/diagnostics/report.ts';
import {foxTiming} from '../core/diagnostics/fox-timing.ts';
import assert from 'node:assert/strict';
import {createFoxFrameTiming,createFoxSurfaceTiming} from '../ui/companion/fox-frame-timing.ts';
const timing=createFoxFrameTiming(4);
assert.equal(timing.snapshot(0).samples,0);
assert.equal(timing.snapshot(0).raf,null);
timing.record(10,2,0,'anatomy-v1:idle');
timing.record(20,3,undefined,'anatomy-v1:listening');
timing.record(30,4,16,'anatomy-v1:idle');
timing.record(50,5,48,'PRIVATE-USER-CONTENT');
let s=timing.snapshot(100);
assert.equal(s.samples,4);assert.equal(s.ageMs,50);
assert.deepEqual(s.raf,{count:2,median:16,p95:16,max:32},'Manual paints contaminate RAF timing');
assert.deepEqual(s.draw,{count:4,median:3,p95:4,max:5});
assert.deepEqual(s.routes,['anatomy-v1:idle','anatomy-v1:listening','fallback']);
assert(!JSON.stringify(s).includes('PRIVATE'));
timing.pause();timing.record(3000,8,3000,'anatomy-v1:thinking');
s=timing.snapshot(3001);assert.equal(s.samples,4);assert.equal(s.ageMs,1);
assert.equal(s.raf!.max,32,'Hidden/reduced-motion gap enters RAF summary');
for(let i=1;i<=4;i++)timing.record(3000+i*8,1,3000+i*8,'anatomy-v1:thinking');
s=timing.snapshot(3033);assert.deepEqual(s.raf,{count:4,median:8,p95:8,max:8});
assert.deepEqual(s.routes,['anatomy-v1:thinking'],'Retired samples remain in bounded ring');
const stable=timing.snapshot(3100);
for(const row of [[NaN,1,10],[10,Infinity,10],[10,-1,10],[10,1,Infinity]])timing.record(row[0],row[1],row[2],'anatomy-v1:idle');
assert.deepEqual(timing.snapshot(3100),stable);
for(const n of [0,1,2.5,3601,NaN])assert.throws(()=>createFoxFrameTiming(n));
console.log('PASS bounded local frame timing: distinct RAF/draw clocks, manual paint isolation, pause boundaries, quantiles, ring eviction and allowlisted routes. No frame-rate acceptance claim.');
const surfaces=createFoxSurfaceTiming(4);
surfaces.record(0,2,0,'anatomy-v1:idle','world');
surfaces.record(24,3,24,'anatomy-v1:idle','world');
surfaces.record(1000,1,1000,'anatomy-v1:idle','desktop');
surfaces.record(1016,1,1016,'anatomy-v1:idle','desktop');
surfaces.record(2000,2,2000,'anatomy-v1:idle','world');
let paired=surfaces.snapshot(2001);
assert.equal(paired.world.raf!.max,24,'Surface switch contaminated world RAF');
assert.equal(paired.desktop.raf!.max,16,'Surface switch contaminated desktop RAF');
assert.equal(paired.desktop.samples,2);assert.equal(paired.desktop.ageMs,985);
surfaces.pause();surfaces.record(4000,2,4000,'anatomy-v1:idle','world');
assert.equal(surfaces.snapshot(4001).world.raf!.max,24);
for(let i=1;i<=8;i++)surfaces.record(4000+i*20,2,4000+i*20,'anatomy-v1:thinking','world');
paired=surfaces.snapshot(4200);
assert.equal(paired.world.samples,4);assert.equal(paired.world.raf!.max,20);
assert.equal(paired.desktop.samples,2,'World paints erased desktop baseline');
assert.deepEqual(paired.desktop.routes,['anatomy-v1:idle']);
console.log('PASS independently bounded world/desktop samples; switch and hidden gaps excluded; inactive surface retained.');
const episodes=createFoxFrameTiming(4);
episodes.record(0,2,0,'anatomy-v1:greeting');episodes.record(16,3,16,'anatomy-v1:greeting');episodes.record(32,4,32,'anatomy-v1:greeting');
for(let i=1;i<=12;i++)episodes.record(32+i*20,1,32+i*20,'anatomy-v1:idle');
let runs=episodes.snapshot(300).completedRuns;
assert.equal(runs.length,1);assert.equal(runs[0].route,'anatomy-v1:greeting');assert.equal(runs[0].paints,3);assert.equal(runs[0].spanMs,32);
assert.deepEqual(runs[0].raf,{count:2,median:16,p95:16,max:16});assert.equal(runs[0].ageMs,268);
episodes.pause();runs=episodes.snapshot(300).completedRuns;
const idle=runs.find(r=>r.route==='anatomy-v1:idle')!;assert.equal(idle.paints,12);assert.equal(idle.samples,4);assert.equal(idle.raf!.max,20);
episodes.record(5000,6,5000,'anatomy-v1:greeting');episodes.record(5033,8,5033,'anatomy-v1:greeting');episodes.pause();
runs=episodes.snapshot(6000).completedRuns;
assert.equal(runs.length,2);assert.equal(runs[0].paints,2);assert.equal(runs[0].raf!.max,33,'Hidden gap or previous route leaked into current episode');
for(let i=0;i<100;i++){episodes.record(7000+i,1,7000+i,'PRIVATE-'+i);episodes.pause();}
runs=episodes.snapshot(8000).completedRuns;assert.equal(runs.length,3,'Unknown route summaries grow without bound');assert(!JSON.stringify(runs).includes('PRIVATE'));
assert.equal(surfaces.snapshot(4200).world.completedRuns[0].route,'anatomy-v1:idle');
assert.equal(surfaces.snapshot(4200).desktop.completedRuns[0].route,'anatomy-v1:idle');
console.log('PASS retained short-action summaries, bounded long-run samples, latest-run replacement, pause/surface isolation and unknown-route privacy.');
const phases=createFoxFrameTiming(4);
for(const [at,phase] of [[0,'handling'],[16,'handling'],[100,'blend'],[116,'blend'],[200,'performing'],[232,'performing'],[264,'performing']] as const)
 phases.record(at,phase==='performing'?8:2,at,'anatomy-v1:delighted',phase);
for(let i=0;i<20;i++)phases.record(1000+i*16,1,1000+i*16,'anatomy-v1:delighted','settled');
phases.pause();
const segments=phases.snapshot(1400).completedRuns;
assert.equal(segments.length,4);
const gesture=segments.find(r=>r.phase==='performing')!;
assert.equal(gesture.paints,3);assert.equal(gesture.draw!.median,8);
assert.deepEqual(gesture.raf,{count:2,median:32,p95:32,max:32},'Phase-entry gap contaminated gesture');
assert.equal(segments.find(r=>r.phase==='settled')!.samples,4);
for(let i=0;i<100;i++){phases.record(2000+i,1,2000+i,'anatomy-v1:delighted','PRIVATE-'+i);phases.pause();}
assert.equal(phases.snapshot(2200).completedRuns.length,5);
assert(!JSON.stringify(phases.snapshot(2200)).includes('PRIVATE'));
surfaces.record(6000,2,6000,'anatomy-v1:greeting','desktop','performing');surfaces.pause();
assert.equal(surfaces.snapshot(6001).desktop.completedRuns[0].phase,'performing');
console.log('PASS bounded phase summaries: active gesture survives settled tail; cross-phase RAF excluded; sanitized metadata and surface forwarding.');
const lifecycle=createFoxSurfaceTiming(4);
lifecycle.observe(0,'world',false,true);lifecycle.observe(16,'world',false,true);
assert.equal(lifecycle.snapshot(20).world.lifecycle.length,1);
lifecycle.observe(30,'world',false,false);lifecycle.observe(40,'world',true,false);
lifecycle.observe(50,'desktop',false,false);
assert.equal(lifecycle.snapshot(60).desktop.lifecycle[0].ageMs,10);
assert.equal(lifecycle.snapshot(60).world.lifecycle.at(-1)!.hidden,true);
for(let i=0;i<50;i++)lifecycle.observe(100+i,'world',false,i%2===0);
const local=lifecycle.snapshot(200);assert.equal(local.world.lifecycle.length+local.desktop.lifecycle.length,12);
lifecycle.observe(NaN,'world',false,true);assert.deepEqual(lifecycle.snapshot(200),local);
lifecycle.record(0,1,0,'anatomy-v1:idle','world');lifecycle.observe(100,'world',false,false);
lifecycle.record(24344,1,24344,'anatomy-v1:idle','world');
assert.equal(lifecycle.snapshot(24345).world.raf!.max,24344,'Unfocused delivery gaps must not be filtered away');
console.log('PASS bounded deduplicated page visibility/focus history, surface attribution, invalid input and unfiltered delivery gaps.');

const safe=foxTiming({id:'12345678-1234-1234-1234-123456789012',outcome:'running',lastStage:'bridgeSentMs',bridgeSentMs:20,text:'PRIVATE',url:'PRIVATE',firstDeltaMs:-1,modelCalls:[{modelMs:12,prompt:'PRIVATE',input_tokens:true}]});
assert.equal(safe!.outcome,'running');assert.equal(safe!.bridgeSentMs,20);
assert.equal(safe!.firstDeltaMs,undefined);assert.equal(safe!.text,undefined);
assert.deepEqual(safe!.modelCalls,[{modelMs:12}]);
assert(!JSON.stringify(safe).includes('PRIVATE'));
assert.equal(foxTiming({id:'PRIVATE'}),null);
assert.equal(foxTiming({...safe,lastStage:'PRIVATE'})!.lastStage,undefined);
console.log('PASS shared trace sanitizer: incomplete runs retained, only known stages and numeric metrics exported.');

// An unfinished turn must leave evidence before a final response exists.
const {foxTrace}=await import('../ui/companion/fox-performance.ts');
const events:any[]=[];
Object.assign(globalThis,{window:new EventTarget(),requestAnimationFrame:callback=>setTimeout(callback,0)});
window.addEventListener('worldlet:fox-timing',(e:any)=>events.push(e.detail));
const trace=foxTrace();trace.mark('bridgeSentMs');
await new Promise(resolve=>setTimeout(resolve,300));
assert.equal(events.length,1);assert.equal(events[0].outcome,'running');assert.equal(events[0].lastStage,'bridgeSentMs');
trace.finish({},'error');await new Promise(resolve=>setTimeout(resolve,30));
assert.equal(events.at(-1).outcome,'error');assert.equal(events.at(-1).id,events[0].id);
console.log('PASS shared live trace: stalled turn checkpoint and final outcome use the same ID.');

const report=diagnosticReport({platform:'windows',systemVersion:'10.0.26100',build:{version:'1.2.3',build:4,secret:'PRIVATE'},connections:[{provider:'gmail',status:'connected',label:'PRIVATE'}, {provider:'PRIVATE',status:'PRIVATE'}],recentErrors:Array.from({length:60},()=>({code:'timeout',message:'PRIVATE'})),foxTimings:[{id:'12345678-1234-1234-1234-123456789012',outcome:'running',prompt:'PRIVATE'}]});
assert.equal(report.recentErrors.length,50);assert.equal(report.foxTimings.length,1);
assert.deepEqual(report.connections,[{provider:'gmail',status:'connected'},{provider:'other',status:'unknown'}]);
assert.deepEqual(report.build,{version:'1.2.3',build:4});assert(!JSON.stringify(report).includes('PRIVATE'));
assert.equal(diagnosticReport({platform:'PRIVATE',systemVersion:'PRIVATE'}).system,'unknown unknown');
console.log('PASS shared diagnostic envelope: stable schema, bounded arrays and no platform-specific privacy rules.');

for(const [message,code]of [['invalid_grant secret','authentication'],['rate limit secret','quota'],['source evidence secret','evidenceMismatch'],['10060 secret','timeout'],['Kept page released under memory pressure (lowMemory) secret','lowMemory'],['Kept page released under memory pressure (appFootprint) secret','appFootprint'],['API call failed after 3 retries. HTTP 503: Model service is unavailable. secret','unavailable'],['Error code: 502 - secret','unavailable'],['InternalServerError secret','unavailable'],['Error code: 400 - secret','operationFailed']]){
 const error=diagnosticError({message,area:'native'});assert.equal(error.code,code);assert(!JSON.stringify(error).includes('secret'));
}
assert.equal(diagnosticError({cancelled:true,message:'timeout'}).code,'cancelled');
assert.equal(diagnosticError({timedOut:true,message:'private detail'}).code,'timeout');
assert.equal(diagnosticError({message:'other',requestId:'PRIVATE'}).requestId,undefined);
console.log('PASS one native error taxonomy: OS hints, cancellation precedence, quota/auth and private text discarded.');

for(const operation of ['appletCheck','appletAnalysis','appletAnalysisQueue','appletBackpressure','attentionWake','attentionSynthesis','keptPageRelease','webEngineStall']){
 const event=diagnosticError({operation,message:'private@example.com timeout'});
 assert.equal(event.operation,operation);assert.equal(event.code,'timeout');
 assert.equal(diagnosticReport({recentErrors:[event]}).recentErrors[0].operation,operation);
 assert.ok(!JSON.stringify(event).includes('private'));
}
assert.equal(diagnosticError({operation:'private@example.com',message:'error'}).operation,undefined);
// Any operation name the host uses survives, and an unclassified failure keeps a fixed kind and its error type.
{
 const event=diagnosticError({operation:'localAgent',name:'WorldletError',message:'/Users/alex/.hermes/config.yaml is missing'});
 assert.deepEqual(event,{at:undefined,area:'native',code:'operationFailed',operation:'localAgent',rule:'missing',errorType:'WorldletError'});
 assert.deepEqual(diagnosticReport({recentErrors:[event]}).recentErrors[0],event);
 assert.equal(diagnosticError({message:'hermes exited with code 2'}).rule,'processExit');
 assert.equal(diagnosticError({message:'EACCES: permission denied'}).rule,'permission');
 assert.equal(diagnosticError({message:'something private'}).rule,'other');
 assert.equal(diagnosticError({message:'rate limit'}).rule,undefined);
 assert.equal(diagnosticError({message:'x',name:'alex@example.com'}).errorType,undefined);
 assert.equal(diagnosticReport({recentErrors:[{code:'operationFailed',rule:'private text'}]}).recentErrors[0].rule,undefined);
}

for(const message of ['Attention title must be concise','Attention reason must be at most 8 words','Non-Calendar events need eventDisposition','Invalid item ownership']){
 const error=diagnosticError({message:message+' private@example.com',operation:'worldItemSave'});
 assert.equal(error.code,'outputValidation');
 assert(!JSON.stringify(error).includes('private@example.com'));
 assert.equal(diagnosticReport({recentErrors:[error]}).recentErrors[0].code,'outputValidation');
}
