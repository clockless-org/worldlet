import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {withTempDir} from './test-temp.ts';
import {WorldLedger} from '../platform/electron/src/store/ledger.ts';
import {createAgentAccess} from '../platform/electron/src/modules/agent-runtime/agent-access.ts';
import {createAgentAsks} from '../platform/electron/src/modules/agent-runtime/agent-asks.ts';
import {openStandingWorldTools} from '../platform/electron/src/modules/agent-runtime/world-tool-bridge.ts';
import {STANDING_OUTSIDE_TURN} from '../core/agent/grants.ts';
import {ASK_REASONS,askItemId} from '../core/agent/asks.ts';
import {HERMES_CHANNEL_READ_ONLY} from '../core/agent/hermes-server.ts';

// Agent asks on the host (core/agent/GRANTS.md#agent-asks), the same modules the Electron and Node hosts run: each ask
// and its Attention item in world.sqlite, reached only through the standing `worldlet` MCP server with each Agent's
// own token and Grants. A granted Agent posts and reads only its own; an ungranted one is refused; claims hold a lease
// and resolve names the revision; the person's answer reaches the Agent's next read; every call and answer is audited.
await withTempDir('worldlet-asks-',async dir=>{
 const ledger=new WorldLedger(path.join(dir,'world'));
 let clock=Date.parse('2026-10-15T12:00:00.000Z');
 const now=()=>new Date(clock).toISOString();
 const secrets=new Map<string,string>();
 const vault={get:(id:string)=>secrets.get(id)??null,set:(id:string,value:string)=>{secrets.set(id,value);},delete:(id:string)=>{secrets.delete(id);},deleteAll:()=>secrets.clear()};
 const access=createAgentAccess({root:path.join(dir,'access'),vault,ledger:()=>ledger});
 let changes=0;
 const asks=createAgentAsks({ledger:()=>ledger,name:agentId=>access.identity(agentId)?.name??agentId,changed:()=>{changes+=1;},now});
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

  // The open cap: at most 20 open asks per Agent.
  for(let n=0;n<20;n++)assert.equal((await codex('post',{title:'Ask '+n})).ok,true);
  assert.equal((await codex('post',{title:'One too many'})).error,ASK_REASONS.full);
  assert.equal((await claude('post',{title:'Another Agent'})).ok,true);

  // Taking a Grant back refuses the next call; revoking the Agent refuses everything.
  assert.ok(access.ungrantAsks('codex','ask'));
  assert.equal((await codex('read')).error,STANDING_OUTSIDE_TURN);
  access.revoke('claude-code');
  assert.deepEqual(await claude('read'),{status:404},'a revoked Agent\'s token is not known');

  // Audit: every call by each Agent and each answer by the person.
  const audit=(agentId:string)=>ledger.agentAudit(agentId,500).filter(e=>e.target==='asks').map(e=>[e.action,e.decision]).reverse();
  assert.deepEqual(audit('codex').slice(0,4),[['post','denied'],['grant-ask','allowed'],['grant-work','allowed'],['post','allowed']]);
  assert.ok(audit('codex').some(([action,decision])=>action==='answer'&&decision==='allowed'),'the person\'s answer');
  assert.ok(audit('codex').some(([action,decision])=>action==='resolve'&&decision==='allowed'));
  assert.deepEqual(audit('hermes'),[['read','denied'],['attachment','denied']]);
  assert.deepEqual(ledger.agentAsks().map(ask=>ask.agentId).filter(agentId=>agentId!=='codex'&&agentId!=='claude-code'),[],'nothing stored for anyone else');
 }finally{standing.close();ledger.close();}
});
console.log('PASS Agent asks on the host: stored with their Attention items, only through each Agent\'s own Grants, own asks only, leases and revisions, the person\'s answer read back, audited.');
