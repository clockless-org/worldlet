import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {withTempDir} from './test-temp.ts';
import {WorldLedger} from '../platform/electron/src/store/ledger.ts';
import {createAgentAccess} from '../platform/electron/src/modules/agent-runtime/agent-access.ts';
import {createAgentReports} from '../platform/electron/src/modules/agent-runtime/agent-reports.ts';
import {createScriptAgents} from '../platform/electron/src/modules/agent-runtime/script-agents.ts';
import {openStandingWorldTools,type StandingWorldTools} from '../platform/electron/src/modules/agent-runtime/world-tool-bridge.ts';
import {SCRIPT_AGENT_REASONS,scriptAgentId,scriptAgentName} from '../agent/gate/script-agents.ts';
import {STANDING_OUTSIDE_TURN} from '../agent/gate/grants.ts';

// Agents for scripts (agent/gate/GRANTS.md#agents-for-scripts): the name and ID rules in Core, then the host modules
// the Electron and Node hosts run: an added one gets its own owner-only endpoint file in the MCP home, a program reaches
// the standing server with it under that Agent's own Grants, a new run writes a new token, and revoking removes it.
assert.equal(scriptAgentName('  Nightly build '),'Nightly build');
for(const name of ['','   ','two\nlines','x'.repeat(61),'---',7,'key sk-'+'a'.repeat(30)])assert.throws(()=>scriptAgentName(name),Error,String(name));
assert.throws(()=>scriptAgentName('ghp_'+'a'.repeat(36)),{message:SCRIPT_AGENT_REASONS.secret});
assert.equal(scriptAgentId('Nightly build',[]),'nightly-build');
assert.equal(scriptAgentId('Nightly build',['nightly-build']),'nightly-build-2');
assert.equal(scriptAgentId('Codex',[]),'codex-2','never a Harness\'s own ID');
assert.equal(scriptAgentId('发布机',[]),'script-2','no Latin letters or digits');
assert.equal(scriptAgentId('Mac release · 02',[]),'mac-release-02');
assert.equal(scriptAgentId('A'.repeat(60),[]).length,40);

await withTempDir('worldlet-script-agents-',async dir=>{
 const ledger=new WorldLedger(path.join(dir,'world'));
 const secrets=new Map<string,string>();
 const vault={get:(id:string)=>secrets.get(id)??null,set:(id:string,value:string)=>{secrets.set(id,value);},delete:(id:string)=>{secrets.delete(id);},deleteAll:()=>secrets.clear()};
 const root=path.join(dir,'access'),home=path.join(dir,'home','mcp');
 const access=createAgentAccess({root,vault,ledger:()=>ledger});
 const reports=createAgentReports({ledger:()=>ledger,identities:()=>access.list(0).map(entry=>entry.identity)});
 let standing:Promise<StandingWorldTools>|null=null;
 const open=()=>standing??=openStandingWorldTools({access,reports:(agentId,args)=>reports.call(agentId,args),channel:async()=>({error:'not here'})});
 const scripts=createScriptAgents({root,access,tools:open,home:()=>home});
 const call=async(file:string,target:string,action:string,args:object={})=>{
  const {url,token}=JSON.parse(fs.readFileSync(file,'utf8'));
  const response=await fetch(url,{method:'POST',headers:{authorization:'Bearer '+token},body:JSON.stringify({method:'call',name:'call_world_tool',arguments:{target,action,arguments:JSON.stringify(args)}})});
  if(response.status!==200)return {status:response.status};
  return JSON.parse((await response.json()).text);
 };
 try{
  await scripts.open();
  assert.equal(fs.existsSync(home),false,'nothing written with no Agent for a script');
  const added=await scripts.add('Mac release');
  assert.deepEqual([added.id,added.name,added.endpointFile],['mac-release','Mac release',path.join(home,'worldlet-mcp-endpoint.mac-release.json')]);
  if(process.platform!=='win32')assert.equal(fs.statSync(added.endpointFile).mode&0o777,0o600,'owner-only');
  assert.deepEqual(access.identity('mac-release'),{...access.identity('mac-release')!,id:'mac-release',name:'Mac release',harness:'script',kind:'local'});
  await assert.rejects(scripts.add(''),{message:SCRIPT_AGENT_REASONS.name});
  assert.equal((await scripts.add('Mac release')).id,'mac-release-2','the same name again is another Agent');
  // A program on this computer calls with the file: its own Grants decide, none for reports by default.
  assert.equal((await call(added.endpointFile,'agents','report',{status:'idle'})).error,STANDING_OUTSIDE_TURN);
  assert.ok(access.grantReports('mac-release','report'));
  assert.equal((await call(added.endpointFile,'agents','report',{status:'working',summary:'Beta on macOS'})).ok,true);
  assert.deepEqual(ledger.agentReports().map(row=>row.agentId),['mac-release']);
  // A new run: the same files, new tokens; the old token no longer answers.
  const before=fs.readFileSync(added.endpointFile,'utf8');
  (await open()).close();standing=null;
  await scripts.open();
  const after=fs.readFileSync(added.endpointFile,'utf8');
  assert.notEqual(after,before);
  assert.equal((await call(added.endpointFile,'agents','report',{status:'idle'})).ok,true);
  // Revoking removes its file; a later run does not write it again.
  access.revoke('mac-release');
  assert.equal(fs.existsSync(added.endpointFile),false);
  await scripts.open();
  assert.equal(fs.existsSync(added.endpointFile),false,'revoked stays revoked');
  assert.ok(fs.existsSync(path.join(home,'worldlet-mcp-endpoint.mac-release-2.json')));
  assert.deepEqual(scripts.list().map(item=>item.id),['mac-release','mac-release-2']);
 }finally{(await standing)?.close();ledger.close();}
});
console.log('PASS Agents for scripts: names and IDs checked, an owner-only endpoint file each in the MCP home, calls under its own Grants, a new token each run, revoked removes the file for good.');
