// PostHog's own sign-in (context/connectors/connectors.ts `mcp-oauth`, service-source.ts signIn, mcp-account.ts): against
// fixtures of PostHog's MCP metadata, its authorization server and its Cloud API, Connect with no key registers Worldlet,
// signs in on a loopback address asking only the connector's read scopes, finds the Cloud (US, then EU) and the
// project the account is on, checks it with one read and keeps no key; reads send the sign-in's access token, renewed
// once when PostHog refuses it, and a sign-in PostHog no longer accepts says to sign in again; the person picks another
// project without signing in again; the first approved change asks for the write scopes in the browser; a key under
// Advanced replaces the sign-in, a cancelled sign-in leaves a kept key, and Disconnect forgets both.
import assert from 'node:assert/strict';
import {connectorScopes} from '../context/connectors/index.ts';
import {ServiceSource} from '../platform/host/modules/connectors/service-source.ts';

const MCP='https://mcp.posthog.com/mcp',ISSUER='https://oauth.posthog.com',US='https://us.posthog.com',EU='https://eu.posthog.com';
const KEY='phx_'+'Fixture1'.repeat(5);
const values=new Map<string,string>();
const vault={get:(id:string)=>values.get(id)??null,set:(id:string,value:string)=>{values.set(id,value);},delete:(id:string)=>{values.delete(id);},deleteAll:()=>values.clear()};
const state={issued:0,valid:new Set<string>(),refuseRefresh:false,grantedScope:'',authorized:[] as URL[],tokens:[] as Record<string,string>[],api:[] as {url:string;auth:string;method:string}[]};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
const OFFERED=['openid','user:read','user:write','project:read','project:write','query:read','insight:read','insight:write','dashboard:read','feature_flag:read','feature_flag:write','annotation:read','annotation:write','error_tracking:read','organization:write','billing:write'];
let clock=1_000_000_000_000;
const fixture=async(input:any,init:any={}):Promise<Response>=>{
 const url=new URL(String(input)),auth=String(init.headers?.authorization??'');
 if(url.href===MCP)return new Response('',{status:401,headers:{'www-authenticate':`Bearer resource_metadata="https://mcp.posthog.com/.well-known/oauth-protected-resource/mcp"`}});
 if(url.href==='https://mcp.posthog.com/.well-known/oauth-protected-resource/mcp')return json({resource:MCP,authorization_servers:[ISSUER],scopes_supported:OFFERED});
 if(url.href===ISSUER+'/.well-known/oauth-authorization-server')return json({issuer:ISSUER,authorization_endpoint:ISSUER+'/oauth/authorize/',token_endpoint:ISSUER+'/oauth/token/',registration_endpoint:ISSUER+'/oauth/register/',code_challenge_methods_supported:['S256']});
 if(url.href===ISSUER+'/oauth/register/')return json({client_id:'worldlet-client',...JSON.parse(init.body)},201);
 if(url.href===ISSUER+'/oauth/token/'){
  const form=Object.fromEntries(new URLSearchParams(String(init.body)));state.tokens.push(form);
  if(form.grant_type==='refresh_token'&&state.refuseRefresh)return json({error:'invalid_grant'},400);
  const access='pha_'+(++state.issued);state.valid.add(access);
  return json({access_token:access,token_type:'Bearer',expires_in:3600,refresh_token:'phr_'+state.issued,scope:state.grantedScope});
 }
 if(url.hostname.includes('posthog.com')&&url.pathname.includes('/.well-known/'))return new Response('',{status:404});
 if(url.origin===US||url.origin===EU){
  state.api.push({url:url.href,auth,method:init.method??'GET'});
  const token=auth.replace(/^Bearer /,'');
  // The account lives in EU Cloud: US refuses its token.
  if(url.origin===US||!(state.valid.has(token)||token===KEY))return json({detail:'Invalid token.'},401);
  if(url.pathname==='/api/users/@me/')return json({email:'alex@example.com',team:{id:2,name:'Web'},organization:{id:'org',teams:[{id:1,name:'Mobile'},{id:2,name:'Web'}]}});
  const project=/^\/api\/projects\/(\d+)\/$/.exec(url.pathname);
  if(project)return json({id:Number(project[1]),name:project[1]==='1'?'Mobile':'Web'});
  if(/\/annotations\/$/.test(url.pathname)&&init.method==='POST')return json({id:7},201);
  if(/\/insights\/$/.test(url.pathname))return json({count:0,next:null,results:[]});
  return json({detail:'Not found.'},404);
 }
 throw Error('unexpected '+url.href);
};
// The browser: the person signs in and allows; PostHog comes back to the loopback address with a code.
let opened=0;
const browser=async(address:string)=>{
 opened++;const query=new URL(address).searchParams;state.authorized.push(new URL(address));
 setTimeout(()=>void fetch(query.get('redirect_uri')+'?'+new URLSearchParams({code:'code-'+opened,state:query.get('state')!})).then(r=>r.text()),10);
};
const source=new ServiceSource({vault,fetch:fixture as typeof fetch,openExternal:browser,clock:()=>clock});

// Connect with no key: sign in, asking only the read list.
state.grantedScope=connectorScopes('posthog').join(' ');
await source.connect('posthog','',{},browser);
const asked=state.authorized.at(-1)!.searchParams.get('scope')!.split(' ');
assert.deepEqual(asked,connectorScopes('posthog',OFFERED));
assert.ok(asked.every(scope=>scope.endsWith(':read')),'reading only at sign-in');
assert.equal(state.authorized.at(-1)!.searchParams.get('resource'),MCP);
const kept=JSON.parse(values.get('service:posthog')!);
assert.deepEqual(kept,{v:1,settings:{host:EU,project:'2'},token:'',signIn:true,choices:[{id:'1',name:'Mobile'},{id:'2',name:'Web'}]},'EU Cloud and the project the account is on; no key kept');
assert.ok(values.has('mcp:posthog'),'the sign-in itself stays with the World\'s sign-ins');
assert.ok(state.api.some(call=>call.url===US+'/api/users/@me/'),'US Cloud was asked first');
assert.ok(source.connected('posthog'));
// Reads send the sign-in's access token, only to EU Cloud.
await source.read('posthog',{operation:'read',id:'insights'});
assert.deepEqual([state.api.at(-1)!.url.startsWith(EU+'/api/projects/2/insights/'),state.api.at(-1)!.auth],[true,'Bearer pha_1']);
// Choose the other project without signing in again.
assert.deepEqual(source.choices('posthog'),{choices:[{id:'1',name:'Mobile'},{id:'2',name:'Web'}],chosen:'2'});
await source.connect('posthog','',{project:'1'});
assert.equal(opened,1,'choosing a project opens no browser');
assert.equal(source.choices('posthog').chosen,'1');
await assert.rejects(source.connect('posthog','',{project:'99'}),/not in your PostHog account/);
assert.equal(source.choices('posthog').chosen,'1','a refused choice changes nothing');
// PostHog refuses an access token: renewed once, then the read goes through.
state.valid.delete('pha_1');
await source.read('posthog',{operation:'read',id:'insights'});
assert.equal(state.tokens.at(-1)!.grant_type,'refresh_token');
assert.equal(state.api.at(-1)!.auth,'Bearer pha_2');
// PostHog no longer accepts the sign-in: the read says to sign in again, in plain words.
state.valid.clear();state.refuseRefresh=true;clock+=7200_000;
await assert.rejects(source.read('posthog',{operation:'read',id:'insights'}),/^Error: PostHog signed you out\. Sign in to PostHog again in Settings › Connectors\.$|PostHog signed you out/);
state.refuseRefresh=false;
// Sign in again; the first approved change asks for the write scopes in the browser, then writes.
await source.connect('posthog','',{},browser);
const before=opened;
const writer=source.writer('posthog')!;
state.grantedScope=connectorScopes('posthog',undefined,{write:true}).join(' ');
const answer=await writer.request('POST',`/api/projects/${(writer.settings as any).project}/annotations/`,{content:'Release'});
assert.equal(answer.status,201);
assert.equal(opened,before+1,'one more sign-in, for the changes');
const again=state.authorized.at(-1)!.searchParams.get('scope')!.split(' ');
assert.ok(again.includes('annotation:write')&&again.includes('feature_flag:write')&&!again.includes('billing:write'),'only the connector\'s own write list');
await writer.request('POST',`/api/projects/2/annotations/`,{content:'Again'});
assert.equal(opened,before+1,'asked once');
// A key under Advanced replaces the sign-in.
await source.connect('posthog',KEY,{host:EU,project:'2'});
assert.equal(values.has('mcp:posthog'),false,'the sign-in is forgotten');
assert.equal(JSON.parse(values.get('service:posthog')!).token,KEY);
// A sign-in that does not finish leaves the key as it was.
await assert.rejects(source.connect('posthog','',{},async()=>{throw Error('no browser');},()=>true));
assert.equal(JSON.parse(values.get('service:posthog')!).token,KEY,'a cancelled sign-in replaces nothing');
assert.equal(values.has('mcp:posthog'),false);
// Disconnect forgets the sign-in and what it found.
await source.connect('posthog','',{},browser);
source.disconnect('posthog');
assert.equal(values.has('service:posthog'),false);assert.equal(values.has('mcp:posthog'),false);
assert.equal(source.connected('posthog'),false);
console.log('PASS PostHog sign-in: Connect with no key signs in on this computer asking reading only, finds EU or US Cloud and the project, keeps no key; reads with the access token, renewed once; signed out says so; another project without signing in again; the first approved change asks for the write list once; a key replaces the sign-in, a cancelled sign-in replaces nothing, Disconnect forgets both');
