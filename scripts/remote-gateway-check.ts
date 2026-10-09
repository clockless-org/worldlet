import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {WebSocketServer} from 'ws';
import {REMOTE_GATEWAY_HARNESS_ID,harnessLocation,harnessService,readRemoteGatewayToken,readRemoteGatewayUrl,remoteGatewaySocketUrl} from '../core/agent/index.ts';
import {RemoteGatewayAdapter,checkRemoteGateway,readRemoteGateway,remoteGatewayView,writeRemoteGateway} from '../platform/electron/src/modules/agent-runtime/remote-gateway.ts';
import {withTempDir} from './test-temp.ts';

// Fox on an OpenClaw Gateway on another computer, reached directly (core/phone/README.md#an-agent-gateway-on-another-computer):
// the address rules (TLS except loopback and Tailscale), the token kept in the vault and never shown, the check before
// Fox switches, and Fox's turns on a fixture Gateway (`/v1/responses`, a session per thread, World tools as client
// function tools run here, its approvals socket at the same address), with background work left on this computer.
type Row=Record<string,any>;

// Addresses: HTTPS anywhere; plain HTTP only to this computer or over Tailscale (100.64.0.0/10, *.ts.net).
assert.deepEqual(readRemoteGatewayUrl('https://gateway.example.com/'),{base:'https://gateway.example.com',host:'gateway.example.com',secure:true});
assert.deepEqual(readRemoteGatewayUrl('gateway.example.com:8443/v1'),{base:'https://gateway.example.com:8443',host:'gateway.example.com',secure:true},'no scheme means https; a pasted /v1 is dropped');
assert.equal(readRemoteGatewayUrl('https://example.com/claw/v1/responses').base,'https://example.com/claw','a Gateway behind a proxy path');
for(const ok of ['http://127.0.0.1:18789','http://localhost:18789','http://[::1]:18789','http://100.64.0.1:18789','http://100.127.255.254','http://mini.tail1234.ts.net:18789'])assert.equal(readRemoteGatewayUrl(ok).secure,false,ok);
for(const bad of ['http://gateway.example.com','http://192.168.1.20:18789','http://100.128.0.1','http://100.63.255.255','http://10.0.0.5','http://mini','http://ts.net.example.com'])
 assert.throws(()=>readRemoteGatewayUrl(bad),/only over HTTPS, or over Tailscale/,bad);
assert.throws(()=>readRemoteGatewayUrl('https://me:secret@gateway.example.com'),/token in its own field/);
assert.throws(()=>readRemoteGatewayUrl('https://gateway.example.com/?token=x'),/no \? or #/);
assert.throws(()=>readRemoteGatewayUrl('ftp://gateway.example.com'),/starts with https/);
assert.throws(()=>readRemoteGatewayUrl(''),/Type your Gateway/);
assert.equal(remoteGatewaySocketUrl('https://gateway.example.com/claw'),'wss://gateway.example.com/claw');
assert.equal(remoteGatewaySocketUrl('http://100.100.1.2:18789'),'ws://100.100.1.2:18789');
assert.equal(readRemoteGatewayToken('  abc.DEF-123  '),'abc.DEF-123');
assert.throws(()=>readRemoteGatewayToken('two words'),/spaces/);assert.throws(()=>readRemoteGatewayToken(''),/token/);
// Its declaration: a conversation, approvals and a location of its own, nothing read from files it does not have here.
assert.equal(harnessService(REMOTE_GATEWAY_HARNESS_ID,'conversation'),'native');assert.equal(harnessService(REMOTE_GATEWAY_HARNESS_ID,'location'),'native');
assert.equal(harnessService(REMOTE_GATEWAY_HARNESS_ID,'history'),null);assert.equal(harnessService(REMOTE_GATEWAY_HARNESS_ID,'models'),null);
console.log('PASS remote Gateway addresses: HTTPS except loopback and Tailscale, no credentials in the address, its Harness row.');

// The vault holds the token; what the page sees is the address and whether it is in use.
const map=new Map<string,string>(),vault={get:(id:string)=>map.get(id)??null,set:(id:string,v:string)=>void map.set(id,v),delete:(id:string)=>void map.delete(id)};
assert.equal(readRemoteGateway(vault),null);
writeRemoteGateway(vault,{v:1,url:'https://gateway.example.com',token:'claw-secret',active:true});
assert.deepEqual(readRemoteGateway(vault),{v:1,url:'https://gateway.example.com',token:'claw-secret',active:true});
assert.deepEqual(remoteGatewayView(readRemoteGateway(vault)),{url:'https://gateway.example.com',host:'gateway.example.com',active:true});
assert.doesNotMatch(JSON.stringify(remoteGatewayView(readRemoteGateway(vault))),/claw-secret/,'the token never reaches the page');
map.set('remote-gateway',JSON.stringify({v:1,url:'http://gateway.example.com',token:'x',active:true}));
assert.equal(readRemoteGateway(vault),null,'a saved address that is no longer allowed is not used');
writeRemoteGateway(vault,null);assert.equal(map.size,0);

// A fixture Gateway on this computer's loopback (allowed without TLS), with its token, `/v1/models` and `/v1/responses`.
const logged:string[]=[],original={log:console.log,warn:console.warn,error:console.error};
for(const name of ['log','warn','error'] as const)console[name]=(...args:unknown[])=>{logged.push(args.map(String).join(' '));};
await withTempDir('worldlet-remote-gateway-',async scratch=>{
 const seen:Row[]=[],sockets:string[]=[];let endpoint=true;
 const turns=new Map<string,number>();
 const server=http.createServer((request,response)=>{
  if(request.headers.authorization!=='Bearer claw-secret'){response.writeHead(401).end();return;}
  if(!endpoint){response.writeHead(404).end();return;}
  if(request.method==='GET'&&request.url==='/claw/v1/models'){response.writeHead(200,{'content-type':'application/json'}).end('{"data":[]}');return;}
  if(request.method!=='POST'||request.url!=='/claw/v1/responses'){response.writeHead(404).end();return;}
  const chunks:Buffer[]=[];request.on('data',c=>chunks.push(c));request.on('end',()=>{
   const body=JSON.parse(Buffer.concat(chunks).toString('utf8')),key=String(request.headers['x-openclaw-session-key']);
   seen.push({key,body});
   response.writeHead(200,{'content-type':'text/event-stream'});
   const sse=(type:string,data:object)=>response.write(`event: ${type}\ndata: ${JSON.stringify({type,...data})}\n\n`);
   const output=body.input.find((item:Row)=>item.type==='function_call_output');
   if(output){sse('response.output_text.delta',{delta:'Opened: '+output.output});sse('response.completed',{response:{id:'r-'+seen.length,output:[]}});response.end('data: [DONE]\n\n');return;}
   const n=(turns.get(key)??0)+1;turns.set(key,n);
   if(/YouTube/.test(body.input[0].content))sse('response.output_item.done',{item:{type:'function_call',call_id:'call-1',name:'call_world_tool',arguments:JSON.stringify({target:'applets',action:'open',arguments:'{"id":"app-youtube"}'})}});
   else sse('response.output_text.delta',{delta:`Remote turn ${n}`});
   sse('response.completed',{response:{id:'r-'+seen.length,output:[]}});response.end('data: [DONE]\n\n');
  });
 });
 // Its WebSocket at the same address: the approvals connection reaches it there (the device is not approved: refused).
 const wss=new WebSocketServer({server});
 wss.on('connection',(ws,request)=>{
  sockets.push(String(request.url));
  ws.send(JSON.stringify({type:'event',event:'connect.challenge',payload:{nonce:'n',ts:Date.now()}}));
  ws.on('message',(data:Buffer)=>{const frame=JSON.parse(data.toString('utf8'));if(frame.method==='connect')ws.send(JSON.stringify({type:'res',id:frame.id,ok:false,error:{code:'NOT_PAIRED',message:'device not approved'}}));});
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',()=>resolve()));
 const url=`http://127.0.0.1:${(server.address() as {port:number}).port}/claw`;
 try{
  // The check before Fox switches: a wrong token, an endpoint that is off, then the right one.
  await assert.rejects(checkRemoteGateway(url,'wrong'),/could not sign in to its Gateway \(check the token in Settings › Model\)/);
  endpoint=false;await assert.rejects(checkRemoteGateway(url,'claw-secret'),/\/v1\/responses endpoint is off/);endpoint=true;
  await assert.rejects(checkRemoteGateway('http://192.168.1.20:18789','claw-secret'),/only over HTTPS/);
  assert.deepEqual(await checkRemoteGateway(url+'/v1/','claw-secret'),{url,token:'claw-secret',host:'127.0.0.1'});

  // Fox's turns there; there is no built-in Agent here for anything else (owner decisions 2026-10-09).
  const adapter=new RemoteGatewayAdapter({profile:{},root:scratch,development:false,analyticsID:()=>'',openExternal:async()=>{},record:()=>true,failure:()=>{},changed:()=>{}} as any,{url,token:'claw-secret'});
  const home=path.join(scratch,'agent','private','hermes'),tools:Row[]=[],notes:string[]=[];
  const thread=(place:string)=>JSON.stringify([place,'']);
  const chat=(text:string,place='overview',extra:Row={})=>adapter.make().run({action:'chat',mode:'chat',text,style:'Be warm.',thread:thread(place),history:[{role:'user',text:'old line'}],...extra},home,async(event:Row)=>{
   if(event.type==='tool'){tools.push(event);return {ok:true,opened:event.args.id};}
   if(event.type==='progress')notes.push(event.name);
   return null;
  });
  assert.equal(adapter.harness.title,'OpenClaw at 127.0.0.1');
  const status=await adapter.status(home);
  assert.deepEqual(harnessLocation(adapter.id,status),{kind:'remote',computer:'127.0.0.1',direct:true},'reached directly, not through a Worldlet there');
  assert.equal((await chat('Hi')).message,'Remote turn 1');
  assert.equal((await chat('Again')).message,'Remote turn 2','the thread\'s session continues there');
  assert.equal((await chat('About this Applet','object:app-gmail')).message,'Remote turn 1','an Applet has its own session');
  assert.equal((await chat('Open YouTube')).message,'Opened: {"ok":true,"opened":"app-youtube"}');
  assert.deepEqual(tools.map(e=>[e.name,e.args]),[['open_applet',{id:'app-youtube'}]],'the Gateway\'s function call runs as a World tool here');
  assert.equal(new Set(seen.map(s=>s.key)).size,2);assert.ok(seen.every(s=>/^worldlet-private-/.test(s.key)));
  assert.deepEqual(seen[0].body.input,[{type:'message',role:'user',content:'Person: Hi'}],'only the new line goes; the Gateway keeps the thread');
  assert.match(seen[0].body.instructions,/Be warm\./);
  assert.deepEqual(seen[0].body.tools.map((t:Row)=>t.name),['describe_world_tools','call_world_tool']);
  assert.equal(seen.at(-1)!.body.previous_response_id,'r-'+(seen.length-1));
  assert.ok(sockets.length>0&&sockets.every(route=>route==='/claw'),'its approvals connection goes to the same address');
  assert.equal(notes.length,1,'an unapproved device is said once');assert.match(notes[0],/approval requests cannot reach Fox: Worldlet could not sign in to its Gateway: device not approved/);
  // Background work runs on the Gateway too (owner decision 2026-10-09), each turn in a session of its own, with World
  // tools only for a check that may use them; Applet tasks on its lane; what is not a chat is the Gateway's own business.
  assert.equal(adapter.supportsBackgroundChecks,true);assert.equal(adapter.background(),adapter);
  assert.equal((await chat('Check mail','overview',{_background:true})).message,'Remote turn 1');
  const checked=seen.at(-1)!;
  assert.match(checked.key,/^worldlet-background-run-/,'a session of its own');assert.equal(checked.body.tools,undefined,'no World tools for a plain check');
  assert.equal((await adapter.makeTask!().run({action:'chat',mode:'chat',text:'Gmail task',thread:thread('overview')},home,async()=>null)).message,'Remote turn 1');
  assert.notEqual(seen.at(-1)!.key,checked.key,'each lane turn starts fresh');
  assert.deepEqual(seen.at(-1)!.body.tools.map((t:Row)=>t.name),['describe_world_tools','call_world_tool'],'an Applet task may act');
  assert.equal(adapter.hasInteractiveWork(),false,'background work is not the person\'s');
  await assert.rejects(adapter.make().run({action:'summarize',text:'x'},home),/Fox uses OpenClaw at 127\.0\.0\.1\. Manage its models and accounts there\./);
  assert.equal(adapter.memoryAuthority,'worldlet','Worldlet keeps the companion\'s memory');
  // A Gateway that is off or gone is the turn's error: there is no process here to fall back to.
  endpoint=false;(adapter.conversation as any).checked=0;
  await assert.rejects(chat('Still there?'),/OpenClaw at 127\.0\.0\.1 cannot answer: its Gateway's \/v1\/responses endpoint is off/);
  endpoint=true;
  await adapter.shutdown();
  for(const ws of wss.clients)ws.terminate();wss.close();server.close();server.closeAllConnections?.();
  (adapter.conversation as any).checked=0;
  await assert.rejects(chat('Hello?'),/cannot answer: its Gateway did not answer at 127\.0\.0\.1:\d+\/claw/);
 }finally{server.close();}
});
for(const name of ['log','warn','error'] as const)console[name]=original[name];
assert.ok(!logged.some(line=>line.includes('claw-secret')),'the token is never logged');
console.log('PASS remote Gateway: the token checked and kept in the vault only, Fox\'s turns on its /v1/responses with a session per thread and World tools run here, its approvals socket at the same address, background work on its lane in sessions of their own, and no fallback when it is gone.');
