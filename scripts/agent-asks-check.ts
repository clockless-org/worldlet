import assert from 'node:assert/strict';
import {AGENT_ASK_LIMITS,AGENT_ASK_PROVIDER,type AgentAsk} from '../contracts/agent-asks.ts';
import {ASK_REASONS,answerAsk,askAttentionItem,askClaimable,askItemId,claimAsks,postAsk,readAskPost,readAsks,readStoredAsk,resolveAsk} from '../core/agent/asks.ts';
import {validateWorldItem} from '../core/items/world-item-validation.ts';

// Agent asks (contracts/agent-asks.ts, core/agent/asks.ts): validation, the open cap, claims and their lease, resolve
// with a stale revision refused, the person's answer and the Attention item the host writes.
const now='2026-10-15T12:00:00.000Z',soon='2026-10-15T12:30:00.000Z',later='2026-10-15T13:00:01.000Z';
const id=(n:number)=>'ask-'+String(n).padStart(8,'0');
const refused=(work:()=>unknown,reason:string)=>assert.throws(work,(error:Error)=>error.message===reason);

// Posting: the host stamps the caller; a model's agentId is dropped. Defaults: an ask with no choices.
const posted=postAsk([],'claude-code',{title:' Which plan? ',body:'Two options.\nPick one.',choices:['Small','Large'],link:'https://example.com/plan',tags:['Plans'],agentId:'hermes'},id(1),now);
assert.deepEqual(posted,{id:id(1),agentId:'claude-code',kind:'ask',title:'Which plan?',body:'Two options.\nPick one.',choices:['Small','Large'],link:'https://example.com/plan',
 status:'open',tags:['plans'],revision:1,createdAt:now,updatedAt:now});
assert.equal(readAskPost({title:'Note'}).kind,'ask');
assert.equal(postAsk([],'hermes',{kind:'input',title:'Tidy the docs'},id(2),now).kind,'input');

// Refused input: lengths, choices, unknown fields, kinds, links, control characters and secrets.
refused(()=>readAskPost({title:''}),ASK_REASONS.invalid);
refused(()=>readAskPost({title:'x'.repeat(AGENT_ASK_LIMITS.title+1)}),ASK_REASONS.invalid);
assert.equal(readAskPost({title:'x'.repeat(AGENT_ASK_LIMITS.title)}).title.length,AGENT_ASK_LIMITS.title);
refused(()=>readAskPost({title:'t',body:'x'.repeat(AGENT_ASK_LIMITS.body+1)}),ASK_REASONS.invalid);
refused(()=>readAskPost({title:'t',choices:['a','b','c','d','e']}),ASK_REASONS.invalid);
refused(()=>readAskPost({title:'t',choices:['a','a']}),ASK_REASONS.invalid);
refused(()=>readAskPost({title:'t',choices:['']}),ASK_REASONS.invalid);
refused(()=>readAskPost({title:'t',kind:'order'}),ASK_REASONS.invalid);
refused(()=>readAskPost({title:'t',status:'done'}),ASK_REASONS.invalid);
refused(()=>readAskPost({title:'t',revision:9}),ASK_REASONS.invalid);
for(const link of ['http://example.com','javascript:alert(1)','https://alex:pw@example.com/','https://','https://exa mple.com',' https://example.com','https://example.com/‮'])
 refused(()=>readAskPost({title:'t',link}),ASK_REASONS.link);
refused(()=>readAskPost({title:'line\nbreak'}),ASK_REASONS.control);
refused(()=>readAskPost({title:'bell\u0007'}),ASK_REASONS.control);
refused(()=>readAskPost({title:'t',body:'escape \u001b[31m'}),ASK_REASONS.control);
refused(()=>readAskPost({title:'‮flipped'}),ASK_REASONS.control);
refused(()=>readAskPost({title:'Use ghp_'+'a'.repeat(36)}),ASK_REASONS.secret);
refused(()=>readAskPost({title:'t',body:'-----BEGIN RSA PRIVATE KEY-----'}),ASK_REASONS.secret);
refused(()=>readAskPost({title:'t',choices:['sk-'+'b'.repeat(30)]}),ASK_REASONS.secret);
refused(()=>postAsk([],'Not An Agent',{title:'t'},id(3),now),ASK_REASONS.invalid);
refused(()=>postAsk([],'hermes',{title:'t'},'BAD',now),ASK_REASONS.invalid);
refused(()=>postAsk([posted],'hermes',{title:'t'},id(1),now),ASK_REASONS.invalid);

// The open cap counts only this Agent's open or claimed asks.
const many:AgentAsk[]=Array.from({length:AGENT_ASK_LIMITS.openPerAgent},(_,n)=>({...posted,id:id(100+n),status:n%2?'claimed':'open'}));
refused(()=>postAsk(many,'claude-code',{title:'One more'},id(200),now),ASK_REASONS.full);
assert.equal(postAsk(many,'hermes',{title:'Another Agent'},id(200),now).agentId,'hermes');
assert.equal(postAsk(many.map((ask,n)=>n?ask:{...ask,status:'answered'}),'claude-code',{title:'Room again'},id(200),now).status,'open');

// Reading: only the caller's own (posted or claimed by it), filtered by status or ID, newest first.
const work=postAsk([],'hermes',{kind:'input',title:'Write the summary'},id(10),now);
const older={...postAsk([],'claude-code',{title:'Older'},id(11),'2026-10-15T11:00:00.000Z'),status:'answered' as const};
const all=[posted,work,older];
assert.deepEqual(readAsks(all,'claude-code').map(ask=>ask.id),[id(1),id(11)]);
assert.deepEqual(readAsks(all,'claude-code',{status:'answered'}).map(ask=>ask.id),[id(11)]);
assert.deepEqual(readAsks(all,'claude-code',{ids:[id(10)]}),[],'another Agent\'s ask is never read');
assert.deepEqual(readAsks(all,'codex'),[]);
refused(()=>readAsks(all,'claude-code',{status:'gone'}),ASK_REASONS.invalid);
refused(()=>readAsks(all,'claude-code',{agentId:'hermes'}),ASK_REASONS.invalid);

// Claiming: only input work that is open or whose 60-minute lease ran out; at most 10; oldest first.
assert.equal(askClaimable(posted,now),false,'a question for the person is not work to claim');
assert.equal(askClaimable(work,now),true);
const [claimed]=claimAsks(all,'codex',{},now);
assert.deepEqual({...claimed},{...work,status:'claimed',claimedBy:'codex',claimedAt:now,revision:2,updatedAt:now});
assert.equal(askClaimable(claimed,soon),false,'a live lease holds');
assert.deepEqual(claimAsks([posted,claimed],'claude-code',{},soon),[]);
assert.equal(askClaimable(claimed,later),true,'a stale lease is claimable again');
const [reclaimed]=claimAsks([claimed],'claude-code',{ids:[id(10)]},later);
assert.equal(reclaimed.claimedBy,'claude-code');assert.equal(reclaimed.revision,3);
assert.deepEqual(readAsks([reclaimed],'claude-code').map(ask=>ask.id),[id(10)],'the claimer reads what it claimed');
const pile:AgentAsk[]=Array.from({length:15},(_,n)=>({...work,id:id(300+n),createdAt:new Date(Date.parse(now)+n*1000).toISOString()}));
assert.equal(claimAsks(pile,'codex',{},now).length,AGENT_ASK_LIMITS.claim);
assert.deepEqual(claimAsks(pile,'codex',{limit:2},now).map(ask=>ask.id),[id(300),id(301)]);
refused(()=>claimAsks(pile,'codex',{limit:11},now),ASK_REASONS.invalid);
refused(()=>claimAsks(pile,'codex',{ids:Array.from({length:11},(_,n)=>id(300+n))},now),ASK_REASONS.invalid);

// Resolving: only by the Agent holding the claim, at the revision it read.
const resolved=resolveAsk(claimed,'codex',{id:id(10),note:'Summary written.',links:['https://example.com/pr/1'],expectedRevision:2},soon);
assert.deepEqual(resolved.resolution,{note:'Summary written.',links:['https://example.com/pr/1'],at:soon});
assert.equal(resolved.status,'done');assert.equal(resolved.revision,3);
refused(()=>resolveAsk(claimed,'codex',{id:id(10),note:'Again',expectedRevision:1},soon),ASK_REASONS.stale);
refused(()=>resolveAsk(claimed,'claude-code',{id:id(10),note:'Mine',expectedRevision:2},soon),ASK_REASONS.notYours);
refused(()=>resolveAsk(reclaimed,'codex',{id:id(10),note:'Late',expectedRevision:3},later),ASK_REASONS.notYours,);
refused(()=>resolveAsk(work,'hermes',{id:id(10),note:'Never claimed',expectedRevision:1},now),ASK_REASONS.notYours);
refused(()=>resolveAsk(resolved,'codex',{id:id(10),note:'Twice',expectedRevision:3},soon),ASK_REASONS.notYours);
refused(()=>resolveAsk(claimed,'codex',{id:id(10),note:'x',links:['http://example.com'],expectedRevision:2},soon),ASK_REASONS.link);
refused(()=>resolveAsk(claimed,'codex',{id:id(11),note:'x',expectedRevision:2},soon),ASK_REASONS.missing);
refused(()=>resolveAsk(null,'codex',{id:id(10),note:'x',expectedRevision:2},soon),ASK_REASONS.missing);

// The person's answer: one of the ask's own choices (and a note), or Done, or Dismiss; once.
const answered=answerAsk(posted,{id:id(1),outcome:'answered',choice:'Large',note:'Go big.'},soon);
assert.deepEqual([answered.status,answered.answer,answered.revision],['answered',{choice:'Large',note:'Go big.',at:soon},2]);
refused(()=>answerAsk(answered,{id:id(1),outcome:'answered',choice:'Small'},soon),ASK_REASONS.settled);
refused(()=>answerAsk(posted,{id:id(1),outcome:'answered',choice:'Medium'},soon),ASK_REASONS.choice);
refused(()=>answerAsk(posted,{id:id(1),outcome:'answered'},soon),ASK_REASONS.invalid);
refused(()=>answerAsk(posted,{id:id(1),outcome:'done',choice:'Small'},soon),ASK_REASONS.invalid);
refused(()=>answerAsk(posted,{id:id(2),outcome:'done'},soon),ASK_REASONS.missing);
assert.equal(answerAsk(posted,{id:id(1),outcome:'done'},soon).status,'done');
assert.equal(answerAsk(posted,{id:id(1),outcome:'skipped'},soon).status,'skipped');
assert.equal(answerAsk(claimed,{id:id(10),outcome:'done',note:'Did it myself.'},soon).answer?.note,'Did it myself.');

// Stored asks are checked when read back.
assert.deepEqual(readStoredAsk(JSON.parse(JSON.stringify(resolved))),resolved);
assert.equal(readStoredAsk({...posted,agentId:'Hermes'}),null);
assert.equal(readStoredAsk({...posted,status:'gone'}),null);
assert.equal(readStoredAsk({...posted,revision:0}),null);

// The Attention item: a task with choices (else an update), naming the Agent, valid as a World item.
const item=askAttentionItem(posted,'Claude Code');
assert.equal(item.id,askItemId(id(1)));assert.equal(item.provider,AGENT_ASK_PROVIDER);assert.equal(item.kind,'task');assert.equal(item.status,'open');
assert.equal(item.agentId,'claude-code');assert.equal(item.agentName,'Claude Code');assert.deepEqual(item.askChoices,['Small','Large']);
assert.equal(item.attentionReason,'Claude Code asks you to choose.');assert.equal(item.sources?.[0]?.url,'https://example.com/plan');
validateWorldItem(item as any,{start:null,end:null});
const update=askAttentionItem(work,'Hermes Agent');
assert.equal(update.kind,'update');validateWorldItem(update as any,{start:null,end:null});
assert.equal(askAttentionItem(answered,'Claude Code').status,'done');assert.equal(askAttentionItem(answered,'Claude Code').askChoice,'Large');
assert.equal(askAttentionItem({...posted,status:'skipped'},'x').status,'dismissed');
assert.equal(askAttentionItem(claimed,'x').status,'open');
assert.equal(askAttentionItem(posted,'bad\u0007name').agentName,'claude-code','a name that is not clean falls back to the ID');

console.log('PASS Agent asks: validation, open cap, claims and leases, resolve, answers and Attention items.');
