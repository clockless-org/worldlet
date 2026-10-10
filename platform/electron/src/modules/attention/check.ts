// Focused check of the Electron World tools on a real WorldStore and SQLite ledger (no Electron).
// Bundle and run from the repository root, e.g.:
//   npx esbuild platform/electron/src/modules/attention/check.ts --bundle --platform=node --format=esm --loader:.sql=text --outfile=<tmp>/attention-check.mjs && node <tmp>/attention-check.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Preferences} from '../../preferences.ts';
import {WorldStore} from '../../store/world-store.ts';
import {WORLD_TOOLS} from '../../host/services.ts';
import type {WorldToolsService} from '../../host/services.ts';
import type {ActionHandler,Host,Row} from '../../host/types.ts';
import {installAttention} from './index.ts';
import {installOngoing} from '../ongoing/index.ts';
import {installWorld} from '../world.ts';
import {ONGOING,type OngoingService} from '../../host/services.ts';
import {conversationAttentionId} from '../../../../../core/tasks/index.ts';
import {errorMessage} from '../../files.ts';
import {setTimeout as sleep} from 'node:timers/promises';

function environment(){
 const root=fs.mkdtempSync(path.join(process.env.WORLDLET_CHECK_DIR??os.tmpdir(),'worldlet-attention-'));
 const webRoot=path.resolve(process.env.WORLDLET_WEB_ROOT??'dist/WorldletWeb');
 const preferences=Preferences.at(root);
 const store=new WorldStore(root,preferences,{appName:'Worldlet Check',platform:'macos',capabilities:()=>({}),mockGoogleAvailable:false});
 const services=new Map<string,unknown>(),actions=new Map<string,ActionHandler>(),errors:string[]=[],quit:(()=>void|Promise<void>)[]=[];
 const host:Host={
  profile:{channel:'dev',worktree:'',root,title:'Worldlet Check',webRoot,resources:process.cwd(),smoke:false},
  preferences,store,
  page:{call:async()=>undefined,event:()=>{},documentEvent:()=>{},ready:()=>false},
  window:()=>null,worldView:()=>null,
  register:handlers=>{for(const [name,handler] of Object.entries(handlers))actions.set(name,handler);},
  provide:(name,service)=>{services.set(name,service);return service;},
  use:name=>{if(!services.has(name))throw Error('Missing host service '+name);return services.get(name) as any;},
  optional:name=>services.get(name) as any,
  onPageReload:()=>{},onQuit:listener=>{quit.push(listener);},onPageLoaded:()=>{},
  diagnostics:{record:(error,operation)=>{errors.push(`${operation}: ${errorMessage(error)}`);},log:()=>{}}
 };
 installAttention(host);
 const tools=host.use<WorldToolsService>(WORLD_TOOLS);
 const close=async()=>{tools.stop();for(const listener of quit)await listener();store.closeLedger();fs.rmSync(root,{recursive:true,force:true});};
 return {root,preferences,store,services,actions,errors,host,tools,close};
}
const {preferences,store,services,actions,errors,tools,close}=environment();
const action=(name:string,body:Row)=>actions.get(name)!({action:name,...body} as any,{requestId:'check',sender:null as any});
try{
 assert.ok(tools.names.includes('upsert_world_items')&&tools.names.includes('configure_world_check'));
 assert.ok(services.has('sourceChecks'),'Background source checks advertise their owner');
 assert.ok(store.runtimeRows().some(row=>row.provider==='gmail'&&row.mode==='scheduled'),'Runtime registry feeds the ledger lease policy');

 // Privacy gates: no consent, then the practice world.
 assert.equal((await tools.reply('query_world_items',{},'gate')).error,'Allow private context in your personal world first.');
 store.state.cloudConsent=true;
 store.state.connections=[{id:'hermes-gmail',provider:'gmail',target:'person@example.com',transport:'hermes',connector:'oauth',syncStatus:'connected'}];
 store.changed();
 preferences.set('worldlet.sampleEnabled',true);
 assert.equal((await tools.reply('query_world_items',{},'gate')).error,'Allow private context in your personal world first.');
 preferences.set('worldlet.sampleEnabled',false);

 // configure_world_check: Core validates, the ledger keeps the schedule and its task gate.
 assert.deepEqual(await tools.reply('configure_world_check',{provider:'gmail',enabled:true,intervalMinutes:30},'configure'),{ok:true,runsWhileAppOpen:true});
 const check=store.ledger().find('checks','gmail');
 assert.equal(check.enabled,true);assert.equal(check.intervalMinutes,30);
 const tooOften=await tools.reply('configure_world_check',{provider:'gmail',intervalMinutes:5},'configure');
 assert.equal(tooOften.error,'Choose 15–1440 minutes.');assert.match(tooOften.guidance,/Do not claim success/);
 assert.equal((await tools.reply('configure_world_check',{provider:'notion',enabled:true},'configure')).error,'Invalid source check configuration.');

 // Findings need evidence read in the same turn.
 assert.equal((await tools.reply('upsert_world_items',{items:[]},'unread')).error,'Read sources in this turn before saving findings.');
 const turn='turn-1';
 const begin=await tools.reply('_source_begin',{provider:'gmail'},turn);
 assert.equal(typeof begin.ticket,'string');
 assert.equal((await tools.reply('_source_result',{provider:'gmail',ticket:'forged',records:[]},turn)).error,'Source permission or read receipt is no longer valid.');
 const text='Subject: Project review\nFrom: Dana <dana@example.com>\n\nPlease review the project proposal by Friday. Draft: https://docs.example.com/proposal.';
 assert.deepEqual(await tools.reply('_source_result',{provider:'gmail',ticket:begin.ticket,records:[{provider:'gmail',id:'thread:abc123',title:'Project review',text,url:'https://mail.google.com/mail/u/0/#all/abc123'}]},turn),{ok:true});
 assert.equal(store.worldEvidence[turn]['gmail:thread:abc123'].text,text,'Evidence is keyed provider:id for the turn');
 assert.equal(store.ledger().find('applet-observations','gmail')?.records?.length,1,'The Applet keeps its observation');
 const item={provider:'gmail',kind:'task',title:'Review proposal',reason:'Project follow-up',summary:'The proposal needs your review before Friday.',attentionReason:'The sender asked for a review.',sources:[{provider:'gmail',id:'thread:abc123',quote:'Please review the project proposal by Friday.'}]};
 const invented=await tools.reply('upsert_world_items',{items:[{...item,sources:[{...item.sources[0],quote:'Approve the budget today.'}]}]},turn);
 assert.equal(invented.error,'Source evidence was not read or cannot be verified.');
 assert.ok(Array.isArray(invented.evidenceIssues));
 assert.deepEqual(invented.readSources,[{provider:'gmail',id:'thread:abc123',text}]);
 const saved=await tools.reply('upsert_world_items',{items:[item]},turn);
 assert.equal(saved.ok,true,JSON.stringify(saved));assert.equal(saved.ids.length,1);assert.equal(saved.requiresReview,false);
 const id=saved.ids[0];
 const stored=store.ledger().find('items',id);
 assert.deepEqual(stored.sources,[{provider:'gmail',id:'thread:abc123',quote:'Please review the project proposal by Friday.',url:'https://mail.google.com/mail/u/0/#all/abc123'}]);
 assert.deepEqual(stored.websiteURLs,['https://docs.example.com/proposal'],'Only links from verified source text are kept');
 assert.equal(stored.attentionContentVersion,1);

 // query_world_items carries the shared reports.
 const query=await tools.reply('query_world_items',{},turn);
 assert.ok(query.items.some(row=>row.id===id));
 assert.ok(Array.isArray(query.taskReviews)&&query.runtimeTasks?.supported===true&&query.operations!==undefined&&query.workflows!==undefined);
 const scoped=await tools.reply('query_world_items',{},'monitor','gmail');
 assert.ok(scoped.runtimeTasks.rows.every(row=>row.owner==='gmail'));

 // Scheduled checks cannot change user state; Fox can.
 assert.equal((await tools.reply('update_world_item',{id,status:'done'},'monitor','gmail')).error,'Scheduled checks cannot change user status or schedules.');
 assert.deepEqual(await tools.reply('update_world_item',{id,status:'done'},turn),{ok:true});
 assert.equal(store.ledger().find('items',id).status,'done');
 assert.equal((await tools.reply('update_world_item',{id},turn)).error,'Missing item status.');
 assert.deepEqual(await tools.reply('archive_world_items',{ids:[id]},turn),{ok:true,archived:1,restorable:true});
 assert.equal(store.ledger().find('items',id).status,'dismissed');
 assert.equal((await tools.reply('archive_world_items',{ids:[1]},turn)).error,'Missing item IDs.');

 // History records the tool outcomes as applet activity.
 const history=await tools.reply('read_world_history',{kind:'applet.activity'},turn);
 assert.ok(history.events.length>=4,JSON.stringify(history));
 assert.ok(history.events.every(event=>event.kind==='applet.activity'));
 assert.ok(history.events.some(event=>event.body?.operation==='upsert_world_items'&&event.body?.status==='complete'));
 assert.ok(history.events.some(event=>event.body?.operation==='upsert_world_items'&&event.body?.status==='failed'));

 // Runtime task report and control.
 const report=tools.runtimeTaskReport();
 assert.equal(report.supported,true);
 const ids=report.rows.map(row=>row.id);
 assert.ok(ids.includes('applet:gmail:check')&&ids.includes('applet:gmail:analyze'),JSON.stringify(ids));
 assert.equal(report.rows.find(row=>row.id==='applet:gmail:analyze').pendingAnalysis,1);
 assert.deepEqual(await action('runtimeTaskControl',{provider:'gmail',operation:'pause'}),{ok:true,runsWhileAppOpen:true});
 assert.equal(store.ledger().find('checks','gmail').enabled,false);
 assert.equal((await tools.reply('query_world_items',{},'monitor','gmail')).error,'This source check is paused.');
 assert.deepEqual(await action('runtimeTaskControl',{provider:'gmail',operation:'resume'}),{ok:true,runsWhileAppOpen:true});
 assert.equal(store.ledger().find('checks','gmail').enabled,true);
 await assert.rejects(Promise.resolve(action('runtimeTaskControl',{provider:'gmail',operation:'delete'})),/Unknown task operation\./);
 assert.deepEqual(await action('runtimeTaskControl',{provider:'attention-center',operation:'retry-quarantined'}),{ok:true});
 assert.deepEqual(await action('worldSourceCheck',{provider:'gmail',enabled:true,intervalMinutes:60}),{ok:true,runsWhileAppOpen:true});
 assert.equal(store.ledger().find('checks','gmail').intervalMinutes,60);
 // World menu "Read connected apps" makes every enabled check due now.
 store.ledger().put('checks','gmail',{...store.ledger().find('checks','gmail'),nextAt:Date.now()/1000+3600});
 tools.readConnectedApps();
 assert.ok(store.ledger().find('checks','gmail').nextAt<=Date.now()/1000,'Read connected apps makes the check due');

 // Weather is a current observation published to the Center's context.
 tools.observeWeather({weather:{observedAt:Date.now()-60_000,words:'Light rain',temperature:11.6}});
 const weather=store.ledger().attentionFacts().find(fact=>fact.provider==='weather');
 assert.ok(weather&&weather.text==='Current weather: Light rain, 12°. This is not a forecast.',JSON.stringify(weather));

 // Meeting decisions and companion recall.
 assert.equal((await tools.reply('meeting_decisions',{eventId:'missing',decisions:[]},turn)).error,'Read the meeting event and authorized minutes in this conversation first.');
 assert.deepEqual((await tools.reply('read_companion_archive',{query:'proposal'},turn)).records,[]);
 assert.equal((await tools.reply('unknown_tool',{},turn)).error,'Unknown world operation.');

 // A finished turn leaves no receipts or evidence behind.
 tools.finishTurn(turn);
 assert.equal(store.worldEvidence[turn],undefined);
 assert.equal((await tools.reply('upsert_world_items',{items:[item]},turn)).error,'Read sources in this turn before saving findings.');
 assert.deepEqual(errors.filter(line=>!line.startsWith('worldItemSave')),[],'No unexpected diagnostics');
 console.log('PASS Electron World tools: privacy gates, schedule configuration, evidence-verified findings, queries, status/archive, history, runtime tasks, weather and turn cleanup.');
}finally{await close();}

// A scripted Agent for the background pipeline: page collection → Applet analysis → Center synthesis.
// `requests` records every background request, each of which would be a model call in a real install.
function scriptedAgent(store:WorldStore,services:Map<string,unknown>,{cancelOnce=false}={}){
 const homes:string[]=[],requests:Row[]=[];
 const quote='Please review the project proposal by Friday.';
 const row={provider:'gmail',id:'thread:def456',title:'Proposal',text:'Subject: Proposal\n\n'+quote,url:''};
 const task=(ref:Row)=>({provider:ref.provider,kind:'task',title:'Review proposal',reason:'Project follow-up',summary:'The proposal needs your review before Friday.',attentionReason:'The sender asked for a review.',sources:[{provider:ref.provider,id:ref.id,quote}]});
 const runtime=(script:(body:Row,onEvent:(event:Row)=>Promise<any>)=>Promise<Row>)=>({run:async(body:Row,home:string,onEvent:any)=>{homes.push(home);requests.push(body);return script(body,event=>Promise.resolve(onEvent(event)));},steer:async()=>false,cancel:()=>{}});
 const tool=(onEvent:(event:Row)=>Promise<any>,name:string,args:Row)=>onEvent({type:'tool',name,args});
 services.set('agent',{
  id:'hermes',available:true,supportsBackgroundChecks:true,hasInteractiveWork:()=>false,
  home:scope=>'/homes/'+scope,isolatedHome:scope=>'/homes/'+scope,
  accountsId:'hermes',accountsHome:()=>'/homes/private',
  captureCompanion:archive=>archive,checkpointCompanion:archive=>archive,
  makeSourceAccess:()=>runtime(async(body,onEvent)=>{
   assert.equal(body.action,'sourceTool');assert.equal(body.name,'read_world_source');assert.equal(body._background,true);
   assert.deepEqual(await tool(onEvent,'_world_authorize',{name:'read_world_source'}),{ok:true});
   assert.equal((await tool(onEvent,'_email_review',{})).error,'Collection is read-only.');
   const {ticket}=await tool(onEvent,'_source_begin',{provider:'gmail'});
   assert.deepEqual(await tool(onEvent,'_source_result',{provider:'gmail',ticket,records:[row]}),{ok:true});
   return {records:[row],nextPageToken:''};
  }),
  make:()=>runtime(async(body,onEvent)=>{
   assert.equal(body._background,true);assert.equal(body.monitor,true);
   if(body.sourceAnalysis){
    if(cancelOnce){
     // The World moves on mid-run; the per-turn MCP bridge hands the cancelled call back as its error (worldGateway in
     // agent-runtime/world-tool-bridge.ts), and the Agent ends its turn with nothing submitted.
     cancelOnce=false;store.attentionEpoch+=1;
     const answer=await tool(onEvent,'query_world_items',{}).catch((error:Error)=>({error:error.message}));
     assert.equal(answer.error,'Cancelled.');
     return {message:'Stopped.'};
    }
    assert.equal((await tool(onEvent,'upsert_world_items',{items:[],processedContextIds:[]})).error,'Query context, then submit Applet candidates only.');
    const context=await tool(onEvent,'query_world_items',{});
    for(const fact of context.context){
     const result=await tool(onEvent,'upsert_world_items',{items:[task(fact.sourceReference)],processedContextIds:[fact.id]});
     assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.published,false);
    }
    return {message:'Fictional analysis complete.'};
   }
   assert.equal(body.attentionSynthesis,true);
   assert.equal((await tool(onEvent,'update_world_item',{id:'x',status:'done'})).error,'Attention synthesis cannot read services, change user state or perform actions.');
   assert.equal((await tool(onEvent,'upsert_world_items',{items:[]})).error,'Query current context and user decisions first.');
   const context=await tool(onEvent,'query_world_items',{});
   assert.ok(context.context.length>0,JSON.stringify(context));
   const items=context.context.map(fact=>task({provider:fact.provider,id:fact.sourceId}));
   // #1609: input that changes mid-run is not a model error; nothing is saved or acknowledged and no diagnostic is kept.
   const live=store.ledger().attentionFacts();
   store.ledger().publishAttentionFacts(live.map(f=>({...f,revision:f.revision+1})));
   const raced=await tool(onEvent,'upsert_world_items',{items,processedContextIds:context.pendingContextIds});
   store.ledger().publishAttentionFacts(live);
   assert.equal(raced.error,undefined,JSON.stringify(raced));
   assert.deepEqual(raced.ids,[]);assert.equal(raced.rejected.length,items.length);
   assert.deepEqual([...raced.withheldContextIds].sort(),[...context.pendingContextIds].sort(),'changed input stays pending');
   const result=await tool(onEvent,'upsert_world_items',{items,processedContextIds:context.pendingContextIds});
   assert.equal(result.ok,true,JSON.stringify(result));
   // Core attentionProgress records the committed seeds before the turn settles.
   const progress=store.ledger().attentionBudget();
   assert.equal(progress.contentVersion,1);assert.deepEqual(context.pendingContextIds.filter((id:string)=>!(id in (progress.seen??{}))),[],JSON.stringify(progress));
   return {message:'Background pass complete.'};
  })
 });
 return {homes,requests};
}

// Background pipeline with a scripted Agent: page collection → Applet analysis → Center synthesis.
{
 const env=environment();
 const {store,services,tools}=env;
 const {homes}=scriptedAgent(store,services);
 try{
  store.state.cloudConsent=true;
  store.state.connections=[{id:'hermes-gmail',provider:'gmail',target:'person@example.com',transport:'hermes',connector:'oauth',syncStatus:'connected'}];
  store.changed();
  // Consent wakes the source lanes; an explicit check joins them without a second reader.
  await tools.checkWorldIfDue('gmail');
  const checkDeadline=Date.now()+10_000;
  while(Date.now()<checkDeadline&&store.ledger().find('checks','gmail')?.lastStatus!=='complete')await sleep(50);
  const check=store.ledger().find('checks','gmail');
  assert.equal(check?.lastStatus,'complete',JSON.stringify(check));
  assert.equal(store.ledger().find('applet-cursors','gmail')?.initialComplete,true);
  const deadline=Date.now()+15_000;
  while(Date.now()<deadline&&!store.ledger().records('items').some(item=>item.provider==='gmail'))await sleep(100);
  const saved=store.ledger().records('items').filter(item=>item.provider==='gmail');
  assert.equal(saved.length,1,'Synthesis saved one verified finding: '+JSON.stringify(env.errors));
  assert.equal(saved[0].attentionMode,'synthesis');
  assert.ok(homes.includes('/homes/private')&&homes.includes('/homes/applet-analysis')&&homes.includes('/homes/monitor'),JSON.stringify(homes));
  const budgetDeadline=Date.now()+5_000;
  while(Date.now()<budgetDeadline&&store.ledger().attentionBudget().lastStatus!=='complete')await sleep(50);
  assert.equal(store.ledger().attentionBudget().lastStatus,'complete');
  const report=tools.runtimeTaskReport();
  const analyze=report.rows.find(row=>row.id==='applet:gmail:analyze');
  assert.ok(!analyze||!analyze.pendingAnalysis,JSON.stringify(analyze));
  const history=store.ledger().history({kind:'applet.check'});
  assert.deepEqual(history.map(entry=>entry.body?.status).reverse(),['started','complete']);
  assert.deepEqual(env.errors,[],'No unexpected diagnostics');
  console.log('PASS Electron background pipeline: page collection, Applet analysis lane, Center synthesis and settlement.');
 }finally{await env.close();}
}

// A run the World cancelled while the Agent was on it is a cancellation, not a failed analysis: a local Agent's World
// tool calls answer through the MCP bridge, so the Agent ends its turn instead of the run stopping (Mac Alpha 4078:
// applet:google-calendar:analyze failed with "ended without a verified result"). The next pass analyses the page.
{
 const env=environment();
 const {store,services,tools}=env;
 scriptedAgent(store,services,{cancelOnce:true});
 try{
  store.state.cloudConsent=true;
  store.state.connections=[{id:'hermes-gmail',provider:'gmail',target:'person@example.com',transport:'hermes',connector:'oauth',syncStatus:'connected'}];
  store.changed();
  await tools.checkWorldIfDue('gmail');
  const deadline=Date.now()+20_000;
  while(Date.now()<deadline&&!store.ledger().records('items').some(item=>item.provider==='gmail'))await sleep(100);
  assert.equal(store.ledger().records('items').filter(item=>item.provider==='gmail').length,1,'The next pass analysed the page: '+JSON.stringify(env.errors));
  assert.deepEqual(store.ledger().records('runtime-runs').filter(run=>run.status==='failed'),[],'No failed run');
  assert.deepEqual(env.errors,[],'No unexpected diagnostics');
  console.log('PASS Electron Applet analysis cancelled mid-run: recorded as a cancellation, analysed on the next pass.');
 }finally{await env.close();}
}

// Brought conversations (core/tasks/attention.ts): with no mail connected, a conversation active lately reaches the
// Center through the Ongoing module, its finding cites it and stays current, and its original opens the conversation.
{
 const env=environment();
 const {store,services,host,actions}=env;
 scriptedAgent(store,services);
 installOngoing(host);installWorld(host);
 try{
  store.state.cloudConsent=true;store.changed();
  const at=(days:number)=>new Date(Date.now()-days*86_400_000).toISOString().replace(/\.\d+Z$/,'Z');
  const session='OpenClaw · Discord · #kyoto-trip';
  store.ledger().addCompanionTurns('openclaw',[
   {id:'t1',session,role:'user',text:'Please review the project proposal by Friday.',createdAt:at(2)},
   {id:'t2',session,role:'assistant',text:'I will remind you on Thursday.',createdAt:at(2)},
   // Quiet for months: not read for Attention.
   {id:'t3',session:'OpenClaw · Discord · #old',role:'user',text:'An old thought.',createdAt:at(120)},
  ]);
  host.use<OngoingService>(ONGOING).refresh();
  const facts=store.ledger().attentionFacts().filter(f=>f.provider==='conversations');
  assert.deepEqual(facts.map(f=>f.sourceId),[conversationAttentionId('openclaw',session)],'Only the recent conversation is Attention context');
  assert.match(facts[0].text,/^Conversation “#kyoto-trip” in OpenClaw · Discord[\s\S]*You: Please review the project proposal by Friday\.[\s\S]*OpenClaw: I will remind you on Thursday\.$/);
  const revision=facts[0].revision;
  host.use<OngoingService>(ONGOING).refresh();
  assert.equal(store.ledger().attentionFacts().find(f=>f.provider==='conversations')?.revision,revision,'Reading it again unchanged needs no new pass');
  const deadline=Date.now()+15_000;
  while(Date.now()<deadline&&!store.ledger().records('items').some(item=>item.provider==='conversations'))await sleep(100);
  const saved=store.ledger().records('items').filter(item=>item.provider==='conversations');
  assert.equal(saved.length,1,'Synthesis saved the open loop: '+JSON.stringify(env.errors));
  assert.deepEqual(saved[0].sources.map((ref:Row)=>[ref.provider,ref.id]),[['conversations',conversationAttentionId('openclaw',session)]]);
  assert.ok(store.worldItems().some(item=>item.id===saved[0].id&&item.attentionFresh===true),'The finding is current in the Center');
  const original:Row=await actions.get('original')!({action:'original',id:'conversation:'+saved[0].sources[0].id} as any,{requestId:'check',sender:null as any});
  assert.equal(original.title,'#kyoto-trip');assert.match(original.text,/You: Please review the project proposal by Friday\./);
  assert.deepEqual(env.errors,[],'No unexpected diagnostics');
  console.log('PASS Electron brought conversations: recent ones are Attention context, findings cite and open them, unchanged ones renew without a pass.');
 }finally{await env.close();}
}

// Idle gate (#1650): with no input for 15 minutes nothing scheduled reaches the model; the person's return resumes it.
{
 const env=environment();
 const {store,services,tools}=env;
 const {requests}=scriptedAgent(store,services);
 let idleSeconds=3600;
 services.set('userActivity',{idleSeconds:()=>idleSeconds});
 try{
  tools.start();
  store.state.cloudConsent=true;
  store.state.connections=[{id:'hermes-gmail',provider:'gmail',target:'person@example.com',transport:'hermes',connector:'oauth',syncStatus:'connected'}];
  store.changed(); // Consent wakes source checks, analysis and synthesis; all are idle-gated.
  await tools.checkWorldIfDue();
  tools.requestAppletAnalysis();tools.requestAttentionSynthesis();
  await sleep(1500);
  assert.deepEqual(requests,[],'An idle installation sends no background requests');
  assert.notEqual(store.ledger().find('checks','gmail')?.lastStatus,'complete');
  idleSeconds=30;
  await tools.checkWorldIfDue();
  const deadline=Date.now()+15_000;
  while(Date.now()<deadline&&!store.ledger().records('items').some(item=>item.provider==='gmail'))await sleep(100);
  assert.equal(store.ledger().find('checks','gmail')?.lastStatus,'complete');
  assert.equal(store.ledger().records('items').filter(item=>item.provider==='gmail').length,1,'The catch-up pass collects, analyses and synthesizes: '+JSON.stringify(env.errors));
  const made=requests.length;
  idleSeconds=900;
  await tools.checkWorldIfDue();tools.requestAppletAnalysis();tools.requestAttentionSynthesis();
  await sleep(1000);
  assert.equal(requests.length,made,'Going idle again stops further background requests');
  assert.deepEqual(env.errors,[],'No unexpected diagnostics');
  console.log('PASS Electron idle gate: no scheduled source checks, Applet analysis or synthesis after 15 idle minutes; catch-up on return.');
 }finally{await env.close();}
}
