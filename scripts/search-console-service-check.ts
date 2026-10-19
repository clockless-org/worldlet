// Google Search Console as a Worldlet Service, read only (contracts/services.ts, context/accounts/services/search-console.ts,
// service-source.ts, `read_service`): against fixtures of Google's token address and the Search Console API, a pasted
// service account key is checked before anything is sent and a refused one replaces nothing; the host signs an RS256
// assertion with the read-only Search Console scope that verifies with the key's public half, sends it only to Google's
// token address, and keeps the access token in memory until a minute before it expires; `list` returns the sites and
// `query` one bounded Search Analytics query; requests go only to the API address; a refused turn and a revoked key stop
// the read; the Grant targets are enforced and in no default Grant; presets and the board take its reads; and neither
// the private key nor an access token is in any event, journal entry, receipt, result, message or the vault's settings.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {AgentIdentity,Grant} from '../contracts/agent-identity.ts';
import {GOOGLE_TOKEN_URL,SEARCH_CONSOLE_LIMITS,SEARCH_CONSOLE_SCOPE,readServicePresetRead,saveServicePreset,searchConsoleSpec} from '../context/accounts/index.ts';
import {channelDefaultGrants,serviceReadTargets,standingActions,standingCallDecision} from '../agent/agent/grants.ts';
import {turnTrustObserve} from '../agent/agent/turn-trust.ts';
import {worldActionOf,worldActions} from '../agent/tools/gateway.ts';
import {SOURCE_PROVIDERS,TOKEN_PROVIDERS,connectSettings,connectToken} from '../context/applets/index.ts';
import {resolveBoard,readBoardDefinition} from '../context/board/index.ts';
import {SERVICE_TITLES,type ServiceRecords} from '../contracts/services.ts';
import {ExecutionJournal} from '../platform/electron/src/modules/agent-runtime/journal.ts';
import {ServiceSource,ServiceSourceAccess,ServiceSourceConnections} from '../platform/electron/src/modules/sources/service-source.ts';
import {withTempDir} from './test-temp.ts';

const API='https://www.googleapis.com',EMAIL='reader@example-project.iam.gserviceaccount.com',KEY_ID='0123456789abcdef0123456789abcdef01234567';
// A key made for this run only: nothing to commit, nothing to leak.
const pair=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
const PEM=pair.privateKey.export({type:'pkcs8',format:'pem'}).toString();
const KEY_FILE=JSON.stringify({type:'service_account',project_id:'example-project',private_key_id:KEY_ID,private_key:PEM,client_email:EMAIL,client_id:'123',
 auth_uri:'https://accounts.google.com/o/oauth2/auth',token_uri:GOOGLE_TOKEN_URL,universe_domain:'googleapis.com'},null,2);
const PEM_BODY=PEM.split('\n')[1];
type Call={method:string;url:string;auth:string;body?:any};
const DAY=86_400_000,NOW=Date.parse('2026-10-17T15:30:00.000Z');

await withTempDir('worldlet-search-console-service-',async temp=>{
 const values=new Map<string,string>();
 const vault={get:(id:string)=>values.get(id)??null,set:(id:string,value:string)=>{values.set(id,value);},delete:(id:string)=>{values.delete(id);},deleteAll:()=>values.clear()};
 const home=path.join(temp,'hermes');fs.mkdirSync(home,{recursive:true});
 const journal:any[]=[];
 ExecutionJournal.register(home,true,entry=>{journal.push(entry);return true;});
 const calls:Call[]=[],issued:string[]=[];
 let clock=NOW,refuseKey=false,revoked=new Set<string>();
 const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
 const fixture=async(input:any,init:any={}):Promise<Response>=>{
  const url=new URL(String(input)),auth=String(init.headers?.authorization??'');
  assert.equal(init.redirect,'manual','redirects are never followed');
  if(url.href===GOOGLE_TOKEN_URL){
   calls.push({method:init.method,url:url.href,auth,body:String(init.body)});
   assert.equal(init.method,'POST');assert.equal(auth,'','the token address gets no bearer token');
   assert.equal(init.headers['content-type'],'application/x-www-form-urlencoded');
   const form=new URLSearchParams(String(init.body));
   assert.deepEqual([...form.keys()],['grant_type','assertion']);
   assert.equal(form.get('grant_type'),'urn:ietf:params:oauth:grant-type:jwt-bearer');
   // The assertion: RS256, signed by the pasted key, read-only Search Console, for Google's token address, an hour.
   const [head,claims,signature]=form.get('assertion')!.split('.');
   assert.ok(crypto.verify('sha256',Buffer.from(head+'.'+claims),pair.publicKey,Buffer.from(signature,'base64url')),'the assertion verifies with the key\'s public half');
   assert.deepEqual(JSON.parse(Buffer.from(head,'base64url').toString()),{alg:'RS256',typ:'JWT',kid:KEY_ID});
   const iat=Math.floor(clock/1000);
   assert.deepEqual(JSON.parse(Buffer.from(claims,'base64url').toString()),{iss:EMAIL,scope:SEARCH_CONSOLE_SCOPE,aud:GOOGLE_TOKEN_URL,iat,exp:iat+3600});
   if(refuseKey)return json({error:'invalid_grant',error_description:'Invalid JWT Signature.'},400);
   const token='ya29.fixture-'+(issued.length+1)+'-'+'t'.repeat(20);issued.push(token);
   return json({access_token:token,expires_in:3599,token_type:'Bearer'});
  }
  calls.push({method:init.method??'GET',url:url.href,auth,...init.body?{body:JSON.parse(init.body)}:{}});
  if(url.origin!==API)return new Response('',{status:404});
  const token=auth.replace(/^Bearer /,'');
  if(!issued.includes(token)||revoked.has(token))return json({error:{code:401,message:'Request had invalid authentication credentials.'}},401);
  if(url.pathname==='/webmasters/v3/sites'&&init.method==='GET')return json({siteEntry:[
   {siteUrl:'sc-domain:example.com',permissionLevel:'siteFullUser'},{siteUrl:'https://www.example.com/',permissionLevel:'siteRestrictedUser'},
   {siteUrl:'javascript:alert(1)',permissionLevel:'siteOwner'},{siteUrl:'https://example.org/?x=1',permissionLevel:'siteOwner'},'junk']});
  const match=/^\/webmasters\/v3\/sites\/([^/]+)\/searchAnalytics\/query$/.exec(url.pathname);
  if(match&&init.method==='POST'){
   const site=decodeURIComponent(match[1]),body=JSON.parse(init.body);
   if(site!=='sc-domain:example.com')return json({error:{code:403,message:'User does not have sufficient permission for site.'}},403);
   if(body.dimensions.includes('country')&&body.dimensions.includes('device'))return json({error:{code:400,message:'Invalid dimension combination for '+'x'.repeat(400)}},400);
   if(!body.dimensions.length)return json({rows:[{clicks:1234,impressions:56789,ctr:0.021730,position:8.4567}],responseAggregationType:'auto'});
   if(body.dimensions[0]==='date')return json({rows:[3,1,2].map(d=>({keys:[`2026-10-0${d}`],clicks:10*d,impressions:100*d,ctr:0.1,position:5}))});
   return json({rows:[...Array.from({length:body.rowLimit+5},(_,i)=>({keys:body.dimensions.map((d:string)=>`${d}-${i}`),clicks:100-i,impressions:1000,ctr:(100-i)/1000,position:3.25})),{keys:[1],clicks:1}]});
  }
  return json({error:{code:404,message:'Not found'}},404);
 };
 const source=new ServiceSource({vault,fetch:fixture as typeof fetch,clock:()=>clock});
 const access=new ServiceSourceAccess(source,()=>({run:async()=>({delegated:true}),steer:async()=>false,cancel(){}}));
 const events:any[]=[];
 const turn=async(event:any):Promise<Record<string,unknown>>=>{events.push(event);return {ok:true};};
 const read=(args:Record<string,unknown>,onEvent=turn)=>access.run({action:'sourceTool',name:'read_service',args},home,onEvent);
 const links=new ServiceSourceConnections(source,()=>{throw Error('Search Console is read here');},()=>'hermes');
 const connected:any[]=[],errors:string[]=[];
 const connect=(token:string,settings:Record<string,string>={})=>links.connect({provider:'search-console',target:'',endpoint:'',token,settings,home,onStage:()=>{},onConnected:c=>connected.push(c)});
 const failing=async(work:Promise<unknown>,pattern:RegExp,label?:string)=>{const error=await work.then(()=>null,(e:Error)=>e);assert.ok(error,'refused: '+(label??pattern));errors.push(error!.message);assert.match(error!.message,pattern,label);};

 await failing(read({provider:'search-console',operation:'list'}),/Connect Search Console first/);
 assert.equal(calls.length,0);
 // The key is checked before anything is sent: JSON of a service account, a private key, Google's token address.
 const file=JSON.parse(KEY_FILE);
 for(const [label,paste,pattern] of [
  ['not JSON','not json at all',/whole JSON key of a Google service account/],
  ['an OAuth client',JSON.stringify({installed:{client_id:'x',client_secret:'y'}}),/OAuth client file/],
  ['another type',JSON.stringify({...file,type:'authorized_user'}),/whole JSON key/],
  ['no private key',JSON.stringify({...file,private_key:undefined}),/whole JSON key/],
  ['another email',JSON.stringify({...file,client_email:'alex@example.com'}),/whole JSON key/],
  ['another token address',JSON.stringify({...file,token_uri:'https://token.example.com/'}),/another token address/],
 ] as const)await failing(connect(paste),pattern,label);
 await failing(connect(KEY_FILE,{site:'sc-domain:example.com'}),/takes only the service account key/);
 assert.equal(calls.length,0);
 // A key Google refuses: nothing kept, nothing repeated.
 refuseKey=true;
 await failing(connect(KEY_FILE),/^Google did not accept this service account key\./);
 refuseKey=false;
 assert.equal(values.size,0);assert.deepEqual(connected,[]);
 // One token exchange and one read of the sites, then only the email, key and key ID are kept.
 calls.length=0;
 await connect(KEY_FILE);
 assert.deepEqual(calls.map(c=>[c.method,c.url,c.auth]),[['POST',GOOGLE_TOKEN_URL,''],['GET',API+'/webmasters/v3/sites','Bearer '+issued[0]]]);
 assert.deepEqual(connected,[{provider:'search-console',target:'Search Console',transport:'hermes',connector:'service'}]);
 const kept=JSON.parse(values.get('service:search-console')!);
 assert.deepEqual(kept.settings,{});assert.deepEqual(JSON.parse(kept.token),{clientEmail:EMAIL,privateKey:PEM,keyId:KEY_ID});
 assert.ok(!values.get('service:search-console')!.includes('ya29.'),'no access token in the vault');
 const keptValue=values.get('service:search-console');
 refuseKey=true;await failing(connect(KEY_FILE),/did not accept/);refuseKey=false;
 assert.equal(values.get('service:search-console'),keptValue,'the working key is kept');
 assert.equal(connectToken('search-console',KEY_FILE),KEY_FILE.trim());
 assert.equal(connectToken('search-console',KEY_FILE.replace(/\n/g,'')),KEY_FILE.replace(/\n/g,''),'a key pasted on one line still connects');
 assert.throws(()=>connectToken('search-console','{"installed":{"client_id":"x","client_secret":"'+'y'.repeat(60)+'"}}'),/OAuth client file/);
 assert.throws(()=>connectToken('search-console','ya29.'+'a'.repeat(40)),/does not look like a token/);
 assert.deepEqual(connectSettings('search-console',{}),{});
 assert.ok(SOURCE_PROVIDERS.includes('search-console'));assert.equal(SERVICE_TITLES['search-console'],'Search Console');
 // A paste is always checked afresh, so the kept key exchanges again once; then the connection test and every read
 // reuse its access token until a minute before it expires.
 calls.length=0;
 assert.deepEqual(await access.run({action:'sourceRefresh',provider:'search-console'},home),{ok:true,status:'connected'});
 assert.deepEqual(await access.run({action:'sourceRefresh',provider:'search-console'},home),{ok:true,status:'connected'});
 assert.equal(calls.filter(c=>c.url===GOOGLE_TOKEN_URL).length,1);
 const base=issued.length;

 // list: the sites, checked, by ID.
 const sites=await read({provider:'search-console',operation:'list'});
 assert.deepEqual(events.at(-1).args,{name:'read_service',provider:'search-console',operation:'list'});
 assert.deepEqual(sites.records,[
  {id:'https://www.example.com/',title:'https://www.example.com/',url:'https://search.google.com/search-console/performance/search-analytics?resource_id=https%3A%2F%2Fwww.example.com%2F',fields:{kind:'url-prefix',permission:'siteRestrictedUser'}},
  {id:'sc-domain:example.com',title:'example.com',url:'https://search.google.com/search-console/performance/search-analytics?resource_id=sc-domain%3Aexample.com',fields:{kind:'domain',permission:'siteFullUser'}},
 ]);
 // query, no spec: the last 28 whole days ending yesterday, in total.
 calls.length=0;
 const total=await read({provider:'search-console',operation:'query',id:'sc-domain:example.com'});
 assert.deepEqual(calls.map(c=>[c.method,c.url]),[['POST',API+'/webmasters/v3/sites/sc-domain%3Aexample.com/searchAnalytics/query']]);
 assert.deepEqual(calls[0].body,{startDate:'2026-09-19',endDate:'2026-10-16',dimensions:[],rowLimit:SEARCH_CONSOLE_LIMITS.rowsDefault});
 assert.deepEqual(total.records,[{id:'total',title:'All of example.com',url:'https://search.google.com/search-console/performance/search-analytics?resource_id=sc-domain%3Aexample.com',fields:{clicks:1234,impressions:56789,ctrPercent:2.17,position:8.5}}]);
 assert.match(total.scope,/sc-domain:example\.com from 2026-09-19 to 2026-10-16 in total .*Read only/);
 // By date: in time order for a trend.
 const trend=await read({provider:'search-console',operation:'query',id:'sc-domain:example.com',query:'{"days":7,"dimensions":["date"]}'});
 assert.deepEqual(trend.records.map((r:any)=>[r.id,r.fields.date,r.fields.clicks]),[['2026-10-01','2026-10-01',10],['2026-10-02','2026-10-02',20],['2026-10-03','2026-10-03',30]]);
 assert.deepEqual(calls.at(-1)!.body,{startDate:'2026-10-10',endDate:'2026-10-16',dimensions:['date'],rowLimit:25});
 // By query and page between two dates: bounded to rowLimit, malformed rows dropped.
 const top=await read({provider:'search-console',operation:'query',id:'sc-domain:example.com',query:JSON.stringify({startDate:'2026-09-01',endDate:'2026-09-30',dimensions:['query','page'],rowLimit:5})});
 assert.deepEqual(calls.at(-1)!.body,{startDate:'2026-09-01',endDate:'2026-09-30',dimensions:['query','page'],rowLimit:5});
 assert.equal(top.records.length,5);
 assert.deepEqual(top.records[1],{id:'query-1 · page-1',title:'query-1 · page-1',url:'https://search.google.com/search-console/performance/search-analytics?resource_id=sc-domain%3Aexample.com',fields:{query:'query-1',page:'page-1',clicks:99,impressions:1000,ctrPercent:9.9,position:3.3}});
 assert.match(top.scope,/by query, page · up to 5 rows · Read only/);
 // Refused before Google is asked: a bad site, spec, cursor or operation.
 calls.length=0;
 for(const [args,pattern] of [
  [{operation:'query',id:'example.com'},/sc-domain:example\.com/],
  [{operation:'query',id:'ftp://example.com/'},/URL prefix/],
  [{operation:'query',id:'sc-domain:example.com',query:'last week'},/as JSON/],
  [{operation:'query',id:'sc-domain:example.com',query:'{"days":0}'},/days \(1 to 480\)/],
  [{operation:'query',id:'sc-domain:example.com',query:'{"days":481}'},/as JSON/],
  [{operation:'query',id:'sc-domain:example.com',query:'{"dimensions":["query","page","date","device"]}'},/up to 3 dimensions/],
  [{operation:'query',id:'sc-domain:example.com',query:'{"dimensions":["searchAppearance"]}'},/as JSON/],
  [{operation:'query',id:'sc-domain:example.com',query:'{"rowLimit":1000}'},/rowLimit \(1 to 250\)/],
  [{operation:'query',id:'sc-domain:example.com',query:'{"days":7,"startDate":"2026-09-01","endDate":"2026-09-02"}'},/as JSON/],
  [{operation:'query',id:'sc-domain:example.com',query:'{"startDate":"2026-09-30","endDate":"2026-09-01"}'},/as JSON/],
  [{operation:'query',id:'sc-domain:example.com',query:'{"type":"discover"}'},/as JSON/],
  [{operation:'query',id:'sc-domain:example.com',cursor:'2'},/one page/],
  [{operation:'list',id:'sc-domain:example.com'},/list takes nothing else/],
  [{operation:'query'},/Name the Search Console site/],
  [{operation:'read',id:'sc-domain:example.com'},/no read read\. Use list or query/],
  [{operation:'search',query:'x'},/no search read/],
 ] as const)await failing(read({provider:'search-console',...args}),pattern,JSON.stringify(args));
 assert.equal(calls.length,0);
 // Google's own refusals, short.
 await failing(read({provider:'search-console',operation:'query',id:'https://example.net/'}),/cannot read that site\. .*Users and permissions/);
 await failing(read({provider:'search-console',operation:'query',id:'sc-domain:example.com',query:'{"dimensions":["country","device"]}'}),/^Search Console could not run this read\. Search Console said: Invalid dimension combination for x+$/);
 assert.ok(errors.at(-1)!.length<400);
 // A refused turn asks nothing.
 calls.length=0;
 await failing(read({provider:'search-console',operation:'list'},async()=>({error:'Allow private context first.'})),/Allow private context first/);
 assert.equal(calls.length,0);
 // The access token is exchanged again a minute before it expires, and only then.
 assert.equal(issued.length,base);
 clock=NOW+3538_000;await read({provider:'search-console',operation:'list'});assert.equal(issued.length,base);
 clock=NOW+3540_000;await read({provider:'search-console',operation:'list'});assert.equal(issued.length,base+1);
 // A revoked access token is dropped; a key Google no longer accepts disconnects.
 revoked.add(issued[base]);
 await failing(read({provider:'search-console',operation:'list'}),/Search Console is disconnected or its service account key was revoked/);
 await read({provider:'search-console',operation:'list'});assert.equal(issued.length,base+2,'a new token after a refused one');
 revoked.add(issued[base+1]);refuseKey=true;
 await failing(read({provider:'search-console',operation:'list'}),/disconnected or its service account key was revoked/);
 await failing(read({provider:'search-console',operation:'list'}),/disconnected or its service account key was revoked/);
 refuseKey=false;
 assert.ok(calls.every(c=>c.url===GOOGLE_TOKEN_URL||new URL(c.url).origin===API),'every request went to Google\'s token or Search Console address');
 assert.deepEqual(await links.disconnect({provider:'search-console'},home),['search-console']);
 assert.equal(values.has('service:search-console'),false);
 await failing(read({provider:'search-console',operation:'list'}),/Connect Search Console first/);
 const secrets=[PEM_BODY,...issued];
 for(const [label,value] of [['events',events],['journal',journal],['receipts',connected],['errors',errors],['results',[sites,total,trend,top]]] as const)
  for(const secret of secrets)assert.ok(!JSON.stringify(value).includes(secret),'no key or access token in the '+label);

 // Presets and the board: a site's totals as a number, its days as a trend, its top queries as a list.
 assert.deepEqual(readServicePresetRead('search-console',{operation:'list'}),{operation:'list'});
 assert.deepEqual(readServicePresetRead('search-console',{operation:'query',id:'sc-domain:Example.com'}),{operation:'query',id:'sc-domain:example.com'});
 assert.throws(()=>readServicePresetRead('search-console',{operation:'query',id:'sc-domain:example.com',query:'{"rowLimit":1000}'}),/rowLimit/);
 assert.throws(()=>readServicePresetRead('search-console',{operation:'query'}),/Name the Search Console site/);
 assert.throws(()=>readServicePresetRead('search-console',{operation:'list',id:'sc-domain:example.com'}),/takes nothing else/);
 assert.deepEqual(searchConsoleSpec(''),{days:28,dimensions:[],rowLimit:25});
 const at='2026-10-17T12:00:00.000Z';
 let presets=saveServicePreset([],{id:'search-total',name:'Search last 28 days',provider:'search-console',read:{operation:'query',id:'sc-domain:example.com'}},at).presets;
 presets=saveServicePreset(presets,{id:'search-days',name:'Search by day',provider:'search-console',read:{operation:'query',id:'sc-domain:example.com',query:'{"days":7,"dimensions":["date"]}'}},at).presets;
 presets=saveServicePreset(presets,{id:'search-top',name:'Top queries',provider:'search-console',read:{operation:'query',id:'sc-domain:example.com',query:'{"dimensions":["query","page"],"rowLimit":5}'}},at).presets;
 const board=readBoardDefinition({title:'Search',tabs:[{id:'search',title:'Search',blocks:[
  {id:'clicks',title:'Clicks, 28 days',kind:'number',preset:'search-total',field:'clicks',goodAtLeast:1000},
  {id:'by-day',title:'Clicks by day',kind:'trend',preset:'search-days',x:'date',y:'clicks'},
  {id:'queries',title:'Top queries',kind:'list',preset:'search-top',fields:['clicks','ctrPercent','position'],limit:3},
 ]}]});
 const view=resolveBoard(board,presets,{'search-total':{records:total as unknown as ServiceRecords},'search-days':{records:trend as unknown as ServiceRecords},'search-top':{records:top as unknown as ServiceRecords}},at);
 const [clicks,byDay,queries]=view.tabs[0].blocks;
 assert.deepEqual([clicks.status,clicks.provider,clicks.number],['ok','search-console',{value:1234,tone:'good'}]);
 assert.deepEqual(byDay.trend,{points:[{x:'2026-10-01',y:10},{x:'2026-10-02',y:20},{x:'2026-10-03',y:30}],latest:30,change:10});
 assert.deepEqual([queries.list!.items.length,queries.list!.more,queries.list!.items[0].fields],[3,true,{clicks:100,ctrPercent:10,position:3.3}]);
});

// Grants: search-console/list and search-console/query are the targets, in no default Grant.
const actions=worldActions();
assert.deepEqual(worldActionOf(actions,'read_service',{provider:'search-console',operation:'query'}),{target:'search-console',action:'query'});
assert.deepEqual(actions.find(a=>a.target==='search-console'&&a.action==='query')!.parameters.required,['id']);
assert.deepEqual(actions.find(a=>a.target==='search-console'&&a.action==='list')!.parameters.required,[]);
const targets=actions.filter(a=>a.tool==='read_service'&&a.defaults.provider==='search-console').map(a=>a.target+'/'+a.action);
assert.deepEqual(targets,['search-console/list','search-console/query']);
assert.deepEqual(serviceReadTargets('search-console'),targets);
const now='2026-10-17T12:00:00.000Z';
const agent:AgentIdentity={id:'codex',name:'Codex',harness:'codex',kind:'local',createdAt:now};
const defaults=channelDefaultGrants(agent.id,now,actions);
assert.ok(defaults.every(g=>g.targets.every(t=>!targets.includes(t))),'Search Console is in no default Grant');
const decide=(grants:Grant[])=>standingCallDecision({identity:agent,grants,target:'search-console',action:'query',tool:'read_service',args:{provider:'search-console',operation:'query',id:'sc-domain:example.com'},foxTurn:null,now}).decision;
assert.equal(decide(defaults),'denied');
const grant:Grant={id:'g1',agentId:agent.id,targets,access:'read',duration:'standing',grantedAt:now};
assert.equal(decide([...defaults,grant]),'allowed');
assert.deepEqual(standingActions(actions,agent,[grant],false,now).map(a=>a.target+'/'+a.action),targets);
assert.equal(turnTrustObserve({},{type:'tool',name:'_world_authorize',args:{name:'read_service',provider:'search-console',operation:'query'}}).untrusted,true);
assert.ok(TOKEN_PROVIDERS['search-console'].hint.includes('service account'));

console.log('PASS Search Console Service: a pasted service account key is checked before anything is sent and a refused one replaces nothing; the host signs an RS256 assertion (read-only Search Console scope, verified with the key\'s public half) sent only to Google\'s token address, and reuses the access token until a minute before it expires; list returns the sites and query one bounded Search Analytics query; refused turn and revoked key stop the read; search-console/list and search-console/query enforced and in no default Grant; presets and the board take its reads; the key and access tokens are in no event, journal entry, receipt, result or message');
