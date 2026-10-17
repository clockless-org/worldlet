// HTTP JSON as a Worldlet Service, read only (contracts/services.ts, core/accounts/services/http-json.ts,
// service-source.ts, `read_service`): against a stub HTTP server, an endpoint's name and HTTPS base address are checked
// before anything is sent, its optional token is checked with one GET before it is kept and a refused one replaces
// nothing; several named endpoints live in one connection; `list` names them and `read` sends one GET to a path under
// the base address and shapes the answer into bounded, flat records (default or chosen records array and keys);
// paths that leave the base address, redirects, oversized answers and names that resolve to this computer or the local
// network are refused; a refused turn and an expired token stop the read; presets and the board read it like any
// Service; http/list and http/read are Grant targets in no default Grant; and the token is in no event, journal entry,
// receipt, result, list or message.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type {AddressInfo} from 'node:net';
import type {AgentIdentity,Grant} from '../contracts/agent-identity.ts';
import type {ServiceRecords} from '../contracts/services.ts';
import {HTTP_JSON_LIMITS,httpJsonBaseUrl,httpJsonRequest,privateAddress,readServicePresetRead,saveServicePreset,servicePresetRead} from '../core/accounts/index.ts';
import {readBoardDefinition,resolveBoard} from '../core/board/index.ts';
import {channelDefaultGrants,serviceReadTargets,standingActions,standingCallDecision} from '../core/agent/grants.ts';
import {turnTrustObserve} from '../core/agent/turn-trust.ts';
import {worldActionOf,worldActions} from '../core/tools/gateway.ts';
import {SOURCE_PROVIDERS,TOKEN_PROVIDERS,connectSettings,connectToken} from '../core/applets/index.ts';
import {ExecutionJournal} from '../platform/electron/src/modules/agent-runtime/journal.ts';
import {ServiceSource,ServiceSourceAccess,ServiceSourceConnections} from '../platform/electron/src/modules/sources/service-source.ts';
import {withTempDir} from './test-temp.ts';

const TOKEN='Fixture.'+'hj1'.repeat(10);
type Call={method:string;url:string;auth:string};

// Addresses: what each host name resolves to. `inside` points to the local network, `mixed` to both.
assert.equal(privateAddress('192.0.2.10'),false);assert.equal(privateAddress('2001:db8::10'),false);
for(const address of ['127.0.0.1','10.0.0.5',['172','16','0','1'].join('.'),'192.168.1.20','169.254.169.254','100.64.0.1','0.0.0.0','224.0.0.1','::1','::','fe80::1','fd00::1','::ffff:127.0.0.1','::ffff:7f00:1','::ffff:10.0.0.5','not-an-address','999.1.1.1'])
 assert.equal(privateAddress(address),true,address);
const RESOLVES:Record<string,string[]>={'api.example.com':['192.0.2.10'],'open.example.com':['2001:db8::10'],'inside.example.com':['10.0.0.5'],'mixed.example.com':['192.0.2.11','127.0.0.1']};

// The endpoint's settings, checked before anything is sent.
assert.equal(httpJsonBaseUrl('https://api.example.com/v1'),'https://api.example.com/v1/');
assert.equal(httpJsonBaseUrl(' https://API.example.com '),'https://api.example.com/');
for(const url of ['','http://api.example.com/','https://alex:secret@api.example.com/','https://api.example.com/v1?key=1','https://api.example.com/#x','ftp://api.example.com/','https://localhost/','https://app.localhost/','https://printer.local/','https://127.0.0.1/','https://[::1]/','https://10.0.0.5/','https://2130706433/','https://169.254.169.254/latest/','https://'+'a'.repeat(300)+'.example.com/'])
 assert.throws(()=>httpJsonBaseUrl(url),url);
assert.deepEqual(httpJsonRequest('/items?state=open'),{path:'items?state=open'});
assert.deepEqual(httpJsonRequest('{"path":"items","records":"$.data.items","fields":["a","stats.count","a"]}'),{path:'items',records:'data.items',fields:['a','stats.count']});
for(const query of ['../secret','a/../../b','%2e%2e/secret','a%2Fb','a%5cb','https://evil.example.com/x','//evil.example.com/x','a b','x#y','a\\b','javascript:alert(1)','{"path":"x","method":"POST"}','{"path":"x","records":"a b"}','{"path":"x","fields":[]}','{"path":"x","fields":"a"}','{not json','x'.repeat(1001)])
 assert.throws(()=>httpJsonRequest(query),query);

await withTempDir('worldlet-http-json-service-',async temp=>{
 const values=new Map<string,string>();
 const vault={get:(id:string)=>values.get(id)??null,set:(id:string,value:string)=>{values.set(id,value);},delete:(id:string)=>{values.delete(id);},deleteAll:()=>values.clear()};
 const home=path.join(temp,'hermes');fs.mkdirSync(home,{recursive:true});
 const journal:any[]=[];
 ExecutionJournal.register(home,true,entry=>{journal.push(entry);return true;});
 const calls:Call[]=[];let accepted=TOKEN;
 const items=Array.from({length:60},(_,i)=>({id:i+1,name:`Item ${i+1}`,html_url:`https://app.example.com/items/${i+1}`,state:i%2?'open':'closed',
  count:i,ok:i%3===0,owner:{login:'alex'},tags:['a'],notes:null,long:'x'.repeat(500),stats:{count:i*10},'line\nbreak':1}));
 // The stub: api.example.com/v1 needs the token; open.example.com needs none and answers HTML at its root.
 const server=http.createServer((request,response)=>{
  const host=String(request.headers['x-host']),url=new URL(request.url??'/','http://stub'),json=(value:unknown,status=200)=>{response.writeHead(status,{'content-type':'application/json'});response.end(JSON.stringify(value));};
  if(host==='open.example.com'){
   if(url.pathname==='/'){response.writeHead(200,{'content-type':'text/html'});response.end('<!doctype html><title>Hi</title>');return;}
   if(url.pathname==='/status.json')return json({ok:true,uptime:99.9,version:'1.2.3',build:{sha:'abc'}});
   if(url.pathname==='/numbers')return json([3,1,2]);
   return json({error:'not found'},404);
  }
  if(request.headers.authorization!=='Bearer '+accepted)return json({error:'unauthorized'},401);
  if(url.pathname==='/v1/')return json({error:'not here'},404);
  if(url.pathname==='/v1/items')return json({data:{items,total:items.length}});
  if(url.pathname==='/v1/list')return json({items:items.slice(0,3),next:null});
  if(url.pathname==='/v1/moved'){response.writeHead(302,{location:'https://evil.example.com/'});response.end();return;}
  if(url.pathname==='/v1/big')return json({items:Array.from({length:30_000},(_,i)=>({id:i,text:'y'.repeat(40)}))});
  if(url.pathname==='/v1/secret')return json({error:'no'},403);
  return json({error:'not found'},404);
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const port=(server.address() as AddressInfo).port;
 try{
  // Requests addressed to the example hosts reach the stub; each is recorded as the World sent it.
  const stub=async(input:any,init:any={}):Promise<Response>=>{
   const url=new URL(String(input));
   calls.push({method:init.method??'GET',url:url.href,auth:String(init.headers?.authorization??'')});
   assert.equal(init.redirect,'manual','redirects are never followed');
   assert.equal(init.body,undefined,'nothing is sent but GET');
   return fetch(`http://127.0.0.1:${port}${url.pathname}${url.search}`,{...init,headers:{...init.headers,'x-host':url.hostname}});
  };
  const looked:string[]=[];
  const source=new ServiceSource({vault,fetch:stub as typeof fetch,lookup:async host=>{looked.push(host);if(!RESOLVES[host])throw Error('ENOTFOUND');return RESOLVES[host];}});
  const access=new ServiceSourceAccess(source,()=>({run:async()=>({delegated:true}),steer:async()=>false,cancel(){}}));
  const events:any[]=[];
  const turn=async(event:any):Promise<Record<string,unknown>>=>{events.push(event);return {ok:true};};
  const read=(args:Record<string,unknown>,onEvent=turn)=>access.run({action:'sourceTool',name:'read_service',args:{provider:'http',...args}},home,onEvent) as Promise<ServiceRecords>;
  const links=new ServiceSourceConnections(source,()=>{throw Error('HTTP JSON is read here');},()=>'hermes');
  const connected:any[]=[],errors:string[]=[];
  const connect=(token:string,settings:Record<string,string>)=>links.connect({provider:'http',target:'',endpoint:'',token,settings,home,onStage:()=>{},onConnected:c=>connected.push(c)});
  const failing=async(work:Promise<unknown>,pattern:RegExp,label?:string)=>{const error=await work.then(()=>null,(e:Error)=>e);assert.ok(error,'refused: '+(label??pattern));errors.push(error!.message);assert.match(error!.message,pattern,label);};

  await failing(read({operation:'list'}),/Connect an HTTP JSON endpoint first/);
  await failing(read({operation:'read',id:'status'}),/Connect an HTTP JSON endpoint first/);
  // The token is optional, settings are exactly a name and an address, and both are checked before anything is sent.
  assert.equal(connectToken('http',''),'');assert.equal(connectToken('http',undefined),'');assert.equal(connectToken('http',' '+TOKEN+' '),TOKEN);
  assert.throws(()=>connectToken('http','short'),/does not look like a token/);assert.throws(()=>connectToken('github',''),/fine-grained token/);
  assert.deepEqual(connectSettings('http',{name:' status ',url:'https://api.example.com/v1'}),{name:'status',url:'https://api.example.com/v1'});
  assert.throws(()=>connectSettings('http',{name:'status',url:'https://api.example.com/',method:'POST'}),/does not take these settings/);
  assert.ok(SOURCE_PROVIDERS.includes('http'));assert.equal(TOKEN_PROVIDERS.http.optional,true);
  for(const [name,url] of [['Bad Name','https://api.example.com/'],['status','http://api.example.com/'],['status','https://localhost:8443/'],['status','https://192.168.1.20/']])
   await failing(connect(TOKEN,{name,url}),/Name the endpoint|base address|only on the internet/,name+' '+url);
  assert.equal(calls.length,0);
  // A name that resolves to the local network, or partly to this computer, is refused before any request.
  await failing(connect('',{name:'inside',url:'https://inside.example.com/'}),/only on the internet: inside\.example\.com points to this computer or your local network/);
  await failing(connect('',{name:'mixed',url:'https://mixed.example.com/'}),/points to this computer or your local network/);
  await failing(connect('',{name:'gone',url:'https://gone.example.com/'}),/Could not find gone\.example\.com/);
  assert.equal(calls.length,0);assert.deepEqual(looked,['inside.example.com','mixed.example.com','gone.example.com']);
  // A refused token: nothing kept, nothing repeated.
  accepted='other';
  await failing(connect(TOKEN,{name:'status',url:'https://api.example.com/v1'}),/^This endpoint did not accept the token\./);
  accepted=TOKEN;
  assert.equal(values.size,0);assert.deepEqual(connected,[]);
  // One GET of the base address (404 there is fine), then the endpoint is kept with its token.
  calls.length=0;
  await connect('Bearer '+TOKEN,{name:'status',url:'https://api.example.com/v1'});
  assert.deepEqual(calls,[{method:'GET',url:'https://api.example.com/v1/',auth:'Bearer '+TOKEN}]);
  assert.deepEqual(connected,[{provider:'http',target:'HTTP JSON',transport:'hermes',connector:'service'}]);
  // A second endpoint with no token: an HTML answer at its root still shows it answers; no Authorization is sent.
  calls.length=0;
  await connect('',{name:'open',url:'https://open.example.com'});
  assert.deepEqual(calls,[{method:'GET',url:'https://open.example.com/',auth:''}]);
  assert.deepEqual(JSON.parse(values.get('service:http')!),{v:1,endpoints:[{settings:{name:'status',url:'https://api.example.com/v1/'},token:TOKEN},{settings:{name:'open',url:'https://open.example.com/'},token:''}]});
  // Connecting under the same name again with a refused token keeps the working one.
  const kept=values.get('service:http');
  accepted='nope';await failing(connect('Refused.'+'x'.repeat(20),{name:'status',url:'https://api.example.com/v1'}),/did not accept the token/);accepted=TOKEN;
  assert.equal(values.get('service:http'),kept,'the working token is kept');
  assert.deepEqual(source.endpointList('http'),[{name:'status',url:'https://api.example.com/v1/',token:true},{name:'open',url:'https://open.example.com/',token:false}]);
  assert.deepEqual(await access.run({action:'sourceRefresh',provider:'http'},home),{ok:true,status:'connected'});

  // list: the endpoints by name and address, never a token.
  calls.length=0;
  const listed=await read({operation:'list'});
  assert.deepEqual(events.at(-1).args,{name:'read_service',provider:'http',operation:'list'});
  assert.deepEqual(listed.records,[{id:'status',title:'status',url:'https://api.example.com/v1/',fields:{kind:'endpoint',host:'api.example.com',token:true}},{id:'open',title:'open',url:'https://open.example.com/',fields:{kind:'endpoint',host:'open.example.com',token:false}}]);
  assert.equal(calls.length,0,'list sends nothing');
  await failing(read({operation:'list',id:'status'}),/list takes nothing else/);

  // read with a records path: the first 50 records, flat and bounded, each with its own ID, title and link.
  calls.length=0;
  const page=await read({operation:'read',id:'status',query:'{"path":"items?state=all&per_page=100","records":"data.items"}'});
  assert.deepEqual(events.at(-1).args,{name:'read_service',provider:'http',operation:'read'});
  assert.deepEqual(calls,[{method:'GET',url:'https://api.example.com/v1/items?state=all&per_page=100',auth:'Bearer '+TOKEN}]);
  assert.equal(page.records.length,HTTP_JSON_LIMITS.records);
  assert.deepEqual(page.records[1],{id:'status/2',title:'Item 2',url:'https://app.example.com/items/2',fields:{id:2,name:'Item 2',html_url:'https://app.example.com/items/2',state:'open',count:1,ok:false,long:'x'.repeat(HTTP_JSON_LIMITS.cell-1)+'…'}});
  assert.match(page.scope,/^GET api\.example\.com\/v1\/items\?state=all&per_page=100 · the first 50 of 60 records · Read only$/);
  // Chosen keys, dotted fields; the answer's own items by default; an array of plain values; one object as one record.
  const chosen=await read({operation:'read',id:'status',query:JSON.stringify({path:'/items',records:'data.items',id:'html_url',title:'state',url:'owner.login',fields:['count','stats.count','owner','missing']})});
  assert.deepEqual(chosen.records[3],{id:'status/https://app.example.com/items/4',title:'open',url:'https://api.example.com/v1/items',fields:{count:3,'stats.count':30}},'a link that is not https is the read\'s own address');
  assert.deepEqual((await read({operation:'read',id:'status',query:'list'})).records.map(r=>r.id),['status/1','status/2','status/3']);
  assert.deepEqual((await read({operation:'read',id:'open',query:'numbers'})).records.map(r=>[r.id,r.fields.value]),[['open/1',3],['open/2',1],['open/3',2]]);
  const status=await read({operation:'read',id:'open',query:'status.json'});
  assert.deepEqual(status.records,[{id:'open/1',title:'1',url:'https://open.example.com/status.json',fields:{ok:true,uptime:99.9,version:'1.2.3'}}]);
  assert.equal(calls.filter(c=>new URL(c.url).hostname==='open.example.com').every(c=>c.auth===''),true,'the token goes only to its own endpoint');
  await failing(read({operation:'read',id:'status',query:'{"path":"items","records":"data.nothing"}'}),/nothing at “data\.nothing”/);
  // Nothing outside the base address, no other endpoint, no cursor, no unknown operation: refused before a request.
  calls.length=0;
  for(const query of ['../secret','%2e%2e/admin','https://evil.example.com/','//evil.example.com/x','a b'])await failing(read({operation:'read',id:'status',query}),/path|under the endpoint/,query);
  await failing(read({operation:'read',id:'nope'}),/no endpoint named that\. Connected: status, open\./);
  await failing(read({operation:'read',id:'status',cursor:'2'}),/reads one page/);
  await failing(read({operation:'query',query:'SELECT 1'}),/no query read/);
  await failing(read({operation:'read'}),/./);
  assert.equal(calls.length,0);
  // A redirect, an answer too large, a 403: each refused in plain words.
  await failing(read({operation:'read',id:'status',query:'moved'}),/answered from another address/);
  await failing(read({operation:'read',id:'status',query:'big'}),/more than Worldlet reads at once/);
  await failing(read({operation:'read',id:'status',query:'secret'}),/refused that read \(403\)/);
  assert.ok(calls.every(c=>c.method==='GET'&&['https://api.example.com','https://open.example.com'].includes(new URL(c.url).origin)),'only GET, only to the endpoints');
  // A refused turn, an expired token.
  calls.length=0;
  await failing(read({operation:'read',id:'status',query:'list'},async()=>({error:'Allow private context first.'})),/Allow private context first/);
  assert.equal(calls.length,0);
  accepted='rotated';
  await failing(read({operation:'read',id:'status',query:'list'}),/no longer accepts its token/);
  accepted=TOKEN;
  assert.equal(turnTrustObserve({},{type:'tool',name:'_world_authorize',args:{name:'read_service',provider:'http',operation:'read'}}).untrusted,true);

  // Presets and the board read it like any Service: a preset names the endpoint and path, never a token.
  const now='2026-10-17T12:00:00.000Z';
  assert.deepEqual(readServicePresetRead('http',{operation:'read',id:'status',query:'{"path":"items","records":"data.items"}'}),{operation:'read',id:'status',query:'{"path":"items","records":"data.items"}'});
  assert.deepEqual(readServicePresetRead('http',{operation:'list'}),{operation:'list'});
  assert.throws(()=>readServicePresetRead('http',{operation:'read',id:'Not A Name'}),/Name the endpoint/);
  assert.throws(()=>readServicePresetRead('http',{operation:'read',id:'status',query:'../admin'}),/no \.\./);
  assert.throws(()=>readServicePresetRead('http',{operation:'read',id:'status',query:'items?key=ghp_'+'a'.repeat(36)}),/may not hold passwords, tokens or keys/);
  assert.throws(()=>readServicePresetRead('http',{operation:'list',id:'status'}),/takes nothing else/);
  const presets=saveServicePreset([],{id:'items',name:'Open items',provider:'http',read:{operation:'read',id:'status',query:'{"path":"items","records":"data.items"}'}},now).presets;
  const board=readBoardDefinition({title:'Ops',tabs:[{id:'ops',title:'Ops',blocks:[
   {id:'count',title:'Items',kind:'number',preset:'items'},{id:'first',title:'First count',kind:'number',preset:'items',field:'count',goodAtMost:5},
   {id:'list',title:'Items',kind:'list',preset:'items',fields:['state'],limit:2},{id:'trend',title:'Counts',kind:'trend',preset:'items',x:'name',y:'count'}]}]});
  const records=await access.run({action:'sourceTool',name:'read_service',args:{...servicePresetRead(presets[0])}},home,turn) as ServiceRecords;
  const [count,first,list,trend]=resolveBoard(board,presets,{items:{records}},now).tabs[0].blocks;
  assert.deepEqual([count.provider,count.number],['http',{value:50}]);
  assert.deepEqual(first.number,{value:0,tone:'good'});
  assert.deepEqual(list.list,{items:[{title:'Item 1',url:'https://app.example.com/items/1',fields:{state:'closed'}},{title:'Item 2',url:'https://app.example.com/items/2',fields:{state:'open'}}],more:true});
  assert.deepEqual(trend.trend?.latest,49);

  // Removing one endpoint keeps the rest; the last one goes only with Disconnect, which forgets them all.
  source.removeEndpoint('http','open');
  assert.deepEqual(source.endpointList('http').map(e=>e.name),['status']);
  assert.throws(()=>source.removeEndpoint('http','status'),/last endpoint\. Disconnect it instead/);
  assert.throws(()=>source.removeEndpoint('http','open'),/no endpoint with that name/);
  // A kept endpoint whose address no longer passes is not used.
  values.set('service:http',JSON.stringify({v:1,endpoints:[{settings:{name:'status',url:'https://10.0.0.5/'},token:TOKEN}]}));
  assert.equal(source.connected('http'),false);
  values.set('service:http',kept!);
  assert.deepEqual(await links.disconnect({provider:'http'},home),['http']);
  assert.equal(values.has('service:http'),false);
  for(const [label,value] of [['events',events],['journal',journal],['receipts',connected],['errors',errors],['results',[listed,page,chosen,status,records]]] as const)
   assert.ok(!JSON.stringify(value).includes(TOKEN.slice(8)),'the token is not in the '+label);
 }finally{server.close();}
});

// Grants: http/list and http/read, together "Can read HTTP JSON", in no default Grant.
const actions=worldActions();
assert.deepEqual(worldActionOf(actions,'read_service',{provider:'http',operation:'read'}),{target:'http',action:'read'});
assert.deepEqual(actions.find(a=>a.target==='http'&&a.action==='read')!.parameters.required,['id']);
assert.deepEqual(serviceReadTargets('http'),['http/list','http/read']);
const now='2026-10-17T12:00:00.000Z';
const agent:AgentIdentity={id:'codex',name:'Codex',harness:'codex',kind:'local',createdAt:now};
const defaults=channelDefaultGrants(agent.id,now,actions);
assert.ok(defaults.every(g=>g.targets.every(t=>!t.startsWith('http/'))),'HTTP JSON is in no default Grant');
const decide=(grants:Grant[])=>standingCallDecision({identity:agent,grants,target:'http',action:'read',tool:'read_service',args:{provider:'http',operation:'read',id:'status'},foxTurn:null,now}).decision;
assert.equal(decide(defaults),'denied');
const grant:Grant={id:'codex-service-http',agentId:agent.id,targets:serviceReadTargets('http'),access:'read',duration:'standing',grantedAt:now};
assert.equal(decide([...defaults,grant]),'allowed');
assert.deepEqual(standingActions(actions,agent,[grant],false,now).map(a=>a.target+'/'+a.action),['http/list','http/read']);

console.log('PASS HTTP JSON Service: name and HTTPS address checked before anything is sent, an optional token checked with one GET before it is kept and a refused one replaces nothing; several named endpoints; list and one bounded GET under the base address into flat records; paths outside it, redirects, large answers and local-network names refused; refused turn and expired token stop the read; presets and the board; http/list and http/read in no default Grant; the token is in no event, journal entry, receipt, result or message');
