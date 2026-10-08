import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {acpModels,acpPromptUsage,acpUsageUpdate,addHarnessUsage,appletModelFor,chooseAppletModel,harnessService,harnessTurnTimings,harnessUsageLabel,isHarnessModelId,openClawModels,
 readAppletModels,readHarnessUsage,readResponsesChunk,responsesStream,responsesUsage,usageSince} from '../core/agent/index.ts';
import {foxTiming,foxTimingEvent} from '../core/diagnostics/index.ts';
import {restoreThread,threadFinish,threadRow,threadStart,threadUsage} from '../ui/companion/fox-thread.ts';
import {LocalHarnessAdapter,type HarnessEnvironment} from '../platform/electron/src/modules/agent-runtime/local-harness.ts';
import {createHarnessModels} from '../platform/electron/src/modules/fox/harness-models.ts';
import {AGENT} from '../platform/electron/src/host/services.ts';
import {WorldLedger} from '../platform/electron/src/store/ledger.ts';
import {withTempDir} from './test-temp.ts';

// Model and speed of a Fox thread on the person's own Agent (core/agent/PORTABILITY.md#model-usage-and-speed-in-a-fox-thread):
// the usage each Agent reports read one way, the `models` service and the per-Applet model choice, and, with a fake
// Hermes Agent over ACP and a fake OpenClaw Gateway, the warm-up (a thread's session opened before Send, once, also when
// the turn arrives while it is opening), the model switch they really offer (ACP `session/set_model`, the Gateway's
// `x-openclaw-model` header, `--model` per turn) and each turn's first-word time and usage in the Fox timing record.

// Shared rules ----------------------------------------------------------------------------------------------------
// Hermes Agent 0.21.3 reports the session's totals on each `session/prompt` result (camelCase on the wire).
assert.deepEqual(acpPromptUsage({stopReason:'end_turn',usage:{inputTokens:1200,outputTokens:80,totalTokens:1280,thoughtTokens:20,cachedReadTokens:900}}),{inputTokens:1200,outputTokens:80,totalTokens:1280,cachedTokens:900,reasoningTokens:20});
assert.equal(acpPromptUsage({stopReason:'end_turn'}),null,'no usage reported: none shown, never estimated');
assert.deepEqual(acpUsageUpdate({sessionUpdate:'usage_update',used:5000,size:200000}),{context:{used:5000,size:200000}});
assert.deepEqual(acpUsageUpdate({sessionUpdate:'usage_update',used:1,size:10,cost:{amount:0.25,currency:'USD'}}),{context:{used:1,size:10},cost:{amount:0.25,currency:'USD'}});
assert.equal(acpUsageUpdate({sessionUpdate:'agent_message_chunk'}),null);
// A turn's share of session totals; totals that went down (the agent was built again) are the turn's own.
assert.deepEqual(usageSince({inputTokens:1000,outputTokens:50,totalTokens:1050},{inputTokens:1600,outputTokens:90,totalTokens:1690}),{inputTokens:600,outputTokens:40,totalTokens:640});
assert.deepEqual(usageSince({inputTokens:1000,totalTokens:1000},{inputTokens:300,totalTokens:300}),{inputTokens:300,totalTokens:300},'restarted totals');
assert.deepEqual(usageSince({totalTokens:10,cost:{amount:0.1,currency:'USD'}},{totalTokens:30,cost:{amount:0.25,currency:'USD'}}),{totalTokens:20,cost:{amount:0.15,currency:'USD'}});
// OpenClaw 2026.9.8's `/v1/responses` usage (toOpenAiResponsesUsage): cached and reasoning tokens in the details.
assert.deepEqual(responsesUsage({input_tokens:500,input_tokens_details:{cached_tokens:300,cache_write_tokens:0},output_tokens:40,output_tokens_details:{reasoning_tokens:10},total_tokens:540}),
 {inputTokens:500,outputTokens:40,totalTokens:540,cachedTokens:300,reasoningTokens:10});
assert.deepEqual(addHarnessUsage({inputTokens:1,totalTokens:1,context:{used:1,size:9}},{inputTokens:2,totalTokens:2,context:{used:3,size:9}}),{inputTokens:3,totalTokens:3,context:{used:3,size:9}});
assert.deepEqual(addHarnessUsage({totalTokens:1,cost:{amount:1,currency:'USD'}},{totalTokens:1,cost:{amount:1,currency:'EUR'}}),{totalTokens:2},'costs in two currencies are not added');
assert.equal(harnessUsageLabel({totalTokens:1280,inputTokens:1200,outputTokens:80,cost:{amount:0.0042,currency:'USD'}}),'1.3k tokens · $0.0042');
assert.equal(harnessUsageLabel({totalTokens:1280,inputTokens:1200,outputTokens:80,context:{used:50,size:200}},{detail:true}),'1.3k tokens (in 1,200 · out 80 · context 25% full)');
assert.equal(harnessUsageLabel(null),'');assert.equal(harnessUsageLabel({context:{used:1,size:2}}),'','only the context: nothing to say');
assert.deepEqual(readHarnessUsage({totalTokens:-1,inputTokens:'9',outputTokens:3,cost:{amount:1,currency:'dollars'},secret:'x'}),{outputTokens:3,totalTokens:3},'bounded on the way into the page');
// Models: what Hermes Agent's session lists, and what openclaw.json names for an agent.
assert.deepEqual(acpModels({sessionId:'s',models:{currentModelId:'openrouter:anthropic/claude-sonnet-4.6',availableModels:[{modelId:'openrouter:anthropic/claude-sonnet-4.6',name:'claude-sonnet-4.6'},{modelId:'openrouter:anthropic/claude-haiku-4.5',name:'claude-haiku-4.5'},{modelId:'bad id',name:'x'}]}}),
 [{id:'openrouter:anthropic/claude-sonnet-4.6',name:'claude-sonnet-4.6',current:true},{id:'openrouter:anthropic/claude-haiku-4.5',name:'claude-haiku-4.5'}]);
assert.deepEqual(acpModels({}),[]);
const clawConfig={agents:{defaults:{model:{primary:'anthropic/claude-opus-4-6',fallbacks:['minimax/MiniMax-M2.7']},utilityModel:'openai/gpt-5.4-mini',models:{'anthropic/claude-opus-4-6':{alias:'opus'},'minimax/MiniMax-M2.7':{alias:'minimax'}}},entries:{research:{model:'openai/gpt-5.4'}}}};
assert.deepEqual(openClawModels(clawConfig).map(m=>[m.id,m.name,!!m.current]),[['anthropic/claude-opus-4-6','opus (anthropic/claude-opus-4-6)',true],['minimax/MiniMax-M2.7','minimax (minimax/MiniMax-M2.7)',false],['openai/gpt-5.4-mini','openai/gpt-5.4-mini',false]]);
assert.equal(openClawModels(clawConfig,'research')[0].id,'openai/gpt-5.4','an agent with its own model starts there');
assert.ok(isHarnessModelId('openrouter:anthropic/claude-haiku-4.5'));assert.ok(!isHarnessModelId('a b'));assert.ok(!isHarnessModelId('-x'));
// The per-Applet choice, as kept in world.sqlite (`applet-models`).
const choice=chooseAppletModel(undefined,'hermes','app-gmail','openrouter:small');
assert.deepEqual(choice,{version:1,choices:{hermes:{'applet:gmail':'openrouter:small'}}});
assert.equal(appletModelFor(choice,'hermes',JSON.stringify(['object:app-gmail','inbox']),[{id:'openrouter:small',name:'s'}]),'openrouter:small');
assert.equal(appletModelFor(choice,'hermes',JSON.stringify(['object:app-gmail','']),[{id:'other',name:'o'}]),undefined,'a model the Agent no longer lists is not used');
assert.equal(appletModelFor(choice,'hermes',JSON.stringify(['overview','']),[{id:'openrouter:small',name:'s'}]),undefined,'the main conversation keeps the Agent’s own');
assert.deepEqual(chooseAppletModel(choice,'hermes','app-gmail',null),{version:1,choices:{}});
assert.throws(()=>chooseAppletModel(undefined,'hermes','app-gmail','bad id'));
assert.deepEqual(readAppletModels({choices:{hermes:{'applet:x':'ok','main':'ok','applet:y':'bad id'},'Bad':{}}}),{version:1,choices:{hermes:{'applet:x':'ok'}}});
// The declarations: the World asks for `models`, never a Harness by name.
for(const id of ['hermes','openclaw'])assert.equal(harnessService(id,'models'),'native');
for(const id of ['claude-code','codex','pi','remote'])assert.equal(harnessService(id,'models'),null,'no model switch it really offers: none declared');
// The Responses stream keeps its response's usage.
{
 const state=responsesStream();
 readResponsesChunk(state,`event: response.completed\ndata: ${JSON.stringify({type:'response.completed',response:{id:'r',output:[],usage:{input_tokens:7,output_tokens:3,total_tokens:10}}})}\n\n`);
 assert.deepEqual(state.usage,{inputTokens:7,outputTokens:3,totalTokens:10});
}
// Timings for the Fox timing record: allowlisted fields, so the first word reaches `fox_timing` as a bucket only.
{
 const timings=harnessTurnTimings({sessionMs:3.4,firstTextMs:2100.6,usage:{inputTokens:10,outputTokens:2,cachedTokens:4,reasoningTokens:1,totalTokens:12}});
 assert.deepEqual(timings,{sessionMs:3,firstTextMs:2101,input_tokens:10,output_tokens:2,reasoning_tokens:1,cache_read_tokens:4});
 const row=foxTiming({id:'12345678-1234-1234-1234-123456789012',outcome:'complete',completeMs:4000,...timings});
 assert.equal(row!.firstTextMs,2101);assert.equal(row!.sessionMs,3);
 assert.deepEqual(foxTimingEvent(row),{event:'fox_timing',duration:'1_5s',dimensions:{timing_outcome:'complete',first_text_bucket:'1_5s'}});
}
// The thread: each finished turn keeps its usage (kept across a restart), and the place's thread shows its sum.
{
 const at=1;let entries=threadStart([],{id:'t1',key:'object:app-gmail',view:'',location:'Gmail',user:'Hi',at});
 entries=threadFinish(entries,'t1','Hello','done',{inputTokens:900,outputTokens:100,totalTokens:1000,secret:'x'});
 entries=threadFinish(threadStart(entries,{id:'t2',key:'object:app-gmail',view:'',location:'Gmail',user:'More',at}),'t2','Sure','done',{totalTokens:500});
 entries=threadFinish(threadStart(entries,{id:'t3',key:'overview',view:'',location:'World',user:'Elsewhere',at}),'t3','Ok','done',{totalTokens:7});
 assert.deepEqual(entries[0].usage,{inputTokens:900,outputTokens:100,totalTokens:1000});
 assert.equal(threadUsage(entries,JSON.stringify(['object:app-gmail',''])).label,'1.5k tokens','only this place’s turns');
 assert.deepEqual(restoreThread([threadRow(entries)])[0].usage,{inputTokens:900,outputTokens:100,totalTokens:1000});
 assert.equal(threadUsage(threadFinish(threadStart([],{id:'x',key:'overview',view:'',location:'',user:'q',at}),'x','a'),JSON.stringify(['overview',''])).label,'','nothing reported: nothing shown');
}

// Fixtures --------------------------------------------------------------------------------------------------------
if(process.platform==='win32'){console.log('SKIP model and speed fixtures on Windows (shell fixtures); shared rules PASS');process.exit(0);}
await withTempDir('worldlet-model-speed-',async scratch=>{
 const home=path.join(scratch,'home'),bin=path.join(scratch,'bin');fs.mkdirSync(bin,{recursive:true});fs.mkdirSync(home,{recursive:true});
 const unix:HarnessEnvironment={platform:'linux',env:{PATH:'/usr/bin:/bin',HOME:home},home,systemDirectories:[]};
 const context=(root:string)=>({profile:{} as any,root,development:false,analyticsID:()=>'',openExternal:async()=>{},record:()=>true,failure:()=>{},changed:()=>{},ownSession:()=>{}});
 const script=(file:string,text:string)=>{fs.writeFileSync(file,'#!/bin/sh\n'+text);fs.chmodSync(file,0o755);};
 const thread=(place:string)=>JSON.stringify([place,'']);

 // A fake Hermes Agent: opening a session takes a while (as a cold Hermes Agent does), it lists two models, its
 // first word comes 40 ms after the prompt, and it reports its session's totals, built again on a model switch.
 {
  const log=path.join(scratch,'acp-log.jsonl'),agent=path.join(scratch,'hermes-acp.cjs');
  fs.writeFileSync(agent,String.raw`const fs=require('fs'),readline=require('readline');
const log=m=>fs.appendFileSync(${JSON.stringify(log)},JSON.stringify({...m,at:Date.now()})+'\n');
const send=m=>process.stdout.write(JSON.stringify(m)+'\n');
const sessions=new Map();let next=1;
const MODELS={currentModelId:'openrouter:big',availableModels:[{modelId:'openrouter:big',name:'Big'},{modelId:'openrouter:small',name:'Small'}]};
readline.createInterface({input:process.stdin}).on('line',line=>{
 const m=JSON.parse(line);
 if(m.method==='initialize')return send({jsonrpc:'2.0',id:m.id,result:{protocolVersion:1,agentCapabilities:{loadSession:true}}});
 if(m.method==='session/new'){const id='s'+(next++);sessions.set(id,{model:'openrouter:big',input:0,output:0});log({new:id});return setTimeout(()=>send({jsonrpc:'2.0',id:m.id,result:{sessionId:id,models:MODELS}}),200);}
 if(m.method==='session/set_model'){const s=sessions.get(m.params.sessionId);log({setModel:m.params.modelId,session:m.params.sessionId});s.model=m.params.modelId;s.input=0;s.output=0;return send({jsonrpc:'2.0',id:m.id,result:{}});}
 if(m.method==='session/prompt'){
  const sid=m.params.sessionId,s=sessions.get(sid);log({prompt:sid,model:s.model});
  const input=s.model==='openrouter:small'?100:1000;s.input+=input;s.output+=50;
  setTimeout(()=>{
   send({jsonrpc:'2.0',method:'session/update',params:{sessionId:sid,update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'From '+s.model}}}});
   send({jsonrpc:'2.0',method:'session/update',params:{sessionId:sid,update:{sessionUpdate:'usage_update',used:s.input,size:200000}}});
   send({jsonrpc:'2.0',id:m.id,result:{stopReason:'end_turn',usage:{inputTokens:s.input,outputTokens:s.output,totalTokens:s.input+s.output}}});
  },40);
  return;
 }
});
`);
  script(path.join(bin,'hermes'),`exec "${process.execPath}" "${agent}" "$@"\n`);
  const install={id:'hermes' as const,title:'Hermes Agent',command:path.join(bin,'hermes'),prefix:[],configured:true};
  const entries=()=>fs.existsSync(log)?fs.readFileSync(log,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)):[];
  const root=path.join(scratch,'hermes-root'),turnHome=path.join(root,'agent','private','local-hermes');
  const adapter=new LocalHarnessAdapter(context(root),install,unix);
  const runtime=adapter.make();
  const warm=(place:string,extra:object={})=>runtime.run({action:'warmup',mode:'chat',thread:thread(place),...extra},turnHome);
  const chat=(text:string,place='overview',extra:object={})=>runtime.run({action:'chat',text,style:'Be warm.',thread:thread(place),...extra},turnHome,async()=>null);
  try{
   // Warm-up: the person opened Fox; the main thread's session opens before anything is sent.
   assert.deepEqual(await warm('overview'),{warm:true});
   assert.deepEqual(entries().map(e=>Object.keys(e)[0]),['new'],'the session opened, nothing sent');
   assert.deepEqual(await warm('overview'),{warm:true});
   assert.equal(entries().filter(e=>e.new).length,1,'warming again is the same session');
   const first=await chat('Hi');
   assert.equal(first.message,'From openrouter:big');
   assert.equal(entries().filter(e=>e.new).length,1,'the turn takes the warmed session');
   assert.ok(first.timings.sessionMs<100,`a warmed session opens at once (${first.timings.sessionMs} ms)`);
   assert.ok(first.timings.firstTextMs>=30&&first.timings.firstTextMs<2000,`send to first word measured (${first.timings.firstTextMs} ms)`);
   assert.deepEqual(first.usage,{inputTokens:1000,outputTokens:50,totalTokens:1050,context:{used:1000,size:200000}});
   assert.deepEqual([first.timings.input_tokens,first.timings.output_tokens],[1000,50],'and its tokens in the timing record');
   const second=await chat('Again');
   assert.deepEqual([second.usage.inputTokens,second.usage.outputTokens,second.usage.totalTokens],[1000,50,1050],'the second turn’s share of the session totals');
   // A cold thread: the turn waits for its session, which the timings show.
   const cold=await chat('About this item','attention:item-1');
   assert.ok(cold.timings.sessionMs>=150,`a cold session is measured (${cold.timings.sessionMs} ms)`);
   // The person types in an Applet and sends before its session finished opening: one session, not two.
   const [early,turn]=await Promise.all([warm('object:app-notes'),chat('Quick one','object:app-notes')]);
   assert.deepEqual(early,{warm:true});assert.equal(turn.message,'From openrouter:big');
   assert.equal(entries().filter(e=>e.new).length,3,'a warm-up and the turn after it share one session/new');
   // The models service: what the session listed.
   assert.deepEqual(await adapter.models()!.list(),[{id:'openrouter:big',name:'Big',current:true},{id:'openrouter:small',name:'Small'}]);
   // An Applet chose the cheaper model: warming its thread switches it ahead of the turn (ACP session/set_model).
   assert.deepEqual(await warm('object:app-gmail',{harnessModel:'openrouter:small'}),{warm:true});
   const switched=entries().filter(e=>e.setModel);
   assert.deepEqual(switched.map(e=>e.setModel),['openrouter:small'],'switched during the warm-up');
   const cheap=await chat('Summarize','object:app-gmail',{harnessModel:'openrouter:small'});
   assert.equal(cheap.message,'From openrouter:small');
   assert.equal(entries().filter(e=>e.setModel).length,1,'already on it: no second switch');
   assert.deepEqual([cheap.usage.inputTokens,cheap.usage.totalTokens],[100,150],'usage starts over with the switched session');
   // The choice removed: back to the Agent's own; a model the Agent does not list is never sent.
   assert.equal((await chat('And now','object:app-gmail')).message,'From openrouter:big');
   assert.deepEqual(entries().filter(e=>e.setModel).map(e=>e.setModel),['openrouter:small','openrouter:big']);
   assert.equal((await chat('Odd','object:app-gmail',{harnessModel:'openrouter:nope'})).message,'From openrouter:big');
   assert.equal(entries().filter(e=>e.setModel).length,2,'an unlisted model is not switched to');
   assert.equal((await chat('Main','overview')).message,'From openrouter:big','other threads keep the Agent’s own model');
   // Setup and background work have no resident session to warm.
   assert.deepEqual(await runtime.run({action:'warmup',mode:'setup',thread:thread('overview')},turnHome),{warm:false});
   assert.deepEqual(await runtime.run({action:'warmup',_background:true,thread:thread('overview')},turnHome),{warm:false});
  }finally{await adapter.shutdown();}
 }

 // A fake OpenClaw Gateway: usage on each response, the chosen model as `x-openclaw-model`, a World tool round.
 {
  const state=path.join(scratch,'openclaw-state');fs.mkdirSync(path.join(state,'workspace'),{recursive:true});
  const seen:{url:string;model?:string;body?:any}[]=[];
  const server=http.createServer((request,response)=>{
   if(request.method==='GET'){seen.push({url:String(request.url)});response.writeHead(200,{'content-type':'application/json'}).end('{"data":[]}');return;}
   const chunks:Buffer[]=[];request.on('data',c=>chunks.push(c));request.on('end',()=>{
    const body=JSON.parse(Buffer.concat(chunks).toString('utf8')),model=request.headers['x-openclaw-model'];
    seen.push({url:String(request.url),...typeof model==='string'?{model}:{},body});
    response.writeHead(200,{'content-type':'text/event-stream'});
    const sse=(type:string,data:object)=>response.write(`event: ${type}\ndata: ${JSON.stringify({type,...data})}\n\n`);
    const usage={input_tokens:400,input_tokens_details:{cached_tokens:100,cache_write_tokens:0},output_tokens:20,output_tokens_details:{reasoning_tokens:0},total_tokens:420};
    if(/YouTube/.test(JSON.stringify(body.input))&&!body.previous_response_id){sse('response.output_item.done',{item:{type:'function_call',call_id:'c1',name:'call_world_tool',arguments:JSON.stringify({target:'applets',action:'open',arguments:'{"id":"app-youtube"}'})}});sse('response.completed',{response:{id:'r1',output:[],usage}});response.end('data: [DONE]\n\n');return;}
    setTimeout(()=>{sse('response.output_text.delta',{delta:'Gateway on '+(model??'its own model')});sse('response.completed',{response:{id:'r2',output:[],usage}});response.end('data: [DONE]\n\n');},40);
   });
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',()=>resolve()));
  const port=(server.address() as {port:number}).port;
  const config=(enabled:boolean)=>fs.writeFileSync(path.join(state,'openclaw.json'),JSON.stringify({gateway:{port,auth:{mode:'none'},http:{endpoints:{responses:{enabled}}}},...clawConfig}));
  config(true);
  const execLog=path.join(scratch,'openclaw-exec.txt');
  script(path.join(bin,'openclaw'),`echo "$@" >> "${execLog}"\ncat > /dev/null\necho '{"ok":true,"status":"ok","final":"From agent exec"}'\n`);
  const install={id:'openclaw' as const,title:'OpenClaw',command:path.join(bin,'openclaw'),prefix:[],configured:true};
  const claw={...unix,env:{...unix.env,OPENCLAW_STATE_DIR:state}};
  const root=path.join(scratch,'openclaw-root'),turnHome=path.join(root,'agent','private','local-openclaw');
  try{
   const adapter=new LocalHarnessAdapter(context(root),install,claw);
   const runtime=adapter.make();
   const chat=(text:string,extra:object={})=>runtime.run({action:'chat',text,thread:thread('object:app-gmail'),...extra},turnHome,async(event:any)=>event.type==='tool'?{ok:true}:null);
   assert.deepEqual(await runtime.run({action:'warmup',mode:'chat',thread:thread('object:app-gmail')},turnHome),{warm:true});
   assert.deepEqual(seen.map(s=>s.url),['/v1/models'],'warming checks the Gateway, sends nothing');
   const cheap=await chat('Summarize',{harnessModel:'openai/gpt-5.4-mini'});
   assert.equal(cheap.message,'Gateway on openai/gpt-5.4-mini');
   assert.equal(seen.at(-1)!.model,'openai/gpt-5.4-mini','the chosen model rides as x-openclaw-model');
   assert.equal(seen.at(-1)!.body.model,'openclaw','the `model` field still names the agent');
   assert.deepEqual(cheap.usage,{inputTokens:400,outputTokens:20,totalTokens:420,cachedTokens:100,reasoningTokens:0});
   assert.ok(cheap.timings.firstTextMs>=30,`first word measured (${cheap.timings.firstTextMs} ms)`);
   const tooled=await chat('Open YouTube');
   assert.equal(seen.at(-1)!.model,undefined,'no choice: the agent’s own model');
   assert.deepEqual([tooled.usage.inputTokens,tooled.usage.totalTokens],[800,840],'a tool round’s responses add up');
   assert.deepEqual((await adapter.models()!.list()).map(m=>m.id),['anthropic/claude-opus-4-6','minimax/MiniMax-M2.7','openai/gpt-5.4-mini'],'its models from openclaw.json');
   assert.equal((await adapter.models()!.list('research'))[0].id,'openai/gpt-5.4');
   await adapter.shutdown();
   // Its endpoint off: the per-turn `agent exec` gets the chosen model too, and warming finds nothing to open.
   config(false);
   const fallback=new LocalHarnessAdapter(context(root),install,claw);
   assert.deepEqual(await fallback.make().run({action:'warmup',mode:'chat',thread:thread('object:app-gmail')},turnHome),{warm:false});
   assert.equal((await fallback.make().run({action:'chat',text:'Hi',thread:thread('object:app-gmail'),harnessModel:'openai/gpt-5.4-mini'},turnHome,async()=>null)).message,'From agent exec');
   assert.match(fs.readFileSync(execLog,'utf8'),/--model openai\/gpt-5\.4-mini --message-file -/);
   await fallback.shutdown();
  }finally{server.close();}
 }

 // The World's consumer: the menu's list (warming the Applet's thread when the Agent has not listed any yet), the
 // choice in world.sqlite, and the model for a turn said in that Applet.
 {
  const world=new WorldLedger(path.join(scratch,'world'));
  let listed:{id:string;name:string;current?:boolean}[]=[];const warmed:string[]=[];
  const service:any={harness:{id:'hermes',title:'Hermes Agent'},models:()=>({list:async()=>listed})};
  const host:any={store:{writable:true,sampleEnabled:()=>false,ledger:()=>world},diagnostics:{record:(error:unknown)=>{throw error;}},optional:(name:string)=>name===AGENT?service:undefined};
  const chooser=createHarnessModels(host,{warm:async thread=>{warmed.push(thread);listed=[{id:'openrouter:big',name:'Big',current:true},{id:'openrouter:small',name:'Small'}];}});
  const inGmail=thread('object:app-gmail');
  assert.deepEqual(await chooser.list('app-gmail'),{models:[{id:'openrouter:big',name:'Big',current:true},{id:'openrouter:small',name:'Small'}],chosen:null});
  assert.deepEqual(warmed,[inGmail],'the Applet’s thread was warmed to learn its models');
  await assert.rejects(chooser.choose('app-gmail','openrouter:nope'),/Choose one of your Agent’s models/);
  assert.deepEqual(await chooser.choose('app-gmail','openrouter:small'),{ok:true,chosen:'openrouter:small'});
  assert.equal((await chooser.list('app-gmail')).chosen,'openrouter:small');
  assert.equal(await chooser.forTurn(inGmail),'openrouter:small');
  assert.equal(await chooser.forTurn(thread('overview')),undefined);
  listed=[];
  assert.equal(await chooser.forTurn(inGmail),'openrouter:small','before the Agent lists its models (no session yet), the choice goes as kept');
  assert.equal(warmed.length,1,'a turn never warms to ask');
  await chooser.choose('app-gmail',null);
  assert.deepEqual(world.setting('applet-models'),{version:1,choices:{}});
  service.harness={id:'claude-code',title:'Claude Code'};
  assert.deepEqual(await chooser.list('app-gmail'),{models:[],chosen:null},'a Harness without the service offers none');
 }
});
console.log('PASS model and speed: reported usage read one way (ACP totals and usage_update, Responses usage), labels and thread totals, models listed and chosen per Applet, warm-up before Send (once, shared with a turn that arrives while it opens), ACP session/set_model and x-openclaw-model (and --model per turn), first-word time and session time in the Fox timing record');
