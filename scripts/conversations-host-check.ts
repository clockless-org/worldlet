import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {withTempDir} from './test-temp.ts';
import {WorldLedger} from '../platform/electron/src/store/ledger.ts';
import {createAgentAccess} from '../platform/electron/src/modules/agent-runtime/agent-access.ts';
import {createConversationArchive} from '../platform/electron/src/modules/agent-runtime/conversations.ts';
import {openStandingWorldTools} from '../platform/electron/src/modules/agent-runtime/world-tool-bridge.ts';
import {STANDING_OUTSIDE_TURN} from '../core/agent/grants.ts';
import {CONVERSATION_CUT,CONVERSATION_HIDDEN,CONVERSATION_REASONS,hideSecrets} from '../core/agent/conversations.ts';
import {CONVERSATION_LIMITS} from '../contracts/conversations.ts';
import {HERMES_CHANNEL_READ_ONLY} from '../core/agent/hermes-server.ts';

// The conversation archive on the host (core/agent/GRANTS.md#conversation-archive), the same modules the Electron and
// Node hosts run: messages kept in world.sqlite with a search index, reached only through the standing `worldlet` MCP
// server with each Agent's own token and Grants (none by default, never a Fox turn's). Saving again replaces an edit
// and leaves the rest; credential-shaped text is hidden before it is kept; search is any-case substring, newest first;
// the index survives a backup copy; every call is audited.

// Core: what is hidden and what is kept.
const key='sk-'+'a'.repeat(30),github='ghp_'+'B1'.repeat(15),sha='0123456789abcdef0123456789abcdef01234567';
assert.equal(hideSecrets(`use ${key} now`),`use ${CONVERSATION_HIDDEN} now`);
assert.equal(hideSecrets(`token ${github}`),`token ${CONVERSATION_HIDDEN}`);
assert.equal(hideSecrets('Authorization: Bearer abcdefghijklmnop1234'),`Authorization: Bearer ${CONVERSATION_HIDDEN}`);
assert.equal(hideSecrets(`merged as ${sha}`),`merged as ${sha}`,'a commit is not a secret');
assert.equal(hideSecrets('-----BEGIN RSA PRIVATE KEY-----\nMIIE\n-----END RSA PRIVATE KEY-----'),CONVERSATION_HIDDEN);

await withTempDir('worldlet-conversations-',async dir=>{
 const ledger=new WorldLedger(path.join(dir,'world'));
 let clock=Date.parse('2026-10-17T01:00:00.000Z');
 const now=()=>new Date(clock).toISOString();
 const secrets=new Map<string,string>();
 const vault={get:(id:string)=>secrets.get(id)??null,set:(id:string,value:string)=>{secrets.set(id,value);},delete:(id:string)=>{secrets.delete(id);},deleteAll:()=>secrets.clear()};
 const access=createAgentAccess({root:path.join(dir,'access'),vault,ledger:()=>ledger});
 let own=true;
 const archive=createConversationArchive({ledger:()=>own?ledger:null,now});
 const standing=await openStandingWorldTools({access,conversations:(agentId,args)=>archive.call(agentId,args),channel:async()=>({error:'not here'})});
 try{
  const agent=(id:string,name:string)=>{
   const home=path.join(dir,id);fs.mkdirSync(home);
   const {url,token}=JSON.parse(fs.readFileSync(standing.server(home,{id,name,harness:id,kind:'local'}).env.WORLDLET_MCP_ENDPOINT_FILE,'utf8'));
   return async(action:string,args:object={})=>{
    const response=await fetch(url,{method:'POST',headers:{authorization:'Bearer '+token},body:JSON.stringify({method:'call',name:'call_world_tool',arguments:{target:'conversations',action,arguments:JSON.stringify(args)}})});
    if(response.status!==200)return {status:response.status};
    return JSON.parse((await response.json()).text);
   };
  };
  const codex=agent('codex','Codex'),claude=agent('claude-code','Claude Code'),hermes=agent('hermes','Hermes Agent');
  const message=(id:string,at:string,text:string,more:object={})=>({id,thread:'t1',author:'person',at,text,...more});
  const team=[message('m1','2026-10-16T10:00:00Z','Ship the archive on Friday.',{threadTitle:'Archive plan',authorName:'Alex',surface:'chat'}),
   message('m2','2026-10-16T11:00:00Z',`Here is the key ${key}, keep it safe.`,{author:'agent',authorName:'Claude'}),
   message('m3','2026-10-16T12:00:00-07:00','搬迁计划：对话先搬',{thread:'t2'})];

  // No Grant by default: refused, and nothing is kept.
  assert.equal((await codex('add',{source:'Team chat',messages:team})).error,STANDING_OUTSIDE_TURN);
  assert.equal((await hermes('search',{q:'ship'})).error,HERMES_CHANNEL_READ_ONLY);
  assert.equal(ledger.searchArchivedMessages({limit:50,offset:0}).total,0);
  assert.ok(access.grantConversations('codex','add')&&access.grantConversations('claude-code','search'));

  // Saving: stamped with the caller whatever the model says; secrets hidden; times made ISO.
  assert.deepEqual(await codex('add',{source:'Team chat',messages:team,agentId:'hermes'}),{ok:true,source:'Team chat',added:3,updated:0,unchanged:0});
  assert.equal((await codex('search',{q:'ship'})).error,STANDING_OUTSIDE_TURN,'saving is not searching');
  assert.equal((await claude('add',{source:'Team chat',messages:team})).error,STANDING_OUTSIDE_TURN,'searching is not saving');
  const stored=ledger.searchArchivedMessages({limit:50,offset:0});
  assert.equal(stored.total,3);
  assert.deepEqual(stored.messages.map(m=>[m.id,m.agentId,m.at]),[['m3','codex','2026-10-16T19:00:00.000Z'],['m2','codex','2026-10-16T11:00:00.000Z'],['m1','codex','2026-10-16T10:00:00.000Z']]);
  assert.equal(stored.messages[1].text,`Here is the key ${CONVERSATION_HIDDEN}, keep it safe.`);
  assert.ok(!JSON.stringify(stored).includes(key),'the key is nowhere in what is kept');

  // Again: the same messages change nothing; an edit replaces its text and keeps a title the new copy lacks.
  clock+=60_000;
  assert.deepEqual(await codex('add',{source:'Team chat',messages:team}),{ok:true,source:'Team chat',added:0,updated:0,unchanged:3});
  assert.deepEqual(await codex('add',{source:'Team chat',messages:[message('m1','2026-10-16T10:00:00Z','Ship the archive on Monday.')]}),{ok:true,source:'Team chat',added:0,updated:1,unchanged:0});
  // Another source keeps its own IDs.
  assert.deepEqual(await codex('add',{source:'Other project',messages:[message('m1','2026-10-15T09:00:00Z','Ship the old app.')]}),{ok:true,source:'Other project',added:1,updated:0,unchanged:0});

  // Searching: any case, any language, the edit found and the old text gone; filters narrow; newest first.
  const search=async(args:object)=>{const found=await claude('search',args);assert.equal(found.untrustedContent,true);return found;};
  let found=await search({q:'SHIP THE'});
  assert.equal(found.total,2);
  assert.deepEqual(found.messages.map((m:any)=>[m.source,m.id,m.threadTitle,m.authorName]),[['Team chat','m1','Archive plan','Alex'],['Other project','m1','','']]);
  assert.equal(found.messages[0].text,'Ship the archive on Monday.');
  assert.equal((await search({q:'friday'})).total,0,'the edited text is no longer found');
  assert.equal((await search({q:'对话先'})).messages[0].id,'m3');
  assert.equal((await search({q:'HE'})).total,3,'a short query still matches, without the index');
  assert.deepEqual((await search({source:'Team chat',thread:'t1'})).messages.map((m:any)=>m.id),['m2','m1']);
  assert.deepEqual((await search({author:'agent'})).messages.map((m:any)=>m.id),['m2']);
  assert.deepEqual((await search({since:'2026-10-16T10:30:00Z',until:'2026-10-16T19:00:00Z'})).messages.map((m:any)=>m.id),['m2']);
  found=await search({limit:1});
  assert.deepEqual([found.total,found.messages.length,found.messages[0].id],[4,1,'m3'],'limit 1 says how far the archive goes');
  assert.deepEqual((await search({limit:2,offset:2})).messages.map((m:any)=>[m.source,m.id]),[['Team chat','m1'],['Other project','m1']]);
  assert.equal((await search({q:'%'})).total,0,'LIKE wildcards are plain text');

  // Refusals: a bad call changes nothing.
  for(const [args,reason] of [[{source:'',messages:team},CONVERSATION_REASONS.source],[{source:'x'.repeat(CONVERSATION_LIMITS.source+1),messages:team},CONVERSATION_REASONS.source],
   [{source:'Team chat',messages:[]},CONVERSATION_REASONS.messages],[{source:'Team chat',messages:Array.from({length:CONVERSATION_LIMITS.add+1},(_,i)=>message('b'+i,'2026-10-16T10:00:00Z','x'))},CONVERSATION_REASONS.messages],
   [{source:'Team chat',messages:[message('m9','yesterday','x')]},CONVERSATION_REASONS.message],[{source:'Team chat',messages:[{...message('m9','2026-10-16T10:00:00Z','x'),author:'bot'}]},CONVERSATION_REASONS.message],
   [{source:'Team chat',messages:[message('m9','2026-10-16T10:00:00Z','   ')]},CONVERSATION_REASONS.message],[{source:'Team chat',messages:[message('m9','2026-10-16T10:00:00Z','x',{extra:1})]},CONVERSATION_REASONS.message]] as const)
   assert.equal((await codex('add',args)).error,reason);
  assert.equal((await claude('search',{since:'soon'})).error,CONVERSATION_REASONS.time);
  assert.equal((await claude('search',{limit:CONVERSATION_LIMITS.search+1})).error,CONVERSATION_REASONS.invalid);
  assert.equal(ledger.searchArchivedMessages({limit:50,offset:0}).total,4);

  // Long text is cut and marked, never refused.
  const long='word '.repeat(10_000);
  await codex('add',{source:'Team chat',messages:[message('m4','2026-10-16T13:00:00Z',long)]});
  const cut=(await search({thread:'t1',limit:1})).messages[0].text;
  assert.equal([...cut].length,CONVERSATION_LIMITS.text);assert.ok(cut.endsWith(CONVERSATION_CUT));

  // The search index is left out of a backup copy and rebuilt when it is opened.
  const copy=path.join(dir,'copy.sqlite');
  ledger.snapshotTo(copy);
  const restoredDir=path.join(dir,'restored');fs.mkdirSync(restoredDir);
  fs.copyFileSync(copy,path.join(restoredDir,'world.sqlite'));
  const restored=new WorldLedger(restoredDir);
  try{assert.equal(restored.searchArchivedMessages({q:'archive on monday',limit:5,offset:0}).messages[0].id,'m1');}finally{restored.close();}

  // Taken back, revoked, or no World of the person's own: nothing more.
  assert.ok(access.ungrantConversations('claude-code','search'));
  assert.equal((await claude('search',{q:'ship'})).error,STANDING_OUTSIDE_TURN);
  access.revoke('codex');
  assert.deepEqual(await codex('add',{source:'Team chat',messages:team}),{status:404});
  own=false;
  assert.match(archive.call('codex',{operation:'search'}).error,/not ready/);

  // Audit: each call's decision, and each change the person made.
  const audit=(agentId:string)=>ledger.agentAudit(agentId,500).filter(e=>e.target==='conversations').map(e=>[e.action,e.decision]).reverse();
  assert.deepEqual(audit('codex').slice(0,3),[['add','denied'],['grant-add','allowed'],['add','allowed']]);
  assert.deepEqual(audit('claude-code').slice(-2),[['ungrant-search','allowed'],['search','denied']]);
 }finally{standing.close();ledger.close();}
});
console.log('PASS conversation archive on the host: kept in world.sqlite with its search index, only through each Agent\'s own Grants, edits replaced, secrets hidden, long text cut, any-case search with filters, index rebuilt from a backup, audited.');
