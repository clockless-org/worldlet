import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {harnessChatThread,harnessNoCallsNote,harnessService,harnessSessionName,harnessToolsLine,localHarnessTurn,openClawCallArgs,openClawCallChunkKey,openClawCallPlacing,openClawCallRecord,openClawCallResult,openClawHangUpArgs,openClawHarnessCall,openClawHarnessCalls,openClawHarnessTools,openClawVoiceCallStore} from '../core/agent/index.ts';
import {callAttentionId,callBrief,conversationCallBrief,callLine,callLive,callMatters,callNumber,callObservation,callOpening,callOriginal,callReportDue,callSeconds,callStatus,callThread,callsForAttention,validCallAttentionId} from '../core/ongoing/index.ts';
import {harnessCalls,openClawVoiceCallDir,readHarnessCalls} from '../platform/electron/src/modules/agent-runtime/harness-services.ts';
import {installHarnessCalls} from '../platform/electron/src/modules/ongoing/harness-calls.ts';
import {mountHarnessCall} from '../ui/companion/fox-call.ts';
import {withTempDir} from './test-temp.ts';

// The `calls` Harness service (contracts/HARNESS.md#harness-services-v2): Core's reading of OpenClaw's voice-call
// records, the Harness-neutral World rules (Attention, the phone, Fox's one line back in the thread that asked), then
// the host's read-only reader against fixture voice-call stores (the plugin-state SQLite rows and the older JSONL).

// Declarations: OpenClaw reads its calls from its folder; Hermes Agent keeps no call record; the others have no calls.
assert.equal(harnessService('openclaw','calls'),'files');
for(const id of ['hermes','claude-code','codex','pi','remote']){assert.equal(harnessService(id,'calls'),null,id);assert.equal(harnessCalls(id),null,id);}

// Core: a voice-call record as the World's call ----------------------------------------------------------------
const t0=1_790_000_000_000;
const base={callId:'c1',provider:'twilio',direction:'outbound',from:'+15550001111',to:'+15552223333',startedAt:t0,transcript:[],processedEventIds:[]};
const done={...base,state:'completed',answeredAt:t0+5_000,endedAt:t0+185_000,endReason:'completed',sessionKey:'voice:15552223333',agentId:'main',
 transcript:[{timestamp:t0+6_000,speaker:'bot',text:'Hi, calling to book a table for two on Friday.',isFinal:true},{timestamp:t0+9_000,speaker:'user',text:'umm',isFinal:false},{timestamp:t0+12_000,speaker:'user',text:'Friday at seven works.',isFinal:true}],
 metadata:{initialMessage:'Book a table for two on Friday',mode:'conversation',requesterSessionKey:'agent:main:worldlet-private-main-0a1b2c3d'}};
const call=openClawHarnessCall(done)!;
assert.deepEqual(call,{id:'openclaw:c1',direction:'outbound',peer:'+15552223333',startedAt:t0,answeredAt:t0+5_000,endedAt:t0+185_000,outcome:'completed',
 transcript:[{speaker:'agent',text:'Hi, calling to book a table for two on Friday.',at:t0+6_000},{speaker:'peer',text:'Friday at seven works.',at:t0+12_000}],
 message:'Book a table for two on Friday',requestedBy:'agent:main:worldlet-private-main-0a1b2c3d',agent:'main'},'final lines only, the Agent and the other party');
const outcome=(patch:Record<string,unknown>)=>openClawHarnessCall({...base,...patch})?.outcome;
assert.equal(outcome({state:'ringing'}),'in-progress');
const live=(state:string)=>openClawHarnessCall({...base,state})?.live;
assert.deepEqual(['initiated','ringing','answered','active','speaking','listening','completed'].map(live),['dialing','ringing','talking','talking','talking','talking',undefined],'where a call in progress stands, nothing once it ended');
assert.equal(outcome({state:'no-answer',endReason:'no-answer'}),'no-answer');
assert.equal(outcome({direction:'inbound',state:'hangup-user',endReason:'hangup-user'}),'missed','an inbound call nobody answered is missed');
assert.equal(outcome({direction:'inbound',state:'timeout',answeredAt:t0+1000}),'completed','a call cut at its maximum length was still answered');
assert.equal(outcome({state:'busy'}),'busy');
assert.equal(outcome({state:'voicemail',endReason:'voicemail'}),'voicemail');
assert.equal(outcome({state:'error',endReason:'error'}),'failed');
assert.equal(outcome({direction:'inbound',state:'hangup-bot',endReason:'hangup-bot',metadata:{rejectionReason:'inbound-policy'}}),'rejected');
const inbound=openClawHarnessCall({...base,direction:'inbound',from:'+15559990000',to:'+15550001111',state:'hangup-user',endReason:'hangup-user',endedAt:t0+20_000,metadata:{initialMessage:'Hello! How can I help you today?'}})!;
assert.equal(inbound.peer,'+15559990000','an inbound call is from its caller');
assert.equal(inbound.message,undefined,'the plugin greeting is not something the person asked for');
assert.equal(openClawHarnessCall({...base,direction:'sideways'}),null);
assert.equal(openClawHarnessCall({callId:'x'}),null);
assert.deepEqual(openClawHarnessCalls([{...base,state:'initiated'},{...base,callId:'c2',startedAt:t0+60_000,state:'ringing'},done]).map(c=>[c.id,c.outcome]),[['openclaw:c2','in-progress'],['openclaw:c1','completed']],'the newest snapshot of each call, newest call first');
assert.deepEqual(openClawCallRecord(JSON.stringify({version:2,call:done,persistedAt:1,sequence:2}))?.callId,'c1','a v2 envelope');
assert.equal(openClawCallRecord('{"version":2}'),null);
assert.equal(openClawCallRecord('not json'),null);
assert.equal(openClawCallChunkKey('event:abc:000001:u',3),'event:abc:000001:u:chunk:0003');
assert.equal(openClawVoiceCallStore({plugins:{entries:{'voice-call':{config:{store:' ~/calls '}}}}}),'~/calls');
assert.equal(openClawVoiceCallStore({}),'');

// The World's rules, the same for every Harness ---------------------------------------------------------------
const now=t0+200_000,day=86_400_000;
assert.equal(callSeconds(call),180,'connected time, from the answer');
assert.equal(callSeconds(inbound),null);
assert.deepEqual(callsForAttention([call,inbound,{...call,id:'old',startedAt:now-9*day,endedAt:now-9*day},{...call,id:'live',outcome:'in-progress'}],now).map(c=>c.id),['openclaw:c1',inbound.id],'ended calls of the past week, newest first');
const observation=callObservation(call,'OpenClaw');
assert.ok(validCallAttentionId(observation.id)&&observation.id===callAttentionId(call));
assert.doesNotMatch(observation.id,/555|c1/,'the id never carries the number');
assert.equal(observation.title,'Call to +15552223333');
assert.match(observation.text,/^The person's own Agent \(OpenClaw\) called \+15552223333 at .* UTC\. Outcome: answered and finished, 3 min\. If the call left the person something to do .*worth doing; otherwise it is worth knowing/);
assert.match(observation.text,/What the Agent was asked to say: Book a table/);
assert.match(observation.text,/Transcript:\n\[\d\d:\d\d\] OpenClaw: Hi, calling.*\n\[\d\d:\d\d\] Them: Friday at seven works\./);
const missed=callObservation(inbound,'OpenClaw');
assert.equal(missed.title,'Missed call from +15559990000');
assert.match(missed.text,/^\+15559990000 called the person's own Agent \(OpenClaw\) .* Outcome: missed.*Worth doing: a call the person missed; they may want to call back\./);
assert.deepEqual(callOriginal({title:missed.title,text:missed.text}),{title:missed.title,text:missed.text});
assert.ok(callMatters(inbound)&&!callMatters(call)&&!callMatters({direction:'inbound',outcome:'rejected'}),'someone calling the Agent reaches the phone; a call Fox placed is reported in its thread');

// Fox's one line, in the thread whose resident session placed the call.
const main=harnessSessionName({world:'private',thread:'main'}),card=harnessSessionName({world:'private',thread:'item:item-7'});
const owned=new Map([[card,'item:item-7'],[main,'main']]);
assert.equal(callThread({requestedBy:'agent:main:'+main},owned),'main','OpenClaw files the session under its agent');
assert.equal(callThread({requestedBy:card},owned),'item:item-7');
assert.equal(callThread({requestedBy:'agent:main:discord:channel:1'},owned),null,'a call the Agent placed elsewhere has no Fox thread');
assert.equal(callThread({},owned),null);
assert.equal(harnessChatThread('main'),'fox-main');
assert.equal(harnessChatThread('item:item-7'),JSON.stringify(['attention:item-7','']));
assert.equal(harnessChatThread('applet:job-1'),JSON.stringify(['object:app-job-1','']));
assert.equal(callLine(call),'The call to +15552223333 is done (3 min). Last thing they said: “Friday at seven works.”');
assert.equal(callLine({...call,summary:'Table booked for Friday at 7.'}),'The call to +15552223333 is done (3 min). Table booked for Friday at 7.');
assert.equal(callLine({...call,outcome:'no-answer'}),'The call to +15552223333 was not answered.');
assert.equal(callLine({...call,outcome:'busy'}),'+15552223333 was busy.');
assert.equal(callLine({...call,transcript:[],answeredAt:t0+150_000}),'The call to +15552223333 is done (35 s).');
assert.ok(callReportDue(call,now)&&!callReportDue(call,now+13*3_600_000)&&!callReportDue({...call,outcome:'in-progress'},now));

// For Fox: the tools line promises the report only where calls come back.
const tools=openClawHarnessTools({plugins:{entries:{'voice-call':{}}}});
assert.match(harnessToolsLine(tools,{calls:true}),/make phone calls.*When you place a phone call for the person, say so in one line and do not wait for it: Worldlet tells them here how it went once it ends\.$/);
assert.doesNotMatch(harnessToolsLine(tools),/Worldlet tells them/,'no calls service, no promise');
assert.doesNotMatch(harnessToolsLine(tools.filter(t=>t.kind!=='call'),{calls:true}),/Worldlet tells them/,'no call tool, no promise');
assert.match(localHarnessTurn({text:'Call the restaurant'},{own:true,resident:true,harnessTools:tools,harnessCalls:true}).system,/Worldlet tells them here how it went/);

// Calling from an Applet: the brief the person confirms, what the Agent says first, and its status as it runs ----------
assert.equal(callNumber('+1 (555) 222-3333'),'+15552223333');
assert.equal(callNumber('0044 20 7946 0958'),'+442079460958');
for(const bad of ['555-2233','(555) 222-3333','+0123456789','anna@example.com','+1 555',null])assert.equal(callNumber(bad),null,String(bad)+': never a guessed country code');
assert.match((callBrief({to:'555',why:'x'}) as any).error,/full international number/);
assert.match((callBrief({to:'+15552223333'}) as any).error,/why your Agent is calling/);
const brief=callBrief({to:'+1 555 222 3333',who:'Anna Lee',why:'  about dinner on Friday. ',ask:'Can we move it to seven?',from:'Messages'}) as any;
assert.deepEqual(brief,{to:'+15552223333',who:'Anna Lee',behalf:'someone you know',why:'about dinner on Friday.',ask:'Can we move it to seven?',from:'Messages'});
assert.equal(callOpening(brief),'Hi Anna, this is an AI assistant calling for someone you know, about dinner on Friday. Can we move it to seven?','it says it is an AI assistant, for whom, why and the ask');
assert.equal(callOpening({...brief,who:'+15552223333',ask:''}),'Hi, this is an AI assistant calling for someone you know, about dinner on Friday.');
assert.ok(callOpening({...brief,ask:'x'.repeat(900)}).length<=600);
// Messages: one person at a phone number; why from what they said last, the ask from the person's unanswered question.
const chat={title:'Anna Lee',participants:['+15552223333'],messages:[{fromMe:false,text:'Dinner Friday?'},{fromMe:true,text:'Sure. Can we make it seven?'}]};
assert.deepEqual(conversationCallBrief(chat,'Messages'),{to:'+15552223333',who:'Anna Lee',behalf:'the person you’ve been messaging',why:'following up on their last message',ask:'Sure. Can we make it seven?',from:'Messages'});
assert.equal(conversationCallBrief({...chat,messages:[{fromMe:true,text:'See you'},{fromMe:false,text:'Bring the  keys\nplease'}]},'Messages')!.why,'about your message “Bring the keys please”');
assert.equal(conversationCallBrief({...chat,title:'+15552223333'},'Messages')!.who,'','a number is not a name');
assert.equal(conversationCallBrief({...chat,participants:['anna@example.com']},'Messages'),null,'an email address has no number to call');
assert.equal(conversationCallBrief({...chat,group:true},'Messages'),null);
assert.equal(conversationCallBrief({...chat,participants:['+15552223333','+15554445555']},'Messages'),null);
const ringing={...call,outcome:'in-progress' as const,live:'ringing' as const,endedAt:undefined,answeredAt:undefined};
assert.equal(callStatus({...ringing,live:'dialing'},t0,'Anna'),'Calling Anna…');
assert.equal(callStatus(ringing,t0),'Ringing +15552223333…');
assert.equal(callStatus({...ringing,direction:'inbound'},t0,'Anna'),'Anna is calling…');
assert.equal(callStatus({...ringing,live:'talking',answeredAt:t0+5_000},t0+70_000,'Anna'),'On the call with Anna · 1:05');
assert.equal(callStatus(call,now,'Anna'),'The call to Anna is done (3 min). Last thing they said: “Friday at seven works.”');
assert.ok(callLive(ringing,t0+60_000)&&!callLive(ringing,t0+3*3_600_000)&&!callLive(call,now),'a stale record is not shown live');
// OpenClaw: dialing is set up when its plugin is enabled with a provider, through the plugin's own commands.
assert.match((openClawCallPlacing({}) as any).note,/openclaw plugins install @openclaw\/voice-call/);
assert.match((openClawCallPlacing({plugins:{entries:{'voice-call':{enabled:false}}}}) as any).note,/turned off.*openclaw voicecall setup/);
assert.match((openClawCallPlacing({plugins:{entries:{'voice-call':{enabled:true,config:{}}}}}) as any).note,/no phone provider/);
assert.deepEqual(openClawCallPlacing({plugins:{entries:{'voice-call':{enabled:true,config:{provider:'twilio'}}}}}),{ready:true});
assert.deepEqual(openClawCallArgs({to:'+15552223333',message:'Hi.'}),['voicecall','call','--to','+15552223333','--message','Hi.','--mode','conversation']);
assert.deepEqual(openClawHangUpArgs('c9'),['voicecall','end','--call-id','c9']);
assert.deepEqual(openClawCallResult(0,'{\n  "callId": "c9"\n}\n'),{id:'openclaw:c9'});
assert.deepEqual(openClawCallResult(1,'','Error: Missing --to and no toNumber configured'),{error:'Missing --to and no toNumber configured'});
assert.deepEqual(openClawCallResult(0,'{"callId":"bad id; rm"}'),{error:'Your Agent could not place the call.'});
// Hermes Agent: no calls service, and Fox says plainly why and how to get one; never a made-up command of its own.
const hermesNote=harnessNoCallsNote('hermes');
assert.match(hermesNote,/telephony skill .* keeps no record/);assert.match(hermesNote,/openclaw plugins install @openclaw\/voice-call/);
assert.doesNotMatch(hermesNote,/hermes [a-z]+ /,'no Hermes command it does not have');
assert.match(harnessNoCallsNote('pi'),/^Your Agent has no phone calling Worldlet can use\. To have your Agent call/);

// The host's reader against fixture voice-call stores -------------------------------------------------------------
await withTempDir('worldlet-harness-calls-',async home=>{
 const env={HOME:home};
 const state=path.join(home,'.openclaw'),store=path.join(state,'voice-calls');
 assert.equal(openClawVoiceCallDir(home,env),store,'the default store below the OpenClaw state folder');
 assert.deepEqual(readHarnessCalls('openclaw',home,env),[],'no store, no calls');
 fs.mkdirSync(path.join(store,'state'),{recursive:true});
 const db=new DatabaseSync(path.join(store,'state','openclaw.sqlite'));
 db.exec(`CREATE TABLE plugin_state_entries(plugin_id TEXT NOT NULL,namespace TEXT NOT NULL,entry_key TEXT NOT NULL,value_json TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER,PRIMARY KEY(plugin_id,namespace,entry_key)) STRICT`);
 const put=db.prepare('INSERT INTO plugin_state_entries VALUES(?,?,?,?,?,NULL)');
 let sequence=0;
 // As the plugin persists a snapshot: its chunks first (base64 of at most 48128 bytes each), then its metadata row.
 const persist=(database:DatabaseSync,value:unknown,at:number,size=48128)=>{
  const insert=database===db?put:database.prepare('INSERT INTO plugin_state_entries VALUES(?,?,?,?,?,NULL)');
  const bytes=Buffer.from(JSON.stringify(value)),count=Math.max(1,Math.ceil(bytes.length/size)),key=`event:${at.toString(36)}:${String(sequence).padStart(6,'0')}:u${sequence}`;
  for(let index=0;index<count;index++)insert.run('voice-call','call-record-event-chunks',openClawCallChunkKey(key,index),JSON.stringify({index,dataBase64:bytes.subarray(index*size,(index+1)*size).toString('base64')}),at);
  insert.run('voice-call','call-record-events',key,JSON.stringify({chunkCount:count,byteLength:bytes.length,persistedAt:at,sequence:sequence++}),at);
 };
 persist(db,{...base,state:'initiated',metadata:done.metadata},t0);
 persist(db,done,t0+185_000,64);
 persist(db,{...base,callId:'in1',direction:'inbound',from:'+15559990000',to:'+15550001111',startedAt:t0+300_000,state:'hangup-user',endReason:'hangup-user',endedAt:t0+320_000},t0+320_000);
 // A snapshot whose chunk went missing is skipped, never half read.
 put.run('voice-call','call-record-events','event:broken:000099:x',JSON.stringify({chunkCount:2,byteLength:10,persistedAt:t0,sequence:99}),t0);
 db.close();
 const calls=readHarnessCalls('openclaw',home,env);
 assert.deepEqual(calls.map(c=>[c.id,c.outcome,c.peer]),[['openclaw:in1','missed','+15559990000'],['openclaw:c1','completed','+15552223333']],'the newest snapshot of each call, reassembled from many chunks');
 assert.equal(calls[1].transcript.length,2);
 assert.equal(calls[1].requestedBy,'agent:main:worldlet-private-main-0a1b2c3d');

 // A subscription hands each call over once, and again when it changes.
 const seen:string[]=[];
 const stop=harnessCalls('openclaw',home,env,20)!.subscribe(c=>seen.push(c.id+' '+c.outcome));
 const again=new DatabaseSync(path.join(store,'state','openclaw.sqlite'));
 persist(again,{...base,callId:'c3',to:'+15554445555',startedAt:t0+400_000,state:'ringing'},t0+400_000);
 await new Promise(resolve=>setTimeout(resolve,80));
 persist(again,{...base,callId:'c3',to:'+15554445555',startedAt:t0+400_000,state:'no-answer',endReason:'no-answer',endedAt:t0+430_000},t0+430_000);
 again.close();
 await new Promise(resolve=>setTimeout(resolve,80));
 stop();
 assert.deepEqual(seen,['openclaw:c1 completed','openclaw:in1 missed','openclaw:c3 in-progress','openclaw:c3 no-answer']);

 // A configured store elsewhere; the older calls.jsonl when it has no plugin-state rows yet.
 fs.writeFileSync(path.join(state,'openclaw.json'),JSON.stringify({plugins:{entries:{'voice-call':{enabled:true,config:{store:'~/calls'}}}}}));
 const legacy=path.join(home,'calls');
 assert.equal(openClawVoiceCallDir(home,env),legacy,'`~` is the home');
 fs.mkdirSync(legacy,{recursive:true});
 fs.writeFileSync(path.join(legacy,'calls.jsonl'),[JSON.stringify({...base,callId:'j1',state:'ringing'}),'garbage',JSON.stringify({version:2,call:{...base,callId:'j1',state:'busy',endReason:'busy',endedAt:t0+9000},persistedAt:t0+9000,sequence:1})].join('\n')+'\n');
 assert.deepEqual(readHarnessCalls('openclaw',home,env).map(c=>[c.id,c.outcome]),[['openclaw:j1','busy']]);
 // Read only: the store is as it was.
 assert.equal(fs.readdirSync(legacy).join(','),'calls.jsonl');
 assert.deepEqual(readHarnessCalls('hermes',home,env),[]);

 // Dialing through the plugin's own command line, then following the call live: once placed, the store is read every
 // 1.5 s instead of every 30 s, so each status change and transcript line shows as the call runs.
 assert.equal(harnessCalls('openclaw',home,env)!.place,undefined,'no command, nothing to dial with');
 const ran:string[][]=[];
 const snapshot=(patch:Record<string,unknown>)=>fs.appendFileSync(path.join(legacy,'calls.jsonl'),JSON.stringify({...base,callId:'w1',to:'+15552223333',startedAt:Date.now(),...patch})+'\n');
 const dialer=harnessCalls('openclaw',home,env,10_000,async args=>{ran.push(args);if(args[1]==='call')snapshot({state:'initiated'});return {code:0,stdout:args[1]==='call'?'{"callId":"w1"}':'',stderr:''};})!;
 assert.match((dialer.placing!() as any).note,/no phone provider/,'its plugin has no provider yet');
 await assert.rejects(dialer.place!({to:'+15552223333',message:'Hi.'}),/no phone provider/);
 assert.deepEqual(ran,[],'nothing dialed while it is not set up');
 fs.writeFileSync(path.join(state,'openclaw.json'),JSON.stringify({plugins:{entries:{'voice-call':{enabled:true,config:{store:'~/calls',provider:'mock'}}}}}));
 const followed:string[]=[];
 const unfollow=dialer.subscribe(c=>{if(c.id==='openclaw:w1')followed.push(c.live??c.outcome);});
 assert.deepEqual(await dialer.place!({to:'+15552223333',message:'Hi, this is an AI assistant.'}),{id:'openclaw:w1'});
 assert.deepEqual(ran,[['voicecall','call','--to','+15552223333','--message','Hi, this is an AI assistant.','--mode','conversation']]);
 assert.deepEqual(followed,['dialing'],'read at once when it is placed');
 snapshot({state:'speaking',answeredAt:Date.now(),transcript:[{timestamp:Date.now(),speaker:'bot',text:'Hi, this is an AI assistant.',isFinal:true}]});
 await new Promise(resolve=>setTimeout(resolve,1_700));
 assert.deepEqual(followed,['dialing','talking'],'read again within seconds, not half a minute');
 await dialer.hangUp!('openclaw:w1');
 assert.deepEqual(ran.at(-1),['voicecall','end','--call-id','w1']);
 unfollow();
});

// The World: an Applet's Call becomes a brief to confirm, only Call dials, and every call in progress streams to the page.
{
 const actions:Record<string,(request:any)=>Promise<any>>={},events:any[]=[],placedCalls:any[]=[];
 let onCall:((c:any)=>void)|null=null,loaded:(()=>void)|null=null,ready:any={ready:true},sample=false;
 const fake={subscribe:(fn:any)=>{onCall=fn;return ()=>{};},placing:()=>ready,place:async(request:any)=>{placedCalls.push(request);return {id:'openclaw:w2'};},hangUp:async(id:string)=>{placedCalls.push({hangUp:id});}};
 let agentCalls:any=fake;
 const host={store:{writable:true,sampleEnabled:()=>sample,state:{cloudConsent:false},onChange:()=>{},ledger:()=>({}),worldItems:()=>[]},page:{event:(name:string,detail:any)=>events.push([name,detail])},
  optional:(name:string)=>name==='agent'?{harnessCalls:()=>agentCalls,harness:{id:agentCalls?'openclaw':'hermes'},status:async()=>({name:'Nova'}),home:()=>'',onChanged:()=>{}}:undefined,
  register:(found:any)=>Object.assign(actions,found),onPageLoaded:(fn:any)=>{loaded=fn;},onQuit:()=>{},diagnostics:{record:()=>{}}};
 installHarnessCalls(host as any);
 loaded!();
 assert.deepEqual(await actions.harnessCall({operation:'status'}),{ready:true});
 const prepared=await actions.harnessCall({operation:'prepare',to:'+1 555 222 3333',who:'Anna Lee',behalf:'the person you’ve been messaging',why:'about dinner',ask:'Is seven OK?',from:'Messages'});
 assert.equal(prepared.offer.opening,'Hi Anna, this is an AI assistant calling for the person you’ve been messaging, about dinner. Is seven OK?');
 assert.deepEqual(placedCalls,[],'preparing dials nothing');
 assert.match((await actions.harnessCall({operation:'prepare',to:'12',why:'x'})).error,/international number/);
 assert.deepEqual(await actions.harnessCall({operation:'place',id:prepared.offer.id,why:'about dinner on Friday',ask:'Is seven OK?'}),{ok:true,id:'openclaw:w2'});
 assert.deepEqual(placedCalls,[{to:'+15552223333',message:'Hi Anna, this is an AI assistant calling for the person you’ve been messaging, about dinner on Friday. Is seven OK?'}],'the person’s edit, once');
 await assert.rejects(actions.harnessCall({operation:'place',id:prepared.offer.id}),/no longer waiting/,'once');
 const w2={id:'openclaw:w2',direction:'outbound',peer:'+15552223333',startedAt:Date.now(),outcome:'in-progress',live:'talking',transcript:[{speaker:'peer',text:'Hello?',at:Date.now()}]};
 onCall!(w2);
 assert.deepEqual(events.at(-1),['worldlet:harness-call',{call:w2,who:'Anna Lee',from:'Messages',placed:true}],'live, without asking the model first');
 await actions.harnessCall({operation:'hangUp',id:'openclaw:w2'});
 assert.deepEqual(placedCalls.at(-1),{hangUp:'openclaw:w2'});
 onCall!({...w2,id:'openclaw:other',startedAt:Date.now()-5*3_600_000});
 assert.equal(events.at(-1)[1].call.id,'openclaw:w2','a stale record nobody placed here is not shown live');
 const offer2=(await actions.harnessCall({operation:'prepare',to:'+15552223333',why:'x'})).offer;
 assert.deepEqual(await actions.harnessCall({operation:'cancel',id:offer2.id}),{ok:true});
 ready={ready:false,note:'Your OpenClaw’s Voice Call plugin is turned off.'};
 assert.deepEqual(await actions.harnessCall({operation:'prepare',to:'+15552223333',why:'x'}),ready,'not set up: how to set it up, no offer');
 agentCalls=null;
 assert.match((await actions.harnessCall({operation:'prepare',to:'+15552223333',why:'x'})).note,/^Hermes Agent’s optional telephony skill/,'no calls service: Fox says plainly how to get one');
 sample=true;
 await assert.rejects(actions.harnessCall({operation:'status'}),/practice world/);

 // Fox's card: whom, why and what to find out to edit, what it will say first, Call and Cancel; then the call live.
 class Node {textContent='';value='';disabled=false;onclick:any;type='';rows=0;maxLength=0;className='';style:any={};children:any[]=[];listeners=new Map<string,Function>();
  append(...nodes:any[]){this.children.push(...nodes);}replaceChildren(...nodes:any[]){this.children=nodes;}setAttribute(){}focus(){}addEventListener(name:string,fn:Function){this.listeners.set(name,fn);}
  get childElementCount(){return this.children.length;}get lastElementChild(){return this.children.at(-1)??null;}}
 const listeners=new Map<string,Function>();
 (globalThis as any).window={addEventListener:(event:string,fn:Function)=>listeners.set(event,fn)};
 (globalThis as any).document={createElement:()=>new Node()};
 let guide:any;const asked:any[]=[];let answer:any={ready:true,offer:{id:'call-1',to:'+15552223333',who:'Anna Lee',behalf:'the person you’ve been messaging',why:'about dinner',ask:'',from:'Messages',opening:'…'}};
 mountHarnessCall(async(action:string,args:any)=>{asked.push({action,args});return args.operation==='place'?{ok:true,id:'openclaw:w3'}:answer;},()=>({setGuide:(value:any)=>guide=value}));
 await listeners.get('worldlet:call-request')!({detail:conversationCallBrief(chat,'Messages')});
 assert.equal(asked[0].args.operation,'prepare');assert.equal(asked[0].args.to,'+15552223333');
 assert.equal(guide.text,'Call Anna Lee?');
 assert.deepEqual(guide.actions.map((b:any)=>b.textContent),['Call','Cancel']);
 const [to,why,ask,opening]=guide.body.children;
 assert.equal(to.textContent,'Anna Lee · +15552223333 · from Messages');
 assert.match(opening.textContent,/^It opens with: “Hi Anna, this is an AI assistant calling for the person you’ve been messaging, about dinner\.”$/);
 ask.children[0].value='Is seven OK?';ask.children[0].listeners.get('input')();
 assert.match(opening.textContent,/about dinner\. Is seven OK\?”$/,'the preview follows the edit');
 why.children[0].value='';ask.children[0].value='';ask.children[0].listeners.get('input')();
 assert.equal(guide.actions[0].disabled,true,'nothing to say, no Call');
 ask.children[0].value='Is seven OK?';ask.children[0].listeners.get('input')();
 await guide.actions[0].onclick();
 assert.deepEqual(asked.at(-1),{action:'harnessCall',args:{operation:'place',id:'call-1',why:'',ask:'Is seven OK?'}});
 assert.equal(guide.text,'Calling Anna Lee…');
 const w3={id:'openclaw:w3',direction:'outbound',peer:'+15552223333',startedAt:Date.now(),answeredAt:Date.now(),outcome:'in-progress',live:'talking',transcript:[{speaker:'agent',text:'Hi Anna.',at:1},{speaker:'peer',text:'Hi!',at:2}]};
 listeners.get('worldlet:harness-call')!({detail:{call:w3,who:'Anna Lee',placed:true}});
 assert.match(guide.text,/^On the call with Anna Lee · 0:0\d$/);
 assert.deepEqual(guide.body.children[0].children.map((li:any)=>li.textContent),['Your Agent: Hi Anna.','Anna Lee: Hi!']);
 assert.deepEqual(guide.actions.map((b:any)=>b.textContent),['Hang up']);
 await guide.actions[0].onclick();
 assert.deepEqual(asked.at(-1),{action:'harnessCall',args:{operation:'hangUp',id:'openclaw:w3'}});
 listeners.get('worldlet:harness-call')!({detail:{call:{...w3,outcome:'completed',live:undefined,endedAt:w3.answeredAt+65_000},who:'Anna Lee',placed:true}});
 assert.equal(guide.text,'The call to Anna Lee is done (1 min). Last thing they said: “Hi!”');
 assert.deepEqual(guide.actions,[]);
 // Without a way to call: Fox says plainly how to get one, and offers no Call.
 answer={ready:false,note:harnessNoCallsNote('hermes')};
 await listeners.get('worldlet:call-request')!({detail:conversationCallBrief(chat,'Messages')});
 assert.equal(guide.text,harnessNoCallsNote('hermes'));assert.deepEqual(guide.actions,[]);
 delete (globalThis as any).window;delete (globalThis as any).document;
}
console.log('PASS Harness calls: OpenClaw voice-call records (plugin-state chunks and calls.jsonl) read-only, outcomes, the World observation, missed calls, the phone rule and Fox reporting back to the thread that asked; calling from an Applet (a brief the person edits and confirms, dialed through the plugin’s own command), followed live, and Hermes Agent told plainly how to get calls');
