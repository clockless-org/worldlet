// Agent runtime check: external Harness, no Agent and a chosen Hermes Agent's profile with deterministic local
// fixtures (no model, account or network). Runs in an Electron main process: npm run test:electron -- agent-runtime
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {app} from 'electron';
import {WorldLedger} from '../../store/ledger.ts';
import {attachChosenHermes,createAgentService,forgetSetupChoice,runtimeContext,selectAdapter} from './index.ts';
import {attachedHermes,unbindHermes} from './hermes-files.ts';
import {ExternalAgentAdapter,ExternalAgentRuntime,NO_AGENT,NoAgentAdapter} from './external.ts';
import {readAdopted,readLocalAgentMemory,writeAdopted} from './local-memory.ts';
import type {Profile} from '../../profile.ts';
import type {Row} from './types.ts';
import {setTimeout as sleep} from 'node:timers/promises';

const EXTERNAL_FIXTURE=String.raw`
import json, os, sys, time
caps = dict(streaming=True, tools=True, cancel=True, steer=False, memory=False, sessions=False, routines=True)
def send(**event): print(json.dumps(event), flush=True)
hello = json.loads(sys.stdin.readline())
assert hello == dict(type='hello', protocolVersion=1), hello
send(type='hello', protocolVersion=1, id='fixture', capabilities=caps)
request = json.loads(sys.stdin.readline())
body, rid = request['body'], request['id']
text = body.get('text', '')
if body['action'] == 'status':
    send(type='result', requestId=rid, value=dict(ready=True, env=sorted(os.environ), home=os.environ.get('WORLDLET_AGENT_HOME')))
elif text == 'tool':
    send(type='response_start', requestId=rid)
    send(type='tool', requestId=rid, id='w1', name='query_world_items', args=dict(query='x'))
    reply = json.loads(sys.stdin.readline())
    assert reply['type'] == 'tool_result' and reply['id'] == 'w1', reply
    send(type='delta', requestId=rid, text='ok')
    send(type='result', requestId=rid, value=dict(message='tool:' + json.dumps(reply['result'], sort_keys=True)))
elif text == 'slow':
    send(type='delta', requestId=rid, text='working')
    time.sleep(30)
else:
    send(type='result', requestId=rid, value=dict(message='echo:' + text))
`;

// Speaks the resident host.py --serve frames of Worldlet's former built-in Hermes, without Hermes.
const python=process.platform==='win32'
 ?[process.env.WORLDLET_TOOLS_PYTHON,process.env.WORLDLET_SETUP_PYTHON,...(process.env.PATH??'').split(path.delimiter).filter(dir=>dir&&!/\\WindowsApps\\?$/i.test(dir)).map(dir=>path.join(dir,'python.exe'))]
  .find((file):file is string=>!!file&&path.isAbsolute(file)&&file.toLowerCase().endsWith('.exe')&&fs.existsSync(file))??'python.exe'
 :['/usr/bin/python3','/usr/local/bin/python3','/opt/homebrew/bin/python3'].find(file=>fs.existsSync(file))??'python3';
const repo=path.resolve(process.env.WORLDLET_CHECK_REPO??process.cwd());
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'worldlet-agent-runtime-'));
const passed:string[]=[];
const pass=(text:string)=>{passed.push(text);console.log('PASS '+text);};
const until=async(test:()=>boolean,label:string,ms=8000)=>{const end=Date.now()+ms;while(!test()){if(Date.now()>end)throw Error('Timed out waiting for '+label);await sleep(10);}};
const rejects=async(promise:Promise<unknown>,check:(error:Error)=>boolean,label:string)=>{try{await promise;}catch(error){assert(check(error as Error),label+': '+(error as Error).message);return;}throw Error(label+': expected a failure');};

function harness(name:string,webRoot:string){
 const root=path.join(scratch,name,'library');
 fs.mkdirSync(root,{recursive:true});
 const profile:Profile={channel:'dev',worktree:'',root,title:'Worldlet Check',webRoot,resources:repo,smoke:false};
 let ledger:WorldLedger|null=null;
 const reasons:string[]=[];
 const listeners:((reason:'runtime-ready'|'model-changed'|'agent-changed')=>void)[]=[reason=>reasons.push(reason)];
 const context=runtimeContext(profile,{
  analyticsID:()=>'',openExternal:async()=>{throw Error('No browser in checks.');},
  record:entry=>(ledger??=new WorldLedger(root)).recordExecution(entry),
  failure:()=>{},changed:reason=>{for(const listener of listeners)listener(reason);}
 });
 return {root,profile,context,listeners,reasons,ledger:()=>ledger??=new WorldLedger(root)};
}

async function external(){
 const fixture=path.join(scratch,'external-agent.py');
 fs.writeFileSync(fixture,EXTERNAL_FIXTURE);
 const config=path.join(scratch,'agent.json');
 fs.writeFileSync(config,JSON.stringify({protocolVersion:1,id:'fixture',executable:python,arguments:[fixture]}));
 const {context,listeners,root,ledger}=harness('external',path.join(scratch,'no-web'));
 const agent=createAgentService(context,selectAdapter(context,config),listeners);
 assert.equal(agent.id,'fixture');assert.equal(agent.available,true);assert.equal(agent.memoryAuthority,'worldlet');
 const home=agent.home('private');
 assert.equal(home,path.join(root,'agent/private/fixture'));
 const status=await agent.status(home);
 assert.equal(status.ready,true);assert.equal(status.home,home);
 assert.equal(status.capabilities?.routines,true,'status reports validated capabilities');
 // The macOS /usr/bin/python3 shim (xcrun) adds its own SDK variables. On Windows the runtime sets the
 // system and profile variables, and libuv adds HOMEDRIVE, HOMEPATH, LOGONSERVER, USERDOMAIN and USERNAME.
 const shim=process.platform==='win32'
  ?['SYSTEMROOT','SYSTEMDRIVE','WINDIR','USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP','PYTHONIOENCODING','HOMEDRIVE','HOMEPATH','LOGONSERVER','USERDOMAIN','USERNAME']
  :['__CF_USER_TEXT_ENCODING','LC_CTYPE','CPATH','LIBRARY_PATH','MANPATH','SDKROOT'];
 assert.deepEqual(status.env.filter((key:string)=>!['PATH','HOME','TMPDIR','LANG','PYTHONUNBUFFERED','WORLDLET_AGENT_HOME',...shim].includes(key)),[],'minimal environment');
 pass('external: handshake, status capabilities and minimal environment');

 const runtime=agent.make(),events:Row[]=[];
 const result=await runtime.run({action:'chat',mode:'chat',text:'tool',session:'s'},home,event=>{events.push(event);return event.type==='tool'?{ok:true,value:42}:null;});
 assert.equal(result.message,'tool:{"ok": true, "value": 42}');
 assert.deepEqual(events.map(event=>event.type),['response_start','tool','delta']);
 assert.equal(await runtime.steer('more'),false);
 pass('external: streamed turn with a World tool round trip; steering is not offered');

 const slow=agent.make();let started=false;
 const pending=slow.run({action:'chat',mode:'chat',text:'slow',session:'s'},home,event=>{if(event.type==='delta')started=true;return null;});
 await until(()=>started,'slow external turn');
 assert.equal(agent.hasInteractiveWork(),true);
 slow.cancel();
 await rejects(pending,error=>error.name==='AbortError','external cancel');
 assert.equal(agent.hasInteractiveWork(),false);
 pass('external: cancellation stops the turn process');

 const db=ledger();
 const runs=db.records('runtime-runs');
 assert(runs.some(run=>run.status==='succeeded')&&runs.some(run=>run.status==='cancelled'),'journal runs: '+JSON.stringify(runs.map(run=>run.status)));
 const files=(db.history({limit:1000}) as {body?:{data?:{payloadRef?:string}}}[]).map(row=>row.body?.data?.payloadRef).filter((ref):ref is string=>typeof ref==='string');
 assert(files.length>=6&&files.every(ref=>db.payload(ref.slice('execution/'.length,-'.json'.length))!==undefined),'every journal event has its payload in world.sqlite');
 assert(!fs.existsSync(path.join(root,'execution')),'no payload files beside the database');
 const sampleHome=agent.home('sample');
 const before=db.records('runtime-runs').length;
 await agent.make().run({action:'chat',mode:'chat',text:'hi',session:'s'},sampleHome);
 assert.equal(db.records('runtime-runs').length,before,'sample turns are not journaled');
 pass(`external: private runs journaled into world.sqlite (${runs.length} runs, ${files.length} payloads); sample runs are not`);
 db.close();// Windows cannot remove the scratch directory while world.sqlite is open.

 const unavailable=selectAdapter(context,path.join(scratch,'missing.json'));
 assert.equal(unavailable.available,false);assert.equal(unavailable.id,'external');
 await rejects(unavailable.status(home),error=>/ENOENT|no such file/i.test(error.message),'unavailable adapter');
 assert.equal(agent.replaceCompanionMemories,undefined,'external memory is not editable');
 pass('external: a bad configuration selects the unavailable adapter; memory is not editable');
}

/** No Agent chosen (owner decisions 2026-10-09: no built-in Hermes): Fox waits for one, and the World's connections
 * keep their home in Fox's earlier profile folder, or a chosen Hermes Agent's own profile. */
async function noAgent(){
 const {root,context,listeners}=harness('no-agent',path.join(scratch,'no-web'));
 const adapter=selectAdapter(context,undefined);
 assert.ok(adapter instanceof NoAgentAdapter,'no Agent chosen: no built-in one');
 const agent=createAgentService(context,adapter,listeners);
 assert.equal(agent.id,'none');assert.equal(agent.available,false);assert.equal(agent.supportsBackgroundChecks,false);
 const status=await agent.status(agent.home('private'));
 assert.equal(status.ready,false);assert.equal(status.error,NO_AGENT);
 await rejects(agent.make().run({action:'chat',mode:'chat',text:'hi'},agent.home('private')),error=>error.message===NO_AGENT,'a turn says Fox needs an Agent');
 await rejects(agent.makeModelAccess().run({action:'status'},agent.home('private')),error=>error.message===NO_AGENT,'no model of its own');
 assert.equal(agent.accountsId,'hermes','connections keep the transport they have always had');
 assert.equal(agent.accountsHome(),path.join(root,'agent','private','hermes'));
 assert.equal(agent.replaceCompanionMemories,undefined);
 pass('no Agent: Fox waits for one; connections keep their home');
}

async function harnessBoundary(){
 const fixture=path.join(repo,'scripts/fixtures/harness/agent.py');
 const config=(mode:string)=>({protocolVersion:1,id:'fixture',executable:python,arguments:[fixture,mode]});
 const requests=(home:string)=>{try{return fs.readFileSync(path.join(home,'requests.txt'),'utf8').trim().split(/\r?\n/);}catch{return [];}};
 for(const mode of ['legacy','supported','invalid']){
  const home=path.join(scratch,'boundary',mode),runtime=new ExternalAgentRuntime(config(mode));
  if(mode==='supported'){
   assert.equal((await runtime.run({action:'modelCatalog'},home)).providers?.[0]?.id,'fixture-provider');
   assert.equal((await runtime.run({action:'modelConfigure',model:'fixture'},home)).ok,true);
   assert.deepEqual(requests(home),['modelCatalog','modelConfigure']);
  }else{
   for(const action of ['modelConfigure','routine_tick'])await rejects(runtime.run({action},home),error=>mode==='invalid'?/capabilit/i.test(error.message):/does not support/.test(error.message),`${mode} ${action}`);
   assert.deepEqual(requests(home),[],'a refused capability never dispatches the request');
  }
  await rejects(runtime.run({action:'modelLogin'},home),error=>/browser login|capabilit/i.test(error.message),`${mode} modelLogin`);
 }
 pass('external Harness: unsupported or invalid capabilities are refused before dispatch; browser login is never exposed');
 const {context}=harness('boundary-routines',path.join(scratch,'no-web'));
 const results:Row[]=[];
 const scheduler=new ExternalAgentAdapter(context,config('supported')).makeRoutines(),home=path.join(context.root,'agent/private/fixture');
 let allowed=false;
 scheduler.start(()=>allowed,result=>results.push(result));
 await sleep(1500);scheduler.stop();
 assert.deepEqual([results.length,requests(home)],[0,[]],'no routine runs without Worldlet’s consent');
 allowed=true;
 scheduler.start(()=>allowed,result=>results.push(result));
 await until(()=>results.length>0,'allowed routine tick',10000);scheduler.stop();
 assert.deepEqual(results,[{ok:true,executed:1}] as Row[]);
 const legacy=new ExternalAgentAdapter(context,config('legacy')).makeRoutines();
 legacy.start(()=>true,result=>results.push(result));
 await until(()=>requests(home).length===3,'legacy status',10000);await sleep(500);legacy.stop();
 assert.equal(results.length,1,'a legacy Harness cannot manufacture scheduled results');
 assert.deepEqual(requests(home),['status','routine_tick','status']);
 pass('external Harness routines: none while not allowed, one tick once allowed, none from a Harness without routines');
}

// The independent example Harness (harness/example/agent.py; Mac external-agent-check): streaming,
// tool receipts and errors, cancellation, version mismatch and unsupported services, no Hermes state.
async function harnessExample(){
 const config={protocolVersion:1,id:'example',executable:python,arguments:[path.join(repo,'harness/example/agent.py')]};
 const {context}=harness('example',path.join(scratch,'no-web'));
 const adapter=new ExternalAgentAdapter(context,config),home=adapter.home('private'),runtime=adapter.make();
 const status=await runtime.run({action:'status'},home);
 assert.equal(status.ready,true);assert.notEqual(status.capabilities?.routines,true);
 let deltas='',tools=0;
 const reply=await runtime.run({action:'chat',text:'open browser'},home,event=>{
  if(event.type==='tool'){tools++;assert.equal(event.name,'open_applet');return {ok:true};}
  if(typeof event.text==='string')deltas+=event.text;return null;
 });
 assert.deepEqual([reply.message,deltas,tools],['Browser is open.','Browser is open. ',1]);
 const blocked=await runtime.run({action:'chat',text:'open browser'},home,event=>event.type==='tool'?{error:'permission denied'}:null);
 assert.match(blocked.message,/permission denied/);
 let streaming=false;
 const slow=runtime.run({action:'chat',text:'slow '.repeat(1000)},home,event=>{if(event.type==='delta')streaming=true;return null;});
 await until(()=>streaming,'example streaming');
 assert.equal(adapter.hasInteractiveWork(),true);
 await adapter.shutdown();
 await rejects(slow,error=>error.name==='AbortError','example shutdown');
 assert.equal(adapter.hasInteractiveWork(),false);
 assert.equal((await runtime.run({action:'status'},home)).ready,true,'the runtime is reusable after shutdown');
 const bad=new ExternalAgentRuntime({...config,arguments:['-c',"import json; print(json.dumps({'type':'hello','protocolVersion':99}),flush=True)"]});
 await rejects(bad.run({action:'status'},home),error=>/handshake/i.test(error.message),'version mismatch');
 for(const service of [adapter.makeModelAccess(),adapter.makeSourceAccess()])await rejects(service.run({action:'modelConfigure'},home),()=>true,'unsupported service');
 const results:Row[]=[];const routines=adapter.makeRoutines();
 routines.start(()=>true,result=>results.push(result));await sleep(1000);routines.stop();
 assert.deepEqual(results,[],'unsupported schedules manufacture no results');
 assert(!adapter.allowsBackupPath('agent/private/hermes/state.db')&&!adapter.supportsBackgroundChecks&&adapter.profile(true).supported===false);
 const files=fs.readdirSync(context.root,{recursive:true}).map(String);
 assert(!files.some(file=>/(^|\/)\.?hermes$/.test(file)),'no Hermes state: '+files.join(', '));
 pass('example Harness: streaming, tool receipt and error, shutdown and reuse, version mismatch and unsupported services refused, no Hermes state');
}

function localMemory(){
 const home=path.join(scratch,'local-memory-home');
 const write=(relative:string,text:string)=>{const file=path.join(home,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);};
 assert.equal(readLocalAgentMemory('hermes',home,{}),null,'no Hermes profile, nothing to bring');
 write('.hermes/config.yaml','model:\n  default: gpt-5\n');
 write('.hermes/SOUL.md','# Persona\nBe warm and brief.\n');
 assert.equal(readLocalAgentMemory('hermes',home,{}),null,'a default SOUL.md is not a name and there is no memory');
 write('.hermes/SOUL.md','**Name:** Nova\nBe warm and brief.\n');
 write('.hermes/memories/USER.md','Kelvin prefers Chinese.\n');
 write('.hermes/memories/MEMORY.md','Project Worldlet ships three times a day.\n');
 assert.deepEqual(readLocalAgentMemory('hermes',home,{}),{name:'Nova',soul:'**Name:** Nova\nBe warm and brief.',user:'Kelvin prefers Chinese.',longTerm:'Project Worldlet ships three times a day.',model:false});
 fs.writeFileSync(path.join(home,'.hermes/memories/MEMORY.md'),'x'.repeat(1_000_001));
 assert.equal(readLocalAgentMemory('hermes',home,{})?.longTerm,'','memory over 1 MB is left behind');
 const outside=path.join(scratch,'outside-memory.md');fs.writeFileSync(outside,'secret');
 fs.rmSync(path.join(home,'.hermes/memories/USER.md'));fs.symlinkSync(outside,path.join(home,'.hermes/memories/USER.md'));
 assert.equal(readLocalAgentMemory('hermes',home,{})?.user,'','a link out of the profile is not followed');
 assert.equal(readLocalAgentMemory('openclaw',home,{}),null,'no OpenClaw workspace');
 write('.openclaw/workspace/IDENTITY.md','# IDENTITY.md\n- **Name:** Clawd\n- **Emoji:** 🦞\n');
 write('.openclaw/workspace/USER.md','Name: Kelvin\n');
 write('.openclaw/workspace/MEMORY.md','Likes short answers.\n');
 assert.deepEqual(readLocalAgentMemory('openclaw',home,{}),{name:'Clawd',soul:'',user:'Name: Kelvin',longTerm:'Likes short answers.',model:false});
 write('.openclaw/openclaw.json','{}');
 assert.equal(readLocalAgentMemory('openclaw',home,{})?.model,true,'an OpenClaw configuration may hold a model to bring');
 write('.hermes/config.yaml','model:\n  provider: deepseek\n  default: deepseek-chat\n');
 assert.equal(readLocalAgentMemory('hermes',home,{})?.model,true,'a Hermes provider setting may be an API key to bring');
 const state=path.join(scratch,'openclaw-state');
 write('../openclaw-state/workspace-work/IDENTITY.md','You are Pinchy.\n');
 assert.equal(readLocalAgentMemory('openclaw',home,{OPENCLAW_STATE_DIR:state,OPENCLAW_PROFILE:'work'})?.name,'Pinchy','OPENCLAW_STATE_DIR and OPENCLAW_PROFILE pick the workspace');
 const root=path.join(scratch,'adopted');fs.mkdirSync(root,{recursive:true});
 assert.equal(readAdopted(root),null);
 writeAdopted(root,'openclaw');assert.equal(readAdopted(root),'openclaw');
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'agent','adopted-agent.json'),'utf8')),{version:1,id:'openclaw'},'only the Agent ID is saved');
 writeAdopted(root,null);assert.equal(readAdopted(root),null);
 pass('local Agent memory: Hermes Agent and OpenClaw names and memory read within limits; only the chosen ID saved');
}

/** The Windows runtime source extracts during startup; the World must keep painting (#1245). */
function hermesAttachment(){
 const {root,context}=harness('attach',scratch);
 const profile=path.join(scratch,'attach','user-hermes'),own=path.join(root,'agent','private','hermes');
 fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'config.yaml'),'model:\n  provider: anthropic\n');
 fs.mkdirSync(own,{recursive:true});fs.writeFileSync(path.join(own,'google_token.json'),'{"refresh_token":"r"}');
 const saved=process.env.HERMES_HOME;process.env.HERMES_HOME=profile;
 try{
  attachChosenHermes(root,'hermes');
  assert.equal(attachedHermes(root),fs.realpathSync(profile),'choosing Hermes Agent attaches its profile');
  assert.equal(createAgentService(context,new NoAgentAdapter(context),[]).accountsHome(),fs.realpathSync(profile),'the World’s connections are kept in it');
  assert.equal(fs.readFileSync(path.join(profile,'google_token.json'),'utf8'),'{"refresh_token":"r"}','a Google sign-in made in Worldlet comes along');
  fs.writeFileSync(path.join(profile,'google_token.json'),'{"refresh_token":"theirs"}');unbindHermes(root);
  attachChosenHermes(root,'hermes');
  assert.equal(fs.readFileSync(path.join(profile,'google_token.json'),'utf8'),'{"refresh_token":"theirs"}','the profile’s own sign-in is never replaced');
  attachChosenHermes(root,'openclaw');
  assert.equal(attachedHermes(root),null,'another Agent ends the attachment');
  assert.equal(createAgentService(context,new NoAgentAdapter(context),[]).accountsHome(),own,'the library’s own folder again');
  attachChosenHermes(root,'hermes');forgetSetupChoice(root);
  assert.equal(attachedHermes(root),null,'reset Fox forgets it too');
  assert.ok(fs.existsSync(path.join(profile,'config.yaml')),'the person’s profile is never removed');
  pass('hermes attachment: choosing Hermes Agent runs the World on its profile; other choices and reset end it');
 }finally{if(saved===undefined)delete process.env.HERMES_HOME;else process.env.HERMES_HOME=saved;}
}

try{localMemory();hermesAttachment();await external();await noAgent();await harnessBoundary();await harnessExample();console.log(`PASS agent runtime: ${passed.length} checks`);}
catch(error){console.error('FAIL',error);process.exitCode=1;}
finally{fs.rmSync(scratch,{recursive:true,force:true});}
