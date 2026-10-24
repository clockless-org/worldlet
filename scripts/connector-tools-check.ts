import assert from 'node:assert/strict';
import path from 'node:path';
import {withTempDir} from './test-temp.ts';
import {WorldLedger} from '../platform/host/store/ledger.ts';
import {createAgentAccess} from '../platform/host/modules/gate/agent-access.ts';
import {createAgentArtifacts} from '../platform/host/modules/gate/agent-artifacts.ts';
import {openStandingWorldTools} from '../platform/host/modules/gate/world-tool-bridge.ts';
import {CONNECTOR_TOOLS,CONNECTOR_TOOL_NAMES,REMOTE_MCP_INSTRUCTIONS,STANDING_OUTSIDE_TURN,connectorCall} from '../agent/gate/index.ts';

// search, fetch and remember for chat connectors (agent/gate/REMOTE-MCP.md#search-fetch-and-remember), through the same
// standing server call remote MCP makes: each is only ordinary World tool calls by the calling Agent, so its own Grants
// decide them and its audit records them. Fictional records only.
assert.deepEqual(CONNECTOR_TOOL_NAMES,['search','fetch','remember']);
for(const tool of CONNECTOR_TOOLS)assert.equal(tool.inputSchema.additionalProperties,false);
assert.match(REMOTE_MCP_INSTRUCTIONS,/search.*fetch.*remember/);

await withTempDir('worldlet-connector-tools-',async dir=>{
 const ledger=new WorldLedger(path.join(dir,'world'));
 const secrets=new Map<string,string>();
 const vault={get:(id:string)=>secrets.get(id)??null,set:(id:string,value:string)=>{secrets.set(id,value);},delete:(id:string)=>{secrets.delete(id);},deleteAll:()=>secrets.clear()};
 const access=createAgentAccess({root:path.join(dir,'access'),vault,ledger:()=>ledger});
 let clock=Date.parse('2026-10-24T20:00:00.000Z');
 const artifacts=createAgentArtifacts({ledger:()=>ledger,name:agentId=>access.identity(agentId)?.name??agentId,changed:()=>{},clock:()=>clock});
 const service={id:'github:issue/7',provider:'github',title:'Fix the export button',url:'https://example.com/issues/7',snippet:'Export does nothing on Safari',fields:{state:'open',comments:3}};
 const memory={id:'mem-1',kind:'memory',source:'Preferences',text:'Prefers short replies in Chinese.'};
 const channelCalls:string[]=[];
 const standing=await openStandingWorldTools({access,
  artifacts:(agent,args,readsAll)=>artifacts.call(agent,args,readsAll),
  context:args=>args.operation==='search'?{ok:true,results:String(args.query).includes('export')?[service]:[],untrustedContent:true}
   :args.id===service.id?{ok:true,savedAt:'2026-10-24T19:00:00.000Z',scope:'Saved',record:service}:{error:'No saved record with that id.'},
  channel:async(name,args)=>{
   channelCalls.push(name);
   if(name!=='read_companion_archive')return {error:'not here'};
   if(args.id)return args.id===memory.id?{records:[{...memory,offset:0}],referenceOnly:true}:{records:[],referenceOnly:true};
   return {records:String(args.query).includes('replies')?[memory]:[],total:1,referenceOnly:true};
  }});
 try{
  const agent={id:'remote-chatgpt-0a1b2c',name:'ChatGPT',harness:'chatgpt',kind:'remote' as const};
  access.ensure(agent);
  const identity=access.identity(agent.id)!;
  const world=(target:string,action:string,args:Record<string,unknown>)=>standing.call(identity,{name:'call_world_tool',arguments:{target,action,arguments:JSON.stringify(args)}});
  const call=(name:string,args:Record<string,unknown>)=>connectorCall(name,args,world);

  // Default Grants: memory is searched; saved Service context and the Journal need their own Grants and say so.
  let found=await call('search',{query:'replies export'});
  assert.deepEqual((found.results as any[]).map(r=>r.id),['memory:mem-1']);
  assert.deepEqual((found.notSearched as any[]).map(r=>r.source),['service','journal']);
  assert.equal(found.untrustedContent,true);
  assert.equal((await call('remember',{title:'Plan',text:'Ship on Friday.'})).error,STANDING_OUTSIDE_TURN,'remember needs "Can save to your Journal"');
  assert.equal((await call('search',{query:''})).error,'A query is required.');

  // With "Can read GitHub" and "Can save to your Journal": every source, and a note it saved is found again.
  assert.ok(access.grantService(agent.id,'github'));
  assert.ok(access.grantArtifacts(agent.id,'save'));
  const saved=await call('remember',{title:'Export bug plan',text:'Fix the Safari export first, then the tests.',key:'export-plan'});
  assert.equal(saved.ok,true,JSON.stringify(saved));
  found=await call('search',{query:'export'});
  const ids=(found.results as any[]).map(r=>r.id);
  assert.deepEqual(ids,['service:github:issue/7','journal:'+saved.id]);
  assert.equal(found.notSearched,undefined);
  assert.equal((found.results as any[])[0].url,service.url);

  // fetch reads each in full by the id search gave.
  const issue=await call('fetch',{id:'service:github:issue/7'});
  assert.deepEqual([issue.title,issue.url,JSON.parse(issue.text as string).comments],['Fix the export button',service.url,3]);
  const note=await call('fetch',{id:'journal:'+saved.id});
  assert.deepEqual([note.title,note.text],['Export bug plan','Fix the Safari export first, then the tests.']);
  const remembered=await call('fetch',{id:'memory:mem-1'});
  assert.deepEqual([remembered.title,remembered.text],['Preferences',memory.text]);
  assert.match(String((await call('fetch',{id:'nowhere:1'})).error),/Unknown id/);
  assert.match(String((await call('fetch',{id:'journal:art-000000000000'})).error),/no longer/);
  // Saving with the same key replaces that note.
  clock+=60_000;
  assert.equal((await call('remember',{title:'Export bug plan',text:'Done.',key:'export-plan'})).id,saved.id);
  assert.equal((await call('fetch',{id:'journal:'+saved.id})).text,'Done.');
  assert.equal((await call('nothing',{})).error,'Unknown tool.');

  // Revoked: everything is refused.
  access.revoke(agent.id);
  const revoked=await call('search',{query:'export'});
  assert.deepEqual(revoked.results,[]);assert.equal((revoked.notSearched as any[]).length,3);
  assert.ok(channelCalls.every(name=>name==='read_companion_archive'));
 }finally{standing.close();ledger.close?.();}
});
console.log('Connector tools: search, fetch and remember are ordinary World tool calls under the calling Agent\'s own Grants.');
