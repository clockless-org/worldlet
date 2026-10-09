import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {WebSocketServer} from 'ws';
import {acpApprovalOutcome,acpApprovalRequest,harnessSessionName,harnessSessionThread,hermesBorrowsCodex,hermesConversationIncluded,HERMES_CHANNEL_READ_ONLY,hermesAcpAnnouncement,hermesChannelToolAllowed,HermesOwnCalls,hermesStandingWriteApproval,hermesStreamAnnouncement,hermesServerEnvLines,hermesServerSettings,hermesWorldTools,hermesWorldToolsCommand,hermesWorldToolsRegistered,localHarnessStream,localHarnessTurn,openClawApprovalFor,openClawApprovalRequest,openClawConnect,openClawSessionIs,openClawDecision,openClawDeviceProof,
 openClawGateway,openClawResponsesBody,readHarnessApprovalRequest,readLocalHarnessLine,readOpenClawFrame,readResponsesChunk,responsesBody,responsesStream,usableHermesServerKey} from '../core/agent/index.ts';
import {phoneLive,readPhoneMessage} from '../core/phone/index.ts';
import {mountHarnessApproval} from '../ui/companion/fox-harness-approval.ts';
import {LocalHarnessAdapter,type HarnessEnvironment} from '../platform/electron/src/modules/agent-runtime/local-harness.ts';
import {hermesServer,keepHermesResident} from '../platform/electron/src/modules/agent-runtime/hermes-service.ts';
import {openStandingWorldTools} from '../platform/electron/src/modules/agent-runtime/world-tool-bridge.ts';
import {withTempDir} from './test-temp.ts';

// Resident Harness sessions (contracts/harness-services.ts `conversation` and `approvals`): the shared rules, then a
// fixture Hermes Agent over ACP (one process, a session per Fox thread, a permission prompt answered in the World,
// the session reloaded after a restart, and the same card on a turn that falls back to a process of its own) and a
// fixture OpenClaw Gateway (`/v1/responses` with World tools as client function tools, a session key per thread, its
// WebSocket's exec approvals for that session answered in the World, and the per-turn fallback, noted once, when its
// endpoint is off). Then Hermes Agent as a resident service (owner decision 2026-10-08): its API server's settings, the
// key Worldlet adds only when there is none, `hermes gateway install`/`start`, the read-only Codex borrow its runtime's
// hook gives the service (run as Hermes launches it, `python -m hermes_cli.main gateway run`), World tools registered on Hermes
// (owner decision 2026-10-08 19:15Z: the standing `worldlet` MCP server), and a fixture Hermes API server that takes the
// main thread's turns once they are, its World tool calls arriving through that server, its `hermes acp` otherwise.

// Shared rules ----------------------------------------------------------------------------------------------------
assert.equal(harnessSessionThread(JSON.stringify(['overview',''])),'main');
assert.equal(harnessSessionThread(JSON.stringify(['attention:item-7','x'])),'item:item-7','an item card keeps its own thread');
assert.equal(harnessSessionThread(JSON.stringify(['object:app-gmail',''])),'applet:gmail','an Applet keeps its own thread');
assert.equal(harnessSessionThread('not json'),'main');assert.equal(harnessSessionThread(undefined),'main');
const main=harnessSessionName({world:'private',thread:'main'});
assert.equal(main,harnessSessionName({world:'private',thread:'main'}),'stable across launches');
assert.notEqual(main,harnessSessionName({world:'sample',thread:'main'}),'the practice world has its own session');
assert.match(harnessSessionName({world:'private',thread:'item:Ünïcode "quoted"'}),/^worldlet-[A-Za-z0-9._-]+$/,'printable, so it fits a header');
const resident=localHarnessTurn({text:'And now?',history:[{role:'user',text:'earlier'}],context:{view:'mail'}},{resident:true});
assert.doesNotMatch(resident.prompt,/Recent conversation|earlier/,'the session keeps the conversation: no replayed history');
assert.match(resident.prompt,/"view":"mail"[\s\S]*Person: And now\?$/);
const options=[{optionId:'a1',kind:'allow_once',name:'Allow'},{optionId:'a2',kind:'allow_always',name:'Always'},{optionId:'r1',kind:'reject_once',name:'Deny'}];
const asked=acpApprovalRequest('acp-1',{toolCall:{title:'Run rm -rf build',rawInput:{command:'rm -rf build'}},options},{title:'Hermes Agent',now:1000});
assert.deepEqual(asked,{id:'acp-1',title:'Hermes Agent asks: Run rm -rf build',detail:'rm -rf build',choices:['once','always','deny'],expiresAt:1000+600000,rule:'rm -rf build'});
// Hermes Agent offers "Allow for session" as an allow_always option (acp_adapter/permissions.py): Always is its permanent one.
{
 const hermes=[{optionId:'allow_once',kind:'allow_once',name:'Allow once'},{optionId:'allow_session',kind:'allow_always',name:'Allow for session'},{optionId:'allow_always',kind:'allow_always',name:'Allow always'},{optionId:'deny',kind:'reject_once',name:'Deny'}];
 const request=acpApprovalRequest('acp-2',{toolCall:{title:'rm',rawInput:{command:'rm -rf build',description:'recursive delete'}},options:hermes});
 assert.equal(request.rule,'recursive delete','Always saves the pattern key Hermes showed');
 assert.deepEqual(acpApprovalOutcome({options:hermes},'always'),{outcome:{outcome:'selected',optionId:'allow_always'}},'Always is the permanent option, not the session one');
 const session=hermes.filter(o=>o.optionId!=='allow_always');
 assert.deepEqual(acpApprovalRequest('acp-3',{toolCall:{rawInput:{command:'x'}},options:session}).choices,['once','deny'],'a session-only grant is not offered as Always');
 assert.equal(acpApprovalRequest('acp-3',{toolCall:{rawInput:{command:'x'}},options:session}).rule,undefined);
 assert.equal(acpApprovalRequest('acp-4',{toolCall:{content:[{type:'diff',path:'notes.md',oldText:'a',newText:'b'}]},options}).detail,'Edit notes.md','an edit names its file');
}
assert.deepEqual(acpApprovalRequest('x',{options:[{optionId:'a',kind:'allow_once'}]}).choices,['once','deny'],'Deny is always offered');
assert.deepEqual(acpApprovalOutcome({options},'once'),{outcome:{outcome:'selected',optionId:'a1'}});
assert.deepEqual(acpApprovalOutcome({options},'always'),{outcome:{outcome:'selected',optionId:'a2'}});
assert.deepEqual(acpApprovalOutcome({options},'deny'),{outcome:{outcome:'selected',optionId:'r1'}});
assert.deepEqual(acpApprovalOutcome({options:[{optionId:'a',kind:'allow_once'}]},'deny'),{outcome:{outcome:'cancelled'}},'no reject option: cancelled');
assert.deepEqual(readHarnessApprovalRequest({id:'acp-1',title:'T',detail:'d',choices:['always','bogus']}),{id:'acp-1',title:'T',detail:'d',choices:['always','deny']});
assert.equal(readHarnessApprovalRequest({id:'bad id!',title:'T'}),null);
assert.deepEqual(openClawGateway({gateway:{port:19001,auth:{mode:'token',token:'${CLAW_TOKEN}'},http:{endpoints:{responses:{enabled:true}}}}},{CLAW_TOKEN:'s3'}),{port:19001,secret:'s3',responses:true});
assert.deepEqual(openClawGateway({},{OPENCLAW_GATEWAY_PORT:'19002',OPENCLAW_GATEWAY_TOKEN:'t'}),{port:19002,secret:'t',responses:null},'defaults and environment');
assert.equal(openClawGateway({},{}).port,18789);
const body=openClawResponsesBody({input:[{type:'message',role:'user',content:'hi'}],instructions:'Be brief.',tools:[{name:'call_world_tool',description:'d',parameters:{type:'object'}}],previous:'resp_1'});
assert.deepEqual(body,{model:'openclaw',stream:true,input:[{type:'message',role:'user',content:'hi'}],instructions:'Be brief.',tools:[{type:'function',name:'call_world_tool',description:'d',parameters:{type:'object'}}],tool_choice:'auto',previous_response_id:'resp_1'});
assert.equal('tools' in openClawResponsesBody({input:[],instructions:'',tools:null}),false,'a greeting gets no tools');
assert.equal('model' in responsesBody({input:[],instructions:'',tools:null}),false,'Hermes Agent\'s API server answers with its own model');
// Hermes Agent's API server, as its gateway resolves it (gateway/config_env.py _api_server).
{
 const key='k'.repeat(40);
 assert.deepEqual(hermesServerSettings('',''),{port:8642,host:'127.0.0.1',key:null,off:false},'its defaults, and no key yet');
 assert.deepEqual(hermesServerSettings('platforms:\n  api_server:\n    extra:\n      key: '+key+'\n      port: 9100\n',''),{port:9100,host:'127.0.0.1',key,off:false},'config.yaml extra');
 assert.deepEqual(hermesServerSettings('platforms:\n  api_server:\n    extra:\n      port: 9100\n','API_SERVER_KEY="'+key+'"\nAPI_SERVER_PORT=9200\nAPI_SERVER_HOST=0.0.0.0\n'),{port:9200,host:'0.0.0.0',key,off:false},'the .env wins, and the person\'s own host is kept');
 assert.equal(hermesServerSettings('','API_SERVER_KEY=changeme\n').key,null,'a placeholder is no key');
 assert.equal(hermesServerSettings('','API_SERVER_KEY=short\n').key,null,'shorter than 16 is no key: Hermes refuses to start with it');
 assert.equal(hermesServerSettings('platforms:\n  api_server:\n    enabled: false\n','API_SERVER_KEY='+key+'\n').off,true,'an explicit disable beats the key');
 assert.equal(usableHermesServerKey(key),true);assert.equal(usableHermesServerKey('your_api_key_here'),false);
 const lines=hermesServerEnvLines('a'.repeat(64));
 assert.match(lines,/^# [^\n]*\nAPI_SERVER_KEY=a{64}\nAPI_SERVER_HOST=127\.0\.0\.1\n$/,'the key and this computer only');
 assert.throws(()=>hermesServerEnvLines('short'));
 assert.equal(hermesBorrowsCodex('model:\n  provider: openai-codex\n  worldlet_source: local-codex\n'),true,'the borrowed Codex sign-in');
 assert.equal(hermesBorrowsCodex('model:\n  provider: openrouter\n'),false);
 // World tools on Hermes: Worldlet's `worldlet` entry, added with Hermes' own command, never another server of that name.
 const worldTools={command:'/Apps/Worldlet',args:['/h/worldlet-mcp-standing.cjs'],env:{ELECTRON_RUN_AS_NODE:'1',WORLDLET_MCP_ENDPOINT_FILE:'/h/worldlet-mcp-endpoint.json'}};
 const entry=(command:string,arg:string,extra='')=>`mcp_servers:\n  github:\n    command: npx\n  worldlet:\n    command: ${command}\n    args:\n    - ${arg}\n    env:\n      ELECTRON_RUN_AS_NODE: '1'\n      WORLDLET_MCP_ENDPOINT_FILE: /h/worldlet-mcp-endpoint.json\n${extra}`;
 assert.equal(hermesWorldTools('model:\n  provider: x\n',worldTools),'missing');
 assert.equal(hermesWorldTools(entry('/Apps/Worldlet','/h/worldlet-mcp-standing.cjs','    enabled: true\n'),worldTools),'current');
 assert.equal(hermesWorldTools(entry('/Old/Worldlet','/h/worldlet-mcp-standing.cjs'),worldTools),'outdated','another Electron after an update');
 assert.equal(hermesWorldTools(entry('/Apps/Worldlet','/h/worldlet-mcp-standing.cjs','    enabled: false\n'),worldTools),'off','turned off by the person: left so');
 assert.equal(hermesWorldTools(entry('npx','some-other-server'),worldTools),'theirs','a server of theirs by that name is never touched');
 assert.deepEqual(hermesWorldToolsCommand(worldTools,'missing'),{args:['mcp','add','worldlet','--command','/Apps/Worldlet','--env','ELECTRON_RUN_AS_NODE=1','WORLDLET_MCP_ENDPOINT_FILE=/h/worldlet-mcp-endpoint.json','--args','/h/worldlet-mcp-standing.cjs'],stdin:'\n'});
 assert.equal(hermesWorldToolsCommand(worldTools,'outdated')!.stdin,'y\n\n','overwrite only Worldlet\'s own entry');
 for(const state of ['current','off','theirs'] as const)assert.equal(hermesWorldToolsCommand(worldTools,state),null);
 assert.equal(hermesWorldToolsRegistered(entry('/Apps/Worldlet','/h/worldlet-mcp-standing.cjs')),true);assert.equal(hermesWorldToolsRegistered(entry('npx','x')),false);
 // A call from another Hermes channel outside any Fox turn: reads and a draft for review only, fail closed.
 for(const name of ['query_world_items','read_world_history','read_world_source','prepare_email'])assert.equal(hermesChannelToolAllowed({name}),true,name);
 for(const name of ['update_world_item','archive_world_items','manage_routines','create_content','start_applet_task','open_applet','some_new_tool'])assert.equal(hermesChannelToolAllowed({name}),false,name);
 assert.equal(hermesChannelToolAllowed({name:'_world_authorize',args:{name:'read_connected_google'}}),true);assert.equal(hermesChannelToolAllowed({name:'_world_authorize',args:{name:'use_doordash'}}),false);
 assert.match(HERMES_CHANNEL_READ_ONLY,/confirmation/);
 // Every guarded write through the standing server that is not Fox's own asks first (Allow once or Deny); reads and unguarded steps do not.
 for(const [name,args] of [['update_world_item',{id:'i'}],['archive_world_items',{ids:['i']}],['manage_routines',{action:'create'}],['create_content',{title:'t'}],['use_doordash',{operation:'cart_add'}],['start_applet_task',{}]] as const)
  assert.deepEqual(hermesStandingWriteApproval(name,args)?.choices,['once','deny'],name);
 for(const [name,args] of [['query_world_items',{}],['open_applet',{id:'app-x'}],['manage_routines',{action:'pause'}],['use_doordash',{operation:'search'}],['prepare_email',{}]] as const)
  assert.equal(hermesStandingWriteApproval(name,args),null,name);
 // Fox's own calls: announced on the turn's stream before Hermes runs them (output_item.added; ACP tool_call with rawInput).
 const update={target:'items',action:'update',arguments:'{"id":"i","status":"done"}'};
 assert.deepEqual(hermesStreamAnnouncement({type:'function_call',status:'in_progress',name:'mcp__worldlet__call_world_tool',call_id:'c1',arguments:JSON.stringify(update)}),{name:'mcp__worldlet__call_world_tool',arguments:JSON.stringify(update)});
 assert.equal(hermesStreamAnnouncement({type:'function_call',name:'terminal',arguments:'{}'}),null,'only calls to Worldlet\'s standing server');
 assert.equal(hermesStreamAnnouncement({type:'function_call',name:'mcp__worldlet_x__call_world_tool',arguments:'{}'}),null);
 assert.deepEqual(hermesAcpAnnouncement({sessionUpdate:'tool_call',toolCallId:'t',title:'mcp__worldlet__call_world_tool: items',rawInput:update}),{name:'mcp__worldlet__call_world_tool',arguments:update});
 assert.equal(hermesAcpAnnouncement({sessionUpdate:'tool_call_update',title:'mcp__worldlet__call_world_tool',rawInput:update}),null);
 const own=new HermesOwnCalls();
 own.announce({name:'mcp__worldlet__call_world_tool',arguments:JSON.stringify({arguments:update.arguments,action:'update',target:'items'})});
 assert.equal(own.has({name:'call_world_tool',arguments:update}),true,'same tool, equal arguments (key order and JSON text aside)');
 assert.equal(await own.take({name:'call_world_tool',arguments:{...update,arguments:'{"id":"j","status":"done"}'}},0),false,'other arguments: not this turn\'s');
 assert.equal(await own.take({name:'describe_world_tools',arguments:update},0),false,'another tool');
 assert.equal(await own.take({name:'call_world_tool',arguments:update}),true);
 assert.equal(await own.take({name:'call_world_tool',arguments:update},0),false,'each announcement matches once');
 const late=own.take({name:'call_world_tool',arguments:update},500);
 setTimeout(()=>own.announce({name:'mcp__worldlet__call_world_tool',arguments:update}),20);
 assert.equal(await late,true,'the MCP call may come before its announcement');
 const unannounced=own.take({name:'call_world_tool',arguments:update},5000),closing=Date.now();own.close();
 assert.equal(await unannounced,false);assert.ok(Date.now()-closing<1000,'the turn ending settles a waiting call at once');
 own.announce({name:'mcp__worldlet__call_world_tool',arguments:update});assert.equal(own.has({name:'call_world_tool',arguments:update}),false,'nothing is a finished turn\'s');
 assert.equal(hermesConversationIncluded({id:'8f2c',source:'api_server',session_key:'worldlet-private-main-0a1b'}),false,'Fox\'s own turns on the API server are not brought back');
 assert.equal(hermesConversationIncluded({id:'8f2c',source:'api_server',session_key:'open-webui-1'}),true,'the person\'s own API conversations are');
}
{
 const state=responsesStream(),sse=(type:string,data:unknown)=>`event: ${type}\ndata: ${JSON.stringify({type,...data as object})}\n\n`;
 const stream=sse('response.created',{response:{id:'resp_9'}})+sse('response.output_text.delta',{delta:'Hel'})+sse('response.output_text.delta',{delta:'lo'})
  +sse('response.output_item.done',{item:{type:'function_call',call_id:'c1',name:'call_world_tool',arguments:'{"target":"applets"}'}})+sse('response.completed',{response:{id:'resp_9',output:[]}})+'data: [DONE]\n\n';
 // Split anywhere: frames are joined before they are read.
 const shown=[stream.slice(0,37),stream.slice(37,120),stream.slice(120)].map(part=>readResponsesChunk(state,part)).join('');
 assert.equal(shown,'Hello');assert.equal(state.id,'resp_9');assert.equal(state.done,true);
 assert.deepEqual(state.calls,[{call_id:'c1',name:'call_world_tool',arguments:'{"target":"applets"}'}]);
 const failed=responsesStream();readResponsesChunk(failed,sse('response.failed',{response:{error:{message:'No model'}}}));
 assert.equal(failed.error,'No model');
}
// A Hermes Agent turn on a process of its own: a conversation turn holds the prompt for the person; background work declines it.
{
 const line=JSON.stringify({jsonrpc:'2.0',id:41,method:'session/request_permission',params:{sessionId:'s',toolCall:{title:'Run rm'},options}});
 const held=localHarnessStream({prompt:'p'},{ask:true});readLocalHarnessLine('hermes',held,line);
 assert.deepEqual(held.asks?.map(a=>a.rpc),[41]);assert.deepEqual(held.outbox,[],'nothing is answered until the person does');
 const declined=localHarnessStream({prompt:'p'});readLocalHarnessLine('hermes',declined,line);
 assert.equal(declined.asks,null);assert.deepEqual(JSON.parse(declined.outbox[0]).result,{outcome:{outcome:'selected',optionId:'r1'}});
}
// OpenClaw's exec approvals over its Gateway WebSocket.
assert.equal(openClawDeviceProof({device:'dev',nonce:'n1',signedAt:5,secret:'s3',platform:' Darwin'}),'v3|dev|cli|cli|operator|operator.approvals,operator.read|5|s3|n1|darwin|');
assert.equal(openClawDeviceProof({device:'dev',nonce:'n1',signedAt:5,secret:null,platform:'linux'}),'v3|dev|cli|cli|operator|operator.approvals,operator.read|5||n1|linux|');
{
 const connect=openClawConnect({id:'1',nonce:'n1',signedAt:5,secret:'s3',platform:'darwin',version:'1',device:{id:'dev',publicKey:'pk',signature:'sig'}}) as any;
 assert.deepEqual([connect.type,connect.method,connect.params.minProtocol,connect.params.maxProtocol,connect.params.role],['req','connect',4,4,'operator']);
 assert.deepEqual(connect.params.client,{id:'cli',displayName:'Worldlet',version:'1',platform:'darwin',mode:'cli'});
 assert.deepEqual(connect.params.scopes,['operator.approvals','operator.read'],'approvals and reads only: nothing that writes the Gateway');
 assert.deepEqual(connect.params.auth,{token:'s3',password:'s3'});assert.deepEqual(connect.params.device,{id:'dev',publicKey:'pk',signature:'sig',signedAt:5,nonce:'n1'});
 assert.equal('auth' in (openClawConnect({id:'1',nonce:'n',signedAt:1,secret:null,platform:'linux',version:'1',device:{id:'d',publicKey:'p',signature:'s'}}) as any).params,false);
}
assert.deepEqual(readOpenClawFrame('{"type":"event","event":"connect.challenge","payload":{"nonce":"n","ts":1}}'),{type:'event',event:'connect.challenge',payload:{nonce:'n',ts:1}});
assert.deepEqual(readOpenClawFrame('{"type":"res","id":"2","ok":false,"error":{"code":"FORBIDDEN","message":"missing scope"}}'),{type:'res',id:'2',ok:false,payload:{},error:'missing scope'});
assert.equal(readOpenClawFrame('nope'),null);
assert.equal(openClawApprovalFor({request:{sessionKey:'agent:main:Worldlet-private-main-0a1b'}},'worldlet-private-main-0a1b'),true,'kept under its agent, compared without case');
assert.equal(openClawApprovalFor({request:{sessionKey:'worldlet-private-main-0a1b'}},'worldlet-private-main-0a1b'),true);
assert.equal(openClawApprovalFor({request:{sessionKey:'agent:main:worldlet-private-main-0a1bc'}},'worldlet-private-main-0a1b'),false,'another session');
assert.equal(openClawApprovalFor({request:{}},'worldlet-private-main-0a1b'),false);
assert.equal(openClawSessionIs('agent:work:WORLDLET-private-main-0a1b','worldlet-private-main-0a1b'),true,'any agent, any case');
assert.equal(openClawSessionIs('Worldlet-Private-Main-0a1b','worldlet-private-main-0a1b'),true,'the bare key');
assert.equal(openClawSessionIs('agent:main:x:worldlet-private-main-0a1b','worldlet-private-main-0a1b'),false,'only the agent prefix, not any suffix');
assert.equal(openClawSessionIs('agent:main:discord:channel:555','worldlet-private-main-0a1b'),false);assert.equal(openClawSessionIs(undefined,'x'),false);
assert.deepEqual(openClawApprovalRequest({id:'ap-1',request:{command:'rm -rf build',warningText:'Deletes files',allowedDecisions:['allow-once','deny']},expiresAtMs:9000},{title:'OpenClaw'}),
 {id:'ap-1',title:'OpenClaw asks to run a command',detail:'Deletes files\nrm -rf build',choices:['once','deny'],expiresAt:9000});
assert.deepEqual(openClawApprovalRequest({id:'ap-2',request:{commandPreview:'ls'}})?.choices,['once','always','deny'],'all three when it does not say');
assert.equal(openClawApprovalRequest({id:'bad id!',request:{}}),null);
assert.deepEqual((['once','always','deny'] as const).map(openClawDecision),['allow-once','allow-always','deny']);
// The phone: the prompt rides with the running turn, and its answer comes back as a message.
const live=phoneLive({id:'turn:1',user:'Clean up',steps:[],text:'',approval:{id:'acp-1',title:'Hermes Agent asks: rm',detail:'rm -rf build',choices:['once','deny']}},0);
assert.deepEqual(live?.approval,{id:'acp-1',title:'Hermes Agent asks: rm',detail:'rm -rf build',choices:['once','deny']});
assert.equal(phoneLive({id:'turn:1',user:'',steps:[],text:'Done',done:true,approval:{id:'a',title:'t',choices:[]}},0)?.approval,undefined,'a finished turn asks nothing');
assert.deepEqual(readPhoneMessage({type:'approval',id:'m1',approval:'acp-1',choice:'always'}),{type:'approval',id:'m1',approval:'acp-1',choice:'always'});
assert.equal(readPhoneMessage({type:'approval',id:'m1',approval:'acp-1',choice:'sudo'}),null);

// The approval card in Fox's dialogue ----------------------------------------------------------------------------
{
 class Node {textContent='';disabled=false;onclick:any;type='';}
 const listeners=new Map<string,Function>();
 (globalThis as any).window={addEventListener:(name:string,fn:Function)=>listeners.set(name,fn)};
 (globalThis as any).document={createElement:()=>new Node()};
 let guide:any;const calls:any[]=[];
 mountHarnessApproval(async(action:string,args:any)=>{calls.push({action,args});return {ok:true};},()=>({setGuide:(value:any)=>guide=value}));
 listeners.get('worldlet:harness-approval')!({detail:{id:'acp-1',title:'Hermes Agent asks: Run rm -rf build',detail:'rm -rf build',choices:['once','always','deny']}});
 assert.deepEqual(guide.actions.map((b:any)=>b.textContent),['Allow once','Always','Deny']);assert.equal(guide.body.textContent,'rm -rf build');
 await guide.actions[2].onclick();
 assert.deepEqual(calls,[{action:'harnessApproval',args:{id:'acp-1',choice:'deny'}}]);
 listeners.get('worldlet:harness-approval')!({detail:{id:'acp-1',settled:'deny'}});
 assert.equal(guide.text,'Denied.');
 delete (globalThis as any).window;delete (globalThis as any).document;
}

// Fixtures --------------------------------------------------------------------------------------------------------
if(process.platform==='win32'){console.log('SKIP resident Harness fixtures on Windows (shell fixtures); shared rules PASS');process.exit(0);}
await withTempDir('worldlet-harness-sessions-',async scratch=>{
 const home=path.join(scratch,'home'),bin=path.join(scratch,'bin');fs.mkdirSync(bin,{recursive:true});fs.mkdirSync(home,{recursive:true});
 const unix:HarnessEnvironment={platform:'linux',env:{PATH:'/usr/bin:/bin',HOME:home},home,systemDirectories:[]};
 const owned:string[][]=[];
 const context=(root:string)=>({profile:{} as any,root,development:false,analyticsID:()=>'',openExternal:async()=>{},record:()=>true,failure:()=>{},changed:()=>{},ownSession:(source:string,session:string,thread:string)=>{owned.push([source,session,thread]);}});
 const script=(file:string,text:string)=>{fs.writeFileSync(file,'#!/bin/sh\n'+text);fs.chmodSync(file,0o755);};
 const thread=(place:string)=>JSON.stringify([place,'']);

 // Hermes Agent: one `hermes acp` process for every thread; a session per thread; the prompt asks permission first.
 {
  const log=path.join(scratch,'acp-log.jsonl'),agent=path.join(scratch,'hermes-acp.cjs');
  fs.writeFileSync(agent,String.raw`const fs=require('fs'),readline=require('readline');
const log=m=>fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(m)+'\n');
const send=m=>process.stdout.write(JSON.stringify(m)+'\n');
const sessions=new Map();let next=1;const waiting=new Map(),prompts=new Map();
log({started:process.pid});
readline.createInterface({input:process.stdin}).on('line',line=>{
 const m=JSON.parse(line);
 if(m.method===undefined&&waiting.has(m.id)){waiting.get(m.id)(m.result);waiting.delete(m.id);return;}
 if(m.method==='initialize')return send({jsonrpc:'2.0',id:m.id,result:{protocolVersion:1,agentCapabilities:{loadSession:true}}});
 if(m.method==='session/new'){const id='s'+(next++)+'-'+process.pid;sessions.set(id,[]);log({new:id,cwd:m.params.cwd,mcp:m.params.mcpServers.map(s=>s.name)});return send({jsonrpc:'2.0',id:m.id,result:{sessionId:id}});}
 if(m.method==='session/load'){log({load:m.params.sessionId});sessions.set(m.params.sessionId,['(earlier)']);send({jsonrpc:'2.0',method:'session/update',params:{sessionId:m.params.sessionId,update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'replayed history'}}}});return send({jsonrpc:'2.0',id:m.id,result:{}});}
 if(m.method==='session/cancel'){log({cancel:m.params.sessionId});const id=prompts.get(m.params.sessionId);if(id!==undefined)send({jsonrpc:'2.0',id,result:{stopReason:'cancelled'}});return;}
 if(m.method==='session/prompt'){
  const sid=m.params.sessionId,text=m.params.prompt[0].text,seen=sessions.get(sid);seen.push(text);log({prompt:sid,text});
  const answer=extra=>{send({jsonrpc:'2.0',method:'session/update',params:{sessionId:sid,update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'Turn '+seen.length+' in '+sid.split('-')[0]+extra}}}});send({jsonrpc:'2.0',id:m.id,result:{stopReason:'end_turn'}});};
  if(/clean/.test(text)){
   // Its terminal tool call starts, asks from inside (its own perm-check id), then reports what it changed.
   const ask=9000+seen.length,call='tc-'+ask,update=u=>send({jsonrpc:'2.0',method:'session/update',params:{sessionId:sid,update:{toolCallId:call,...u}}});
   update({sessionUpdate:'tool_call',title:'terminal',kind:'execute',status:'in_progress',content:[]});
   waiting.set(ask,result=>{
    log({permission:result.outcome});const allowed=result.outcome.optionId==='allow-once';
    update(allowed?{sessionUpdate:'tool_call_update',status:'completed',content:[{type:'diff',path:'build/notes.txt',oldText:'one\ntwo\nthree',newText:'one\n2\nthree'},{type:'content',content:{type:'text',text:'removed build'}}]}:{sessionUpdate:'tool_call_update',status:'failed',content:[{type:'content',content:{type:'text',text:'BLOCKED by user'}}]});
    answer(allowed?': cleaned':': left alone');
   });
   return send({jsonrpc:'2.0',id:ask,method:'session/request_permission',params:{sessionId:sid,toolCall:{toolCallId:'perm-check-'+ask,title:'Run rm -rf build',rawInput:{command:'rm -rf build',description:'recursive delete'}},options:[{optionId:'allow-once',kind:'allow_once',name:'Allow once'},{optionId:'always',kind:'allow_always',name:'Always'},{optionId:'deny',kind:'reject_once',name:'Deny'}]}});
  }
  if(/wait/.test(text)){prompts.set(sid,m.id);return;}
  return answer('');
 }
});
`);
  script(path.join(bin,'hermes'),`exec "${process.execPath}" "${agent}" "$@"\n`);
  const install={id:'hermes' as const,title:'Hermes Agent',command:path.join(bin,'hermes'),prefix:[],configured:true};
  const entries=()=>fs.readFileSync(log,'utf8').trim().split('\n').map(line=>JSON.parse(line));
  const root=path.join(scratch,'hermes-root'),turnHome=path.join(root,'agent','private','local-hermes');
  let adapter=new LocalHarnessAdapter(context(root),install,unix);
  const events:any[]=[];
  const chat=(text:string,place='overview',onEvent:(event:any)=>any=async(event:any)=>{events.push(event);return null;})=>adapter.make().run({action:'chat',text,style:'Be warm.',thread:thread(place),history:[{role:'user',text:'old line'}]},turnHome,onEvent);
  assert.equal((await chat('Hi')).message,'Turn 1 in s1');
  assert.equal((await chat('And again')).message,'Turn 2 in s1','the main thread keeps one session');
  assert.equal((await chat('About this item','attention:item-7')).message,'Turn 1 in s2','an item card has its own session');
  assert.equal((await chat('Back in main')).message,'Turn 3 in s1');
  assert.equal(entries().filter(e=>e.started).length,1,'one resident process for every thread');
  assert.deepEqual(owned.map(([source,session,thread])=>[source,session.split('-')[0],thread]),[['hermes','s1','main'],['hermes','s2','item:item-7']],'the World remembers Fox\'s own sessions, so the history sync leaves them out');
  const prompts=entries().filter(e=>e.prompt);
  assert.match(prompts[0].text,/^The person is talking with you[\s\S]*Be warm\.[\s\S]*Person: Hi$/,'the instructions lead the session\'s first message');
  assert.equal(prompts[1].text,'Person: And again','later turns send only the new line: no instructions again, no replayed history');
  assert.ok(prompts.every(p=>!/old line/.test(p.text)));
  assert.deepEqual(entries().filter(e=>e.new).map(e=>e.mcp),[['worldlet'],['worldlet']],'each session gets Worldlet\'s MCP server');
  // What happened in the World since the thread last replied leads the line (HarnessTurnInput.world, world-since-check.ts).
  await adapter.make().run({action:'chat',text:'Anything new?',style:'Be warm.',thread:thread('overview'),worldSince:'Since you last spoke…\n- Checked Mail'},turnHome,async()=>null);
  assert.equal(entries().filter(e=>e.prompt).at(-1).text,'Since you last spoke…\n- Checked Mail\n\nPerson: Anything new?','the session receives the World\'s note, then the line');
  assert.ok(events.some(e=>e.type==='delta'&&/Turn 1/.test(e.text)),'the answer streams');
  // A permission prompt reaches the World as an approval event and is answered through `approvals`.
  const changed=(results:any[])=>results.map(r=>[r.status,r.reported,r.files.map((f:any)=>[f.path,f.change,f.diff]),r.output]);
  const cleaned=[['completed',true,[['build/notes.txt','edit',' one\n-two\n+2\n three']],'removed build']];
  for(const [choice,answer] of [['once','cleaned'],['deny','left alone']] as const){
   const asked:any[]=[],results:any[]=[];
   const result=await chat('Please clean the build folder','overview',async event=>{
    if(event.type==='approval'){asked.push(event.request);setTimeout(()=>void adapter.approvals()!.answer(event.request.id,choice),20);}
    if(event.type==='approval_result')results.push(event.result);
    return null;
   });
   assert.equal(asked.length,1);assert.deepEqual(asked[0].choices,['once','always','deny']);assert.equal(asked[0].detail,'rm -rf build');
   assert.deepEqual([asked[0].rule,asked[0].thread,asked[0].agent],['recursive delete','main',undefined],'the request says what Always would allow and in which thread');
   assert.match(String(result.message),new RegExp(answer+'$'),choice);
   // What the allowed command changed comes back on its approval, from the tool call it ran in; a denied one reports nothing.
   assert.deepEqual(changed(results),choice==='once'?cleaned:[],choice);
   if(results.length)assert.equal(results[0].id,asked[0].id);
   await assert.rejects(adapter.approvals()!.answer(asked[0].id,'once'),/already answered/,'an answered request is settled');
  }
  // Cancelling a turn cancels it in the session, and the session stays for the next turn.
  {
   const runtime=adapter.make(),pending=runtime.run({action:'chat',text:'wait for me',thread:thread('overview')},turnHome,async()=>null);
   setTimeout(()=>runtime.cancel(),300);
   await assert.rejects(pending,(error:Error)=>error.name==='AbortError');
   for(let i=0;i<50&&!entries().some(e=>e.cancel);i++)await new Promise(resolve=>setTimeout(resolve,20));
   assert.ok(entries().some(e=>e.cancel),'session/cancel was sent');
  }
  // A restart reloads the thread's session instead of starting over.
  await adapter.shutdown();
  adapter=new LocalHarnessAdapter(context(root),install,unix);
  const replayed:any[]=[];
  const again=await chat('After restart','overview',async event=>{replayed.push(event);return null;});
  assert.ok(entries().some(e=>e.load),'session/load with the saved session');
  assert.match(String(again.message),/^Turn 2 in s1/,'the saved session continues');
  assert.ok(!replayed.some(e=>e.type==='delta'&&/replayed/.test(e.text)),'replayed history is not shown as Fox\'s words');
  assert.ok(fs.existsSync(path.join(turnHome,'harness-sessions.json')),'Worldlet keeps the thread-to-session map in its own folder');
  await adapter.shutdown();
  // Its resident interface does not answer: the turn runs a `hermes acp` of its own, and its prompt reaches the same card.
  for(const [choice,answer] of [['once','cleaned'],['deny','left alone']] as const){
   const fallback=new LocalHarnessAdapter(context(root),install,unix);
   (fallback as any).conversation={noted:null,approvals:null,unavailable:async()=>'its conversation interface is off for this check',open:async()=>{throw Error('unused');},shutdown(){}};
   const asked:any[]=[],notes:string[]=[],results:any[]=[];
   const result=await fallback.make().run({action:'chat',text:'Please clean the build folder',thread:thread('overview')},turnHome,async(event:any)=>{
    if(event.type==='progress')notes.push(event.name);
    if(event.type==='approval'){asked.push(event.request);setTimeout(()=>void fallback.approvals()!.answer(event.request.id,choice),20);}
    if(event.type==='approval_result')results.push(event.result);
    return null;
   });
   assert.deepEqual(changed(results),choice==='once'?cleaned:[],'the per-turn process reports what it changed the same way: '+choice);
   assert.match(notes[0],/not keeping this conversation: its conversation interface is off/);
   assert.equal(asked.length,1);assert.match(asked[0].id,/^turn-/);assert.deepEqual(asked[0].choices,['once','always','deny']);assert.equal(asked[0].detail,'rm -rf build');
   assert.match(String(result.message),new RegExp(answer+'$'),'the per-turn process gets the person\'s answer: '+choice);
   await assert.rejects(fallback.approvals()!.answer(asked[0].id,'once'),/already answered/);
   await fallback.shutdown();
  }
  assert.deepEqual(entries().filter(e=>e.permission).slice(-2).map(e=>e.permission.optionId),['allow-once','deny']);
 }

 // Hermes Agent's resident API server: the main thread's turns go to its `/v1/responses` while it answers and its profile
 // has Worldlet's `worldlet` MCP server (World tools on Hermes); Hermes calls World tools through that server, whose calls
 // reach the running Fox turn through the standing endpoint. Without it `hermes acp` keeps the thread, the reason recorded
 // once and never said in Fox's reply. A call with no Fox turn is a channel call; with Worldlet closed it says so.
 {
  const key='fixture-key-'+'7'.repeat(32),serverHome=path.join(scratch,'server-home'),profile=path.join(serverHome,'.hermes');
  fs.mkdirSync(profile,{recursive:true});
  const channel:any[]=[];
  const standing=await openStandingWorldTools({channel:async(name,args)=>{channel.push([name,args]);return hermesChannelToolAllowed({name,args})?{items:[]}:{error:HERMES_CHANNEL_READ_ONLY};}});
  const entry=standing.server(profile);
  assert.equal(fs.statSync(path.join(profile,'worldlet-mcp-endpoint.json')).mode&0o777,0o600,'the endpoint and its token: owner-only');
  // Hermes' MCP client: the registered stdio server, one call.
  const mcp=(name:string,args:object)=>new Promise<any>((resolve,reject)=>{
   const child=spawn(entry.command,entry.args,{env:{PATH:process.env.PATH,...entry.env},stdio:['pipe','pipe','inherit']});let out='';
   child.stdout.on('data',chunk=>{out+=chunk;const line=out.split('\n').find(text=>text.includes('"id":2'));if(line){child.kill();resolve(JSON.parse(line).result);}});
   child.on('error',reject);
   child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{}})+'\n'+JSON.stringify({jsonrpc:'2.0',id:2,method:name,params:args})+'\n');
  });
  const seen:any[]=[],turns=new Map<string,number>();
  const server=http.createServer((request,response)=>{
   if(request.headers.authorization!=='Bearer '+key){response.writeHead(401).end();return;}
   // Hermes Agent 0.21.3's capabilities: its own tools only.
   if(request.method==='GET'&&request.url==='/v1/capabilities'){response.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({object:'hermes.api_server.capabilities',runtime:{mode:'server_agent',tool_execution:'server',split_runtime:false},features:{responses_api:true,responses_streaming:true}}));return;}
   const chunks:Buffer[]=[];request.on('data',c=>chunks.push(c));request.on('end',async()=>{
    const body=JSON.parse(Buffer.concat(chunks).toString('utf8')),session=String(request.headers['x-hermes-session-key']);
    seen.push({session,body,openclaw:Object.keys(request.headers).filter(name=>name.startsWith('x-openclaw'))});
    response.writeHead(200,{'content-type':'text/event-stream'});
    const sse=(type:string,data:object)=>response.write(`event: ${type}\ndata: ${JSON.stringify({type,...data})}\n\n`);
    const n=(turns.get(session)??0)+1;turns.set(session,n);
    sse('response.created',{response:{id:'h-'+seen.length}});
    // Hermes reports a tool it ran itself (its MCP call included) as a completed function call: not Fox's to run.
    sse('response.output_item.done',{item:{type:'function_call',status:'completed',call_id:'own-'+seen.length,name:'terminal',arguments:'{"command":"ls"}'}});
    const write=(id:string)=>mcp('tools/call',{name:'call_world_tool',arguments:{target:'items',action:'update',arguments:JSON.stringify({id,status:'done'})}});
    // Hermes announces each tool call it runs on the turn's own stream before running it (emit_tool_started).
    const announce=(id:string,args:object)=>sse('response.output_item.added',{output_index:1,item:{id:'fc_'+id,type:'function_call',status:'in_progress',name:'mcp__worldlet__call_world_tool',call_id:id,arguments:JSON.stringify(args)}});
    if(/YouTube/.test(body.input[0].content)){
     announce('call_yt',{target:'applets',action:'open',arguments:'{"id":"app-youtube"}'});
     const result=await mcp('tools/call',{name:'call_world_tool',arguments:{target:'applets',action:'open',arguments:'{"id":"app-youtube"}'}});
     sse('response.output_text.delta',{delta:'Opened: '+result.content[0].text});
    }else if(/Mark/.test(body.input[0].content)){
     // Fox's own guarded write: announced on its stream, so it runs under the turn's trust with no card. Item 8's
     // announcement reaches Worldlet only after its MCP call (the frame and the call travel apart).
     announce('call_7',{target:'items',action:'update',arguments:JSON.stringify({id:'item-7',status:'done'})});
     const result=await write('item-7');
     const eight=write('item-8');setTimeout(()=>announce('call_8',{target:'items',action:'update',arguments:JSON.stringify({id:'item-8',status:'done'})}),150);await eight;
     sse('response.output_text.delta',{delta:'Marked: '+result.content[0].text});
    }else if(/Wait/.test(body.input[0].content)){
     // Meanwhile a message on another channel (Telegram, say) asks for a write: MCP calls name no session, so it goes to
     // this running turn, but its stream never announced it, so it waits for the person's card.
     announce('call_other',{target:'items',action:'update',arguments:JSON.stringify({id:'item-1',status:'done'})});
     const result=await write('item-9');
     sse('response.output_text.delta',{delta:'Telegram: '+result.content[0].text});
    }else sse('response.output_text.delta',{delta:`Hermes turn ${n}`});
    sse('response.completed',{response:{id:'h-'+seen.length,output:[]}});response.end('data: [DONE]\n\n');
   });
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',()=>resolve()));
  const port=(server.address() as {port:number}).port;
  try{
   const config=`model:\n  provider: openrouter\nplatforms:\n  api_server:\n    extra:\n      port: ${port}\n`;
   fs.writeFileSync(path.join(profile,'config.yaml'),config);
   fs.writeFileSync(path.join(profile,'.env'),`API_SERVER_KEY=${key}\n`);
   const envBefore=fs.readFileSync(path.join(profile,'.env'),'utf8');
   assert.deepEqual(hermesServer(profile),{port,secret:key,responses:null,worldTools:false},'the profile\'s own port and key; no World tools yet');
   const log=path.join(scratch,'acp-log.jsonl'),started=()=>fs.readFileSync(log,'utf8').trim().split('\n').map(line=>JSON.parse(line)).filter(e=>e.started).length,before=started();
   const install={id:'hermes' as const,title:'Hermes Agent',command:path.join(bin,'hermes'),prefix:[],configured:true};
   const failures:string[]=[],root=path.join(scratch,'server-root'),turnHome=path.join(root,'agent','private','local-hermes');
   const adapter=new LocalHarnessAdapter({...context(root),failure:(error:unknown)=>{failures.push((error as Error).message);}},install,{...unix,env:{...unix.env,HOME:serverHome},home:serverHome});
   const tools:any[]=[],notes:string[]=[],asked:any[]=[];let decision:'once'|'deny'='once';
   const chat=(text:string,place='overview')=>adapter.make().run({action:'chat',text,style:'Be warm.',thread:thread(place)},turnHome,async(event:any)=>{
    if(event.type==='tool'){tools.push(event);return event.name==='update_world_item'?{ok:true,updated:event.args.id}:{ok:true,opened:event.args.id};}
    if(event.type==='approval'){asked.push(event.request);setTimeout(()=>void adapter.approvals()!.answer(event.request.id,decision),5);}
    if(event.type==='progress')notes.push(event.name);
    return null;
   });
   // Without Worldlet's World tools in the profile, `hermes acp` keeps the thread.
   assert.match(String((await chat('Hi')).message),/^Turn 1 in s\d/,'its hermes acp answers');
   assert.equal(started(),before+1);
   assert.equal(failures.length,1,'recorded once');assert.match(failures[0],/keeps Fox's conversation in hermes acp: its profile does not have Worldlet's World tools/);
   // Registered (as `hermes mcp add` saves it): the API server takes the thread.
   fs.writeFileSync(path.join(profile,'config.yaml'),config+`mcp_servers:\n  worldlet:\n    command: ${entry.command}\n    args:\n    - ${entry.args[0]}\n    env:\n${Object.entries(entry.env).map(([k,v])=>`      ${k}: '${v}'`).join('\n')}\n    enabled: true\n`);
   assert.equal(hermesServer(profile).worldTools,true);assert.equal(hermesWorldTools(fs.readFileSync(path.join(profile,'config.yaml'),'utf8'),entry),'current');
   (adapter as any).conversation.each.get('').first.checked=0;
   assert.equal((await chat('Hi')).message,'Hermes turn 1');
   assert.equal((await chat('Again')).message,'Hermes turn 2','the thread\'s session key continues');
   assert.equal((await chat('About this item','attention:item-7')).message,'Hermes turn 1','an item card has its own session');
   assert.equal((await chat('Open YouTube')).message,'Opened: {"ok":true,"opened":"app-youtube"}','Hermes\' call through the registered server comes back to the running turn');
   assert.deepEqual(tools.map(e=>[e.name,e.args]),[['open_applet',{id:'app-youtube'}]],'a World tool event of that Fox turn: the server\'s own tool call is not Fox\'s');
   assert.deepEqual(channel,[],'nothing went outside the turn');
   // Fox's own guarded writes, matched on its stream, run directly as before: no card (the undo notice comes after).
   tools.length=0;
   assert.equal((await chat('Mark item 7 done')).message,'Marked: {"ok":true,"updated":"item-7"}','run as the turn\'s tool');
   assert.deepEqual(asked,[],'Fox\'s own write asks nothing');
   assert.deepEqual(tools.map(e=>[e.name,e.args.id]),[['update_world_item','item-7'],['update_world_item','item-8']],'also when the announcement comes after the call');
   // Another channel's write while that turn runs (an announcement with other arguments does not cover it): the card;
   // denied, it is not executed.
   tools.length=0;decision='deny';
   assert.match(String((await chat('Wait for me')).message),/^Telegram: {"error":"The person did not confirm this change/);
   assert.equal(asked.length,1);assert.deepEqual(asked[0].choices,['once','deny'],'never Always');assert.match(asked[0].title,/wants to change your World/);assert.match(asked[0].detail,/^update_world_item .*item-9/);assert.equal(asked[0].thread,'main');
   assert.deepEqual(tools,[],'not executed');decision='once';
   assert.deepEqual(channel,[],'attributed to the running turn, not run as a channel call');
   const keys=[...new Set(seen.map(s=>s.session))];
   assert.equal(keys.length,2);assert.ok(keys.every(k=>/^worldlet-private-/.test(k)),'the thread\'s session name as X-Hermes-Session-Key');
   assert.ok(owned.some(([source,session,t])=>source==='hermes'&&session===keys[0]&&t==='main'),'remembered as Fox\'s own session');
   const first=seen[0].body;
   assert.equal('model' in first,false);assert.equal(first.stream,true);assert.match(first.instructions,/Be warm\./);assert.deepEqual(seen[0].openclaw,[]);
   assert.deepEqual(first.input,[{type:'message',role:'user',content:'Person: Hi'}],'only the new line goes');
   assert.equal('tools' in first,false,'no client function tools: Hermes reaches World tools on its own');
   assert.equal(started(),before+1,'no hermes acp while the API server answers');
   assert.equal(failures.length,1);assert.deepEqual(notes,[],'nothing in Fox\'s reply');
   assert.ok(failures.every(text=>!text.includes(key)),'the key is never in a record');
   assert.equal(fs.readFileSync(path.join(profile,'.env'),'utf8'),envBefore,'the conversation never writes the profile');
   // Another Hermes channel, no Fox turn running: a call of its own; a read runs, a write is refused with the reason.
   assert.deepEqual((await mcp('tools/list',{})).tools.map((t:any)=>t.name),['describe_world_tools','call_world_tool']);
   const read=await mcp('tools/call',{name:'call_world_tool',arguments:{target:'items',action:'query',arguments:'{}'}});
   assert.deepEqual([read.isError,JSON.parse(read.content[0].text)],[false,{items:[]}]);
   const write=await mcp('tools/call',{name:'call_world_tool',arguments:{target:'items',action:'update',arguments:JSON.stringify({id:'item-7',status:'done'})}});
   assert.equal(write.isError,true);assert.match(write.content[0].text,/needs the person's confirmation/);
   assert.deepEqual(channel.map(([name])=>name),['query_world_items','update_world_item']);
   await adapter.shutdown();
   // Worldlet closed: Hermes still lists the tools; a call says Worldlet is not open.
   standing.close();
   assert.equal(fs.existsSync(path.join(profile,'worldlet-mcp-endpoint.json')),false,'the endpoint file goes on quit');
   assert.equal((await mcp('tools/list',{})).tools.length,2);
   const closed=await mcp('tools/call',{name:'call_world_tool',arguments:{target:'items',action:'query',arguments:'{}'}});
   assert.equal(closed.isError,true);assert.match(closed.content[0].text,/Worldlet is not open/);
  }finally{server.close();server.closeAllConnections?.();standing.close();}
 }

 // Kept running: `hermes gateway install` and `start` through Hermes' own command line, the key added only when there is none.
 {
  const profile=(name:string,config:string,env?:string)=>{const dir=path.join(scratch,'resident',name);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'config.yaml'),config);if(env!==undefined)fs.writeFileSync(path.join(dir,'.env'),env);return dir;};
  const ran:Record<string,string[][]>={};
  const command=(name:string,code=0)=>async(args:string[])=>{(ran[name]??=[]).push(args);return {code,stderr:code?'Traceback\nPermissionError: launchctl refused':''};};
  // No key yet: a strong random key on this computer only, then install and restart so a running gateway reads it.
  const fresh=profile('fresh','model:\n  provider: openrouter\n','OPENROUTER_API_KEY=sk-or-person\n');
  assert.equal(await keepHermesResident(fresh,command('fresh')),null);
  const env=fs.readFileSync(path.join(fresh,'.env'),'utf8'),added=/^API_SERVER_KEY=([0-9a-f]{64})$/m.exec(env)?.[1];
  assert.ok(added,'a 64-digit random key');assert.match(env,/^OPENROUTER_API_KEY=sk-or-person\n/,'the person\'s lines are kept');assert.match(env,/^API_SERVER_HOST=127\.0\.0\.1$/m);
  assert.deepEqual(ran.fresh,[['gateway','install','--start-now','--start-on-login'],['gateway','restart']]);
  assert.equal(hermesServer(fresh).secret,added,'Fox reaches it with that key');
  assert.equal(await keepHermesResident(fresh,command('fresh')),null);assert.equal(ran.fresh.length,2,'once per profile and app run');
  const created=profile('created','model:\n  provider: openrouter\n');
  await keepHermesResident(created,command('created'));
  assert.equal(fs.statSync(path.join(created,'.env')).mode&0o777,0o600,'a new .env is the owner\'s only');
  // The person's own key and port: read, never replaced; started, not restarted.
  const own=profile('own','model:\n  provider: openrouter\n','API_SERVER_KEY=person-own-key-123456\nAPI_SERVER_PORT=9300\n'),ownBefore=fs.readFileSync(path.join(own,'.env'),'utf8');
  assert.equal(await keepHermesResident(own,command('own')),null);
  assert.equal(fs.readFileSync(path.join(own,'.env'),'utf8'),ownBefore,'their key is theirs');
  assert.deepEqual(ran.own,[['gateway','install','--start-now','--start-on-login'],['gateway','start']]);
  assert.deepEqual(hermesServer(own),{port:9300,secret:'person-own-key-123456',responses:null,worldTools:false});
  // Turned off in their config.yaml: kept running, the server left off, and why.
  const off=profile('off','model:\n  provider: openrouter\nplatforms:\n  api_server:\n    enabled: false\n');
  assert.match(String(await keepHermesResident(off,command('off'))),/turned off/);
  assert.equal(fs.existsSync(path.join(off,'.env')),false);assert.deepEqual(ran.off.map(a=>a[1]),['install','start']);assert.equal(hermesServer(off).secret,null);
  // World tools on Hermes: `hermes mcp add worldlet …` before the gateway starts (restarted, so it loads it); kept
  // when current; a server of the person's by that name left alone.
  const server=(home:string)=>({command:'/Apps/Worldlet',args:[path.join(home,'worldlet-mcp-standing.cjs')],env:{ELECTRON_RUN_AS_NODE:'1',WORLDLET_MCP_ENDPOINT_FILE:path.join(home,'worldlet-mcp-endpoint.json')}});
  const saved=(home:string)=>`mcp_servers:\n  worldlet:\n    command: /Apps/Worldlet\n    args:\n    - ${server(home).args[0]}\n    env:\n      ELECTRON_RUN_AS_NODE: '1'\n      WORLDLET_MCP_ENDPOINT_FILE: ${server(home).env.WORLDLET_MCP_ENDPOINT_FILE}\n    enabled: true\n`;
  const hermesAdd=(name:string,home:string)=>async(args:string[],stdin?:string)=>{(ran[name]??=[]).push(stdin===undefined?args:[...args,'<'+stdin]);if(args[0]==='mcp')fs.appendFileSync(path.join(home,'config.yaml'),saved(home));return {code:0,stderr:''};};
  const tools=profile('tools','model:\n  provider: openrouter\n','API_SERVER_KEY=person-own-key-123456\n');
  assert.equal(await keepHermesResident(tools,hermesAdd('tools',tools),{worldTools:server}),null);
  assert.deepEqual(ran.tools,[['mcp','add','worldlet','--command','/Apps/Worldlet','--env','ELECTRON_RUN_AS_NODE=1','WORLDLET_MCP_ENDPOINT_FILE='+server(tools).env.WORLDLET_MCP_ENDPOINT_FILE,'--args',server(tools).args[0],'<\n'],['gateway','install','--start-now','--start-on-login'],['gateway','restart']]);
  assert.equal(hermesServer(tools).worldTools,true);
  const kept=profile('tools-kept','model:\n  provider: openrouter\n','API_SERVER_KEY=person-own-key-123456\n');fs.appendFileSync(path.join(kept,'config.yaml'),saved(kept));
  await keepHermesResident(kept,hermesAdd('kept',kept),{worldTools:server});assert.deepEqual(ran.kept.map(a=>a[1]),['install','start'],'already there: nothing to add, nothing to restart');
  const theirs=profile('tools-theirs','model:\n  provider: openrouter\nmcp_servers:\n  worldlet:\n    command: npx\n    args:\n    - their-world\n','API_SERVER_KEY=person-own-key-123456\n');
  await keepHermesResident(theirs,hermesAdd('theirs',theirs),{worldTools:server});assert.deepEqual(ran.theirs.map(a=>a[1]),['install','start'],'their own `worldlet` server is theirs');
  // A profile still set to Worldlet's earlier read-only Codex borrowing has no model stock Hermes Agent can use: not kept running.
  const codexConfig='model:\n  provider: openai-codex\n  worldlet_source: local-codex\n';
  assert.match(String(await keepHermesResident(profile('their-codex',codexConfig),command('their-codex'))),/Codex sign-in/);
  assert.equal(ran['their-codex'],undefined);
  // Hermes' own command fails: rejected with its last line, never the key; the next app run tries again.
  const failing=profile('failing','model:\n  provider: openrouter\n');
  await assert.rejects(keepHermesResident(failing,command('failing',1)),(error:Error)=>/hermes gateway install did not finish: PermissionError: launchctl refused/.test(error.message)&&!error.message.includes(fs.readFileSync(path.join(failing,'.env'),'utf8').match(/API_SERVER_KEY=(\w+)/)![1]));
  assert.equal(await keepHermesResident(failing,command('failing')),null,'tried again after a failure');
 }

 // OpenClaw: its Gateway's `/v1/responses`, a session key per thread, World tools as client function tools.
 {
  const state=path.join(scratch,'openclaw-state'),workspace=path.join(state,'workspace');fs.mkdirSync(workspace,{recursive:true});
  const seen:any[]=[];let endpoint=true;
  const turns=new Map<string,number>();
  // Its Gateway WebSocket: the challenge, a signed operator device, exec approvals broadcast to approval clients.
  const sockets=new Set<any>(),frames:any[]=[],decisions=new Map<string,(decision:string)=>void>();
  let wss:WebSocketServer;
  const broadcast=(event:string,payload:object)=>{for(const ws of sockets)ws.send(JSON.stringify({type:'event',event,payload}));};
  // Tool events go only to a socket that subscribed to that session (`sessions.messages.subscribe`).
  const subscribed=new Map<any,string>(),toolEvent=(key:string,data:object)=>{for(const [ws,on] of subscribed)if(sockets.has(ws)&&on===key)ws.send(JSON.stringify({type:'event',event:'agent',payload:{runId:'run-1',stream:'tool',sessionKey:'agent:main:'+key,data}}));};
  const server=http.createServer((request,response)=>{
   if(request.headers.authorization!=='Bearer claw-secret'){response.writeHead(401).end();return;}
   if(!endpoint){response.writeHead(404).end();return;}
   if(request.method==='GET'&&request.url==='/v1/models'){response.writeHead(200,{'content-type':'application/json'}).end('{"data":[]}');return;}
   const chunks:Buffer[]=[];request.on('data',c=>chunks.push(c));request.on('end',()=>{
    const body=JSON.parse(Buffer.concat(chunks).toString('utf8')),key=String(request.headers['x-openclaw-session-key']);
    seen.push({key,body});
    response.writeHead(200,{'content-type':'text/event-stream'});
    const sse=(type:string,data:object)=>response.write(`event: ${type}\ndata: ${JSON.stringify({type,...data})}\n\n`);
    const output=body.input.find((item:any)=>item.type==='function_call_output');
    if(output){sse('response.output_text.delta',{delta:'Opened: '+output.output});sse('response.completed',{response:{id:'r-'+seen.length,output:[]}});response.end('data: [DONE]\n\n');return;}
    const n=(turns.get(key)??0)+1;turns.set(key,n);
    sse('response.created',{response:{id:'r-'+seen.length}});
    if(/clean/i.test(body.input[0].content)){
     // Its exec tool asks first: one request for this session (kept under its agent) and one for somebody else's.
     const id='appr-'+seen.length,call='exec-'+seen.length;
     toolEvent(key,{phase:'start',name:'exec',toolCallId:call,args:{command:'rm -rf build'}});
     broadcast('exec.approval.requested',{id:'other-'+seen.length,request:{command:'cat ~/.ssh/id_rsa',sessionKey:'agent:main:telegram-dm-42'},createdAtMs:Date.now(),expiresAtMs:Date.now()+60_000});
     broadcast('exec.approval.requested',{id,request:{command:'rm -rf build',cwd:'/tmp',sessionKey:'agent:main:'+key,allowedDecisions:['allow-once','allow-always','deny']},createdAtMs:Date.now(),expiresAtMs:Date.now()+60_000});
     decisions.set(id,decision=>{broadcast('exec.approval.resolved',{id,decision});toolEvent(key,decision==='deny'?{phase:'result',name:'exec',toolCallId:call,isError:true,result:'denied'}:{phase:'result',name:'exec',toolCallId:call,isError:false,result:{content:[{type:'text',text:'removed 3 files'}],details:{exitCode:0}}});sse('response.output_text.delta',{delta:'Ran: '+decision});sse('response.completed',{response:{id:'r-'+seen.length,output:[]}});response.end('data: [DONE]\n\n');});
     return;
    }
    if(/YouTube/.test(body.input[0].content)&&body.tools)sse('response.output_item.done',{item:{type:'function_call',call_id:'call-1',name:'call_world_tool',arguments:JSON.stringify({target:'applets',action:'open',arguments:'{"id":"app-youtube"}'})}});
    else sse('response.output_text.delta',{delta:`Gateway turn ${n}`});
    sse('response.completed',{response:{id:'r-'+seen.length,output:[]}});response.end('data: [DONE]\n\n');
   });
  });
  wss=new WebSocketServer({server});
  wss.on('connection',ws=>{
   sockets.add(ws);ws.on('close',()=>sockets.delete(ws));
   ws.send(JSON.stringify({type:'event',event:'connect.challenge',payload:{nonce:'nonce-'+sockets.size,ts:1737264000000}}));
   ws.on('message',(data:Buffer)=>{
    const frame=JSON.parse(data.toString('utf8'));frames.push(frame);
    if(frame.method==='connect'){
     const {device,auth,scopes,client}=frame.params;
     // The device proves itself: its id is the SHA-256 of its raw key, its signature covers the challenge and the secret.
     const key=crypto.createPublicKey({key:{kty:'OKP',crv:'Ed25519',x:device.publicKey},format:'jwk'});
     const proof=['v3',device.id,client.id,client.mode,frame.params.role,scopes.join(','),String(device.signedAt),auth?.token??'',device.nonce,client.platform,''].join('|');
     const signed=crypto.verify(null,Buffer.from(proof),key,Buffer.from(device.signature,'base64url'));
     const ok=auth?.token==='claw-secret'&&signed&&device.signedAt===1737264000000&&device.id===crypto.createHash('sha256').update(Buffer.from(device.publicKey,'base64url')).digest('hex');
     ws.send(JSON.stringify(ok?{type:'res',id:frame.id,ok:true,payload:{type:'hello-ok',protocol:4,auth:{role:'operator',scopes}}}:{type:'res',id:frame.id,ok:false,error:{code:'INVALID_REQUEST',message:'unauthorized'}}));
     return;
    }
    if(frame.method==='sessions.messages.subscribe'){subscribed.set(ws,String(frame.params.key));ws.send(JSON.stringify({type:'res',id:frame.id,ok:true,payload:{subscribed:true}}));return;}
    if(frame.method==='exec.approval.resolve'){
     const decide=decisions.get(frame.params.id);
     ws.send(JSON.stringify(decide?{type:'res',id:frame.id,ok:true,payload:{id:frame.params.id,decision:frame.params.decision}}:{type:'res',id:frame.id,ok:false,error:{code:'INVALID_REQUEST',message:'unknown approval id'}}));
     decisions.delete(frame.params.id);decide?.(frame.params.decision);
    }
   });
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',()=>resolve()));
  const port=(server.address() as {port:number}).port;
  try{
   fs.writeFileSync(path.join(state,'openclaw.json'),`{\n // the person's own settings, read only\n gateway:{port:${port},auth:{mode:'token',token:'claw-secret'},http:{endpoints:{responses:{enabled:true}}}},\n}\n`);
   const before=fs.readFileSync(path.join(state,'openclaw.json'),'utf8');
   const execLog=path.join(scratch,'openclaw-exec.txt');
   script(path.join(bin,'openclaw'),`echo exec >> "${execLog}"\ncat > /dev/null\necho '{"ok":true,"status":"ok","final":"From agent exec"}'\n`);
   const install={id:'openclaw' as const,title:'OpenClaw',command:path.join(bin,'openclaw'),prefix:[],configured:true};
   const claw={...unix,env:{...unix.env,OPENCLAW_STATE_DIR:state}};
   const root=path.join(scratch,'openclaw-root'),turnHome=path.join(root,'agent','private','local-openclaw');
   const adapter=new LocalHarnessAdapter(context(root),install,claw);
   const tools:any[]=[],notes:any[]=[];
   const chat=(text:string,place='overview')=>adapter.make().run({action:'chat',text,style:'Be warm.',thread:thread(place),history:[{role:'user',text:'old line'}]},turnHome,async(event:any)=>{
    if(event.type==='tool'){tools.push(event);return {ok:true,opened:event.args.id};}
    if(event.type==='progress')notes.push(event.name);
    return null;
   });
   assert.equal((await chat('Hi')).message,'Gateway turn 1');
   assert.equal((await chat('Again')).message,'Gateway turn 2','the thread\'s session key continues');
   assert.equal((await chat('About this Applet','object:app-gmail')).message,'Gateway turn 1','an Applet has its own session');
   assert.equal((await chat('Open YouTube')).message,'Opened: {"ok":true,"opened":"app-youtube"}');
   assert.deepEqual(tools.map(e=>[e.name,e.args]),[['open_applet',{id:'app-youtube'}]],'a client function call reaches Fox as a World tool event');
   const keys=[...new Set(seen.map(s=>s.key))];
   assert.equal(keys.length,2);assert.ok(keys.every(key=>/^worldlet-private-/.test(key)));
   assert.deepEqual(owned.filter(([source])=>source==='openclaw').map(([,session])=>session),keys,'each session key is remembered as Fox\'s own');
   const first=seen[0].body;
   assert.equal(first.model,'openclaw');assert.equal(first.stream,true);assert.match(first.instructions,/Be warm\./);
   assert.deepEqual(first.input,[{type:'message',role:'user',content:'Person: Hi'}],'only the new line goes');
   assert.deepEqual(first.tools.map((t:any)=>[t.type,t.name]),[['function','describe_world_tools'],['function','call_world_tool']]);
   const round=seen.at(-1)!.body;
   assert.equal(round.previous_response_id,'r-'+(seen.length-1),'a tool round continues its response');
   assert.equal(round.input[0].type,'function_call_output');assert.equal(round.input[0].call_id,'call-1');
   assert.equal(fs.existsSync(execLog),false,'no process per turn while the Gateway answers');
   assert.deepEqual(notes,[]);
   await adapter.make().run({action:'chat',text:'Anything new?',style:'Be warm.',thread:thread('attention:item-9'),worldSince:'Since you last spoke…\n- Checked Mail'},turnHome,async()=>null);
   assert.deepEqual(seen.at(-1)!.body.input,[{type:'message',role:'user',content:'Since you last spoke…\n- Checked Mail\n\nPerson: Anything new?'}],'the Gateway session receives the World\'s note, then the line');
   // Its exec approval for this turn's session becomes the World's card; the answer goes back over the WebSocket.
   const framed=frames.length;
   for(const [choice,decision] of [['once','allow-once'],['always','allow-always'],['deny','deny']] as const){
    const asked:any[]=[],results:any[]=[];
    const result=await adapter.make().run({action:'chat',text:'Clean the build folder',thread:thread('overview')},turnHome,async(event:any)=>{
     if(event.type==='progress')notes.push(event.name);
     if(event.type==='approval'){asked.push(event.request);setTimeout(()=>void adapter.approvals()!.answer(event.request.id,choice),20);}
     if(event.type==='approval_result')results.push(event.result);
     return null;
    });
    assert.equal(result.message,'Ran: '+decision);
    assert.equal(asked.length,1,'only this session\'s request, never another conversation\'s');
    assert.deepEqual(asked[0],{id:asked[0].id,title:'OpenClaw asks to run a command',detail:'rm -rf build',choices:['once','always','deny'],expiresAt:asked[0].expiresAt,rule:'rm -rf build',thread:'main'});
    // The allowed command's output comes back from its tool event; OpenClaw reports no files, and the card says so.
    for(let i=0;i<50&&choice!=='deny'&&!results.length;i++)await new Promise(resolve=>setTimeout(resolve,10));
    assert.deepEqual(results.map(r=>[r.id,r.status,r.reported,r.files,r.output]),choice==='deny'?[]:[[asked[0].id,'completed',false,[],'removed 3 files\n(exit code 0)']],choice);
    assert.match(asked[0].id,/^appr-/);
    await assert.rejects(adapter.approvals()!.answer(asked[0].id,'once'),/already answered/,'an answered request is settled');
   }
   assert.deepEqual(notes,[]);
   const connects=frames.slice(framed).filter(f=>f.method==='connect');
   assert.equal(connects.length,3,'a socket while each turn runs');
   assert.deepEqual(connects[0].params.scopes,['operator.approvals','operator.read']);
   assert.deepEqual(frames.slice(framed).filter(f=>f.method==='exec.approval.resolve').map(f=>f.params.decision),['allow-once','allow-always','deny']);
   assert.ok(frames.slice(framed).filter(f=>f.method==='sessions.messages.subscribe').every(f=>/^worldlet-private-/.test(f.params.key)),'subscribed to the turn\'s own session only');
   for(let i=0;i<50&&sockets.size;i++)await new Promise(resolve=>setTimeout(resolve,10));
   assert.equal(sockets.size,0,'the socket closes when no turn listens');
   const device=JSON.parse(fs.readFileSync(path.join(turnHome,'openclaw-device.json'),'utf8'));
   assert.match(device.privateKey,/BEGIN PRIVATE KEY/);assert.equal(fs.statSync(path.join(turnHome,'openclaw-device.json')).mode&0o777,0o600,'Worldlet\'s own device key, in its own folder');
   assert.equal(new Set(connects.map(f=>f.params.device.id)).size,1,'the same device every time');
   // A Gateway that refuses the device: the turn still runs, and Fox says once why approvals cannot reach it.
   {
    const real=(adapter as any).conversation.approvals.gateway;
    (adapter as any).conversation.approvals.gateway=()=>({...real(),secret:'wrong'});
    assert.equal((await chat('Hi there')).message,'Gateway turn 7');
    assert.equal((await chat('Hi once more')).message,'Gateway turn 8');
    (adapter as any).conversation.approvals.gateway=real;
    assert.equal(notes.length,1,'noted once');assert.match(notes[0],/OpenClaw's approval requests cannot reach Fox: Worldlet could not sign in to its Gateway: unauthorized/);
    notes.length=0;(adapter as any).conversation.approvals.noted=null;
   }
   // Endpoint off: each turn runs `openclaw agent exec`, and Fox says why once.
   endpoint=false;
   await new Promise(resolve=>setTimeout(resolve,10));
   (adapter as any).conversation.checked=0;
   assert.equal((await chat('Hi')).message,'From agent exec');
   assert.equal((await chat('Hi again')).message,'From agent exec');
   assert.equal(notes.length,1,'noted once, never silently');
   assert.match(notes[0],/OpenClaw is not keeping this conversation: its Gateway's \/v1\/responses endpoint is off/);
   assert.equal(fs.readFileSync(execLog,'utf8').trim().split('\n').length,2);
   assert.equal(fs.readFileSync(path.join(state,'openclaw.json'),'utf8'),before,'the person\'s configuration is never written');
   // Gateway not running at all.
   for(const ws of sockets)ws.terminate();wss.close();server.close();server.closeAllConnections?.();
   (adapter as any).conversation.checked=0;(adapter as any).conversation.noted=null;notes.length=0;
   assert.equal((await chat('Still there?')).message,'From agent exec');
   assert.match(notes[0],/its Gateway is not running/);
   await adapter.shutdown();
  }finally{server.close();}
 }
});
console.log('PASS resident Harness sessions: Hermes Agent kept running (its own gateway install and start, the API server key added only when there is none, the person\'s own read and kept, the standard profile\'s Codex sign-in borrowed read-only in the service as Hermes launches it) World tools registered on Hermes with its own hermes mcp add (theirs by that name left alone), and its API server taking the main thread once they are, its World tool calls coming back to the running Fox turn through the standing endpoint (Fox own calls matched on its stream run under the turn trust with no card; a guarded write its stream never announced, as from another channel, only after the person allows it on the approval card), a call with no Fox turn a channel call (reads only, a write refused with the reason), Worldlet is not open once closed, hermes acp otherwise, recorded once; the standard Hermes Agent\'s conversation on the same route or the built-in runtime; thread keys, ACP approvals (Always is the permanent option; what an allowed call changed comes back as its diff), Responses stream, phone and approval card; Hermes Agent over one ACP process (a session per thread, approvals answered in the World, cancel, reload after restart, the same card on a per-turn fallback); OpenClaw Gateway (session key per thread, World tools as client function tools, exec approvals over its WebSocket for that session only with the allowed command’s output, a refused device noted once) and the per-turn fallback noted once');
