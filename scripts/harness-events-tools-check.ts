import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {harnessService,harnessToolsLine,harnessToolsSummary,hermesConfigValues,hermesExternalEvent,hermesHarnessTools,localHarnessTurn,openClawExternalEvent,openClawHarnessTools} from '../core/agent/index.ts';
import {channelMessageAsks,channelMessageEvent,externalEventAttentionId,externalEventMatters,externalEventObservation,externalEventPush,externalEventsForAttention,validExternalEventAttentionId} from '../core/tasks/index.ts';
import {harnessEvents,harnessTools,readHarnessEvents} from '../platform/electron/src/modules/agent-runtime/harness-services.ts';
import {withTempDir} from './test-temp.ts';

// The `events` and `tools` Harness services (contracts/HARNESS.md#harness-services-v2; owner parity plan items 8 and
// 10): Core's rules for each Harness's own records and settings, the Harness-neutral World rules, then the host's
// read-only readers against fixture OpenClaw and Hermes Agent folders.

// Declarations: OpenClaw and Hermes Agent read both from their folders; the others declare neither.
for(const id of ['openclaw','hermes']){assert.equal(harnessService(id,'events'),'files',id);assert.equal(harnessService(id,'tools'),'files',id);}
for(const id of ['claude-code','codex','pi']){assert.equal(harnessService(id,'events'),null,id);assert.equal(harnessTools(id),null,id);assert.equal(harnessEvents(id),null,id);}

// Tools: OpenClaw's tool policy and plugins --------------------------------------------------------------------
const names=(tools:{name:string}[])=>tools.map(t=>t.name);
assert.deepEqual(names(openClawHarnessTools({plugins:{entries:{'voice-call':{enabled:true,config:{provider:'twilio'}}}}})),['voice_call','image_generate','music_generate','video_generate','tts','browser','exec','sessions_spawn'],'no profile filters nothing; the voice-call plugin leads');
assert.deepEqual(names(openClawHarnessTools({tools:{profile:'coding'}})),['image_generate','music_generate','video_generate','exec','sessions_spawn'],'coding: runtime, sessions and media generation, no browser');
assert.deepEqual(names(openClawHarnessTools({tools:{profile:'minimal'}})),[]);
assert.deepEqual(names(openClawHarnessTools({tools:{deny:['group:media','BASH']},browser:{enabled:false}})),['sessions_spawn'],'deny wins, by group, alias and case');
assert.deepEqual(names(openClawHarnessTools({tools:{allow:['*_generate']}})),['image_generate','music_generate','video_generate'],'wildcards');
assert.deepEqual(names(openClawHarnessTools({tools:{profile:'minimal'},plugins:{entries:{'voice-call':{enabled:false}}}})),[],'a disabled plugin is not offered');
assert.deepEqual(names(openClawHarnessTools({tools:{profile:'minimal'},plugins:{deny:['voice-call'],entries:{'voice-call':{}}}})),[]);
assert.deepEqual(names(openClawHarnessTools({tools:{profile:'minimal'},plugins:{entries:{'voice-call':{}}}})),[],'another profile leaves optional plugin tools out');
assert.deepEqual(names(openClawHarnessTools({tools:{profile:'messaging',alsoAllow:['voice-call']},plugins:{entries:{'voice-call':{}}}})),['voice_call','sessions_spawn'],'unless allowed by name');
assert.deepEqual(names(openClawHarnessTools(null)).length,7,'no config: the built-ins');

// Tools: Hermes Agent's ACP toolsets -------------------------------------------------------------------------
assert.deepEqual(hermesConfigValues('model:\n  provider: openrouter\nplatform_toolsets:\n  cli: [hermes-cli]\n  acp:\n  - image_gen\n  - "browser"\nagent:\n  disabled_toolsets: [browser]  # headless\n'),
 {model:{provider:'openrouter'},platform_toolsets:{cli:['hermes-cli'],acp:['image_gen','browser']},agent:{disabled_toolsets:['browser']}});
assert.deepEqual(names(hermesHarnessTools('')),['browser_navigate','terminal','execute_code','delegate_task'],'unset: the hermes-acp bundle');
assert.deepEqual(names(hermesHarnessTools('platform_toolsets:\n  acp: [hermes-cli]\nagent:\n  disabled_toolsets: terminal\n')),['image_generate','text_to_speech','computer_use','browser_navigate','execute_code','delegate_task'],'a full bundle minus a disabled toolset');
assert.deepEqual(names(hermesHarnessTools('platform_toolsets:\n  acp: [image_gen, video_gen, computer_use]\n')),['image_generate','video_generate','computer_use']);

// For Fox: one line in the turn's instructions, one quiet line in Settings.
const call=openClawHarnessTools({tools:{profile:'minimal',alsoAllow:['voice_call']},plugins:{entries:{'voice-call':{}}}});
assert.match(harnessToolsLine(call),/^Your Agent can also: make phone calls \(voice-call plugin\)\. These are your own tools.*own approvals/);
assert.equal(harnessToolsLine([]),'');
assert.equal(harnessToolsSummary(hermesHarnessTools('platform_toolsets:\n  acp: [image_gen, computer_use]\n')),'Can also generate images, use apps on this computer.');
assert.match(localHarnessTurn({text:'Call the dentist'},{own:true,harnessTools:call}).system,/Your Agent can also: make phone calls/);
assert.doesNotMatch(localHarnessTurn({text:'hi'}).system,/can also/,'nothing to add, no line');

// Events: what each Harness records ------------------------------------------------------------------------
const gmail=openClawExternalEvent({key:'hook:gmail:ingress',updatedAt:1_790_000_000_000,message:'From: Ana <ana@example.com>\nSubject: Invoice',answer:'Ana sent the October invoice.'});
assert.deepEqual(gmail,{id:'openclaw:hook:gmail:ingress@1790000000000',source:'email',title:'Gmail message',text:'Started with: From: Ana <ana@example.com>\nSubject: Invoice\n\nAnswer: Ana sent the October invoice.',at:1_790_000_000_000});
assert.equal(openClawExternalEvent({key:'agent:main:hook:imap:personal:7:42',updatedAt:1_790_000_000,message:'mail'})?.title,'Email (personal)','seconds become milliseconds');
assert.equal(openClawExternalEvent({key:'hook:github:pr-12',updatedAt:1,message:'PR opened'})?.title,'Webhook github');
assert.equal(openClawExternalEvent({key:'hook:3f2a9c4e-1b2d-4c5e-9f00-112233445566',updatedAt:1,message:'ping'})?.title,'Webhook call');
assert.equal(openClawExternalEvent({key:'agent:main:discord:channel:1',updatedAt:1,message:'hi'}),null,'a conversation is not an event');
assert.equal(openClawExternalEvent({key:'cron:daily',createdVia:'cron',updatedAt:1,message:'digest'}),null);
assert.equal(openClawExternalEvent({key:'hook:x',updatedAt:1}),null,'nothing recorded, nothing to show');
assert.deepEqual(hermesExternalEvent({id:'s9',source:'webhook',displayName:'webhook/github',startedAt:1_790_000_000.5,message:'PR #4 opened',answer:'Reviewed.'}),{id:'hermes:s9',source:'webhook',title:'Webhook github',text:'Started with: PR #4 opened\n\nAnswer: Reviewed.',at:1_790_000_000_500});
assert.equal(hermesExternalEvent({id:'s1',source:'telegram',startedAt:1,message:'hi'}),null);

// The World's rules, the same for every Harness -------------------------------------------------------------
const now=1_790_000_000_000,day=86_400_000;
const recent=externalEventsForAttention([{...gmail!,at:now-8*day},{...gmail!,id:'b',at:now-60_000},{...gmail!,id:'c',at:now-day},{...gmail!,id:'d',text:' ',at:now}],now);
assert.deepEqual(recent.map(e=>e.id),['b','c'],'past week, newest first, with something to say');
const observation=externalEventObservation({...gmail!,at:now},'OpenClaw');
assert.ok(validExternalEventAttentionId(observation.id)&&observation.id===externalEventAttentionId(gmail!));
assert.doesNotMatch(observation.id,/gmail|ingress/,'the id never carries its contents');
assert.match(observation.text,/^The person's own Agent \(OpenClaw\) was started from outside by an incoming email at .* UTC: “Gmail message”\. Worth knowing/);
assert.ok(externalEventMatters({source:'webhook'})&&externalEventMatters({source:'email'})&&!externalEventMatters({source:'hook'})&&externalEventMatters({source:'channel'}));
// A new channel message that may need the person (the history sync hands them over as it reads them): a question or
// request, a date or deadline, or a mention, by its words alone; small talk stays out. Its observation asks the Center
// to judge it and names the conversation for a reply.
for(const said of ['Can you review the deck?','Report due Friday','please send it by friday','@kelvin thoughts','<@123> look','明天之前能给我吗','[Replying to: "x"]\n\nany update?'])assert.ok(channelMessageAsks(said),said);
for(const said of ['lunch was soup','Logged the salad.','haha nice',''])assert.ok(!channelMessageAsks(said),said);
const asked=channelMessageEvent({source:'openclaw',thread:'main:agent:main:discord:channel:555',title:'OpenClaw · Discord · #team',turn:{id:'7',text:'Sam: can you send the plan by Friday?',at:now},before:['Sam: hi','Logged.']})!;
assert.deepEqual([asked.id,asked.source,asked.title,asked.text],['channel:openclaw:main:agent:main:discord:channel:555@7','channel','OpenClaw · Discord · #team','Message: Sam: can you send the plan by Friday?\n\nJust before:\n- Sam: hi\n- Logged.']);
assert.equal(channelMessageEvent({source:'openclaw',thread:'t',title:'x',turn:{id:'8',text:'lunch was soup',at:now}}),null);
const askedObservation=externalEventObservation(asked,'OpenClaw');
assert.ok(validExternalEventAttentionId(askedObservation.id));
assert.match(askedObservation.text,/^A new message at .* UTC in “OpenClaw · Discord · #team”, a conversation the person's own Agent \(OpenClaw\) is in with other people, may need the person.*Worth Doing when it asks the person.*reply_in_channel, naming “OpenClaw · Discord · #team”/s);
assert.ok(externalEventPush({id:'item-2',kind:'update',title:'Sam asks for the plan',sources:[{provider:'conversations',id:askedObservation.id}]},new Set([askedObservation.id])),'the phone hears of it once an item cites it');
const pending=new Set([observation.id]);
const item={id:'item-1',kind:'update',title:'October invoice',reason:'Ana sent it this morning',sources:[{provider:'conversations',id:observation.id}]};
assert.deepEqual(externalEventPush(item,pending),{kind:'task',title:'October invoice',body:'Ana sent it this morning',open:{item:'item-1'},act:{attention:'item-1'},collapse:'item-1'});
assert.equal(externalEventPush({...item,kind:'task'},pending),null,'Worth Doing reaches the phone through phoneAttentionPushes');
assert.equal(externalEventPush({...item,sources:[{provider:'conversations',id:'conv-abcdefabcdef'}]},pending),null,'only an item citing a pending event');

// The host's readers against fixture folders ------------------------------------------------------------------
await withTempDir('worldlet-harness-events-',async home=>{
 const write=(file:string,text:string)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);};
 const event=(role:string,text:string)=>JSON.stringify({type:'message',message:{role,content:[{type:'text',text}]}});
 // OpenClaw: a Gmail hook session with two runs, a mapped webhook, a conversation and a cron run.
 const state=path.join(home,'.openclaw');
 write(path.join(state,'openclaw.json'),'{tools:{profile:"coding",alsoAllow:["voice_call"],deny:["video_generate"]},plugins:{entries:{"voice-call":{enabled:true}}}}');
 fs.mkdirSync(path.join(state,'agents','main','agent'),{recursive:true});
 const db=new DatabaseSync(path.join(state,'agents','main','agent','openclaw-agent.sqlite'));
 db.exec(`CREATE TABLE session_nodes(session_key TEXT PRIMARY KEY,current_session_id TEXT,entry_json TEXT,label TEXT,display_name TEXT,created_via TEXT,updated_at INTEGER);
  CREATE TABLE transcript_events(session_id TEXT,seq INTEGER,event_json TEXT,created_at INTEGER,event_zstd BLOB,PRIMARY KEY(session_id,seq));`);
 const node=db.prepare('INSERT INTO session_nodes VALUES(?,?,?,?,?,?,?)'),row=db.prepare('INSERT INTO transcript_events VALUES(?,?,?,0,NULL)');
 node.run('agent:main:hook:gmail:ingress','g1','{}',null,null,'hook',now-60_000);
 row.run('g1',1,event('user','Subject: Old mail'));row.run('g1',2,event('assistant','Old summary'));
 row.run('g1',3,event('user','Subject: Invoice'));row.run('g1',4,event('assistant','Ana sent the invoice.'));
 node.run('agent:main:hook:github:pr','w1',JSON.stringify({label:'PR watcher'}),null,null,'hook',now-120_000);
 row.run('w1',1,event('user','PR #12 opened'));row.run('w1',2,event('assistant','Looks fine.'));
 node.run('agent:main:discord:channel:1','d1','{}',null,null,'channel',now);row.run('d1',1,event('user','hi'));
 node.run('cron:news','c1','{}',null,null,'cron',now);row.run('c1',1,event('assistant','Digest'));
 db.close();
 const env={HOME:home};
 const openclaw=readHarnessEvents('openclaw',home,env).sort((a,b)=>a.at-b.at);
 assert.deepEqual(openclaw.map(e=>[e.source,e.title]),[['webhook','PR watcher'],['email','Gmail message']]);
 assert.equal(openclaw[1].text,'Started with: Subject: Invoice\n\nAnswer: Ana sent the invoice.','the latest run of a persistent hook session');
 assert.deepEqual(names(await harnessTools('openclaw',home,env)!.list()),['voice_call','image_generate','music_generate','exec','sessions_spawn']);

 // Hermes Agent: a webhook session and a Telegram conversation in state.db.
 const hermes=path.join(home,'.hermes');
 write(path.join(hermes,'config.yaml'),'model:\n  provider: openrouter\nplatform_toolsets:\n  acp: [hermes-acp, image_gen]\n');
 const hdb=new DatabaseSync(path.join(hermes,'state.db'));
 hdb.exec(`CREATE TABLE sessions(id TEXT PRIMARY KEY,source TEXT NOT NULL,display_name TEXT,parent_session_id TEXT,started_at REAL NOT NULL,message_count INTEGER DEFAULT 0,title TEXT);
  CREATE TABLE messages(id INTEGER PRIMARY KEY AUTOINCREMENT,session_id TEXT NOT NULL,role TEXT NOT NULL,content TEXT,timestamp REAL NOT NULL);`);
 hdb.prepare('INSERT INTO sessions VALUES(?,?,?,NULL,?,2,NULL)').run('wh1','webhook','webhook/stripe',(now-30_000)/1000);
 hdb.prepare('INSERT INTO sessions VALUES(?,?,?,NULL,?,2,NULL)').run('tg1','telegram','Ana',now/1000);
 const msg=hdb.prepare('INSERT INTO messages(session_id,role,content,timestamp) VALUES(?,?,?,0)');
 msg.run('wh1','user','Payment of $40 received');msg.run('wh1','assistant','Logged the payment.');msg.run('tg1','user','hi');
 hdb.close();
 assert.deepEqual(readHarnessEvents('hermes',home,env),[{id:'hermes:wh1',source:'webhook',title:'Webhook stripe',text:'Started with: Payment of $40 received\n\nAnswer: Logged the payment.',at:now-30_000}]);
 assert.deepEqual(names(await harnessTools('hermes',home,env)!.list()),['image_generate','browser_navigate','terminal','execute_code','delegate_task']);

 // A subscription hands each recorded event over once, and later ones as they are recorded.
 const seen:string[]=[];
 const stop=harnessEvents('hermes',home,env,20)!.subscribe(e=>seen.push(e.id));
 const again=new DatabaseSync(path.join(hermes,'state.db'));
 again.prepare('INSERT INTO sessions VALUES(?,?,?,NULL,?,1,NULL)').run('wh2','webhook','webhook/stripe',now/1000);
 again.prepare('INSERT INTO messages(session_id,role,content,timestamp) VALUES(?,?,?,0)').run('wh2','user','Refund requested');
 again.close();
 await new Promise(resolve=>setTimeout(resolve,120));
 stop();
 assert.deepEqual(seen,['hermes:wh1','hermes:wh2']);
 // Nothing there, nothing reported.
 assert.deepEqual(readHarnessEvents('openclaw',path.join(home,'nobody'),{HOME:path.join(home,'nobody')}),[]);
});
console.log('PASS Harness events and tools: OpenClaw hook/Gmail/IMAP sessions and Hermes webhook runs read-only, tool policy, plugins and ACP toolsets, the turn line, Settings line, World observation and phone push rules');
