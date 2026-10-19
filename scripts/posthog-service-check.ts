// PostHog as a Worldlet Service (contracts/services.ts, context/connectors/services/posthog.ts, service-source.ts,
// `read_service`): against a fixture of PostHog's API, a pasted personal API key is checked with one read at the address
// and project the person gave before it is kept, and a refused one replaces nothing; `query` runs only one read-only
// HogQL SELECT and returns at most 200 rows; `read` pages insights, dashboards, feature flags and annotations; requests
// go only to the address given (no redirect, bounded size); a refused turn and an expired key stop the read; the Grant
// targets posthog/query and posthog/read are each enforced and in no default Grant; and the key is in no event, journal
// entry, receipt, result or message.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type {AgentIdentity,Grant} from '../contracts/agent-identity.ts';
import {POSTHOG_LIMITS,hogqlSelect,posthogHost} from '../context/connectors/index.ts';
import {channelDefaultGrants,standingActions,standingCallDecision} from '../agent/gate/grants.ts';
import {hermesChannelToolAllowed} from '../agent/gate/hermes-server.ts';
import {turnTrustObserve} from '../agent/gate/turn-trust.ts';
import {resolveAction,worldActionOf,worldActions} from '../agent/gate/gateway.ts';
import {APP_DEFINITIONS,SOURCE_PROVIDERS,connectSettings,connectToken} from '../context/applets/index.ts';
import {validateAppletRuntimes} from '../context/applets/runtime.ts';
import {ExecutionJournal} from '../platform/electron/src/modules/agents/journal.ts';
import {ServiceSource,ServiceSourceAccess,ServiceSourceConnections} from '../platform/electron/src/modules/sources/service-source.ts';
import {withTempDir} from './test-temp.ts';

const KEY='phx_'+'Fixture1'.repeat(5);
const HOST='https://eu.posthog.com',PROJECT='12345';
type Call={method:string;url:string;auth:string;body?:any};

await withTempDir('worldlet-posthog-service-',async temp=>{
 const values=new Map<string,string>();
 const vault={get:(id:string)=>values.get(id)??null,set:(id:string,value:string)=>{values.set(id,value);},delete:(id:string)=>{values.delete(id);},deleteAll:()=>values.clear()};
 const home=path.join(temp,'hermes');fs.mkdirSync(home,{recursive:true});
 const journal:any[]=[];
 ExecutionJournal.register(home,true,entry=>{journal.push(entry);return true;});
 const calls:Call[]=[];
 let accepted=KEY,rows=250,huge=false,redirect=false;
 const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
 const fixture=async(input:any,init:any={}):Promise<Response>=>{
  const url=new URL(String(input)),auth=String(init.headers?.authorization??'');
  calls.push({method:init.method??'GET',url:url.href,auth,...init.body?{body:JSON.parse(init.body)}:{}});
  assert.equal(init.redirect,'manual','redirects are never followed');
  if(url.origin!==HOST)return new Response('',{status:404});
  if(auth!=='Bearer '+accepted)return json({type:'authentication_error',detail:'Invalid personal API key.'},401);
  if(redirect)return new Response('',{status:302,headers:{location:'https://elsewhere.example.com/api/'}});
  if(url.pathname==='/api/projects/'+PROJECT+'/')return json({id:Number(PROJECT),name:'Example app',api_token:'phc_public'});
  if(!url.pathname.startsWith('/api/projects/'+PROJECT+'/'))return json({detail:'Not found.'},404);
  const route=url.pathname.slice(('/api/projects/'+PROJECT).length);
  if(route==='/query/'){
   const query=JSON.parse(init.body).query.query as string;
   if(query.includes("event = '$exception'"))return json({columns:['issue','types','message','occurrences','people','first_seen','last_seen'],results:[
    ['0190-aaaa','["TypeError"]','["Cannot read x of undefined in /Users/alex/app.js for alex@example.com"]',42,'5',new Date(Date.now()-3600_000).toISOString(),new Date().toISOString()],
    ['0190-bbbb','["Error"]','["Error (timeout)"]',1,1,'2026-01-01T00:00:00Z','2026-01-02T00:00:00Z'],
    ['fp:client-made','["Error"]','["spoofed"]',999,1,'2026-01-01T00:00:00Z','2026-01-02T00:00:00Z']]});
   if(query.includes('missing_field'))return json({type:'validation_error',detail:'Unable to resolve field: missing_field'},400);
   if(query.includes('narrow'))return json({columns:['event'],results:Array.from({length:rows},(_,i)=>[`event_${i}`])});
   if(huge)return new Response('{"results":['+'"x",'.repeat(700_000)+'"x"]}',{headers:{'content-type':'application/json'}});
   const columns=['event','count',...Array.from({length:40},(_,i)=>`extra_${i}`)];
   return json({columns,hasMore:false,results:Array.from({length:rows},(_,i)=>[i===0?'y'.repeat(1000):`event_${i}`,i,...Array.from({length:40},()=>({nested:true}))])});
  }
  const offset=Number(url.searchParams.get('offset')??0),limit=Number(url.searchParams.get('limit'));
  const page=(all:any[])=>json({count:all.length,next:offset+limit<all.length?url.href.replace(/offset=\d+/,'offset='+(offset+limit)):null,results:all.slice(offset,offset+limit+5)});
  if(route==='/insights/')return page(Array.from({length:130},(_,i)=>({id:i+1,short_id:`ins${i+1}`,name:i===0?'':`Signups ${i+1}`,derived_name:'Pageview count',description:'d'.repeat(900),favorited:i===1,tags:['growth'],last_modified_at:'2026-10-14T09:00:00Z',created_by:{email:'alex@example.com',first_name:'Alex'}})));
  if(route==='/feature_flags/')return page([{id:7,key:'new-onboarding',name:'New onboarding',active:true,filters:{groups:[{properties:[],rollout_percentage:30}]},created_by:{email:'alex@example.com'}},{id:8,key:'beta',active:false,filters:{groups:[{},{}],multivariate:{variants:[]}}}]);
  if(route==='/dashboards/')return page([{id:3,name:'Product',description:'KPIs',pinned:true,created_at:'2026-09-01T00:00:00Z'}]);
  if(route==='/annotations/')return page([{id:5,content:'Launched v2',date_marker:'2026-10-01T00:00:00Z',scope:'project',created_by:{email:'alex@example.com'}}]);
  return json({detail:'Not found.'},404);
 };
 const source=new ServiceSource({vault,fetch:fixture as typeof fetch});
 const access=new ServiceSourceAccess(source,()=>({run:async()=>({delegated:true}),steer:async()=>false,cancel(){}}));
 const events:any[]=[];
 const turn=async(event:any):Promise<Record<string,unknown>>=>{events.push(event);return {ok:true};};
 const read=(args:Record<string,unknown>,onEvent=turn)=>access.run({action:'sourceTool',name:'read_service',args},home,onEvent);
 const links=new ServiceSourceConnections(source,()=>{throw Error('PostHog is read here, not by another connection owner');},()=>'hermes');
 const connected:any[]=[],stages:unknown[]=[];
 const connect=(token:string,settings:Record<string,string>)=>links.connect({provider:'posthog',target:'',endpoint:'',token,settings,home,onStage:(...stage)=>stages.push(stage),onConnected:c=>connected.push(c)});
 const errors:string[]=[];
 const failing=async(work:Promise<unknown>,pattern:RegExp,label?:string)=>{const error=await work.then(()=>null,(e:Error)=>e);assert.ok(error,'refused: '+(label??pattern));errors.push(error!.message);assert.match(error!.message,pattern,label);};

 // Not connected: the read says to connect, before any request.
 await failing(read({provider:'posthog',operation:'query',query:'SELECT 1'}),/Connect PostHog first/);
 assert.equal(calls.length,0);

 // Settings are checked before anything is sent: HTTPS, the address alone, a numeric project.
 for(const [settings,pattern] of [[{host:'http://eu.posthog.com',project:PROJECT},/starting with https:\/\//],[{host:'https://eu.posthog.com/project/1',project:PROJECT},/address on its own/],
  [{host:'https://alex:pw@eu.posthog.com',project:PROJECT},/address on its own/],[{host:HOST,project:'abc'},/project ID/],[{host:HOST,project:'0'},/project ID/]] as const)
  await failing(connect(KEY,settings),pattern,JSON.stringify(settings));
 assert.equal(calls.length,0);assert.equal(values.size,0);

 // A key PostHog refuses is not kept, says so plainly and repeats nothing.
 accepted='phx_other';
 await failing(connect(KEY,{host:HOST,project:PROJECT}),/^PostHog did not accept this key\. .*personal API key/);
 assert.equal(values.size,0);assert.deepEqual(connected,[]);
 accepted=KEY;
 // A project PostHog does not have there: nothing kept.
 await failing(connect(KEY,{host:HOST,project:'999'}),/no such project at this address/);
 assert.equal(values.size,0);
 // The key is checked with one read of the project at the address given, then kept in the vault; ingestion addresses
 // mean their Cloud.
 calls.length=0;
 await connect(KEY,{host:'eu.i.posthog.com',project:PROJECT});
 assert.deepEqual(calls.map(c=>[c.method,c.url,c.auth]),[['GET',HOST+'/api/projects/12345/','Bearer '+KEY]]);
 assert.deepEqual(connected,[{provider:'posthog',target:'PostHog',transport:'hermes',connector:'service'}]);
 assert.deepEqual(JSON.parse(values.get('service:posthog')!),{v:1,settings:{host:HOST,project:PROJECT},token:KEY});
 assert.deepEqual(stages,[],'a key opens no browser and sends no stage event');
 assert.equal(posthogHost('app.posthog.com'),'https://us.posthog.com');assert.equal(posthogHost('https://posthog.example.com/'),'https://posthog.example.com');
 // A later refused paste replaces nothing.
 const kept=values.get('service:posthog');
 await failing(connect('phx_'+'Refused00'.repeat(4),{host:HOST,project:PROJECT}),/did not accept this key/);
 assert.equal(values.get('service:posthog'),kept,'the working key is kept');
 assert.deepEqual(await access.run({action:'sourceRefresh',provider:'posthog'},home),{ok:true,status:'connected'});
 // What the host's `connect` accepts: a key shaped like one (not a project key), and exactly PostHog's two settings.
 assert.equal(connectToken('posthog','  '+KEY+' '),KEY);
 assert.match((()=>{try{connectToken('posthog','phc_'+'a'.repeat(30));return '';}catch(e){return (e as Error).message;}})(),/project API key.*starts with phx_/);
 assert.deepEqual(connectSettings('posthog',{host:' eu.posthog.com ',project:'12345'}),{host:'eu.posthog.com',project:'12345'});
 assert.throws(()=>connectSettings('posthog',{host:HOST},KEY),/Enter the Project ID/);
 // With no key PostHog signs in: only a choice made after signing in is taken.
 assert.equal(connectToken('posthog',''),'');
 assert.deepEqual(connectSettings('posthog',{project:'2'}),{project:'2'});
 assert.deepEqual(connectSettings('posthog',undefined),{});
 assert.throws(()=>connectSettings('posthog',{host:HOST,project:'1',extra:'x'}),/does not take these settings/);
 assert.throws(()=>connectSettings('github',{host:HOST}),/does not take these settings/);
 assert.deepEqual(connectSettings('github',undefined),{});
 assert.ok(SOURCE_PROVIDERS.includes('posthog'));

 // query: one HogQL SELECT, sent as is, cut to 200 rows, 30 columns and short cells.
 calls.length=0;
 const result=await read({provider:'posthog',operation:'query',query:"SELECT event, count() FROM events WHERE event != 'delete me' GROUP BY event LIMIT 200;"});
 assert.deepEqual(events.at(-1).args,{name:'read_service',provider:'posthog',operation:'query'});
 assert.deepEqual(calls.map(c=>[c.method,c.url]),[['POST',HOST+'/api/projects/12345/query/']]);
 assert.deepEqual(calls[0].body,{query:{kind:'HogQLQuery',query:"SELECT event, count() FROM events WHERE event != 'delete me' GROUP BY event LIMIT 200"}});
 assert.equal(result.provider,'posthog');assert.equal(result.operation,'query');
 assert.ok(result.records.length<=POSTHOG_LIMITS.rows);
 assert.match(result.scope,/more rows were left out/);
 const first=result.records[0];
 assert.equal(Object.keys(first.fields).length,POSTHOG_LIMITS.columns);
 assert.equal([...first.fields.event].length,POSTHOG_LIMITS.cell);assert.equal([...first.title].length,POSTHOG_LIMITS.title);
 assert.equal(first.url,HOST+'/project/12345/sql');assert.equal(result.records[1].fields.count,1);
 assert.ok(JSON.stringify(result.records.map((r:any)=>r.fields)).length<=POSTHOG_LIMITS.text+result.records.length*2);
 // Short rows: the row cap itself.
 const capped=await read({provider:'posthog',operation:'query',query:'SELECT event AS narrow FROM events LIMIT 200'});
 assert.equal(capped.records.length,POSTHOG_LIMITS.rows);assert.match(capped.scope,/200 rows, at most 200 · more rows were left out/);
 assert.deepEqual(capped.records[199],{id:'row/200',title:'event_199',url:HOST+'/project/12345/sql',fields:{event:'event_199'}});
 rows=150;
 const fewer=await read({provider:'posthog',operation:'query',query:'select event from events limit 150'});
 assert.ok(fewer.records.length>0&&fewer.records.length<=150);
 // Anything but one read-only SELECT is refused before PostHog is asked.
 calls.length=0;
 for(const [query,pattern] of [['INSERT INTO events VALUES (1)',/Only a read-only SELECT/],['DELETE FROM events WHERE 1',/Only a read-only SELECT/],['ALTER TABLE events DELETE WHERE 1',/Only a read-only SELECT/],
  ['SELECT 1; DROP TABLE events',/one query at a time/],['SELECT 1 -- note',/comments/],['SELECT /* x */ 1',/comments/],['SELECT * FROM events LIMIT 500',/at most 200 rows/],
  ['SELECT * FROM events LIMIT 10, 1000',/at most 200 rows/],['SELECT * FROM events LIMIT ALL',/at most 200 rows/],["SELECT 'open",/Close every quoted string/],
  ['WITH x AS (SELECT 1) INSERT INTO t SELECT * FROM x',/contains INSERT/],['SHOW TABLES',/Only a read-only SELECT/],['  ',/one HogQL SELECT/]] as const)
  await failing(read({provider:'posthog',operation:'query',query}),pattern,query);
 await failing(read({provider:'posthog',operation:'query',query:'S'.repeat(4001)}),/Invalid arguments for read_service/);
 await failing(read({provider:'posthog',operation:'query',query:'SELECT 1',cursor:'2'}),/takes only the query/);
 await failing(read({provider:'posthog',operation:'list'}),/no list read/);
 assert.equal(calls.length,0);
 assert.equal(hogqlSelect('WITH t AS (SELECT 1 AS n) SELECT n FROM t'),'WITH t AS (SELECT 1 AS n) SELECT n FROM t');
 // PostHog's own reason for a query it cannot run comes back, short.
 await failing(read({provider:'posthog',operation:'query',query:'SELECT missing_field FROM events'}),/could not run this read\. PostHog said: Unable to resolve field: missing_field/);
 // More than Worldlet reads at once is stopped.
 huge=true;
 await failing(read({provider:'posthog',operation:'query',query:'SELECT event FROM events'}),/sent more than Worldlet reads at once/);
 huge=false;

 // read: a page of a list, only describing fields (never who made it), paged by cursor up to five pages.
 calls.length=0;
 const insights=await read({provider:'posthog',operation:'read',id:'insights'});
 assert.equal(new URL(calls[0].url).search,'?limit=20&offset=0&basic=true');
 assert.equal(insights.records.length,POSTHOG_LIMITS.pageSize,'a server that sends more is cut to the page');
 assert.equal(insights.cursor,'2');
 assert.deepEqual(insights.records[0],{id:'insight/ins1',title:'Pageview count',url:HOST+'/project/12345/insights/ins1',updatedAt:'2026-10-14T09:00:00Z',fields:{kind:'insight',description:'d'.repeat(POSTHOG_LIMITS.description-1)+'…',tags:'growth'}});
 assert.equal(insights.records[1].fields.favorited,true);
 const later=await read({provider:'posthog',operation:'read',id:'insights',query:'Signups',cursor:'5'});
 assert.equal(new URL(calls.at(-1)!.url).search,'?limit=20&offset=80&basic=true&search=Signups');
 assert.equal(later.cursor,undefined,'no page past the fifth');
 const flags=await read({provider:'posthog',operation:'read',id:'feature-flags'});
 assert.deepEqual(flags.records.map((r:any)=>[r.id,r.title,r.fields]),[['feature-flag/7','new-onboarding',{kind:'feature flag',active:true,name:'New onboarding',conditions:1,rolloutPercentage:30}],['feature-flag/8','beta',{kind:'feature flag',active:false,conditions:2,multivariate:true}]]);
 assert.equal(flags.cursor,undefined);
 assert.equal((await read({provider:'posthog',operation:'read',id:'dashboards'})).records[0].url,HOST+'/project/12345/dashboard/3');
 const notes=await read({provider:'posthog',operation:'read',id:'annotations'});
 assert.deepEqual(notes.records[0].fields,{kind:'annotation',date:'2026-10-01T00:00:00Z',scope:'project'});
 // Errors: one fixed read; PostHog's own groups only, the loudest first, personal text in error messages replaced.
 const errorsRead=await read({provider:'posthog',operation:'read',id:'errors'});
 assert.match((calls.at(-1)!.body as any).query.query,/^SELECT toString\(properties\.\$exception_issue_id\)/);
 assert.deepEqual(errorsRead.records.map((r:any)=>[r.id,r.fields.occurrences,r.fields.people,r.fields.new]),[['error/0190-aaaa',42,5,true],['error/0190-bbbb',1,1,false]],'a client fingerprint is never a group');
 assert.equal(errorsRead.records[0].title,'Cannot read x of undefined in /Users/[name]/app.js for [email]');
 assert.equal(errorsRead.records[0].url,HOST+'/project/12345/error_tracking/0190-aaaa');
 assert.equal(errorsRead.records[0].fields.type,'TypeError');
 await failing(read({provider:'posthog',operation:'read',id:'errors',query:'timeout'}),/take no filter or cursor/);
 for(const page of [insights,flags,notes])assert.ok(!JSON.stringify(page).includes('alex@example.com'),'who made it is left out');
 calls.length=0;
 await failing(read({provider:'posthog',operation:'read',id:'persons'}),/Read one PostHog list: insights, dashboards, feature-flags, annotations, errors/);
 await failing(read({provider:'posthog',operation:'read',id:'insights',cursor:'6'}),/Invalid PostHog cursor/);
 await failing(read({provider:'posthog',operation:'read',id:'insights',query:'q'.repeat(101)}),/name of up to 100/);
 assert.equal(calls.length,0);

 // Only the address given: a redirect elsewhere is refused, and a kept address that no longer passes is not used.
 redirect=true;
 await failing(read({provider:'posthog',operation:'read',id:'dashboards'}),/answered from another address.*only at https:\/\/eu\.posthog\.com/);
 redirect=false;
 assert.ok(calls.every(c=>new URL(c.url).origin===HOST),'every request went to the address given');
 const good=values.get('service:posthog')!;
 values.set('service:posthog',JSON.stringify({v:1,settings:{host:'http://eu.posthog.com',project:PROJECT},token:KEY}));
 calls.length=0;
 await failing(read({provider:'posthog',operation:'read',id:'dashboards'}),/Connect PostHog first/);
 assert.equal(calls.length,0);
 values.set('service:posthog',good);

 // A turn that does not authorize the read stops it before PostHog is asked.
 calls.length=0;
 await failing(read({provider:'posthog',operation:'query',query:'SELECT 1'},async()=>({error:'Allow private context first.'})),/Allow private context first/);
 assert.equal(calls.length,0);
 // An expired or revoked key says to connect again.
 accepted='phx_rotated';
 await failing(read({provider:'posthog',operation:'read',id:'dashboards'}),/PostHog is disconnected or its key has expired/);
 accepted=KEY;
 // Anything else goes on to the next runtime.
 assert.deepEqual(await access.run({action:'sourceTool',name:'read_service',args:{provider:'github',operation:'list'}},home,turn),{delegated:true});

 // Disconnect forgets the key.
 assert.deepEqual(await links.disconnect({provider:'posthog'},home),['posthog']);
 assert.equal(values.has('service:posthog'),false);

 // The key is in no event the turn saw, no journal entry, no receipt and no message.
 for(const [label,value] of [['events',events],['journal',journal],['receipts',connected],['errors',errors]] as const)
  assert.ok(!JSON.stringify(value).includes(KEY),'the key is not in the '+label);
 assert.ok(journal.length>0,'the reads were journaled');
});

// Grants: posthog/query and posthog/read are the targets; neither is in the default Grants.
const actions=worldActions();
for(const operation of ['query','read'])assert.deepEqual(worldActionOf(actions,'read_service',{provider:'posthog',operation}),{target:'posthog',action:operation});
assert.deepEqual(resolveAction(actions,'posthog','query',{query:'SELECT 1'}).args,{query:'SELECT 1',provider:'posthog',operation:'query'});
assert.deepEqual(actions.find(a=>a.target==='posthog'&&a.action==='query')!.parameters.required,['query']);
assert.deepEqual(actions.find(a=>a.target==='posthog'&&a.action==='read')!.parameters.required,['id']);
const targets=actions.filter(a=>a.tool==='read_service'&&a.defaults.provider==='posthog').map(a=>a.target+'/'+a.action);
assert.deepEqual(targets,['posthog/query','posthog/read','applet:posthog/query','applet:posthog/read']);
const now='2026-10-15T12:00:00.000Z';
const agent:AgentIdentity={id:'claude-code',name:'Claude Code',harness:'claude-code',kind:'local',createdAt:now};
const defaults=channelDefaultGrants(agent.id,now,actions);
assert.ok(defaults.every(g=>g.targets.every(t=>!targets.includes(t))),'read_service is in no default Grant');
assert.equal(hermesChannelToolAllowed({name:'read_service',args:{provider:'posthog'}}),false);
const decide=(grants:Grant[],operation:string)=>standingCallDecision({identity:agent,grants,target:'posthog',action:operation,tool:'read_service',args:{provider:'posthog',operation},foxTurn:null,now}).decision;
assert.equal(decide(defaults,'query'),'denied');assert.equal(decide(defaults,'read'),'denied');
const readOnly:Grant={id:'g1',agentId:agent.id,targets:['posthog/read'],access:'read',duration:'standing',grantedAt:now};
assert.equal(decide([...defaults,readOnly],'read'),'allowed');
assert.equal(decide([...defaults,readOnly],'query'),'denied');
assert.equal(decide([{...readOnly,id:'g2',targets:['posthog/*']}],'query'),'allowed');
assert.deepEqual(standingActions(actions,agent,[readOnly],false,now).map(a=>a.target+'/'+a.action),['posthog/read']);
// A PostHog read makes the turn untrusted, as any Service's does.
assert.equal(turnTrustObserve({},{type:'tool',name:'_world_authorize',args:{name:'read_service',provider:'posthog',operation:'query'}}).untrusted,true);

// The Applet: PostHog's website, connected with a pasted key, read only on demand (no Attention reader, no schedule).
const posthog=APP_DEFINITIONS.find(app=>app.key==='posthog')!;
assert.deepEqual(posthog.connection,{kind:'hermes',provider:'posthog',capability:'connect'});
assert.equal(posthog.attention,undefined);assert.equal(posthog.fullView?.kind,'web');
const [runtime]=validateAppletRuntimes([JSON.parse(fs.readFileSync(new URL('../ui/applets/posthog/runtime.json',import.meta.url),'utf8'))]);
assert.equal(runtime.mode,'on-demand');assert.equal(runtime.publishAttention,false);assert.equal(runtime.intervalMinutes,0);

console.log('PASS PostHog Service: a personal API key is checked with one read at the address and project given before it is kept and a refused one replaces nothing; query runs one read-only HogQL SELECT, at most 200 rows, and refuses anything else; read pages insights, dashboards, feature flags and annotations and reads the error groups; only the address given, no redirect, bounded size; refused turn and expired key stop the read; posthog/query and posthog/read enforced and in no default Grant; the key is in no event, journal entry, receipt or message');
