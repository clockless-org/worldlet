// The `send` Harness service (contracts/harness-services.ts HarnessSend; core/agent/PORTABILITY.md#replying-in-a-channel):
// Fox offers a reply in the channel a brought conversation came from, the person sees the exact text with Send, Edit and
// Skip, and only their Send has their own Agent send it. OpenClaw and Hermes Agent declare it (`openclaw message send`,
// `hermes send`), every other Harness does not and is not offered it. Fixture folders and a fake command only: nothing
// is sent, and the Agents' own files are only read.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {HARNESS_SERVICE_NAMES} from '../contracts/harness-services.ts';
import {HARNESS_SERVICES,channelReplyText,harnessSendResult,harnessService,hermesSendArgs,hermesSendRoute,hermesSharedChat,openClawSendArgs,openClawSendRoute,openClawSharedSession} from '../core/agent/index.ts';
import {harnessSend,type SendCommand} from '../platform/electron/src/modules/agent-runtime/harness-send.ts';
import {installChannelReplies} from '../platform/electron/src/modules/fox/channel-reply.ts';
import {WorldLedger} from '../platform/electron/src/store/ledger.ts';
import {mountChannelReply} from '../ui/companion/fox-channel-reply.ts';

// Declared, never assumed from a name.
assert.ok(HARNESS_SERVICE_NAMES.includes('send'));
assert.deepEqual(Object.keys(HARNESS_SERVICES).filter(id=>harnessService(id,'send')).sort(),['hermes','openclaw'],'only the Agents with a send command of their own declare it');
for(const id of ['openclaw','hermes'])assert.equal(harnessService(id,'send'),'native');

// What is approved is text: bounded, no attachments.
assert.deepEqual(channelReplyText('  Sure, Friday works.\r\n'),{text:'Sure, Friday works.'});
for(const bad of ['',' ','x'.repeat(4001),'MEDIA:/etc/passwd','see [[as_document]]',null])assert.ok('error' in channelReplyText(bad),String(bad).slice(0,20));

// Where each Agent sends, from its own record of the thread.
assert.ok(openClawSharedSession('agent:main:discord:channel:555')&&openClawSharedSession('agent:main:telegram:group:-100')&&!openClawSharedSession('agent:main:main'));
assert.ok(hermesSharedChat('group')&&!hermesSharedChat('dm')&&!hermesSharedChat(null));
assert.deepEqual(openClawSendRoute({deliveryContext:{channel:'discord',to:'channel:555',accountId:'work'},lastChannel:'telegram',lastTo:'1'}),{channel:'discord',to:'channel:555',account:'work'});
assert.deepEqual(openClawSendRoute({lastChannel:'telegram',lastTo:'-100123',lastThreadId:17}),{channel:'telegram',to:'-100123',thread:'17'});
for(const entry of [{},{lastChannel:'webchat',lastTo:'x'},{deliveryContext:{channel:'discord',to:'a\nb'}},null])assert.equal(openClawSendRoute(entry),null);
assert.deepEqual(openClawSendArgs({channel:'discord',to:'channel:555',account:'work'},'-- ok'),['message','send','--channel=discord','--target=channel:555','--account=work','--message=-- ok','--json'],'every value as --name=value');
assert.deepEqual(hermesSendRoute({source:'telegram',chatId:-100123,threadId:'17'}),{platform:'telegram',chat:'-100123',thread:'17'});
for(const session of [{source:'cli',chatId:'1'},{source:'acp',chatId:'1'},{source:'webhook',chatId:'1'},{source:'telegram'},{source:'discord',chatId:'a:b'}])assert.equal(hermesSendRoute(session),null);
assert.deepEqual(hermesSendArgs({platform:'telegram',chat:'-100123',thread:'17'}),['send','--to=telegram:-100123:17','--file','-','--json'],'the text goes on stdin');
assert.deepEqual(harnessSendResult(0,'{"ok":true,"result":{"messageId":"m1"}}'),{ok:true,id:'m1'});
assert.deepEqual(harnessSendResult(0,'{"success":true}'),{ok:true});
assert.deepEqual(harnessSendResult(1,'{"ok":false,"error":"Unknown channel"}'),{ok:false,error:'Unknown channel'});
assert.deepEqual(harnessSendResult(1,'','warning\nhermes send: Platform not configured\n'),{ok:false,error:'hermes send: Platform not configured'});
assert.equal(harnessSendResult(0,'{"error":{"message":"rate limited"}}').ok,false);

const home=fs.mkdtempSync(path.join(os.tmpdir(),'worldlet-send-'));
try{
 // OpenClaw: a Discord channel delivered to `channel:555`, and the person's web chat, which it delivers nowhere.
 fs.mkdirSync(path.join(home,'.openclaw','agents','main','agent'),{recursive:true});
 fs.writeFileSync(path.join(home,'.openclaw','openclaw.json'),'{agents: {entries: {main: {default: true}}}}');
 const claw=new DatabaseSync(path.join(home,'.openclaw','agents','main','agent','openclaw-agent.sqlite'));
 claw.exec(`CREATE TABLE session_nodes(session_key TEXT PRIMARY KEY,current_session_id TEXT,entry_json TEXT,label TEXT,display_name TEXT,created_via TEXT,updated_at INTEGER);
  CREATE TABLE transcript_events(session_id TEXT,seq INTEGER,event_json TEXT,created_at INTEGER,event_zstd BLOB,PRIMARY KEY(session_id,seq));`);
 claw.prepare('INSERT INTO session_nodes VALUES(?,?,?,?,?,?,0)').run('agent:main:discord:channel:555','s1',JSON.stringify({subject:'#team',channel:'discord',deliveryContext:{channel:'discord',to:'channel:555'}}),null,null,'channel');
 claw.prepare('INSERT INTO session_nodes VALUES(?,?,?,?,?,?,0)').run('agent:main:dashboard:notes','s2',JSON.stringify({subject:'Notes',channel:'webchat'}),null,null,'api');
 claw.close();
 // Hermes Agent: a Telegram group.
 fs.mkdirSync(path.join(home,'.hermes'),{recursive:true});fs.writeFileSync(path.join(home,'.hermes','config.yaml'),'model:\n  provider: openrouter\n');
 const hermes=new DatabaseSync(path.join(home,'.hermes','state.db'));
 hermes.exec(`CREATE TABLE sessions(id TEXT PRIMARY KEY,source TEXT NOT NULL,chat_id TEXT,chat_type TEXT,thread_id TEXT,display_name TEXT,parent_session_id TEXT,started_at REAL NOT NULL,message_count INTEGER DEFAULT 0,title TEXT);
  CREATE TABLE messages(id INTEGER PRIMARY KEY AUTOINCREMENT,session_id TEXT NOT NULL,role TEXT NOT NULL,content TEXT,timestamp REAL NOT NULL);`);
 hermes.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?,?,?,?,?)').run('h1','telegram','-100123','group',null,'Family',null,100,1,'Family');
 hermes.prepare('INSERT INTO messages(session_id,role,content,timestamp) VALUES(?,?,?,?)').run('h1','user','Who is cooking?',100);
 hermes.close();
 const before=fs.readdirSync(path.join(home,'.openclaw','agents','main','agent')).map(f=>f+':'+fs.statSync(path.join(home,'.openclaw','agents','main','agent',f)).size).sort();

 const environment={platform:'linux' as NodeJS.Platform,env:{PATH:'/usr/bin',HOME:home},home,systemDirectories:[]};
 const sent:{id:string;args:string[];input?:string}[]=[];
 const run:SendCommand=async(install,args,{input})=>{sent.push({id:install.id,args,input});return {code:0,stdout:'{"ok":true,"messageId":"m9"}',stderr:''};};
 const locate=()=>[{id:'openclaw' as const,title:'OpenClaw',command:'/bin/openclaw',prefix:[],configured:true},{id:'hermes' as const,title:'Hermes Agent',command:'/bin/hermes',prefix:[],configured:true}];
 const openclaw=harnessSend('openclaw',environment,{locate,run})!,hermesSend=harnessSend('hermes',environment,{locate,run})!;
 assert.equal(harnessSend('pi',environment,{locate,run}),null,'a Harness that declares no send is not offered it');
 assert.deepEqual(await openclaw.route('main:agent:main:discord:channel:555'),{thread:'main:agent:main:discord:channel:555',channel:'discord',where:'Discord'});
 assert.equal(await openclaw.route('main:agent:main:dashboard:notes'),null,'a thread it delivers nowhere has no route');
 assert.equal(await harnessSend('openclaw',environment,{locate:()=>[],run})!.route('main:agent:main:discord:channel:555'),null,'not installed here: nothing to send with');
 assert.deepEqual(await hermesSend.route('h1'),{thread:'h1',channel:'telegram',where:'Telegram'});
 assert.deepEqual(await openclaw.send('main:agent:main:discord:channel:555','On it, Friday.'),{id:'m9'});
 assert.deepEqual(await hermesSend.send('h1','I am cooking.'),{id:'m9'});
 assert.deepEqual(sent,[{id:'openclaw',args:['message','send','--channel=discord','--target=channel:555','--message=On it, Friday.','--json'],input:undefined},{id:'hermes',args:['send','--to=telegram:-100123','--file','-','--json'],input:'I am cooking.'}]);
 await assert.rejects(harnessSend('openclaw',environment,{locate,run:async()=>({code:1,stdout:'{"ok":false,"error":"Missing permissions"}',stderr:''})})!.send('main:agent:main:discord:channel:555','x'),/Missing permissions/);
 assert.deepEqual(fs.readdirSync(path.join(home,'.openclaw','agents','main','agent')).map(f=>f+':'+fs.statSync(path.join(home,'.openclaw','agents','main','agent',f)).size).sort(),before,'its files are only read');

 // The offer in the World: the conversation Fox names, its thread's route, and only the person's Send sends.
 const root=path.join(home,'Worldlet'),world=new WorldLedger(root);
 world.addCompanionTurns('openclaw',[{id:'t1',session:'OpenClaw · Discord · #team',role:'user',text:'Sam: can you send the plan?',createdAt:'2026-10-08T10:00:00Z'}]);
 world.addCompanionTurns('pi',[{id:'t2',session:'pi · site · Footer',role:'user',text:'Add a footer',createdAt:'2026-10-08T10:00:00Z'}]);
 world.saveHistoryCursor('openclaw','main:agent:main:discord:channel:555','0','OpenClaw · Discord · #team');
 const actions:Record<string,(request:any)=>Promise<any>>={},events:any[]=[],delivered:[string,string][]=[];
 let sample=false;
 const fake=(id:string)=>id==='openclaw'?{route:openclaw.route,send:async(thread:string,text:string)=>{delivered.push([thread,text]);return {id:'m1'};}}:null;
 installChannelReplies({store:{writable:true,sampleEnabled:()=>sample,ledger:()=>world},page:{event:(name:string,detail:any)=>events.push([name,detail])},
  optional:(name:string)=>name==='agent'?{channelSend:fake}:undefined,register:(found:any)=>Object.assign(actions,found)} as any);
 const prepared=await actions.channelReply({operation:'prepare',conversation:'OpenClaw · Discord · #team',text:'Sending it tonight.'});
 assert.equal(prepared.status,'user_review');assert.match(prepared.message,/Nothing is sent until they press Send/);
 const [name,offer]=events.at(-1);
 assert.deepEqual([name,offer.where,offer.text],['worldlet:channel-reply','Discord · #team','Sending it tonight.']);
 assert.deepEqual(delivered,[],'offering sends nothing');
 assert.match((await actions.channelReply({operation:'prepare',conversation:'#team',text:'MEDIA:/tmp/x'})).error,/text only/);
 assert.match((await actions.channelReply({operation:'prepare',conversation:'pi · site · Footer',text:'hi'})).error,/cannot send messages from Worldlet/,'an Agent with no send path is not offered it');
 assert.match((await actions.channelReply({operation:'prepare',conversation:'Nowhere',text:'hi'})).error,/No brought conversation/);
 assert.equal((await actions.channelReply({operation:'prepare',conversation:'#team',text:'By its short name too.'})).ok,true);
 const second=events.at(-1)[1];
 await actions.channelReply({operation:'send',id:offer.id,text:'Sending it tonight, Sam.'});
 assert.deepEqual(delivered,[['main:agent:main:discord:channel:555','Sending it tonight, Sam.']],'the text the person sent, edited');
 assert.deepEqual(events.at(-1),['worldlet:channel-reply',{id:offer.id,settled:'sent',where:'Discord · #team'}]);
 await assert.rejects(actions.channelReply({operation:'send',id:offer.id,text:'again'}),/no longer waiting/,'once');
 await actions.channelReply({operation:'skip',id:second.id});
 assert.equal(events.at(-1)[1].settled,'skipped');assert.equal(delivered.length,1);
 sample=true;
 await assert.rejects(actions.channelReply({operation:'prepare',conversation:'#team',text:'hi'}),/practice world/);
 world.close();

 // The card: Send, Edit and Skip; Edit turns the text into a field and Send sends what it holds.
 class Node {textContent='';value='';disabled=false;onclick:any;type='';rows=0;maxLength=0;className='';style:any={};children:any[]=[];append(...nodes:any[]){this.children.push(...nodes);}replaceChildren(...nodes:any[]){this.children=nodes;}setAttribute(){}focus(){}}
 const listeners=new Map<string,Function>();
 (globalThis as any).window={addEventListener:(event:string,fn:Function)=>listeners.set(event,fn)};
 (globalThis as any).document={createElement:()=>new Node()};
 let guide:any;const calls:any[]=[];
 mountChannelReply(async(action:string,args:any)=>{calls.push({action,args});return {ok:true};},()=>({setGuide:(value:any)=>guide=value}));
 listeners.get('worldlet:channel-reply')!({detail:{id:'reply-1',where:'Discord · #team',text:'Sending it tonight.'}});
 assert.equal(guide.text,'Reply in Discord · #team?');assert.equal(guide.body.children[0].textContent,'Sending it tonight.');
 assert.deepEqual(guide.actions.map((b:any)=>b.textContent),['Send','Edit','Skip']);
 guide.actions[1].onclick();
 assert.deepEqual(guide.actions.map((b:any)=>b.textContent),['Send','Skip']);
 guide.body.children[0].value='Sending it tonight, Sam.';
 await guide.actions[0].onclick();
 assert.deepEqual(calls,[{action:'channelReply',args:{operation:'send',id:'reply-1',text:'Sending it tonight, Sam.'}}]);
 assert.equal(guide.text,'Sent to Discord · #team.');
 listeners.get('worldlet:channel-reply')!({detail:{id:'reply-2',where:'Telegram · Family',text:'Me.'}});
 await guide.actions[2].onclick();
 assert.deepEqual(calls.at(-1),{action:'channelReply',args:{operation:'skip',id:'reply-2'}});assert.equal(guide.text,'Not sent.');
 delete (globalThis as any).window;delete (globalThis as any).document;
}finally{fs.rmSync(home,{recursive:true,force:true});}
console.log('PASS Harness send: OpenClaw and Hermes Agent declare it and send through their own command with the route from their own record, others are not offered it; a reply is offered with the exact text, Send, Edit and Skip, and only the person’s Send sends it');
