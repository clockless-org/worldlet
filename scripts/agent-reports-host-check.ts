import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {withTempDir} from './test-temp.ts';
import {WorldLedger} from '../platform/electron/src/store/ledger.ts';
import {createAgentAccess} from '../platform/electron/src/modules/agent-runtime/agent-access.ts';
import {createAgentReports} from '../platform/electron/src/modules/agent-runtime/agent-reports.ts';
import {openStandingWorldTools} from '../platform/electron/src/modules/agent-runtime/world-tool-bridge.ts';
import {STANDING_OUTSIDE_TURN} from '../core/agent/grants.ts';
import {REPORT_REASONS} from '../core/agent/reports.ts';

// Agent reports on the host (core/agent/GRANTS.md#agent-reports), the same modules the Electron and Node hosts run:
// each Agent's one report kept in world.sqlite, reached only through the standing `worldlet` MCP server with each
// Agent's own token and Grants (none by default, never a Fox turn's), stamped with the token's Agent, and audited.
await withTempDir('worldlet-agent-reports-',async dir=>{
 const ledger=new WorldLedger(path.join(dir,'world'));
 let clock=Date.parse('2026-10-17T12:00:00.000Z');
 const now=()=>new Date(clock).toISOString();
 const secrets=new Map<string,string>();
 const vault={get:(id:string)=>secrets.get(id)??null,set:(id:string,value:string)=>{secrets.set(id,value);},delete:(id:string)=>{secrets.delete(id);},deleteAll:()=>secrets.clear()};
 const access=createAgentAccess({root:path.join(dir,'access'),vault,ledger:()=>ledger});
 let own=true;
 const reports=createAgentReports({ledger:()=>own?ledger:null,identities:()=>access.list(0).map(entry=>entry.identity),now});
 const standing=await openStandingWorldTools({access,reports:(agentId,args)=>reports.call(agentId,args),channel:async()=>({error:'not here'})});
 try{
  const agent=(id:string,name:string,kind:'local'|'remote'='local')=>{
   const home=path.join(dir,id);fs.mkdirSync(home);
   const {url,token}=JSON.parse(fs.readFileSync(standing.server(home,{id,name,harness:id,kind}).env.WORLDLET_MCP_ENDPOINT_FILE,'utf8'));
   return async(action:string,args:object={})=>{
    const response=await fetch(url,{method:'POST',headers:{authorization:'Bearer '+token},body:JSON.stringify({method:'call',name:'call_world_tool',arguments:{target:'agents',action,arguments:JSON.stringify(args)}})});
    if(response.status!==200)return {status:response.status};
    return JSON.parse((await response.json()).text);
   };
  };
  const release=agent('release-mac','Mac release'),dev=agent('dev-windows','Windows development','remote'),coordinator=agent('coordinator','Coordinator');

  // No Grant by default: refused, nothing stored.
  assert.equal((await release('report',{status:'idle'})).error,STANDING_OUTSIDE_TURN);
  assert.equal((await release('list')).error,STANDING_OUTSIDE_TURN);
  assert.deepEqual(ledger.agentReports(),[]);

  // Reporting: stamped with the token's Agent and the host's time, whatever the model says.
  assert.ok(access.grantReports('release-mac','report'));
  assert.equal((await release('list')).error,STANDING_OUTSIDE_TURN,'reporting is not seeing others');
  const sent=await release('report',{status:'working',summary:'Beta 4470 on macOS',runs:[{id:'beta-4470',title:'Beta 4470',status:'running'}],capacity:{slots:1,busy:1},ttlMinutes:20,agentId:'coordinator'});
  assert.equal(sent.ok,true);assert.equal(sent.liveness,'live');
  assert.deepEqual(ledger.agentReports().map(row=>[row.agentId,row.status,row.reportedAt]),[['release-mac','working',now()]]);
  // A refused report changes nothing.
  assert.equal((await release('report',{status:'idle',summary:'key sk-'+'a'.repeat(30)})).error,REPORT_REASONS.secret);
  assert.equal(ledger.agentReports()[0].status,'working');
  // The next report replaces the last: one per Agent.
  assert.ok(access.grantReports('dev-windows','report'));
  clock+=60_000;
  assert.equal((await dev('report',{status:'working',work:[{title:'Fix the installer',url:'https://github.com/example/app/issues/7'}]})).ok,true);
  assert.equal((await dev('report',{status:'idle'})).ok,true);
  assert.deepEqual(ledger.agentReports().map(row=>[row.agentId,row.status]).sort(),[['dev-windows','idle'],['release-mac','working']]);

  // Seeing: every Agent not revoked, with how each report reads now; marked as untrusted content.
  assert.ok(access.grantReports('coordinator','list'));
  const seen=await coordinator('list');
  assert.equal(seen.untrustedContent,true);
  assert.deepEqual(seen.agents.map((entry:any)=>[entry.id,entry.kind,entry.liveness,entry.report?.status??null]),
   [['dev-windows','remote','live','idle'],['release-mac','local','live','working'],['coordinator','local','offline',null]]);
  assert.equal(seen.agents[1].report.runs[0].id,'beta-4470');
  assert.equal((await coordinator('report',{status:'idle'})).error,STANDING_OUTSIDE_TURN,'seeing is not reporting');
  // Time passes: the release Agent's report reads stale, then offline; a newer report brings it back.
  clock+=20*60_000;
  assert.deepEqual((await coordinator('list',{ids:['release-mac']})).agents.map((entry:any)=>entry.liveness),['stale']);
  clock+=4*20*60_000;
  assert.deepEqual((await coordinator('list',{liveness:'offline'})).agents.map((entry:any)=>entry.id),['dev-windows','release-mac','coordinator']);
  assert.equal((await release('report',{status:'idle'})).ok,true);
  assert.deepEqual((await coordinator('list',{liveness:'live'})).agents.map((entry:any)=>entry.id),['release-mac']);
  // Settings › Agent reads each Agent's state the same way.
  assert.equal(reports.state('release-mac').liveness,'live');assert.equal(reports.state('release-mac').report?.status,'idle');
  assert.deepEqual(reports.state('coordinator'),{liveness:'offline'});

  // Revoking an Agent takes it out of the list and refuses its calls; taking a Grant back refuses the next call.
  access.revoke('dev-windows');
  assert.deepEqual(await dev('report',{status:'idle'}),{status:404});
  assert.ok(!(await coordinator('list')).agents.some((entry:any)=>entry.id==='dev-windows'));
  assert.ok(access.ungrantReports('coordinator','list'));
  assert.equal((await coordinator('list')).error,STANDING_OUTSIDE_TURN);
  // The practice World (or a World without private context) keeps no reports.
  own=false;
  assert.match((await release('report',{status:'idle'})).error,/not ready/);
  assert.deepEqual(reports.state('release-mac'),{liveness:'offline'});

  // Audit: each call's decision, and each change the person made.
  const audit=(agentId:string)=>ledger.agentAudit(agentId,500).filter(e=>e.target==='agents').map(e=>[e.action,e.decision]).reverse();
  assert.deepEqual(audit('release-mac').slice(0,4),[['report','denied'],['list','denied'],['grant-report','allowed'],['list','denied']]);
  assert.deepEqual(audit('coordinator').at(-2),['ungrant-list','allowed']);
 }finally{standing.close();ledger.close();}
});
console.log('PASS agent reports on the host: one report per Agent in world.sqlite, only through each Agent\'s own Grants, stamped from the token, live then stale then offline, revoked Agents gone from the list, audited.');
