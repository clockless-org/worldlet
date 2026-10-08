import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {appletAgentThread,harnessAgentInstructions,harnessService,hermesProfileModel,localHarnessInvocation,openClawAgentModel,openClawResponsesBody} from '../core/agent/index.ts';
import {hermesAgentsService,openClawAgentsService} from '../platform/electron/src/modules/agent-runtime/harness-agents.ts';
import {LocalHarnessAdapter,type HarnessEnvironment} from '../platform/electron/src/modules/agent-runtime/local-harness.ts';
import {createHarnessAgents} from '../platform/electron/src/modules/fox/harness-agents.ts';
import {AGENT} from '../platform/electron/src/host/services.ts';
import {WorldLedger} from '../platform/electron/src/store/ledger.ts';
import {withTempDir} from './test-temp.ts';

// The person's own agents in an Applet (core/agent/PORTABILITY.md#the-persons-own-agents-in-an-applet): the `agents`
// service's rules, the read-only `files` readers against fixture OpenClaw and Hermes Agent folders, the per-Applet
// choice kept in a World, and a chosen agent answering the Applet's thread: OpenClaw's Gateway request naming it and
// its per-turn fallback in that agent's workspace and model; Hermes Agent's resident process started with `-p`.

// Shared rules ----------------------------------------------------------------------------------------------------
assert.equal(harnessService('openclaw','agents'),'files');assert.equal(harnessService('hermes','agents'),'files');assert.equal(harnessService('codex','agents'),null);
assert.equal(harnessAgentInstructions([['SOUL.md','  Be curious. '],['AGENTS.md','']]),'# SOUL.md\nBe curious.');
assert.equal(harnessAgentInstructions([['SOUL.md','Only this']]),'Only this');assert.equal(harnessAgentInstructions([['SOUL.md','  ']]),undefined);
assert.equal(harnessAgentInstructions([['A','x'.repeat(9000)]])?.length,8000);
const claw={agents:{defaults:{model:{primary:'anthropic/claude-sonnet'}},entries:{research:{model:'openai/gpt-5'}},list:[{id:'ops',model:{primary:'local/qwen'}}]}};
assert.equal(openClawAgentModel(claw,'research'),'openai/gpt-5');assert.equal(openClawAgentModel(claw,'ops'),'local/qwen');assert.equal(openClawAgentModel(claw,'main'),'anthropic/claude-sonnet');assert.equal(openClawAgentModel({},'main'),undefined);
assert.equal(hermesProfileModel('model: "anthropic/claude-opus" # note\n'),'anthropic/claude-opus');
assert.equal(hermesProfileModel('agent:\n  x: 1\nmodel:\n  provider: openrouter\n  default: nous/hermes-4\n'),'nous/hermes-4');
assert.equal(hermesProfileModel('memory:\n  model: x\n'),undefined,'only the top-level model');
assert.equal(appletAgentThread('app-gmail'),'applet:gmail');assert.equal(appletAgentThread('gmail'),null);
// Which agent answers where (bindings, precedence, notes) is scripts/agent-routing-check.ts.
const inGmail=JSON.stringify(['object:app-gmail','']);
assert.equal(openClawResponsesBody({input:[],instructions:'',tools:null,agent:'research'}).model,'openclaw/research');
assert.deepEqual(localHarnessInvocation('hermes',{system:'s',prompt:'p'},null,{agent:'coder'}).args,['-p','coder','acp']);
assert.deepEqual(localHarnessInvocation('openclaw',{system:'s',prompt:'p'},null,{workspace:'/w',agent:'research',model:'openai/gpt-5'}).args,['agent','exec','--json','--cwd','/w','--model','openai/gpt-5','--message-file','-']);
assert.deepEqual(localHarnessInvocation('openclaw',{system:'s',prompt:'p'},null,{workspace:'/w'}).args,['agent','exec','--json','--cwd','/w','--message-file','-'],'the main agent keeps its own settings');
assert.deepEqual(localHarnessInvocation('openclaw',{system:'s',prompt:'p'},null,{workspace:'/w',model:'openai/gpt-5.4-mini'}).args,['agent','exec','--json','--cwd','/w','--model','openai/gpt-5.4-mini','--message-file','-'],'a model chosen for the thread (harness-model-speed-check.ts)');

if(process.platform==='win32'){console.log('SKIP Harness agents fixtures on Windows (shell fixtures); shared rules PASS');process.exit(0);}
const digestOf=(folder:string)=>{
 const hash=crypto.createHash('sha256');
 const walk=(dir:string)=>{for(const name of fs.readdirSync(dir).sort()){const file=path.join(dir,name),info=fs.lstatSync(file);hash.update(file+':'+info.mtimeMs);if(info.isDirectory())walk(file);else hash.update(fs.readFileSync(file));}};
 walk(folder);return hash.digest('hex');
};
const write=(file:string,text:string)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);};
const script=(file:string,text:string)=>{write(file,'#!/bin/sh\n'+text);fs.chmodSync(file,0o755);};
await withTempDir('worldlet-harness-agents-',async scratch=>{
 const home=path.join(scratch,'home'),bin=path.join(scratch,'bin');fs.mkdirSync(home,{recursive:true});fs.mkdirSync(bin,{recursive:true});
 const unix:HarnessEnvironment={platform:'linux',env:{PATH:'/usr/bin:/bin',HOME:home},home,systemDirectories:[]};

 // OpenClaw: openclaw.json agents, agents/<id>/ folders and each workspace's instructions.
 const state=path.join(home,'.openclaw'),research=path.join(scratch,'research-workspace');
 write(path.join(state,'workspace','SOUL.md'),'Name: Claw\nWarm and brief.');
 write(path.join(research,'SOUL.md'),'Name: Scout\nDigs into sources.');write(path.join(research,'AGENTS.md'),'Cite every claim.');
 fs.mkdirSync(path.join(state,'agents','ops'),{recursive:true});
 const port=await new Promise<number>(resolve=>{const probe=http.createServer();probe.listen(0,'127.0.0.1',()=>{const p=(probe.address() as {port:number}).port;probe.close(()=>resolve(p));});});
 write(path.join(state,'openclaw.json'),`{\n // the person's own settings\n agents:{defaults:{model:{primary:'anthropic/claude-sonnet'}},list:[{id:'main',default:true},{id:'research',name:'Scout',workspace:'${research}',model:'openai/gpt-5'}]},\n gateway:{port:${port},auth:{mode:'token',token:'claw-secret'},http:{endpoints:{responses:{enabled:true}}}},\n}\n`);
 const clawBefore=digestOf(state);
 const clawAgents=await openClawAgentsService(home,{HOME:home}).list();
 assert.deepEqual(clawAgents.map(a=>[a.id,a.name,a.model,a.main??false]),[['main','Claw','anthropic/claude-sonnet',true],['research','Scout','openai/gpt-5',false],['ops','ops','anthropic/claude-sonnet',false]]);
 assert.match(String(clawAgents[1].instructions),/# SOUL\.md\nName: Scout[\s\S]*# AGENTS\.md\nCite every claim\./);
 assert.equal(digestOf(state),clawBefore,'OpenClaw’s folder is only read');

 // Hermes Agent: the default profile and profiles/<name>/, the active one is the main one.
 const hermes=path.join(home,'.hermes');
 write(path.join(hermes,'config.yaml'),'model:\n  default: anthropic/claude-opus\n');write(path.join(hermes,'SOUL.md'),'You are Hermes.');
 write(path.join(hermes,'profiles','coder','config.yaml'),'model: nous/hermes-4\n');write(path.join(hermes,'profiles','coder','SOUL.md'),'Name: Coda\nShips small diffs.');
 write(path.join(hermes,'profiles','writer','SOUL.md'),'Name: Quill');fs.mkdirSync(path.join(hermes,'profiles','empty'),{recursive:true});
 write(path.join(hermes,'active_profile'),'coder');
 const hermesBefore=digestOf(hermes);
 const profiles=await hermesAgentsService(home,{HOME:home},'linux').list();
 assert.deepEqual(profiles.map(a=>[a.id,a.name,a.model??null,a.main??false]),[['default','Hermes','anthropic/claude-opus',false],['coder','Coda','nous/hermes-4',true],['writer','Quill',null,false]],'a folder without an identity file is no profile');
 assert.equal(profiles[1].instructions,'Name: Coda\nShips small diffs.');
 assert.deepEqual((await hermesAgentsService(home,{HOME:home,HERMES_HOME:path.join(hermes,'profiles','coder')},'linux').list()).map(a=>[a.id,a.main]),[['default',true]],'HERMES_HOME: only that home');
 assert.equal(digestOf(hermes),hermesBefore,'Hermes Agent’s folder is only read');

 // The World's consumer: list, choose, and the agent for a turn said in that Applet.
 const world=new WorldLedger(path.join(scratch,'world'));
 const service:any={harness:{id:'openclaw',title:'OpenClaw'},agents:()=>openClawAgentsService(home,{HOME:home})};
 const host:any={store:{writable:true,state:{},sampleEnabled:()=>false,ledger:()=>world},diagnostics:{record:(error:unknown)=>{throw error;}},optional:(name:string)=>name===AGENT?service:undefined};
 const chooser=createHarnessAgents(host);
 assert.deepEqual((await chooser.list('app-gmail')).chosen,null,'the main agent by default');
 await assert.rejects(chooser.choose('app-gmail','nobody'),/Choose one of your agents/);
 assert.deepEqual(await chooser.choose('app-gmail','research'),{ok:true,chosen:'research'});
 assert.equal((await chooser.list('app-gmail')).chosen,'research');
 assert.equal((await chooser.forTurn(inGmail)).agent,'research');
 assert.equal((await chooser.forTurn(JSON.stringify(['attention:item-1','']))).agent,undefined,'an item card keeps the main agent');
 await chooser.choose('app-gmail',null);
 assert.deepEqual(world.setting('applet-agents'),{version:2,choices:{},notes:{}},'unbinding returns the Applet to the main agent');
 await chooser.choose('app-gmail','research');
 service.harness={id:'codex',title:'Codex'};
 assert.deepEqual((await chooser.list('app-gmail')).agents,[],'a Harness without the service offers none');
 assert.equal((await chooser.forTurn(inGmail)).agent,undefined);
 service.harness={id:'openclaw',title:'OpenClaw'};
 host.store.sampleEnabled=()=>true;
 assert.equal((await chooser.forTurn(inGmail)).agent,undefined,'the practice world uses the main agent');
 host.store.sampleEnabled=()=>false;
 world.close();

 const context=(root:string)=>({profile:{} as any,root,development:false,analyticsID:()=>'',openExternal:async()=>{},record:()=>true,failure:()=>{},changed:()=>{},ownSession:()=>{}});
 // OpenClaw: the Gateway request names the chosen agent; the fallback runs in its workspace with its model.
 {
  const seen:any[]=[];
  const server=http.createServer((request,response)=>{
   if(request.method==='GET'){response.writeHead(200,{'content-type':'application/json'}).end('{"data":[]}');return;}
   const chunks:Buffer[]=[];request.on('data',c=>chunks.push(c));request.on('end',()=>{
    const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    seen.push({key:request.headers['x-openclaw-session-key'],agent:request.headers['x-openclaw-agent-id'],model:body.model});
    response.writeHead(200,{'content-type':'text/event-stream'});
    response.write(`event: response.output_text.delta\ndata: ${JSON.stringify({type:'response.output_text.delta',delta:'From '+body.model})}\n\n`);
    response.end(`event: response.completed\ndata: ${JSON.stringify({type:'response.completed',response:{id:'r',output:[]}})}\n\ndata: [DONE]\n\n`);
   });
  });
  await new Promise<void>(resolve=>server.listen(port,'127.0.0.1',()=>resolve()));
  const execLog=path.join(scratch,'openclaw-exec.txt');
  script(path.join(bin,'openclaw'),`echo "$@" >> "${execLog}"\ncat > /dev/null\necho '{"ok":true,"status":"ok","final":"From agent exec"}'\n`);
  const install={id:'openclaw' as const,title:'OpenClaw',command:path.join(bin,'openclaw'),prefix:[],configured:true};
  const root=path.join(scratch,'openclaw-root'),turnHome=path.join(root,'agent','private','local-openclaw');
  const adapter=new LocalHarnessAdapter(context(root),install,unix);
  assert.deepEqual((await adapter.agents()!.list()).map(a=>a.id),['main','research','ops'],'the adapter hands over the service');
  const chat=(text:string,place:string,harnessAgent?:string)=>adapter.make().run({action:'chat',text,thread:JSON.stringify([place,'']),...harnessAgent?{harnessAgent}:{}},turnHome,async()=>null);
  try{
   assert.equal((await chat('Hi','object:app-gmail','research')).message,'From openclaw/research');
   assert.equal((await chat('Hi','overview')).message,'From openclaw');
   assert.equal(seen[0].agent,'research');assert.equal(seen[1].agent,undefined);
   assert.notEqual(seen[0].key,seen[1].key,'the agent’s session is its own');
   assert.equal((await chat('Again','object:app-gmail','../escape')).message,'From openclaw','an invalid agent id is the main agent');
  }finally{server.close();server.closeAllConnections?.();}
  (adapter as any).conversation.checked=0;
  assert.equal((await chat('Hi','object:app-gmail','research')).message,'From agent exec');
  assert.equal((await chat('Hi','overview')).message,'From agent exec');
  const lines=fs.readFileSync(execLog,'utf8').trim().split('\n');
  assert.match(lines[0],new RegExp(`--cwd ${fs.realpathSync(research)} --model openai/gpt-5 --message-file -$`),'the fallback runs in the chosen agent’s workspace with its model');
  assert.match(lines[1],new RegExp(`--cwd ${fs.realpathSync(path.join(state,'workspace'))} --message-file -$`));
  await adapter.shutdown();
 }

 // Hermes Agent: a chosen profile answers in its own `hermes -p <profile> acp` process.
 {
  const log=path.join(scratch,'acp-log.jsonl'),agent=path.join(scratch,'hermes-acp.cjs');
  fs.writeFileSync(agent,String.raw`const fs=require('fs'),readline=require('readline');
const argv=process.argv.slice(2),profile=argv[0]==='-p'?argv[1]:'main';
fs.appendFileSync(${JSON.stringify(log)},JSON.stringify({argv})+'\n');
const send=m=>process.stdout.write(JSON.stringify(m)+'\n');
readline.createInterface({input:process.stdin}).on('line',line=>{
 const m=JSON.parse(line);
 if(m.method==='initialize')return send({jsonrpc:'2.0',id:m.id,result:{protocolVersion:1,agentCapabilities:{}}});
 if(m.method==='session/new')return send({jsonrpc:'2.0',id:m.id,result:{sessionId:profile+'-session'}});
 if(m.method==='session/prompt'){send({jsonrpc:'2.0',method:'session/update',params:{sessionId:m.params.sessionId,update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'Profile '+profile}}}});return send({jsonrpc:'2.0',id:m.id,result:{stopReason:'end_turn'}});}
});
`);
  script(path.join(bin,'hermes'),`exec "${process.execPath}" "${agent}" "$@"\n`);
  const install={id:'hermes' as const,title:'Hermes Agent',command:path.join(bin,'hermes'),prefix:[],configured:true};
  const root=path.join(scratch,'hermes-root'),turnHome=path.join(root,'agent','private','local-hermes');
  const adapter=new LocalHarnessAdapter(context(root),install,unix);
  const chat=(place:string,harnessAgent?:string,extra:Record<string,unknown>={})=>adapter.make().run({action:'chat',text:'Hi',thread:JSON.stringify([place,'']),...harnessAgent?{harnessAgent}:{},...extra},turnHome,async()=>null);
  assert.equal((await chat('object:app-notes','writer')).message,'Profile writer');
  assert.equal((await chat('overview')).message,'Profile main');
  assert.equal((await chat('object:app-notes','writer')).message,'Profile writer');
  const started=()=>fs.readFileSync(log,'utf8').trim().split('\n').map(line=>JSON.parse(line).argv);
  assert.deepEqual(started(),[['-p','writer','acp'],['acp']],'one resident process per profile, each kept');
  // A turn of its own process (here background work) names the profile too.
  assert.equal((await chat('object:app-notes','writer',{_background:true})).message,'Profile writer');
  assert.deepEqual(started().at(-1),['-p','writer','acp']);
  await adapter.shutdown();
 }
});
console.log('PASS Harness agents: rules, OpenClaw agents and Hermes Agent profiles read from fixture folders (unchanged), the per-Applet choice in a World, OpenClaw Gateway naming the chosen agent and its fallback in that agent’s workspace and model, Hermes Agent started with -p for the chosen profile');
