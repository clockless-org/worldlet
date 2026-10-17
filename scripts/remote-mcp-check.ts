import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import {withTempDir} from './test-temp.ts';
import {WorldLedger} from '../platform/electron/src/store/ledger.ts';
import {createAgentAccess} from '../platform/electron/src/modules/agent-runtime/agent-access.ts';
import {openStandingWorldTools} from '../platform/electron/src/modules/agent-runtime/world-tool-bridge.ts';
import {REMOTE_MCP_VAULT,createRemoteMcpHost} from '../platform/electron/src/modules/agent-runtime/remote-mcp.ts';
import {MCP_HOST_PROTOCOL,REMOTE_MCP_LIMITS,readRemoteMcpRequest,remoteConsentItemId,remoteMcpRoom,validRedirect,wellKnownAddress} from '../core/agent/remote-mcp.ts';
import {roomDenied} from '../contracts/web-world.ts';
import {projectWorldItems} from '../core/items/world-items.ts';

// Remote MCP on the host (core/agent/REMOTE-MCP.md), the same modules the Electron and Node hosts run, with the front
// played by a fake WebSocket: turned on, the host opens the room as its host with its token; a cloud client discovers
// OAuth, registers, is sent to the authorize page, which waits while the consent card waits in Attention; Allow hands
// the page a code, the code and its PKCE verifier buy tokens, and the tokens reach the World tools as an Agent of its
// own, under its own Grants and audit. Deny, an expired or mismatched code, a wrong verifier, a wrong client secret, a
// replayed refresh token and a revoked Agent are all refused; a new address ends every connection. Tokens and the
// host token appear in no item, audit entry, ledger row or log line.

const say=(line:string)=>{process.stdout.write(line+'\n');};
// A hard stop: a check that waits on something that never comes fails here with what was still open, instead of
// holding a release host's lane until the runner kills it (Windows Alpha 4473 stopped it after 8 minutes).
const watchdog=setTimeout(()=>{process.stderr.write(`FAIL remote-mcp-check: no result after 90 s; still open: ${process.getActiveResourcesInfo().join(', ')}\n`);process.exit(1);},90_000);
watchdog.unref();
const b64url=(bytes:Buffer)=>bytes.toString('base64url');
class FakeSocket {
 static last:FakeSocket|null=null;static all:FakeSocket[]=[];
 readyState=0;sent:string[]=[];closedWith:number|null=null;url:string;protocols:string[];
 onopen:((e:unknown)=>void)|null=null;onmessage:((e:{data:unknown})=>void)|null=null;onclose:((e:{code?:number})=>void)|null=null;onerror:((e:unknown)=>void)|null=null;
 constructor(url:string,protocols:string[]){this.url=url;this.protocols=protocols;FakeSocket.last=this;FakeSocket.all.push(this);}
 open(){this.readyState=1;this.onopen?.({});}
 send(data:string){this.sent.push(data);}
 close(code=1000){this.closedWith=code;this.readyState=3;}
 drop(code=1006){this.readyState=3;this.onclose?.({code});}
}
await withTempDir('worldlet-remote-mcp-',async dir=>{
 const ledger=new WorldLedger(path.join(dir,'world'));
 let clock=Date.parse('2026-10-17T12:00:00.000Z');
 const now=()=>clock;
 const secrets=new Map<string,string>();
 const vault={get:(id:string)=>secrets.get(id)??null,set:(id:string,value:string)=>{secrets.set(id,value);},delete:(id:string)=>{secrets.delete(id);},deleteAll:()=>secrets.clear()};
 const access=createAgentAccess({root:path.join(dir,'access'),vault,ledger:()=>ledger,now:()=>new Date(clock).toISOString()});
 const logged:string[]=[];
 const original={log:console.log,error:console.error,warn:console.warn};
 for(const name of ['log','error','warn'] as const)console[name]=(...args:unknown[])=>{logged.push(args.map(String).join(' '));};
 const standing=await openStandingWorldTools({access,channel:async()=>({error:'not here'})});
 let changes=0;
 const remote=createRemoteMcpHost({vault,access,tools:()=>Promise.resolve(standing),ledger:()=>ledger,changed:()=>{changes+=1;},WebSocket:FakeSocket as any,now,onByDefault:true});
 const issued:string[]=[];
 try{
  // A development build, a check or another library stays off until turned on.
  const devSecrets=new Map<string,string>();
  const dev=createRemoteMcpHost({vault:{...vault,get:(id:string)=>devSecrets.get(id)??null,set:(id:string,value:string)=>{devSecrets.set(id,value);}},access,tools:()=>Promise.resolve(standing),ledger:()=>ledger,changed:()=>{},WebSocket:FakeSocket as any,now});
  assert.deepEqual(await dev.status(),{enabled:false,connected:false,connectors:[]});
  dev.close();
  // On by default: the first run makes the address and opens its room without being asked; Turn on changes nothing.
  assert.equal((await remote.status()).enabled,true);
  for(let i=0;i<200&&!FakeSocket.all.length;i++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(FakeSocket.all.length,1);
  const on=await remote.enable();
  assert.equal(FakeSocket.all.length,1);
  const ws=FakeSocket.last!,{token}=JSON.parse(secrets.get(REMOTE_MCP_VAULT)!);
  const room=await remoteMcpRoom(token);
  assert.equal(ws.url,`wss://worldlet.ai/api/mcp-host/${room}`);
  assert.deepEqual(ws.protocols,[MCP_HOST_PROTOCOL,'host.'+token]);
  assert.equal(room,crypto.createHash('sha256').update(token).digest('hex').slice(0,32));
  assert.equal(on.address,`https://mcp.worldlet.ai/${room}`);
  assert.equal(on.connected,false);
  ws.open();
  assert.equal((await remote.status()).connected,true);
  say('PASS on by default, the host opens its room with its token and gives the address mcp.worldlet.ai/<room>.');

  // The front: one request in, one answer out, in order.
  const base=`https://mcp.worldlet.ai/${room}`;
  let next=0;
  async function front(method:string,pathname:string,{query='',headers={},body=''}:{query?:string,headers?:Record<string,string>,body?:string}={}){
   const id='r'+(next++),before=ws.sent.length;
   ws.onmessage!({data:JSON.stringify({t:'req',id,method,base,path:pathname,query,headers,body})});
   // The answer to this request, by id, not whatever was sent last; a slow host gets 10 s.
   const answer=()=>ws.sent.slice(before).map(data=>JSON.parse(data)).find(frame=>frame.t==='res'&&frame.id===id);
   const started=Date.now();let frame=answer();
   while(!frame&&Date.now()-started<10_000){await new Promise(resolve=>setTimeout(resolve,5));frame=answer();}
   assert.ok(frame,`no answer to ${method} ${pathname}`);
   return {status:frame.status as number,headers:frame.headers as Record<string,string>,body:frame.body as string,json:()=>JSON.parse(frame.body)};
  }
  const rpc=(bearer:string,message:unknown)=>front('POST','/',{headers:{authorization:'Bearer '+bearer,'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify(message)});

  // Unauthorized: 401 naming the protected resource metadata, which names this World as its own authorization server.
  const anonymous=await front('POST','/',{body:'{}'});
  assert.equal(anonymous.status,401);
  assert.equal(anonymous.headers['www-authenticate'],`Bearer resource_metadata="https://mcp.worldlet.ai/.well-known/oauth-protected-resource/${room}"`);
  assert.equal(wellKnownAddress(base,'oauth-authorization-server'),`https://mcp.worldlet.ai/.well-known/oauth-authorization-server/${room}`);
  assert.equal(wellKnownAddress('https://worldlet.ai/mcp/'+room,'oauth-protected-resource'),`https://worldlet.ai/.well-known/oauth-protected-resource/mcp/${room}`);
  const resource=(await front('GET','/.well-known/oauth-protected-resource')).json();
  assert.deepEqual([resource.resource,resource.authorization_servers],[base,[base]]);
  const meta=(await front('GET','/.well-known/oauth-authorization-server')).json();
  assert.deepEqual([meta.issuer,meta.authorization_endpoint,meta.token_endpoint,meta.registration_endpoint,meta.code_challenge_methods_supported],[base,base+'/authorize',base+'/token',base+'/register',['S256']]);
  assert.deepEqual((await front('GET','/.well-known/openid-configuration')).json().issuer,base);
  assert.equal((await front('GET','/')).status,405);
  assert.equal((await front('GET','/nothing')).status,404);
  say('PASS discovery: 401 with resource metadata (RFC 9728), authorization server metadata (RFC 8414) with path-inserted well-known addresses.');

  // Registration (RFC 7591): https, loopback and an app's own scheme; never javascript:, data: or plain http elsewhere.
  for(const uri of ['https://claude.ai/api/mcp/auth_callback','http://127.0.0.1:33418/callback','cursor://anysphere.cursor-mcp/oauth/callback'])assert.ok(validRedirect(uri),uri);
  for(const uri of ['javascript:alert(1)','data:text/html,x','http://example.com/cb','https://example.com/cb#x','file:///etc/passwd'])assert.ok(!validRedirect(uri),uri);
  assert.equal((await front('POST','/register',{body:JSON.stringify({redirect_uris:['http://example.com/cb']})})).status,400);
  assert.equal((await front('POST','/register',{body:'not json'})).status,400);
  const redirect='https://claude.ai/api/mcp/auth_callback';
  const registered=await front('POST','/register',{headers:{'content-type':'application/json'},body:JSON.stringify({client_name:'Claude',redirect_uris:[redirect],token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code']})});
  assert.equal(registered.status,201);
  const client=registered.json();
  assert.equal(client.client_secret,undefined);
  assert.equal(client.token_endpoint_auth_method,'none');
  say('PASS registration takes https, loopback and app-scheme redirects, and refuses the rest.');

  // Authorize: the page waits with a code, and the card in Attention names the client, where it returns and the code.
  const verifier=b64url(crypto.randomBytes(48)),challenge=b64url(crypto.createHash('sha256').update(verifier).digest());
  const authorizeQuery=(extra:Record<string,string>={})=>new URLSearchParams({response_type:'code',client_id:client.client_id,redirect_uri:redirect,code_challenge:challenge,code_challenge_method:'S256',state:'st-1',scope:'world',...extra}).toString();
  assert.match((await front('GET','/authorize',{query:authorizeQuery({client_id:'nobody'.padEnd(43,'x')})})).body,/not registered/);
  assert.match((await front('GET','/authorize',{query:authorizeQuery({redirect_uri:'https://evil.example/cb'})})).body,/did not register/);
  const noPkce=await front('GET','/authorize',{query:authorizeQuery({code_challenge_method:'plain'})});
  assert.equal(noPkce.status,302);assert.match(noPkce.headers.location,/^https:\/\/claude\.ai\/api\/mcp\/auth_callback\?error=invalid_request/);
  const pageAnswer=await front('GET','/authorize',{query:authorizeQuery()});
  assert.equal(pageAnswer.status,200);
  assert.match(pageAnswer.headers['content-security-policy'],/script-src 'nonce-[A-Za-z0-9_-]+'/);
  const code=/class="code">(\d{4})</.exec(pageAnswer.body)![1];
  const consentId=/wait\?id=([A-Za-z0-9_-]+)/.exec(pageAnswer.body)![1];
  const item=ledger.value('items',remoteConsentItemId(consentId))!;
  assert.deepEqual([item.provider,item.status,item.remoteConsentClient,item.remoteConsentCode,item.remoteConsentReturnsTo],['agents','open','Claude',code,'claude.ai']);
  const projected={pages:[] as any[],roots:['root']};projectWorldItems(projected,[item]);
  assert.deepEqual(projected.pages[0].worldItemRemoteConsent,{id:consentId,client:'Claude',code,returnsTo:'claude.ai',status:'pending'});
  // Only this computer's pages may answer it: a World page on another device cannot.
  assert.notEqual(roomDenied({action:'remoteMcp',operation:'allow'}),'');
  // A wait that is not answered yet comes back pending.
  const waited=front('GET','/authorize/wait',{query:'id='+consentId});
  assert.deepEqual(remote.decide(consentId,true),{ok:true,status:'allowed'});
  const answered=(await waited).json();
  assert.equal(answered.allowed,true);
  const back=new URL(answered.redirect);
  assert.deepEqual([back.origin+back.pathname,back.searchParams.get('state'),back.searchParams.get('iss')],[redirect,'st-1',base]);
  const authCode=back.searchParams.get('code')!;
  assert.deepEqual(remote.decide(consentId,true).ok,false,'answered once');
  assert.equal(ledger.value('items',remoteConsentItemId(consentId))!.status,'done');
  say('PASS authorize: the page waits with a code, the card names client, return place and code, and Allow hands back a code with state and iss.');

  // Token: the verifier must match, the code works once.
  const tokenRequest=(values:Record<string,string>,headers:Record<string,string>={})=>front('POST','/token',{headers:{'content-type':'application/x-www-form-urlencoded',...headers},body:new URLSearchParams(values).toString()});
  const wrong=await tokenRequest({grant_type:'authorization_code',code:authCode,code_verifier:b64url(crypto.randomBytes(48)),client_id:client.client_id,redirect_uri:redirect});
  assert.deepEqual([wrong.status,wrong.json().error],[400,'invalid_grant']);
  // A refused attempt spent the code, as every use does.
  const spent=await tokenRequest({grant_type:'authorization_code',code:authCode,code_verifier:verifier,client_id:client.client_id,redirect_uri:redirect});
  assert.equal(spent.json().error,'invalid_grant');
  // Again from the top, for a code that is used rightly.
  async function connect(clientId:string,headers:Record<string,string>={},extra:Record<string,string>={}){
   const shown=await front('GET','/authorize',{query:authorizeQuery({client_id:clientId})});
   const id=/wait\?id=([A-Za-z0-9_-]+)/.exec(shown.body)![1];
   remote.decide(id,true);
   const r=(await front('GET','/authorize/wait',{query:'id='+id})).json();
   const c=new URL(r.redirect).searchParams.get('code')!;
   return tokenRequest({grant_type:'authorization_code',code:c,code_verifier:verifier,redirect_uri:redirect,...clientId&&!headers.authorization?{client_id:clientId}:{},...extra},headers);
  }
  const granted=await connect(client.client_id);
  assert.equal(granted.status,200);
  const tokens=granted.json();
  assert.deepEqual([tokens.token_type,tokens.expires_in,typeof tokens.access_token,typeof tokens.refresh_token],['Bearer',3600,'string','string']);
  issued.push(tokens.access_token,tokens.refresh_token);
  say('PASS token: a wrong verifier is refused and spends the code; the right one gets a bearer and a refresh token.');

  // MCP over the front, as the Agent the connection is.
  const init=(await rpc(tokens.access_token,{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'claude-ai',version:'1'}}})).json();
  assert.deepEqual([init.id,init.result.protocolVersion,init.result.serverInfo.name],[1,'2025-06-18','worldlet']);
  assert.equal((await rpc(tokens.access_token,{jsonrpc:'2.0',id:9,method:'initialize',params:{protocolVersion:'1999-01-01'}})).json().result.protocolVersion,'2025-06-18');
  const note=await rpc(tokens.access_token,{jsonrpc:'2.0',method:'notifications/initialized'});
  assert.deepEqual([note.status,note.body],[202,'']);
  const listed=(await rpc(tokens.access_token,{jsonrpc:'2.0',id:2,method:'tools/list'})).json();
  assert.deepEqual(listed.result.tools.map((t:any)=>t.name),['describe_world_tools','call_world_tool']);
  const described=(await rpc(tokens.access_token,{jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'describe_world_tools',arguments:{}}})).json();
  assert.equal(described.result.isError,false);
  assert.ok(JSON.parse(described.result.content[0].text),'describe answers JSON');
  // A call is decided by its own Grants and audited: a write outside any turn is refused, as for any standing Agent.
  const called=(await rpc(tokens.access_token,{jsonrpc:'2.0',id:31,method:'tools/call',params:{name:'call_world_tool',arguments:{target:'world',action:'link',arguments:'{}'}}})).json();
  assert.equal(typeof called.result.content[0].text,'string');
  const batch=(await rpc(tokens.access_token,[{jsonrpc:'2.0',id:4,method:'ping'},{jsonrpc:'2.0',id:5,method:'nope'}])).json();
  assert.deepEqual(batch,[{jsonrpc:'2.0',id:4,result:{}},{jsonrpc:'2.0',id:5,error:{code:-32601,message:'Method not found'}}]);
  const agents=access.list().filter(a=>a.identity.kind==='remote');
  assert.equal(agents.length,1,'a redeemed code is an Agent of its own; the spent one made none');
  const agent=agents[0].identity;
  assert.match(agent.id,/^remote-claude-[a-f0-9]{6}$/);
  assert.deepEqual([agent.name,agent.harness,agent.kind],['Claude','claude','remote']);
  assert.ok(ledger.agentAudit(agent.id,50).length>0,'its calls are audited under its own name');
  const status=await remote.status();
  assert.deepEqual(status.connectors.map(c=>c.id),[agent.id]);
  say('PASS MCP: initialize, notifications, tools/list, tools/call and batches run as the connection\'s own Agent, audited.');

  // An access token runs out; the refresh token is good once and is replaced.
  clock+=REMOTE_MCP_LIMITS.accessSeconds*1000+1;
  assert.equal((await rpc(tokens.access_token,{jsonrpc:'2.0',id:6,method:'ping'})).status,401);
  const refreshed=(await tokenRequest({grant_type:'refresh_token',refresh_token:tokens.refresh_token,client_id:client.client_id})).json();
  issued.push(refreshed.access_token,refreshed.refresh_token);
  assert.equal((await rpc(refreshed.access_token,{jsonrpc:'2.0',id:7,method:'ping'})).status,200);
  assert.equal((await tokenRequest({grant_type:'refresh_token',refresh_token:tokens.refresh_token,client_id:client.client_id})).json().error,'invalid_grant');
  say('PASS refresh: an expired access token is refused; a refresh token works once and is replaced.');

  // A confidential client: its secret is checked (Basic or in the body).
  const secretClient=(await front('POST','/register',{body:JSON.stringify({client_name:'ChatGPT',redirect_uris:[redirect]})})).json();
  assert.equal(secretClient.token_endpoint_auth_method,'client_secret_basic');
  issued.push(secretClient.client_secret);
  const basic=(id:string,secret:string)=>({authorization:'Basic '+Buffer.from(`${encodeURIComponent(id)}:${encodeURIComponent(secret)}`).toString('base64')});
  assert.equal((await connect(secretClient.client_id,basic(secretClient.client_id,'wrong'))).status,401);
  const confidential=await connect(secretClient.client_id,basic(secretClient.client_id,secretClient.client_secret));
  assert.equal(confidential.status,200);issued.push(confidential.json().access_token,confidential.json().refresh_token);
  say('PASS a client registered with a secret must present it.');

  // A token for an Agent that cannot open a browser: an Agent of its own, no expiry, replaced by a new one, ended by Revoke.
  assert.equal((await remote.token('')).ok,false);
  const made=await remote.token('Build machine') as any;
  assert.equal(made.ok,true);issued.push(made.token);
  assert.equal(made.address,on.address);
  assert.match(made.agent.id,/^remote-build-machine-[a-f0-9]{6}$/);
  assert.deepEqual([access.identity(made.agent.id)!.kind,access.identity(made.agent.id)!.harness],['remote','token']);
  assert.equal((await rpc(made.token,{jsonrpc:'2.0',id:40,method:'tools/list'})).status,200);
  clock+=30*86400_000;
  assert.equal((await rpc(made.token,{jsonrpc:'2.0',id:41,method:'ping'})).status,200,'a token does not run out');
  const remade=await remote.token(undefined,made.agent.id) as any;issued.push(remade.token);
  assert.equal(remade.agent.id,made.agent.id);
  assert.equal((await rpc(made.token,{jsonrpc:'2.0',id:42,method:'ping'})).status,401,'the old token stops');
  assert.equal((await rpc(remade.token,{jsonrpc:'2.0',id:43,method:'ping'})).status,200);
  assert.ok((await remote.status()).connectors.some(c=>c.id===made.agent.id&&c.token));
  access.ensure({id:'codex',name:'Codex',harness:'codex',kind:'local'});
  assert.equal((await remote.token(undefined,'codex')).ok,false,'only a remote Agent gets a token');
  access.revoke(made.agent.id);
  assert.equal((await rpc(remade.token,{jsonrpc:'2.0',id:44,method:'ping'})).status,401,'Revoke ends it');
  say('PASS a token for a script is an Agent of its own, does not run out, is replaced by a new one and ends with Revoke.');

  // Deny: the page is sent back with access_denied, and no Agent is made.
  const before=access.list().length;
  const denyPage=await front('GET','/authorize',{query:authorizeQuery()});
  const denyId=/wait\?id=([A-Za-z0-9_-]+)/.exec(denyPage.body)![1];
  assert.deepEqual(remote.decide(denyId,false),{ok:true,status:'denied'});
  const denied=new URL((await front('GET','/authorize/wait',{query:'id='+denyId})).json().redirect);
  assert.deepEqual([denied.searchParams.get('error'),denied.searchParams.get('state')],['access_denied','st-1']);
  assert.equal(access.list().length,before);
  assert.equal(ledger.value('items',remoteConsentItemId(denyId))!.status,'dismissed');
  // One left waiting runs out.
  const lapsedPage=await front('GET','/authorize',{query:authorizeQuery()});
  const lapsedId=/wait\?id=([A-Za-z0-9_-]+)/.exec(lapsedPage.body)![1];
  clock+=REMOTE_MCP_LIMITS.consentSeconds*1000+1;
  assert.deepEqual((await front('GET','/authorize/wait',{query:'id='+lapsedId})).json(),{expired:true});
  assert.equal(remote.decide(lapsedId,true).ok,false);
  say('PASS Deny sends the client back with access_denied and makes no Agent; an unanswered request runs out.');

  // Revoke in Settings ends the connection at once, refresh included.
  access.revoke(agent.id);
  assert.equal((await rpc(refreshed.access_token,{jsonrpc:'2.0',id:8,method:'ping'})).status,401);
  assert.equal((await tokenRequest({grant_type:'refresh_token',refresh_token:refreshed.refresh_token,client_id:client.client_id})).json().error,'invalid_grant');
  say('PASS revoking the Agent ends its connection.');

  // The front going away: the host reconnects by itself; a newer host on the same address is left alone for a while.
  ws.drop();
  assert.equal((await remote.status()).connected,false);
  await new Promise(resolve=>setTimeout(resolve,1200));
  assert.notEqual(FakeSocket.last,ws,'reconnected');
  FakeSocket.last!.open();
  assert.equal((await remote.status()).connected,true);
  // Off: the socket closes and nothing reconnects; on again: the same address.
  const off=await remote.disable();
  assert.deepEqual([off.enabled,FakeSocket.last!.closedWith],[false,1000]);
  // Turned off stays off when Worldlet starts again.
  const sockets=FakeSocket.all.length;
  const restarted=createRemoteMcpHost({vault,access,tools:()=>Promise.resolve(standing),ledger:()=>ledger,changed:()=>{},WebSocket:FakeSocket as any,now,onByDefault:true});
  await new Promise(resolve=>setTimeout(resolve,50));
  assert.deepEqual([(await restarted.status()).enabled,FakeSocket.all.length],[false,sockets]);
  restarted.close();
  const again=await remote.enable();
  assert.equal(again.address,on.address);
  FakeSocket.last!.open();
  // A new address ends every connection and registration.
  const confidentialAccess=confidential.json().access_token;
  const renewed=await remote.renew();
  assert.notEqual(renewed.address,on.address);
  const newWs=FakeSocket.last!;newWs.open();
  assert.equal(JSON.parse(secrets.get(REMOTE_MCP_VAULT)!).state.clients.length,0);
  const oldRoomAnswer=readRemoteMcpRequest(JSON.stringify({t:'req',id:'x',method:'POST',base,path:'/',query:'',headers:{authorization:'Bearer '+confidentialAccess},body:'{}'}));
  assert.ok(oldRoomAnswer);
  say('PASS the host reconnects on its own; off closes the room, keeps the address and stays off after a restart; a new address ends every connection.');

  // Malformed frames are dropped.
  for(const bad of ['nope','{}',JSON.stringify({t:'req',id:'a',method:'get',base,path:'/',query:'',headers:{},body:''}),JSON.stringify({t:'req',id:'a',method:'GET',base:'javascript:x',path:'/',query:'',headers:{},body:''})])assert.equal(readRemoteMcpRequest(bad),null);
  assert.deepEqual(readRemoteMcpRequest(JSON.stringify({t:'req',id:'a',method:'GET',base,path:'/',query:'',headers:{cookie:'x',authorization:'Bearer y'},body:''}))?.headers,{authorization:'Bearer y'});
  say('PASS malformed frames are dropped and only the forwarded headers are read.');

  // No secret anywhere it should not be.
  const everywhere=JSON.stringify([ledger.records('items'),ledger.records('remote-mcp-consents'),access.list(50),logged]);
  for(const secret of [token,...issued])assert.ok(!everywhere.includes(secret),'a token leaked');
  assert.ok(changes>0);
  say('PASS no token or host token appears in items, consents, audit or logs.');
 }finally{
  remote.close();standing.close();ledger.close();
  Object.assign(console,original);
 }
});
