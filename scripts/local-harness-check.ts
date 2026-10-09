import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {LOCAL_HARNESSES,finishLocalHarness,openClawToolConfig,localHarnessAdapterId,localHarnessInvocation,localHarnessStream,localHarnessTurn,rankLocalHarnesses,readLocalHarnessLine,recommendLocalHarness,
 type LocalHarnessId} from '../core/agent/index.ts';
import {spawn} from 'node:child_process';
import {openWorldToolBridge} from '../platform/electron/src/modules/agent-runtime/world-tool-bridge.ts';
import {LocalHarnessAdapter,LocalHarnessRuntime,builtInModel,harnessEnvironment,harnessVersion,locateLocalHarnesses,readSelection,searchDirectories,selectedInstall,writeSelection,type HarnessEnvironment} from '../platform/electron/src/modules/agent-runtime/local-harness.ts';
import {withTempDir} from './test-temp.ts';

// Local Agent Harnesses at setup: the shared catalog, recommendation, per-command turns and output
// readers, then the host's detection and one streamed turn against fixture executables (no model,
// account or network). Real Claude Code/Codex/Hermes/OpenClaw/pi sign-ins are verified on devices.

// Catalog and recommendation ------------------------------------------------------------------
assert.deepEqual(LOCAL_HARNESSES.map(h=>h.id),['claude-code','codex','hermes','openclaw','pi']);
assert.equal(recommendLocalHarness([]),null);
assert.equal(recommendLocalHarness([{id:'pi',configured:true},{id:'codex',configured:true}]),'codex','catalog order among set-up Harnesses');
assert.equal(recommendLocalHarness([{id:'claude-code',configured:false},{id:'openclaw',configured:true}]),'openclaw','a set-up Harness beats a merely installed one');
assert.equal(recommendLocalHarness([{id:'claude-code',configured:true},{id:'codex',configured:true,model:true}]),'codex','one that can power Fox\'s models comes first');
assert.equal(recommendLocalHarness([{id:'claude-code',configured:true,model:true},{id:'codex',configured:true,model:false}]),'claude-code','a signed-out Codex does not');
assert.deepEqual(rankLocalHarnesses([{id:'unknown',configured:true},{id:'hermes',configured:false}]).map(h=>h.id),['hermes'],'unknown IDs are dropped');
assert.equal(localHarnessAdapterId('hermes'),'local-hermes','never the built-in hermes adapter ID');

// One turn ----------------------------------------------------------------------------------------
const turn=localHarnessTurn({text:'  What is next? ',style:'Be warm.',history:[{role:'user',text:'hi'},{role:'assistant',text:'Hello!'}],context:{view:'world'}});
assert.match(turn.system,/You are Fox/);assert.match(turn.system,/Be warm\./);
assert.match(turn.prompt,/Person: hi\nFox: Hello!/);assert.match(turn.prompt,/"view":"world"/);assert.ok(turn.prompt.endsWith('Person: What is next?'));
assert.match(turn.system,/cannot act in Worldlet/,'text-only by default');
assert.match(localHarnessTurn({text:'hi'},{worldTools:true}).system,/describe_world_tools.*call_world_tool/);
assert.deepEqual(LOCAL_HARNESSES.filter(h=>h.worldTools).map(h=>h.id),['claude-code','codex','hermes','openclaw','pi'],'every Harness gets World tools for a turn');
assert.deepEqual(LOCAL_HARNESSES.filter(h=>h.connect).map(h=>h.id),['hermes','openclaw','pi'],'the person\'s own Agents are talked through directly');
const own=localHarnessTurn({text:'hi'},{own:true}).system;
assert.match(own,/their own Agent/);assert.doesNotMatch(own,/You are Fox/,'a connected Agent keeps its own identity');
assert.throws(()=>localHarnessTurn({text:'  '}),/needs a message/);
const long=localHarnessTurn({text:'x'.repeat(40000)});
assert.ok(long.prompt.length<=24000&&long.prompt.endsWith('xxx'),'the newest words survive clipping');
for(const id of LOCAL_HARNESSES.map(h=>h.id)){
 const {args,stdin}=localHarnessInvocation(id,long);
 const commandLine=args.reduce((sum,arg)=>sum+arg.length+3,0);
 assert.ok(commandLine<32000,`${id} stays within the Windows command line: ${commandLine}`);
 assert.ok(stdin!==null||args.some(arg=>arg.includes('xxx')),`${id} receives the prompt`);
}
assert.deepEqual(localHarnessInvocation('claude-code',turn).args.slice(0,7),['-p','--input-format','stream-json','--output-format','stream-json','--verbose','--include-partial-messages']);
// The prompt is one stream-json message, so the command line does not depend on it (a spare process can start first).
assert.deepEqual(JSON.parse(localHarnessInvocation('claude-code',turn).stdin!),{type:'user',message:{role:'user',content:turn.prompt}});
assert.deepEqual(localHarnessInvocation('claude-code',turn).args,localHarnessInvocation('claude-code',{...turn,prompt:''}).args);
assert.ok(['--strict-mcp-config','--no-session-persistence'].every(flag=>localHarnessInvocation('claude-code',turn).args.includes(flag)),'only Worldlet\'s MCP server, and Fox\'s turns stay out of the person\'s Claude Code history');
assert.deepEqual(localHarnessInvocation('codex',turn).args,['exec','--json','--skip-git-repo-check','--sandbox','read-only','-']);
const server={command:'C:\\Program Files\\Worldlet\\Worldlet.exe',args:['C:\\Users\\a b\\worldlet-mcp.cjs'],env:{ELECTRON_RUN_AS_NODE:'1',WORLDLET_MCP_TOKEN_FILE:'t'}};
// The command line is readable by other local users: a secret in the server's environment is refused.
for(const id of ['claude-code','codex'] as const)assert.throws(()=>localHarnessInvocation(id,turn,{...server,env:{...server.env,WORLDLET_MCP_TOKEN:'secret'}}),/by file/,id);
const withTools=localHarnessInvocation('claude-code',turn,server).args;
assert.deepEqual(JSON.parse(withTools[withTools.indexOf('--mcp-config')+1]),{mcpServers:{worldlet:server}});
assert.deepEqual(withTools.slice(withTools.indexOf('--allowedTools')+1,withTools.indexOf('--allowedTools')+3),['mcp__worldlet__describe_world_tools','mcp__worldlet__call_world_tool']);
assert.equal(withTools[withTools.indexOf('--allowedTools')+3],'--append-system-prompt','the tool list ends before the next option');
const codexTools=localHarnessInvocation('codex',turn,server).args;
assert.ok(codexTools.includes('mcp_servers.worldlet.command="C:\\\\Program Files\\\\Worldlet\\\\Worldlet.exe"'),'TOML-escaped Windows path');
assert.ok(codexTools.includes('mcp_servers.worldlet.env={ELECTRON_RUN_AS_NODE="1",WORLDLET_MCP_TOKEN_FILE="t"}'));
assert.ok(codexTools.includes('mcp_servers.worldlet.tools.call_world_tool.approval_mode="approve"'),'codex exec cannot answer an approval prompt, so World tools are pre-approved');
assert.equal(codexTools.at(-1),'-');
assert.deepEqual(localHarnessInvocation('openclaw',turn).args,['agent','exec','--json','--message-file','-']);
// OpenClaw: a configuration for this turn that includes the person's own and adds Worldlet's server; their workspace as its own.
assert.deepEqual(localHarnessInvocation('openclaw',turn,server,{config:'/t/c.json',workspace:'/h/.openclaw/workspace'}).args,['agent','exec','--json','--config','/t/c.json','--cwd','/h/.openclaw/workspace','--message-file','-']);
assert.deepEqual(JSON.parse(openClawToolConfig('/h/.openclaw/openclaw.json',server)),{$include:'/h/.openclaw/openclaw.json',mcp:{servers:{worldlet:{command:server.command,args:server.args,env:server.env}}},tools:{toolSearch:false}});
assert.equal(JSON.parse(openClawToolConfig(null,server)).$include,undefined,'no configuration of its own to include');
// pi: an extension for this turn, only the two World tools allowed (`--no-tools` would drop extension tools too).
const piTools=localHarnessInvocation('pi',turn,{...server,extension:'/t/worldlet-pi.cjs'}).args;
assert.deepEqual(piTools.slice(0,9),['--mode','json','--no-session','--no-extensions','-e','/t/worldlet-pi.cjs','--tools','describe_world_tools,call_world_tool','--append-system-prompt']);
assert.ok(localHarnessInvocation('pi',turn).args.includes('--no-tools')&&!piTools.includes('--no-tools'));
// Hermes Agent: one ACP session with Worldlet's MCP server, without touching its config.yaml.
const acp=localHarnessInvocation('hermes',turn,server,{cwd:'/w/home'});
assert.deepEqual(acp.args,['acp']);assert.equal(acp.acp?.prompt,turn.system+'\n\n'+turn.prompt);
const opening=acp.stdin!.trim().split('\n').map(line=>JSON.parse(line));
assert.deepEqual(opening.map(m=>[m.id,m.method]),[[1,'initialize'],[2,'session/new']]);
assert.deepEqual(opening[1].params,{cwd:'/w/home',mcpServers:[{name:'worldlet',command:server.command,args:server.args,env:[{name:'ELECTRON_RUN_AS_NODE',value:'1'},{name:'WORLDLET_MCP_TOKEN_FILE',value:'t'}]}]});
assert.deepEqual(JSON.parse(localHarnessInvocation('hermes',turn).stdin!.trim().split('\n')[1]).params.mcpServers,[],'a greeting gets no tools');

// Output readers ----------------------------------------------------------------------------------
const read=(id:LocalHarnessId,lines:unknown[],code=0,stderr='',acp?:{prompt:string})=>{
 const state=localHarnessStream(acp);
 const deltas=lines.map(line=>readLocalHarnessLine(id,state,typeof line==='string'?line:JSON.stringify(line))).filter(Boolean);
 return {deltas,outcome:finishLocalHarness(id,state,{code,stderr})};
};
// Recorded from `claude -p --output-format stream-json --verbose --include-partial-messages` (2.1).
const claude=read('claude-code',[
 {type:'system',subtype:'init',model:'claude'},
 {type:'stream_event',event:{type:'content_block_delta',index:0,delta:{type:'text_delta',text:'hello '}}},
 {type:'stream_event',event:{type:'content_block_delta',index:0,delta:{type:'text_delta',text:'fox'}}},
 {type:'assistant',message:{content:[{type:'text',text:'hello fox'}]}},
 {type:'result',subtype:'success',is_error:false,result:'hello fox'}
]);
assert.deepEqual(claude,{deltas:['hello ','fox'],outcome:{message:'hello fox'}});
assert.deepEqual(read('claude-code',[{type:'result',subtype:'success',is_error:true,result:'Invalid API key · Please run /login'}],1).outcome,{error:'Invalid API key · Please run /login'});
const codex=read('codex',[{type:'thread.started',thread_id:'t'},{type:'turn.started'},{type:'item.completed',item:{id:'i0',type:'reasoning',text:'thinking'}},{type:'item.completed',item:{id:'i1',type:'agent_message',text:'Done.'}},{type:'turn.completed',usage:{}}]);
assert.deepEqual(codex,{deltas:['Done.'],outcome:{message:'Done.'}});
assert.deepEqual(read('codex',[{type:'turn.failed',error:{message:'Not signed in'}}],1).outcome,{error:'Not signed in'});
// Hermes Agent over ACP: the session's id brings the prompt, chunks stream, permission asks are declined.
{
 const state=localHarnessStream({prompt:'Say hi'});
 const line=(value:unknown)=>readLocalHarnessLine('hermes',state,JSON.stringify(value));
 line({jsonrpc:'2.0',id:1,result:{protocolVersion:1}});assert.deepEqual(state.outbox,[]);
 line({jsonrpc:'2.0',id:2,result:{sessionId:'s1'}});
 assert.deepEqual(JSON.parse(state.outbox.shift()!),{jsonrpc:'2.0',id:3,method:'session/prompt',params:{sessionId:'s1',prompt:[{type:'text',text:'Say hi'}]}});
 const deltas=[line({jsonrpc:'2.0',method:'session/update',params:{sessionId:'s1',update:{sessionUpdate:'agent_thought_chunk',content:{type:'text',text:'hmm'}}}}),
  line({jsonrpc:'2.0',method:'session/update',params:{sessionId:'s1',update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'Hi '}}}}),
  line({jsonrpc:'2.0',method:'session/update',params:{sessionId:'s1',update:{sessionUpdate:'tool_call',toolCallId:'c',title:'x'}}}),
  line({jsonrpc:'2.0',method:'session/update',params:{sessionId:'s1',update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'there'}}}})].filter(Boolean);
 assert.deepEqual(deltas,['Hi ','there'],'only the answer, not its thinking or tool calls');
 line({jsonrpc:'2.0',id:9,method:'session/request_permission',params:{options:[{optionId:'a',kind:'allow_once'},{optionId:'r',kind:'reject_once'}]}});
 assert.deepEqual(JSON.parse(state.outbox.shift()!),{jsonrpc:'2.0',id:9,result:{outcome:{outcome:'selected',optionId:'r'}}},'a dangerous command is declined: nobody can answer');
 line({jsonrpc:'2.0',id:10,method:'fs/read_text_file',params:{}});
 assert.equal(JSON.parse(state.outbox.shift()!).error.code,-32601,'requests this client did not offer are refused');
 assert.equal(state.done,false);
 line({jsonrpc:'2.0',id:3,result:{stopReason:'end_turn'}});
 assert.equal(state.done,true);
 assert.deepEqual(finishLocalHarness('hermes',state,{code:0,stderr:''}),{message:'Hi there'});
 assert.deepEqual(read('hermes',[{jsonrpc:'2.0',id:2,error:{code:-32000,message:'No model configured'}}],0,'',{prompt:'x'}).outcome,{error:'No model configured'});
}
const pi=read('pi',[{type:'session'},{type:'message_update',assistantMessageEvent:{type:'text_delta',delta:'Sure'}},{type:'agent_end',messages:[{role:'user',content:'q'},{role:'assistant',content:[{type:'text',text:'Sure.'}]}]}]);
assert.deepEqual(pi,{deltas:['Sure'],outcome:{message:'Sure.'}});
assert.deepEqual(read('pi',[{type:'agent_end',messages:[{role:'assistant',content:[],stopReason:'error',errorMessage:'No API key'}]}],0).outcome,{error:'No API key'});
// OpenClaw prints one (possibly pretty-printed) JSON envelope at the end, no token stream.
const envelope=JSON.stringify({ok:true,status:'ok',final:'From OpenClaw',payloads:[{text:'From OpenClaw'}]},null,2).split('\n');
assert.deepEqual(read('openclaw',envelope),{deltas:[],outcome:{message:'From OpenClaw'}});
assert.deepEqual(read('openclaw',[JSON.stringify({ok:false,status:'timeout'})],2).outcome,{error:'OpenClaw timed out.'});
assert.deepEqual(read('claude-code',['not json','{"type":"other"}'],1,'boom\nError: not logged in\n').outcome,{error:'Claude Code could not answer: Error: not logged in'},'banners are not Fox’s words; stderr explains a failure');
assert.match(String((read('codex',[],0).outcome as {error:string}).error),/did not answer/);

// Host detection ----------------------------------------------------------------------------------
await withTempDir('worldlet-local-harness-',async scratch=>{
 const home=path.join(scratch,'home'),bin=path.join(home,'.local','bin');
 fs.mkdirSync(bin,{recursive:true});
 const script=(file:string,body:string)=>{fs.writeFileSync(file,'#!/bin/sh\n'+body);fs.chmodSync(file,0o755);};
 // The machine's own Homebrew folder is replaced by an empty one, so a Codex or Claude Code
 // installed on the test host is not detected.
 const brew=path.join(scratch,'homebrew','bin');fs.mkdirSync(brew,{recursive:true});
 const unix:HarnessEnvironment={platform:'darwin',env:{PATH:'/usr/bin:/bin',HOME:home,WORLDLET_INSTALLATION_TOKEN:'secret',CLAUDECODE:'1',ANTHROPIC_API_KEY:'own'},home,systemDirectories:[brew]};
 assert.ok(['/opt/homebrew/bin','/usr/local/bin'].every(dir=>searchDirectories({...unix,systemDirectories:undefined}).includes(dir)),'apps opened from the Finder also search Homebrew and /usr/local');
 assert.deepEqual(locateLocalHarnesses(unix),[],'nothing installed');
 // Claude Code from the native installer, signed in; Codex installed but never set up.
 const fixture=path.join(scratch,'claude.jsonl');
 script(path.join(bin,'claude'),`if [ "$1" = "--version" ]; then echo "2.1.0 (Claude Code)"; exit 0; fi\ncat > "$PWD/stdin.txt"\nprintf '%s\\n' "$@" > "$PWD/args.txt"\nenv > "$PWD/env.txt"\ncat "${fixture}"\n`);
 script(path.join(bin,'codex'),'exit 3\n');
 fs.writeFileSync(path.join(home,'.claude.json'),'{}');
 const found=locateLocalHarnesses(unix);
 assert.deepEqual(found.map(({id,configured})=>({id,configured})),[{id:'claude-code',configured:true},{id:'codex',configured:false}]);
 assert.equal(found[0].command,path.join(bin,'claude'),'found outside the short app PATH');
 // Windows cannot run the `#!/bin/sh` fixture, so there the version runs as node + script, like an npm shim.
 const probe=path.join(scratch,'claude-version.js');fs.writeFileSync(probe,`if(process.argv[2]==='--version'){console.log('2.1.0 (Claude Code)');process.exit(0);}process.exit(3);\n`);
 assert.equal(await harnessVersion(process.platform==='win32'?{...found[0],command:process.execPath,prefix:[probe]}:found[0],unix),'2.1.0 (Claude Code)');
 assert.equal(await harnessVersion(found[1],unix),null,'a command that does not start is not offered as working');
 const env=harnessEnvironment(found[0],unix);
 assert.equal(env.WORLDLET_INSTALLATION_TOKEN,undefined,'Worldlet’s own settings stay out');
 assert.equal(env.CLAUDECODE,undefined);
 assert.equal(env.ANTHROPIC_API_KEY,'own','the person’s own Harness configuration stays');
 // Whole `:`-separated entries; splitting would cut a Windows test host's `C:\…` folders apart.
 const onPath=(dir:string)=>`:${env.PATH}:`.includes(`:${dir}:`);
 assert.ok(onPath(bin)&&onPath(brew),'Node beside the command can be found');
 // CODEX_HOME relocates Codex's configuration.
 fs.mkdirSync(path.join(scratch,'codex-home'));
 assert.equal(locateLocalHarnesses({...unix,env:{...unix.env,CODEX_HOME:path.join(scratch,'codex-home')}}).find(h=>h.id==='codex')?.configured,true);

 // A Windows npm shim runs as node + its script; .exe wins when both exist.
 const npm=path.join(scratch,'npm');
 fs.mkdirSync(path.join(npm,'node_modules','@openai','codex','bin'),{recursive:true});
 fs.writeFileSync(path.join(npm,'node_modules','@openai','codex','bin','codex.js'),'');
 fs.writeFileSync(path.join(npm,'node.exe'),'');
 fs.writeFileSync(path.join(npm,'codex.cmd'),'@ECHO off\r\nGOTO start\r\n:find_dp0\r\nSET dp0=%~dp0\r\nEXIT /b\r\n:start\r\nSETLOCAL\r\nCALL :find_dp0\r\n"%_prog%"  "%dp0%\\node_modules\\@openai\\codex\\bin\\codex.js" %*\r\n');
 const windows:HarnessEnvironment={platform:'win32',env:{PATH:npm,APPDATA:path.join(scratch,'appdata'),LOCALAPPDATA:path.join(scratch,'local')},home:path.join(scratch,'winhome')};
 const shim=locateLocalHarnesses(windows).find(h=>h.id==='codex');
 assert.deepEqual(shim&&{command:shim.command,prefix:shim.prefix},{command:path.join(npm,'node.exe'),prefix:[path.join(npm,'node_modules','@openai','codex','bin','codex.js')]});
 fs.writeFileSync(path.join(npm,'codex.exe'),'');
 assert.equal(locateLocalHarnesses(windows).find(h=>h.id==='codex')?.command,path.join(npm,'codex.exe'));

 // Codex inside the ChatGPT or Codex app counts as Codex on this computer (only the app installed);
 // a separate command line wins when both exist.
 const apps=path.join(scratch,'Applications'),appHome=path.join(scratch,'app-home');fs.mkdirSync(appHome);
 const bundled=path.join(apps,'ChatGPT.app','Contents','Resources');fs.mkdirSync(bundled,{recursive:true});
 script(path.join(bundled,'codex'),'exit 0\n');
 const mac:HarnessEnvironment={platform:'darwin',env:{PATH:'/usr/bin:/bin'},home:appHome,systemDirectories:[brew],applicationDirectories:[apps]};
 const inApp=locateLocalHarnesses(mac).find(h=>h.id==='codex');
 assert.deepEqual(inApp&&{command:inApp.command,prefix:inApp.prefix,app:inApp.app},{command:path.join(bundled,'codex'),prefix:[],app:'ChatGPT'},'the ChatGPT app’s own Codex');
 // Newer ChatGPT builds carry it in Resources/codex-cli/bin/ instead.
 const newer=path.join(scratch,'Applications-newer'),newerBin=path.join(newer,'ChatGPT.app','Contents','Resources','codex-cli','bin');fs.mkdirSync(newerBin,{recursive:true});
 script(path.join(newerBin,'codex'),'exit 0\n');
 assert.equal(locateLocalHarnesses({...mac,applicationDirectories:[newer]}).find(h=>h.id==='codex')?.command,path.join(newerBin,'codex'),'the newer ChatGPT app’s Codex');
 assert.equal(locateLocalHarnesses({...mac,applicationDirectories:undefined}).find(h=>h.id==='codex'),undefined,'a fixture with its own system folders leaves this computer’s /Applications out');
 assert.equal(locateLocalHarnesses({...mac,platform:'linux'}).find(h=>h.id==='codex'),undefined,'Mac app bundles only on a Mac');
 const appCli=path.join(appHome,'.local','bin');fs.mkdirSync(appCli,{recursive:true});script(path.join(appCli,'codex'),'exit 0\n');
 assert.equal(locateLocalHarnesses(mac).find(h=>h.id==='codex')?.command,path.join(appCli,'codex'),'a separate Codex command line first');
 assert.equal(locateLocalHarnesses(mac).find(h=>h.id==='codex')?.app,undefined);
 // On Windows the Codex app keeps its command in bin/<build>/, a new one per update: the newest wins.
 const builds=path.join(scratch,'win-local','OpenAI','Codex','bin');
 for(const [build,age] of [['26.1.0',2000],['26.2.0',1000]] as const){
  fs.mkdirSync(path.join(builds,build),{recursive:true});const exe=path.join(builds,build,'codex.exe');fs.writeFileSync(exe,'');
  const when=new Date(Date.now()-age*1000);fs.utimesSync(exe,when,when);
 }
 const codexApp=locateLocalHarnesses({platform:'win32',env:{PATH:'',LOCALAPPDATA:path.join(scratch,'win-local')},home:path.join(scratch,'winhome')}).find(h=>h.id==='codex');
 assert.deepEqual(codexApp&&{command:codexApp.command,app:codexApp.app},{command:path.join(builds,'26.2.0','codex.exe'),app:'Codex'});

 // The saved choice is only an ID, and only counts while that Harness is installed.
 const root=path.join(scratch,'library');
 assert.equal(readSelection(root),null);
 writeSelection(root,'claude-code');
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'agent','local-harness.json'),'utf8')),{version:1,id:'claude-code'});
 assert.equal(selectedInstall(root,unix)?.id,'claude-code');
 writeSelection(root,'pi');assert.equal(selectedInstall(root,unix),null,'an uninstalled choice falls back to the built-in Agent');
 fs.writeFileSync(path.join(root,'agent','local-harness.json'),'{"version":1,"id":"/bin/sh"}');assert.equal(readSelection(root),null);
 writeSelection(root,null);assert.equal(readSelection(root),null);

 // Accounts belong to Worldlet's connector, not to Fox's Agent: with Claude Code as Fox's Agent the
 // built-in Hermes still owns them, in its own home, under its own transport. So a Google grant made
 // before choosing the Harness stays connected, and opening Mail without one goes to Google sign-in.
 {
  const context={profile:{} as any,root,development:false,analyticsID:()=>'',openExternal:async()=>{},record:()=>true,failure:()=>{},changed:()=>{}};
  let stopped=false;
  const links={providers:()=>['gmail','google-calendar']},access={run:async()=>({records:[]})};
  const builtIn:any={id:'hermes',home:(scope:string)=>path.join(root,'agent',scope,'hermes'),shutdown:async()=>{stopped=true;},makeSourceConnections:()=>links,makeSourceAccess:()=>access};
  const claude=locateLocalHarnesses(unix).find(h=>h.id==='claude-code')!;
  const adapter=new LocalHarnessAdapter(context,claude,unix,()=>builtIn);
  assert.equal(adapter.id,'local-claude-code','Fox talks through Claude Code');
  const owner=adapter.accountOwner();
  assert.deepEqual([owner.id,owner.home('private'),owner.makeSourceConnections(),owner.makeSourceAccess()],['hermes',builtIn.home('private'),links,access],'accounts stay with the built-in Hermes');
  await adapter.shutdown();assert.ok(stopped,'the built-in Agent stops with the Harness');
  const alone=new LocalHarnessAdapter(context,claude,unix).accountOwner();
  assert.equal(alone.id,'local-claude-code','without a built-in Agent the Harness answers for itself');
  await assert.rejects(alone.makeSourceConnections().connect({provider:'gmail',target:'',endpoint:'',token:'',home:'',onStage(){},onConnected(){}}),/does not provide account connections/);
  await assert.rejects(alone.makeSourceAccess().run({action:'sourceRequest',provider:'gmail',operation:'read'},''),/does not read connected accounts/);
  // Background model work runs on the person's Harness itself, beside the conversation; source reads stay on the built-in World service.
  const task={run:async()=>({})},builtInHome=path.join(scratch,'built-in');fs.mkdirSync(builtInHome,{recursive:true});
  const ready:any={...builtIn,available:true,home:()=>builtInHome,makeTask:()=>task,hasInteractiveWork:()=>false};
  let codex=true;
  const withBackground=new LocalHarnessAdapter(context,claude,unix,()=>ready,()=>codex);
  assert.equal(withBackground.supportsBackgroundChecks,true,'checks run while the built-in World service is installed');
  assert.equal(withBackground.background()?.id,'local-claude-code','background work runs on Claude Code');
  const lane=withBackground.makeTask!();
  assert.ok(lane instanceof LocalHarnessRuntime,'an Applet task is a Claude Code turn beside the conversation');
  codex=false;
  assert.equal(withBackground.background()?.id,'local-claude-code','with or without a built-in model');
  // A chosen Hermes Agent: background work runs on it like any Harness (its own `hermes acp`), never the built-in runtime.
  const hermes=new LocalHarnessAdapter(context,{...claude,id:'hermes',title:'Hermes Agent'},unix,()=>ready,()=>codex);
  assert.equal(hermes.supportsBackgroundChecks,true,'checks run on the person\'s Hermes Agent, whatever the built-in has');
  assert.equal(hermes.background()?.id,'local-hermes','background work runs on the person\'s Hermes Agent');
  assert.ok(hermes.makeTask?.() instanceof LocalHarnessRuntime,'an Applet task is a Hermes Agent turn beside the conversation');
  assert.notEqual(hermes.makeTask?.(),task,'not the built-in runtime');
  fs.writeFileSync(path.join(builtInHome,'config.yaml'),'model:\n  provider: openrouter\n  default: some/model\n');
  fs.writeFileSync(path.join(builtInHome,'config.yaml'),'model:\n  provider: openai-codex\n  worldlet_source: local-codex\n');
  assert.equal(builtInModel(builtInHome,false),false,'a host-chosen Codex source without a sign-in is no model');
  assert.equal(new LocalHarnessAdapter(context,claude,unix,()=>({...ready,available:false}),()=>true).supportsBackgroundChecks,false,'not while the built-in Agent is still installing');
 }

 // One streamed turn through the runtime.
 if(process.platform!=='win32'){
  fs.writeFileSync(fixture,[
   {type:'system',subtype:'init'},
   {type:'stream_event',event:{type:'content_block_delta',delta:{type:'text_delta',text:'Hello '}}},
   {type:'stream_event',event:{type:'content_block_delta',delta:{type:'text_delta',text:'from Claude Code'}}},
   {type:'result',subtype:'success',is_error:false,result:'Hello from Claude Code'}
  ].map(line=>JSON.stringify(line)).join('\n')+'\n');
  const runtime=new LocalHarnessRuntime(found[0],unix);
  assert.equal((await runtime.run({action:'status'},home)).ready,true);
  const agentHome=path.join(scratch,'agent-home'),events:any[]=[];
  const result=await runtime.run({action:'chat',text:'Hi Fox',style:'Be warm.',history:[]},agentHome,async event=>{events.push(event);return null;});
  assert.deepEqual(result,{message:'Hello from Claude Code'});
  assert.deepEqual(events.map(e=>e.type),['response_start','delta','delta']);
  assert.equal(events.map(e=>e.text??'').join(''),'Hello from Claude Code');
  assert.match(JSON.parse(fs.readFileSync(path.join(agentHome,'stdin.txt'),'utf8')).message.content,/Person: Hi Fox$/,'the prompt arrives on stdin');
  assert.match(fs.readFileSync(path.join(agentHome,'args.txt'),'utf8'),/^-p\n--input-format\nstream-json\n--output-format\nstream-json/);
  assert.doesNotMatch(fs.readFileSync(path.join(agentHome,'env.txt'),'utf8'),/WORLDLET_INSTALLATION_TOKEN/);
  const args=fs.readFileSync(path.join(agentHome,'args.txt'),'utf8');
  assert.match(args,/--mcp-config\n.*worldlet-mcp\.cjs/,'a foreground turn gets World tools');
  assert.match(fs.readFileSync(path.join(agentHome,'stdin.txt'),'utf8'),/./);
  await runtime.run({action:'chat',text:'Hello',allowActions:false},agentHome,async()=>null);
  assert.doesNotMatch(fs.readFileSync(path.join(agentHome,'args.txt'),'utf8'),/--mcp-config/,'a greeting stays text only');
  await runtime.run({action:'chat',text:'Check',monitor:true,_background:true},agentHome,async()=>null);
  assert.match(fs.readFileSync(path.join(agentHome,'args.txt'),'utf8'),/--mcp-config/,'the Attention check gets World tools');
  await runtime.run({action:'chat',text:'Reply with the single word: ready',_background:true},agentHome,async()=>null);
  assert.doesNotMatch(fs.readFileSync(path.join(agentHome,'args.txt'),'utf8'),/--mcp-config/,'the setup probe stays text only');
  await assert.rejects(runtime.run({action:'modelConfigure'},agentHome),/Manage its models and accounts in Claude Code/);
  // A spare process: after a turn the next one's Claude Code is already started, waiting for its prompt; the next
  // turn with the same command line uses it, one with another (here a new style) starts its own (SpareTurns).
  {
   const pids=path.join(scratch,'pids.txt');fs.rmSync(pids,{force:true});
   script(path.join(bin,'claude'),`echo $$ >> "${pids}"\ncat > "$PWD/stdin.txt"\nprintf '%s\\n' "$@" > "$PWD/args.txt"\ncat "${fixture}"\n`);
   const context={profile:{} as any,root:path.join(scratch,'spare-root'),development:false,analyticsID:()=>'',openExternal:async()=>{},record:()=>true,failure:()=>{},changed:()=>{}};
   const adapter=new LocalHarnessAdapter(context,found[0],unix);
   const spareHome=path.join(scratch,'spare-home'),started=()=>fs.existsSync(pids)?fs.readFileSync(pids,'utf8').trim().split('\n').length:0;
   const wait=async(n:number)=>{for(let i=0;i<100&&started()<n;i++)await new Promise(resolve=>setTimeout(resolve,20));await new Promise(resolve=>setTimeout(resolve,300));assert.equal(started(),n);};
   const chat=(style:string)=>adapter.make().run({action:'chat',text:'Hi Fox',style,history:[]},spareHome,async()=>null);
   assert.deepEqual(await chat('Be warm.'),{message:'Hello from Claude Code'});
   await wait(2);// the turn's own process, then the spare
   assert.deepEqual(await chat('Be warm.'),{message:'Hello from Claude Code'},'the spare answers');
   await wait(3);// the spare took the turn: only the next spare is new
   assert.equal(fs.readdirSync(spareHome).filter(name=>name.endsWith('.token')).length,1,'only the waiting spare holds a World tool token');
   await chat('Be brief.');
   await wait(5);// a different command line: a fresh process, and a spare for it
   await adapter.shutdown();
   await new Promise(resolve=>setTimeout(resolve,200));
   assert.equal(fs.readdirSync(spareHome).filter(name=>name.endsWith('.token')).length,0,'shutdown stops the spare and its bridge');
   script(path.join(bin,'claude'),`if [ "$1" = "--version" ]; then echo "2.1.0 (Claude Code)"; exit 0; fi\ncat > "$PWD/stdin.txt"\nprintf '%s\\n' "$@" > "$PWD/args.txt"\nenv > "$PWD/env.txt"\ncat "${fixture}"\n`);
  }
  // A Harness that fails explains itself; Fox never shows a blank answer.
  script(path.join(bin,'claude'),'echo "Error: not logged in" >&2\nexit 1\n');
  await assert.rejects(new LocalHarnessRuntime(found[0],unix).run({action:'chat',text:'Hi'},agentHome),/Claude Code could not answer: Error: not logged in/);
  // Cancellation stops the process.
  script(path.join(bin,'claude'),'sleep 30\n');
  const slow=new LocalHarnessRuntime(found[0],unix);
  const pending=slow.run({action:'chat',text:'Hi'},agentHome);
  setTimeout(()=>slow.cancel(),300);
  await assert.rejects(pending,(error:Error)=>error.name==='AbortError');
  assert.equal(slow.isRunning,false);
  // A Harness whose own helper outlives it and keeps its output open (a launcher's child, a server it started) still
  // stops on cancel: the turn ends with the Harness, not when the last process holding its output does.
  script(path.join(bin,'claude'),'sleep 30 &\nsleep 30\n');
  const stuck=new LocalHarnessRuntime(found[0],unix),stuckAt=Date.now();
  const holding=stuck.run({action:'chat',text:'Hi'},agentHome);
  setTimeout(()=>stuck.cancel(),300);
  await assert.rejects(holding,(error:Error)=>error.name==='AbortError');
  assert.ok(Date.now()-stuckAt<5000,'cancel answers promptly');
  // One that exits but leaves a helper holding its output is answered as an exit, not waited on.
  script(path.join(bin,'claude'),'sleep 30 &\necho "Error: not logged in" >&2\nexit 1\n');
  const leftAt=Date.now();
  await assert.rejects(new LocalHarnessRuntime(found[0],unix).run({action:'chat',text:'Hi'},agentHome),/Claude Code could not answer: Error: not logged in/);
  assert.ok(Date.now()-leftAt<5000,'an exit answers promptly');

  // Hermes Agent over ACP, end to end: the session gets Worldlet's MCP server, the fixture Agent starts it and calls a
  // World tool, which reaches Fox as an ordinary tool event; the answer streams back and the process is ended.
  {
   const agent=path.join(scratch,'hermes-acp.cjs');
   fs.writeFileSync(agent,String.raw`const fs=require('fs'),{spawn}=require('child_process'),readline=require('readline');
const send=m=>process.stdout.write(JSON.stringify(m)+'\n');let session;
function callTool(server){
 return new Promise(resolve=>{
  const env=Object.fromEntries(server.env.map(e=>[e.name,e.value]));
  const child=spawn(server.command,server.args,{env:{...process.env,...env},stdio:['pipe','pipe','inherit']});
  readline.createInterface({input:child.stdout}).on('line',line=>{const m=JSON.parse(line);if(m.id===2){child.kill();resolve(m.result.content[0].text);}});
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{}})+'\n');
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'call_world_tool',arguments:{target:'applets',action:'open',arguments:'{"id":"app-youtube"}'}}})+'\n');
 });
}
readline.createInterface({input:process.stdin}).on('line',async line=>{
 const m=JSON.parse(line);
 if(m.method==='initialize')return send({jsonrpc:'2.0',id:m.id,result:{protocolVersion:1}});
 if(m.method==='session/new'){session=m.params;fs.writeFileSync('session.json',JSON.stringify(m.params));return send({jsonrpc:'2.0',id:m.id,result:{sessionId:'s1'}});}
 if(m.method==='session/prompt'){
  fs.writeFileSync('prompt.txt',m.params.prompt[0].text);
  const text=session.mcpServers.length?await callTool(session.mcpServers[0]):'no tools';
  send({jsonrpc:'2.0',method:'session/update',params:{sessionId:'s1',update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'Opened: '}}}});
  send({jsonrpc:'2.0',method:'session/update',params:{sessionId:'s1',update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text}}}});
  send({jsonrpc:'2.0',id:m.id,result:{stopReason:'end_turn'}});
 }
});
`);
   script(path.join(bin,'hermes'),`exec "${process.execPath}" "${agent}" "$@"\n`);
   const install={id:'hermes' as const,title:'Hermes Agent',command:path.join(bin,'hermes'),prefix:[],configured:true};
   const hermesHome=path.join(scratch,'hermes-turn'),events:any[]=[];
   const result=await new LocalHarnessRuntime(install,unix).run({action:'chat',text:'Open YouTube',history:[]},hermesHome,async event=>{events.push(event);return event.type==='tool'?{ok:true,opened:event.args.id}:null;});
   assert.deepEqual(result,{message:'Opened: {"ok":true,"opened":"app-youtube"}'});
   assert.deepEqual(events.filter(e=>e.type==='tool').map(e=>[e.name,e.args]),[['open_applet',{id:'app-youtube'}]],'the World tool reaches Fox as a tool event');
   const session=JSON.parse(fs.readFileSync(path.join(hermesHome,'session.json'),'utf8'));
   assert.equal(session.cwd,hermesHome);assert.equal(session.mcpServers[0].name,'worldlet');
   assert.match(fs.readFileSync(path.join(hermesHome,'prompt.txt'),'utf8'),/their own Agent[\s\S]*Person: Open YouTube$/,'instructions lead the one message');
   assert.equal(fs.readdirSync(hermesHome).filter(name=>name.endsWith('.token')).length,0,'the turn\'s bridge is closed');
   const greeting=await new LocalHarnessRuntime(install,unix).run({action:'chat',text:'Hello',allowActions:false},hermesHome,async()=>null);
   assert.deepEqual(greeting,{message:'Opened: no tools'},'a greeting gets no MCP server');
  }

  // OpenClaw: its own workspace, and a configuration for the turn that includes the person's own.
  {
   const state=path.join(scratch,'openclaw-state'),workspace=path.join(state,'workspace');fs.mkdirSync(workspace,{recursive:true});
   fs.writeFileSync(path.join(state,'openclaw.json'),'{}');
   script(path.join(bin,'openclaw'),`printf '%s\\n' "$@" > "$PWD/args.txt"\ncat "$5" > "$PWD/config.txt" 2>/dev/null\necho "$OPENCLAW_INCLUDE_ROOTS" > "$PWD/roots.txt"\ncat > /dev/null\necho '{"ok":true,"status":"ok","final":"Done in OpenClaw"}'\n`);
   const install={id:'openclaw' as const,title:'OpenClaw',command:path.join(bin,'openclaw'),prefix:[],configured:true};
   const claw={...unix,env:{...unix.env,OPENCLAW_STATE_DIR:state}},clawHome=path.join(scratch,'openclaw-turn');
   assert.deepEqual(await new LocalHarnessRuntime(install,claw).run({action:'chat',text:'Hi'},clawHome,async()=>null),{message:'Done in OpenClaw'});
   const args=fs.readFileSync(path.join(clawHome,'args.txt'),'utf8').trim().split('\n');
   assert.equal(args[4].startsWith(path.join(clawHome,'worldlet-openclaw-')),true);assert.deepEqual(args.slice(5),['--cwd',fs.realpathSync(workspace),'--message-file','-']);
   const config=JSON.parse(fs.readFileSync(path.join(clawHome,'config.txt'),'utf8'));
   assert.equal(config.$include,path.join(state,'openclaw.json'));assert.equal(config.mcp.servers.worldlet.args[0],path.join(clawHome,'worldlet-mcp.cjs'));
   assert.equal(fs.readFileSync(path.join(clawHome,'roots.txt'),'utf8').trim(),state,'the person\'s configuration may be included');
   assert.equal(fs.readdirSync(clawHome).some(name=>name.startsWith('worldlet-openclaw-')),false,'the turn\'s configuration goes with it');
  }
 }

 // The MCP server a Harness starts: initialize, list, describe and a resolved call.
 const bridgeHome=path.join(scratch,'bridge');fs.mkdirSync(bridgeHome);
 const dispatched:any[]=[];
 const bridge=await openWorldToolBridge(bridgeHome,{sample:false,runner:process.execPath,dispatch:async(name,args)=>{dispatched.push({name,args});return {ok:true};}});
 const tokenFile=bridge.server.env.WORLDLET_MCP_TOKEN_FILE,token=fs.readFileSync(tokenFile,'utf8');
 try{
  // The token is in an owner-only file in the turn's home, never in what goes on the Harness's command line.
  assert.equal(path.dirname(tokenFile),bridgeHome);assert.match(token,/^[0-9a-f]{48}$/);
  if(process.platform!=='win32')assert.equal(fs.statSync(tokenFile).mode&0o777,0o600);
  assert.equal('WORLDLET_MCP_TOKEN' in bridge.server.env,false);
  for(const id of ['claude-code','codex','pi','openclaw'] as const)assert.ok(!localHarnessInvocation(id,turn,bridge.server).args.join(' ').includes(token),id+' argv carries no token');
  assert.ok(!fs.readFileSync(bridge.server.extension!,'utf8').includes(token),'the pi extension names the token file, not the token');
  // The pi extension registers the same two tools and relays a call to the same endpoint.
  {
   const tools=new Map<string,any>();
   const require=(await import('node:module')).createRequire(import.meta.url);
   await require(bridge.server.extension!)({registerTool:(tool:any)=>tools.set(tool.name,tool)});
   assert.deepEqual([...tools.keys()],['describe_world_tools','call_world_tool']);
   assert.equal(tools.get('call_world_tool').parameters.required.join(),'target,action,arguments','plain JSON schema');
   const result=await tools.get('call_world_tool').execute('c1',{target:'applets',action:'open',arguments:'{"id":"app-youtube"}'});
   assert.deepEqual(JSON.parse(result.content[0].text),{ok:true});
   await assert.rejects(tools.get('call_world_tool').execute('c2',{target:'nowhere',action:'go',arguments:'{}'}),/Unknown target/,'a failed World tool fails the call');
   dispatched.length=0;
  }
  const child=spawn(bridge.server.command,bridge.server.args,{env:bridge.server.env,stdio:['pipe','pipe','inherit']});
  const replies=new Map<number,any>();let buffer='';
  child.stdout.on('data',(chunk:Buffer)=>{buffer+=chunk.toString('utf8');let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);const message=JSON.parse(line);replies.set(message.id,message);}});
  const rpc=async(id:number,method:string,params:any={})=>{child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');for(let i=0;i<200&&!replies.has(id);i++)await new Promise(resolve=>setTimeout(resolve,25));return replies.get(id);};
  assert.equal((await rpc(1,'initialize',{protocolVersion:'2025-06-18'})).result.serverInfo.name,'worldlet');
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
  assert.deepEqual((await rpc(2,'tools/list')).result.tools.map((tool:any)=>tool.name),['describe_world_tools','call_world_tool']);
  const targets=JSON.parse((await rpc(3,'tools/call',{name:'describe_world_tools',arguments:{target:'',action:''}})).result.content[0].text);
  assert.ok(targets.targets.includes('browser')&&targets.targets.includes('items'));
  const opened=(await rpc(4,'tools/call',{name:'call_world_tool',arguments:{target:'applets',action:'open',arguments:'{"id":"app-youtube"}'}})).result;
  assert.deepEqual({opened:JSON.parse(opened.content[0].text),isError:opened.isError},{opened:{ok:true},isError:false});
  assert.deepEqual(dispatched,[{name:'open_applet',args:{id:'app-youtube'}}],'the gateway resolves to the implementation the World page validates');
  const unknown=(await rpc(5,'tools/call',{name:'call_world_tool',arguments:{target:'nowhere',action:'go',arguments:'{}'}})).result;
  assert.equal(unknown.isError,true);assert.match(unknown.content[0].text,/Unknown target/);
  const override=(await rpc(6,'tools/call',{name:'call_world_tool',arguments:{target:'applet:youtube',action:'launch',arguments:{id:'app-gmail'}}})).result;
  assert.match(override.content[0].text,/Do not override routing field id/,'fixed routing fields cannot cross into another Applet');
  assert.equal((await rpc(7,'resources/list')).error.code,-32601);
  child.kill();
  // Only the per-turn token reaches the endpoint.
  const url=bridge.server.env.WORLDLET_MCP_URL;
  assert.equal((await fetch(url,{method:'POST',body:'{"method":"list"}'})).status,404);
  assert.equal((await fetch(url,{method:'POST',headers:{authorization:'Bearer '+token},body:'{"method":"list"}'})).status,200);
  assert.equal(dispatched.length,1);
 }finally{bridge.close();}
 assert.equal(fs.existsSync(tokenFile),false,'the token file goes with the turn');
});
console.log('PASS local Agent Harnesses: catalog, recommendation, turns, output readers, detection (Codex inside the ChatGPT and Codex apps too), selection, accounts through the built-in Agent, background work on the Harness, streamed turns (Hermes Agent over ACP with a World tool call, OpenClaw with its own workspace and a per-turn configuration) and the World tool MCP server and pi extension');
