// Cloudflare's own sign-in (core/accounts/connectors.ts `mcp-oauth`, service-source.ts signIn.mcp, mcp-account.ts):
// against fixtures of Cloudflare's MCP server (its metadata names only two scopes; its authorization server offers the
// rest), Connect with no key registers Worldlet and signs in on a loopback address asking only the connector's read
// list, finds the accounts the sign-in reads and keeps the first, checks it with one read and keeps no key. Each read
// goes to the server's `execute` tool as one fixed request built in Core, never to Cloudflare's API with the sign-in;
// GraphQL and REST answers come back as a direct request's would; a refused read says the sign-in does not allow it, a
// sign-in Cloudflare no longer accepts says to sign in again; another account is chosen without signing in again; a key
// under Advanced replaces the sign-in, and Disconnect forgets both.
import assert from 'node:assert/strict';
import {cloudflareExecute,cloudflareExecuteAnswer,connectorScopes,plainConnectorText,CLOUDFLARE_GATE} from '../core/accounts/index.ts';
import {ServiceSource} from '../platform/electron/src/modules/sources/service-source.ts';

const MCP='https://mcp.cloudflare.com/mcp',ISSUER='https://mcp.cloudflare.com';
const A='a'.repeat(32),B='b'.repeat(32),ZONE='c'.repeat(32);
const KEY='Fixture_'+'k'.repeat(32);
const values=new Map<string,string>();
const vault={get:(id:string)=>values.get(id)??null,set:(id:string,value:string)=>{values.set(id,value);},delete:(id:string)=>{values.delete(id);},deleteAll:()=>values.clear()};
const OFFERED=['offline_access','user:read','account:read','account-analytics.read','analytics.read','zone.read','zone.write','workers-scripts.write','account-settings.write'];
const state={issued:0,valid:new Set<string>(),refuseRefresh:false,authorized:[] as URL[],tokens:[] as Record<string,string>[],
 calls:[] as {url:string;auth:string;code:string}[],direct:[] as string[],forbid:false,upstreamGone:false};
const json=(value:unknown,status=200,headers:Record<string,string>={})=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json',...headers}});
/** What Cloudflare's `execute` would return for the one request in `code` (the fixture reads it back as data). */
function execute(code:string){
 const match=/^async \(\) => cloudflare\.request\((.*)\)$/s.exec(code);
 assert.ok(match,'execute runs only the fixed program');
 const request=JSON.parse(match![1]);
 const text=(value:unknown,isError=false)=>({content:[{type:'text',text:typeof value==='string'?value:JSON.stringify(value)}],...isError?{isError:true}:{}});
 if(state.upstreamGone)return text('Error: Cloudflare API error: 401 {"success":false}',true);
 if(request.path==='/accounts'&&request.method==='GET'){
  assert.deepEqual(request.query,{per_page:'50'});
  return text({success:true,result:[{id:A,name:'Alex'},{id:B,name:'Shop'},{id:'not-an-account',name:'x'}],status:200});
 }
 if(request.path==='/graphql'){
  if(state.forbid)return text('Error: Cloudflare API error: 10000: Authentication error',true);
  const account=request.body?.variables?.account;
  if(account&&![A,B].includes(account))return text('Error: GraphQL error: account not found',true);
  if(/query Zones/.test(request.body.query))return text({success:true,status:200,result:{viewer:{zones:[{zoneTag:ZONE,httpRequests1hGroups:[{sum:{requests:10,cachedRequests:5,threats:0,bytes:100}}]}]}},errors:[]});
  return text({success:true,status:200,result:{viewer:{accounts:[{workersInvocationsAdaptive:[{dimensions:{scriptName:'site'},sum:{requests:200,errors:2,subrequests:4},quantiles:{cpuTimeP50:1500,cpuTimeP99:9000}}]}]}},errors:[]});
 }
 if(request.path==='/zones'){
  assert.equal(request.query['account.id'],A);
  return text({success:true,result:[{id:ZONE,name:'example.com'}],status:200});
 }
 return text('Error: Cloudflare API error: 7003: Could not route',true);
}
const fixture=async(input:any,init:any={}):Promise<Response>=>{
 const url=new URL(String(input)),auth=String(init.headers?.authorization??'');
 if(url.origin==='https://api.cloudflare.com'){
  state.direct.push(url.href);
  if(auth!=='Bearer '+KEY)return json({success:false,errors:[{code:10000,message:'Authentication error'}]},401);
  return json({data:{viewer:{accounts:[{workersInvocationsAdaptive:[]}]}},errors:null});
 }
 if(url.origin!==ISSUER)throw Error('unexpected '+url.href);
 if(url.pathname==='/.well-known/oauth-protected-resource/mcp')return json({resource:MCP,authorization_servers:[ISSUER],scopes_supported:['user:read','account:read']});
 if(url.pathname==='/.well-known/oauth-authorization-server')return json({issuer:ISSUER,authorization_endpoint:ISSUER+'/authorize',token_endpoint:ISSUER+'/token',registration_endpoint:ISSUER+'/register',code_challenge_methods_supported:['S256'],scopes_supported:OFFERED});
 if(url.pathname==='/register')return json({client_id:'worldlet-client',...JSON.parse(init.body)},201);
 if(url.pathname==='/token'){
  const form=Object.fromEntries(new URLSearchParams(String(init.body)));state.tokens.push(form);
  if(form.grant_type==='refresh_token'&&state.refuseRefresh)return json({error:'invalid_grant'},400);
  const access='cfa_'+(++state.issued);state.valid.add(access);
  return json({access_token:access,token_type:'Bearer',expires_in:3600,refresh_token:'cfr_'+state.issued,scope:connectorScopes('cloudflare').join(' ')});
 }
 if(url.pathname==='/mcp'){
  if(init.method==='DELETE')return new Response('',{status:204});
  const token=auth.replace(/^Bearer /,'');
  if(!state.valid.has(token))return new Response('',{status:401,headers:{'www-authenticate':`Bearer resource_metadata="${ISSUER}/.well-known/oauth-protected-resource/mcp"`}});
  const message=JSON.parse(init.body);
  if(message.method==='initialize')return json({jsonrpc:'2.0',id:message.id,result:{protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'cloudflare',version:'1'}}});
  if(!('id' in message))return new Response('',{status:202});
  assert.equal(message.method,'tools/call');assert.equal(message.params.name,'execute');
  assert.equal(url.searchParams.get('truncateToolResult'),'false','whole answers, cut by Core');
  state.calls.push({url:url.href,auth,code:message.params.arguments.code});
  return json({jsonrpc:'2.0',id:message.id,result:execute(message.params.arguments.code)});
 }
 throw Error('unexpected '+url.href);
};
let opened=0;
const browser=async(address:string)=>{
 opened++;const query=new URL(address).searchParams;state.authorized.push(new URL(address));
 setTimeout(()=>void fetch(query.get('redirect_uri')+'?'+new URLSearchParams({code:'code-'+opened,state:query.get('state')!})).then(r=>r.text()),10);
};
const source=new ServiceSource({vault,fetch:fixture as typeof fetch,openExternal:browser});

// The fixed program: the request is data in it, under /client/v4 only.
assert.deepEqual(cloudflareExecute('GET','/client/v4/zones?account.id=x&per_page=20'),{code:'async () => cloudflare.request({"method":"GET","path":"/zones","query":{"account.id":"x","per_page":"20"}})'});
assert.throws(()=>cloudflareExecute('GET','/other'),/only through its API/);
assert.throws(()=>cloudflareExecute('GET','https://example.com/client/v4/x'),/only through its API/);
const injected=cloudflareExecute('POST','/client/v4/graphql',{query:'"); fetch("https://example.com"); ("'}).code;
assert.equal(JSON.parse(/request\((.*)\)$/s.exec(injected)![1]).body.query,'"); fetch("https://example.com"); ("','a body is a string inside the program');
// Answers as a direct request's would be.
const said=(text:string,isError=true)=>cloudflareExecuteAnswer({content:[{type:'text',text}],isError},'/client/v4/accounts');
assert.equal(said('Error: Cloudflare API error: 9109: Unauthorized to access requested resource').status,403);
assert.equal(said('Error: Cloudflare API error: 7003: Could not route').status,404);
assert.equal(said('Error: Cloudflare API error: 401 Unauthorized').status,401);
assert.equal(said('Error: Cloudflare API error: 10429: Too many requests').status,429);
assert.deepEqual(JSON.parse(said('Error: GraphQL error: unknown field').text),{error:{message:'unknown field'}});
assert.equal(cloudflareExecuteAnswer({content:[{type:'text',text:'not json'}]},'/client/v4/accounts').status,502);
assert.ok([CLOUDFLARE_GATE.signedOut,CLOUDFLARE_GATE.signInForbidden].every(text=>plainConnectorText(String(text))),'sign-in messages in plain words');

// Connect with no key: sign in, asking the connector's read list from what the authorization server offers.
await source.connect('cloudflare','',{},browser);
const asked=state.authorized.at(-1)!.searchParams.get('scope')!.split(' ');
assert.deepEqual(asked,connectorScopes('cloudflare'));
assert.ok(asked.includes('account-analytics.read')&&asked.includes('analytics.read')&&asked.includes('zone.read'),'the analytics reads, offered only by the authorization server');
assert.ok(asked.every(scope=>!/write/.test(scope)),'reading only');
assert.equal(state.authorized.at(-1)!.searchParams.get('resource'),MCP);
const kept=JSON.parse(values.get('service:cloudflare')!);
assert.deepEqual(kept,{v:1,settings:{account:A},token:'',signIn:true,choices:[{id:A,name:'Alex'},{id:B,name:'Shop'}]},'the first account, the two it may read; no key kept');
assert.ok(values.has('mcp:cloudflare'));
assert.ok(source.connected('cloudflare'));
assert.deepEqual(state.direct,[],'nothing goes to Cloudflare\'s API with the sign-in');
// Reads go to `execute`, with the sign-in, as Core's fixed requests.
const workers=await source.read('cloudflare',{operation:'read',id:'workers'}) as any;
assert.deepEqual(workers.records.map((record:any)=>[record.title,record.fields.requests,record.fields.errors]),[['site',200,2]]);
assert.equal(state.calls.at(-1)!.auth,'Bearer cfa_1');
const zones=await source.read('cloudflare',{operation:'read',id:'zones'}) as any;
assert.deepEqual(zones.records.map((record:any)=>[record.title,record.fields.requests]),[['example.com',10]]);
assert.deepEqual(state.direct,[]);
assert.ok(state.calls.every(call=>call.code.startsWith('async () => cloudflare.request({"method":')),'only fixed programs');
// Another account without signing in again; one not in the sign-in is refused and changes nothing.
assert.deepEqual(source.choices('cloudflare'),{choices:[{id:A,name:'Alex'},{id:B,name:'Shop'}],chosen:A});
await source.connect('cloudflare','',{account:B});
assert.equal(opened,1,'choosing an account opens no browser');
assert.equal(source.choices('cloudflare').chosen,B);
await assert.rejects(source.connect('cloudflare','',{account:'d'.repeat(32)}),/not in your Cloudflare sign-in/);
assert.equal(source.choices('cloudflare').chosen,B);
await source.connect('cloudflare','',{account:A});
// A read the sign-in does not allow says so, in plain words.
state.forbid=true;
await assert.rejects(source.read('cloudflare',{operation:'read',id:'workers'}),new RegExp(CLOUDFLARE_GATE.signInForbidden!.slice(0,40)));
state.forbid=false;
// The server refuses the access token: renewed once, then the read goes through.
state.valid.delete('cfa_1');
await source.read('cloudflare',{operation:'read',id:'workers'});
assert.equal(state.tokens.at(-1)!.grant_type,'refresh_token');
assert.equal(state.calls.at(-1)!.auth,'Bearer cfa_2');
// Cloudflare no longer accepts the sign-in: the read says to sign in again.
state.valid.clear();state.refuseRefresh=true;
await assert.rejects(source.read('cloudflare',{operation:'read',id:'workers'}),/Cloudflare signed you out/);
await assert.rejects(source.test('cloudflare'),/Cloudflare signed you out/);
state.refuseRefresh=false;
// Signed in again: Cloudflare's own sign-in behind the server is gone too (401 from the API) and says the same.
await source.connect('cloudflare','',{},browser);
state.upstreamGone=true;
await assert.rejects(source.read('cloudflare',{operation:'read',id:'workers'}),/Cloudflare signed you out/);
state.upstreamGone=false;
// A key under Advanced replaces the sign-in and reads Cloudflare's API directly.
await source.connect('cloudflare',KEY,{account:A});
assert.deepEqual(state.direct,['https://api.cloudflare.com/client/v4/graphql'],'a key reads the API directly');
assert.equal(values.has('mcp:cloudflare'),false,'the sign-in is forgotten');
assert.equal(JSON.parse(values.get('service:cloudflare')!).token,KEY);
await assert.rejects(source.connect('cloudflare','',{},async()=>{throw Error('no browser');},()=>true));
assert.equal(JSON.parse(values.get('service:cloudflare')!).token,KEY,'a sign-in that does not finish replaces nothing');
// Disconnect forgets the sign-in and what it found.
await source.connect('cloudflare','',{},browser);
source.disconnect('cloudflare');
assert.equal(values.has('service:cloudflare'),false);assert.equal(values.has('mcp:cloudflare'),false);
assert.equal(source.connected('cloudflare'),false);
console.log('PASS Cloudflare sign-in: Connect with no key signs in on this computer asking reading only (from the authorization server\'s list), keeps the first account and no key; reads go to Cloudflare\'s execute tool as fixed requests and come back as direct answers; refused reads and lost sign-ins say so in plain words; another account without signing in again; a key reads the API directly; Disconnect forgets both');
