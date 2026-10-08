import assert from 'node:assert/strict';
import {withProductAnalytics,withFoxTurnAnalytics} from '../ui/shell/product-analytics.ts';
import {foxTiming,foxTimingEvent,timingBucket,updateWaitBucket} from '../core/diagnostics/index.ts';
let enabled=true,fail=false,telemetryFails=false;
const events:any[]=[];
const {call,track}=withProductAnalytics(async(action:string,body:any={})=>{
 if(action==='usageEvent'){if(telemetryFails)throw Error('offline');events.push(body);return {};}
 if(fail)throw Error('private server detail secret@example.com');
 return {ok:true,connected:true,text:'private reply'};
},()=>enabled);
await call('connect',{provider:'google',token:'secret'});
const chat=withFoxTurnAnalytics(body=>call('agentChat',body),async(action:string,body:any={})=>{events.push(body);},()=>enabled);
await chat({text:'private message'});
fail=true;await assert.rejects(call('original',{id:'private-source'}));fail=false;
await new Promise(resolve=>setTimeout(resolve,0));
assert.deepEqual(events.map(e=>e.event),['google_connect_started','google_connect_completed','fox_turn_started','fox_turn_completed','content_read_started','content_read_failed']);
assert.ok(!JSON.stringify(events).match(/private|secret|token|@/));
assert.equal(events.at(-1).error_code,'operationFailed','A failure carries only its classified code');
assert.ok(events.filter(e=>!e.event.endsWith('_failed')).every(e=>!('error_code' in e)));
const count=events.length;enabled=false;await call('agentChat',{id:'00000000-0000-4000-8000-000000000001',text:'Fixture'});track('applet_opened');await new Promise(resolve=>setTimeout(resolve,0));assert.equal(events.length,count);
enabled=true;track('applet_opened');enabled=false;await new Promise(resolve=>setTimeout(resolve,0));assert.equal(events.length,count,'Queued events must recheck consent before dispatch');
enabled=true;telemetryFails=true;assert.deepEqual(await call('agentChat',{id:'00000000-0000-4000-8000-000000000001',text:'Fixture'}),{ok:true,connected:true,text:'private reply'});
console.log('PASS: explicit events, unchanged request outcomes, sample exclusion, private payload exclusion and analytics failure isolation');

// Full turn boundary: no model request required to report preflight errors or routed replies.
const outcomes:any[]=[];const report=async(_action,body)=>{outcomes.push(body);};
for(const [reply,event] of [[{message:'reply'},'completed'],[{cancelled:true},'cancelled'],[{ok:false},'failed'],[{error:'private'},'failed']] as const){
 const run=withFoxTurnAnalytics(async()=>reply,report);
 assert.equal(await run({text:'private'}),reply);
 await Promise.resolve();assert.equal(outcomes.at(-1).event,'fox_turn_'+event);
}
for(const [message,code] of [['Request timed out after 60s (secret)','timeout'],['invalid_grant for private@example.com','authentication'],['rate limit reached','quota']]){
 const run=withFoxTurnAnalytics(async()=>{throw Error(message);},report);
 await assert.rejects(run({}));await Promise.resolve();
 assert.deepEqual([outcomes.at(-1).event,outcomes.at(-1).error_code],['fox_turn_failed',code]);
 assert.doesNotMatch(JSON.stringify(outcomes.at(-1)),/secret|private|grant|60s/);
}
await withFoxTurnAnalytics(async()=>({error:'Network unreachable'}),report)({});await Promise.resolve();
assert.equal(outcomes.at(-1).error_code,'offline');
for(const error of [Error('model unavailable'),new DOMException('stopped','AbortError')]){
 const run=withFoxTurnAnalytics(async()=>{throw error;},report);
 await assert.rejects(run({}),e=>e===error);await Promise.resolve();
 assert.equal(outcomes.at(-1).event,error.name==='AbortError'?'fox_turn_cancelled':'fox_turn_failed');
}
const before=outcomes.length;
await withFoxTurnAnalytics(async()=>({message:'greeting'}),report)({invitation:true});
await withFoxTurnAnalytics(async()=>({message:'practice'}),report,()=>false)({});
await Promise.resolve();assert.equal(outcomes.length,before);
const countBefore=events.length;await call('agentChat',{id:'00000000-0000-4000-8000-000000000001',text:'Fixture'});await Promise.resolve();assert.equal(events.length,countBefore,'Raw agent calls must not duplicate visible turn counts');
assert.ok(!JSON.stringify(outcomes).match(/private|unavailable|message|text/));
console.log('PASS: visible-turn outcomes, preflight failure, cancellation, greeting/practice exclusion and no agent-call double counting');

const {withToolAnalytics}=await import('../ui/shell/product-analytics.ts');
const toolEvents:any[]=[];
const toolHost=async(_action,body)=>{toolEvents.push(body);};
const execute=withToolAnalytics(async(name,args)=>name==='read_content'?{text:args.secret}:name==='automate_browser'?{error:'private URL'}:{cancelled:true},toolHost);
assert.deepEqual(await execute('read_content',{secret:'private record'},{}),{text:'private record'});
await execute('automate_browser',{url:'https://private.example'},{});
await execute('user-defined-private-tool',{},{});
await Promise.resolve();
assert.deepEqual(toolEvents.map(e=>[e.event,e.tool_category]),[
 ['world_tool_started','reading'],['world_tool_completed','reading'],
 ['world_tool_started','browser'],['world_tool_failed','browser'],
 ['world_tool_started','other'],['world_tool_cancelled','other']]);
assert.doesNotMatch(JSON.stringify(toolEvents),/private|secret|https/);
const beforeTools=toolEvents.length;
await withToolAnalytics(async()=>({ok:true}),toolHost,()=>false)('read_content',{},{});
await Promise.resolve();assert.equal(toolEvents.length,beforeTools);
const sourceEvents:any[]=[];
const sources=withProductAnalytics(async(action:string,body:any={})=>action==='usageEvent'?(sourceEvents.push(body),{}):{connected:false});
await sources.call('connect',{provider:'notion',token:'private'});
await sources.call('disconnectSource',{provider:'notion'});
await Promise.resolve();
assert.deepEqual(sourceEvents.map(e=>e.event),['source_connect_started','source_connect_failed','source_disconnect_started','source_disconnect_completed']);
assert.equal(sourceEvents[0].operation,'connect');
console.log('PASS: World tool outcomes/categories, private argument exclusion and non-Google connection outcomes');

const confirmedEvents:any[]=[];let outcomeStatus='unconfirmed';
const outcome=withProductAnalytics(async(action:string,body:any={})=>action==='usageEvent'?(confirmedEvents.push(body),{}):{status:outcomeStatus,url:'https://private.example',body:'private message'});
await outcome.call('notionReview',{operation:'check',id:'local-review'});
assert.equal(confirmedEvents.length,0);
outcomeStatus='verified';await outcome.call('notionReview',{operation:'check',id:'local-review'});
outcomeStatus='user_confirmed';await outcome.call('browserOutcomeAction',{id:'local-browser',done:true});
outcomeStatus='sent';await outcome.call('emailAction',{operation:'reconcile',id:'local-mail'});
await Promise.resolve();
assert.deepEqual(confirmedEvents.map(e=>e.outcome_type),['notion_content','browser_user_confirmation','email_delivery']);
assert.ok(confirmedEvents.every(e=>e.event==='external_outcome_confirmed'&&/^[a-f0-9]{64}$/.test(e.outcome_key)));
assert.doesNotMatch(JSON.stringify(confirmedEvents),/private|local-review|local-browser|local-mail|https/);
console.log('PASS confirmed outcomes are separate from tool success, receipt IDs hashed and private text excluded');

// Trigger and real use: only the person's own trusted gesture (transient user activation) outside Fox's tool steps is
// `user`; Fox's tools, restores and anything without a fresh gesture are `background`. user_engaged is reported only then.
{
 const {eventTrigger,reportEngagement,asFoxAction,personGesture}=await import('../ui/shell/product-analytics.ts');
 const activation={isActive:false};
 Object.defineProperty(globalThis.navigator,'userActivation',{value:activation,configurable:true});
 const page=new EventTarget(),engaged:any[]=[];
 (globalThis as any).window=page;page.addEventListener('worldlet:product-event',(e:Event)=>engaged.push((e as CustomEvent).detail));
 const seen:any[]=[];
 const host=withProductAnalytics(async(action:string,body:any={})=>action==='usageEvent'?(seen.push(body),{}):{ok:true});
 assert.equal(personGesture(),false);assert.equal(eventTrigger(),'background','no gesture: background');
 await host.call('worldItemStatus',{id:'private-item',status:'done'});
 activation.isActive=true;
 assert.equal(eventTrigger(),'user','a real click or key just happened');
 await host.call('worldItemStatus',{id:'private-item',status:'done'});
 // Fox's tool step runs while the person's gesture is still fresh: still Fox's doing.
 const tool=withToolAnalytics((name,args)=>host.call('worldItemStatus',{id:args.id,status:'dismissed'}),async()=>{});
 await tool('perform_action',{id:'private-item'},{});
 assert.equal(asFoxAction(()=>eventTrigger()),'background');
 await Promise.resolve();await new Promise(resolve=>setTimeout(resolve,0));
 assert.deepEqual(seen.filter(e=>e.event==='item_update_started').map(e=>e.trigger),['background','user','background'],'trigger decided at the start');
 assert.ok(seen.filter(e=>e.event==='item_update_completed').every((e,i)=>e.trigger===['background','user','background'][i]),'outcomes carry the start trigger');
 assert.doesNotMatch(JSON.stringify(seen),/private/);
 reportEngagement('fox_message');asFoxAction(()=>reportEngagement('applet_open'));
 activation.isActive=false;reportEngagement('applet_open');
 assert.deepEqual(engaged,[{event:'user_engaged',engagement_kind:'fox_message'}],'only the person\'s own message with a fresh gesture; never inside Fox\'s step or without a gesture');
 delete (globalThis as any).window;delete (globalThis.navigator as any).userActivation;
 console.log('PASS trigger user only after a trusted gesture and outside Fox\'s tools; user_engaged from the World page needs a fresh gesture');
}

const {exceptionReport}=await import('../core/diagnostics/index.ts');
const thrown=new TypeError('Cannot read properties of undefined (reading secret@example.com)');
thrown.stack=`TypeError: Cannot read properties of undefined (reading secret@example.com)
    at WorldStore.snapshot (/Users/alex/Applications/Worldlet.app/Contents/Resources/app.asar/out/main.js:812:19)
    at async Router.dispatch [as dispatch] (C:\\Users\\Alex\\AppData\\Local\\Worldlet\\resources\\app.asar\\out\\main.js:40:7)
    at worldlet://app/index.js?token=private:3:9
    at node:internal/process/task_queues:95:5`;
const crash=exceptionReport({name:thrown.name,message:thrown.message,stack:thrown.stack,area:'main',operation:'snapshot'});
assert.equal(crash.type,'TypeError');assert.equal(crash.code,'operationFailed');assert.equal(crash.level,'error');assert.equal(crash.handled,false);
assert.deepEqual(crash.frames.map(f=>[f.filename,f.function,f.lineno,f.in_app]),[
 ['task_queues','?',95,false],['index.js','?',3,true],['main.js','Router.dispatch',40,true],['main.js','WorldStore.snapshot',812,true]]);
assert.doesNotMatch(JSON.stringify(crash),/secret|kelvin|Alex|Users|token|private|properties/);
const offline=exceptionReport({name:'<script>',message:'Network unreachable',stack:'',area:'host',operation:'agentChat; DROP'});
assert.deepEqual([offline.type,offline.code,offline.level,offline.handled,offline.operation,offline.frames.length],['Error','offline','warning',true,'',0]);
// A rejected World item names its rule as a fixed tag, never the text (three background rejections on 2026-10-03
// could not be traced from operationFailed alone).
for(const [message,code,rule] of [['Invalid Applet candidate title.','outputValidation','candidateField'],['Events need a date and time zone.','outputValidation','eventTime'],
 ['Invalid world item: event.','outputValidation','eventLabel'],
 ['Attention event subject must name the account, merchant or incident using only words and masked digits quoted in its cited sources; omit event when identity is uncertain.','outputValidation','eventLabel'],
 ['Attention dueAt needs an evidence-backed ISO8601 date, with timezone for a clock time.','outputValidation','attentionTime'],
 ['Read sources in this turn before saving findings.','outputValidation','unread'],
 ['A world item needs source references.','outputValidation','itemShape'],['Invalid event disposition.','outputValidation','eventDisposition'],['Invalid world item: title.','outputValidation','itemShape'],['Invalid item ownership.','outputValidation','ownership'],
 ['Attention context changed. Read the latest evidence before proposing it again.','outputValidation','contextChanged'],['Attention needs model-written title, reason and summary.','outputValidation','attentionText'],
 ['Source evidence was not read or cannot be verified.','evidenceMismatch','evidence'],['secret@example.com broke','operationFailed','other']]){
 const saved=exceptionReport({name:'WorldletError',message,stack:'',area:'host',operation:'worldItemSave'});
 assert.deepEqual([saved.code,saved.rule],[code,rule],message);assert.doesNotMatch(JSON.stringify(saved),/secret|Invalid|Events/);
}
assert.equal('rule' in crash,false,'only World item saves carry a rule');
console.log('PASS exception projection: type, failure code and sanitized frames only; no message, path, query or user name; World item rejections name their rule');

// Fox and startup timings reach PostHog only as buckets of an allowlisted row; running turns and steering send nothing.
{
 const id='0b9f4c62-3c1e-4f5e-9a51-6d1c7e2b8a10';
 assert.deepEqual([999,1000,4999,14999,59999,299999,899999,900000,-1,NaN,'5'].map(timingBucket),['under_1s','1_5s','1_5s','5_15s','15_60s','1_5m','5_15m','over_15m','','','']);
 assert.deepEqual(foxTimingEvent(foxTiming({id,outcome:'complete',completeMs:7200,firstTextMs:2100,modelMs:6000,toolsMs:400,prompt:'secret'})),
  {event:'fox_timing',duration:'5_15s',dimensions:{timing_outcome:'complete',first_text_bucket:'1_5s',model_bucket:'5_15s',tools_bucket:'under_1s'}});
 assert.deepEqual(foxTimingEvent(foxTiming({id,outcome:'error',completeMs:61000})),{event:'fox_timing',duration:'1_5m',dimensions:{timing_outcome:'error'}});
 assert.equal(foxTimingEvent(foxTiming({id,outcome:'running',completeMs:900})),null);
 assert.equal(foxTimingEvent(foxTiming({id,outcome:'complete',completeMs:900,parentId:id})),null);
 assert.equal(foxTimingEvent(foxTiming({id,outcome:'complete'})),null);
 assert.deepEqual(foxTimingEvent(foxTiming({id,kind:'startup',outcome:'complete',revealedMs:3400,firstFrameMs:800})),{event:'app_startup_timing',duration:'1_5s',dimensions:{first_frame_bucket:'under_1s'}});
 assert.equal(foxTimingEvent(null),null);
 assert.deepEqual([0,3_599_999,3_600_000,86_399_999,86_400_000,604_799_999,604_800_000,-1,NaN].map(updateWaitBucket),['under_1h','under_1h','1_24h','1_24h','1_7d','1_7d','over_7d','','']);
 console.log('PASS Fox and startup timings leave the device only as buckets of finished, allowlisted rows');
}

// Setup with a local Agent (core/diagnostics/setup-events.ts): product IDs, coarse counts and outcomes only.
{
 const {agentBringDimensions,agentsDetectedDimensions,countBucket}=await import('../core/diagnostics/index.ts');
 assert.deepEqual([0,-3,NaN,'9',1,9,10,99,100,999,1000,25000].map(countBucket),['0','0','0','0','1_9','1_9','10_99','10_99','100_999','100_999','1000_plus','1000_plus']);
 assert.deepEqual(agentsDetectedDimensions([],null),{agents_found:'0',recommended_agent:'none'});
 assert.deepEqual(agentsDetectedDimensions([{id:'openclaw'},{id:'codex'},{id:'claude-code'},{id:'pi'}],'codex'),{agents_found:'3_plus',recommended_agent:'codex'});
 assert.equal(agentsDetectedDimensions([{id:'x'}],'/Users/me/bin/agent').recommended_agent,'none','Never a path');
 const bring=agentBringDimensions('openclaw',{conversations:412,notes:31,skills:4,routines:0,model:true,memory:true,list:[{title:'#diet-and-health'}]} as any,[{outcome:'ported'},{outcome:'reconnect'},{outcome:'stays'},{outcome:'connected'}]);
 assert.deepEqual(bring,{local_agent:'openclaw',bring_conversations:'100_999',bring_notes:'10_99',bring_skills:'1_9',bring_routines:'0',bring_model:'yes',bring_memory:'yes',integrations_came_over:'1_9',integrations_reconnect:'1_9'});
 assert.ok(!JSON.stringify(bring).includes('diet'),'Conversation titles never leave the device');
 console.log('PASS: setup Agent events carry the Agent ID, bucketed counts and outcomes, never titles or paths');
}
