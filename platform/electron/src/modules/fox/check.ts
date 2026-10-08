// Focused check of Fox's companion records on a real WorldStore (no Electron, no model):
// npm run test:electron -- module:modules/fox
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Preferences} from '../../preferences.ts';
import {WorldStore} from '../../store/world-store.ts';
import {AGENT,ANALYTICS,FOX,type FoxService} from '../../host/services.ts';
import type {Host,Row} from '../../host/types.ts';
import {createCompanion} from './companion.ts';
import {readFoxEnergy} from './energy.ts';
// installFox uses Electron's dialogs, so this check runs in an Electron main process.
import {app,powerMonitor} from 'electron';
import {installFox} from './index.ts';
import {setTimeout as sleep} from 'node:timers/promises';
import {worldLogLines} from '../../../../../core/activity/index.ts';

const root=fs.mkdtempSync(path.join(process.env.WORLDLET_CHECK_DIR??os.tmpdir(),'worldlet-fox-'));
const preferences=Preferences.at(root);
const store=new WorldStore(root,preferences,{appName:'Worldlet Check',platform:'macos',capabilities:()=>({}),mockGoogleAvailable:false});
// The built-in Hermes Agent as companion records see it: live memory is whatever was last written.
let live:Row[]=[];const writes:Row[][]=[];
const agent={id:'hermes',memoryAuthority:'hermes',checkpointCompanion:(archive:Row)=>({...archive,memories:live.length?live:archive.memories}),
 replaceCompanionMemories:(memories:Row[],commit:()=>void)=>{live=memories;writes.push(memories);commit();},profile:()=>({bound:false}),
 captureCompanion:(archive:Row)=>archive,installCompanion:(archive:Row,current:Row,_imported:boolean,install:(archive:Row,recovery:Row|null)=>string|null)=>{live=archive.memories;return install({...archive,memoryAuthority:'hermes'},current);}} as Row;
const services=new Map<string,unknown>([[AGENT,agent]]);
const host={
 profile:{channel:'dev',worktree:'',root,title:'Worldlet Check',webRoot:path.resolve('dist/WorldletWeb'),resources:process.cwd(),smoke:false},
 preferences,store,
 page:{call:async()=>undefined,event:()=>{},documentEvent:()=>{},ready:()=>false},
 use:(name:string)=>services.get(name),optional:(name:string)=>services.get(name),
 diagnostics:{record:()=>{},log:()=>{}}
} as unknown as Host;
const passed:string[]=[];
// What the app does at quit: each companion closes its own databases, so Windows can remove the library.
const quits:(()=>unknown)[]=[];
const pass=(name:string)=>{passed.push(name);console.log('PASS '+name);};
try{
 const companion=createCompanion(host);quits.push(companion.closeLedgers);
 const section=(kind:string)=>companion.archive().memories.filter((m:Row)=>m.kind===kind).map((m:Row)=>m.text).join('\n\n');

 // Setup chose Hermes Agent or OpenClaw: its name and memory come in once, then belong to Fox.
 const first=companion.adoptMemory({name:'Nova',soul:'Name: Nova\nBe warm and brief.',user:'Kelvin prefers Chinese.',longTerm:'Worldlet ships three times a day.',source:'Hermes Agent on this computer'});
 assert.deepEqual(first,{name:'Nova',memories:['soul','user','longTerm']});
 assert.equal(section('soul'),'Name: Nova\nBe warm and brief.','its persona comes whole');
 assert.equal(companion.style.name(),'Nova','the companion takes the Agent’s name');
 assert.equal(companion.archive().identity.name,'Nova');
 assert.equal(section('user'),'Kelvin prefers Chinese.');
 assert.equal(section('longTerm'),'Worldlet ships three times a day.');
 assert.equal(writes.length,1,'one write to the live Agent memory');
 assert.ok(store.ledger().companionStored('private','session'),'the next conversation starts with the new memory');
 assert.equal(store.ledger().companionStored('private','memory-edits'),null,'not pinned as a user edit, so Fox keeps learning');
 assert.equal(fs.existsSync(path.join(root,'companion','profile.json')),false,'who Fox is lives in the database, not a file');
 pass('adopt: name, persona, About you and long-term memory copied in');

 // Bringing the same memory again changes nothing; new memory is appended after Fox's own.
 assert.deepEqual(companion.adoptMemory({name:null,user:'Kelvin prefers Chinese.',longTerm:'',source:'x'}),{name:null,memories:[]});
 assert.equal(writes.length,1,'unchanged memory is not rewritten');
 live=live.map(m=>m.kind==='longTerm'?{...m,text:m.text+'\n\nFox learned this.'}:m);
 companion.adoptMemory({name:'',user:'',longTerm:'Likes short answers.',source:'OpenClaw on this computer'});
 assert.equal(section('longTerm'),'Worldlet ships three times a day.\n\nFox learned this.\n\nLikes short answers.','appended after what Fox already remembers');
 assert.equal(companion.style.name(),'Nova','an empty name keeps the current one');
 pass('adopt: idempotent, and appends after existing memory');

 // Fox's own conversation lives in the World's database, and so does who Fox is.
 // A profile file and rotated history files from before (or from an older backup) move in once.
 const legacyId=companion.archive().identity.id;
 const current=companion.archive();
 fs.mkdirSync(path.join(root,'companion','history'),{recursive:true});
 fs.writeFileSync(path.join(root,'companion','history','old.json'),JSON.stringify({...current,personality:'',memories:[],conversations:[
  {id:'00000000-0000-4000-8000-000000000900',session:'context-old',role:'user',text:'An old question about tea',createdAt:'2026-08-01T09:00:00Z'}]}));
 const profileFile=path.join(root,'companion','profile.json');
 fs.writeFileSync(profileFile,JSON.stringify({...current,conversations:[{id:'00000000-0000-4000-8000-000000000901',session:'context-old',role:'assistant',text:'Green tea, then.',createdAt:'2026-08-01T09:00:05Z'}]}));
 fs.writeFileSync(path.join(root,'companion','imported.json'),JSON.stringify({version:1,session:'11111111-1111-4111-8111-111111111111'}));
 companion.recordTurn('A new question about coffee','user',companion.session({sample:false,setup:false}),{sample:false,setup:false});
 assert.deepEqual(companion.archive().conversations.map((t:Row)=>t.text),['An old question about tea','Green tea, then.','A new question about coffee'],'recent turns, oldest first');
 assert.ok(!fs.existsSync(profileFile)&&fs.existsSync(profileFile+'.before-database'),'the profile file stays beside it');
 assert.deepEqual(store.ledger().companionStored('private','profile')?.conversations,[],'the stored profile holds no turns');
 assert.equal(store.ledger().companionStored('private','session')?.session,'11111111-1111-4111-8111-111111111111');
 assert.ok(fs.existsSync(path.join(root,'companion','history.before-database','old.json'))&&!fs.existsSync(path.join(root,'companion','history')),'old history files stay beside it');
 assert.equal(companion.archive().identity.id,legacyId);
 assert.equal(companion.capture(companion.archive()).conversations.length,3,'the export carries every turn');
 assert.equal(companion.recall({query:'TEA'}).total,2);
 pass('Fox’s own conversation lives in the World database');

 // What the chat shows place by place moves from its file into the database once, then stays there.
 const recallFile=path.join(root,'conversation-recall.json');
 const chatRows=[{key:'mail',view:'inbox',text:'Two bills.'},{key:'fox-thread',userTextVersion:1,view:'',text:'',entries:[{id:'turn:1',key:'mail',view:'inbox',location:'Mail',user:'Any bills?',text:'Two bills.',steps:[],status:'done',at:1}]}];
 fs.writeFileSync(recallFile,JSON.stringify(chatRows));
 assert.deepEqual(companion.conversationRecall(),chatRows);
 assert.ok(!fs.existsSync(recallFile)&&fs.existsSync(recallFile+'.before-database'),'the old file stays beside it');
 const later=[chatRows[0],{...chatRows[1],entries:[...chatRows[1].entries,{...chatRows[1].entries[0],id:'turn:2',key:'',view:'',location:'World',user:'Hi',text:'Hello.'}]}];
 companion.conversationRecall(later);
 assert.deepEqual(companion.conversationRecall(),later);
 assert.equal(fs.existsSync(recallFile),false,'nothing written back to a file');
 companion.recordTurn('Which bills?','user',companion.session({sample:false,setup:false}),{sample:false,setup:false},'["mail","inbox"]');
 assert.equal(companion.recall({query:'which bills'}).records[0].thread,'["mail","inbox"]','a turn keeps the place it was asked in');
 pass('the chat’s place-by-place cards live in the World database, and each turn keeps its thread');

 // Brought conversations and notes live in the same table, and recall searches them after Fox's own.
 const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 const turn=(n:number,text:string)=>({id:id(n),role:n%2?'user':'assistant',text,createdAt:'2026-09-0'+(1+n%9)+'T10:00:00Z'});
 const chat=(n:number,session:string,turns:ReturnType<typeof turn>[])=>({id:id(100+n),title:session.split(' · ').slice(1).join(' · '),session,turns});
 // History brought before it moved into the database (archive files per Agent) moves in once.
 fs.mkdirSync(path.join(root,'companion','pi'),{recursive:true});
 fs.writeFileSync(path.join(root,'companion','pi','0001.json'),JSON.stringify({...companion.archive(),personality:'',memories:[],conversations:[
  {...turn(7,'Add a footer'),session:'pi · site · Footer'},{...turn(8,'Notes for 2026-09-08\n\nUse pnpm.'),session:'pi notes'}]}));
 assert.equal(companion.recall({query:'footer'}).records[0].session,'pi · site · Footer');
 assert.equal(companion.recall({query:'pnpm'}).records[0].kind,'note');
 assert.ok(fs.existsSync(path.join(root,'companion','pi.before-database','0001.json'))&&!fs.existsSync(path.join(root,'companion','pi')),'the old files stay beside it');
 companion.replaceImportedHistory('pi',{conversations:[],notes:[]});
 assert.equal(companion.replaceImportedHistory('openclaw',{conversations:[chat(1,'OpenClaw · Discord · #diet-and-health',[turn(1,'I had a salad'),turn(2,'Logged the salad.')])],notes:[]}),2);
 assert.equal(fs.existsSync(path.join(root,'companion','openclaw')),false,'no archive files of its own');
 const found=companion.recall({query:'SALAD'});
 assert.equal(found.total,2);assert.equal(found.records[0].session,'OpenClaw · Discord · #diet-and-health');assert.equal(found.records[0].text,'Logged the salad.','newest first, any case');
 assert.equal(companion.recall({id:id(1)}).records[0].text,'I had a salad','a brought record opens by id');
 assert.equal(companion.capture(companion.archive()).conversations.some((t:Row)=>t.text==='I had a salad'),false,'the portable export stays within its own size');
 companion.replaceImportedHistory('openclaw',{conversations:[],notes:[{id:id(3),session:'OpenClaw notes',date:'2026-09-03',text:'Booked dentist.',createdAt:'2026-09-03T12:00:00Z'}]});
 assert.equal(companion.recall({query:'salad'}).total,0,'bringing it again replaces the earlier copy');
 assert.equal(companion.recall({query:'dentist'}).records[0].text,'Notes for 2026-09-03\n\nBooked dentist.');
 // Each Agent's history is its own; bringing one never replaces another's.
 companion.replaceImportedHistory('claude-code',{conversations:[chat(4,'Claude Code · worldlet · Sign-in fix',[turn(4,'Fixed the dentist redirect.')])],notes:[]});
 assert.equal(companion.recall({query:'dentist'}).total,2);
 const counts=store.ledger().companionCounts();
 assert.deepEqual([counts['claude-code'],counts.openclaw,counts.pi],[{turns:1,notes:0},{turns:0,notes:1},undefined]);
 // Fox's own conversations come first, then brought ones; paging crosses from one to the other.
 const ownCount=companion.recall({query:''}).total-2;
 const tail=companion.recall({query:'',offset:ownCount});
 assert.deepEqual(tail.records.map((r:Row)=>r.kind),['conversation','note']);assert.equal(tail.nextOffset,undefined);
 assert.throws(()=>companion.recall({query:'',offset:ownCount+3}),/out of range/);
 assert.throws(()=>companion.replaceImportedHistory('history' as any,{conversations:[],notes:[]}),/Unknown Agent/);
 pass('adopt: brought-in history from each Agent is searchable and replaced as a whole');

 preferences.set('worldlet.sampleEnabled',true);
 assert.throws(()=>companion.adoptMemory({name:'X',user:'a',longTerm:'',source:'x'}),/your own world/);
 preferences.remove('worldlet.sampleEnabled');
 pass('adopt: never into the practice world');

 // Memory edits and an imported companion are saved in the database, together with the Harness's copy.
 const before=companion.memoryManager({operation:'read'});
 companion.memoryManager({operation:'save',kind:'user',text:'Prefers green tea.',revision:before.revision});
 assert.equal(section('user'),'Prefers green tea.');
 assert.deepEqual(store.ledger().companionStored('private','memory-edits'),{user:'Prefers green tea.'});
 const replace=agent.replaceCompanionMemories;
 agent.replaceCompanionMemories=()=>{throw new Error('Hermes is busy');};
 assert.throws(()=>companion.memoryManager({operation:'save',kind:'user',text:'Prefers coffee.',revision:companion.memoryManager({operation:'read'}).revision}),/busy/);
 assert.deepEqual(store.ledger().companionStored('private','memory-edits'),{user:'Prefers green tea.'},'a failed Harness write leaves the saved edits as they were');
 agent.replaceCompanionMemories=replace;
 pass('memory edits are saved with the Harness copy, or not at all');
 const previous=companion.archive(),session=store.ledger().companionStored('private','session')?.session;
 const portable={...companion.capture(previous),identity:{id:'22222222-2222-4222-8222-222222222222',name:'Rio',createdAt:'2026-09-01T00:00:00Z'},memories:[],conversations:[]};
 const kept=companion.importArchive(portable);
 assert.ok(kept&&fs.existsSync(kept)&&JSON.parse(fs.readFileSync(kept,'utf8')).identity.id===previous.identity.id,'the previous companion is kept as one archive file');
 assert.equal(companion.archive().identity.name,'Rio');
 assert.equal(store.ledger().companionStored('private','memory-edits'),null);
 assert.notEqual(store.ledger().companionStored('private','session')?.session,session,'a new Harness session starts');
 pass('import: the new companion replaces the saved one; the previous one is kept as an archive file');
 // Energy (owner decision 2026-10-05): Worldlet charges nothing; the person's computer does.
 const runtime=(status:Row|Error,available=true)=>({available,home:()=>'h',status:async()=>{if(status instanceof Error)throw status;return status;}}) as never;
 const errors:unknown[]=[];
 assert.deepEqual(await readFoxEnergy(runtime({ready:true,isDefault:true,source:'local-codex',provider:'openai-codex',name:'Codex on this computer',configured:true}),e=>errors.push(e)),
  {source:'chatgpt',ready:true,name:'Codex on this computer',provider:'openai-codex',level:null,resetsAt:null,localCodex:true});
 assert.equal((await readFoxEnergy(runtime({ready:false,isDefault:true,source:'local-codex',provider:'openai-codex',configured:true}),()=>{})).source,'none','no Codex sign-in and no key: nothing charges the world');
 const own=await readFoxEnergy(runtime({ready:true,isDefault:false,source:null,provider:'anthropic',configured:true}),()=>{});
 assert.equal(own.source,'own');assert.equal(own.level,null,'only the provider knows an API key’s balance');
 assert.equal((await readFoxEnergy(runtime({ready:true,name:'Claude Code',provider:'claude-code'}),()=>{})).source,'own','a local Agent answering itself charges with its own sign-in');
 const offline=await readFoxEnergy(runtime(new Error('offline')),e=>errors.push(e));
 assert.equal(offline.source,'none');assert.equal(errors.length,1,'a failed read is recorded, not thrown');
 // A fresh install or update still preparing Fox's runtime is setup, not a failure (PostHog 01a0ffbb).
 const preparing=await readFoxEnergy(runtime(new Error('Fox’s runtime is not ready.'),false),e=>errors.push(e));
 assert.equal(preparing.source,'none');assert.equal(errors.length,1,'a runtime still being prepared is not read or recorded');
 pass('energy: which source charges Fox and how much is left');

 // Applet tasks (owner decision 2026-10-03): Fox hands a task to an Applet and the conversation is
 // free at once; the task's tools reach the page under its own id, and its result is kept.
 assert.ok(app,'runs in Electron');
 {
  const events:[string,Row][]=[],calls:unknown[][]=[],actions:Record<string,(request:Row)=>unknown>={};
  let release=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});
  const taskRuntime={run:async(body:Row,_home:string,onEvent:(event:Row)=>Promise<unknown>)=>{
   assert.match(String(body.text),/The user asked: Find me short cooking videos/);assert.equal(body.session.startsWith('task-'),true);
   assert.deepEqual(await onEvent({type:'tool',id:'t1',name:'automate_browser',args:{operation:'snapshot'}}),{ok:true,page:'snapshot'});
   await gate;return {message:'Found three videos under ten minutes.'};
  },steer:async()=>false,cancel:()=>{}};
  let chatRun=async(body:Row,_home:string,_onEvent:(event:Row)=>Promise<unknown>):Promise<Row>=>({message:'echo:'+body.text});
  // Routines: the clock wakes when the computer does, and a late catch-up run joins the world log.
  let routineResult:(result:Row)=>void=()=>{},wakes=0;
  const routineClock={start:(_allowed:()=>boolean,onResult:(result:Row)=>void)=>{routineResult=onResult;},stop:()=>{},wake:()=>{wakes++;}};
  const foxAgent={...agent,available:true,supportsBackgroundChecks:true,home:(scope:string)=>path.join(root,'agent',scope),make:()=>({run:async(body:Row,home:string,onEvent:(event:Row)=>Promise<unknown>)=>chatRun(body,home,onEvent),steer:async()=>false,cancel:()=>{}}),
   makeTask:()=>taskRuntime,makeRoutines:()=>routineClock,onChanged:()=>{},warm:()=>{},shutdown:async()=>{},hasInteractiveWork:()=>false};
  services.set(AGENT,foxAgent);
  const usage:[string,string,Row][]=[];services.set(ANALYTICS,{recordProductEvent:(event:string,duration:string,dimensions:Row)=>usage.push([event,duration,dimensions])});
  const foxHost={...host,
   page:{call:async(...args:unknown[])=>{calls.push(args);return {ok:true,page:'snapshot'};},event:(name:string,detail:Row)=>{events.push([name,detail]);},documentEvent:()=>{},ready:()=>true},
   register:(more:Record<string,(request:Row)=>unknown>)=>Object.assign(actions,more),provide:(name:string,value:unknown)=>{services.set(name,value);return value;},
   onPageLoaded:()=>{},onPageReload:()=>{},onQuit:(quit:()=>unknown)=>quits.push(quit),window:()=>null,worldView:()=>null} as unknown as Host;
  installFox(foxHost);
  store.setCloudConsent(true);
  powerMonitor.emit('resume');
  assert.equal(wakes,1,'resume from sleep wakes the routine clock');
  routineResult({ran:true,late:true,scheduledAt:'2026-10-04T08:00:00.000Z',job:{id:'news',name:'Morning news',last_status:'ok'}});
  assert.deepEqual(events.filter(([name])=>name==='worldlet:routines').at(-1)?.[1].late,true);
  assert.deepEqual(worldLogLines(store.ledger().history({kinds:['routine.run'],limit:5})).map(line=>line.text),['Fox ran Morning news late'],'the world log says the missed routine ran late');
  const request={applet:'app-youtube',task:'Find three cooking videos under ten minutes',request:'Find me short cooking videos on YouTube',parent:'turn-1'};
  const started=actions.appletTaskStart(request) as Row;
  assert.equal(started.ok,true);assert.match(started.id,/^task-/);
  assert.deepEqual(events.find(([name])=>name==='worldlet:applet-task')?.[1],{id:started.id,applet:'app-youtube',status:'started',request:request.request});
  assert.throws(()=>actions.appletTaskStart(request),/already working/,'one task per Applet');
  assert.equal(((await actions.agentChat({id:'chat-1',text:'hello'})) as Row).message,'echo:hello','Fox answers while the Applet works');
  for(let i=0;i<50&&!calls.length;i++)await sleep(10);
  assert.deepEqual(calls[0],['worldletAgentTool',started.id,{type:'tool',id:'t1',name:'automate_browser',args:{operation:'snapshot'}}],'the task’s tools reach the page under its id');
  assert.deepEqual((actions.appletTasks({}) as Row).tasks.map((t:Row)=>t.applet),['app-youtube']);
  release();
  for(let i=0;i<100&&!events.some(([,detail])=>detail.status==='complete');i++)await sleep(10);
  assert.deepEqual(events.filter(([name])=>name==='worldlet:applet-task').at(-1)?.[1],{id:started.id,applet:'app-youtube',status:'complete',message:'Found three videos under ten minutes.'});
  assert.deepEqual(store.ledger().history({kinds:['applet.task'],limit:10}).map((row:Row)=>row.body?.status??JSON.parse(String(row.body??'{}')).status).sort(),['complete','started']);
  const reread=createCompanion(host);quits.push(reread.closeLedgers);
  assert.ok(reread.archive().conversations.some((turn:Row)=>turn.role==='assistant'&&turn.text==='YouTube: Found three videos under ten minutes.'),'the result joins Fox’s conversation');
  // A request Worldlet wrote for a button is kept as its label, not as a paragraph in the person's name (owner Order 2026-10-07).
  await actions.agentChat({id:'chat-plan',text:'Good morning. Make my plan for today as one artifact. First read: '+'today\'s Calendar. '.repeat(40),shown:'Today’s plan'});
  const again=createCompanion(host);quits.push(again.closeLedgers);
  assert.deepEqual(again.archive().conversations.filter((turn:Row)=>turn.role==='user').map((turn:Row)=>turn.text).slice(-1),['Today’s plan'],'the archive keeps what the person saw');
  // Work Worldlet starts by itself (the day's plan) runs in the task lane in a session of its own beside the
  // conversation, and only a line of its result joins the conversation (owner Orders 2026-10-07).
  {
   const seen:Row[]=[],taskBefore=taskRuntime.run;
   taskRuntime.run=async(body:Row)=>{seen.push(body);return {message:'Your plan is ready.'};};
   const made=await actions.agentChat({id:'daily-1',text:'Good morning. Make my plan for today as one artifact.',shown:'Today’s plan',background:true}) as Row;
   assert.equal(made.message,'Your plan is ready.');
   assert.equal(seen[0].session,'work-daily-1','its own session, not the conversation’s');
   assert.deepEqual(seen[0].context.backgroundWork,{label:'Today’s plan'});
   const after=createCompanion(host);quits.push(after.closeLedgers);
   const turns=after.archive().conversations;
   assert.deepEqual([turns.at(-1).role,turns.at(-1).text],['assistant','Today’s plan: Your plan is ready.'],'one line of the result joins the conversation');
   assert.ok(!turns.some((turn:Row)=>String(turn.text).startsWith('Good morning')),'the long request never joins it');
   taskRuntime.run=taskBefore;
  }
  assert.deepEqual((actions.appletTasks({}) as Row).tasks,[]);
  // Analytics: the catalog key, a coarse duration and, on failure, Core's error code; never the task or result.
  assert.deepEqual(usage.map(([event,,dimensions])=>[event,dimensions]),[['applet_task_started',{applet:'youtube'}],['applet_task_completed',{applet:'youtube'}]]);
  assert.equal(usage[0][1],'');assert.match(usage[1][1],/^(under_1s|1_5s|5_15s)$/,'a coarse duration bucket');
  taskRuntime.run=async()=>{throw new Error('The request timed out.');};
  actions.appletTaskStart(request);
  for(let i=0;i<100&&!events.some(([,detail])=>detail.status==='failed');i++)await sleep(10);
  assert.deepEqual([usage.at(-1)[0],usage.at(-1)[2]],['applet_task_failed',{applet:'youtube',error_code:'timeout'}]);
  assert.ok(!JSON.stringify(usage).includes('cooking'),'no task or request text');
  services.delete(ANALYTICS);
  // A task started after untrusted content inherits the starting turn's taint (turnTrustInherit):
  // Fox's own start_applet_task still starts (owner decision 2026-10-08) and, like a task the Moment
  // Applet or game maker starts, begins untrusted, so its guarded writes are refused as the parent's would be.
  for(const start of ['fox','service']){
   let taskWrite:unknown=null,refusal:unknown=null,child:Row|null=null;
   taskRuntime.run=async(_body:Row,_home:string,onEvent:(event:Row)=>Promise<unknown>)=>{
    taskWrite=await onEvent({type:'tool',id:'w1',name:'_world_authorize',args:{name:'manage_routines',action:'create'}});
    return {message:'Tried to schedule.'};
   };
   chatRun=async(_body:Row,_home:string,onEvent:(event:Row)=>Promise<unknown>)=>{
    await onEvent({type:'progress',name:'web_extract'});
    try{child=(start==='fox'?actions.appletTaskStart({...request,parent:'chat-tainted'}):(services.get(FOX) as FoxService).startAppletTask({...request,parent:'chat-tainted'})) as Row;}catch(error){refusal=error;}
    return {message:'started'};
   };
   await actions.agentChat({id:'chat-tainted',text:'Read this page and find videos'});
   assert.equal(refusal,null,'start_applet_task after untrusted content still starts');
   assert.equal(child?.ok,true);
   assert.deepEqual(events.find(([name,detail])=>name==='worldlet:applet-task'&&detail.id===child?.id)?.[1].trust,{untrusted:true,sources:['web_extract']},'the page’s task runtime starts untrusted');
   for(let i=0;i<100&&!taskWrite;i++)await sleep(10);
   assert.match(String((taskWrite as Row)?.error),/does not create, change or resume scheduled routines/,'the child task never starts trusted');
   for(let i=0;i<100&&(actions.appletTasks({}) as Row).tasks.length;i++)await sleep(10);
   chatRun=async(body:Row)=>({message:'echo:'+body.text});
  }
  // A game review Worldlet starts by itself (#1598) has no person's words behind it: it starts untrusted,
  // so it reads and answers but its guarded writes are refused.
  {
   let taskWrite:unknown=null,asked='';
   taskRuntime.run=async(body:Row,_home:string,onEvent:(event:Row)=>Promise<unknown>)=>{
    asked=String(body.text);
    taskWrite=await onEvent({type:'tool',id:'w2',name:'_world_authorize',args:{name:'manage_routines',action:'create'}});
    return {message:'3 games, 1 won: bring Persian against Trick Room.'};
   };
   const review=(services.get(FOX) as FoxService).reviewGames({applet:'app-pokemon-showdown',task:'Review the 3 games just played.',request:'(Not the person\'s words: Worldlet started this after a session of battles ended.) Review the battles I just played.'}) as Row;
   assert.equal(review.ok,true);
   assert.deepEqual(events.find(([name,detail])=>name==='worldlet:applet-task'&&detail.id===review.id)?.[1].trust,{untrusted:true,sources:['browse_web']},'a proactive review starts untrusted');
   for(let i=0;i<100&&!events.some(([name,detail])=>name==='worldlet:applet-task'&&detail.id===review.id&&detail.status==='complete');i++)await sleep(10);
   assert.match(asked,/^Applet: Pokémon Showdown \(app-pokemon-showdown\)\nThe user asked: \(Not the person's words/,'Fox is told nobody asked');
   assert.match(String((taskWrite as Row)?.error),/does not create, change or resume scheduled routines/,'and cannot make guarded writes');
   assert.deepEqual(events.filter(([name,detail])=>name==='worldlet:applet-task'&&detail.id===review.id).at(-1)?.[1].message,'3 games, 1 won: bring Persian against Trick Room.','the review reaches the person like any task result');
  }
  // Fox talking through a local Agent (OpenClaw here): its Gmail read runs on the accounts' built-in Hermes
  // World service with no model, and that service's own calls come back through the same turn (#2113 plan, step 1).
  {
   const asked:Row[]=[],inner:unknown[]=[];let homeUsed='';
   const access={run:async(body:Row,home:string,onEvent:(event:Row)=>Promise<unknown>)=>{
    asked.push(body);homeUsed=home;
    inner.push(await onEvent({type:'tool',id:'a1',name:'_world_authorize',args:{name:'read_connected_google',provider:'gmail'}}));
    return {records:[{id:'m1',subject:'Two bills'}]};
   },steer:async()=>false,cancel:()=>{}};
   let read:unknown=null;
   chatRun=async(_body:Row,_home:string,onEvent:(event:Row)=>Promise<unknown>)=>{read=await onEvent({type:'tool',id:'g1',name:'read_connected_google',args:{service:'gmail'}});return {message:'read'};};
   services.set(AGENT,{...foxAgent,id:'local-openclaw',accountsId:'hermes',accountsHome:()=>path.join(root,'agent','private','hermes'),makeSourceAccess:()=>access});
   const before=calls.length;
   await actions.agentChat({id:'chat-local-mail',text:'Any bills in my mail?'});
   assert.deepEqual(asked,[{action:'sourceTool',name:'read_connected_google',args:{service:'gmail'},_taskTimeoutSeconds:240}],'the built-in Hermes runs the read');
   assert.equal(homeUsed,path.join(root,'agent','private','hermes'),'in the accounts’ own home');
   assert.deepEqual(inner,[{ok:true}],'its permission check is answered by this turn');
   assert.deepEqual(read,{records:[{id:'m1',subject:'Two bills'}]});
   assert.ok(!calls.slice(before).some(call=>(call[2] as Row)?.name==='read_connected_google'),'the page is never asked (it has no World service)');
   // On the built-in Hermes itself the read stays inside Hermes: the host does not run it a second time.
   services.set(AGENT,{...foxAgent,accountsId:'hermes',makeSourceAccess:()=>access});
   await actions.agentChat({id:'chat-hermes-mail',text:'Any bills in my mail?'});
   assert.equal(asked.length,1,'no second World service run for Hermes');
   // In the practice world the page drafts practice mail itself (RC 41c18a7e: a local Codex was refused for private context).
   let drafted:unknown=null;
   chatRun=async(_body:Row,_home:string,onEvent:(event:Row)=>Promise<unknown>)=>{drafted=await onEvent({type:'tool',id:'p1',name:'prepare_email',args:{to:'sam.okafor@example.com'}});return {message:'drafted'};};
   services.set(AGENT,{...foxAgent,id:'local-codex',accountsId:'hermes',accountsHome:()=>path.join(root,'agent','private','hermes'),makeSourceAccess:()=>access});
   preferences.set('worldlet.sampleEnabled',true);
   const practice=calls.length;
   await actions.agentChat({id:'chat-practice-mail',text:'Draft a reply to Sam.'});
   preferences.remove('worldlet.sampleEnabled');
   assert.equal(asked.length,1,'no World service run in the practice world');
   assert.ok(calls.slice(practice).some(call=>(call[2] as Row)?.name==='prepare_email'),'the page answers the practice draft');
   assert.deepEqual(drafted,{ok:true,page:'snapshot'});
   services.set(AGENT,foxAgent);
   chatRun=async(body:Row)=>({message:'echo:'+body.text});
  }
  preferences.set('worldlet.sampleEnabled',true);
  assert.throws(()=>actions.appletTaskStart(request),/your own world/,'never in the practice world');
  preferences.remove('worldlet.sampleEnabled');
  services.set(AGENT,agent);
 }
 pass('applet tasks: the conversation answers while an Applet works; tools, history and result; routines wake on resume and a late run is logged; a local Agent reads Gmail through the built-in Hermes');
 console.log(`PASS fox companion: ${passed.length} checks`);
}finally{for(const quit of quits)await quit();store.closeLedger();fs.rmSync(root,{recursive:true,force:true});}
