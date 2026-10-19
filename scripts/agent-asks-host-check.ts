import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {withTempDir} from './test-temp.ts';
import {WorldLedger} from '../platform/electron/src/store/ledger.ts';
import {createAgentAccess} from '../platform/electron/src/modules/agent-runtime/agent-access.ts';
import {createAgentAsks} from '../platform/electron/src/modules/agent-runtime/agent-asks.ts';
import {createAgentOrders} from '../platform/electron/src/modules/agent-runtime/agent-orders.ts';
import {ORDER_REASONS} from '../agent/gate/orders.ts';
import {DatabaseSync} from 'node:sqlite';
import {openStandingWorldTools} from '../platform/electron/src/modules/agent-runtime/world-tool-bridge.ts';
import {STANDING_OUTSIDE_TURN} from '../agent/gate/grants.ts';
import {ASK_REASONS,askItemId} from '../agent/gate/asks.ts';
import {HERMES_CHANNEL_READ_ONLY} from '../agent/gate/hermes-server.ts';

// Agent asks on the host (agent/gate/GRANTS.md#agent-asks), the same modules the Electron and Node hosts run: each ask
// and its Attention item in world.sqlite, reached only through the standing `worldlet` MCP server with each Agent's
// own token and Grants. A granted Agent posts and reads only its own; an ungranted one is refused; claims hold a lease
// and resolve names the revision; the person's answer reaches the Agent's next read; every call and answer is audited.
// Orders: work for one Agent, the World's order target, and a real wake command run for the Agent work is for.
await withTempDir('worldlet-asks-',async dir=>{
 const ledger=new WorldLedger(path.join(dir,'world'));
 let clock=Date.parse('2026-10-15T12:00:00.000Z');
 const now=()=>new Date(clock).toISOString();
 const secrets=new Map<string,string>();
 const vault={get:(id:string)=>secrets.get(id)??null,set:(id:string,value:string)=>{secrets.set(id,value);},delete:(id:string)=>{secrets.delete(id);},deleteAll:()=>secrets.clear()};
 const access=createAgentAccess({root:path.join(dir,'access'),vault,ledger:()=>ledger});
 let changes=0;
 // Timers the check runs by hand: the debounce's wake waiting for its minute, and each wake's timeout.
 const timers:{run:()=>void;ms:number;cleared:boolean}[]=[];
 const fake={set:(run:()=>void,ms:number)=>{const timer={run:()=>{timer.cleared=true;run();},ms,cleared:false};timers.push(timer);return timer;},clear:(timer:unknown)=>{(timer as {cleared:boolean}).cleared=true;}};
 // The setting is kept in the World's own world.sqlite (agent_settings), as on the hosts.
 const orders=createAgentOrders({root:path.join(dir,'world'),access,ledger:()=>ledger,now:()=>clock,timers:fake,timeoutMs:300_000});
 const asks=createAgentAsks({ledger:()=>ledger,name:agentId=>access.identity(agentId)?.name??agentId,changed:()=>{changes+=1;},now,orders:()=>orders});
 const standing=await openStandingWorldTools({access,asks:(agentId,args)=>asks.call(agentId,args),channel:async()=>({error:'not here'})});
 try{
  const agent=(id:string,name:string)=>{
   const home=path.join(dir,id);fs.mkdirSync(home);
   const {url,token}=JSON.parse(fs.readFileSync(standing.server(home,{id,name,harness:id,kind:'local'}).env.WORLDLET_MCP_ENDPOINT_FILE,'utf8'));
   return async(action:string,args:object={})=>{
    const response=await fetch(url,{method:'POST',headers:{authorization:'Bearer '+token},body:JSON.stringify({method:'call',name:'call_world_tool',arguments:{target:'asks',action,arguments:JSON.stringify(args)}})});
    if(response.status!==200)return {status:response.status};
    return JSON.parse((await response.json()).text);
   };
  };
  const codex=agent('codex','Codex'),claude=agent('claude-code','Claude Code'),hermes=agent('hermes','Hermes Agent');

  // No Grant by default: refused, and nothing is stored.
  assert.equal((await codex('post',{title:'Which plan?'})).error,STANDING_OUTSIDE_TURN);
  assert.deepEqual(ledger.agentAsks(),[]);
  assert.ok(access.grantAsks('codex','ask')&&access.grantAsks('codex','work')&&access.grantAsks('claude-code','ask'));

  // Posting: stamped with the caller whatever the model says; the Attention item is the host's, naming the Agent.
  const posted=await codex('post',{title:'Which plan?',body:'Small or large.',choices:['Small','Large'],link:'https://example.com/plan',agentId:'hermes'});
  assert.equal(posted.ok,true);assert.equal(posted.ask.agentId,'codex');assert.equal(posted.ask.revision,1);
  const id=posted.ask.id;
  const item=ledger.value('items',askItemId(id))!;
  assert.deepEqual([item.provider,item.kind,item.status,item.agentId,item.agentName,item.askId,item.title],['agents','task','open','codex','Codex',id,'Which plan?']);
  assert.deepEqual(item.askChoices,['Small','Large']);assert.equal(item.sources[0].url,'https://example.com/plan');
  assert.ok(changes>0,'the World is told to refresh');
  assert.equal((await codex('post',{title:'Key sk-'+'x'.repeat(30)})).error,ASK_REASONS.secret);
  assert.equal((await codex('post',{title:'bad',link:'http://example.com'})).error,ASK_REASONS.link);

  // Reading: only its own. Another Agent sees nothing of it, even by ID; an Agent with no Grant is refused.
  assert.deepEqual((await codex('read')).asks.map((ask:any)=>ask.id),[id]);
  assert.deepEqual((await claude('read')).asks,[]);
  assert.deepEqual((await claude('read',{ids:[id]})).asks,[]);
  assert.equal((await hermes('read')).error,HERMES_CHANNEL_READ_ONLY);

  // The person answers on the card: the Agent's next read has it, the item settles, and it is audited.
  await assert.rejects(()=>asks.answer({operation:'answer',id,outcome:'answered',choice:'Medium'}),/own choices/);
  assert.deepEqual(await asks.answer({action:'agentAsk',operation:'answer',id,outcome:'answered',choice:'Large',note:'Go big.'}),{ok:true,status:'answered'});
  const [answered]=(await codex('read',{status:'answered'})).asks;
  assert.deepEqual([answered.status,answered.answer.choice,answered.answer.note,answered.revision],['answered','Large','Go big.',2]);
  assert.deepEqual([ledger.value('items',askItemId(id))!.status,ledger.value('items',askItemId(id))!.askChoice],['done','Large']);
  await assert.rejects(()=>asks.answer({operation:'answer',id,outcome:'done'}),/already settled/);

  // Done through the ordinary item status (a phone or a browser): the ask follows on the next call.
  const second=(await codex('post',{title:'Read the summary'})).ask;
  assert.equal(ledger.value('items',askItemId(second.id))!.kind,'update');
  ledger.update(askItemId(second.id),'done');
  assert.equal((await codex('read',{ids:[second.id]})).asks[0].status,'done');

  // Work: an input ask is claimed with a lease, refused to an Agent without "Can take work", reclaimable once stale,
  // and resolved only by its holder at the revision it read.
  const work=(await claude('post',{kind:'input',title:'Tidy the docs'})).ask;
  assert.equal((await claude('claim')).error,STANDING_OUTSIDE_TURN,'asking is not taking work');
  const [claimed]=(await codex('claim')).asks;
  assert.deepEqual([claimed.id,claimed.status,claimed.claimedBy,claimed.revision],[work.id,'claimed','codex',2]);
  assert.deepEqual((await codex('claim')).asks,[],'a live lease holds');
  assert.equal((await codex('resolve',{id:work.id,note:'Done.',expectedRevision:1})).error,ASK_REASONS.stale);
  clock+=61*60_000;
  assert.ok(access.grantAsks('claude-code','work'));
  const [taken]=(await claude('claim',{ids:[work.id]})).asks;
  assert.deepEqual([taken.claimedBy,taken.revision],['claude-code',3],'a stale lease is claimable again');
  assert.equal((await codex('resolve',{id:work.id,note:'Done.',expectedRevision:3})).error,ASK_REASONS.notYours);
  const resolved=await claude('resolve',{id:work.id,note:'Docs tidied.',links:['https://example.com/pull/1'],expectedRevision:3});
  assert.deepEqual([resolved.ask.status,resolved.ask.resolution.note,resolved.ask.resolution.links],['done','Docs tidied.',['https://example.com/pull/1']]);
  assert.equal(ledger.value('items',askItemId(work.id))!.status,'done');
  assert.deepEqual((await codex('read',{ids:[work.id]})).asks,[],'no longer its own once another took it');

  // Attachments: a screenshot and a log, kept in world.sqlite apart from the ask (which keeps their name, type, size and
  // SHA-256), read back in parts only by the Agent that posted the ask or the one that claimed it, and by the person's
  // own page through agentAsk attachment; they stay when the ask settles.
  {
   const screenshot=Buffer.alloc(150_000,7);Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]).copy(screenshot);
   const log=Buffer.from('12:00 started\n12:01 ERROR could not save\n');
   const sha=(bytes:Buffer)=>crypto.createHash('sha256').update(bytes).digest('hex');
   const sent=await codex('post',{kind:'input',title:'Save fails',attachments:[{name:'Desktop/screen.png',type:'image/png',data:screenshot.toString('base64')},{name:'app.log',type:'text/plain',data:log.toString('base64')}]});
   assert.equal(sent.ok,true,JSON.stringify(sent).slice(0,300));
   const askId=sent.ask.id;
   assert.deepEqual(sent.ask.attachments,[{id:'att-1',name:'screen.png',type:'image/png',size:screenshot.length,sha256:sha(screenshot)},{id:'att-2',name:'app.log',type:'text/plain',size:log.length,sha256:sha(log)}]);
   assert.ok(!JSON.stringify(ledger.agentAsks()).includes(log.toString('base64')),'the ask record keeps no bytes');
   assert.deepEqual(ledger.value('items',askItemId(askId))!.askAttachments.map((a:any)=>a.name),['screen.png','app.log']);
   assert.deepEqual((await codex('read',{ids:[askId]})).asks[0].attachments.map((a:any)=>a.id),['att-1','att-2']);
   // In parts of at most 96 KB, following nextOffset.
   const parts:Buffer[]=[];let offset:number|undefined=0;
   while(offset!==undefined){
    const part=await codex('attachment',{id:askId,attachment:'att-1',offset});
    assert.equal(part.untrustedContent,true);assert.equal(part.sha256,sha(screenshot));
    parts.push(Buffer.from(part.data,'base64'));offset=part.nextOffset;
   }
   assert.equal(parts.length,2);assert.ok(Buffer.concat(parts).equals(screenshot),'the bytes come back exactly');
   assert.equal(Buffer.from((await codex('attachment',{id:askId,attachment:'att-2'})).data,'base64').toString(),log.toString());
   assert.equal((await codex('attachment',{id:askId,attachment:'att-3'})).error,ASK_REASONS.noAttachment);
   // Another Agent: not there, even with its own Grant; the one that claims it may read them.
   assert.equal((await claude('attachment',{id:askId,attachment:'att-2'})).error,ASK_REASONS.missing);
   assert.equal((await hermes('attachment',{id:askId,attachment:'att-2'})).error,HERMES_CHANNEL_READ_ONLY);
   assert.deepEqual((await claude('claim',{ids:[askId]})).asks.map((ask:any)=>ask.id),[askId]);
   assert.equal(Buffer.from((await claude('attachment',{id:askId,attachment:'att-2'})).data,'base64').toString(),log.toString(),'the claimer reads them');
   // Refused in words: a type that runs, a picture that is not one, too large a call.
   assert.equal((await codex('post',{title:'x',attachments:[{name:'a.svg',type:'image/svg+xml',data:log.toString('base64')}]})).error,ASK_REASONS.attachmentType);
   assert.equal((await codex('post',{title:'x',attachments:[{name:'a.png',type:'image/png',data:log.toString('base64')}]})).error,ASK_REASONS.attachmentKind);
   assert.match((await codex('post',{title:'x',body:'y'.repeat(30*1024*1024)})).error,/larger than Worldlet takes/);
   // The person's page reads one whole; settled, they stay.
   const whole=asks.attachment({action:'agentAsk',operation:'attachment',id:askId,attachment:'att-1'});
   assert.deepEqual([whole.name,whole.type,whole.size],['screen.png','image/png',screenshot.length]);assert.ok(Buffer.from(whole.data,'base64').equals(screenshot));
   assert.throws(()=>asks.attachment({id:askId,attachment:'att-7'}),{message:ASK_REASONS.noAttachment});
   assert.throws(()=>asks.attachment({id:'ask-00000000',attachment:'att-1'}),{message:ASK_REASONS.missing});
   await asks.answer({operation:'answer',id:askId,outcome:'done'});
   assert.equal((await codex('attachment',{id:askId,attachment:'att-2'})).size,log.length,'kept once settled');
   assert.equal(ledger.agentAskAttachment(askId,'att-1',0,8)!.length,8);
  }

  // Orders and waking an Agent (agent/gate/GRANTS.md#orders-and-waking-an-agent).
  {
   const out=path.join(dir,'woken.txt'),script=path.join(dir,'wake.mjs'),sleeper=path.join(dir,'sleep.mjs');
   fs.writeFileSync(script,"import fs from 'node:fs';fs.appendFileSync(process.argv[3],process.argv.slice(2).join(' ')+'\\n');console.log('not kept');");
   fs.writeFileSync(sleeper,"setTimeout(()=>{},60_000);");
   const until=async(done:()=>boolean,what:string)=>{for(let n=0;n<200&&!done();n++)await new Promise(resolve=>setTimeout(resolve,25));assert.ok(done(),what);};
   const wakes=()=>ledger.agentAudit('codex',500).filter(e=>e.target==='asks'&&e.action==='wake');
   const lines=()=>fs.existsSync(out)?fs.readFileSync(out,'utf8').trim().split('\n'):[];
   const due=()=>timers.filter(timer=>!timer.cleared&&timer.ms<300_000);
   // Work for an Agent that is not one of the World's: refused, nothing stored.
   const before=ledger.agentAsks().length;
   assert.equal((await claude('post',{kind:'input',title:'Ship it',for:'nobody'})).error,ASK_REASONS.forUnknown);
   assert.equal((await claude('post',{title:'Which?',for:'codex'})).error,ASK_REASONS.forKind);
   assert.equal(ledger.agentAsks().length,before);
   // A wake command the host refuses: in plain words, nothing kept.
   assert.throws(()=>orders.setWake('codex',['node','wake.mjs']),{message:ORDER_REASONS.program});
   assert.throws(()=>orders.setWake('codex',[process.execPath,...Array(17).fill('a')]),{message:ORDER_REASONS.args});
   assert.throws(()=>orders.setWake('codex',[process.execPath,'a\nb']),{message:ORDER_REASONS.control});
   assert.throws(()=>orders.setWake('codex',process.execPath+' '+script),{message:ORDER_REASONS.invalid});
   assert.throws(()=>orders.setWake('nobody',[process.execPath]),{message:ORDER_REASONS.agent});
   assert.deepEqual(orders.read(),{wake:{}});
   // The person sets one: the program and its arguments, the placeholder a whole argument of its own.
   orders.setWake('codex',[process.execPath,script,'{askId}',out]);
   const row=new DatabaseSync(path.join(dir,'world','world.sqlite')).prepare("SELECT value FROM agent_settings WHERE key='agent-orders'").get() as {value:string};
   assert.deepEqual(JSON.parse(row.value).wake.codex,[process.execPath,script,'{askId}',out],'kept in world.sqlite');
   // Work for Codex wakes it: the program runs with the work's ID; only how it ended is audited, never its output.
   const first=(await claude('post',{kind:'input',title:'Fix the build',for:'codex',tags:['order']})).ask;
   assert.equal(first.for,'codex');
   assert.equal(ledger.value('items',askItemId(first.id))!.reason,'Claude Code left work for Codex');
   await until(()=>wakes().length===1,'woken once');
   assert.deepEqual(lines(),[`${first.id} ${out}`]);
   assert.equal(wakes()[0].decision,'allowed');assert.equal(wakes()[0].reason,`Woken for work ${first.id}: exited with 0.`);
   assert.ok(!JSON.stringify(ledger.agentAudit('codex',500)).includes('not kept'),'no output stored');
   // Within the minute: no second wake now, one when it ends, for the newest work.
   const second=(await claude('post',{kind:'input',title:'Then the docs',for:'codex'})).ask,third=(await claude('post',{kind:'input',title:'And the notes',for:'codex'})).ask;
   assert.equal(due().length,1,'one wake waits');assert.equal(due()[0].ms,60_000);
   await new Promise(resolve=>setTimeout(resolve,200));assert.equal(lines().length,1,'not woken again within the minute');
   clock+=60_000;due()[0].run();
   await until(()=>wakes().length===2,'woken once the minute passed');
   assert.deepEqual(lines().slice(1),[`${third.id} ${out}`]);
   // The Agent it is for reads it and claims it first; another waits 15 minutes for it.
   assert.deepEqual((await codex('read',{ids:[first.id]})).asks.map((ask:any)=>ask.for),['codex']);
   assert.ok(access.grantAsks('claude-code','work'));
   assert.deepEqual((await claude('claim',{ids:[second.id]})).asks,[],'not before Codex had its chance');
   assert.deepEqual(new Set((await codex('claim',{ids:[first.id,second.id]})).asks.map((ask:any)=>ask.id)),new Set([first.id,second.id]));
   assert.ok(access.ungrantAsks('claude-code','work'));
   // Give new work to: work naming no Agent goes to Codex and wakes it.
   assert.throws(()=>orders.setDefault('nobody'),{message:ORDER_REASONS.agent});
   orders.setDefault('codex');
   clock+=61_000;
   const plain=(await claude('post',{kind:'input',title:'Look at the crash'})).ask;
   assert.equal(plain.for,'codex');
   await until(()=>wakes().length===3,'the order target is woken');
   // An Agent's own work for itself wakes nothing.
   clock+=61_000;
   const own=(await codex('post',{kind:'input',title:'Note to self'})).ask;
   assert.equal(own.for,undefined,'not given to itself by default');
   const mine=(await codex('post',{kind:'input',title:'Mine',for:'codex'})).ask;assert.equal(mine.for,'codex');
   for(const ask of [own,mine])await asks.answer({operation:'answer',id:ask.id,outcome:'skipped'});
   await new Promise(resolve=>setTimeout(resolve,200));assert.equal(wakes().length,3);assert.equal(due().length,0);
   // A wake still running at its timeout is stopped; a program that cannot start says so.
   orders.setWake('codex',[process.execPath,sleeper]);
   await claude('post',{kind:'input',title:'Long one',for:'codex'});
   const timeout=timers.find(timer=>!timer.cleared&&timer.ms===300_000)!;
   await new Promise(resolve=>setTimeout(resolve,200));timeout.run();
   await until(()=>wakes().length===4,'stopped');assert.match(wakes()[0].reason,/stopped after 5 minutes\.$/);assert.equal(wakes()[0].decision,'denied');
   clock+=61_000;
   orders.setWake('codex',['/nonexistent/wake-agent']);
   await claude('post',{kind:'input',title:'No program',for:'codex'});
   await until(()=>wakes().length===5,'refused to start');assert.match(wakes()[0].reason,/could not start: .*ENOENT/);
   // Removed: not woken again. Each change is the person's, audited.
   orders.setWake('codex',[]);
   clock+=61_000;await claude('post',{kind:'input',title:'Quiet now',for:'codex'});
   await new Promise(resolve=>setTimeout(resolve,200));assert.equal(wakes().length,5);
   assert.deepEqual(ledger.agentAudit('codex',500).filter(e=>/wake$|order-target$/.test(e.action)&&e.action!=='wake').map(e=>e.action).reverse(),['set-wake','order-target','set-wake','set-wake','clear-wake']);
   // Revoking an Agent clears it as the order target.
   orders.setDefault('claude-code');
   assert.equal(orders.read().defaultFor,'claude-code');
   assert.deepEqual(ledger.agentAudit('codex',1).map(e=>e.action),['clear-order-target']);
  }

  // The open cap: at most 20 open asks per Agent.
  for(let n=0;n<20;n++)assert.equal((await codex('post',{title:'Ask '+n})).ok,true);
  assert.equal((await codex('post',{title:'One too many'})).error,ASK_REASONS.full);
  assert.equal((await claude('post',{title:'Another Agent'})).ok,true);

  // Taking a Grant back refuses the next call; revoking the Agent refuses everything.
  assert.ok(access.ungrantAsks('codex','ask'));
  assert.equal((await codex('read')).error,STANDING_OUTSIDE_TURN);
  access.revoke('claude-code');
  assert.deepEqual(await claude('read'),{status:404},'a revoked Agent\'s token is not known');
  assert.equal(orders.read().defaultFor,undefined,'a revoked Agent gets no new work');

  // Audit: every call by each Agent and each answer by the person.
  const audit=(agentId:string)=>ledger.agentAudit(agentId,500).filter(e=>e.target==='asks').map(e=>[e.action,e.decision]).reverse();
  assert.deepEqual(audit('codex').slice(0,4),[['post','denied'],['grant-ask','allowed'],['grant-work','allowed'],['post','allowed']]);
  assert.ok(audit('codex').some(([action,decision])=>action==='answer'&&decision==='allowed'),'the person\'s answer');
  assert.ok(audit('codex').some(([action,decision])=>action==='resolve'&&decision==='allowed'));
  assert.deepEqual(audit('hermes'),[['read','denied'],['attachment','denied']]);
  assert.deepEqual(ledger.agentAsks().map(ask=>ask.agentId).filter(agentId=>agentId!=='codex'&&agentId!=='claude-code'),[],'nothing stored for anyone else');
 }finally{standing.close();ledger.close();}
});
console.log('PASS Agent asks on the host: stored with their Attention items, only through each Agent\'s own Grants, own asks only, leases and revisions, the person\'s answer read back, audited; work for one Agent and the order target, a real wake with the work\'s ID, once a minute, stopped at its timeout, refused commands, audited.');
