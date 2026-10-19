import assert from 'node:assert/strict';
import {AGENT_ASK_LIMITS,AGENT_ASK_PROVIDER,type AgentAsk} from '../contracts/agent-asks.ts';
import {ASK_REASONS,askApprovesDrafts,answerAsk,askAttachmentIsImage,askAttachmentName,askAttentionItem,askClaimable,askItemId,claimAsks,postAsk,readAskAttachment,readAskPost,readAsks,readStoredAsk,resolveAsk} from '../agent/agent/asks.ts';
import {validateWorldItem} from '../context/items/world-item-validation.ts';
import {ORDER_REASONS,askWakes,orderAuditEntry,readOrders,readWakeCommand,wakeArgv,wakeAuditEntry,wakeDelay} from '../agent/agent/orders.ts';
import {AGENT_WAKE_LIMITS} from '../contracts/agent-asks.ts';

// Agent asks (contracts/agent-asks.ts, agent/agent/asks.ts): validation, the open cap, claims and their lease, resolve
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
assert.deepEqual([item.attentionContentVersion,item.reason,item.summary],[1,'Claude Code asks you','Two options.\nPick one.'],'final as the host wrote it: the card shows it with no model pass');
const update=askAttentionItem(work,'Hermes Agent');
assert.equal(update.kind,'update');assert.equal(update.reason,'Hermes Agent left work for Agents');validateWorldItem(update as any,{start:null,end:null});
assert.equal(askAttentionItem(answered,'Claude Code').status,'done');assert.equal(askAttentionItem(answered,'Claude Code').askChoice,'Large');
assert.equal(askAttentionItem({...posted,status:'skipped'},'x').status,'dismissed');
assert.equal(askAttentionItem(claimed,'x').status,'open');
assert.equal(askAttentionItem(posted,'bad\u0007name').agentName,'claude-code','a name that is not clean falls back to the ID');

// An ask that carries GitHub drafts: up to 10 draft IDs, a question (not work), always offering Approve; its Approve answer
// is what approves them, and the IDs travel with the ask and its Attention item.
{
 const at='2026-10-15T12:00:00.000Z',ids=['d0000001','d0000002'];
 const carrying=postAsk([],'codex',{title:'Ship these?',draftIds:ids},'ask-d0000001',at);
 assert.deepEqual([carrying.choices,carrying.draftIds],[['Approve','Not now'],ids]);
 assert.deepEqual(postAsk([],'codex',{title:'Ship?',choices:['Approve','Later'],draftIds:ids},'ask-d0000002',at).choices,['Approve','Later']);
 assert.throws(()=>readAskPost({title:'Ship?',choices:['Yes'],draftIds:ids}),{message:ASK_REASONS.approve});
 assert.throws(()=>readAskPost({title:'Ship?',kind:'input',draftIds:ids}),{message:ASK_REASONS.invalid},'work left for Agents carries no drafts');
 assert.throws(()=>readAskPost({title:'Ship?',draftIds:['NOT AN ID']}),{message:ASK_REASONS.invalid});
 assert.throws(()=>readAskPost({title:'Ship?',draftIds:Array.from({length:11},(_,i)=>'d000000'+String(i).padStart(2,'0'))}),{message:ASK_REASONS.invalid});
 assert.equal(askApprovesDrafts(carrying,{outcome:'answered',choice:'Approve'}),true);
 assert.equal(askApprovesDrafts(carrying,{outcome:'answered',choice:'Not now'}),false);
 assert.equal(askApprovesDrafts(carrying,{outcome:'done'}),false);
 assert.equal(askApprovesDrafts(postAsk([],'codex',{title:'Plain',choices:['Approve']},'ask-d0000003',at),{outcome:'answered',choice:'Approve'}),false,'no drafts, nothing to approve');
 assert.deepEqual(readStoredAsk(JSON.parse(JSON.stringify(carrying)))!.draftIds,ids);
 assert.deepEqual(askAttentionItem(carrying,'Codex').askDraftIds,ids);
}
// Attachments: pictures and other files of allowed types, within count and size limits, names made safe, first bytes
// matching the type, kept as metadata only (the host's SHA-256), read back only by the poster or the claimer.
{
 const at='2026-10-15T12:00:00.000Z',b64=(...bytes:number[])=>Buffer.from(bytes).toString('base64'),text=(value:string)=>Buffer.from(value).toString('base64');
 const png=b64(0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1,2,3,4),jpeg=b64(0xff,0xd8,0xff,0xe0,0,0x10),gif=text('GIF89a....'),webp=text('RIFF\0\0\0\0WEBPVP8 ');
 const zip=b64(0x50,0x4b,3,4,0,0),gzip=b64(0x1f,0x8b,8,0),log=text('2026-10-15 12:00 ERROR token=sk-'+'z'.repeat(30)+'\n');
 const digest='a'.repeat(64);
 const post=readAskPost({title:'App feedback',attachments:[{name:'Screen Shot.png',type:'image/png',data:png},{name:'C:\\Users\\alex\\app.log',type:'text/plain',data:log}]});
 assert.deepEqual(post.attachments!.map(({name,type,size})=>[name,type,size]),[['Screen Shot.png','image/png',12],['app.log','text/plain',Buffer.from(log,'base64').length]],
  'names lose their folders; a log that looks like it holds a token is kept as data');
 const carrying=postAsk([],'codex',{kind:'input',title:'Crash on save',attachments:[{name:'shot.png',type:'image/png',data:png},{name:'trace.json',type:'application/json',data:text('{}')}]},'ask-f0000001',at,[digest,'b'.repeat(64)]);
 assert.deepEqual(carrying.attachments,[{id:'att-1',name:'shot.png',type:'image/png',size:12,sha256:digest},{id:'att-2',name:'trace.json',type:'application/json',size:2,sha256:'b'.repeat(64)}]);
 assert.ok(!JSON.stringify(carrying).includes(png),'the ask keeps no bytes');
 refused(()=>postAsk([],'codex',{title:'t',attachments:[{name:'a.png',type:'image/png',data:png}]},'ask-f0000002',at),ASK_REASONS.invalid);
 refused(()=>postAsk([],'codex',{title:'t',attachments:[{name:'a.png',type:'image/png',data:png}]},'ask-f0000002',at,['NOT A HASH']),ASK_REASONS.invalid);
 refused(()=>postAsk([],'codex',{title:'t'},'ask-f0000002',at,[digest]),ASK_REASONS.invalid);
 for(const [type,data] of [['image/png',png],['image/jpeg',jpeg],['image/gif',gif],['image/webp',webp],['application/zip',zip],['application/gzip',gzip],['text/csv',text('a,b\n')],['application/json',text('[]')],['text/plain',text('x')]])
  assert.equal(readAskPost({title:'t',attachments:[{name:'f',type,data}]}).attachments![0].type,type,type);
 assert.equal(readAskPost({title:'t',attachments:[{name:'f',type:' IMAGE/PNG ',data:png}]}).attachments![0].type,'image/png');
 // Types: nothing that runs or renders as markup; a picture, ZIP or gzip whose first bytes are not its type's.
 for(const type of ['image/svg+xml','text/html','application/javascript','application/x-msdownload','application/octet-stream','application/x-sh',''])
  refused(()=>readAskPost({title:'t',attachments:[{name:'f',type,data:png}]}),ASK_REASONS.attachmentType);
 refused(()=>readAskPost({title:'t',attachments:[{name:'f.png',type:'image/png',data:text('<svg onload=alert(1)>')}]}),ASK_REASONS.attachmentKind);
 refused(()=>readAskPost({title:'t',attachments:[{name:'f.jpg',type:'image/jpeg',data:png}]}),ASK_REASONS.attachmentKind);
 refused(()=>readAskPost({title:'t',attachments:[{name:'f.zip',type:'application/zip',data:text('MZ program')}]}),ASK_REASONS.attachmentKind);
 // Data: base64 only, not empty; only name, type and data.
 for(const data of ['','not base64!','abc','YWJj=a=='])refused(()=>readAskPost({title:'t',attachments:[{name:'f',type:'text/plain',data}]}),ASK_REASONS.attachment);
 refused(()=>readAskPost({title:'t',attachments:[{name:'f',type:'text/plain',data:text('x'),url:'https://example.com'}]}),ASK_REASONS.invalid);
 refused(()=>readAskPost({title:'t',attachments:{name:'f'}}),ASK_REASONS.attachment);
 // Counts: 8 pictures and 12 other files.
 const pictures=(n:number)=>Array.from({length:n},(_,i)=>({name:'p'+i+'.png',type:'image/png',data:png}));
 const files=(n:number)=>Array.from({length:n},(_,i)=>({name:'f'+i+'.log',type:'text/plain',data:text('line '+i)}));
 assert.equal(readAskPost({title:'t',attachments:[...pictures(8),...files(12)]}).attachments!.length,20);
 refused(()=>readAskPost({title:'t',attachments:pictures(9)}),ASK_REASONS.attachmentCount);
 refused(()=>readAskPost({title:'t',attachments:files(13)}),ASK_REASONS.attachmentCount);
 refused(()=>readAskPost({title:'t',attachments:[...pictures(8),...files(13)]}),ASK_REASONS.attachmentCount);
 // Sizes: 5 MB a picture, 2 MB another file, 20 MB in all (counted from the base64, nothing decoded).
 const sized=(header:string,bytes:number)=>{const raw=Buffer.alloc(bytes);Buffer.from(header,'base64').copy(raw);return raw.toString('base64');};
 assert.equal(readAskPost({title:'t',attachments:[{name:'big.png',type:'image/png',data:sized(png,AGENT_ASK_LIMITS.imageBytes)}]}).attachments![0].size,AGENT_ASK_LIMITS.imageBytes);
 refused(()=>readAskPost({title:'t',attachments:[{name:'big.png',type:'image/png',data:sized(png,AGENT_ASK_LIMITS.imageBytes+1)}]}),ASK_REASONS.attachmentSize);
 refused(()=>readAskPost({title:'t',attachments:[{name:'big.log',type:'text/plain',data:sized('',AGENT_ASK_LIMITS.fileBytes+1)}]}),ASK_REASONS.attachmentSize);
 const four=Array.from({length:4},(_,i)=>({name:i+'.png',type:'image/png',data:sized(png,AGENT_ASK_LIMITS.imageBytes)}));
 assert.equal(readAskPost({title:'t',attachments:four}).attachments!.length,4,'20 MB in all fits');
 refused(()=>readAskPost({title:'t',attachments:[...four,{name:'one.log',type:'text/plain',data:text('x')}]}),ASK_REASONS.attachmentSize);
 // Names: folders dropped, unsafe characters replaced, no leading dot, the type's own extension, at most 120 characters.
 const name=(value:unknown,type='text/plain')=>askAttachmentName(value,type);
 assert.equal(name('../../etc/passwd'),'passwd.txt');
 assert.equal(name('run.exe'),'run.exe.txt','an executable name is not kept as one');
 assert.equal(name('setup.sh','application/gzip'),'setup.sh.gz');
 assert.equal(name('.bashrc'),'bashrc.txt');
 assert.equal(name('a<b>:c|d?e*.log'),'a_b__c_d_e_.log');
 assert.equal(name('bell\u0007‮gnp.exe','image/png'),'bell__gnp.exe.png');
 assert.equal(name('CON.txt'),'_CON.txt');
 assert.equal(name('PHOTO.JPEG','image/jpeg'),'PHOTO.JPEG');
 assert.equal(name('',  'image/png'),'attachment.png');
 assert.equal([...name('x'.repeat(300)+'.log')].length,AGENT_ASK_LIMITS.attachmentName);
 refused(()=>name('ghp_'+'a'.repeat(36)+'.txt'),ASK_REASONS.secret);
 refused(()=>name(42),ASK_REASONS.attachment);
 // Reading: only the poster or the claimer, a known attachment, from an offset, at most AGENT_ASK_LIMITS.attachmentRead.
 const big={...carrying,attachments:[{...carrying.attachments![0],size:200_000}]};
 assert.deepEqual(readAskAttachment([big],'codex',{id:'ask-f0000001',attachment:'att-1'}).length,AGENT_ASK_LIMITS.attachmentRead);
 const last=readAskAttachment([big],'codex',{id:'ask-f0000001',attachment:'att-1',offset:2*AGENT_ASK_LIMITS.attachmentRead});
 assert.equal(last.length,200_000-2*AGENT_ASK_LIMITS.attachmentRead);
 refused(()=>readAskAttachment([big],'codex',{id:'ask-f0000001',attachment:'att-1',offset:200_001}),ASK_REASONS.invalid);
 refused(()=>readAskAttachment([big],'codex',{id:'ask-f0000001',attachment:'att-1',offset:-1}),ASK_REASONS.invalid);
 refused(()=>readAskAttachment([big],'codex',{id:'ask-f0000001',attachment:'att-9'}),ASK_REASONS.noAttachment);
 refused(()=>readAskAttachment([big],'codex',{id:'ask-f0000001',attachment:'../x'}),ASK_REASONS.noAttachment);
 refused(()=>readAskAttachment([big],'hermes',{id:'ask-f0000001',attachment:'att-1'}),ASK_REASONS.missing,);
 refused(()=>readAskAttachment([big],'codex',{id:'ask-f0000001',attachment:'att-1',agentId:'hermes'}),ASK_REASONS.invalid);
 const [taken]=claimAsks([carrying],'hermes',{},at);
 assert.equal(readAskAttachment([taken],'hermes',{id:'ask-f0000001',attachment:'att-2'}).length,2,'the claimer reads them');
 assert.equal(readAskAttachment([taken],'codex',{id:'ask-f0000001',attachment:'att-2'}).length,2,'and the poster still does');
 refused(()=>readAskAttachment([taken],'claude-code',{id:'ask-f0000001',attachment:'att-2'}),ASK_REASONS.missing);
 // Kept when settled, read back from storage, and listed (never their bytes) on the Attention item.
 const settled=answerAsk(carrying,{id:'ask-f0000001',outcome:'done'},at);
 assert.deepEqual(settled.attachments,carrying.attachments);
 assert.deepEqual(readStoredAsk(JSON.parse(JSON.stringify(settled)))!.attachments,carrying.attachments);
 assert.deepEqual(readStoredAsk({...carrying,attachments:[{id:'att-1',name:'x.exe',type:'application/x-msdownload',size:1,sha256:digest},{id:'bad',name:'a',type:'text/plain',size:1,sha256:digest}]})!.attachments,undefined);
 const item=askAttentionItem(carrying,'Codex');
 assert.deepEqual(item.askAttachments,[{id:'att-1',name:'shot.png',type:'image/png',size:12},{id:'att-2',name:'trace.json',type:'application/json',size:2}]);
 validateWorldItem(item as any,{start:null,end:null});
 assert.equal(askAttachmentIsImage('image/webp'),true);assert.equal(askAttachmentIsImage('application/zip'),false);
}

// Orders (agent/agent/GRANTS.md#orders-and-waking-an-agent): work may name the Agent it is for, one of the World's
// Agents not revoked; work naming none is for the World's order target; that Agent reads it, claims it first and is
// the one woken. A question for the person names no Agent.
{
 const agents=['hermes','codex','claude-code'],t0='2026-10-15T12:00:00.000Z',t10='2026-10-15T12:10:00.000Z',t16='2026-10-15T12:16:00.000Z';
 const order=postAsk([],'hermes',{kind:'input',title:'Ship the fix',for:'codex',tags:['order']},id(700),t0,[],{agents});
 assert.deepEqual([order.for,order.tags],['codex',['order']]);
 refused(()=>postAsk([],'hermes',{kind:'input',title:'x',for:'nobody'},id(701),t0,[],{agents}),ASK_REASONS.forUnknown);
 refused(()=>postAsk([],'hermes',{kind:'input',title:'x',for:'codex'},id(701),t0),ASK_REASONS.forUnknown);
 refused(()=>readAskPost({title:'x',for:'codex'}),ASK_REASONS.forKind);
 refused(()=>readAskPost({kind:'input',title:'x',for:'Not An Agent'}),ASK_REASONS.forUnknown);
 refused(()=>readAskPost({kind:'input',title:'x',for:7}),ASK_REASONS.forUnknown);
 // The order target: applied to work naming no Agent, never to a question, never to the poster itself, never to a
 // revoked or unknown Agent.
 assert.equal(postAsk([],'hermes',{kind:'input',title:'x'},id(702),t0,[],{agents,defaultFor:'claude-code'}).for,'claude-code');
 assert.equal(postAsk([],'hermes',{kind:'input',title:'x',for:'codex'},id(702),t0,[],{agents,defaultFor:'claude-code'}).for,'codex','a named Agent wins');
 assert.equal(postAsk([],'hermes',{title:'x'},id(702),t0,[],{agents,defaultFor:'claude-code'}).for,undefined);
 assert.equal(postAsk([],'claude-code',{kind:'input',title:'x'},id(702),t0,[],{agents,defaultFor:'claude-code'}).for,undefined);
 assert.equal(postAsk([],'hermes',{kind:'input',title:'x'},id(702),t0,[],{agents:['hermes'],defaultFor:'claude-code'}).for,undefined);
 // Reading: the Agent it is for reads it, and its attachments; any other Agent does not.
 assert.deepEqual(readAsks([order],'codex').map(ask=>ask.id),[id(700)]);
 assert.deepEqual(readAsks([order],'claude-code'),[]);
 // Claiming: the named Agent at once, first among its claims; another only after AGENT_ASK_LIMITS.forMinutes.
 const plain=postAsk([],'hermes',{kind:'input',title:'Older work'},id(703),'2026-10-15T11:00:00.000Z');
 assert.equal(askClaimable(order,t10,'claude-code'),false);assert.equal(askClaimable(order,t10,'codex'),true);
 assert.equal(askClaimable(order,t16,'claude-code'),true,'it waited long enough');assert.equal(askClaimable(order,t10),false);
 assert.deepEqual(claimAsks([plain,order],'claude-code',{},t10).map(ask=>ask.id),[id(703)]);
 assert.deepEqual(claimAsks([plain,order],'claude-code',{ids:[id(700)]},t10),[],'naming it does not jump the wait');
 assert.deepEqual(claimAsks([plain,order],'codex',{},t10).map(ask=>ask.id),[id(700),id(703)],'work for it first, then the oldest');
 assert.equal(AGENT_ASK_LIMITS.forMinutes,15);
 const [held]=claimAsks([order],'codex',{},t0);
 assert.deepEqual(claimAsks([held],'claude-code',{},'2026-10-15T13:00:01.000Z').map(ask=>ask.claimedBy),['claude-code'],'a stale lease is anyone\'s');
 // Kept and shown: the stored ask keeps it; the card says whom the work is for.
 assert.equal(readStoredAsk(order)!.for,'codex');
 assert.equal(readStoredAsk({...posted,for:'codex'})!.for,undefined,'a question is for no Agent');
 const card=askAttentionItem(order,'Hermes Agent','Codex');
 assert.deepEqual([card.reason,(card as any).askFor],['Hermes Agent left work for Codex','codex']);
 validateWorldItem(card as any,{start:null,end:null});
 // Waking: only work for another Agent, still open.
 assert.equal(askWakes(order),'codex');
 assert.equal(askWakes({...order,for:'hermes'}),null,'an Agent\'s own work for itself wakes nothing');
 assert.equal(askWakes(plain),null);assert.equal(askWakes({...posted,for:'codex'}),null);assert.equal(askWakes(held),null);
 // A wake command: the program's absolute path, then at most 16 arguments of at most 500 characters, no control
 // characters, no credentials; the placeholder only as a whole argument, never the program.
 assert.deepEqual(readWakeCommand(['/usr/local/bin/wake-agent','--work','{askId}']),['/usr/local/bin/wake-agent','--work','{askId}']);
 assert.deepEqual(readWakeCommand(['C:\\Tools\\wake.exe']),['C:\\Tools\\wake.exe']);
 assert.equal(readWakeCommand([]),null,'an empty list clears it');
 refused(()=>readWakeCommand('/bin/wake --now'),ORDER_REASONS.invalid);
 refused(()=>readWakeCommand(['/bin/wake',3]),ORDER_REASONS.invalid);
 for(const program of ['wake','./wake','~/wake','//server/wake','{askId}','/bin/{askId}',''])refused(()=>readWakeCommand([program]),ORDER_REASONS.program);
 refused(()=>readWakeCommand(['/bin/wake',...Array(AGENT_WAKE_LIMITS.args+1).fill('a')]),ORDER_REASONS.args);
 assert.equal(readWakeCommand(['/bin/wake',...Array(AGENT_WAKE_LIMITS.args).fill('a')])!.length,17);
 refused(()=>readWakeCommand(['/bin/wake','x'.repeat(501)]),ORDER_REASONS.args);
 for(const word of ['a\nb','tab\t','bell\u0007','‮flip'])refused(()=>readWakeCommand(['/bin/wake',word]),ORDER_REASONS.control);
 refused(()=>readWakeCommand(['/bin/wake','sk-'+'a'.repeat(30)]),ORDER_REASONS.secret);
 // Only a whole-argument placeholder is replaced; nothing else is read into the arguments.
 assert.deepEqual(wakeArgv(['/bin/wake','{askId}','id={askId}','$HOME','; rm -rf /'],id(700)),{program:'/bin/wake',args:[id(700),'id={askId}','$HOME','; rm -rf /']});
 // The setting: what is not valid is dropped.
 assert.deepEqual(readOrders({defaultFor:'codex',wake:{codex:['/bin/wake'],hermes:['wake'],'Bad Id':['/bin/wake']}}),{defaultFor:'codex',wake:{codex:['/bin/wake']}});
 assert.deepEqual(readOrders(null),{wake:{}});assert.deepEqual(readOrders({defaultFor:'Not One',wake:[]}),{wake:{}});
 // At most once a minute per Agent.
 assert.equal(wakeDelay(undefined,1000),0);assert.equal(wakeDelay(0,30_000),30_000);assert.equal(wakeDelay(0,60_000),0);
 // The audit: a short line of how it ended, no output.
 assert.deepEqual(wakeAuditEntry('codex',id(700),{code:0},t0),{at:t0,agentId:'codex',target:'asks',action:'wake',decision:'allowed',reason:`Woken for work ${id(700)}: exited with 0.`});
 assert.equal(wakeAuditEntry('codex',id(700),{code:2},t0).decision,'denied');
 assert.match(wakeAuditEntry('codex',id(700),{timedOut:true},t0).reason!,/stopped after 5 minutes\.$/);
 assert.match(wakeAuditEntry('codex',id(700),{error:'spawn ENOENT'},t0).reason!,/could not start: spawn ENOENT\.$/);
 assert.equal(orderAuditEntry('codex','set-wake',t0).action,'set-wake');
}
console.log('PASS Agent asks: validation, open cap, claims and leases, resolve, answers, Attention items, asks carrying GitHub drafts and attachments, orders: work for one Agent, the order target, claiming first, wake commands.');
