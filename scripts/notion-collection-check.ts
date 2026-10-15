// Synthetic OAuth + official MCP adapter + real temporary SQLite. No real account, browser or network grant.
import assert from 'node:assert/strict';
import path from 'node:path';
import crypto from 'node:crypto';
import {withTempDir} from './test-temp.ts';
import {McpAccounts} from '../platform/electron/src/modules/sources/mcp-account.ts';
import {McpSource} from '../platform/electron/src/modules/sources/mcp-source.ts';
import {GoogleAccount} from '../platform/electron/src/modules/sources/google-account.ts';
import {GoogleSource} from '../platform/electron/src/modules/sources/google-source.ts';
import {collectServicePage} from '../platform/electron/src/modules/sources/service-collection.ts';
import {createServicePresets} from '../platform/electron/src/modules/sources/service-presets.ts';
import {createServiceSync} from '../platform/electron/src/modules/sources/service-sync.ts';
import {WorldLedger} from '../platform/electron/src/store/ledger.ts';
import {readServicePresetRead} from '../core/accounts/index.ts';
import {SERVICE_PROVIDERS} from '../contracts/services.ts';

const PAGE='0123456789abcdef0123456789abcdef',OTHER='1123456789abcdef0123456789abcdef';
const ORIGIN='https://mcp.notion.com',MCP=ORIGIN+'/mcp';
assert.ok(!SERVICE_PROVIDERS.includes('notion'),'Notion collection adds no live read_service route or Service Grant');
assert.deepEqual(readServicePresetRead('notion',{operation:'read',id:'https://www.notion.so/Selected-'+PAGE}),{operation:'read',id:PAGE});
for(const read of [{operation:'list'},{operation:'read',id:PAGE,cursor:'next'},{operation:'read',id:PAGE,query:'everything'},{operation:'write',id:PAGE}])assert.throws(()=>readServicePresetRead('notion',read));

await withTempDir('worldlet-notion-collection-',async dir=>{
 const values=new Map<string,string>(),vault={get:(id:string)=>values.get(id)??null,set:(id:string,value:string)=>{values.set(id,value);},delete:(id:string)=>{values.delete(id);},deleteAll:()=>values.clear()};
 let now=Date.now(),issued=0,providerCalls=0,agentHomes=0,kind='page',markdown='Saved **context**.',offline=false;
 let refreshGate:(()=>Promise<void>)|null=null;
 const registrations:any[]=[],exchanges:any[]=[],fetches:string[]=[],opened:string[]=[];
 const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
 const fetchMock:typeof fetch=async(input,init:RequestInit={})=>{
  const url=String(input);
  if(url===ORIGIN+'/.well-known/oauth-protected-resource/mcp')return json({resource:MCP,authorization_servers:[ORIGIN],scopes_supported:['default']});
  if(url===ORIGIN+'/.well-known/oauth-authorization-server')return json({issuer:ORIGIN,authorization_endpoint:ORIGIN+'/authorize',token_endpoint:ORIGIN+'/token',registration_endpoint:ORIGIN+'/register',code_challenge_methods_supported:['S256']});
  if(url===ORIGIN+'/register'){registrations.push(JSON.parse(String(init.body)));return json({client_id:'synthetic-worldlet-client'});}
  if(url===ORIGIN+'/token'){
   const form=Object.fromEntries(new URLSearchParams(String(init.body)));exchanges.push(form);
   if(form.grant_type==='refresh_token')await refreshGate?.();
   return json({access_token:'synthetic-access-'+(++issued),refresh_token:'synthetic-refresh-'+issued,expires_in:3600,scope:'default'});
  }
  assert.equal(url,MCP,'no REST, external link or alternate provider');
  const headers=new Headers(init.headers);
  if(!headers.has('authorization'))return new Response('',{status:401,headers:{'www-authenticate':`Bearer resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/mcp"`}});
  assert.match(headers.get('authorization')!,/^Bearer synthetic-access-/);
  if(init.method==='DELETE')return new Response(null,{status:200});
  const message=JSON.parse(String(init.body)),reply=(result:unknown)=>json({jsonrpc:'2.0',id:message.id,result});
  if(message.method==='initialize')return reply({protocolVersion:'2025-06-18',capabilities:{}});
  if(message.method==='notifications/initialized')return new Response(null,{status:202});
  if(message.method==='tools/list')return reply({tools:['notion-fetch','notion-update-page','notion-create-pages'].map(name=>({name}))});
  assert.equal(message.method,'tools/call');assert.equal(message.params.name,'notion-fetch','collection never calls a write/search/database tool');
  providerCalls++;fetches.push(message.params.arguments.id);
  if(offline)throw Error('synthetic network failure');
  return reply({content:[{type:'text',text:JSON.stringify({title:'Selected page',metadata:{type:kind},page_last_edited_at:'2026-10-15T12:00:00Z',text:'<content>'+markdown+'</content>'})}]});
 };
 const accounts=new McpAccounts({vault,agentHomes:()=>{agentHomes++;throw Error('Must not borrow an Agent connection');},fetch:fetchMock,now:()=>now});
 const browser=async(url:string)=>{
  assert.equal(registrations.length,opened.length+1,'registration precedes the authorization page');opened.push(url);
  const query=new URL(url).searchParams;
  assert.equal(query.get('scope'),'default','provider authorization is not confused with Agent read scope');
  assert.equal(query.get('code_challenge_method'),'S256');
  const response=await fetch(query.get('redirect_uri')+'?'+new URLSearchParams({code:'synthetic-code',state:query.get('state')!}));
  assert.equal(response.status,200);
 };
 const mcp=new McpSource({accounts,openExternal:browser,reviews:path.join(dir,'reviews')});
 assert.equal(mcp.worldNotionBinding(),null);
 await assert.rejects(mcp.collectNotionPage(PAGE),/OAuth/);
 let ledger=new WorldLedger(path.join(dir,'world'));
 const readers={mcp,services:{read:async()=>{throw Error('No Service fallback');}}};
 const make=()=>createServiceSync({ledger:()=>ledger,authorize:()=>{const binding=mcp.worldNotionBinding();return binding?{binding,version:'consent-1'}:null;},read:(request,signal)=>collectServicePage(readers,request,signal),now:()=>now/1000});
 let sync=make();
 createServicePresets({ledger:()=>ledger}).handle({operation:'save',preset:{id:'selected-page',name:'Selected page',provider:'notion',read:{operation:'read',id:PAGE}}});
 const enable=()=>sync.handle({operation:'configure',id:'selected-page',enabled:true,intervalMinutes:30});
 assert.throws(enable,/Connect this Service/);
 const signIn=()=>mcp.connect('notion','','',()=>false,()=>{});
 await signIn();
 assert.equal(registrations[0].client_name,'Worldlet');assert.equal(registrations[0].token_endpoint_auth_method,'none');
 const query=new URL(opened[0]).searchParams;
 assert.deepEqual(registrations[0].redirect_uris,[query.get('redirect_uri')]);
 assert.equal(crypto.createHash('sha256').update(exchanges[0].code_verifier).digest('base64url'),query.get('code_challenge'));
 assert.ok(values.has('mcp:notion'));assert.equal(agentHomes,0);
 assert.equal(await sync.tick(),false,'OAuth alone does not start collection');
 enable();assert.equal(await sync.tick(),true);assert.deepEqual(fetches,[PAGE]);
 const saved=sync.notionContext({operation:'fetch',id:PAGE});assert.equal(saved.page.markdown,markdown);assert.ok(saved.collectedAt);
 assert.ok(!JSON.stringify(saved).includes('synthetic-access'),'provider credentials never enter saved context');
 // Restart reads persisted context without any provider request. Unknown IDs do not trigger a provider read.
 sync.stop();ledger.close();ledger=new WorldLedger(path.join(dir,'world'));sync=make();offline=true;
 const count=providerCalls;assert.equal(sync.notionContext({operation:'fetch',id:PAGE}).page.markdown,markdown);
 assert.throws(()=>sync.notionContext({operation:'fetch',id:OTHER}),/not been collected/);assert.equal(providerCalls,count);
 // The existing World tool authorization/ticket/result chain consumes saved records only.
 const google=new GoogleSource({account:new GoogleAccount({folder:path.join(dir,'google'),vault,clientFile:()=>null,adoptFrom:()=>[]}),development:false,openExternal:async()=>{},ownProfile:()=>null,legacyHomes:()=>[],notion:{connected:()=>true,read:async body=>sync.notionContext(body)}});
 const events:string[]=[];
 const agentRead=await google.tool('read_world_source',{provider:'notion',id:PAGE},async event=>{events.push(event.name);return event.name==='_source_begin'?{ticket:'synthetic-ticket'}:{ok:true};},()=>false);
 assert.equal(agentRead.records[0].text,markdown);assert.match(agentRead.scope,/Saved World context/);
 assert.deepEqual(events,['_world_authorize','_source_begin','_source_result']);assert.equal(providerCalls,count,'Agent read never polls the provider');
 await assert.rejects(google.tool('read_world_source',{provider:'notion',id:PAGE},async()=>({error:'denied'}),()=>false),/denied/);
 // Failure retains last-good; refresh stays in the World vault and does not change the collection binding.
 const binding=mcp.worldNotionBinding();now+=7200_000;assert.equal(await sync.tick(),false);
 assert.equal(mcp.worldNotionBinding(),binding);assert.equal(exchanges.at(-1).grant_type,'refresh_token');assert.equal(sync.notionContext({operation:'fetch',id:PAGE}).page.markdown,markdown);
 offline=false;now+=30_000;kind='database';assert.equal(await sync.tick(),false,'database contents are not implicitly traversed');
 kind='page';markdown='New context';now+=60_000;assert.equal(await sync.tick(),true);
 assert.equal(sync.notionContext({operation:'fetch',id:PAGE}).page.markdown,'New context');
 // A reauthorization invalidates earlier job bindings, even when the OAuth server reuses its client ID.
 await signIn();assert.notEqual(mcp.worldNotionBinding(),binding);assert.throws(()=>sync.notionContext({operation:'fetch',id:PAGE}),/not been collected/);
 enable();assert.equal(ledger.value('service-sync-snapshots','selected-page'),null);assert.equal(await sync.tick(),true);
 // A late refresh may not recreate a disconnected grant. A saved old session cannot read a replacement grant.
 now+=7200_000;let entered!:()=>void,release!:()=>void;const enteredPromise=new Promise<void>(r=>entered=r);
 refreshGate=()=>new Promise<void>(r=>{release=r;entered();});
 const pending=mcp.collectNotionPage(PAGE);await enteredPromise;accounts.disconnect('notion');release();await assert.rejects(pending,/authorization/);
 assert.equal(values.has('mcp:notion'),false);assert.equal(mcp.worldNotionBinding(),null);assert.equal(agentHomes,0);
 assert.equal(await sync.tick(),false);assert.throws(()=>sync.notionContext({operation:'fetch',id:PAGE}),/not been collected/);
 sync.stop();ledger.close();
});
console.log('PASS Notion World collection: mock official OAuth/PKCE/default scope, World-only vault, selected-page snapshots, SQLite restart, Agent reads without provider IO, retry, grant rotation and disconnect during refresh.');
