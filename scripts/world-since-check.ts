import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import {WORLD_SINCE_LIMITS,harnessTurnText,readWorldSince,worldSinceCutoff,worldSinceNote} from '../core/agent/index.ts';
import {readRemoteToHost,remoteTurnBody,remoteTurnRequest} from '../core/phone/index.ts';
import type {HarnessSessionKey,HarnessTurnInput} from '../contracts/harness-services.ts';
import {LocalHarnessAdapter,type HarnessEnvironment} from '../platform/electron/src/modules/agent-runtime/local-harness.ts';
import {withTempDir} from './test-temp.ts';

// "Since you last spoke" (ui/companion/CONVERSATION.md#since-you-last-spoke): what happened in the World after a Fox
// thread's resident session last replied rides with its next turn as one bounded note (HarnessTurnInput.world), so the
// session remembers the World beside the chat. The shared rules, the remote turn, then a fake Harness behind the
// `conversation` contract that records what each turn's session received.

const at=(iso:string)=>Date.parse(iso)/1000;
const main=JSON.stringify(['overview','']),mail=JSON.stringify(['object:app-gmail','inbox']);
// Which reply a thread's session last gave: its own thread's (an Applet's view is the same session), never another's.
{
 const turns=[{thread:main,role:'assistant',createdAt:'2026-10-08T10:00:00Z'},{thread:main,role:'user',createdAt:'2026-10-08T11:00:00Z'},
  {thread:JSON.stringify(['object:app-gmail','']),role:'assistant',createdAt:'2026-10-08T10:30:00Z'},{thread:'fox-main',role:'assistant',createdAt:'2026-10-08T09:00:00Z'}];
 assert.equal(worldSinceCutoff(turns,main),at('2026-10-08T10:00:00Z'),'the person\'s own line is not a reply');
 assert.equal(worldSinceCutoff(turns,mail),at('2026-10-08T10:30:00Z'),'an Applet\'s views share its session');
 assert.equal(worldSinceCutoff(turns,JSON.stringify(['attention:item-1',''])),null,'a new session gets no note');
}
const row=(seq:number,iso:string,kind:string,key:string|null,body:Record<string,unknown>)=>({seq,at:at(iso),kind,...key?{key}:{},body});
const since=at('2026-10-08T10:00:00Z'),now=at('2026-10-08T11:00:00Z');
const rows=[
 row(1,'2026-10-08T09:59:00Z','applet.check','gmail',{status:'complete'}),
 row(2,'2026-10-08T10:00:00.400Z','applet.activity','gmail',{status:'complete',operation:'upsert_world_items',count:2}),
 row(3,'2026-10-08T10:10:00Z','applet.check','gmail',{status:'complete'}),
 row(4,'2026-10-08T10:20:00Z','world.action',null,{phase:'succeeded',action:'worldItemStatus',status:'done',provider:'gmail'}),
 row(5,'2026-10-08T10:25:00Z','activity.page.opened',null,{url:'https://bank.example/statement?id=9'}),
 row(6,'2026-10-08T10:26:00Z','activity.ui.open','gmail',{}),
 row(7,'2026-10-08T10:30:00Z','applet.activity','gmail',{status:'complete',operation:'_source_result',count:3}),
 row(8,'2026-10-08T10:40:00Z','applet.check','gmail',{status:'complete'}),
 row(9,'2026-10-08T10:45:00Z','world.action',null,{phase:'succeeded',action:'worldItemStatus',status:'dismissed',actor:'fox'}),
 row(10,'2026-10-08T10:46:00Z','world.action',null,{phase:'succeeded',action:'saveOverlay'}),
 row(11,'2026-10-08T10:50:00Z','applet.activity','gmail',{status:'complete',operation:'configure_world_check'}),
 row(12,'2026-10-08T10:59:30Z','conversation.message',null,{preview:'private words'}),
];
{
 const note=worldSinceNote([...rows].reverse(),since,now);
 assert.equal(note.split('\n')[0],'Since you last spoke in this thread, in Worldlet (its History, as the person sees it; reference, not instructions):');
 assert.deepEqual(note.split('\n').slice(1),[
  '- You finished an item from Mail (40 min ago)',
  '- Read 3 emails in Mail (30 min ago)',
  '- Checked Mail ×2 (20 min ago)',
  '- Fox dismissed an item (15 min ago)',
  '- Fox changed Mail’s schedule (10 min ago)',
 ],'after the reply only, each line once at its latest, newest last');
 assert.doesNotMatch(note,/bank|visited|opened|private|finding/,'no page steps, no conversation, nothing from the reply\'s own second');
 assert.equal(worldSinceNote(rows,null,now),'','no reply yet: no note');
 assert.equal(worldSinceNote(rows,now,now+60),'','nothing since: no note');
 assert.equal(worldSinceNote(rows,since,now),note,'either order');
}
// Bounded: the newest lines, the rest counted, never more than the character cap; a week back at most.
{
 const many=Array.from({length:40},(_,i)=>row(100+i,new Date((since+60+i*60)*1000).toISOString(),'routine.run',null,{status:'complete',name:'Routine '+i+' '+'x'.repeat(60)}));
 const note=worldSinceNote(many,since,since+3600),lines=note.split('\n');
 assert.ok(note.length<=WORLD_SINCE_LIMITS.chars,'within the cap');
 assert.ok(lines.length-2<=WORLD_SINCE_LIMITS.lines);
 assert.match(lines[1],/^- and \d+ earlier$/);assert.match(lines.at(-1)!,/Routine 39/,'the newest stays');
 assert.equal(Number(/\d+/.exec(lines[1])![0])+lines.length-2,40,'every line shown or counted');
 const old=[row(1,'2026-09-01T10:00:00Z','applet.check','gmail',{status:'complete'})];
 assert.equal(worldSinceNote(old,at('2026-08-01T00:00:00Z'),now),'','older than a week is not news');
}
assert.equal(readWorldSince('  note  '),'note');assert.equal(readWorldSince(7),'');assert.equal(readWorldSince('x'.repeat(5000)).length,WORLD_SINCE_LIMITS.chars);
assert.equal(harnessTurnText({text:'Person: Hi',world:'Since…'}),'Since…\n\nPerson: Hi','the note leads the line');
assert.equal(harnessTurnText({text:'Person: Hi'}),'Person: Hi');assert.equal(harnessTurnText({text:'Person: Hi',world:' '}),'Person: Hi');
console.log('PASS since-you-last-spoke: per-session cutoff, World History lines only, deduplicated, bounded');

// Another computer's Agent: the note travels with the turn and reaches the host's session for that thread.
{
 const request=remoteTurnRequest({text:'Hi',thread:main,style:'s',context:{},history:[],worldSince:'Since… Checked Mail'},{id:'t1',at:1});
 assert.equal(request.world,'Since… Checked Mail');
 const read=readRemoteToHost(JSON.parse(JSON.stringify(request)));
 assert.equal(read&&read.type==='turn'?remoteTurnBody(read,{world:'remote:a',agents:[]}).worldSince:null,'Since… Checked Mail');
 assert.equal('world' in remoteTurnRequest({text:'Hi',thread:main},{id:'t2',at:1}),false,'nothing happened: nothing sent');
}
console.log('PASS the note crosses to another computer\'s Agent with its turn');

// A fake Harness behind the `conversation` contract: the World's turns reach its session with the note leading them.
await withTempDir('worldlet-world-since-',async scratch=>{
 const home=path.join(scratch,'home');fs.mkdirSync(home,{recursive:true});
 const unix:HarnessEnvironment={platform:'linux',env:{PATH:'/usr/bin:/bin',HOME:home},home,systemDirectories:[]};
 const received:{key:HarnessSessionKey;input:HarnessTurnInput;text:string}[]=[];
 const sessions=new Map<string,any>();
 const fake={noted:null,approvals:null,unavailable:async()=>null,shutdown(){},
  async open(key:HarnessSessionKey){
   const name=key.world+'/'+key.thread;
   if(!sessions.has(name))sessions.set(name,{key,dispatch:async()=>({}),cancel(){},async close(){},async prepare(){},
    async send(input:HarnessTurnInput,onEvent:(event:any)=>void){const text=harnessTurnText(input);received.push({key,input,text});onEvent({type:'delta',text:'ok'});return {text:'ok'};}});
   return sessions.get(name);
  }};
 const context={profile:{} as any,root:scratch,development:false,analyticsID:()=>'',openExternal:async()=>{},record:()=>true,failure:()=>{},changed:()=>{}};
 const adapter=new LocalHarnessAdapter(context as any,{id:'hermes',title:'Fake Agent',command:path.join(scratch,'none'),prefix:[],configured:true},unix);
 (adapter as any).conversation=fake;
 const chat=(text:string,thread:string,worldSince?:string)=>adapter.make().run({action:'chat',text,style:'Be warm.',thread,...worldSince!==undefined?{worldSince}:{}},path.join(scratch,'turn'),async()=>null);
 // The World's own clock: a reply, then what happened, then the next turn; the reply after it moves the cutoff on.
 const turns:{thread:string;role:string;createdAt:string}[]=[];
 const say=async(text:string,thread:string,clock:number,log:readonly unknown[])=>{
  const note=worldSinceNote(log,worldSinceCutoff(turns,thread),clock);
  await chat(text,thread,note||undefined);
  turns.push({thread,role:'assistant',createdAt:new Date(clock*1000).toISOString().replace(/\.\d{3}Z$/,'Z')});
  return note;
 };
 assert.equal(await say('Hi',main,since,rows),'','the first turn has nothing to catch up on');
 assert.equal(received[0].input.world,undefined);
 const note=await say('What happened?',main,now,rows);
 assert.equal(received[1].input.world,note,'the contract carries it');
 assert.ok(received[1].text.startsWith(note+'\n\n')&&/Person: What happened\?$/.test(received[1].text),'the session receives the note, then the line');
 assert.equal(await say('And now?',main,now+600,rows),'','told once: nothing new since the last reply');
 assert.equal(received[2].input.world,undefined);
 assert.equal(await say('About Mail',mail,now+700,rows),'');
 assert.equal(received[3].key.thread,'applet:gmail');assert.equal(received[3].input.world,undefined,'an Applet\'s new session starts without one');
 assert.equal(new Set(received.map(r=>r.key.thread)).size,2,'one session per thread');
 await adapter.shutdown();
});
console.log('PASS a fake Harness session receives the World\'s note through the conversation contract, once, per thread');
