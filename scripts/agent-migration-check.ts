import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import {DatabaseSync} from 'node:sqlite';
import {claudeCodeConversationTitle,claudeCodeTurn,hermesConversationIncluded,hermesConversationTitle,hermesRoutine,hermesTurn,migrationMemoryNote,migrationRoutineKey,migrationSkillMarkdown,migrationSkillPath,migrationSkillsSafe,
 openClawAgentSkill,openClawChannelPrompts,openClawConversationIncluded,openClawConversationSkill,openClawConversationTitle,openClawPromptFor,openClawRoutine,openClawSkillName,openClawTurn,piTurn} from '../core/agent/index.ts';
import {openClawAgents,parseJSON5,readOpenClaw,surveyOpenClaw} from '../platform/electron/src/modules/agent-runtime/openclaw-files.ts';
import {surveyAgentHistory} from '../platform/electron/src/modules/agent-runtime/agent-files.ts';
import {firstSentence,localAgentModel,readLocalAgentMemory,summarizeLocalAgent} from '../platform/electron/src/modules/agent-runtime/local-memory.ts';
import {bringAgent,broughtFile,placeBrought,readBrought,restoreBrought} from '../platform/electron/src/modules/fox/migration.ts';
import {allowed as inBackup,validate as validateBackup} from '../platform/electron/src/modules/shell/backup.ts';
import {digest} from '../platform/electron/src/files.ts';
import {WorldLedger} from '../platform/electron/src/store/ledger.ts';
// What the World's database receives, as one list: each conversation's messages, then the notes.
const flat=(history:any)=>[...history.conversations.flatMap((c:any)=>c.turns.map((t:any)=>({...t,session:c.session}))),...history.notes.map((n:any)=>({...n,role:'assistant',text:n.date?`Notes for ${n.date}\n\n${n.text}`:n.text}))];

// Bringing a person's own Agent into Fox, one flow for OpenClaw, Claude Code, pi and Hermes Agent:
// Core's rules (titles, turns, routines, skills), then the host's read-only readers against fixture
// folders (OpenClaw: SQLite sessions with compressed and cold rows, an older JSONL agent, cron table,
// JSON5 config, notes and skills; Claude Code and pi JSONL sessions; Hermes Agent's state.db and
// cron jobs) and the copy into Fox.

// Core rules ---------------------------------------------------------------------------------
assert.equal(openClawConversationIncluded('agent:main:discord:channel:123'),true);
assert.equal(openClawConversationIncluded('agent:main:main'),true);
for(const key of ['cron:daily','agent:main:cron:abc:run:1','hook:9f','agent:main:subagent:x','agent:main:explicit:model-run-1'])assert.equal(openClawConversationIncluded(key),false,key);
assert.equal(openClawConversationIncluded('agent:main:discord:channel:1','cron'),false,'cron-created rows are machinery');
assert.equal(openClawConversationTitle({key:'agent:main:discord:channel:123',subject:'#diet-and-health',channel:'discord'}),'Discord · #diet-and-health');
assert.equal(openClawConversationTitle({key:'agent:main:main'}),'Main chat');
assert.equal(openClawConversationTitle({key:'agent:chef:telegram:direct:42',agentName:'Chef'}),'Chef · Telegram · Direct messages');
assert.equal(openClawConversationTitle({key:'agent:main:slack:channel:C1',displayName:'Slack #flights'}),'Slack #flights','no doubled service name');

assert.deepEqual(openClawTurn({type:'message',timestamp:'2026-09-01T10:00:00.250Z',message:{role:'user',content:[{type:'text',text:'Log my lunch'},{type:'image',data:'x'}],timestamp:1756720800000}}),{role:'user',text:'Log my lunch',at:'2025-09-01T10:00:00Z'});
assert.deepEqual(openClawTurn({type:'message',timestamp:'2026-09-01T10:00:00Z',message:{role:'assistant',content:'Saved.\n[message_id: 991]'}}),{role:'assistant',text:'Saved.',at:'2026-09-01T10:00:00Z'});
for(const event of [{type:'session',id:'s'},{type:'message',message:{role:'toolResult',content:'x'}},{type:'compaction'},{type:'message',message:{role:'assistant',content:[{type:'toolCall',name:'exec'}]}},{type:'message',message:{role:'assistant',content:'NO_REPLY'}}])assert.equal(openClawTurn(event),null,JSON.stringify(event));

const now=Date.parse('2026-10-03T12:00:00Z');
assert.deepEqual(openClawRoutine({id:'news',name:'Morning news',agentId:'main',schedule:{kind:'cron',expr:'0 8 * * *',tz:'America/Los_Angeles'},payload:{kind:'agentTurn',message:'Summarize today’s news.'}},now),{ok:true,routine:{key:'openclaw:main:news',name:'Morning news',prompt:'Summarize today’s news.',schedule:'0 8 * * *',enabled:true}});
assert.equal((openClawRoutine({id:'s',name:'Six',schedule:{kind:'cron',expr:'30 0 8 * * 1-5'},payload:{kind:'agentTurn',message:'x'}},now) as any).routine.schedule,'0 8 * * 1-5','six fields drop seconds');
assert.equal((openClawRoutine({id:'f',name:'Flights',enabled:false,schedule:{kind:'every',everyMs:21_600_000},payload:{kind:'systemEvent',text:'Check SFO→NRT prices.'}},now) as any).routine.schedule,'every 6h');
assert.equal((openClawRoutine({id:'f',name:'Flights',enabled:false,schedule:{kind:'every',everyMs:21_600_000},payload:{kind:'systemEvent',text:'x'}},now) as any).routine.enabled,false);
assert.equal((openClawRoutine({id:'o',name:'Once',schedule:{kind:'at',at:'2026-12-01T09:00:00Z'},payload:{kind:'agentTurn',message:'Remind me'}},now) as any).routine.schedule,'2026-12-01T09:00:00Z');
assert.equal(openClawRoutine({id:'p',name:'Past',schedule:{kind:'at',at:'2026-01-01T09:00:00Z'},payload:{kind:'agentTurn',message:'x'}},now).ok,false);
assert.equal(openClawRoutine({id:'w',name:'Watch',schedule:{kind:'on-exit'},payload:{kind:'agentTurn',message:'x'}},now).ok,false);
assert.equal(openClawRoutine({id:'c',name:'Cmd',schedule:{kind:'every',everyMs:60000},payload:{kind:'command',argv:['ls']}},now).ok,false);
assert.equal(openClawRoutine({id:'t',name:'Trig',schedule:{kind:'every',everyMs:60000},trigger:{script:'json({fire:true})'},payload:{kind:'agentTurn',message:'x'}},now).ok,false);

const config={channels:{discord:{guilds:{'111':{slug:'home',channels:{'diet-and-health':{systemPrompt:'You are a dietitian. Track meals.'},general:{enabled:true}}}}},telegram:{groups:{'-100':{topics:{'7':{systemPrompt:'Reply in Spanish.'}}}}}}};
const prompts=openClawChannelPrompts(config);
assert.deepEqual(prompts,[{provider:'discord',place:['111','diet-and-health'],prompt:'You are a dietitian. Track meals.'},{provider:'telegram',place:['-100','7'],prompt:'Reply in Spanish.'}]);
assert.equal(openClawPromptFor({key:'agent:main:discord:channel:555',title:'Discord · #diet-and-health'},prompts),'You are a dietitian. Track meals.','matched by channel name');
assert.equal(openClawPromptFor({key:'agent:main:telegram:group:-100:topic:7',title:'Telegram · Spanish'},prompts),'Reply in Spanish.','matched by topic id');
assert.equal(openClawPromptFor({key:'agent:main:discord:channel:556',title:'Discord · #general'},prompts),null);
assert.equal(openClawSkillName('openclaw-#Diet & Health!'),'openclaw-diet-health');
const skill=openClawConversationSkill({title:'Discord · #diet-and-health'},'You are a dietitian.');
assert.equal(skill.name,'openclaw-diet-and-health');
assert.match(skill.markdown,/^---\nname: openclaw-diet-and-health\ndescription: "How you helped in OpenClaw's Discord · #diet-and-health\./);
assert.match(skill.markdown,/read_companion_archive/);
assert.match(openClawAgentSkill({id:'chef',name:'Chef',soul:'Cook well.',memory:'Likes ramen.',user:'',conversations:['Chef · Discord · #recipes']}).markdown,/## What it remembered\n\nLikes ramen\./);
assert.match(migrationMemoryNote({source:'openclaw',conversations:['Discord · #diet-and-health'],routines:['Morning news'],skills:['openclaw-diet-and-health'],notes:3}),/^Brought over from OpenClaw on this computer:\n- Past conversations \(search with read_companion_archive\): Discord · #diet-and-health\.\n- 3 notes, searchable as "OpenClaw notes"/);
assert.equal(migrationMemoryNote({source:'pi',conversations:[],routines:[],skills:[],notes:0}),'');

// Claude Code, pi and Hermes Agent lines ---------------------------------------------------------
assert.deepEqual(claudeCodeTurn({type:'user',timestamp:'2026-09-05T10:00:00.120Z',message:{role:'user',content:'Fix the login redirect'}}),{role:'user',text:'Fix the login redirect',at:'2026-09-05T10:00:00Z'});
assert.deepEqual(claudeCodeTurn({type:'assistant',timestamp:'2026-09-05T10:00:09Z',message:{role:'assistant',content:[{type:'thinking',thinking:'hm'},{type:'text',text:'Fixed it.'},{type:'tool_use',name:'Edit'}]}}),{role:'assistant',text:'Fixed it.',at:'2026-09-05T10:00:09Z'});
assert.equal(claudeCodeTurn({type:'user',message:{role:'user',content:'Run it <system-reminder>x</system-reminder>'}})?.text,'Run it');
for(const line of [{type:'user',isMeta:true,message:{role:'user',content:'meta'}},{type:'user',isSidechain:true,message:{role:'user',content:'agent'}},{type:'user',message:{role:'user',content:[{type:'tool_result',content:'ok'}]}},
 {type:'user',message:{role:'user',content:'<command-name>/clear</command-name>'}},{type:'user',message:{role:'user',content:'[Request interrupted by user]'}},{type:'summary',summary:'x'},{type:'ai-title',aiTitle:'x'}])assert.equal(claudeCodeTurn(line),null,JSON.stringify(line));
assert.equal(claudeCodeConversationTitle({title:'Fix the login redirect',cwd:'/Users/a/worldlet'}),'worldlet · Fix the login redirect');
assert.equal(claudeCodeConversationTitle({cwd:'/Users/a/worldlet',first:'Please   look at the failing build on main and tell me why it broke this morning'}),'worldlet · Please look at the failing build on main and tell me why it…');
assert.equal(piTurn,openClawTurn,'pi writes OpenClaw’s session tree');
assert.equal(hermesConversationIncluded({id:'20260901_1',source:'telegram'}),true);
for(const session of [{id:'worldlet-context-1',source:'cli'},{id:'c',source:'cron'},{id:'s',source:'subagent'}])assert.equal(hermesConversationIncluded(session),false,JSON.stringify(session));
assert.equal(hermesConversationTitle({source:'telegram',title:'Trip planning'}),'Telegram · Trip planning');
assert.deepEqual(hermesTurn({role:'user',content:'Plan Kyoto',timestamp:1756720800.5}),{role:'user',text:'Plan Kyoto',at:'2025-09-01T10:00:00Z'});
assert.equal(hermesTurn({role:'tool',content:'{}',timestamp:1}),null);
assert.equal(hermesTurn({role:'assistant',content:'Summary of earlier turns',timestamp:1,summary:1}),null);
assert.deepEqual(hermesRoutine({id:'a1',name:'Digest',prompt:'Summarize my inbox.',schedule:{kind:'cron',expr:'0 7 * * 1-5'},enabled:true},now),{ok:true,routine:{key:'hermes:a1',name:'Digest',prompt:'Summarize my inbox.',schedule:'0 7 * * 1-5',enabled:true}});
assert.equal((hermesRoutine({id:'b',prompt:'Check prices',schedule:{kind:'interval',minutes:120},state:'paused'},now) as any).routine.schedule,'every 2h');
assert.equal((hermesRoutine({id:'b',prompt:'Check prices',schedule:{kind:'interval',minutes:120},state:'paused'},now) as any).routine.enabled,false);
assert.equal(hermesRoutine({id:'c',prompt:'x',script:'watch.py',schedule:{kind:'interval',minutes:5}},now).ok,false);
assert.equal(hermesRoutine({id:'d',prompt:'x',schedule:{kind:'once',run_at:'2026-01-01T00:00:00Z'}},now).ok,false);
assert.equal(migrationRoutineKey('hermes:a1'),true);assert.equal(migrationRoutineKey('cron:a1'),false);
// Brought skills come back from backups, so only the shapes bringing an Agent makes are ever written.
assert.deepEqual(migrationSkillPath('budget','SKILL.md'),['budget','SKILL.md']);
assert.deepEqual(migrationSkillPath('budget-2','references/Food Plan.md'),['budget-2','references','Food Plan.md']);
for(const [folder,relative] of [['..','SKILL.md'],['../x','SKILL.md'],['/tmp','SKILL.md'],['Budget','SKILL.md'],['a/b','SKILL.md'],['a\\b','SKILL.md'],['','SKILL.md'],
 ['budget','../SKILL.md'],['budget','a/../../SKILL.md'],['budget','/etc/x.md'],['budget','a\\..\\x.md'],['budget','C:x.md'],['budget','.hidden.md'],['budget','run.sh'],
 ['budget','a//x.md'],['budget','a/b/c/d.md'],['budget','x.md '],['budget','x\u0000.md']])assert.equal(migrationSkillPath(folder,relative),null,folder+' '+relative);
assert.equal(migrationSkillsSafe({plan:{'SKILL.md':'# Plan'}}),true);
assert.equal(migrationSkillsSafe({plan:{'../../x.md':'x'}}),false);assert.equal(migrationSkillsSafe({'../plan':{'SKILL.md':'x'}}),false);assert.equal(migrationSkillsSafe({plan:{'SKILL.md':1}}),false);assert.equal(migrationSkillsSafe([]),false);
assert.equal(migrationSkillMarkdown('---\nname: pdf\ndescription: Read PDFs.\n---\nBody','pdf','claude-code'),'---\nname: pdf\ndescription: Read PDFs.\n---\nBody','complete frontmatter stays as written');
assert.equal(migrationSkillMarkdown('# Release notes\n\nWrite release notes from merged PRs.\n','release-notes','pi'),'---\nname: release-notes\ndescription: "Write release notes from merged PRs."\n---\n\n# Release notes\n\nWrite release notes from merged PRs.\n');
assert.match(migrationSkillMarkdown('---\ndescription: Deploys.\n---\nSteps','Deploy It','claude-code'),/^---\nname: deploy-it\ndescription: Deploys\.\n---/);

// JSON5 config -------------------------------------------------------------------------------
assert.deepEqual(parseJSON5(`{
 // agents
 agents: {entries: {main: {default: true}, 'chef': {workspace: "~/.openclaw/workspace-chef",},},},
 /* channels */ channels: {discord: {guilds: {"111": {channels: {recipes: {systemPrompt: 'Say "yum".'}}}}}},
}`),{agents:{entries:{main:{default:true},chef:{workspace:'~/.openclaw/workspace-chef'}}},channels:{discord:{guilds:{'111':{channels:{recipes:{systemPrompt:'Say "yum".'}}}}}}});

// Fixture OpenClaw -----------------------------------------------------------------------------
const home=fs.mkdtempSync(path.join(os.tmpdir(),'worldlet-openclaw-'));
const state=path.join(home,'.openclaw'),env={} as NodeJS.ProcessEnv;
const write=(file:string,text:string|Buffer)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);};
try{
 write(path.join(state,'openclaw.json'),`{
  agents: {defaults: {workspace: "~/.openclaw/workspace"}, entries: {main: {default: true}, chef: {name: "Chef", workspace: "~/.openclaw/workspace-chef"}, old: {}}},
  channels: {discord: {guilds: {"111": {channels: {"diet-and-health": {systemPrompt: "You are a dietitian."}}}}}},
 }`);
 write(path.join(state,'workspace','IDENTITY.md'),'Name: Nova\n');
 write(path.join(state,'workspace','MEMORY.md'),'Prefers metric units.');
 write(path.join(state,'workspace','memory','2026-09-01.md'),'Weighed in at 70 kg.');
 write(path.join(state,'workspace','memory','2026-09-02.md'),'Booked dentist.');
 write(path.join(state,'workspace','memory','notes.md'),'not a daily note');
 write(path.join(state,'workspace','skills','budget','SKILL.md'),'---\nname: budget\ndescription: Bookkeeping.\n---\nUse the ledger.');
 write(path.join(state,'workspace','skills','budget','references','categories.md'),'Food, Rent');
 write(path.join(state,'workspace','skills','budget','scripts','run.sh'),'rm -rf /');
 write(path.join(state,'workspace','skills','no-skill','README.md'),'not a skill');
 write(path.join(state,'workspace-chef','SOUL.md'),'You are Chef. Suggest recipes.');
 write(path.join(state,'workspace-chef','MEMORY.md'),'Allergic to peanuts.');
 write(path.join(state,'skills','house-plans','SKILL.md'),'---\nname: house-plans\ndescription: Read floor plans.\n---\nMeasure rooms.');

 // Main agent: current SQLite store, with a compressed row, a reset window and a cold window.
 const event=(role:string,text:string,at:string)=>JSON.stringify({type:'message',id:at,timestamp:at,message:{role,content:[{type:'text',text}],timestamp:Date.parse(at)}});
 const coldLines=[JSON.stringify({type:'session',id:'cold'}),event('user','Old diet question','2026-07-01T09:00:00Z'),event('assistant','Old diet answer','2026-07-01T09:00:05Z')].join('\n');
 write(path.join(state,'agents','main','sessions','cold','abc.jsonl.zst'),zlib.zstdCompressSync(Buffer.from(coldLines)));
 fs.mkdirSync(path.join(state,'agents','main','agent'),{recursive:true});
 const db=new DatabaseSync(path.join(state,'agents','main','agent','openclaw-agent.sqlite'));
 db.exec(`CREATE TABLE session_nodes(session_key TEXT PRIMARY KEY,current_session_id TEXT,entry_json TEXT,label TEXT,display_name TEXT,created_via TEXT,updated_at INTEGER);
  CREATE TABLE session_windows(session_id TEXT PRIMARY KEY,session_key TEXT,created_at INTEGER);
  CREATE TABLE transcript_events(session_id TEXT,seq INTEGER,event_json TEXT,created_at INTEGER,event_zstd BLOB,PRIMARY KEY(session_id,seq));
  CREATE TABLE session_transcript_cold_archives(session_id TEXT PRIMARY KEY,archive_name TEXT,storage TEXT,archive_blob BLOB);`);
 const node=db.prepare('INSERT INTO session_nodes VALUES(?,?,?,?,?,?,0)'),win=db.prepare('INSERT INTO session_windows VALUES(?,?,?)'),row=db.prepare('INSERT INTO transcript_events VALUES(?,?,?,0,?)');
 node.run('agent:main:discord:channel:555','s2',JSON.stringify({subject:'#diet-and-health',channel:'discord'}),null,null,'channel');
 win.run('s0','agent:main:discord:channel:555',1);win.run('s1','agent:main:discord:channel:555',2);win.run('s2','agent:main:discord:channel:555',3);
 db.prepare('INSERT INTO session_transcript_cold_archives VALUES(?,?,?,NULL)').run('s0','abc.jsonl.zst','file');
 row.run('s1',1,JSON.stringify({type:'session',id:'s1'}),null);
 row.run('s1',2,event('user','I had a salad','2026-09-01T12:00:00Z'),null);
 row.run('s1',3,null,zlib.zstdCompressSync(Buffer.from(event('assistant','Logged the salad.','2026-09-01T12:00:03Z'))));
 row.run('s1',4,JSON.stringify({type:'message',message:{role:'toolResult',content:'ok'}}),null);
 row.run('s2',1,event('user','What did I eat Monday?\n[message_id: 77]','2026-09-03T08:00:00Z'),null);
 row.run('s2',2,event('assistant','A salad.','2026-09-03T08:00:02Z'),null);
 node.run('cron:news','c1','{}',null,null,'cron');win.run('c1','cron:news',4);row.run('c1',1,event('assistant','Digest','2026-09-03T08:00:00Z'),null);
 node.run('agent:main:main','m1',JSON.stringify({}),null,null,'operator');win.run('m1','agent:main:main',5);row.run('m1',1,event('user','Hello Nova','2026-09-04T08:00:00Z'),null);
 db.close();

 // Chef: an older JSONL store.
 write(path.join(state,'agents','chef','sessions','sessions.json'),JSON.stringify({'agent:chef:discord:channel:900':{sessionId:'k1',subject:'#recipes',channel:'discord'},'agent:chef:cron:x':{sessionId:'k2'}}));
 write(path.join(state,'agents','chef','sessions','k1.jsonl'),[event('user','Dinner idea?','2026-08-01T18:00:00Z'),event('assistant','Ramen without peanuts.','2026-08-01T18:00:04Z')].join('\n'));
 write(path.join(state,'agents','chef','sessions','k2.jsonl'),event('assistant','cron output','2026-08-01T18:00:00Z'));

 // Automations in the shared state database.
 fs.mkdirSync(path.join(state,'state'),{recursive:true});
 const shared=new DatabaseSync(path.join(state,'state','openclaw.sqlite'));
 shared.exec('CREATE TABLE cron_jobs(store_key TEXT,job_id TEXT,name TEXT,enabled INTEGER,agent_id TEXT,payload_kind TEXT,job_json TEXT,sort_order INTEGER,PRIMARY KEY(store_key,job_id))');
 const job=shared.prepare('INSERT INTO cron_jobs VALUES(?,?,?,?,?,?,?,?)');
 job.run('default','news','Morning news',1,'main','agentTurn',JSON.stringify({schedule:{kind:'cron',expr:'0 8 * * *'},payload:{kind:'agentTurn',message:'Summarize the news.'}}),0);
 job.run('default','flights','Flight prices',0,'main','systemEvent',JSON.stringify({schedule:{kind:'every',everyMs:3_600_000},payload:{kind:'systemEvent',text:'Check SFO to Tokyo prices.'}}),1);
 job.run('default','watch','Build watcher',1,'main','agentTurn',JSON.stringify({schedule:{kind:'stream'},payload:{kind:'agentTurn',message:'x'}}),2);
 shared.close();

 const agents=openClawAgents(home,env);
 assert.deepEqual(agents.map(a=>[a.id,a.name,a.default,!!a.workspace]),[['main','Nova',true,true],['chef','Chef',false,true],['old','old',false,false]]);
 assert.deepEqual(surveyOpenClaw(home,env),{agents:3,conversations:3,notes:2,skills:2,jobs:2});

 const data=readOpenClaw(home,env)!;
 assert.deepEqual(data.problems,[]);
 assert.deepEqual(data.conversations.map(c=>[c.agentId,c.title,c.turns.map(t=>t.role[0]+':'+t.text)]),[
  ['main','Discord · #diet-and-health',['u:Old diet question','a:Old diet answer','u:I had a salad','a:Logged the salad.','u:What did I eat Monday?','a:A salad.']],
  ['main','Main chat',['u:Hello Nova']],
  ['chef','Chef · Discord · #recipes',['u:Dinner idea?','a:Ramen without peanuts.']]
 ]);
 assert.deepEqual(data.notes.map(n=>[n.agentId,n.date]),[['main','2026-09-01'],['main','2026-09-02']]);
 assert.deepEqual(data.skills.map(s=>[s.name,s.files.map(f=>f.relative).sort()]),[['budget',['SKILL.md','references/categories.md']],['house-plans',['SKILL.md']]]);
 assert.equal(data.jobs.length,3);

 // Copying into Fox: past conversations, skills and routines.
 let saved:any[]=[],asked:any[]=[];
 const companion={replaceImportedHistory:(source:string,history:any)=>{assert.equal(source,'openclaw');saved=flat(history);return saved.length;}} as any;
 const hermes=path.join(home,'hermes');
 write(path.join(hermes,'skills','openclaw','stale','SKILL.md'),'old');
 const world=new WorldLedger(path.join(home,'world'));
 const brought=await bringAgent('openclaw',{companion,world,hermesHome:hermes,importRoutines:async routines=>{asked=routines;return {ok:true,routines:routines.map(r=>r.name),failed:[]};},now,home,environment:env});
 assert.ok(brought);
 assert.equal(brought.conversations,3);assert.equal(brought.messages,9);assert.equal(brought.notes,2);
 assert.deepEqual(new Set(saved.map(t=>t.session)),new Set(['OpenClaw · Discord · #diet-and-health','OpenClaw · Main chat','OpenClaw · Chef · Discord · #recipes','OpenClaw notes']));
 assert.ok(saved.every(t=>/^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/.test(t.id)&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(t.createdAt)),'archive-valid ids and times');
 assert.equal(new Set(saved.map(t=>t.id)).size,saved.length);
 assert.deepEqual(asked.map(r=>[r.key,r.schedule,r.enabled]),[['openclaw:main:news','0 8 * * *',true],['openclaw:main:flights','every 1h',false]]);
 assert.deepEqual(brought.stayed,[{name:'Build watcher',reason:'It is started by another program, not by the clock.'}]);
 assert.deepEqual(brought.skills.sort(),['budget','house-plans','openclaw-agent-chef','openclaw-diet-and-health']);
 const skills=path.join(hermes,'skills','openclaw');
 assert.equal(fs.existsSync(path.join(skills,'stale')),false,'bringing again replaces the earlier copy');
 assert.match(fs.readFileSync(path.join(skills,'openclaw-diet-and-health','SKILL.md'),'utf8'),/You are a dietitian\./);
 assert.match(fs.readFileSync(path.join(skills,'openclaw-agent-chef','SKILL.md'),'utf8'),/Allergic to peanuts\./);
 assert.equal(fs.readFileSync(path.join(skills,'budget','references','categories.md'),'utf8'),'Food, Rent');
 assert.equal(fs.existsSync(path.join(skills,'budget','scripts')),false,'scripts stay behind');
 assert.match(brought.note,/Discord · #diet-and-health/);assert.match(brought.note,/Routines: Morning news, Flight prices\./);
 assert.deepEqual(fs.readdirSync(state).sort(),['agents','openclaw.json','skills','state','workspace','workspace-chef'],'nothing written into OpenClaw');

 // The World keeps the skills and routines; a new or reset Harness gets them back from there.
 const kept=readBrought(world);
 assert.deepEqual(kept.map(entry=>[entry.source,Object.keys(entry.skills).sort(),entry.routines.map(r=>r.key)]),[['openclaw',['budget','house-plans','openclaw-agent-chef','openclaw-diet-and-health'],['openclaw:main:news','openclaw:main:flights']]]);
 assert.equal(fs.existsSync(broughtFile(world.root,'openclaw')),false,'kept in the database, not a file');
 // An earlier World kept them as a file; it moves in once and stays beside it.
 write(broughtFile(world.root,'pi'),JSON.stringify({version:1,source:'pi',skills:{plan:{'SKILL.md':'# Plan'}},routines:[]}));
 assert.deepEqual(readBrought(world).map(entry=>[entry.source,Object.keys(entry.skills)]),[['openclaw',['budget','house-plans','openclaw-agent-chef','openclaw-diet-and-health']],['pi',['plan']]]);
 assert.ok(!fs.existsSync(broughtFile(world.root,'pi'))&&fs.existsSync(broughtFile(world.root,'pi')+'.before-database'));
 world.replaceBrought('pi',{},[]);
 // A restored store with paths that leave the skill folder: only the safe files are written, all inside it.
 const unsafeHome=path.join(home,'unsafe-hermes');
 const listHome=()=>{const out:string[]=[];const walk=(dir:string)=>{for(const item of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory())walk(file);else out.push(path.relative(home,file));}};walk(home);return out;};
 const beforeUnsafe=new Set(listHome());
 const placedUnsafe=await placeBrought({version:1,source:'pi',routines:[],skills:{'../../escape':{'SKILL.md':'x'},plan:{'SKILL.md':'# Plan','refs/a.md':'A','../../../../escaped.md':'x','/abs.md':'x','..\\..\\win.md':'x','run.sh':'x'}}},{hermesHome:unsafeHome,importRoutines:null});
 assert.deepEqual(placedUnsafe.skills,['plan']);
 assert.deepEqual(listHome().filter(file=>!beforeUnsafe.has(file)).sort(),
  [path.join('unsafe-hermes','skills','pi','.worldlet-brought'),path.join('unsafe-hermes','skills','pi','plan','SKILL.md'),path.join('unsafe-hermes','skills','pi','plan','refs','a.md')],'nothing is written outside the skill folder');
 for(const escaped of [path.resolve(unsafeHome,'skills','pi','plan','../../../../escaped.md'),path.resolve(unsafeHome,'skills','pi','../../escape','SKILL.md'),'/abs.md'])assert.equal(fs.existsSync(escaped),false,escaped);
 // A backup carrying such a store is refused, as an older file or in the World's database.
 const host={optional:()=>null} as any;
 const entry=(file:string,data:Buffer)=>({path:file,data,sha256:digest(data)});
 const unsafeStore=Buffer.from(JSON.stringify({version:1,source:'pi',skills:{plan:{'../../../escape.md':'x'}},routines:[]}));
 assert.throws(()=>validateBackup(host,{version:1,createdAt:new Date(),preferences:{},files:[entry('companion/brought/pi.json',unsafeStore)]}),/unsafe brought skill/);
 const unsafeWorld=new WorldLedger(path.join(home,'unsafe-world'));
 unsafeWorld.replaceBrought('pi',{'../../escape':{'SKILL.md':'x'}},[]);unsafeWorld.close();
 assert.throws(()=>validateBackup(host,{version:1,createdAt:new Date(),preferences:{},files:[entry('world.sqlite',fs.readFileSync(path.join(home,'unsafe-world','world.sqlite')))]}),/unsafe brought skill/);
 assert.ok(inBackup({optional:()=>null} as any,'companion/brought/openclaw.json'),'older backups keep restoring it');assert.ok(!inBackup({optional:()=>null} as any,'companion/brought/other.json'));
 let again:any[]=[];
 const reimport=async(routines:any[])=>{again=routines;return {ok:true,routines:routines.map(r=>r.name),failed:[]};};
 assert.deepEqual(await restoreBrought(world,{hermesHome:hermes,importRoutines:reimport}),[],'a Harness that already has the copy is left alone');
 assert.equal(again.length,0);
 const fresh=path.join(home,'fresh-hermes');
 assert.deepEqual(await restoreBrought(world,{hermesHome:fresh,importRoutines:reimport}),['openclaw']);
 assert.equal(fs.readFileSync(path.join(fresh,'skills','openclaw','budget','references','categories.md'),'utf8'),'Food, Rent');
 assert.deepEqual(again.map(r=>r.key),['openclaw:main:news','openclaw:main:flights'],'its routines are scheduled again');
 assert.deepEqual(await restoreBrought(world,{hermesHome:fresh,importRoutines:async()=>{throw new Error('called again');}}),[]);
 // A copy that could not be finished is tried again next time.
 const failing=path.join(home,'failing-hermes');
 await restoreBrought(world,{hermesHome:failing,importRoutines:async()=>{throw new Error('Hermes is busy');}});
 assert.deepEqual(await restoreBrought(world,{hermesHome:failing,importRoutines:reimport}),['openclaw']);
 world.close();
}finally{fs.rmSync(home,{recursive:true,force:true});}

// Claude Code, pi, Hermes Agent and Codex come over the same way -------------------------------------
const others=fs.mkdtempSync(path.join(os.tmpdir(),'worldlet-agents-'));
try{
 const put=(file:string,text:string|Buffer)=>{fs.mkdirSync(path.dirname(path.join(others,file)),{recursive:true});fs.writeFileSync(path.join(others,file),text);};
 const snapshot=(folder:string)=>{const out:string[]=[];const walk=(dir:string)=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else out.push(path.relative(others,file)+':'+fs.statSync(file).size);}};walk(path.join(others,folder));return out.sort();};
 const jsonl=(...lines:object[])=>lines.map(line=>JSON.stringify(line)).join('\n')+'\n';
 // Claude Code: two projects, a meta line, a tool round trip, a side chain, titles and auto memory.
 put('.claude/CLAUDE.md','Always answer briefly.');
 put('.claude/projects/-Users-a-worldlet/s1.jsonl',jsonl(
  {type:'user',isMeta:true,cwd:'/Users/a/worldlet',timestamp:'2026-09-05T10:00:00Z',message:{role:'user',content:'<local-command-caveat>x</local-command-caveat>'}},
  {type:'user',cwd:'/Users/a/worldlet',timestamp:'2026-09-05T10:00:01Z',message:{role:'user',content:'Fix the login redirect'}},
  {type:'assistant',timestamp:'2026-09-05T10:00:05Z',message:{role:'assistant',content:[{type:'tool_use',id:'t',name:'Read',input:{}}]}},
  {type:'user',timestamp:'2026-09-05T10:00:06Z',message:{role:'user',content:[{type:'tool_result',tool_use_id:'t',content:'file'}]}},
  {type:'assistant',isSidechain:true,timestamp:'2026-09-05T10:00:07Z',message:{role:'assistant',content:[{type:'text',text:'sub-agent'}]}},
  {type:'assistant',timestamp:'2026-09-05T10:00:09Z',message:{role:'assistant',content:[{type:'text',text:'Fixed the redirect.'}]}},
  {type:'ai-title',aiTitle:'Login redirect'},{type:'custom-title',customTitle:'Sign-in fix'}));
 put('.claude/projects/-Users-a-notes/s2.jsonl',jsonl({type:'user',cwd:'/Users/a/notes',timestamp:'2026-09-06T08:00:00Z',message:{role:'user',content:'Plan my week'}},{type:'assistant',timestamp:'2026-09-06T08:00:04Z',message:{role:'assistant',content:[{type:'text',text:'Here is a plan.'}]}}));
 put('.claude/projects/-Users-a-notes/empty.jsonl',jsonl({type:'summary',summary:'nothing'}));
 put('.claude/projects/-Users-a-worldlet/memory/MEMORY.md','The repo uses squash merges.');
 put('.claude/skills/release-notes/SKILL.md','# Release notes\n\nWrite release notes from merged PRs.\n');
 // Its sub-agents and slash commands come as skills too.
 put('.claude/agents/reviewer.md','---\nname: code-reviewer\ndescription: Reviews diffs.\ntools: Read\n---\nYou review code for bugs.');
 put('.claude/commands/git/commit.md','---\ndescription: Commit staged work.\n---\nWrite a commit message for $ARGUMENTS.');
 // pi: OpenClaw's session tree with a session name.
 put('.pi/agent/AGENTS.md','Use pnpm.');
 put('.pi/agent/sessions/--Users-a-site--/2026-09-07_x.jsonl',jsonl({type:'session',id:'x',cwd:'/Users/a/site'},{type:'message',timestamp:'2026-09-07T09:00:00Z',message:{role:'user',content:[{type:'text',text:'Add a footer'}]}},{type:'message',timestamp:'2026-09-07T09:00:03Z',message:{role:'assistant',content:[{type:'text',text:'Footer added.'}]}},{type:'session_info',name:'Footer'}));
 put('.pi/agent/skills/deploy/SKILL.md','---\nname: deploy\ndescription: Deploy the site.\n---\nRun the deploy.');
 put('.pi/agent/prompts/standup.md','Summarize what I did yesterday.');
 put('.pi/agent/settings.json',JSON.stringify({defaultProvider:'openai',defaultModel:'gpt-5'}));
 put('.pi/agent/auth.json',JSON.stringify({openai:{type:'api_key',key:'sk-pi'}}));
 // Codex: a conversation with its instructions and reasoning around it, renamed later; a sub-agent run;
 // an archived conversation; its own `.system` skills, one of the person's and a custom prompt.
 put('.codex/AGENTS.md','Prefer TypeScript.');
 put('.codex/sessions/2026/09/08/rollout-2026-09-08T10-00-00-c1.jsonl',jsonl(
  {timestamp:'2026-09-08T10:00:00.000Z',type:'session_meta',payload:{id:'c1',cwd:'/Users/a/app',source:'cli'}},
  {timestamp:'2026-09-08T10:00:00.100Z',type:'response_item',payload:{type:'message',role:'user',content:[{type:'input_text',text:'<environment_context>x</environment_context>'}]}},
  {timestamp:'2026-09-08T10:00:01.000Z',type:'event_msg',payload:{type:'user_message',message:'Add dark mode'}},
  {timestamp:'2026-09-08T10:00:02.000Z',type:'event_msg',payload:{type:'agent_reasoning',text:'thinking'}},
  {timestamp:'2026-09-08T10:00:03.000Z',type:'event_msg',payload:{type:'agent_message',message:'Dark mode added.'}}));
 put('.codex/sessions/2026/09/08/rollout-2026-09-08T11-00-00-c2.jsonl',jsonl(
  {timestamp:'2026-09-08T11:00:00.000Z',type:'session_meta',payload:{id:'c2',cwd:'/Users/a/app',source:{subagent:'review'}}},
  {timestamp:'2026-09-08T11:00:01.000Z',type:'event_msg',payload:{type:'user_message',message:'Review this'}}));
 put('.codex/archived_sessions/rollout-2026-09-01T09-00-00-c0.jsonl',jsonl(
  {timestamp:'2026-09-01T09:00:00.000Z',type:'session_meta',payload:{id:'c0',cwd:'/Users/a/app',source:'vscode'}},
  {timestamp:'2026-09-01T09:00:01.000Z',type:'event_msg',payload:{type:'user_message',message:'Old question'}}));
 // Current Codex (and the ChatGPT app's) records turns as completed UserMessage / AgentMessage items.
 put('.codex/sessions/2026/10/02/rollout-2026-10-02T12-00-00-c3.jsonl',jsonl(
  {timestamp:'2026-10-02T12:00:00.000Z',type:'session_meta',payload:{id:'c3',cwd:'/Users/a/site',source:'vscode',thread_source:'user'}},
  {timestamp:'2026-10-02T12:00:00.100Z',type:'response_item',payload:{type:'message',role:'user',content:[{type:'input_text',text:'# AGENTS.md instructions'}]}},
  {timestamp:'2026-10-02T12:00:01.000Z',type:'event_msg',payload:{type:'item_completed',item:{type:'UserMessage',content:[{type:'text',text:'Find a venue',text_elements:[]}]}}},
  {timestamp:'2026-10-02T12:00:02.000Z',type:'event_msg',payload:{type:'item_completed',item:{type:'Reasoning',summary_text:[]}}},
  {timestamp:'2026-10-02T12:00:03.000Z',type:'event_msg',payload:{type:'item_completed',item:{type:'CommandExecution',command:['/bin/zsh'],stdout:'x'}}},
  {timestamp:'2026-10-02T12:00:04.000Z',type:'response_item',payload:{type:'message',role:'assistant',content:[{type:'output_text',text:'Three venues fit.'}]}},
  {timestamp:'2026-10-02T12:00:04.000Z',type:'event_msg',payload:{type:'item_completed',item:{type:'AgentMessage',content:[{type:'Text',text:'Three venues fit.'}],phase:'final_answer'}}}));
 // Newest first, as Codex's own files are dated.
 for(const [file,at] of [['.codex/sessions/2026/09/08/rollout-2026-09-08T10-00-00-c1.jsonl','2026-09-08T10:01:00Z'],['.codex/sessions/2026/10/02/rollout-2026-10-02T12-00-00-c3.jsonl','2026-10-02T12:01:00Z']])fs.utimesSync(path.join(others,file),new Date(at),new Date(at));
 put('.codex/session_index.jsonl',jsonl({id:'c1',thread_name:'Theme',updated_at:'x'},{id:'c1',thread_name:'Dark mode',updated_at:'y'}));
 put('.codex/skills/.system/skill-creator/SKILL.md','---\nname: skill-creator\ndescription: Bundled.\n---\n');
 put('.codex/skills/changelog/SKILL.md','---\nname: changelog\ndescription: Update the changelog.\n---\nAdd an entry.');
 put('.codex/prompts/draft.md','Draft a PR description.');
 // Hermes Agent: a compressed conversation in two sessions, a scheduled run, bundled and own skills, jobs.
 put('.hermes/config.yaml','model:\n  provider: openrouter\n');
 put('.hermes/SOUL.md','**Name:** Nova\nBe warm and brief.');
 put('.hermes/memories/MEMORY.md','Lives in Kyoto.');
 put('.hermes/skills/.bundled_manifest','arxiv:abc\n');
 put('.hermes/skills/research/arxiv/SKILL.md','---\nname: arxiv\ndescription: Bundled.\n---\n');
 put('.hermes/skills/travel/kyoto-guide/SKILL.md','---\nname: kyoto-guide\ndescription: Kyoto tips.\n---\nTemples first.');
 put('.hermes/cron/jobs.json',JSON.stringify({jobs:[{id:'j1',name:'Morning digest',prompt:'Summarize my inbox.',schedule:{kind:'cron',expr:'0 7 * * *'},enabled:true},{id:'j2',name:'Watcher',prompt:'x',script:'w.py',schedule:{kind:'interval',minutes:5}},{id:'j3',name:'Fox',prompt:'x',schedule:{kind:'interval',minutes:5},origin:{platform:'worldlet'}}]}));
 const hermesTables=`CREATE TABLE sessions(id TEXT PRIMARY KEY,source TEXT NOT NULL,display_name TEXT,parent_session_id TEXT,started_at REAL NOT NULL,message_count INTEGER DEFAULT 0,title TEXT);
  CREATE TABLE messages(id INTEGER PRIMARY KEY AUTOINCREMENT,session_id TEXT NOT NULL,role TEXT NOT NULL,content TEXT,timestamp REAL NOT NULL,_compressed_summary INTEGER NOT NULL DEFAULT 0);`;
 // Another Hermes profile: its own persona, memory and a conversation.
 put('.hermes/profiles/work/config.yaml','model:\n  provider: openrouter\n');
 put('.hermes/profiles/work/SOUL.md','Name: Atlas\nYou handle work email.');
 put('.hermes/profiles/work/memories/MEMORY.md','Reports go out on Fridays.');
 const workDb=new DatabaseSync(path.join(others,'.hermes','profiles','work','state.db'));
 workDb.exec(hermesTables);
 workDb.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?,?)').run('w1','cli',null,null,400,2,'Weekly report');
 workDb.prepare('INSERT INTO messages(session_id,role,content,timestamp,_compressed_summary) VALUES(?,?,?,?,?)').run('w1','user','Draft the report',400,0);
 workDb.close();
 const hermesDb=new DatabaseSync(path.join(others,'.hermes','state.db'));
 hermesDb.exec(`CREATE TABLE sessions(id TEXT PRIMARY KEY,source TEXT NOT NULL,display_name TEXT,parent_session_id TEXT,started_at REAL NOT NULL,message_count INTEGER DEFAULT 0,title TEXT);
  CREATE TABLE messages(id INTEGER PRIMARY KEY AUTOINCREMENT,session_id TEXT NOT NULL,role TEXT NOT NULL,content TEXT,timestamp REAL NOT NULL,_compressed_summary INTEGER NOT NULL DEFAULT 0);`);
 const session=hermesDb.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?,?)'),message=hermesDb.prepare('INSERT INTO messages(session_id,role,content,timestamp,_compressed_summary) VALUES(?,?,?,?,?)');
 session.run('h1','telegram','Kelvin',null,100,2,null);session.run('h2','telegram','Kelvin','h1',200,3,'Trip planning');session.run('c1','cron',null,null,300,1,null);
 message.run('h1','user','Plan Kyoto',100,0);message.run('h1','assistant','Day one: temples.',101,0);
 message.run('h2','assistant','Earlier: planned Kyoto.',200,1);message.run('h2','tool','{}',201,0);message.run('h2','user','And Osaka?',202,0);message.run('c1','assistant','Digest',300,0);
 hermesDb.close();

 assert.deepEqual(surveyAgentHistory('claude-code',others,{}),{conversations:3,notes:1,skills:3,jobs:0});
 assert.deepEqual(surveyAgentHistory('pi',others,{}),{conversations:1,notes:0,skills:2,jobs:0});
 assert.deepEqual(surveyAgentHistory('hermes',others,{}),{conversations:2,notes:0,skills:2,jobs:1});
 assert.deepEqual(surveyAgentHistory('codex',others,{}),{conversations:3,notes:0,skills:2,jobs:0},'its own sub-agent runs are not counted');
 assert.equal(readLocalAgentMemory('claude-code',others,{})?.longTerm,'Always answer briefly.');
 assert.deepEqual(readLocalAgentMemory('pi',others,{}),{name:null,soul:'',user:'',longTerm:'Use pnpm.',model:true},'pi’s API key can become Fox’s model');
 assert.deepEqual(readLocalAgentMemory('codex',others,{}),{name:null,soul:'',user:'',longTerm:'Prefer TypeScript.',model:false},'Codex’s sign-in already is Fox’s model');
 assert.deepEqual(readLocalAgentMemory('hermes',others,{}),{name:'Nova',soul:'**Name:** Nova\nBe warm and brief.',user:'',longTerm:'Lives in Kyoto.',model:true},'its persona comes whole');
 // Setup's second page says in a few words what came over (owner request 2026-10-06), from the Agent's own files.
 assert.deepEqual(summarizeLocalAgent('hermes',readLocalAgentMemory('hermes',others,{}),others,{}),{personality:'Be warm and brief',about:'',model:''},'no model named, so none is shown');
 assert.equal(firstSentence('# SOUL\n\nYou are Elon, a blunt first-principles thinker. You push back.','Elon'),'A blunt first-principles thinker');
 assert.equal(firstSentence('- **Kelvin** runs [Worldlet](https://worldlet.ai) from San Francisco.\n§\nLikes short answers.'),'Kelvin runs Worldlet from San Francisco');
 assert.equal(firstSentence('Name: Atlas\n```\ncode\n```\nKeeps every reply under three sentences and never uses emoji or exclamation marks at all, ever.'),'Keeps every reply under three sentences and never uses…');
 const models=fs.mkdtempSync(path.join(os.tmpdir(),'agent-models-'));
 fs.mkdirSync(path.join(models,'.hermes'));fs.writeFileSync(path.join(models,'.hermes','config.yaml'),'model:\n  default: anthropic/claude-sonnet-5\n  provider: openrouter\n  api_key: sk-secret\n');
 fs.mkdirSync(path.join(models,'.codex'));fs.writeFileSync(path.join(models,'.codex','config.toml'),'model = "gpt-5.5"\n');
 assert.equal(localAgentModel('hermes',models,{}),'claude-sonnet-5');
 assert.equal(localAgentModel('codex',models,{}),'gpt-5.5');
 assert.equal(localAgentModel('pi',models,{}),'','nothing set, nothing shown');
 fs.writeFileSync(path.join(models,'.hermes','SOUL.md'),"You are Hermes, Kelvin's local agent.");fs.writeFileSync(path.join(models,'.hermes','IDENTITY.md'),'# Identity\n- **Name:** Elon North\n');
 assert.equal(readLocalAgentMemory('hermes',models,{})?.name,'Elon North','IDENTITY.md names a Hermes Agent first');
 fs.rmSync(models,{recursive:true,force:true});
 const before=['.claude','.pi','.hermes','.codex'].flatMap(snapshot);
 const run=async(source:'claude-code'|'pi'|'hermes'|'codex')=>{
  let saved:any[]=[],asked:any[]=[];
  const companion={replaceImportedHistory:(from:string,history:any)=>{assert.equal(from,source);saved=flat(history);return saved.length;}} as any;
  const hermesHome=path.join(others,'fox-hermes');
  const world=new WorldLedger(path.join(others,'world'));
  const brought=await bringAgent(source,{companion,world,hermesHome,importRoutines:async routines=>{asked=routines;return {ok:true,routines:routines.map(r=>r.name),failed:[]};},now,home:others,environment:{}});
  world.close();
  return {brought:brought!,saved,asked,skills:path.join(hermesHome,'skills',source)};
 };
 const claude=await run('claude-code');
 assert.deepEqual(claude.saved.map(t=>[t.session,t.role[0]+':'+t.text]),[
  ['Claude Code · notes · Plan my week','u:Plan my week'],['Claude Code · notes · Plan my week','a:Here is a plan.'],
  ['Claude Code · worldlet · Sign-in fix','u:Fix the login redirect'],['Claude Code · worldlet · Sign-in fix','a:Fixed the redirect.'],
  ['Claude Code notes · worldlet','a:'+claude.saved.at(-1).text],
 ],'newest conversation first, then notes');
 assert.match(claude.saved.at(-1).text,/^Notes for \d{4}-\d{2}-\d{2}\n\nThe repo uses squash merges\.$/);
 assert.deepEqual(claude.brought.skills.sort(),['claude-agent-code-reviewer','git-commit-command','release-notes']);
 assert.match(fs.readFileSync(path.join(claude.skills,'claude-agent-code-reviewer','SKILL.md'),'utf8'),/sub-agent called code-reviewer \(Reviews diffs\.\)[\s\S]*You review code for bugs\./);
 assert.match(fs.readFileSync(path.join(claude.skills,'git-commit-command','SKILL.md'),'utf8'),/# \/git:commit[\s\S]*Write a commit message for \$ARGUMENTS\./);
 assert.match(fs.readFileSync(path.join(claude.skills,'release-notes','SKILL.md'),'utf8'),/^---\nname: release-notes\ndescription: "Write release notes from merged PRs\."\n---/);
 assert.match(claude.brought.note,/^Brought over from Claude Code on this computer:/);
 const pi=await run('pi');
 assert.deepEqual(pi.saved.map(t=>[t.session,t.text]),[['pi · site · Footer','Add a footer'],['pi · site · Footer','Footer added.']]);
 assert.deepEqual(pi.brought.skills.sort(),['deploy','standup-command']);
 const hermes=await run('hermes');
 assert.deepEqual(hermes.saved.map(t=>[t.session,t.role[0]+':'+t.text]),[['Hermes Agent · work · Terminal · Weekly report','u:Draft the report'],
  ['Hermes Agent · Telegram · Trip planning','u:Plan Kyoto'],['Hermes Agent · Telegram · Trip planning','a:Day one: temples.'],['Hermes Agent · Telegram · Trip planning','u:And Osaka?']],
  'newest conversation first across profiles; a compressed conversation is one, summaries and tool rows stay behind; other profiles come too');
 assert.deepEqual(hermes.brought.skills.sort(),['hermes-profile-atlas','kyoto-guide'],'Hermes’ own bundled skills are not copied');
 assert.match(fs.readFileSync(path.join(hermes.skills,'hermes-profile-atlas','SKILL.md'),'utf8'),/separate profile called Atlas[\s\S]*You handle work email\.[\s\S]*Reports go out on Fridays\./);
 assert.deepEqual(hermes.asked.map(r=>[r.key,r.schedule]),[['hermes:j1','0 7 * * *']]);
 assert.deepEqual(hermes.brought.stayed.map(s=>s.name),['Watcher']);
 const codex=await run('codex');
 assert.deepEqual(codex.saved.map(t=>[t.session,t.role[0]+':'+t.text,t.createdAt]),[['Codex · site · Find a venue','u:Find a venue','2026-10-02T12:00:01Z'],['Codex · site · Find a venue','a:Three venues fit.','2026-10-02T12:00:04Z'],['Codex · app · Dark mode','u:Add dark mode','2026-09-08T10:00:01Z'],['Codex · app · Dark mode','a:Dark mode added.','2026-09-08T10:00:03Z'],['Codex · app · Old question','u:Old question','2026-09-01T09:00:01Z']],
  'only what was typed and answered (in either Codex format), under its last name; sub-agent runs stay behind');
 assert.deepEqual(codex.brought.skills.sort(),['changelog','draft-command'],'Codex’s own .system skills are not copied');
 assert.deepEqual(['.claude','.pi','.hermes','.codex'].flatMap(snapshot),before,'their own files are only read');
}finally{fs.rmSync(others,{recursive:true,force:true});}
console.log('PASS: OpenClaw, Claude Code, pi, Hermes Agent and Codex conversations, notes, skills and scheduled jobs come into Fox the same way; their own files are only read');
