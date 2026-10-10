// Brought conversations as Attention context, and a large Hermes Agent history brought by time (owner request
// 2026-10-06): core/tasks/attention.ts rules, the Hermes reader's recent and older windows, the background run that
// brings the older part, and its World log lines. Fixture data only; no model or real account.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {CONVERSATION_ATTENTION,conversationAttentionId,conversationObservation,conversationOriginal,conversationsForAttention,validConversationAttentionId} from '../core/tasks/index.ts';
import {worldLogLines} from '../core/activity/index.ts';
import {HERMES_OLDER,HERMES_RECENT,readOlderHermes,readOwnHermes} from '../platform/electron/src/modules/agent-runtime/agent-files.ts';
import {createOlderHistory} from '../platform/electron/src/modules/fox/older-history.ts';
import {broughtConversations} from '../platform/electron/src/modules/fox/migration.ts';
import {WorldLedger} from '../platform/electron/src/store/ledger.ts';

const DAY=86_400,now=Date.parse('2026-10-06T20:00:00Z')/1000;
const ago=(days:number)=>new Date((now-days*DAY)*1000).toISOString().replace(/\.\d+Z$/,'Z');

// Which conversations the Center reads: brought from a known Agent, the person spoke, active in the past three weeks.
{
 const c=(source:string,session:string,days:number,userTurns=2)=>({source,session,turns:userTurns+1,userTurns,first:ago(days+3),last:ago(days)});
 const picked=conversationsForAttention([c('openclaw','OpenClaw · Discord · #old',30),c('hermes','Hermes Agent · Telegram · Trip',1),c('openclaw','OpenClaw · Discord · #gym',0.2),
  c('someone','Someone · chat',1),c('codex','Codex · app · Quiet',2,0)],now);
 assert.deepEqual(picked.map(p=>p.session),['OpenClaw · Discord · #gym','Hermes Agent · Telegram · Trip'],'most recently active first; old, unknown and one-sided ones stay out');
 const many=Array.from({length:60},(_,i)=>c('openclaw','OpenClaw · Discord · #c'+i,i/10));
 assert.equal(conversationsForAttention(many,now).length,CONVERSATION_ATTENTION.conversations);
 assert.equal(conversationAttentionId('openclaw','OpenClaw · Discord · #gym'),conversationAttentionId('openclaw','OpenClaw · Discord · #gym'));
 assert.notEqual(conversationAttentionId('openclaw','OpenClaw · Discord · #gym'),conversationAttentionId('hermes','OpenClaw · Discord · #gym'));
 assert.ok(validConversationAttentionId(conversationAttentionId('pi','x'))&&!validConversationAttentionId('conv-../x'));
}

// What the Center reads of one: its name and latest turns, oldest first, within the Center's 12,000 characters.
{
 const turns=[{role:'user',text:'Book the Kyoto ryokan before Friday.',createdAt:'2026-10-05T21:02:09Z'},{role:'assistant',text:'I will check prices tomorrow.',createdAt:'2026-10-05T21:03:00Z'}];
 const value=conversationObservation({source:'openclaw',session:'OpenClaw · Discord · #kyoto-trip'},turns)!;
 assert.equal(value.id,conversationAttentionId('openclaw','OpenClaw · Discord · #kyoto-trip'));
 assert.equal(value.title,'#kyoto-trip');
 assert.equal(value.text,'Conversation “#kyoto-trip” in OpenClaw · Discord, brought from the person’s own Agent. Its latest messages, oldest first; “You” is the person.\n\n'
  +'[2026-10-05 21:02 UTC] You: Book the Kyoto ryokan before Friday.\n\n[2026-10-05 21:03 UTC] OpenClaw: I will check prices tomorrow.');
 assert.deepEqual(conversationObservation({source:'openclaw',session:'OpenClaw · Discord · #kyoto-trip'},turns),value,'the same turns read the same, so reading again needs no new pass');
 const long=Array.from({length:200},(_,i)=>({role:i%2?'assistant':'user',text:'步骤 '+i+' '+'很长的内容'.repeat(400),createdAt:ago(1)}));
 const bounded=conversationObservation({source:'hermes',session:'Hermes Agent · Telegram · Plans'},long)!;
 assert.ok([...bounded.text].length<=CONVERSATION_ATTENTION.characters,'within the Center bound');
 assert.match(bounded.text,/步骤 199 很长的内容[^\n]* …$/,'newest turn kept, each turn cut');
 assert.ok(!bounded.text.includes('步骤 100 '),'older turns give way to newer ones');
 assert.equal(conversationObservation({source:'hermes',session:'x'},[{role:'user',text:'  ',createdAt:ago(1)}]),null);
 const original=conversationOriginal({source:'openclaw',session:'OpenClaw · Discord · #kyoto-trip'},turns);
 assert.equal(original.title,'#kyoto-trip');assert.match(original.text,/^OpenClaw · Discord\. Its latest messages, oldest first\.\n\n\[2026-10-05 21:02 UTC\] You: Book/);
}

// World log lines for a large history coming in.
{
 const row=(seq:number,status:string,brought:number,remaining:number)=>({seq,at:now,kind:'brought.older',body:{agent:'hermes',status,brought,remaining}});
 assert.deepEqual(worldLogLines([row(1,'bringing',0,4800),row(2,'bringing',500,4300),row(3,'complete',4800,0)]).map(l=>l.text),
  ['Bringing older Hermes Agent conversations · 4,800 conversations to go','Brought 500 conversations from Hermes Agent so far · 4,300 to go','Brought every older Hermes Agent conversation · 4,800 conversations']);
 assert.deepEqual(worldLogLines([row(1,'partial',12,0)]).map(l=>l.text),['Brought 12 older Hermes Agent conversations · the oldest stayed behind']);
 assert.deepEqual(worldLogLines([{seq:1,at:now,kind:'brought.older',body:{agent:'other',status:'complete',brought:3}}]),[]);
}

// A large Hermes Agent: the recent part now, the rest newest first in windows; nothing twice, nothing lost.
const home=fs.mkdtempSync(path.join(os.tmpdir(),'worldlet-conversation-attention-'));
try{
 fs.mkdirSync(path.join(home,'.hermes'),{recursive:true});
 fs.writeFileSync(path.join(home,'.hermes','config.yaml'),'model:\n  provider: openrouter\n');
 const db=new DatabaseSync(path.join(home,'.hermes','state.db'));
 db.exec(`CREATE TABLE sessions(id TEXT PRIMARY KEY,source TEXT NOT NULL,display_name TEXT,parent_session_id TEXT,started_at REAL NOT NULL,message_count INTEGER DEFAULT 0,title TEXT,system_prompt TEXT);
  CREATE TABLE messages(id INTEGER PRIMARY KEY AUTOINCREMENT,session_id TEXT NOT NULL,role TEXT NOT NULL,content TEXT,timestamp REAL NOT NULL,_compressed_summary INTEGER NOT NULL DEFAULT 0);`);
 const session=db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?,?,?)'),message=db.prepare('INSERT INTO messages(session_id,role,content,timestamp,_compressed_summary) VALUES(?,?,?,?,?)');
 const clock=Date.now()/1000;
 // 100 conversations, one a day back from today; the newest continues in a child session after compression.
 for(let i=0;i<100;i++){
  const at=clock-i*DAY-60;
  session.run('s'+i,'telegram','Kelvin',null,at,2,'Chat '+i,'x'.repeat(2000));
  message.run('s'+i,'user','Question '+i,at,0);message.run('s'+i,'tool','{"big":"'+'y'.repeat(5000)+'"}',at+1,0);message.run('s'+i,'assistant','Answer '+i,at+2,0);
 }
 session.run('s0b','telegram','Kelvin','s0',clock-30,2,'Chat 0');
 message.run('s0b','assistant','Earlier: Question 0.',clock-30,1);message.run('s0b','user','Follow-up 0',clock-29,0);
 session.run('cron1','cron',null,null,clock-10,1,null);message.run('cron1','assistant','Digest',clock-10,0);
 db.close();

 const recent=readOwnHermes(home,{})!;
 assert.equal(recent.conversations.length,HERMES_RECENT.recentDays,'conversations active in the past month come at once');
 assert.deepEqual(recent.conversations[0].turns.map(t=>t.role[0]+':'+t.text),['u:Question 0','a:Answer 0','u:Follow-up 0'],'a compressed conversation is one, its summary and tool rows stay behind');
 assert.deepEqual(recent.conversations.slice(0,3).map(c=>c.key),['s0','s1','s2'],'newest first');
 assert.ok(recent.older&&recent.older.remaining===100-recent.conversations.length,JSON.stringify(recent.older));
 assert.ok(!recent.conversations.some(c=>c.key==='cron1'),'the Agent’s own scheduled runs stay behind');

 // The background run brings the rest into the World, newest first, a window at a time.
 const world=new WorldLedger(path.join(home,'world'));
 try{
  const companion={addImportedHistory:(source:string,history:any)=>world.addCompanionTurns(source,history.conversations.flatMap((c:any)=>c.turns.map((t:any)=>({...t,session:c.session}))))} as any;
  world.replaceCompanionHistory('hermes',{turns:broughtConversations('hermes',recent.conversations).flatMap(c=>c.turns.map(t=>({...t,session:c.session}))),notes:[]});
  const errors:unknown[]=[],reads:number[]=[];
  const host={store:{writable:true,sampleEnabled:()=>false,ledger:()=>world,recordHistory:(event:any,key='')=>{world.append(event,key);return true;}},
   optional:()=>undefined,diagnostics:{record:(error:unknown)=>{errors.push(error);}}} as any;
  const runner=createOlderHistory(host,companion,{pause:0,read:(cursor,left)=>{const window=readOlderHermes(cursor,left,home,{});reads.push(window?.conversations.length??-1);return window;}});
  runner.start('hermes',recent.older);
  await runner.idle();
  assert.deepEqual(errors,[]);
  assert.deepEqual(reads,[HERMES_OLDER.conversations,100-recent.conversations.length-HERMES_OLDER.conversations],'older ones come a window at a time');
  const progress=runner.progress()!;
  assert.deepEqual([progress.status,progress.brought,progress.remaining],['complete',100-recent.conversations.length,0]);
  const sessions=new Set(world.companionTurns('hermes').map(t=>t.session));
  assert.equal(sessions.size,100,'every conversation is in the World once');
  assert.equal(world.companionTurns('hermes').length,201,'no turn twice');
  assert.deepEqual(worldLogLines(world.history({kinds:['brought.older'],limit:10})).map(l=>l.text),
   [`Bringing older Hermes Agent conversations · ${100-recent.conversations.length} conversations to go`,`Brought every older Hermes Agent conversation · ${100-recent.conversations.length} conversations`]);
  // Bringing again starts over; a restart with nothing left does nothing.
  runner.reset('hermes');assert.equal(runner.progress(),null);
  runner.resume();await runner.idle();assert.equal(reads.length,2);
 }finally{world.close();}
}finally{fs.rmSync(home,{recursive:true,force:true});}

console.log('PASS brought conversations as Attention context (recent, bounded, stable, opened back) and a large Hermes Agent history brought by time: recent now, older newest first in the background, nothing twice');
