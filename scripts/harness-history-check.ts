// The `history` Harness service read continuously (core/agent/PORTABILITY.md "History, read continuously"): every
// Harness with a reader (OpenClaw, Hermes Agent, Claude Code, Codex, pi) declares it in mode `files`, and the World's
// one Harness-neutral sync adds only the turns written after its cursor, with the IDs bringing gave, under the
// conversation they were brought into. Fox's own sessions (remembered by the World, or run in Worldlet's folders) never
// come back. Fixture folders only; the Agents' own files are only read.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {HARNESS_SERVICES,harnessService,MIGRATION_SOURCES,type MigrationSource} from '../core/agent/index.ts';
import {filesHistory} from '../platform/electron/src/modules/agent-runtime/agent-history.ts';
import {writeSelection} from '../platform/electron/src/modules/agent-runtime/local-harness.ts';
import {bringAgent,broughtTurnId} from '../platform/electron/src/modules/fox/migration.ts';
import {createHistorySync,ownHarnessSession} from '../platform/electron/src/modules/fox/history-sync.ts';
import {WorldLedger} from '../platform/electron/src/store/ledger.ts';

for(const source of MIGRATION_SOURCES)assert.equal(harnessService(source,'history'),'files',source+' reads its history from its own files');
// Every Harness that declares history reads it from its own files; one on another computer (`remote`) declares none.
assert.deepEqual(Object.keys(HARNESS_SERVICES).filter(id=>harnessService(id,'history')).sort(),[...MIGRATION_SOURCES].sort());

const home=fs.mkdtempSync(path.join(os.tmpdir(),'worldlet-history-'));
const put=(file:string,text:string|Buffer)=>{fs.mkdirSync(path.dirname(path.join(home,file)),{recursive:true});fs.writeFileSync(path.join(home,file),text);};
const add=(file:string,text:string)=>fs.appendFileSync(path.join(home,file),text);
const jsonl=(...lines:object[])=>lines.map(line=>JSON.stringify(line)).join('\n')+'\n';
const at=(seconds:number)=>new Date(Date.now()+seconds*1000).toISOString();
const snapshot=()=>{const out:string[]=[];const walk=(dir:string)=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else out.push(path.relative(home,file)+':'+fs.statSync(file).size);}};for(const folder of ['.claude','.pi','.codex','.hermes','.openclaw'])walk(path.join(home,folder));return out.sort();};
const root=path.join(home,'Worldlet');
fs.mkdirSync(path.join(root,'agent','private','local-codex'),{recursive:true});
try{
 // Claude Code, pi and Codex: one session file each; Codex also keeps one per Fox turn, run in Worldlet's Agent folder.
 put('.claude/projects/-Users-a-app/cc1.jsonl',jsonl({type:'user',cwd:'/Users/a/app',timestamp:at(-60),message:{role:'user',content:'Fix the build'}},{type:'assistant',timestamp:at(-59),message:{role:'assistant',content:[{type:'text',text:'Fixed.'}]}},{type:'custom-title',customTitle:'Build'}));
 put('.pi/agent/sessions/--Users-a-site--/2026-10-08_p1.jsonl',jsonl({type:'session',id:'p1',cwd:'/Users/a/site'},{type:'message',timestamp:at(-60),message:{role:'user',content:[{type:'text',text:'Add a footer'}]}},{type:'session_info',name:'Footer'}));
 const rollout='.codex/sessions/2026/10/08/rollout-2026-10-08T10-00-00-x1.jsonl';
 put(rollout,jsonl({timestamp:at(-60),type:'session_meta',payload:{id:'x1',cwd:'/Users/a/app',source:'cli'}},{timestamp:at(-59),type:'event_msg',payload:{type:'user_message',message:'Add dark mode'}}));
 put('.codex/sessions/2026/10/08/rollout-2026-10-08T10-05-00-fox.jsonl',jsonl({timestamp:at(-30),type:'session_meta',payload:{id:'fox1',cwd:path.join(root,'agent','private','local-codex'),source:'exec'}},{timestamp:at(-29),type:'event_msg',payload:{type:'user_message',message:'What is on my calendar?'}}));
 // Another Worldlet library's Fox (the Dev app beside the installed one, a release check's disposable library, since deleted).
 put('.codex/sessions/2026/10/08/rollout-2026-10-08T10-06-00-fox2.jsonl',jsonl({timestamp:at(-28),type:'session_meta',payload:{id:'fox2',cwd:path.join(home,'gone','worldlet-agent-local-x','agent','sample','local-codex'),source:'exec'}},{timestamp:at(-27),type:'event_msg',payload:{type:'user_message',message:'What is Mia Tan’s invoice email about?'}}));
 // Hermes Agent: a Telegram conversation compressed into a second session, and Fox's own ACP session.
 put('.hermes/config.yaml','model:\n  provider: openrouter\n');
 const hermesDb=new DatabaseSync(path.join(home,'.hermes','state.db'));
 hermesDb.exec(`CREATE TABLE sessions(id TEXT PRIMARY KEY,source TEXT NOT NULL,display_name TEXT,parent_session_id TEXT,started_at REAL NOT NULL,message_count INTEGER DEFAULT 0,title TEXT);
  CREATE TABLE messages(id INTEGER PRIMARY KEY AUTOINCREMENT,session_id TEXT NOT NULL,role TEXT NOT NULL,content TEXT,timestamp REAL NOT NULL,_compressed_summary INTEGER NOT NULL DEFAULT 0);`);
 const session=hermesDb.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?,?)'),message=hermesDb.prepare('INSERT INTO messages(session_id,role,content,timestamp,_compressed_summary) VALUES(?,?,?,?,?)');
 session.run('h1','telegram','Kelvin',null,100,2,'Trip planning');message.run('h1','user','Plan Kyoto',100,0);message.run('h1','assistant','Day one: temples.',101,0);
 session.run('acp1','acp',null,null,150,1,null);message.run('acp1','user','Fox asking',150,0);
 hermesDb.close();
 // OpenClaw: one Discord channel in its SQLite store.
 put('.openclaw/openclaw.json','{agents: {entries: {main: {default: true}}}}');
 fs.mkdirSync(path.join(home,'.openclaw','agents','main','agent'),{recursive:true});
 const clawDb=new DatabaseSync(path.join(home,'.openclaw','agents','main','agent','openclaw-agent.sqlite'));
 clawDb.exec(`CREATE TABLE session_nodes(session_key TEXT PRIMARY KEY,current_session_id TEXT,entry_json TEXT,label TEXT,display_name TEXT,created_via TEXT,updated_at INTEGER);
  CREATE TABLE transcript_events(session_id TEXT,seq INTEGER,event_json TEXT,created_at INTEGER,event_zstd BLOB,PRIMARY KEY(session_id,seq));`);
 const event=(role:string,text:string,when:string)=>JSON.stringify({type:'message',timestamp:when,message:{role,content:[{type:'text',text}]}});
 clawDb.prepare('INSERT INTO session_nodes VALUES(?,?,?,?,?,?,0)').run('agent:main:discord:channel:555','s1',JSON.stringify({subject:'#diet-and-health',channel:'discord'}),null,null,'channel');
 const claw=clawDb.prepare('INSERT INTO transcript_events VALUES(?,?,?,?,NULL)');
 claw.run('s1',1,event('user','I had a salad',at(-60)),0);claw.run('s1',2,event('assistant','Logged the salad.',at(-59)),0);
 clawDb.close();

 // Bringing each Agent copies what it has now.
 const world=new WorldLedger(root);
 const companion={replaceImportedHistory:(source:string,history:any)=>world.replaceCompanionHistory(source,{turns:history.conversations.flatMap((c:any)=>c.turns.map((t:any)=>({...t,session:c.session}))),notes:history.notes})} as any;
 for(const source of ['claude-code','codex','hermes','openclaw'] as MigrationSource[])await bringAgent(source,{companion,world,hermesHome:null,importRoutines:null,home,environment:{},ownFolders:[path.join(root,'agent')]});
 const count=(source:string)=>world.companionTurns(source).length;
 const texts=(source:string)=>world.companionTurns(source).map(t=>t.session+' | '+t.role[0]+':'+t.text);
 assert.deepEqual(['claude-code','codex','hermes','openclaw','pi'].map(count),[2,1,2,2,0],'Fox’s own Codex turns, in this library or another, are not brought either');
 // pi is the chosen Harness and was never brought: its recent conversations come with the first check.
 writeSelection(root,'pi');

 const refreshed:number[]=[],events:string[]=[],errors:unknown[]=[];
 const host={profile:{root},store:{writable:true,sampleEnabled:()=>false,ledger:()=>world},page:{event:(name:string)=>events.push(name)},
  optional:(name:string)=>name==='ongoing'?{refresh:()=>refreshed.push(1)}:undefined,diagnostics:{record:(error:unknown)=>errors.push(error)}} as any;
 const sync=createHistorySync(host,{history:(source,options)=>filesHistory(source,{...options,home,environment:{}})});
 const before=snapshot();
 assert.equal(await sync.run(),1,'only pi’s conversation is new');
 assert.deepEqual(errors,[]);
 assert.deepEqual(texts('pi'),['pi · site · Footer | u:Add a footer']);
 assert.deepEqual(['claude-code','codex','hermes','openclaw'].map(count),[2,1,2,2],'what bringing copied is not copied again');
 assert.deepEqual([refreshed.length,events],[1,['worldlet:ongoing']],'Ongoing and the page (and the phone with it) hear of new turns');
 assert.equal(await sync.run(),0,'nothing new, nothing added');
 assert.equal(refreshed.length,1);

 // The person keeps talking in each Agent after setup.
 add('.claude/projects/-Users-a-app/cc1.jsonl',jsonl({type:'user',timestamp:at(1),message:{role:'user',content:'Now run the tests'}},{type:'assistant',timestamp:at(2),message:{role:'assistant',content:[{type:'text',text:'All green.'}]}},{type:'custom-title',customTitle:'Build and tests'}));
 add('.pi/agent/sessions/--Users-a-site--/2026-10-08_p1.jsonl',jsonl({type:'message',timestamp:at(1),message:{role:'assistant',content:[{type:'text',text:'Footer added.'}]}}));
 add(rollout,jsonl({timestamp:at(1),type:'event_msg',payload:{type:'agent_message',message:'Dark mode added.'}}));
 add('.codex/sessions/2026/10/08/rollout-2026-10-08T10-05-00-fox.jsonl',jsonl({timestamp:at(1),type:'event_msg',payload:{type:'agent_message',message:'Two meetings.'}}));
 const later=new DatabaseSync(path.join(home,'.hermes','state.db'));
 const nowSeconds=Date.now()/1000;
 later.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?,?)').run('h2','telegram','Kelvin','h1',nowSeconds,2,null);
 later.prepare('INSERT INTO messages(session_id,role,content,timestamp,_compressed_summary) VALUES(?,?,?,?,?)').run('h2','user','And Osaka?',nowSeconds+1,0);
 later.prepare('INSERT INTO messages(session_id,role,content,timestamp,_compressed_summary) VALUES(?,?,?,?,?)').run('h2','assistant','Day two: Osaka castle.',nowSeconds+2,0);
 // A resident Fox session the World remembers, as Hermes Agent's gateway keeps it beside the person's channels.
 later.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?,?)').run('fox-resident','telegram',null,null,nowSeconds,1,null);
 later.prepare('INSERT INTO messages(session_id,role,content,timestamp,_compressed_summary) VALUES(?,?,?,?,?)').run('fox-resident','user','A Fox turn',nowSeconds+1,0);
 later.close();
 world.rememberOwnHarnessSession('hermes','fox-resident','world');
 const moreClaw=new DatabaseSync(path.join(home,'.openclaw','agents','main','agent','openclaw-agent.sqlite'));
 moreClaw.prepare('INSERT INTO transcript_events VALUES(?,?,?,?,NULL)').run('s1',3,event('user','Dinner was ramen',at(1)),Math.round(nowSeconds+1));
 // Fox's resident Gateway session: OpenClaw keeps the header's key under its agent, in its own case.
 moreClaw.prepare('INSERT INTO session_nodes VALUES(?,?,?,?,?,?,0)').run('agent:main:Worldlet-private-main-0a1b2c3d','s9',JSON.stringify({subject:'Worldlet'}),null,null,'api');
 moreClaw.prepare('INSERT INTO transcript_events VALUES(?,?,?,?,NULL)').run('s9',1,event('user','A Fox turn on the Gateway',at(1)),Math.round(nowSeconds+1));
 moreClaw.close();
 world.rememberOwnHarnessSession('openclaw','worldlet-private-main-0a1b2c3d','main');
 const appended=snapshot();

 assert.equal(await sync.run(),7,'only the new turns');
 assert.deepEqual(errors,[]);
 assert.deepEqual(texts('claude-code'),['Claude Code · app · Build | u:Fix the build','Claude Code · app · Build | a:Fixed.','Claude Code · app · Build | u:Now run the tests','Claude Code · app · Build | a:All green.'],'filed under the conversation it was brought as, though renamed since');
 assert.deepEqual(texts('codex'),['Codex · app · Add dark mode | u:Add dark mode','Codex · app · Add dark mode | a:Dark mode added.'],'Fox’s own Codex turns stay out');
 assert.deepEqual(texts('hermes'),['Hermes Agent · Telegram · Trip planning | u:Plan Kyoto','Hermes Agent · Telegram · Trip planning | a:Day one: temples.','Hermes Agent · Telegram · Trip planning | u:And Osaka?','Hermes Agent · Telegram · Trip planning | a:Day two: Osaka castle.'],
  'a compressed conversation goes on as one; Fox’s ACP and resident sessions stay out');
 assert.deepEqual(texts('openclaw'),['OpenClaw · Discord · #diet-and-health | u:I had a salad','OpenClaw · Discord · #diet-and-health | a:Logged the salad.','OpenClaw · Discord · #diet-and-health | u:Dinner was ramen'],
  'Fox’s Gateway session stays out though OpenClaw keeps it as agent:main:<key>');
 assert.deepEqual(texts('pi'),['pi · site · Footer | u:Add a footer','pi · site · Footer | a:Footer added.']);
 assert.deepEqual(world.companionTurns('openclaw').map(t=>t.id),[0,1,2].map(i=>broughtTurnId('openclaw','main:agent:main:discord:channel:555',String(i))),'the IDs bringing gives');
 assert.deepEqual({...world.historyCursor('hermes','h1'),checkedAt:0},{cursor:'3',session:'Hermes Agent · Telegram · Trip planning',checkedAt:0,shared:false},'a cursor per thread in world.sqlite, and whether others write in it');
 assert.equal(refreshed.length,2);
 assert.equal(await sync.run(),0,'read again, nothing twice');
 assert.deepEqual(snapshot(),appended,'their own files are only read');
 assert.notDeepEqual(appended,before);

 // Bringing again starts the read over; turns keep their IDs, so nothing comes twice.
 await bringAgent('openclaw',{companion,world,hermesHome:null,importRoutines:null,home,environment:{},ownFolders:[path.join(root,'agent')],own:ownHarnessSession('openclaw',world.ownHarnessSessions('openclaw'))});
 assert.deepEqual(['agent:main:Worldlet-private-main-0a1b2c3d','worldlet-private-main-0a1b2c3d','agent:main:discord:channel:555'].map(ownHarnessSession('openclaw',world.ownHarnessSessions('openclaw'))),[true,true,false]);
 assert.equal(world.historyCursor('openclaw','main:agent:main:discord:channel:555'),null);
 assert.equal(await sync.run(),0);assert.equal(count('openclaw'),3);
 // New messages are read as they arrive: a watched Agent's write is checked a moment later, only that Agent, and a new
 // message in a shared channel that asks something goes to Attention as a `channel` event; one that does not, or one
 // in the person's own chat with their Agent, does not.
 const asked:any[]=[],read:string[]=[];
 const liveHost={...host,optional:(name:string)=>name==='ongoing'?{refresh:()=>refreshed.push(1),channelEvents:(found:any[])=>asked.push(...found)}:undefined};
 const live=createHistorySync(liveHost,{history:(source,options)=>{read.push(source);return filesHistory(source,{...options,home,environment:{}});},settleMs:50});
 live.watch();
 assert.deepEqual(read.sort(),['claude-code','codex','hermes','openclaw','pi'],'every Agent whose history the World reads is watched');
 read.length=0;
 const liveDb=new DatabaseSync(path.join(home,'.openclaw','agents','main','agent','openclaw-agent.sqlite'));
 liveDb.prepare('INSERT INTO transcript_events VALUES(?,?,?,?,NULL)').run('s1',4,event('user','Sam: can you send me the meal plan by Friday?',at(2)),Math.round(nowSeconds+2));
 liveDb.prepare('INSERT INTO transcript_events VALUES(?,?,?,?,NULL)').run('s1',5,event('user','Sam: lunch was soup',at(3)),Math.round(nowSeconds+3));
 liveDb.close();
 for(let waited=0;count('openclaw')<5&&waited<8000;waited+=50)await new Promise(resolve=>setTimeout(resolve,50));
 await live.idle();
 assert.equal(count('openclaw'),5,'the new messages came without waiting for the clock');
 assert.deepEqual([...new Set(read)],['openclaw'],'only the Agent that wrote is read');
 assert.deepEqual(asked.map(e=>[e.source,e.title,e.text.split('\n')[0]]),[['channel','OpenClaw · Discord · #diet-and-health','Message: Sam: can you send me the meal plan by Friday?']],'the asking message goes to Attention, the other does not');
 assert.match(asked[0].text,/Just before:\n- I had a salad\n- Logged the salad.\n- Dinner was ramen$/,'with the lines just before it');
 live.stop();
 // Another Harness, or a history with no reader here, is simply not read.
 assert.equal(filesHistory('hermes',{home:path.join(home,'nobody'),environment:{}}),null);
 // Listing a session file reads nothing but its name and time (owner report 2026-10-08: pages lagged while a whole
 // history was read on the main process); its title comes with its turns.
 const claude=filesHistory('claude-code',{home,environment:{}})!;
 assert.deepEqual((await claude.threads(0)).map(t=>[t.id,t.title]),[['cc1','']]);
 assert.equal((await claude.turns('cc1',undefined,1)).title,'app · Build and tests');

 // A long history comes in over several short checks, one thread at a time; a thread read through is not read again.
 const many=new WorldLedger(path.join(home,'Many'));
 const clock={at:1_000_000},reads:string[]=[];
 const big={threads:async(since=0)=>Array.from({length:6},(_,i)=>({id:'t'+i,title:'',updatedAt:900_000+i})).filter(t=>t.updatedAt>since),
  turns:async(id:string,cursor?:string)=>{reads.push(id);clock.at+=1000;return cursor?{turns:[],cursor}:{turns:[{id:'0',role:'user' as const,text:'hi '+id,at:900_000}],cursor:'0',title:'T '+id};}};
 writeSelection(path.join(home,'Many'),'pi');
 const manyHost={...host,profile:{root:path.join(home,'Many')},store:{writable:true,sampleEnabled:()=>false,ledger:()=>many}};
 const slow=createHistorySync(manyHost,{history:()=>big,now:()=>clock.at});
 assert.equal(await slow.run(),2,'a check stops once it has read for a while');
 assert.deepEqual(reads,['t5','t4'],'newest first');
 assert.equal(many.historyCheckedAt('pi'),null,'not through yet');
 assert.equal(await slow.run(),2);assert.equal(await slow.run(),2);
 assert.deepEqual(reads,['t5','t4','t3','t2','t1','t0'],'each thread read once');
 assert.equal(await slow.run(),0);
 assert.notEqual(many.historyCheckedAt('pi'),null,'through');
 assert.equal(reads.length,6,'nothing read again');
 assert.deepEqual(many.companionTurns('pi').map(t=>t.session).sort(),['t0','t1','t2','t3','t4','t5'].map(id=>'pi · T '+id),'named by the title its turns carry');
 many.close();
 world.close();
}finally{fs.rmSync(home,{recursive:true,force:true});}
console.log('PASS: every Harness with a reader serves `history` from its files; the sync adds only new turns, with the IDs bringing gave, never Fox’s own, as soon as a watched Agent writes, hands a shared channel’s asking message to Attention, and the Agents’ files are only read');
