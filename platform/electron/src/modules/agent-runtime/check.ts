// Agent runtime check: external Harness and resident Hermes transport with deterministic local
// fixtures (no model, account or network). Runs in an Electron main process: npm run test:electron -- agent-runtime
// Optional: WORLDLET_CHECK_HERMES_PYTHON=<hermes venv python> also asks the real host.py
// (dist/WorldletWeb/hermes) for `status` in a disposable HERMES_HOME.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import {app} from 'electron';
import {WorldLedger} from '../../store/ledger.ts';
import {attachChosenHermes,createAgentService,forgetSetupChoice,runtimeContext,selectAdapter} from './index.ts';
import {attachedHermes,discoverHermes,hermesCommandPath,isOwnHermes,standardHermes,standardHermesHome,unbindHermes} from './hermes-files.ts';
import {HermesAdapter,HermesRuntime,HermesSourceConnections} from './hermes.ts';
import {ExternalAgentAdapter,ExternalAgentRuntime} from './external.ts';
import {ModelAccess,loadInstallationToken,readModelSource,writeModelSource} from './model-access.ts';
import {endSetup,extractZip,runSetupStep} from './installation.ts';
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

// Speaks the resident host.py --serve frames (harness/hermes/host.py) without Hermes.
const HERMES_FIXTURE=String.raw`
import json, os, queue, sys, threading, time
lock = threading.Lock()
def emit(**event):
    with lock:
        sys.stdout.write(json.dumps(event) + '\n'); sys.stdout.flush()
inbox, replies, controls, cancelled = queue.Queue(), {}, {}, {}
def reader():
    for line in sys.stdin:
        body = json.loads(line)
        kind = body.get('type')
        if kind == 'tool_result': replies.setdefault(body['id'], queue.Queue()).put(body)
        elif kind == 'cancel': cancelled[body['requestId']] = True
        elif kind == 'steer': controls.setdefault(body['requestId'], []).append(body)
        else: inbox.put(body)
    inbox.put(None)
threading.Thread(target=reader, daemon=True).start()
assert '--serve' in sys.argv
pid = os.getpid()
while True:
    body = inbox.get()
    if body is None: break
    rid, action, text = body['requestId'], body.get('action'), body.get('text', '')
    if action in ('status', 'warmup'):
        emit(type='result', requestId=rid, value=dict(ready=True, pid=pid, home=os.environ.get('HERMES_HOME'), source=os.environ.get('WORLDLET_MODEL_SOURCE'), build=os.environ.get('WORLDLET_BUILD'), interactive=os.environ.get('HERMES_INTERACTIVE'), background='_background' in body)); continue
    if action == 'google':
        if body.get('operation') == 'connect': emit(type='google_auth', requestId=rid, url='https://accounts.google.com/o/oauth2/auth?client_id=fixture&scope=openid')
        emit(type='result', requestId=rid, value=dict(ok=True, label='fixture@example.test')); continue
    emit(type='status', requestId=rid, stage='model')
    if text == 'tool':
        pending = replies.setdefault('t1', queue.Queue())
        emit(type='tool', requestId=rid, id='t1', name='query_world_items', args=dict(query='x'))
        reply = pending.get(timeout=10); replies.pop('t1', None)
        emit(type='delta', requestId=rid, text='got ')
        emit(type='result', requestId=rid, value=dict(message='tool:' + json.dumps(reply['result'], sort_keys=True), pid=pid))
    elif text == 'steer':
        seen, deadline = [], time.time() + 10
        while time.time() < deadline and not seen:
            for control in controls.pop(rid, []):
                seen.append(control['text'])
                emit(type='steer_result', requestId=rid, controlId=control['controlId'], accepted=True)
                emit(type='steered', requestId=rid)
            time.sleep(.02)
        emit(type='result', requestId=rid, value=dict(message='steered:' + ' '.join(seen), pid=pid))
    elif text == 'slow':
        emit(type='delta', requestId=rid, text='working')
        deadline = time.time() + 10
        while time.time() < deadline and not cancelled.get(rid): time.sleep(.02)
        emit(type='result', requestId=rid, value=dict(message='stopped', cancelled=True, pid=pid))
    elif text == 'crash':
        emit(type='error', requestId=rid, message='Fixture failure.'); sys.exit(1)
    else:
        emit(type='result', requestId=rid, value=dict(message='echo:' + text, pid=pid))
`;

// Agent configurations need an absolute executable (an .exe on Windows), so Windows resolves python.exe
// from the tools or setup Python, then PATH, skipping the WindowsApps Store alias.
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

async function hermes(){
 const web=path.join(scratch,'web');
 fs.mkdirSync(path.join(web,'hermes'),{recursive:true});
 fs.writeFileSync(path.join(web,'hermes/host.py'),HERMES_FIXTURE);
 const saved={python:process.env.WORLDLET_HERMES_PYTHON,model:process.env.WORLDLET_DEV_MODEL};
 process.env.WORLDLET_HERMES_PYTHON=python;delete process.env.WORLDLET_DEV_MODEL;
 const {context,listeners,reasons}=harness('hermes',web);
 const adapter=new HermesAdapter(context);
 const agent=createAgentService(context,adapter,listeners);
 try{
  assert.equal(agent.id,'hermes');assert.equal(agent.available,true);
  const home=agent.home('setup');
  const [first,second]=await Promise.all([agent.status(home),agent.status(home)]);
  assert.equal(first,second,'parallel status reads share one request');
  assert.equal(first.home,home);assert.equal(first.source,'local-codex');assert.equal(first.build,'development','the host names its build type to the Harness');assert.equal(first.interactive,'0');
  assert.equal(first.capabilities?.steer,true);
  const pid=first.pid;
  pass('hermes: resident status read shared, development uses local Codex and says it is a development build');

  const chat=agent.make(),events:Row[]=[];
  const result=await chat.run({action:'chat',mode:'setup',text:'tool',session:'r'},home,event=>{events.push(event);return event.type==='tool'?{ok:true}:null;});
  assert.equal(result.message,'tool:{"ok": true}');assert.equal(result.pid,pid,'same resident process');
  assert.deepEqual(events.map(event=>event.type),['status','tool','delta']);
  assert(typeof result.timings?.workerMs==='number'&&typeof result.timings?.queueMs==='number');
  pass('hermes: tool round trip on the resident process with timings');

  let modelStage=false;
  const steering=chat.run({action:'chat',mode:'chat',text:'steer',session:'r'},home,event=>{if(event.stage==='model')modelStage=true;return null;});
  await until(()=>modelStage,'steer turn');
  assert.equal(await chat.steer('blue'),true);
  assert.equal((await steering).message,'steered:blue');
  assert.equal(await chat.steer('late'),false,'no steering without a running turn');
  pass('hermes: steering reaches the running turn and is acknowledged');

  let working=false;
  const stopping=chat.run({action:'chat',mode:'chat',text:'slow',session:'r'},home,event=>{if(event.type==='delta')working=true;return null;});
  await until(()=>working,'slow turn');
  chat.cancel();
  await rejects(stopping,error=>error.name==='AbortError','cooperative cancel');
  assert.equal((await chat.run({action:'chat',mode:'chat',text:'again',session:'r'},home)).pid,pid,'cooperative cancel keeps the process');
  pass('hermes: cooperative cancel stops the turn and keeps the warm process');

  await rejects(chat.run({action:'chat',mode:'chat',text:'crash',session:'r'},home),error=>error.message==='Fixture failure.','error frame');
  const after=await chat.run({action:'chat',mode:'chat',text:'recovered',session:'r'},home);
  assert.equal(after.message,'echo:recovered');assert.notEqual(after.pid,pid,'failed process is retired');
  pass('hermes: an error frame retires the process and the next turn relaunches');

  const background=agent.make(),foreground=agent.make();let backgroundWorking=false;
  const backgroundRun=background.run({action:'chat',mode:'context_analysis',text:'slow',session:'b',_background:true},home,event=>{if(event.type==='delta')backgroundWorking=true;return null;});
  await until(()=>backgroundWorking,'background turn');
  const foregroundRun=foreground.run({action:'chat',mode:'chat',text:'first',session:'f'},home);
  await rejects(backgroundRun,error=>error.name==='AbortError','background preemption');
  assert.equal((await foregroundRun).message,'echo:first');
  pass('hermes: a foreground turn preempts background work (Core preemptAgentWork)');

  const busy=agent.make();
  const one=busy.run({action:'chat',mode:'chat',text:'slow',session:'x'},home);
  await rejects(busy.run({action:'chat',mode:'chat',text:'two',session:'x'},home),error=>/already working/.test(error.message),'one turn per runtime');
  busy.cancel();await rejects(one,error=>error.name==='AbortError','cleanup');
  pass('hermes: one request per runtime');

  // An Applet task Fox handed off runs in its own lane: talking with Fox does not wait for it, it is
  // not counted as the conversation, and background work is not preempted by it.
  const task=agent.makeTask!(),talk=agent.make(),checker=agent.make();let taskWorking=false,checking=false;
  const taskRun=task.run({action:'chat',mode:'chat',text:'slow',session:'task-1'},home,event=>{if(event.type==='delta')taskWorking=true;return null;});
  await until(()=>taskWorking,'Applet task');
  assert.equal(agent.hasInteractiveWork(),false,'an Applet task is not the conversation');
  const checkRun=checker.run({action:'chat',mode:'context_analysis',text:'slow',session:'c',_background:true},home,event=>{if(event.type==='delta')checking=true;return null;});
  await until(()=>checking,'background work beside the task');
  const preempted=rejects(checkRun,error=>error.name==='AbortError','the conversation still comes before background work');
  const meanwhile=await talk.run({action:'chat',mode:'chat',text:'meanwhile',session:'f'},home);
  assert.equal(meanwhile.message,'echo:meanwhile','the conversation answers while the task works');
  await preempted;
  task.cancel();
  await rejects(taskRun,error=>error.name==='AbortError','the task stops when cancelled');
  pass('hermes: an Applet task runs beside the conversation, which answers meanwhile');

  const model=agent.makeModelAccess();
  await model.run({action:'modelCatalog'},home);
  assert.deepEqual(reasons,[]);
  await model.run({action:'modelConfigure',provider:'x',apiKey:'k'},home);
  assert.deepEqual(reasons,['model-changed']);
  pass('hermes: model configuration notifies model-changed (catalog does not)');

  // Reset moves the homes: a status read arriving meanwhile (the page polls it) starts no process,
  // so the home can move even on Windows, and the Agent starts again afterwards.
  const resident=(await agent.status(home)).pid as number;
  await agent.whileStopped(async()=>{
   await rejects(agent.status(home),error=>error.name==='AbortError','no status read while stopped');
   assert.throws(()=>process.kill(resident,0),'the resident process ended');
   fs.renameSync(home,home+'.moved');fs.renameSync(home+'.moved',home);
  });
  assert.notEqual((await agent.status(home)).pid,resident,'the Agent starts again afterwards');
  pass('hermes: while stopped no request starts a process and the home can move; work resumes afterwards');

  if(app?.isPackaged!==undefined){
   // Under Electron the personal home also resolves bundled resources (Google client).
   const privateHome=agent.home('private');
   assert.equal((await agent.status(privateHome)).home,privateHome);
   pass('hermes: personal home launches under Electron');
  }
  const memoryHome=agent.home('private');
  fs.mkdirSync(path.join(memoryHome,'memories'),{recursive:true});fs.writeFileSync(path.join(memoryHome,'memories/USER.md'),'before');
  agent.replaceCompanionMemories([{id:'u',kind:'user',text:'after'},{id:'l',kind:'longTerm',text:'kept'}],()=>{});
  assert.equal(fs.readFileSync(path.join(memoryHome,'memories/USER.md'),'utf8'),'after');
  assert.throws(()=>agent.replaceCompanionMemories([{id:'u',kind:'user',text:'lost'}],()=>{throw Error('commit failed');}),/commit failed/);
  assert.equal(fs.readFileSync(path.join(memoryHome,'memories/USER.md'),'utf8'),'after','rolled back');
  assert.equal(fs.readFileSync(path.join(memoryHome,'memories/MEMORY.md'),'utf8'),'kept');
  assert(!fs.existsSync(path.join(memoryHome,'SOUL.md'))||fs.readFileSync(path.join(memoryHome,'SOUL.md'),'utf8')==='');
  pass('hermes: memory manager edits replace memory files and roll back on a failed commit');
  const sources=agent.makeSourceConnections();
  assert.deepEqual(sources.providers('google'),['gmail','google-calendar']);
  assert.deepEqual(sources.providers('notion'),['notion']);
  const access=agent.makeSourceAccess();
  await rejects(access.run({action:'sourceRequest',provider:'notion',operation:'delete'},home),error=>error.message==='Unsupported source operation.','source access mapping');
  pass('hermes: source connection and access mapping');

  // Google consent: the host opens the validated address in the system browser and hands the same
  // address to the page with the browser stage, for Open again and Copy link.
  const opened:string[]=[],stages:unknown[][]=[],connected:string[]=[];
  const google=new HermesSourceConnections(new HermesRuntime(adapter),{...context,openExternal:async url=>{opened.push(url);}});
  await google.connect({provider:'google',target:'',endpoint:'',token:'',home,onStage:(...stage)=>stages.push(stage),onConnected:receipt=>connected.push(receipt.provider)});
  const consent='https://accounts.google.com/o/oauth2/auth?client_id=fixture&scope=openid';
  assert.deepEqual(opened,[consent]);
  assert.deepEqual(stages,[['browser',consent],['verifying']]);
  assert.deepEqual(connected,['gmail','google-calendar']);
  pass('hermes: Google consent opens in the system browser and the browser stage carries the same address');
 }finally{
  await agent.shutdown();
  if(saved.python===undefined)delete process.env.WORLDLET_HERMES_PYTHON;else process.env.WORLDLET_HERMES_PYTHON=saved.python;
  if(saved.model!==undefined)process.env.WORLDLET_DEV_MODEL=saved.model;
 }
}

// External Harness boundary (Mac harness-boundary-check): capabilities gate requests before
// dispatch, and routines run only while Worldlet allows them (scripts/fixtures/harness/agent.py).
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

function modelToken(){
 if(process.platform==='win32')return;
 const directory=path.join(scratch,'model-access','app.worldlet.mac.dev.model-access');
 const token=loadInstallationToken(directory);
 assert.match(token,/^[0-9a-f]{64}$/);
 assert.equal(loadInstallationToken(directory),token,'one token per installation');
 assert.equal(fs.statSync(path.join(directory,'installation.token')).mode&0o777,0o600);
 assert.deepEqual(fs.readdirSync(directory),['installation.token']);
 pass('model access: owner-only installation token is created once and reused');
}

/** Worldlet provides no model (owner decision 2026-10-05): every build hands the Harness this computer's Codex
 * sign-in, whatever setup saved; the person's own provider in Hermes still wins over it there. */
function modelSource(){
 const root=path.join(scratch,'model-source');fs.mkdirSync(root,{recursive:true});
 const access=new ModelAccess();
 assert.equal(access.source,'local-codex','every build runs on this computer’s Codex sign-in');
 assert.equal(access.localCodex,true);
 writeModelSource(root,'local-codex');
 assert.equal(readModelSource(root),'local-codex');
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'agent','model-source.json'),'utf8')),{version:1,id:'local-codex'},'only the source ID is saved');
 writeModelSource(root,null);
 assert.equal(access.source,'local-codex','clearing the choice keeps Codex: there is no Worldlet model to return to');
 assert.equal('fallbackSource' in access||'allowance' in access||'prepare' in access,false,'no free charge, enrollment or allowance');
 pass('model source: Codex sign-in in every build; no Worldlet model, free charge or enrollment');
}

/** Hermes Agent and OpenClaw bring their name and memory to Fox (owner decision 2026-10-02: copy, not
 * share): explicit names only, size and link limits, and only the Agent chosen is remembered. */
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
async function sourceArchive(){
 const prefix='hermes-agent-check',entries:Buffer[]=[],directory:Buffer[]=[];
 let offset=0;
 for(let index=0;index<2000;index++){
  const name=Buffer.from(`${prefix}/pkg${index%40}/module${index}.py`),content=Buffer.from(`value = ${index}\n`.repeat(400)),packed=zlib.deflateRawSync(content);
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(8,8);local.writeUInt32LE(packed.length,18);local.writeUInt32LE(content.length,22);local.writeUInt16LE(name.length,26);
  const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(8,10);central.writeUInt32LE(packed.length,20);central.writeUInt32LE(content.length,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE(offset,42);
  entries.push(local,name,packed);directory.push(central,name);offset+=30+name.length+packed.length;
 }
 const listing=Buffer.concat(directory),end=Buffer.alloc(22);
 end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(2000,10);end.writeUInt32LE(listing.length,12);end.writeUInt32LE(offset,16);
 const archive=path.join(scratch,'source.zip'),destination=path.join(scratch,'source');
 fs.writeFileSync(archive,Buffer.concat([...entries,listing,end]));
 let ticks=0;const timer=setInterval(()=>ticks++,1);
 try{await extractZip(archive,destination,prefix);}finally{clearInterval(timer);}
 assert.equal(fs.readFileSync(path.join(destination,'pkg7/module1287.py'),'utf8'),'value = 1287\n'.repeat(400));
 assert.equal(fs.readdirSync(destination).length,40);
 assert(ticks>=10,`the main process kept running timers during extraction (${ticks} ticks)`);
 pass(`Windows runtime source: 2000 entries extracted while timers kept running (${ticks} ticks)`);
}

/** Quit ends a setup step with what it started: install.sh's uv kept writing the runtime folder after
 * Worldlet quit, and the RC permission check failed removing it (RC dc0ac274). */
async function setupQuit(){
 if(process.platform==='win32')return;
 const pidFile=path.join(scratch,'setup-child.pid');
 const step=runSetupStep('/bin/bash',['-c',`/bin/sleep 60 & echo $! > ${JSON.stringify(pidFile)}; wait`],{PATH:'/usr/bin:/bin'},scratch,false);
 await until(()=>fs.existsSync(pidFile)&&fs.readFileSync(pidFile,'utf8').trim()!=='','setup step started');
 const child=Number(fs.readFileSync(pidFile,'utf8').trim()),alive=()=>{try{process.kill(child,0);return true;}catch{return false;}};
 endSetup();await step;
 await until(()=>!alive(),'the setup step\'s child ended on quit',5000).finally(()=>{try{process.kill(child,'SIGKILL');}catch{}});
 pass('runtime setup: quit ends a setup step and the processes it started');
}

async function realHermes(){
 const interpreter=process.env.WORLDLET_CHECK_HERMES_PYTHON;
 if(!interpreter)return;
 const web=path.join(repo,'dist/WorldletWeb');
 assert(fs.existsSync(path.join(web,'hermes/host.py')),'Build the native UI first (dist/WorldletWeb/hermes/host.py).');
 const saved=process.env.WORLDLET_HERMES_PYTHON;
 process.env.WORLDLET_HERMES_PYTHON=interpreter;
 const {context,listeners}=harness('real-hermes',web);
 const agent=createAgentService(context,new HermesAdapter(context),listeners);
 try{
  const home=agent.home('setup');
  const started=Date.now();
  const status=await agent.status(home);
  assert.equal(typeof status.ready,'boolean');
  pass(`real Hermes host.py status in ${Date.now()-started} ms: ready=${status.ready} provider=${status.provider??'-'} name=${status.name??'-'} capabilities=${JSON.stringify(status.capabilities)}`);
 }finally{await agent.shutdown();if(saved===undefined)delete process.env.WORLDLET_HERMES_PYTHON;else process.env.WORLDLET_HERMES_PYTHON=saved;}
}

/** The person's own Hermes Agent is the World's Harness (owner decision 2026-10-07): choosing it attaches its
 * profile, so the built-in runtime's accounts, background work and routines run there; any other choice ends it. */
function hermesAttachment(){
 const {root,context}=harness('attach',scratch);
 const profile=path.join(scratch,'attach','user-hermes'),own=path.join(root,'agent','private','hermes');
 fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'config.yaml'),'model:\n  provider: anthropic\n');
 fs.mkdirSync(own,{recursive:true});fs.writeFileSync(path.join(own,'google_token.json'),'{"refresh_token":"r"}');
 const saved=process.env.HERMES_HOME;process.env.HERMES_HOME=profile;
 try{
  attachChosenHermes(root,'hermes');
  assert.equal(attachedHermes(root),fs.realpathSync(profile),'choosing Hermes Agent attaches its profile');
  assert.equal(new HermesAdapter(context).home('private'),fs.realpathSync(profile),'the World’s accounts and background run in it');
  assert.equal(fs.readFileSync(path.join(profile,'google_token.json'),'utf8'),'{"refresh_token":"r"}','a Google sign-in made in Worldlet comes along');
  fs.writeFileSync(path.join(profile,'google_token.json'),'{"refresh_token":"theirs"}');unbindHermes(root);
  attachChosenHermes(root,'hermes');
  assert.equal(fs.readFileSync(path.join(profile,'google_token.json'),'utf8'),'{"refresh_token":"theirs"}','the profile’s own sign-in is never replaced');
  attachChosenHermes(root,'openclaw');
  assert.equal(attachedHermes(root),null,'another Agent ends the attachment');
  assert.equal(new HermesAdapter(context).home('private'),own,'Worldlet’s own Hermes home again');
  attachChosenHermes(root,'hermes');forgetSetupChoice(root);
  assert.equal(attachedHermes(root),null,'reset Fox forgets it too');
  assert.ok(fs.existsSync(path.join(profile,'config.yaml')),'the person’s profile is never removed');
  pass('hermes attachment: choosing Hermes Agent runs the World on its profile; other choices and reset end it');
 }finally{if(saved===undefined)delete process.env.HERMES_HOME;else process.env.HERMES_HOME=saved;}
}

function standardHermesProfile(){
 const {root}=harness('standard',scratch);
 const user=path.join(scratch,'standard','user'),own=path.join(root,'agent','private','hermes'),env={};
 const options={python:'/runtime/bin/python',launcher:'/app/hermes/hermes_command.py',userHome:user,environment:env,platform:'darwin' as NodeJS.Platform};
 assert.deepEqual(standardHermes(root,options),{home:null,command:null},'nothing before Fox’s profile exists');
 fs.mkdirSync(own,{recursive:true});fs.writeFileSync(path.join(own,'config.yaml'),'model:\n  provider: openai-codex\n  worldlet_source: local-codex\n');
 const made=standardHermes(root,options);
 assert.equal(made.home,path.join(user,'.hermes'));
 assert.ok(fs.lstatSync(made.home!).isSymbolicLink()&&isOwnHermes(root,made.home!),'~/.hermes is Fox’s profile');
 assert.equal(discoverHermes(user,{},'darwin'),fs.realpathSync(own),'Hermes Agent finds it where it looks');
 assert.equal(made.command,hermesCommandPath(user));
 const script=fs.readFileSync(made.command!,'utf8');
 assert.match(script,/^#!\/bin\/sh\n[^\n]*worldlet-hermes-command[^\n]*\nexec '\/runtime\/bin\/python' '\/app\/hermes\/hermes_command.py' "\$@"\n$/,'the hermes command runs the official command line on Worldlet’s runtime');
 // Windows keeps no executable bit; the command is for macOS and Linux.
 if(process.platform!=='win32')assert.ok(fs.statSync(made.command!).mode&0o100,'it is executable');
 standardHermes(root,{...options,python:'/runtime-2/bin/python'});
 assert.match(fs.readFileSync(made.command!,'utf8'),/runtime-2/,'a new runtime updates it');
 // Never anything of the person's own.
 const other=path.join(scratch,'standard','other');fs.mkdirSync(path.join(other,'.hermes'),{recursive:true});
 assert.deepEqual(standardHermes(root,{...options,userHome:other}),{home:null,command:null},'their own ~/.hermes is left alone');
 const third=path.join(scratch,'standard','third');fs.mkdirSync(path.join(third,'.local','bin'),{recursive:true});fs.writeFileSync(hermesCommandPath(third),'#!/bin/sh\nexec real-hermes "$@"\n');
 assert.equal(standardHermes(root,{...options,userHome:third}).command,null,'their own hermes command is left alone');
 assert.equal(fs.readFileSync(hermesCommandPath(third),'utf8'),'#!/bin/sh\nexec real-hermes "$@"\n');
 assert.deepEqual(standardHermes(root,{...options,userHome:path.join(scratch,'standard','fourth'),environment:{HERMES_HOME:'/elsewhere'}}),{home:null,command:null},'nor while HERMES_HOME points elsewhere');
 assert.equal(standardHermesHome('C:\\Users\\a',{LOCALAPPDATA:'C:\\Users\\a\\AppData\\Local'},'win32'),'C:\\Users\\a\\AppData\\Local\\hermes','Windows: %LOCALAPPDATA%\\hermes');
 if(process.platform==='win32'){
  const windows=standardHermes(root,{...options,userHome:path.join(scratch,'standard','win'),environment:{LOCALAPPDATA:path.join(scratch,'standard','win','AppData','Local')},platform:'win32'});
  assert.ok(windows.home&&isOwnHermes(root,windows.home)&&windows.command===null,'Windows gets the profile (a junction) and no command');
 }
 // Fox's own profile is not another Hermes Agent to attach or choose.
 const saved=process.env.HERMES_HOME;process.env.HERMES_HOME=made.home!;
 try{attachChosenHermes(root,'hermes');assert.equal(attachedHermes(root),null,'choosing it attaches nothing');}
 finally{if(saved===undefined)delete process.env.HERMES_HOME;else process.env.HERMES_HOME=saved;}
 pass('standard Hermes Agent: Fox’s profile at the standard location with a hermes command, never replacing the person’s own');
}

// Top-level await: the Electron wrapper (scripts/electron-checks.ts) exits once this module settles.
try{modelToken();modelSource();localMemory();hermesAttachment();standardHermesProfile();await sourceArchive();await setupQuit();await external();await harnessBoundary();await harnessExample();await hermes();await realHermes();console.log(`PASS agent runtime: ${passed.length} checks`);}
catch(error){console.error('FAIL',error);process.exitCode=1;}
finally{fs.rmSync(scratch,{recursive:true,force:true});}
