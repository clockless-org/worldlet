// Fixture installs of the person's own Agents for the RC setup-options check (#1503,
// scripts/setup-options.ts): OpenClaw, Claude Code, pi and Hermes Agent, each with a command the
// setup page can find and a home with memory, conversations, notes, skills and scheduled jobs.
// Each memory holds one fact that exists nowhere else, so Fox can only answer it after bringing that
// Agent in. Nothing here has an API key or model setting, so bringing one never changes Fox's model.
// The homes are passed with the Agents' own relocation variables (OPENCLAW_STATE_DIR,
// CLAUDE_CONFIG_DIR, PI_CODING_AGENT_DIR, HERMES_HOME): this computer's real Agents are never read.
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';

export type FixtureAgent='openclaw'|'claude-code'|'pi'|'hermes';
export const FIXTURE_AGENTS:FixtureAgent[]=['openclaw','claude-code','pi','hermes'];
const COMMANDS:Record<FixtureAgent,string>={openclaw:'openclaw','claude-code':'claude',pi:'pi',hermes:'hermes'};

/** What bringing each fixture must leave in the World, and the question only its memory answers. */
export interface FixtureExpectation {
 /** Its declared name, which becomes Fox's name; null when that Agent keeps none. */
 name:string|null;
 /** The memory sentence the companion profile must hold. */
 fact:string;
 ask:string;
 /** A regular expression (source) the reply must match. */
 answer:string;
 /** At least this many rows in world.sqlite for the source. */
 turns:number;notes:number;skills:number;routines:number;
}
export const FIXTURE_EXPECTATIONS:Record<FixtureAgent,FixtureExpectation>={
 openclaw:{name:'Juniper',fact:'My sailboat is called Marigold Drift.',ask:'What is my sailboat called? Answer from what you remember about me.',answer:'marigold',turns:4,notes:1,skills:1,routines:1},
 'claude-code':{name:null,fact:'My bicycle is a green tandem named Zephyrine.',ask:'What is my bicycle named? Answer from what you remember about me.',answer:'zephyrine',turns:2,notes:1,skills:1,routines:0},
 pi:{name:null,fact:'My cat is a grey tabby named Biscotti.',ask:'What is my cat’s name? Answer from what you remember about me.',answer:'biscotti',turns:2,notes:0,skills:1,routines:0},
 hermes:{name:'Nova',fact:'I grow purple tomatillos on my balcony.',ask:'What do I grow on my balcony? Answer from what you remember about me.',answer:'tomatillo',turns:2,notes:0,skills:1,routines:1}
};

const write=(file:string,text:string)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);};
const jsonl=(...lines:object[])=>lines.map(line=>JSON.stringify(line)).join('\n')+'\n';

/** A command that only starts: choosing one of these Agents at setup never runs its command line
 * (agent-runtime/index.ts `select`), it only has to be found. On Windows it is an npm-style shim
 * the host runs with Node (local-harness.ts `windowsShim`). */
function command(bin:string,name:string,platform:NodeJS.Platform){
 if(platform==='win32'){
  write(path.join(bin,'fixture-agent.js'),"console.log('fixture agent 1.0.0');\n");
  write(path.join(bin,name+'.cmd'),`@ECHO off\r\nnode "%~dp0\\fixture-agent.js" %*\r\n`);
 }else{
  write(path.join(bin,name),"#!/bin/sh\necho 'fixture agent 1.0.0'\n");
  fs.chmodSync(path.join(bin,name),0o755);
 }
}

/** OpenClaw alone, named and with memory, under `root`: also the local Agent the RC onboarding paths
 * choose when this computer has none (scripts/onboarding-paths.ts). */
export function writeOpenClawFixture(root:string,{platform=process.platform}:{platform?:NodeJS.Platform}={}):{bin:string;env:Record<string,string>} {
 const bin=path.join(root,'bin');
 command(bin,COMMANDS.openclaw,platform);
 // A named agent with a channel conversation, daily memory, a skill and a cron job.
 const openclaw=path.join(root,'openclaw'),workspace=path.join(openclaw,'workspace');
 write(path.join(openclaw,'openclaw.json'),JSON.stringify({agents:{defaults:{workspace},entries:{main:{default:true}}},channels:{discord:{guilds:{'111':{channels:{'garden-club':{systemPrompt:'You help plan the community garden.'}}}}}}},null,1));
 write(path.join(workspace,'IDENTITY.md'),'Name: Juniper\n');
 write(path.join(workspace,'MEMORY.md'),FIXTURE_EXPECTATIONS.openclaw.fact+'\n');
 write(path.join(workspace,'memory','2026-09-20.md'),'Watered the seedlings and ordered compost.\n');
 write(path.join(workspace,'skills','garden-log','SKILL.md'),'---\nname: garden-log\ndescription: Keep the garden log.\n---\nWrite one line per visit.\n');
 const event=(role:string,text:string,at:string)=>({type:'message',id:at,timestamp:at,message:{role,content:[{type:'text',text}],timestamp:Date.parse(at)}});
 write(path.join(openclaw,'agents','main','sessions','sessions.json'),JSON.stringify({'agent:main:discord:channel:900':{sessionId:'g1',subject:'#garden-club',channel:'discord'},'agent:main:main':{sessionId:'m1'}}));
 write(path.join(openclaw,'agents','main','sessions','g1.jsonl'),jsonl(event('user','When should we plant garlic?','2026-09-21T09:00:00Z'),event('assistant','Mid October, before the first frost.','2026-09-21T09:00:04Z')));
 write(path.join(openclaw,'agents','main','sessions','m1.jsonl'),jsonl(event('user','Remind me about the compost delivery','2026-09-22T08:00:00Z'),event('assistant','I will remind you Friday morning.','2026-09-22T08:00:03Z')));
 write(path.join(openclaw,'cron','jobs.json'),JSON.stringify({jobs:[{id:'water',name:'Watering reminder',agentId:'main',enabled:true,schedule:{kind:'cron',expr:'0 7 * * *'},payload:{kind:'agentTurn',message:'Remind me to water the seedlings.'}}]}));
 return {bin,env:{OPENCLAW_STATE_DIR:openclaw}};
}

/** Writes the four fixture Agents under `root`; returns the environment that points setup at them. */
export function writeSetupFixtures(root:string,{platform=process.platform}:{platform?:NodeJS.Platform}={}):{bin:string;env:Record<string,string>} {
 const {bin,env:openclaw}=writeOpenClawFixture(root,{platform});
 for(const agent of FIXTURE_AGENTS)if(agent!=='openclaw')command(bin,COMMANDS[agent],platform);
 const facts=Object.fromEntries(FIXTURE_AGENTS.map(agent=>[agent,FIXTURE_EXPECTATIONS[agent].fact])) as Record<FixtureAgent,string>;

 // Claude Code: instructions, one project conversation with its auto memory, and a skill.
 const claude=path.join(root,'claude');
 write(path.join(claude,'CLAUDE.md'),facts['claude-code']+'\n');
 write(path.join(claude,'projects','-fixture-garden','s1.jsonl'),jsonl(
  {type:'user',cwd:'/fixture/garden',timestamp:'2026-09-23T10:00:00Z',message:{role:'user',content:'Add a watering schedule page'}},
  {type:'assistant',timestamp:'2026-09-23T10:00:06Z',message:{role:'assistant',content:[{type:'text',text:'Added the watering schedule page.'}]}},
  {type:'custom-title',customTitle:'Watering page'}));
 write(path.join(claude,'projects','-fixture-garden','memory','MEMORY.md'),'The garden site deploys from the main branch.\n');
 write(path.join(claude,'skills','plant-notes','SKILL.md'),'# Plant notes\n\nSummarize what was planted this week.\n');

 // pi: instructions, one session and a skill; settings without any API key.
 const pi=path.join(root,'pi');
 write(path.join(pi,'AGENTS.md'),facts.pi+'\n');
 write(path.join(pi,'settings.json'),JSON.stringify({theme:'dark'}));
 write(path.join(pi,'sessions','--fixture-site--','2026-09-24_a.jsonl'),jsonl({type:'session',id:'a',cwd:'/fixture/site'},
  {type:'message',timestamp:'2026-09-24T09:00:00Z',message:{role:'user',content:[{type:'text',text:'Add a photo gallery'}]}},
  {type:'message',timestamp:'2026-09-24T09:00:05Z',message:{role:'assistant',content:[{type:'text',text:'Gallery added.'}]}},{type:'session_info',name:'Gallery'}));
 write(path.join(pi,'skills','publish','SKILL.md'),'---\nname: publish\ndescription: Publish the site.\n---\nBuild, then upload.\n');

 // Hermes Agent: a declared persona, memory, a conversation in state.db, a skill and a job.
 // config.yaml has no model provider, so it is found (hermes-files.ts discoverHermes) but brings no model.
 const hermes=path.join(root,'hermes');
 write(path.join(hermes,'config.yaml'),'display:\n  compact: true\n');
 write(path.join(hermes,'SOUL.md'),'**Name:** Nova\nBe warm and brief.\n');
 write(path.join(hermes,'memories','MEMORY.md'),facts.hermes+'\n');
 write(path.join(hermes,'skills','garden','seed-swap','SKILL.md'),'---\nname: seed-swap\ndescription: Organize seed swaps.\n---\nList what to trade.\n');
 write(path.join(hermes,'cron','jobs.json'),JSON.stringify({jobs:[{id:'j1',name:'Weekly seed check',prompt:'List seeds that are running low.',schedule:{kind:'cron',expr:'0 9 * * 1'},enabled:true}]}));
 fs.rmSync(path.join(hermes,'state.db'),{force:true});
 const db=new DatabaseSync(path.join(hermes,'state.db'));
 try{
  db.exec(`CREATE TABLE sessions(id TEXT PRIMARY KEY,source TEXT NOT NULL,display_name TEXT,parent_session_id TEXT,started_at REAL NOT NULL,message_count INTEGER DEFAULT 0,title TEXT);
   CREATE TABLE messages(id INTEGER PRIMARY KEY AUTOINCREMENT,session_id TEXT NOT NULL,role TEXT NOT NULL,content TEXT,timestamp REAL NOT NULL,_compressed_summary INTEGER NOT NULL DEFAULT 0);`);
  db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?,?)').run('h1','telegram','Garden',null,1758700000,2,'Seed swap');
  const message=db.prepare('INSERT INTO messages(session_id,role,content,timestamp,_compressed_summary) VALUES(?,?,?,?,?)');
  message.run('h1','user','Which seeds should I bring to the swap?',1758700000,0);
  message.run('h1','assistant','Bring the extra basil and calendula.',1758700004,0);
 }finally{db.close();}

 return {bin,env:{...openclaw,CLAUDE_CONFIG_DIR:claude,PI_CODING_AGENT_DIR:pi,HERMES_HOME:hermes}};
}

/** The environment for one launch: the fixtures first on PATH and in the Agents' own variables, so this
 * computer's own copies of those Agents are never read. */
export function launchEnvironment(base:NodeJS.ProcessEnv,fixtures:{bin:string;env:Record<string,string>},extra:Record<string,string>):Record<string,string> {
 const relocated=Object.keys(fixtures.env);
 const clean=Object.fromEntries(Object.entries(base).filter(([key,value])=>typeof value==='string'&&!/^(WORLDLET_|ELECTRON_RUN_AS_NODE$|OPENCLAW_)/.test(key)&&!relocated.includes(key))) as Record<string,string>;
 const pathKey=Object.keys(clean).find(key=>key.toUpperCase()==='PATH')??'PATH',separator=process.platform==='win32'?';':':';
 // Node beside the fixture commands: a Windows npm shim runs its script with it.
 clean[pathKey]=[fixtures.bin,path.dirname(process.execPath),clean[pathKey]].filter(Boolean).join(separator);
 return {...clean,...fixtures.env,...extra};
}
