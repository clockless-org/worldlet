// The World's MCP account connections (platform/electron/src/modules/sources/mcp-account.ts, mcp-client.ts) against a
// fake service: an Agent's own connection in its Hermes profile is used as it is (OAuth tokens or a `.env` token) and
// a refreshed token is written back the way Hermes writes it; a connection made through Worldlet discovers the
// server's authorization server, registers on a loopback address and signs in with PKCE and a resource indicator,
// is kept in the vault and refreshed there; the client opens a session, reads JSON and event-stream answers, retries
// once after a 401 and reopens a forgotten session.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {McpAccounts} from '../platform/electron/src/modules/sources/mcp-account.ts';
import {McpUnauthorized} from '../platform/electron/src/modules/sources/mcp-client.ts';
import {withTempDir} from './test-temp.ts';

await withTempDir('worldlet-mcp-account-',async temp=>{
 const values=new Map<string,string>();
 const vault={get:(id:string)=>values.get(id)??null,set:(id:string,value:string)=>{values.set(id,value);},delete:(id:string)=>{values.delete(id);},deleteAll:()=>values.clear()};
 const hermes=path.join(temp,'hermes');fs.mkdirSync(path.join(hermes,'mcp-tokens'),{recursive:true});
 let clock=1_000_000_000_000;
 const MCP='https://mcp.example.com/mcp',ISSUER='https://auth.example.com';
 // The fake service: one MCP endpoint behind OAuth, its metadata, registration and token endpoints.
 const state={valid:new Set(['agent-access','bearer-secret']),sessions:new Set<string>(),calls:[] as any[],registered:[] as any[],tokens:[] as any[],sse:false,forget:false,issued:0};
 const json=(value:unknown,status=200,headers:Record<string,string>={})=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json',...headers}});
 const fakeFetch=async(input:any,init:any={})=>{
  const url=String(input),headers=init.headers??{};
  if(url===MCP){
   const auth=String(headers.authorization??'').replace(/^Bearer /,'');
   if(!state.valid.has(auth))return new Response('',{status:401,headers:{'www-authenticate':`Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource/mcp"`}});
   if(init.method==='DELETE')return new Response('',{status:200});
   const message=JSON.parse(init.body);
   state.calls.push({method:message.method,session:headers['mcp-session-id']??null,version:headers['mcp-protocol-version']??null,auth});
   if(message.method==='initialize'){const id='s'+(state.sessions.size+1);state.sessions.add(id);return json({jsonrpc:'2.0',id:message.id,result:{protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'fake'}}},200,{'mcp-session-id':id});}
   if(state.forget){state.forget=false;state.sessions.clear();}
   if(!state.sessions.has(headers['mcp-session-id']))return new Response('',{status:404});
   if(message.method==='notifications/initialized')return new Response('',{status:202});
   const result=message.method==='tools/list'?{tools:[{name:'search'},{name:'fetch'}]}:{content:[{type:'text',text:JSON.stringify({echo:message.params})}]};
   if(state.sse)return new Response(`event: message\ndata: {"jsonrpc":"2.0","method":"notifications/progress","params":{}}\n\nevent: message\ndata: ${JSON.stringify({jsonrpc:'2.0',id:message.id,result})}\n\n`,{status:200,headers:{'content-type':'text/event-stream'}});
   return json({jsonrpc:'2.0',id:message.id,result});
  }
  if(url==='https://mcp.example.com/.well-known/oauth-protected-resource/mcp')return json({resource:MCP,authorization_servers:[ISSUER],scopes_supported:['read']});
  if(url===ISSUER+'/.well-known/oauth-authorization-server')return json({issuer:ISSUER,authorization_endpoint:ISSUER+'/authorize',token_endpoint:ISSUER+'/token',registration_endpoint:ISSUER+'/register',code_challenge_methods_supported:['S256']});
  if(url===ISSUER+'/register'){const body=JSON.parse(init.body);state.registered.push(body);return json({client_id:'client-'+state.registered.length,...body},201);}
  if(url===ISSUER+'/token'){
   const form=Object.fromEntries(new URLSearchParams(String(init.body)));state.tokens.push(form);
   if(form.grant_type==='refresh_token'&&form.refresh_token==='revoked')return json({error:'invalid_grant'},400);
   const access='access-'+(++state.issued);state.valid.add(access);
   return json({access_token:access,token_type:'Bearer',expires_in:3600,refresh_token:'refresh-'+state.issued,scope:'read'});
  }
  if(url.includes('/.well-known/'))return new Response('',{status:404});
  throw Error('unexpected '+url);
 };
 const accounts=new McpAccounts({vault,agentHomes:()=>[hermes],fetch:fakeFetch as any,now:()=>clock});

 // Nothing anywhere yet.
 assert.equal(accounts.connection('notion'),null);
 // An Agent's own connection: its config.yaml entry and Hermes' token store. A disabled entry does not count.
 fs.writeFileSync(path.join(hermes,'config.yaml'),`model:\n  default: x\nmcp_servers:\n  notion:\n    url: ${MCP}\n    enabled: true\n    auth: oauth\n  todoist:\n    url: ${MCP}\n    enabled: false\n  linear:\n    url: ${MCP}\n    enabled: true\n    headers:\n      Authorization: Bearer \${MCP_LINEAR_API_KEY}\n`);
 fs.writeFileSync(path.join(hermes,'mcp-tokens','notion.json'),JSON.stringify({access_token:'agent-access',token_type:'Bearer',refresh_token:'agent-refresh',expires_in:3600,expires_at:clock/1000+3600}));
 fs.writeFileSync(path.join(hermes,'mcp-tokens','notion.client.json'),JSON.stringify({client_id:'agent-client',redirect_uris:['http://127.0.0.1:1/callback']}));
 fs.writeFileSync(path.join(hermes,'mcp-tokens','notion.meta.json'),JSON.stringify({issuer:ISSUER,token_endpoint:ISSUER+'/token',authorization_endpoint:ISSUER+'/authorize'}));
 fs.writeFileSync(path.join(hermes,'.env'),'MCP_LINEAR_API_KEY="bearer-secret"\n');
 assert.equal(accounts.connection('todoist'),null,'a disabled server is not a connection');
 const notion=accounts.connection('notion')!;
 assert.equal(notion.source,'agent');
 const session=accounts.session(notion,'Notion');
 const answer=await session.callTool('fetch',{id:'x'},30);
 assert.deepEqual(JSON.parse(answer.content![0].text!),{echo:{name:'fetch',arguments:{id:'x'}}});
 assert.deepEqual(state.calls.map(c=>c.method),['initialize','notifications/initialized','tools/call']);
 assert.equal(state.calls[0].session,null);assert.equal(state.calls[2].session,'s1');assert.equal(state.calls[2].version,'2025-03-26','later requests carry the negotiated revision');
 assert.deepEqual(await session.tools(),['search','fetch']);
 // An event-stream answer: progress is skipped, the response with this id is read.
 state.sse=true;
 assert.deepEqual(JSON.parse((await session.callTool('search',{q:'a'})).content![0].text!).echo.name,'search');
 state.sse=false;
 // A forgotten session (the server restarted) is opened again, once.
 state.forget=true;
 await session.callTool('fetch',{id:'y'});
 assert.deepEqual(state.calls.slice(-3).map(c=>c.method),['initialize','notifications/initialized','tools/call']);
 // The Agent's token expired: refreshed with its own client and written back as Hermes writes it.
 clock+=7200_000;
 await session.callTool('fetch',{id:'z'});
 assert.equal(state.tokens.at(-1).grant_type,'refresh_token');assert.equal(state.tokens.at(-1).client_id,'agent-client');assert.equal(state.tokens.at(-1).refresh_token,'agent-refresh');
 const written=JSON.parse(fs.readFileSync(path.join(hermes,'mcp-tokens','notion.json'),'utf8'));
 assert.equal(written.access_token,'access-1');assert.equal(written.refresh_token,'refresh-1');assert.equal(written.expires_at,clock/1000+3600);
 assert.equal(fs.statSync(path.join(hermes,'mcp-tokens','notion.json')).mode&0o777,0o600);
 // A refused token refreshes once; a revoked refresh says the person must sign in again.
 state.valid.delete('access-1');
 await session.callTool('fetch',{id:'w'});
 assert.equal(JSON.parse(fs.readFileSync(path.join(hermes,'mcp-tokens','notion.json'),'utf8')).access_token,'access-2');
 fs.writeFileSync(path.join(hermes,'mcp-tokens','notion.json'),JSON.stringify({...JSON.parse(fs.readFileSync(path.join(hermes,'mcp-tokens','notion.json'),'utf8')),access_token:'gone',refresh_token:'revoked'}));
 await assert.rejects(accounts.session(accounts.connection('notion')!,'Notion').callTool('fetch',{}),(error:Error)=>error instanceof McpUnauthorized);
 // A token in the Agent's .env.
 const linear=accounts.connection('linear')!;
 assert.equal(linear.source,'agent');
 await accounts.session(linear,'Linear').callTool('fetch',{});
 assert.equal(state.calls.at(-1).auth,'bearer-secret');

 // A connection made through Worldlet: discovery, registration on the loopback address, PKCE, resource indicator.
 let opened='';
 const browser=async(url:string)=>{
  opened=url;const query=new URL(url).searchParams;
  setTimeout(async()=>{await fetch(query.get('redirect_uri')+'?'+new URLSearchParams({code:'code-1',state:query.get('state')!})).catch(()=>{});},10);
 };
 const made=await accounts.connect('todoist',MCP,'',browser);
 assert.equal(made.source,'world');
 const asked=new URL(opened).searchParams;
 assert.equal(new URL(opened).origin+new URL(opened).pathname,ISSUER+'/authorize');
 assert.match(asked.get('redirect_uri')!,/^http:\/\/127\.0\.0\.1:\d+\/callback$/);
 assert.deepEqual(state.registered.at(-1).redirect_uris,[asked.get('redirect_uri')]);
 assert.equal(state.registered.at(-1).token_endpoint_auth_method,'none');
 assert.equal(asked.get('resource'),MCP);assert.equal(asked.get('scope'),'read');assert.equal(asked.get('code_challenge_method'),'S256');
 const exchange=state.tokens.at(-1);
 assert.equal(exchange.grant_type,'authorization_code');assert.equal(exchange.resource,MCP);assert.equal(exchange.client_id,'client-1');
 assert.equal(crypto.createHash('sha256').update(exchange.code_verifier).digest('base64url'),asked.get('code_challenge'));
 assert.equal(accounts.connection('todoist')!.source,'world','the World\'s own connection, in the vault');
 assert.ok(!fs.readFileSync(path.join(hermes,'config.yaml'),'utf8').includes('access-'),'nothing is written into the Agent\'s profile');
 await accounts.session(accounts.connection('todoist')!,'Todoist').callTool('fetch',{});
 // Its token refreshes in the vault.
 clock+=7200_000;
 await accounts.session(accounts.connection('todoist')!,'Todoist').callTool('fetch',{});
 assert.equal(state.tokens.at(-1).grant_type,'refresh_token');assert.equal(state.tokens.at(-1).resource,MCP);
 assert.match(values.get('mcp:todoist')!,/"refresh_token":"refresh-\d+"/);
 // The World's own comes first, even where the Agent has one by that name; disconnecting forgets only the World's.
 await accounts.connect('notion',MCP,'Bearer bearer-secret',async()=>{throw Error('no browser for a token');});
 assert.equal(accounts.connection('notion')!.source,'world');
 accounts.disconnect('notion');
 assert.equal(accounts.connection('notion')!.source,'agent');
 // Refused: plain HTTP, a user in the address, a bad name.
 await assert.rejects(accounts.connect('x','http://mcp.example.com/mcp','',browser),/HTTPS/);
 await assert.rejects(accounts.connect('x','https://user:pw@mcp.example.com/mcp','',browser),/HTTPS/);
 await assert.rejects(accounts.connect('Bad Name',MCP,'',browser),/Invalid connection name/);
});
console.log('PASS World MCP connections: an Agent\'s own (OAuth tokens or .env token, refreshed and written back as Hermes does), Worldlet\'s own (discovery, registration, loopback PKCE with resource indicator, vault refresh), JSON and event-stream answers, 401 retry, reopened sessions');
