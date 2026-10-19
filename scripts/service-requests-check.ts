// When an Agent first needs a Service (agent/agents/GRANTS.md#when-an-agent-first-needs-a-service): its refused
// `read_service` call on the standing server puts one Attention card from provider `agents` in the World's ledger,
// written with no model, at most once a day for that Agent and Service; the refusal says the person was asked. Allow
// gives the read Grant (only once the Service is connected), Not now leaves it; a Service that is not connected asks to
// connect it, from the card when it signs in or in Settings › Connectors when it takes a key. Checked against a real
// ledger, Agent access store and standing server.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {answerServiceRequest,serviceGranted,serviceRequestDue,serviceRequestItem,serviceRequestRefusal,STANDING_OUTSIDE_TURN} from '../agent/agents/index.ts';
import {CONNECTOR_TECHNICAL_WORDS} from '../context/sources/index.ts';
import {createAgentAccess} from '../platform/electron/src/modules/agent-runtime/agent-access.ts';
import {createServiceRequests} from '../platform/electron/src/modules/agent-runtime/service-requests.ts';
import {openStandingWorldTools} from '../platform/electron/src/modules/agent-runtime/world-tool-bridge.ts';
import {WorldLedger} from '../platform/electron/src/store/ledger.ts';
import {withTempDir} from './test-temp.ts';

// Core: once a day per Agent and Service; a request still waiting to connect asks again as Allow once connected.
const T0='2026-10-17T09:00:00.000Z',later=(hours:number)=>new Date(Date.parse(T0)+hours*3_600_000).toISOString();
const agent={id:'codex',name:'Codex'};
const first=serviceRequestDue(null,agent,'posthog',true,T0)!;
assert.deepEqual([first.id,first.status,first.connected],['codex.posthog','pending',true]);
assert.equal(serviceRequestDue(first,agent,'posthog',true,later(23)),null,'not again within a day');
assert.ok(serviceRequestDue(first,agent,'posthog',true,later(25)),'again after a day');
assert.equal(serviceRequestDue(answerServiceRequest(first,'decline',true,later(1)),agent,'posthog',true,later(2)),null,'Not now holds for the day');
const waiting=serviceRequestDue(null,agent,'cloudflare',false,T0)!;
assert.equal(serviceRequestDue(waiting,agent,'cloudflare',true,later(1))?.connected,true,'connected meanwhile: asks to allow');
assert.equal(serviceRequestDue(null,agent,'gmail',true,T0),null,'only Worldlet Services');
assert.equal(serviceRequestDue(null,{id:'Not An Id',name:'x'},'posthog',true,T0),null);
assert.throws(()=>answerServiceRequest(waiting,'allow',false,T0),/Connect it first/);
assert.throws(()=>answerServiceRequest(answerServiceRequest(first,'allow',true,T0),'allow',true,T0),/no longer waiting/);
// The card: plain words for someone who knows nothing about computers.
const card=serviceRequestItem(first,'PostHog'),connect=serviceRequestItem(waiting,'Cloudflare'),key=serviceRequestItem({...waiting,provider:'github',id:'codex.github'},'GitHub',{signIn:false});
assert.deepEqual([card.title,card.provider,card.kind,card.status],['Codex wants to look at your PostHog.','agents','task','open']);
assert.equal(connect.title,'Codex wants to use Cloudflare. It isn\'t connected yet.');
assert.match(String(key.summary),/Settings › Connectors/);
for(const item of [card,connect,key])for(const text of [item.title,item.summary,item.reason])assert.doesNotMatch(String(text),CONNECTOR_TECHNICAL_WORDS,String(text));
assert.match(serviceRequestRefusal('PostHog',true,true),/asked the person in their Attention Center/);

await withTempDir('worldlet-requests-',async dir=>{
 const ledger=new WorldLedger(path.join(dir,'world'));
 const secrets=new Map<string,string>();
 const vault={get:(id:string)=>secrets.get(id)??null,set:(id:string,value:string)=>{secrets.set(id,value);},delete:(id:string)=>{secrets.delete(id);},deleteAll:()=>secrets.clear()};
 const access=createAgentAccess({root:path.join(dir,'access'),vault,ledger:()=>ledger});
 let clock=T0,changed=0;const connected=new Set(['posthog']);
 const requests=createServiceRequests({ledger:()=>ledger,access:()=>access,connected:provider=>connected.has(provider),title:provider=>({posthog:'PostHog',cloudflare:'Cloudflare',github:'GitHub'} as Record<string,string>)[provider]??provider,changed:()=>{changed++;},now:()=>clock});
 const standing=await openStandingWorldTools({access,channel:async()=>({ok:true}),serviceRequest:(who,provider)=>requests.asked(who,provider)});
 try{
  const home=path.join(dir,'codex');fs.mkdirSync(home);
  const entry=standing.server(home,{id:'codex',name:'Codex',harness:'codex',kind:'local'});
  const {url,token}=JSON.parse(fs.readFileSync(entry.env.WORLDLET_MCP_ENDPOINT_FILE,'utf8'));
  const actions:Record<string,[string,string]>={posthog:['query','{"query":"select 1"}'],cloudflare:['read','{"id":"workers"}'],github:['list','{}']};
  const call=async(target:string)=>JSON.parse((await (await fetch(url,{method:'POST',headers:{authorization:'Bearer '+token},body:JSON.stringify({method:'call',name:'call_world_tool',arguments:{target,action:actions[target][0],arguments:actions[target][1]}})})).json()).text);
  const items=()=>ledger.records('items').filter((item:any)=>item.provider==='agents'&&typeof item.serviceRequestId==='string');
  // Refused: the card goes up once and the refusal says so.
  const refused=await call('posthog');
  assert.equal(refused.error,STANDING_OUTSIDE_TURN+serviceRequestRefusal('PostHog',true,true));
  assert.deepEqual(items().map((item:any)=>[item.title,item.status,item.agentId,item.serviceRequestConnected]),[['Codex wants to look at your PostHog.','open','codex',true]]);
  assert.equal(changed,1);
  assert.equal((await call('posthog')).error,STANDING_OUTSIDE_TURN+serviceRequestRefusal('PostHog',true,false),'asked already: no second card');
  assert.equal(items().length,1);
  // Allow gives the read Grant; the next call runs.
  assert.deepEqual(requests.answer({operation:'allow',id:'codex.posthog'}),{ok:true,status:'allowed'});
  assert.equal(serviceGranted('codex',access.grants('codex'),'posthog',clock),true);
  assert.equal(items()[0].status,'done');
  assert.equal((await call('posthog')).error,undefined,'allowed: it runs');
  assert.throws(()=>requests.answer({operation:'allow',id:'codex.posthog'}),/no longer waiting/);
  // Not connected: Connect, and Allow refused until it is.
  const notConnected=await call('cloudflare');
  assert.match(notConnected.error,/Cloudflare is not connected\. Worldlet asked the person/);
  const asked=items().find((item:any)=>item.serviceRequestProvider==='cloudflare');
  assert.deepEqual([asked.title,asked.serviceRequestSignIn,asked.serviceRequestRegion],['Codex wants to use Cloudflare. It isn\'t connected yet.',true,'work']);
  assert.throws(()=>requests.answer({operation:'allow',id:'codex.cloudflare'}),/Connect it first/);
  connected.add('cloudflare');
  assert.deepEqual(requests.answer({operation:'allow',id:'codex.cloudflare'}),{ok:true,status:'allowed'});
  // A Service that takes a key sends the person to Settings › Connectors; Not now leaves it, for a day.
  await call('github');
  assert.equal(items().find((item:any)=>item.serviceRequestProvider==='github').serviceRequestSignIn,false);
  assert.deepEqual(requests.answer({operation:'decline',id:'codex.github'}),{ok:true,status:'declined'});
  assert.equal(serviceGranted('codex',access.grants('codex'),'github',clock),false);
  assert.equal((await call('github')).error,STANDING_OUTSIDE_TURN,'declined today: no card and no claim it asked');
  clock=later(25);
  await call('github');
  assert.equal(items().find((item:any)=>item.serviceRequestProvider==='github').status,'open','the next day it asks again');
  // A revoked Agent never asks.
  access.revoke('codex');
  const before=items().length;clock=later(60);
  await call('cloudflare').catch(()=>null);
  assert.equal(items().length,before);
  assert.throws(()=>requests.answer({operation:'maybe',id:'codex.github'}),/Unknown request operation/);
 }finally{await standing.close();}
});
console.log('PASS Service requests: a refused read_service puts one plain Attention card up per Agent and Service a day and says so; Allow gives the read Grant only once connected, Not now holds for the day; Connect signs in from the card or sends a key service to Settings › Connectors; a revoked Agent never asks');
