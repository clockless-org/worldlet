// Cloudflare as a Worldlet Service, read only (contracts/services.ts, core/accounts/services/cloudflare.ts,
// service-source.ts, `read_service`): against a fixture of Cloudflare's API, a pasted API token is checked with one
// GraphQL read for the account ID given before it is kept, and a refused one replaces nothing; `read` runs only the
// fixed reports (Workers invocations and errors, requests per zone, over the last 24 hours), bounded; requests go only
// to Cloudflare's API address; a refused turn and an expired token stop the read; the Grant target cloudflare/read is
// enforced and in no default Grant; and the token is in no event, journal entry, receipt, result or message.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type {AgentIdentity,Grant} from '../contracts/agent-identity.ts';
import {CLOUDFLARE_LIMITS,readCloudflare} from '../core/accounts/index.ts';
import {channelDefaultGrants,standingActions,standingCallDecision} from '../core/agent/grants.ts';
import {turnTrustObserve} from '../core/agent/turn-trust.ts';
import {worldActionOf,worldActions} from '../core/tools/gateway.ts';
import {APP_DEFINITIONS,SOURCE_PROVIDERS,TOKEN_PROVIDERS,connectSettings,connectToken} from '../core/applets/index.ts';
import {validateAppletRuntimes} from '../core/applets/runtime.ts';
import {ExecutionJournal} from '../platform/electron/src/modules/agent-runtime/journal.ts';
import {ServiceSource,ServiceSourceAccess,ServiceSourceConnections} from '../platform/electron/src/modules/sources/service-source.ts';
import {withTempDir} from './test-temp.ts';

const TOKEN='Fixture_'+'cf1'.repeat(11);
const ACCOUNT='0123456789abcdef0123456789abcdef',API='https://api.cloudflare.com';
const zoneId=(i:number)=>String(i).padStart(32,'a');
type Call={method:string;url:string;auth:string;body?:any};

await withTempDir('worldlet-cloudflare-service-',async temp=>{
 const values=new Map<string,string>();
 const vault={get:(id:string)=>values.get(id)??null,set:(id:string,value:string)=>{values.set(id,value);},delete:(id:string)=>{values.delete(id);},deleteAll:()=>values.clear()};
 const home=path.join(temp,'hermes');fs.mkdirSync(home,{recursive:true});
 const journal:any[]=[];
 ExecutionJournal.register(home,true,entry=>{journal.push(entry);return true;});
 const calls:Call[]=[];
 let accepted=TOKEN;
 const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
 const fixture=async(input:any,init:any={}):Promise<Response>=>{
  const url=new URL(String(input)),auth=String(init.headers?.authorization??'');
  calls.push({method:init.method??'GET',url:url.href,auth,...init.body?{body:JSON.parse(init.body)}:{}});
  assert.equal(init.redirect,'manual','redirects are never followed');
  if(url.origin!==API)return new Response('',{status:404});
  if(auth!=='Bearer '+accepted)return json({success:false,errors:[{code:10000,message:'Authentication error'}]},401);
  if(url.pathname==='/client/v4/zones'){
   assert.equal(url.searchParams.get('account.id'),ACCOUNT);
   return json({success:true,result:[...Array.from({length:25},(_,i)=>({id:zoneId(i+1),name:`site${i+1}.example.com`,account:{id:ACCOUNT}})),{id:'bad',name:'x'}]});
  }
  if(url.pathname!=='/client/v4/graphql')return json({success:false},404);
  const {query,variables}=JSON.parse(init.body);
  if(variables.account&&variables.account!==ACCOUNT)return json({data:{viewer:{accounts:[]}},errors:null});
  if(query.startsWith('query Check'))return json({data:{viewer:{accounts:[{workersInvocationsAdaptive:[]}]}},errors:null});
  if(query.startsWith('query Workers'))return json({data:{viewer:{accounts:[{workersInvocationsAdaptive:[
   ...Array.from({length:30},(_,i)=>({dimensions:{scriptName:`worker-${i}`},sum:{requests:1000-i,errors:i,subrequests:5},quantiles:{cpuTimeP50:1234,cpuTimeP99:56789}})),
   {dimensions:{scriptName:'../evil'},sum:{requests:1}}]}]}},errors:null});
  if(query.startsWith('query Zones')){
   assert.ok(variables.zones.length<=CLOUDFLARE_LIMITS.zones);
   return json({data:{viewer:{zones:variables.zones.map((tag:string,i:number)=>({zoneTag:tag,httpRequests1hGroups:Array.from({length:24},()=>({sum:{requests:10*(i+1),cachedRequests:5*(i+1),threats:i===0?1:0,bytes:100}}))}))}},errors:null});
  }
  return json({data:null,errors:[{message:'unknown field'}]});
 };
 const source=new ServiceSource({vault,fetch:fixture as typeof fetch});
 const access=new ServiceSourceAccess(source,()=>({run:async()=>({delegated:true}),steer:async()=>false,cancel(){}}));
 const events:any[]=[];
 const turn=async(event:any):Promise<Record<string,unknown>>=>{events.push(event);return {ok:true};};
 const read=(args:Record<string,unknown>,onEvent=turn)=>access.run({action:'sourceTool',name:'read_service',args},home,onEvent);
 const links=new ServiceSourceConnections(source,()=>{throw Error('Cloudflare is read here');},()=>'hermes');
 const connected:any[]=[],stages:unknown[]=[],errors:string[]=[];
 const connect=(token:string,settings:Record<string,string>)=>links.connect({provider:'cloudflare',target:'',endpoint:'',token,settings,home,onStage:(...stage)=>stages.push(stage),onConnected:c=>connected.push(c)});
 const failing=async(work:Promise<unknown>,pattern:RegExp,label?:string)=>{const error=await work.then(()=>null,(e:Error)=>e);assert.ok(error,'refused: '+(label??pattern));errors.push(error!.message);assert.match(error!.message,pattern,label);};

 await failing(read({provider:'cloudflare',operation:'read',id:'workers'}),/Connect Cloudflare first/);
 assert.equal(calls.length,0);
 // The account ID is checked before anything is sent.
 for(const account of ['','acme','0123456789abcdef0123456789abcdeg',ACCOUNT+'0'])await failing(connect(TOKEN,{account}),/Cloudflare account ID/,account);
 assert.equal(calls.length,0);
 // A refused token or another account: nothing kept, nothing repeated.
 accepted='other';
 await failing(connect(TOKEN,{account:ACCOUNT}),/^Cloudflare did not accept this token\. .*Account Analytics Read/);
 accepted=TOKEN;
 await failing(connect(TOKEN,{account:'f'.repeat(32)}),/no such account for this token/);
 assert.equal(values.size,0);assert.deepEqual(connected,[]);
 // One GraphQL read for the account, then the token is kept with it.
 calls.length=0;
 await connect(TOKEN,{account:ACCOUNT.toUpperCase()});
 assert.deepEqual(calls.map(c=>[c.method,c.url,c.auth]),[['POST',API+'/client/v4/graphql','Bearer '+TOKEN]]);
 assert.equal(calls[0].body.variables.account,ACCOUNT);
 assert.deepEqual(connected,[{provider:'cloudflare',target:'Cloudflare',transport:'hermes',connector:'service'}]);
 assert.deepEqual(JSON.parse(values.get('service:cloudflare')!),{v:1,settings:{account:ACCOUNT},token:TOKEN});
 assert.deepEqual(stages,[]);
 const kept=values.get('service:cloudflare');
 accepted='nope';await failing(connect('Refused_'+'x'.repeat(32),{account:ACCOUNT}),/did not accept this token/);accepted=TOKEN;
 assert.equal(values.get('service:cloudflare'),kept,'the working token is kept');
 assert.deepEqual(await access.run({action:'sourceRefresh',provider:'cloudflare'},home),{ok:true,status:'connected'});
 assert.equal(connectToken('cloudflare',' '+TOKEN+' '),TOKEN);
 assert.throws(()=>connectToken('cloudflare','0123456789abcdef0123456789abcdef01234'),/Global API Key/);
 assert.deepEqual(connectSettings('cloudflare',{account:' '+ACCOUNT}),{account:ACCOUNT});
 assert.throws(()=>connectSettings('cloudflare',{account:ACCOUNT,host:'x'}),/does not take these settings/);
 assert.ok(SOURCE_PROVIDERS.includes('cloudflare'));assert.equal(TOKEN_PROVIDERS.cloudflare.fields!.length,1);

 // workers: the busiest Workers over the last 24 whole hours, bounded, with error rate and CPU time.
 calls.length=0;
 const workers=await read({provider:'cloudflare',operation:'read',id:'workers'});
 assert.deepEqual(events.at(-1).args,{name:'read_service',provider:'cloudflare',operation:'read'});
 assert.equal(calls.length,1);
 const {since,until}=calls[0].body.variables;
 assert.equal(Date.parse(until)-Date.parse(since),24*3_600_000);assert.equal(Date.parse(until)%3_600_000,0);
 assert.equal(workers.records.length,CLOUDFLARE_LIMITS.workers);
 assert.deepEqual(workers.records[1],{id:'worker/worker-1',title:'worker-1',url:`https://dash.cloudflare.com/${ACCOUNT}/workers/services/view/worker-1/production/metrics`,
  fields:{kind:'worker',requests:999,errors:1,errorRatePercent:0.1,subrequests:5,cpuTimeP50Ms:1.23,cpuTimeP99Ms:56.79}});
 assert.match(workers.scope,/last|from .* to .*Read only/);
 // zones: active zones of this account only, each its requests summed over the hours, busiest first.
 calls.length=0;
 const zones=await read({provider:'cloudflare',operation:'read',id:'zones'});
 assert.deepEqual(calls.map(c=>[c.method,new URL(c.url).pathname]),[['GET','/client/v4/zones'],['POST','/client/v4/graphql']]);
 assert.equal(zones.records.length,CLOUDFLARE_LIMITS.zones);
 assert.deepEqual(zones.records.at(-1),{id:'zone/site1.example.com',title:'site1.example.com',url:`https://dash.cloudflare.com/${ACCOUNT}/site1.example.com/analytics/traffic`,
  fields:{kind:'zone',requests:240,cachedRequests:120,threats:24,bytes:2400,cachedPercent:50}});
 assert.equal(zones.records[0].fields.requests,4800);
 // Nothing else: no other report, no query, no cursor, no other operation, before Cloudflare is asked.
 calls.length=0;
 await failing(read({provider:'cloudflare',operation:'read',id:'dns'}),/workers or zones/);
 await failing(read({provider:'cloudflare',operation:'read',id:'workers',query:'{viewer{accounts{}}}'}),/takes only which one/);
 await failing(read({provider:'cloudflare',operation:'read',id:'workers',cursor:'2'}),/takes only which one/);
 await failing(read({provider:'cloudflare',operation:'query',query:'SELECT 1'}),/no query read/);
 await failing(read({provider:'cloudflare',operation:'list'}),/no list read/);
 assert.equal(calls.length,0);
 assert.ok(journal.every(e=>!JSON.stringify(e).includes('mutation')));
 // A refused turn, an expired token.
 await failing(read({provider:'cloudflare',operation:'read',id:'workers'},async()=>({error:'Allow private context first.'})),/Allow private context first/);
 assert.equal(calls.length,0);
 accepted='rotated';
 await failing(read({provider:'cloudflare',operation:'read',id:'zones'}),/Cloudflare is disconnected or its token has expired/);
 accepted=TOKEN;
 // A GraphQL error comes back short.
 await failing(readCloudflare({get:async()=>({}),post:async()=>({errors:[{message:'quota exceeded for '+'x'.repeat(400)}]})},{account:ACCOUNT},{operation:'read',id:'workers'}),/Cloudflare said: quota exceeded/);
 assert.ok(calls.every(c=>new URL(c.url).origin===API),'every request went to Cloudflare\'s API address');
 assert.deepEqual(await links.disconnect({provider:'cloudflare'},home),['cloudflare']);
 assert.equal(values.has('service:cloudflare'),false);
 for(const [label,value] of [['events',events],['journal',journal],['receipts',connected],['errors',errors],['results',[workers,zones]]] as const)
  assert.ok(!JSON.stringify(value).includes(TOKEN),'the token is not in the '+label);
});

// Grants: cloudflare/read is the target, in no default Grant.
const actions=worldActions();
assert.deepEqual(worldActionOf(actions,'read_service',{provider:'cloudflare',operation:'read'}),{target:'cloudflare',action:'read'});
assert.deepEqual(actions.find(a=>a.target==='cloudflare'&&a.action==='read')!.parameters.required,['id']);
const targets=actions.filter(a=>a.tool==='read_service'&&a.defaults.provider==='cloudflare').map(a=>a.target+'/'+a.action);
assert.deepEqual(targets,['cloudflare/read','applet:cloudflare/read']);
const now='2026-10-15T12:00:00.000Z';
const agent:AgentIdentity={id:'codex',name:'Codex',harness:'codex',kind:'local',createdAt:now};
const defaults=channelDefaultGrants(agent.id,now,actions);
assert.ok(defaults.every(g=>g.targets.every(t=>!targets.includes(t))),'cloudflare/read is in no default Grant');
const decide=(grants:Grant[])=>standingCallDecision({identity:agent,grants,target:'cloudflare',action:'read',tool:'read_service',args:{provider:'cloudflare',operation:'read',id:'workers'},foxTurn:null,now}).decision;
assert.equal(decide(defaults),'denied');
const grant:Grant={id:'g1',agentId:agent.id,targets:['cloudflare/read'],access:'read',duration:'standing',grantedAt:now};
assert.equal(decide([...defaults,grant]),'allowed');
assert.deepEqual(standingActions(actions,agent,[grant],false,now).map(a=>a.target+'/'+a.action),['cloudflare/read']);
assert.equal(turnTrustObserve({},{type:'tool',name:'_world_authorize',args:{name:'read_service',provider:'cloudflare',operation:'read'}}).untrusted,true);

// The Applet: Cloudflare's dashboard, connected with a pasted token, read only on demand.
const cloudflare=APP_DEFINITIONS.find(app=>app.key==='cloudflare')!;
assert.deepEqual(cloudflare.connection,{kind:'hermes',provider:'cloudflare',capability:'connect'});
assert.equal(cloudflare.attention,undefined);
const [runtime]=validateAppletRuntimes([JSON.parse(fs.readFileSync(new URL('../ui/applets/cloudflare/runtime.json',import.meta.url),'utf8'))]);
assert.equal(runtime.mode,'on-demand');assert.equal(runtime.publishAttention,false);

console.log('PASS Cloudflare Service: an API token is checked with one GraphQL read for the account given before it is kept and a refused one replaces nothing; read runs only the Workers and zones reports over the last 24 hours, bounded; only Cloudflare\'s API address; refused turn and expired token stop the read; cloudflare/read enforced and in no default Grant; the token is in no event, journal entry, receipt, result or message');
