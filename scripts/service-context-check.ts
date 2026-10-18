// The World's saved Service context (context/context/service-context.ts, context/applets/INTEGRATIONS.md#searching-saved-service-context):
// one search and one read across what the World keeps up to date from each connected Service, through the standing
// `worldlet` MCP server with each Agent's own token. "Can read <Service>" names both targets; an answer holds only the
// Services that Agent may read; nothing asks a Service. Synthetic records, a real temporary SQLite ledger, no network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {withTempDir} from './test-temp.ts';
import {WorldLedger} from '../platform/electron/src/store/ledger.ts';
import {createAgentAccess} from '../platform/electron/src/modules/agent-runtime/agent-access.ts';
import {openStandingWorldTools} from '../platform/electron/src/modules/agent-runtime/world-tool-bridge.ts';
import {createServiceSync} from '../platform/electron/src/modules/sources/service-sync.ts';
import {SERVICE_CONTEXT_REASONS,serviceContext} from '../context/context/index.ts';
import type {ServiceRead} from '../contracts/services.ts';
import type {ServiceSyncSnapshot} from '../contracts/service-sync.ts';

// Core: search is every word, in the Services allowed; read by the id search gave.
const snap=(provider:string,records:any[],collectedAt=1_800_000_000):ServiceSyncSnapshot=>({id:provider+'-updates',provider,operation:'list',scope:provider+' scope',records,collectedAt,startedAt:collectedAt,pages:1,coverage:'bounded-reader'});
const issue={id:'example/app#12',title:'Checkout fails on Safari',url:'https://github.com/example/app/issues/12',updatedAt:'2026-10-17T10:00:00Z',fields:{state:'open',labels:'bug'},text:'Steps: open checkout in Safari and pay.',comments:[{author:'alex',text:'Seen on iOS too.'}]};
const error={id:'error/1',title:'TypeError in checkout',url:'https://us.posthog.com/project/1/error_tracking/1',fields:{occurrences:42}};
const snapshots=[snap('github',[issue,{id:'example/app#13',title:'Dark mode',url:'https://github.com/example/app/issues/13',fields:{state:'open'}}]),snap('posthog',[error]),snap('notion' as any,[{id:'n1',title:'Checkout notes',url:'https://www.notion.so/n1',fields:{}}])];
const onlyGithub=(provider:string)=>provider==='github';
const found=serviceContext(snapshots,{operation:'search',query:'checkout'},onlyGithub) as any;
assert.deepEqual(found.results.map((r:any)=>r.id),['github:example/app#12'],'only the Services the Agent may read; Notion is not a Service here');
assert.equal(found.untrustedContent,true);
assert.match(found.results[0].snippet,/checkout in Safari/);
assert.equal(found.results[0].savedAt,'2027-01-15T08:00:00.000Z');
assert.deepEqual((serviceContext(snapshots,{operation:'search',query:'checkout'},()=>true) as any).results.map((r:any)=>r.id).sort(),['github:example/app#12','posthog:error/1']);
assert.deepEqual((serviceContext(snapshots,{operation:'search',query:'checkout ios'},()=>true) as any).results.map((r:any)=>r.id),['github:example/app#12'],'every word, comments too');
assert.deepEqual((serviceContext(snapshots,{operation:'search',query:'checkout',provider:'posthog'},()=>true) as any).results.map((r:any)=>r.id),['posthog:error/1']);
assert.throws(()=>serviceContext(snapshots,{operation:'search',query:'checkout',provider:'posthog'},onlyGithub),{message:SERVICE_CONTEXT_REASONS.provider});
assert.throws(()=>serviceContext(snapshots,{operation:'search',query:''},onlyGithub),{message:SERVICE_CONTEXT_REASONS.query});
assert.throws(()=>serviceContext(snapshots,{operation:'search',query:'x'.repeat(201)},onlyGithub),{message:SERVICE_CONTEXT_REASONS.query});
const read=serviceContext(snapshots,{operation:'read',id:'github:example/app#12'},onlyGithub) as any;
assert.deepEqual([read.record.title,read.record.text,read.record.comments.length,read.untrustedContent],['Checkout fails on Safari','Steps: open checkout in Safari and pay.',1,true]);
assert.throws(()=>serviceContext(snapshots,{operation:'read',id:'posthog:error/1'},onlyGithub),{message:SERVICE_CONTEXT_REASONS.missing},'a Service it may not read is not there');
assert.throws(()=>serviceContext(snapshots,{operation:'read',id:'github:example/app#99'},onlyGithub),{message:SERVICE_CONTEXT_REASONS.missing});
assert.throws(()=>serviceContext(snapshots,{operation:'read',id:'nothing'},onlyGithub),{message:SERVICE_CONTEXT_REASONS.id});
assert.throws(()=>serviceContext(snapshots,{operation:'write'},onlyGithub),{message:SERVICE_CONTEXT_REASONS.operation});
// The newest snapshot wins for a record saved twice.
assert.equal((serviceContext([snap('github',[{...issue,title:'Old title'}],1),...snapshots],{operation:'read',id:'github:example/app#12'},onlyGithub) as any).record.title,'Checkout fails on Safari');

// Host: through the standing server, with the World's own sync.
await withTempDir('worldlet-service-context-',async dir=>{
 const ledger=new WorldLedger(path.join(dir,'world'));
 const secrets=new Map<string,string>();
 const vault={get:(id:string)=>secrets.get(id)??null,set:(id:string,value:string)=>{secrets.set(id,value);},delete:(id:string)=>{secrets.delete(id);},deleteAll:()=>secrets.clear()};
 const access=createAgentAccess({root:path.join(dir,'access'),vault,ledger:()=>ledger});
 const connected=new Set(['github','posthog']);let calls=0;
 const sync=createServiceSync({ledger:()=>ledger,authorize:preset=>connected.has(preset.provider)?{binding:'account-'+preset.provider,version:'1'}:null,
  read:async(request:ServiceRead)=>{calls+=1;return {provider:request.provider,operation:request.operation,scope:'Synthetic',records:request.provider==='github'?[issue]:[error]};},now:()=>1_800_000_000});
 assert.equal(sync.ensureDefaults(),true);
 await sync.tick();await sync.tick();
 const collected=calls;
 const standing=await openStandingWorldTools({access,context:(args,canRead)=>sync.serviceContext(args,canRead),channel:async()=>({error:'not here'})});
 try{
  const home=path.join(dir,'claude-code');fs.mkdirSync(home);
  const {url,token}=JSON.parse(fs.readFileSync(standing.server(home,{id:'claude-code',name:'Claude Code',harness:'claude-code',kind:'local'}).env.WORLDLET_MCP_ENDPOINT_FILE,'utf8'));
  const gateway=async(name:string,args:object)=>{
   const response=await fetch(url,{method:'POST',headers:{authorization:'Bearer '+token},body:JSON.stringify({method:'call',name,arguments:args})});
   return JSON.parse((await response.json()).text);
  };
  const context=(action:string,args:object)=>gateway('call_world_tool',{target:'context',action,arguments:JSON.stringify(args)});
  const offers=async()=>JSON.stringify(await gateway('describe_world_tools',{})).includes('"context"');
  // No "Can read" Grant: not offered, and refused.
  assert.equal(await offers(),false,'not listed without a Service read Grant');
  assert.ok((await context('search',{query:'checkout'})).error);
  // "Can read GitHub": offered; GitHub's saved context only.
  assert.ok(access.grantService('claude-code','github'));
  assert.equal(await offers(),true);
  const one=await context('search',{query:'checkout'});
  assert.deepEqual(one.results.map((r:any)=>r.id),['github:example/app#12']);
  assert.equal(one.untrustedContent,true);
  assert.equal((await context('read',{id:'github:example/app#12'})).record.title,'Checkout fails on Safari');
  assert.equal((await context('read',{id:'posthog:error/1'})).error,SERVICE_CONTEXT_REASONS.missing);
  // "Can read PostHog" too: both.
  assert.ok(access.grantService('claude-code','posthog'));
  assert.deepEqual((await context('search',{query:'checkout'})).results.map((r:any)=>r.id).sort(),['github:example/app#12','posthog:error/1']);
  // A disconnected Service's saved context is not searched; nothing ever asked a Service.
  connected.delete('posthog');
  assert.deepEqual((await context('search',{query:'checkout'})).results.map((r:any)=>r.id),['github:example/app#12']);
  assert.equal(calls,collected,'searching asks no Service');
  // Each call is audited.
  assert.ok(ledger.agentAudit('claude-code',100).some((e:any)=>e.target==='context'&&e.action==='search'&&e.decision==='allowed'));
 }finally{standing.close();sync.stop();ledger.close();}
});
console.log('PASS saved Service context: one search and one read across what the World keeps up to date, every word, newest saved first, only the Services the Agent may read ("Can read <Service>" names both targets), not offered without one, a disconnected Service not searched, no Service asked, untrusted and audited');
