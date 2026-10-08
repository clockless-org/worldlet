// The RC setup-options fixtures (#1503, scripts/setup-fixtures.ts) say what they promise, without
// launching the app: setup finds all four fixture Agents through the environment the launcher
// passes, each brings no model, and bringing each leaves at least what the RC check expects.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {locateLocalHarnesses} from '../platform/electron/src/modules/agent-runtime/local-harness.ts';
import {readLocalAgentMemory} from '../platform/electron/src/modules/agent-runtime/local-memory.ts';
import {bringAgent} from '../platform/electron/src/modules/fox/migration.ts';
import {WorldLedger} from '../platform/electron/src/store/ledger.ts';
import {FIXTURE_AGENTS,FIXTURE_EXPECTATIONS,launchEnvironment,writeSetupFixtures} from './setup-fixtures.ts';
import {BLOCKING,optionOutcome,parseOptions} from './setup-options.ts';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'worldlet-setup-fixtures-'));
try{
 const home=path.join(root,'home');fs.mkdirSync(home);
 const {bin,env:relocated}=writeSetupFixtures(path.join(root,'agents'));
 // Node beside the fixture commands, as the launcher passes it: a Windows npm shim runs its script with it.
 const env={...relocated,PATH:[bin,path.dirname(process.execPath)].join(path.delimiter)};
 // The fixture commands are found first; set-up ones rank ahead.
 const found=locateLocalHarnesses({platform:process.platform,env,home,systemDirectories:[]});
 assert.deepEqual(found.map(item=>item.id).sort(),['claude-code','hermes','openclaw','pi']);
 assert.ok(found.every(item=>item.configured),'each fixture counts as set up through its relocation variable');
 if(process.platform!=='win32')assert.ok(found.every(item=>item.command.startsWith(bin)));

 for(const agent of FIXTURE_AGENTS){
  const expected=FIXTURE_EXPECTATIONS[agent],memory=readLocalAgentMemory(agent,home,env);
  assert.ok(memory,agent+' has memory to bring');
  assert.equal(memory.name,expected.name,agent+' name');
  assert.ok(memory.longTerm.includes(expected.fact),agent+' memory holds its fact');
  assert.ok(new RegExp(expected.answer,'i').test(expected.fact),agent+' answer pattern matches the fact');
  // OpenClaw counts any openclaw.json as a model setting to try; its fixture has no key to copy.
  if(agent!=='openclaw')assert.equal(memory.model,false,agent+' brings no model');

  let turns=0,notes=0;
  const world=new WorldLedger(path.join(root,'world-'+agent));
  try{
   const companion={replaceImportedHistory:(source:string,history:any)=>{assert.equal(source,agent);turns=history.conversations.reduce((sum:number,c:any)=>sum+c.turns.length,0);notes=history.notes.length;return turns+notes;}} as any;
   const brought=await bringAgent(agent,{companion,world,hermesHome:path.join(root,'hermes-'+agent),importRoutines:async routines=>({ok:true,routines:routines.map(r=>r.name),failed:[]}),home,environment:env});
   assert.ok(brought,agent+' brings something');
   assert.equal(brought.partial,false,agent+' comes over whole');
   assert.ok(turns>=expected.turns,`${agent}: ${turns} turns, expected at least ${expected.turns}`);
   assert.ok(notes>=expected.notes,`${agent}: ${notes} notes, expected at least ${expected.notes}`);
   const stored=world.broughtStores().find(store=>store.source===agent);
   assert.ok(Object.keys(stored?.skills??{}).length>=expected.skills,agent+' skills in world.sqlite');
   assert.ok((stored?.routines.length??0)>=expected.routines,agent+' routines in world.sqlite');
  }finally{world.close();}
 }

 // The launcher: options, the environment it passes and how a launch is judged.
 assert.deepEqual(parseOptions([]),['google','codex','claude-code','hermes','openclaw','pi']);
 assert.deepEqual(parseOptions(['pi','openclaw']),['openclaw','pi'],'catalog order');
 assert.throws(()=>parseOptions(['github']),/Unknown option github/);
 assert.equal(BLOCKING,false,'advisory until it has passed on 01 and 02');
 const launched=launchEnvironment({PATH:'/usr/bin',HOME:'/Users/a',HERMES_HOME:'/Users/a/.hermes',CLAUDE_CONFIG_DIR:'/x',OPENCLAW_PROFILE:'work',WORLDLET_AGENT_CONFIG:'x',ELECTRON_RUN_AS_NODE:'1'},{bin:'/f/bin',env:relocated},{WORLDLET_DEV:'1'});
 assert.equal(launched.PATH.split(process.platform==='win32'?';':':')[0],'/f/bin','fixture commands are found first');
 assert.ok(launched.PATH.endsWith('/usr/bin'));
 assert.equal(launched.HERMES_HOME,relocated.HERMES_HOME,'the person’s own Hermes Agent is never read');
 assert.equal(launched.CLAUDE_CONFIG_DIR,relocated.CLAUDE_CONFIG_DIR);
 assert.equal(launched.OPENCLAW_PROFILE,undefined);assert.equal(launched.WORLDLET_AGENT_CONFIG,undefined);assert.equal(launched.ELECTRON_RUN_AS_NODE,undefined);
 assert.equal(launched.HOME,'/Users/a','HOME stays, so Fox keeps this computer’s Codex sign-in');
 assert.equal(launched.WORLDLET_DEV,'1');
 assert.deepEqual(optionOutcome('pi',0,'  1.0s  x\nPASS setup options pi: reached the World and Fox answered; Quit Completely\n',false),{ok:true,skipped:false,reason:null});
 assert.deepEqual(optionOutcome('codex',0,'SKIP setup options codex: Codex is not installed\n',false),{ok:true,skipped:true,reason:null});
 assert.match(optionOutcome('hermes',1,'FAIL setup-options: Fox did not answer on hermes: no answer within 240s\n',false).reason!,/^hermes: Fox did not answer/);
 assert.match(optionOutcome('pi',0,'PASS setup options openclaw: x\n',false).reason!,/without its PASS line/,'another option’s line does not count');
 assert.match(optionOutcome('google',null,'',true).reason!,/timed out/);
 assert.match(optionOutcome('pi',137,'PASS setup options pi: x\n',false).reason!,/exited 137/,'a crash after the PASS line fails');
}finally{fs.rmSync(root,{recursive:true,force:true});}
console.log('PASS setup fixtures: setup finds the four fixture Agents through their relocation variables, none brings a model, each brings the conversations, notes, skills and routines the RC check expects; the launcher puts them first and judges each option by its own PASS line');
