import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {withTempDir} from './test-temp.ts';
import {WorldLedger} from '../platform/electron/src/store/ledger.ts';
import {createAgentAccess} from '../platform/electron/src/modules/agents/agent-access.ts';
import {agentArtifactId,createAgentArtifacts} from '../platform/electron/src/modules/agents/agent-artifacts.ts';
import {openStandingWorldTools} from '../platform/electron/src/modules/agents/world-tool-bridge.ts';
import {STANDING_OUTSIDE_TURN} from '../agent/gate/grants.ts';
import {ARTIFACT_LIMITS,journalDays,readArtifact} from '../context/store/index.ts';
import {AGENT_ARTIFACT_REASONS} from '../agent/gate/index.ts';
import {AGENT_ARTIFACT_LIMITS} from '../contracts/agent-artifacts.ts';

// Agents' Journal artifacts on the host (agent/gate/GRANTS.md#agent-artifacts), the same modules the Electron and Node hosts run:
// kept in world.sqlite's `artifacts` table beside Fox's own, so the Journal lists them; reached only through the standing
// `worldlet` MCP server with each Agent's own token and Grants (none by default, never a Fox turn's); stamped with the
// Agent from its token; a key replaces the same artifact; each Agent keeps its newest 48; a read returns only artifacts
// Agents saved, never Fox's own or an Attention card; audited.
await withTempDir('worldlet-agent-artifacts-',async dir=>{
 const ledger=new WorldLedger(path.join(dir,'world'));
 let clock=Date.parse('2026-10-17T07:00:00.000Z');
 const secrets=new Map<string,string>();
 const vault={get:(id:string)=>secrets.get(id)??null,set:(id:string,value:string)=>{secrets.set(id,value);},delete:(id:string)=>{secrets.delete(id);},deleteAll:()=>secrets.clear()};
 const access=createAgentAccess({root:path.join(dir,'access'),vault,ledger:()=>ledger});
 let own=true;const events:string[]=[];
 const artifacts=createAgentArtifacts({ledger:()=>own?ledger:null,name:agentId=>access.identity(agentId)?.name??agentId,changed:id=>events.push(id),clock:()=>clock});
 const standing=await openStandingWorldTools({access,artifacts:(agentId,args,readsAll)=>artifacts.call(agentId,args,readsAll),channel:async()=>({error:'not here'})});
 // What Fox kept on its own: an answer and an Attention card holding a private mail summary. Neither is an Agent's artifact.
 const t=clock/1000;
 ledger.saveArtifacts([
  {id:'art-fox000000001',kind:'answer',title:'Hourly weather',body:'Fox\'s own answer.',chart:null,size:'small',origin:{type:'conversation',place:'world'},actions:[],createdAt:t-60,updatedAt:t-60},
  {id:'attention-mail-1',kind:'attention',title:'Hourly invoice from Sam',body:'Private: the invoice total.',chart:null,size:'small',origin:{type:'attention',item:'mail-1'},actions:[],createdAt:t-30,updatedAt:t-30},
  // A Fox artifact whose ID a key would derive to: it is never taken over.
  {id:agentArtifactId('codex','taken'),kind:'answer',title:'Fox keeps this',body:'Fox\'s.',chart:null,size:'small',origin:{type:'conversation',place:'world'},actions:[],createdAt:t-10,updatedAt:t-10},
 ]);
 const stored=()=>ledger.artifactRows().flatMap(row=>{const a=readArtifact(row);return a?[a]:[];});
 try{
  const agent=(id:string,name:string)=>{
   const home=path.join(dir,id);fs.mkdirSync(home);
   const {url,token}=JSON.parse(fs.readFileSync(standing.server(home,{id,name,harness:id,kind:'local'}).env.WORLDLET_MCP_ENDPOINT_FILE,'utf8'));
   return async(action:string,args:object={})=>{
    const response=await fetch(url,{method:'POST',headers:{authorization:'Bearer '+token},body:JSON.stringify({method:'call',name:'call_world_tool',arguments:{target:'agent-artifacts',action,arguments:JSON.stringify(args)}})});
    if(response.status!==200)return {status:response.status};
    return JSON.parse((await response.json()).text);
   };
  };
  const codex=agent('codex','Codex'),claude=agent('claude-code','Claude Code'),hermes=agent('hermes','Hermes Agent');
  const hourly={title:'Hourly status · 07:00',body:'**Build** green.\n\n- 3 pull requests open\n- No incidents',brief:'All green at 07:00.',key:'hourly-2026-10-17T07'};

  // No Grant by default: refused, nothing stored.
  assert.equal((await codex('save',hourly)).error,STANDING_OUTSIDE_TURN);
  assert.equal((await codex('read')).error,STANDING_OUTSIDE_TURN);
  assert.equal(stored().length,3);assert.deepEqual(events,[]);

  // Saving: an ordinary answer artifact in the Journal, stamped with the Agent from its token, its place the Agent's name.
  assert.ok(access.grantArtifacts('codex','save'));
  assert.equal((await codex('save',{...hourly,agentId:'claude-code'})).error,AGENT_ARTIFACT_REASONS.invalid,'a spoofed agentId is refused');
  const saved=await codex('save',hourly);
  assert.equal(saved.ok,true);assert.equal(saved.id,agentArtifactId('codex','hourly-2026-10-17T07'));assert.match(saved.id,/^art-[0-9a-f]{12}$/);
  assert.equal(saved.savedAt,'2026-10-17T07:00:00.000Z');
  const first=stored().find(a=>a.id===saved.id)!;
  assert.deepEqual([first.kind,first.agentId,first.origin,first.title,first.brief,first.size],['answer','codex',{type:'conversation',place:'Codex'},hourly.title,hourly.brief,'small']);
  assert.deepEqual(events,[saved.id],'the page hears worldlet:artifacts');
  assert.equal(journalDays(stored(),new Date(clock)).flatMap(day=>day.entries).some(entry=>entry.artifact.id===saved.id),true,'listed in the Journal');
  // The same key replaces the same artifact, which keeps its first time.
  clock+=5*60_000;
  const again=await codex('save',{...hourly,body:'**Build** red.'});
  assert.equal(again.id,saved.id);
  const replaced=stored().filter(a=>a.agentId==='codex');
  assert.equal(replaced.length,1);assert.equal(replaced[0].body,'**Build** red.');assert.equal(replaced[0].createdAt,first.createdAt);assert.ok(replaced[0].updatedAt>first.updatedAt);
  // Refused, with nothing changed: a secret, control characters, too long, a bad key, a key whose artifact is Fox's.
  assert.equal((await codex('save',{title:'Keys',body:'token sk-'+'a'.repeat(30)})).error,AGENT_ARTIFACT_REASONS.secret);
  assert.equal((await codex('save',{title:'Line\nbreak',body:'x'})).error,AGENT_ARTIFACT_REASONS.control);
  assert.equal((await codex('save',{title:'Bidi ‮',body:'x'})).error,AGENT_ARTIFACT_REASONS.control);
  assert.equal((await codex('save',{title:'Long',body:'x'.repeat(ARTIFACT_LIMITS.body+1)})).error,AGENT_ARTIFACT_REASONS.invalid);
  assert.equal((await codex('save',{title:'Key',body:'x',key:'no spaces'})).error,AGENT_ARTIFACT_REASONS.key);
  assert.equal((await codex('save',{title:'Key',body:'x',key:'taken'})).error,AGENT_ARTIFACT_REASONS.taken);
  assert.equal(stored().find(a=>a.id===agentArtifactId('codex','taken'))!.title,'Fox keeps this');
  assert.equal(stored().length,4);

  // Reading with "Can save to your Journal" alone: its own artifacts only; another Agent's is refused.
  const mine=await codex('read');
  assert.equal(mine.untrustedContent,true);
  assert.deepEqual(mine.artifacts,[{id:saved.id,agentId:'codex',title:hourly.title,brief:hourly.brief,body:'**Build** red.',savedAt:'2026-10-17T07:05:00.000Z'}]);
  assert.equal((await codex('read',{agent:'claude-code'})).error,AGENT_ARTIFACT_REASONS.own);
  assert.equal((await codex('read',{limit:51})).error,AGENT_ARTIFACT_REASONS.read);

  // "Can read Agents' Journal artifacts": every Agent's, never Fox's own or an Attention card; filtered and newest first.
  assert.ok(access.grantArtifacts('claude-code','read'));
  assert.equal((await claude('save',hourly)).error,STANDING_OUTSIDE_TURN,'reading is not saving');
  assert.ok(access.grantArtifacts('hermes','save'));
  clock+=60_000;
  const daily=await hermes('save',{title:'Daily summary',body:'Quiet day.'});
  assert.match(daily.id,/^art-[a-z0-9]{12}$/);
  assert.equal(stored().find(a=>a.id===daily.id)!.origin.type==='conversation'&&stored().find(a=>a.id===daily.id)!.agentId,'hermes');
  const all=await claude('read');
  assert.deepEqual(all.artifacts.map((a:any)=>[a.agentId,a.title]),[['hermes','Daily summary'],['codex',hourly.title]]);
  assert.ok(!JSON.stringify(all).includes('Private')&&!JSON.stringify(all).includes('Fox\'s'),'never Fox\'s own or an Attention card');
  assert.deepEqual((await claude('read',{query:'HOURLY status'})).artifacts.map((a:any)=>a.agentId),['codex'],'every word in the title');
  assert.deepEqual((await claude('read',{query:'hourly invoice'})).artifacts,[]);
  assert.deepEqual((await claude('read',{agent:'hermes'})).artifacts.map((a:any)=>a.title),['Daily summary']);
  assert.equal((await claude('read',{limit:1})).artifacts.length,1);

  // Each Agent keeps its newest 48: older ones of that Agent go; Fox's and other Agents' stay.
  for(let n=0;n<AGENT_ARTIFACT_LIMITS.perAgent+2;n++){clock+=1000;assert.equal((await codex('save',{title:`Artifact ${n}`,body:`Number ${n}.`,key:`n-${n}`})).ok,true);}
  const codexKept=stored().filter(a=>a.agentId==='codex');
  assert.equal(codexKept.length,AGENT_ARTIFACT_LIMITS.perAgent);
  assert.ok(!codexKept.some(a=>a.id===saved.id||a.title==='Artifact 0'),'the oldest went first');
  assert.ok(codexKept.some(a=>a.title===`Artifact ${AGENT_ARTIFACT_LIMITS.perAgent+1}`));
  assert.ok(['art-fox000000001','attention-mail-1',agentArtifactId('codex','taken'),daily.id].every(id=>stored().some(a=>a.id===id)));
  assert.equal((await claude('read',{limit:50})).artifacts.length,AGENT_ARTIFACT_LIMITS.perAgent+1);

  // Taking a Grant back refuses the next call; revoking refuses everything; the practice World keeps none.
  assert.ok(access.ungrantArtifacts('claude-code','read'));
  assert.equal((await claude('read')).error,STANDING_OUTSIDE_TURN);
  access.revoke('codex');
  assert.deepEqual(await codex('read'),{status:404});
  own=false;
  assert.match((await hermes('save',{title:'x',body:'y'})).error,/not ready/);

  // Audit: each call's decision, and each change the person made.
  const audit=(agentId:string)=>ledger.agentAudit(agentId,500).filter(e=>e.target==='agent-artifacts').map(e=>[e.action,e.decision]).reverse();
  assert.deepEqual(audit('codex').slice(0,4),[['save','denied'],['read','denied'],['grant-save','allowed'],['save','allowed']]);
  assert.deepEqual(audit('claude-code').slice(0,2),[['grant-read','allowed'],['save','denied']]);
  assert.deepEqual(audit('claude-code').slice(-2),[['ungrant-read','allowed'],['read','denied']]);
 }finally{standing.close();ledger.close();}
});
console.log('PASS Agents\' Journal artifacts on the host: kept with every artifact in world.sqlite and the Journal, only through each Agent\'s own Grants, stamped from the token, a key replaces the same artifact, 48 kept per Agent, reads never return Fox\'s own or Attention cards, audited.');
