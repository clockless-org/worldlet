import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {withTempDir} from './test-temp.ts';
import {WorldLedger} from '../platform/electron/src/store/ledger.ts';
import {createAgentAccess} from '../platform/electron/src/modules/agent-runtime/agent-access.ts';
import {TRACKED_LINKS_BUCKET,createTrackedLinks} from '../platform/electron/src/modules/agent-runtime/tracked-links.ts';
import {openStandingWorldTools} from '../platform/electron/src/modules/agent-runtime/world-tool-bridge.ts';
import {STANDING_OUTSIDE_TURN} from '../core/agent/grants.ts';
import {LINK_REASONS,saveLinks} from '../core/agent/tracked-links.ts';
import {TRACKED_LINK_LIMITS} from '../contracts/tracked-links.ts';
import {HERMES_CHANNEL_READ_ONLY} from '../core/agent/hermes-server.ts';

// Tracked links on the host (core/agent/GRANTS.md#tracked-links), the same modules the Electron and Node hosts run:
// rows kept in world.sqlite, reached only through the standing `worldlet` MCP server with each Agent's own token and
// Grants (none by default, never a Fox turn's). A save changes only the fields it names, all of a call or nothing;
// reads are newest first and narrowed; every call is audited.

// Core: the person (no Agent) can keep rows too, and the limit on how many a World keeps holds.
const at='2026-10-17T02:00:00.000Z';
const [mine]=saveLinks([],undefined,{rows:[{id:'note-1',title:'A note'}]},at);
assert.equal(mine.agentId,undefined);
assert.throws(()=>saveLinks(Array.from({length:TRACKED_LINK_LIMITS.total},(_,i)=>({...mine,id:'r'+i})),'codex',{rows:[{id:'one-more',title:'x'}]},at),{message:LINK_REASONS.full});

await withTempDir('worldlet-links-',async dir=>{
 const ledger=new WorldLedger(path.join(dir,'world'));
 let clock=Date.parse('2026-10-17T02:00:00.000Z');
 const now=()=>new Date(clock).toISOString();
 const secrets=new Map<string,string>();
 const vault={get:(id:string)=>secrets.get(id)??null,set:(id:string,value:string)=>{secrets.set(id,value);},delete:(id:string)=>{secrets.delete(id);},deleteAll:()=>secrets.clear()};
 const access=createAgentAccess({root:path.join(dir,'access'),vault,ledger:()=>ledger});
 let own=true,changes=0;
 const links=createTrackedLinks({ledger:()=>own?ledger:null,changed:()=>{changes++;},now});
 const standing=await openStandingWorldTools({access,links:(agentId,args)=>links.call(agentId,args),channel:async()=>({error:'not here'})});
 try{
  const agent=(id:string,name:string)=>{
   const home=path.join(dir,id);fs.mkdirSync(home);
   const {url,token}=JSON.parse(fs.readFileSync(standing.server(home,{id,name,harness:id,kind:'local'}).env.WORLDLET_MCP_ENDPOINT_FILE,'utf8'));
   return async(action:string,args:object={})=>{
    const response=await fetch(url,{method:'POST',headers:{authorization:'Bearer '+token},body:JSON.stringify({method:'call',name:'call_world_tool',arguments:{target:'links',action,arguments:JSON.stringify(args)}})});
    if(response.status!==200)return {status:response.status};
    return JSON.parse((await response.json()).text);
   };
  };
  const codex=agent('codex','Codex'),claude=agent('claude-code','Claude Code'),hermes=agent('hermes','Hermes Agent');
  const post={id:'20261016-1',title:'How we build with Agents',type:'Post',channel:'X',text:'Line one.\nLine two.',tags:['Build'],trackingUrl:'https://example.com/?c=20261016-1'};

  // No Grant by default: refused, and nothing is kept.
  assert.equal((await codex('save',{rows:[post]})).error,STANDING_OUTSIDE_TURN);
  assert.equal((await hermes('read')).error,HERMES_CHANNEL_READ_ONLY);
  assert.deepEqual(ledger.records(TRACKED_LINKS_BUCKET),[]);
  assert.ok(access.grantLinks('codex','save')&&access.grantLinks('claude-code','read'));

  // Saving: stamped with the caller whatever the model says; type, channel and tags in lower case.
  assert.deepEqual(await codex('save',{rows:[{...post,agentId:'hermes'}]}),{ok:true,saved:[{id:'20261016-1',revision:1,state:'draft'}]});
  assert.equal(changes,1);
  assert.equal((await codex('read')).error,STANDING_OUTSIDE_TURN,'keeping is not seeing');
  assert.equal((await claude('save',{rows:[post]})).error,STANDING_OUTSIDE_TURN,'seeing is not keeping');
  let [row]=(await claude('read')).links;
  assert.deepEqual([row.agentId,row.type,row.channel,row.tags,row.text,row.revision],['codex','post','x',['build'],'Line one.\nLine two.',1]);

  // A change names only what changes; publishing stamps the time; null clears; the same again changes nothing.
  clock+=60_000;
  assert.deepEqual((await codex('save',{rows:[{id:'20261016-1',state:'published',url:'https://example.com/status/1'}]})).saved,[{id:'20261016-1',revision:2,state:'published'}]);
  [row]=(await claude('read',{ids:['20261016-1']})).links;
  assert.deepEqual([row.title,row.publishedAt,row.url,row.text],['How we build with Agents',now(),'https://example.com/status/1','Line one.\nLine two.']);
  assert.deepEqual((await codex('save',{rows:[{id:'20261016-1',views:1200,viewsAt:now(),trackingUrl:null}]})).saved[0].revision,3);
  [row]=(await claude('read')).links;
  assert.deepEqual([row.views,'trackingUrl' in row],[1200,false]);
  const before=changes;
  assert.deepEqual((await codex('save',{rows:[{id:'20261016-1',views:1200}]})).saved,[],'nothing changed');
  assert.equal(changes,before);

  // Reading: newest first by when published, else made; narrowed by state, channel and time.
  clock+=60_000;
  await codex('save',{rows:[{id:'20261017-1',title:'A long piece',type:'article',channel:'blog'},{id:'20261015-1',title:'Old',channel:'x',state:'published',publishedAt:'2026-10-15T10:00:00Z'}]});
  assert.deepEqual((await claude('read')).links.map((l:any)=>l.id),['20261017-1','20261016-1','20261015-1']);
  assert.deepEqual((await claude('read',{state:'published',channel:'X'})).links.map((l:any)=>l.id),['20261016-1','20261015-1']);
  assert.deepEqual((await claude('read',{since:'2026-10-16T00:00:00Z',limit:1})).links.map((l:any)=>l.id),['20261017-1']);
  assert.equal((await claude('read')).untrustedContent,true);

  // Refusals: a bad row refuses the whole call, and nothing changes.
  const count=ledger.revisions(TRACKED_LINKS_BUCKET).length;
  for(const [rows,reason] of [[[{id:'new-1'}],LINK_REASONS.title],[[{id:'bad id',title:'x'}],LINK_REASONS.id],[[{id:'new-2',title:'ok'},{id:'new-3',title:'Key sk-'+'x'.repeat(30)}],LINK_REASONS.secret],
   [[{id:'new-4',title:'x',url:'http://example.com'}],LINK_REASONS.link],[[{id:'new-5',title:'x',publishedAt:'soon'}],LINK_REASONS.time],[[{id:'new-6',title:'x\ny'}],LINK_REASONS.control],
   [[{id:'new-7',title:'x'},{id:'new-7',title:'y'}],LINK_REASONS.rows],[[{id:'new-8',title:'x',state:'gone'}],LINK_REASONS.invalid],[[{id:'new-9',title:'x',views:-1}],LINK_REASONS.invalid],[[],LINK_REASONS.rows]] as const)
   assert.equal((await codex('save',{rows})).error,reason);
  assert.equal(ledger.revisions(TRACKED_LINKS_BUCKET).length,count,'nothing was saved');
  assert.equal((await claude('read',{state:'gone'})).error,LINK_REASONS.invalid);

  // Taken back, revoked, or no World of the person's own: nothing more.
  assert.ok(access.ungrantLinks('claude-code','read'));
  assert.equal((await claude('read')).error,STANDING_OUTSIDE_TURN);
  access.revoke('codex');
  assert.deepEqual(await codex('save',{rows:[post]}),{status:404});
  own=false;
  assert.match(links.call('codex',{operation:'read'}).error,/not ready/);

  // Audit: each call's decision, and each change the person made.
  const audit=(agentId:string)=>ledger.agentAudit(agentId,500).filter(e=>e.target==='links').map(e=>[e.action,e.decision]).reverse();
  assert.deepEqual(audit('codex').slice(0,3),[['save','denied'],['grant-save','allowed'],['save','allowed']]);
  assert.deepEqual(audit('claude-code').slice(-2),[['ungrant-read','allowed'],['read','denied']]);
 }finally{standing.close();ledger.close();}
});
console.log('PASS tracked links on the host: kept in world.sqlite, only through each Agent\'s own Grants, changes name only their fields, all of a call or nothing, newest first with filters, audited.');
