import assert from 'node:assert/strict';
import type {AgentIdentity,Grant} from '../contracts/agent-identity.ts';
import {serviceDraftGrant,serviceDraftGrantAuditEntry,serviceDraftGranted,artifactGrant,artifactGrantAuditEntry,artifactGrantTargets,artifactGranted,githubWriteGrant,githubWriteGrantAuditEntry,githubWriteGrantFor,githubWriteGrants,githubWriteScopeWords,OWN_GRANT_TARGETS,githubDraftGrant,githubDraftGrantAuditEntry,githubDraftGranted,boardGrant,boardGrantAuditEntry,boardGrantTargets,boardGranted,askGrant,askGrantAuditEntry,askGrantTargets,askGranted,AGENT_AUDIT_KEEP,GRANT_REASONS,agentAuditEntry,channelDefaultGrants,serviceGrantAuditEntry,serviceGranted,serviceReadGrant,serviceReadTargets,grantCoversTarget,grantDecision,grantPatternMatches,keepAgentAudit,readAgentIdentity,readGrant,standingActions,standingCallDecision,STANDING_OUTSIDE_TURN,worldCallWrites,reportGrant,reportGrantAuditEntry,reportGrantTargets,reportGranted} from '../core/agent/grants.ts';
import {HERMES_CHANNEL_READ_ONLY,hermesChannelToolAllowed} from '../core/agent/hermes-server.ts';
import {resolveAction,worldActionOf,worldActions} from '../core/tools/gateway.ts';
import {turnWriteAdmission,writeDecision} from '../core/agent/turn-trust.ts';
import {GITHUB_DRAFT_REASONS,GITHUB_WRITE_REASONS,readGithubWriteRun,readGithubWriteScope} from '../core/agent/github-drafts.ts';
import {prepareWorldItem} from '../context/items/world-item-state.ts';
import {mergeArtifact,readArtifact} from '../context/artifacts/artifacts.ts';

const now='2026-10-15T12:00:00.000Z',earlier='2026-10-15T11:00:00.000Z',later='2026-10-15T13:00:00.000Z';
const hermes:AgentIdentity={id:'hermes',name:'Hermes Agent',harness:'hermes',kind:'local',createdAt:earlier};
const grant=(id:string,targets:string[],access:Grant['access'],duration:Grant['duration'],extra:Partial<Grant>={}):Grant=>({id,agentId:'hermes',targets,access,duration,grantedAt:earlier,...extra});
const decide=(grants:Grant[],target:string,action:string,writes:boolean,extra:Partial<Parameters<typeof grantDecision>[0]>={})=>
 grantDecision({identity:hermes,grants,target,action,writes,now,...extra});

// Patterns: target/action with * as a wildcard.
assert.equal(grantPatternMatches('items/query','items','query'),true);
assert.equal(grantPatternMatches('items/*','items','archive'),true);
assert.equal(grantPatternMatches('items/*','itemsx','query'),false,'the target is matched whole');
assert.equal(grantPatternMatches('applet:*/launch','applet:mail','launch'),true);
assert.equal(grantPatternMatches('*/*','world','link'),true);
assert.equal(grantPatternMatches('items','items','query'),false,'a pattern names target/action');
assert.equal(grantPatternMatches('items/qu.ry','items','query'),false,'only * is special');
assert.equal(grantPatternMatches('a*b*c/*','aXbYc','go'),true);assert.equal(grantPatternMatches('a*b*c/*','aXcYb','go'),false,'fixed parts in order');
assert.equal(grantPatternMatches('ab*ba/x','aba','x'),false,'the parts may not overlap');assert.equal(grantPatternMatches('*/*/*','a','b'),false);
assert.equal(grantPatternMatches('items/(q)?','items','(q)?'),true,'brackets and ? are plain characters');
// A pattern of many `*` (a stored one may be 120 characters) against a long target answers at once: no backtracking.
const slow=Date.now();for(let i=0;i<200;i++)grantPatternMatches('a*'.repeat(59)+'/z','a'.repeat(5000),'y');
assert.ok(Date.now()-slow<1000,'no catastrophic backtracking');

// No Grant: denied. A read Grant covers reads only. A write Grant covers both.
assert.deepEqual(decide([],'items','query',false),{decision:'denied',reason:GRANT_REASONS.none});
const read=grant('g-read',['items/query','history/query'],'read','standing');
assert.deepEqual(decide([read],'items','query',false),{decision:'allowed',grantId:'g-read'});
assert.deepEqual(decide([read],'items','archive',true),{decision:'denied',reason:GRANT_REASONS.none});
assert.deepEqual(decide([grant('g-items',['items/*'],'read','standing')],'items','archive',true),{decision:'denied',grantId:'g-items',reason:GRANT_REASONS.readOnly});
const write=grant('g-write',['items/*'],'write','standing');
assert.deepEqual(decide([write],'items','archive',true),{decision:'allowed',grantId:'g-write'});
assert.deepEqual(decide([write],'items','query',false),{decision:'allowed',grantId:'g-write'});

// A once Grant: reads run, each write asks the person; a standing Grant beside it wins.
const once=grant('g-once',['content/*'],'write','once');
assert.deepEqual(decide([once],'content','read',false),{decision:'allowed',grantId:'g-once'});
assert.deepEqual(decide([once],'content','create',true),{decision:'asked',grantId:'g-once',reason:GRANT_REASONS.once});
assert.deepEqual(decide([once,grant('g-standing',['content/create'],'write','standing')],'content','create',true),{decision:'allowed',grantId:'g-standing'});

// Revoked and expired Grants count for nothing; another Agent's Grant never applies.
assert.equal(decide([grant('g',['items/*'],'write','standing',{revokedAt:earlier})],'items','query',false).decision,'denied');
assert.equal(decide([grant('g',['items/*'],'write','standing',{expiresAt:earlier})],'items','query',false).decision,'denied');
assert.equal(decide([grant('g',['items/*'],'write','standing',{expiresAt:later})],'items','query',false).decision,'allowed');
assert.equal(decide([{...write,agentId:'claude-code'}],'items','query',false).decision,'denied');

// An unknown or revoked Agent is denied whatever its Grants say.
assert.deepEqual(grantDecision({identity:null,grants:[write],target:'items',action:'query',writes:false,now}),{decision:'denied',reason:GRANT_REASONS.unknown});
assert.deepEqual(decide([write],'items','query',false,{identity:{...hermes,revokedAt:earlier}}),{decision:'denied',reason:GRANT_REASONS.revoked});

// The turn rule always beats a Grant: a write it refuses stays refused under a standing write Grant, with its own words.
const untrusted=writeDecision({untrustedSource:'read_world_source'},true);
assert.equal(untrusted.allowed,false);
const refused=decide([write],'items','archive',true,{turn:untrusted});
assert.equal(refused.decision,'denied');assert.equal(refused.reason,(untrusted as {reason:string}).reason);
const admission=turnWriteAdmission({untrusted:true,sources:['x']},{type:'tool',name:'manage_routines',args:{action:'create'}});
assert.equal(decide([grant('g',['routines/*'],'write','standing')],'routines','create',true,{turn:admission}).reason,admission.error);
// A read is never refused by the turn rule, and an allowed turn does not grant anything by itself.
assert.equal(decide([write],'items','query',false,{turn:untrusted}).decision,'allowed');
assert.equal(decide([],'items','archive',true,{turn:{allowed:true}}).decision,'denied');

// describe_world_tools lists only targets a Grant names.
assert.equal(grantCoversTarget('hermes',[read],'items',['query','save'],now),true);
assert.equal(grantCoversTarget('hermes',[read],'content',['read'],now),false);
assert.equal(grantCoversTarget('pi',[read],'items',['query'],now),false);

// Audit: one entry per decision, the newest N kept per Agent.
const entry=agentAuditEntry('hermes','items','archive',refused,now);
assert.deepEqual(Object.keys(entry).sort(),['action','agentId','at','decision','reason','target']);
const many=Array.from({length:AGENT_AUDIT_KEEP+5},(_,i)=>agentAuditEntry('hermes','items','query',{decision:'allowed'},new Date(Date.parse(now)-i*1000).toISOString()));
const kept=keepAgentAudit([...many,agentAuditEntry('pi','items','query',{decision:'denied'},earlier)]);
assert.equal(kept.filter(e=>e.agentId==='hermes').length,AGENT_AUDIT_KEEP);
assert.equal(kept.filter(e=>e.agentId==='pi').length,1,'one Agent\'s audit never pushes out another\'s');
assert.equal(kept[0].at,now,'newest first');

// Stored records are checked.
assert.deepEqual(readAgentIdentity({...hermes,extra:1}),hermes);
assert.equal(readAgentIdentity({...hermes,id:'Hermes/../x'}),null);
assert.equal(readAgentIdentity({...hermes,kind:'cloud'}),null);
assert.deepEqual(readGrant(write),write);
assert.equal(readGrant({...write,targets:['items']}),null);
assert.equal(readGrant({...write,access:'admin'}),null);

// Hosts stamp agentId on save; a model never sets it.
const item=prepareWorldItem({title:'x',agentId:'evil'},undefined,'a','identity','run',now);
assert.equal(item.agentId,undefined,'a model-supplied agentId is dropped');
assert.equal(prepareWorldItem({title:'x',agentId:'evil'},undefined,'a','identity','run',now,undefined,'hermes').agentId,'hermes');
assert.equal(prepareWorldItem({title:'y',agentId:'evil'},{agentId:'hermes'},'a','identity','run',now).agentId,'hermes','an item keeps the Agent that first saved it');
const answer=readArtifact({id:'art-abcdefghijkl',kind:'answer',title:'T',body:'b',origin:{type:'conversation',place:'here'},agentId:'evil',createdAt:1,updatedAt:1})!;
assert.equal(mergeArtifact(undefined,answer,2).agentId,undefined,'a model-supplied agentId is dropped');
assert.equal(mergeArtifact(undefined,answer,2,'hermes').agentId,'hermes');
assert.equal(mergeArtifact({...answer,agentId:'pi'},answer,2).agentId,'pi');

// The standing MCP server: today's channel allowlist is each Agent's default Grants, so behaviour stays the same.
const actions=worldActions(),defaults=channelDefaultGrants('hermes',earlier,actions);
assert.deepEqual(defaults.map(g=>[g.id,g.access,g.duration]),[['hermes-channel-read','read','standing'],['hermes-channel-link','write','standing']]);
assert.deepEqual(defaults[1].targets,['world/link']);
const standing=(target:string,action:string,args:Record<string,unknown>={},foxTurn:{own:boolean}|null=null,identity:AgentIdentity=hermes)=>{
 const resolved=resolveAction(actions,target,action,args);
 return standingCallDecision({identity,grants:defaults,target,action,tool:resolved.name,args:resolved.args,foxTurn,now});
};
// Every gateway action decides as hermesChannelToolAllowed did, outside a Fox turn.
for(const a of actions){
 const args={...a.defaults};
 const before=hermesChannelToolAllowed({name:a.tool,args})&&(a.tool==='share_world_link'||!worldCallWrites(a.tool,args));
 assert.equal(standing(a.target,a.action).decision==='allowed',before,a.target+'/'+a.action);
}
assert.deepEqual(standing('items','update',{id:'a',status:'done'}),{decision:'denied',reason:HERMES_CHANNEL_READ_ONLY},'a write no Grant allows says what a channel may do');
assert.equal(standing('world','link').decision,'allowed','the browser link from a channel');
const codex:AgentIdentity={id:'codex',name:'Codex',harness:'codex',kind:'local',createdAt:earlier};
assert.deepEqual(standingCallDecision({identity:codex,grants:channelDefaultGrants('codex',earlier,actions),target:'items',action:'update',tool:'update_world_item',args:{id:'a',status:'done'},foxTurn:null,now}),
 {decision:'denied',reason:STANDING_OUTSIDE_TURN},'another Agent is not told it came through a Hermes channel');
assert.equal(standing('items','query',{},null,{...hermes,revokedAt:earlier}).reason,GRANT_REASONS.revoked);
// In a Fox turn the turn takes its Agent's calls: reads run, its own writes run, another write asks the person.
assert.equal(standing('content','read',{id:'x'},{own:false}).decision,'allowed');
assert.equal(standing('items','update',{id:'a',status:'done'},{own:true}).decision,'allowed');
assert.equal(standing('items','update',{id:'a',status:'done'},{own:false}).decision,'asked');
assert.equal(worldCallWrites('start_applet_task'),true);assert.equal(worldCallWrites('query_world_items'),false);
// describe_world_tools: only granted targets outside a turn; everything while a Fox turn holds the server; none revoked.
const listed=new Set(standingActions(actions,hermes,defaults,false,now).map(a=>a.target));
assert.ok(listed.has('items')&&listed.has('world')&&!listed.has('content'));
assert.equal(standingActions(actions,hermes,defaults,true,now).length,actions.filter(a=>!['asks','board','context','github-drafts','github-writes','agents','agent-artifacts','posthog-drafts','notion-drafts'].includes(a.target)).length,'everything but asks, the board, the saved Service context, GitHub, PostHog and Notion drafts, GitHub writes, Agent reports and Journal artifacts, which only the Agent\'s own Grants name');
assert.deepEqual(standingActions(actions,{...hermes,revokedAt:earlier},defaults,true,now),[]);
// A resolved call maps back to its target and action (channelToolReply checks Grants by them).
assert.deepEqual(worldActionOf(actions,'query_world_items',{}),{target:'items',action:'query'});
assert.deepEqual(worldActionOf(actions,'share_world_link',{}),{target:'world',action:'link'});
assert.deepEqual(worldActionOf(actions,'read_world_source',{provider:'gmail'}),{target:'gmail',action:'read'});
assert.equal(worldActionOf(actions,'_source_begin',{}),null);

// "Can read <Service>" (Settings › Agents): exactly that Service's read targets, as a standing read Grant; nothing
// for a name that is not a Service; never in the default Grants. A granted Agent's read_service call passes outside a
// Fox turn, an ungranted one (or another Service's) is refused, and taking it back refuses it again.
assert.deepEqual(serviceReadTargets('github'),['github/list','github/read','github/search','github/releases']);
assert.deepEqual(serviceReadTargets('posthog'),['posthog/query','posthog/read']);
assert.deepEqual(serviceReadTargets('cloudflare'),['cloudflare/read']);
assert.deepEqual(serviceReadTargets('http'),['http/list','http/read']);
assert.deepEqual(serviceReadTargets('search-console'),['search-console/list','search-console/query']);
for(const name of ['gmail','*','github/*','__proto__','constructor','','toString'])assert.deepEqual(serviceReadTargets(name),[],'not a Service: '+name);
assert.equal(serviceReadGrant('codex','*/*',now),null,'a page never names its own patterns');assert.equal(serviceReadGrant('Not An Id','github',now),null);
const githubGrant=serviceReadGrant('codex','github',now)!;
assert.deepEqual(githubGrant,{id:'codex-service-github',agentId:'codex',targets:['github/list','github/read','github/search','github/releases','context/search','context/read'],access:'read',duration:'standing',grantedAt:now});
assert.ok(!defaults.concat(channelDefaultGrants('codex',earlier,actions)).some(g=>g.targets.some(t=>/^(github|posthog|cloudflare|http|search-console)\//.test(t))),'no Service in the default Grants');
const codexDefaults=channelDefaultGrants('codex',earlier,actions);
const serviceCall=(grants:Grant[],target:string,action:string,args:Record<string,unknown>)=>{
 const resolved=resolveAction(actions,target,action,args);
 assert.equal(resolved.name,'read_service');
 return standingCallDecision({identity:codex,grants,target,action,tool:resolved.name,args:resolved.args,foxTurn:null,now});
};
assert.deepEqual(serviceCall(codexDefaults,'github','list',{}),{decision:'denied',reason:STANDING_OUTSIDE_TURN},'ungranted: refused');
assert.deepEqual(serviceCall([...codexDefaults,githubGrant],'github','list',{}),{decision:'allowed',grantId:'codex-service-github'},'granted: allowed');
assert.equal(serviceCall([...codexDefaults,githubGrant],'github','read',{id:'acme/app#1'}).decision,'allowed');
assert.equal(serviceCall([...codexDefaults,githubGrant],'posthog','query',{query:'select 1'}).decision,'denied','another Service stays refused');
assert.equal(serviceCall([...codexDefaults,{...githubGrant,revokedAt:earlier}],'github','list',{}).decision,'denied','taken back: refused again');
assert.equal(serviceCall([...codexDefaults,{...githubGrant,agentId:'hermes'}],'github','list',{}).decision,'denied','another Agent\'s Grant does not count');
assert.ok(standingActions(actions,codex,[...codexDefaults,githubGrant],false,now).some(a=>a.target==='github'),'describe_world_tools lists it once granted');
assert.ok(!standingActions(actions,codex,codexDefaults,false,now).some(a=>a.target==='github'));
assert.equal(serviceGranted('codex',[githubGrant],'github',now),true);assert.equal(serviceGranted('codex',[{...githubGrant,revokedAt:earlier}],'github',now),false);
assert.equal(serviceGranted('codex',[githubGrant],'posthog',now),false);assert.equal(serviceGranted('hermes',[githubGrant],'github',now),false);
assert.deepEqual(serviceGrantAuditEntry('codex','github',true,now),{at:now,agentId:'codex',target:'github',action:'grant',decision:'allowed',grantId:'codex-service-github',reason:'The person let this Agent read this Service in Settings.'});
assert.equal(serviceGrantAuditEntry('codex','github',false,now).action,'ungrant');

// "Can ask you" and "Can take work": exactly asks/post+read and asks/claim+resolve, each with asks/attachment (the poster
// and the claimer read an ask's attachments), never default, never given by a Fox turn. An ask is not a guarded write: a
// granted call runs outside a turn, as a draft for review does.
assert.deepEqual(askGrantTargets('ask'),['asks/post','asks/read','asks/attachment']);assert.deepEqual(askGrantTargets('work'),['asks/claim','asks/resolve','asks/attachment']);
for(const name of ['*','asks','all','__proto__',''])assert.deepEqual(askGrantTargets(name),[],'not an ask Grant: '+name);
assert.equal(askGrant('codex','*/*',now),null);assert.equal(askGrant('Not An Id','ask',now),null);
const askingGrant=askGrant('codex','ask',now)!,workGrant=askGrant('codex','work',now)!;
assert.deepEqual(askingGrant,{id:'codex-asks-ask',agentId:'codex',targets:['asks/post','asks/read','asks/attachment'],access:'read',duration:'standing',grantedAt:now});
// One given before asks/attachment existed is read with today's targets; another Grant's targets are kept as stored.
assert.deepEqual(readGrant({...askingGrant,targets:['asks/post','asks/read']})!.targets,askGrantTargets('ask'));
assert.deepEqual(readGrant({...workGrant,targets:['asks/claim']})!.targets,askGrantTargets('work'));
assert.deepEqual(readGrant({...askingGrant,id:'codex-other',targets:['asks/post']})!.targets,['asks/post']);
assert.ok(!channelDefaultGrants('codex',earlier,actions).some(g=>g.targets.some(t=>t.startsWith('asks/'))),'no asks in the default Grants');
const askCall=(grants:Grant[],action:string,args:Record<string,unknown>,foxTurn:{own:boolean}|null=null,identity=codex)=>{
 const resolved=resolveAction(actions,'asks',action,args);
 assert.equal(resolved.name,'agent_asks');assert.equal(worldCallWrites(resolved.name,resolved.args),false,'an ask is not a guarded write');
 return standingCallDecision({identity,grants,target:'asks',action,tool:resolved.name,args:resolved.args,foxTurn,now});
};
assert.equal(askCall(codexDefaults,'post',{title:'Which?'}).decision,'denied','ungranted: refused');
assert.deepEqual(askCall([...codexDefaults,askingGrant],'post',{title:'Which?'}),{decision:'allowed',grantId:'codex-asks-ask'});
assert.equal(askCall([...codexDefaults,askingGrant],'read',{}).decision,'allowed');
assert.equal(askCall([...codexDefaults,askingGrant],'claim',{}).decision,'denied','asking is not taking work');
assert.equal(askCall([...codexDefaults,workGrant],'resolve',{id:'ask-00000001',note:'x',expectedRevision:1}).decision,'allowed');
assert.equal(askCall([...codexDefaults,workGrant],'post',{title:'x'}).decision,'denied');
assert.equal(askCall([...codexDefaults,{...askingGrant,revokedAt:earlier}],'post',{title:'x'}).decision,'denied','taken back: refused');
assert.equal(askCall([...codexDefaults,{...askingGrant,agentId:'hermes'}],'post',{title:'x'}).decision,'denied','another Agent\'s Grant does not count');
assert.equal(askCall(defaults,'post',{title:'x'},{own:true},hermes).decision,'denied','a Fox turn never grants asks');
assert.equal(askCall([...defaults,askGrant('hermes','ask',now)!],'post',{title:'x'},{own:false},hermes).decision,'allowed','its own Grant does, in a turn too');
assert.ok(!standingActions(actions,hermes,defaults,true,now).some(a=>a.target==='asks'),'not listed in a Fox turn without a Grant');
assert.deepEqual(standingActions(actions,codex,[...codexDefaults,askingGrant],false,now).filter(a=>a.target==='asks').map(a=>a.action),['post','read','attachment']);
assert.equal(askGranted('codex',[askingGrant],'ask',now),true);assert.equal(askGranted('codex',[askingGrant],'work',now),false);assert.equal(askGranted('hermes',[askingGrant],'ask',now),false);
assert.deepEqual(askGrantAuditEntry('codex','work',true,now),{at:now,agentId:'codex',target:'asks',action:'grant-work',decision:'allowed',grantId:'codex-asks-work',reason:'The person let this Agent take work in Settings.'});

// "Can see your board" and "Can set up your board": exactly board/read and board/define, never default, never given by a
// Fox turn, and not a guarded write.
assert.deepEqual(boardGrantTargets('read'),['board/read']);assert.deepEqual(boardGrantTargets('define'),['board/define']);
for(const name of ['*','board','all','__proto__','','ask'])assert.deepEqual(boardGrantTargets(name),[],'not a board Grant: '+name);
assert.equal(boardGrant('codex','*/*',now),null);assert.equal(boardGrant('Not An Id','read',now),null);
const seeGrant=boardGrant('codex','read',now)!,defineGrant=boardGrant('codex','define',now)!;
assert.deepEqual(seeGrant,{id:'codex-board-read',agentId:'codex',targets:['board/read'],access:'read',duration:'standing',grantedAt:now});
assert.ok(!channelDefaultGrants('codex',earlier,actions).some(g=>g.targets.some(t=>t.startsWith('board/'))),'no board in the default Grants');
const boardCall=(grants:Grant[],action:string,args:Record<string,unknown>,foxTurn:{own:boolean}|null=null,identity=codex)=>{
 const resolved=resolveAction(actions,'board',action,args);
 assert.equal(resolved.name,'world_board');assert.equal(worldCallWrites(resolved.name,resolved.args),false,'the board is not a guarded write');
 return standingCallDecision({identity,grants,target:'board',action,tool:resolved.name,args:resolved.args,foxTurn,now});
};
const definition={tabs:[{id:'a',title:'A',blocks:[]}]};
assert.equal(boardCall(codexDefaults,'read',{}).decision,'denied','ungranted: refused');
assert.deepEqual(boardCall([...codexDefaults,seeGrant],'read',{}),{decision:'allowed',grantId:'codex-board-read'});
assert.equal(boardCall([...codexDefaults,seeGrant],'define',{definition,expectedRevision:0}).decision,'denied','seeing is not setting up');
assert.deepEqual(boardCall([...codexDefaults,defineGrant],'define',{definition,expectedRevision:0}),{decision:'allowed',grantId:'codex-board-define'});
assert.equal(boardCall([...codexDefaults,{...defineGrant,revokedAt:earlier}],'define',{definition,expectedRevision:0}).decision,'denied','taken back: refused');
assert.equal(boardCall(defaults,'define',{definition,expectedRevision:0},{own:true},hermes).decision,'denied','a Fox turn never sets up the board');
assert.equal(boardCall(defaults,'read',{},{own:true},hermes).decision,'denied','nor reads it');
assert.equal(boardCall([...defaults,boardGrant('hermes','read',now)!],'read',{},{own:false},hermes).decision,'allowed','its own Grant does, in a turn too');
assert.ok(!standingActions(actions,hermes,defaults,true,now).some(a=>a.target==='board'),'not listed in a Fox turn without a Grant');
assert.deepEqual(standingActions(actions,codex,[...codexDefaults,defineGrant],false,now).filter(a=>a.target==='board').map(a=>a.action),['define']);
assert.equal(boardGranted('codex',[seeGrant],'read',now),true);assert.equal(boardGranted('codex',[seeGrant],'define',now),false);assert.equal(boardGranted('hermes',[seeGrant],'read',now),false);
assert.deepEqual(boardGrantAuditEntry('codex','define',true,now),{at:now,agentId:'codex',target:'board',action:'grant-define',decision:'allowed',grantId:'codex-board-define',reason:'The person let this Agent set up the board in Settings.'});

// "Can draft GitHub changes": exactly github-drafts/create and read, never default, never given by a Fox turn's broad
// `*/*` Grant, nor by a Service read Grant, and not a guarded write (nothing is written until the person approves).
const draftGrant=githubDraftGrant('codex',now)!;
assert.deepEqual(draftGrant,{id:'codex-github-drafts',agentId:'codex',targets:['github-drafts/create','github-drafts/read'],access:'read',duration:'standing',grantedAt:now});
assert.equal(githubDraftGrant('Not An Id',now),null);
assert.ok(!channelDefaultGrants('codex',earlier,actions).some(g=>g.targets.some(t=>t.startsWith('github-drafts/'))),'no GitHub drafts in the default Grants');
const draftCall=(grants:Grant[],action:string,args:Record<string,unknown>,foxTurn:{own:boolean}|null=null,identity=codex)=>{
 const resolved=resolveAction(actions,'github-drafts',action,args);
 assert.equal(resolved.name,'github_drafts');assert.equal(worldCallWrites(resolved.name,resolved.args),false,'a draft is not a guarded write');
 return standingCallDecision({identity,grants,target:'github-drafts',action,tool:resolved.name,args:resolved.args,foxTurn,now});
};
const drafting={write:'issue.comment',target:'example/app#1',body:'Thanks!'};
assert.equal(draftCall(codexDefaults,'create',drafting).decision,'denied','ungranted: refused');
assert.equal(draftCall([...codexDefaults,serviceReadGrant('codex','github',now)!],'create',drafting).decision,'denied','reading GitHub is not drafting');
assert.deepEqual(draftCall([...codexDefaults,draftGrant],'create',drafting),{decision:'allowed',grantId:'codex-github-drafts'});
assert.equal(draftCall([...codexDefaults,draftGrant],'read',{}).decision,'allowed');
assert.equal(draftCall([...codexDefaults,{...draftGrant,revokedAt:earlier}],'create',drafting).decision,'denied','taken back: refused');
assert.equal(draftCall(defaults,'create',drafting,{own:true},hermes).decision,'denied','a Fox turn\'s */* Grant never drafts a GitHub write');
assert.equal(draftCall(defaults,'read',{},{own:true},hermes).decision,'denied','nor reads drafts');
assert.equal(draftCall([...defaults,{id:'broad',agentId:'hermes',targets:['*/*'],access:'write',duration:'standing',grantedAt:now}],'create',drafting,{own:true},hermes).decision,'allowed','only an explicit Grant of its own covers it');
assert.equal(draftCall([...defaults,githubDraftGrant('hermes',now)!],'create',drafting,{own:true},hermes).decision,'allowed','its own Grant does, in a turn too');
assert.ok(!standingActions(actions,hermes,defaults,true,now).some(a=>a.target==='github-drafts'),'not listed in a Fox turn without a Grant');
assert.deepEqual(standingActions(actions,codex,[...codexDefaults,draftGrant],false,now).filter(a=>a.target==='github-drafts').map(a=>a.action),['create','read']);
assert.equal(githubDraftGranted('codex',[draftGrant],now),true);assert.equal(githubDraftGranted('hermes',[draftGrant],now),false);
assert.deepEqual(githubDraftGrantAuditEntry('codex',false,now),{at:now,agentId:'codex',target:'github-drafts',action:'ungrant',decision:'allowed',grantId:'codex-github-drafts',reason:'The person stopped this Agent drafting GitHub changes in Settings.'});

// "Can report its work" and "Can see other Agents": exactly agents/report and agents/list, never default, never given by
// a Fox turn, and not a guarded write.
assert.deepEqual(reportGrantTargets('report'),['agents/report']);assert.deepEqual(reportGrantTargets('list'),['agents/list']);
for(const name of ['*','agents','all','__proto__','','read'])assert.deepEqual(reportGrantTargets(name),[],'not a report Grant: '+name);
assert.equal(reportGrant('codex','*/*',now),null);assert.equal(reportGrant('Not An Id','report',now),null);
const reportingGrant=reportGrant('codex','report',now)!,listingGrant=reportGrant('codex','list',now)!;
assert.deepEqual(reportingGrant,{id:'codex-agents-report',agentId:'codex',targets:['agents/report'],access:'read',duration:'standing',grantedAt:now});
assert.ok(!channelDefaultGrants('codex',earlier,actions).some(g=>g.targets.some(t=>t.startsWith('agents/'))),'no Agent reports in the default Grants');
const reportCall=(grants:Grant[],action:string,args:Record<string,unknown>,foxTurn:{own:boolean}|null=null,identity=codex)=>{
 const resolved=resolveAction(actions,'agents',action,args);
 assert.equal(resolved.name,'agent_reports');assert.equal(worldCallWrites(resolved.name,resolved.args),false,'a report is not a guarded write');
 return standingCallDecision({identity,grants,target:'agents',action,tool:resolved.name,args:resolved.args,foxTurn,now});
};
assert.equal(reportCall(codexDefaults,'report',{status:'idle'}).decision,'denied','ungranted: refused');
assert.deepEqual(reportCall([...codexDefaults,reportingGrant],'report',{status:'idle'}),{decision:'allowed',grantId:'codex-agents-report'});
assert.equal(reportCall([...codexDefaults,reportingGrant],'list',{}).decision,'denied','reporting is not seeing others');
assert.deepEqual(reportCall([...codexDefaults,listingGrant],'list',{}),{decision:'allowed',grantId:'codex-agents-list'});
assert.equal(reportCall(defaults,'report',{status:'idle'},{own:true},hermes).decision,'denied','a Fox turn never reports');
assert.equal(reportCall(defaults,'list',{},{own:true},hermes).decision,'denied','nor lists Agents');
assert.ok(!standingActions(actions,hermes,defaults,true,now).some(a=>a.target==='agents'),'not listed in a Fox turn without a Grant');
assert.deepEqual(standingActions(actions,codex,[...codexDefaults,listingGrant],false,now).filter(a=>a.target==='agents').map(a=>a.action),['list']);
assert.equal(reportGranted('codex',[listingGrant],'list',now),true);assert.equal(reportGranted('codex',[listingGrant],'report',now),false);assert.equal(reportGranted('hermes',[listingGrant],'list',now),false);
assert.deepEqual(reportGrantAuditEntry('codex','list',true,now),{at:now,agentId:'codex',target:'agents',action:'grant-list',decision:'allowed',grantId:'codex-agents-list',reason:'The person let this Agent see other Agents in Settings.'});

// "Can update Issues in <repo> without asking": exactly github-writes/run, a standing write Grant built by Core from
// the repository and a fixed choice, its reach kept on the Grant; never default, never a Fox turn's, never a read
// Grant's (it writes at once), and only for its own repository, writes and label prefix.
const writeGrant=githubWriteGrant('codex','example/App','comment-labels','state:',now)!;
assert.deepEqual(writeGrant,{id:'codex-github-writes-example/app',agentId:'codex',targets:['github-writes/run'],access:'write',duration:'standing',grantedAt:now,
 github:{repo:'example/App',writes:['issue.comment','labels.set'],labelPrefix:'state:'}});
assert.deepEqual(githubWriteGrant('codex','example/app','comment','',now)!.github,{repo:'example/app',writes:['issue.comment']});
assert.deepEqual(githubWriteGrant('codex','example/app','labels','triage/',now)!.github,{repo:'example/app',writes:['labels.set'],labelPrefix:'triage/'});
for(const [repo,choice,prefix] of [['example/app','close',''],['example/app','labels',''],['example/app','labels',' state:'],['example/app','labels','a\nb'],['example/app','comment','state:'],
 ['example','comment',''],['example/app#1','comment',''],['../x','comment',''],['example/app','*/*','']] as const)assert.equal(githubWriteGrant('codex',repo,choice,prefix,now),null,`refused: ${repo} ${choice} ${JSON.stringify(prefix)}`);
assert.equal(githubWriteGrant('Not An Id','example/app','comment','',now),null);
assert.ok(OWN_GRANT_TARGETS.includes('github-writes'));
assert.ok(!channelDefaultGrants('codex',earlier,actions).some(g=>g.targets.some(t=>t.startsWith('github-writes/'))),'no GitHub writes in the default Grants');
// A stored Grant keeps its reach; one whose reach is not valid is dropped rather than widened.
assert.deepEqual(readGrant(JSON.parse(JSON.stringify(writeGrant))),writeGrant);
assert.equal(readGrant({...writeGrant,github:{repo:'example/app',writes:['issue.create']}}),null);
assert.equal(readGrant({...writeGrant,github:{repo:'example/app',writes:['labels.set']}}),null,'labels need a prefix');
assert.equal(readGithubWriteScope({repo:'example/app',writes:['issue.comment','issue.comment']}),null);
const writeCall=(grants:Grant[],args:Record<string,unknown>,foxTurn:{own:boolean}|null=null,identity=codex)=>{
 const resolved=resolveAction(actions,'github-writes','run',args);
 assert.equal(resolved.name,'github_writes');assert.equal(worldCallWrites(resolved.name,resolved.args),true,'a standing GitHub write writes');
 return standingCallDecision({identity,grants,target:'github-writes',action:'run',tool:resolved.name,args:resolved.args,foxTurn,now});
};
const moving={write:'labels.set',target:'example/app#7',prefix:'state:',expected:['state:queued'],set:['state:running']};
assert.equal(writeCall(codexDefaults,moving).decision,'denied','ungranted: refused');
assert.equal(writeCall([...codexDefaults,draftGrant,serviceReadGrant('codex','github',now)!],moving).decision,'denied','drafting and reading GitHub are not writing');
assert.deepEqual(writeCall([...codexDefaults,writeGrant],moving),{decision:'allowed',grantId:'codex-github-writes-example/app'},'the turn rule admits it and the standing write Grant allows it');
assert.equal(writeCall([...codexDefaults,{...writeGrant,revokedAt:earlier}],moving).decision,'denied','removed: refused');
assert.equal(writeCall(defaults,moving,{own:true},hermes).decision,'denied','a Fox turn\'s */* Grant never writes to GitHub');
assert.equal(writeCall([...defaults,githubWriteGrant('hermes','example/app','labels','state:',now)!],moving,{own:false},hermes).decision,'allowed','its own Grant does, in a turn too');
assert.ok(!standingActions(actions,hermes,defaults,true,now).some(a=>a.target==='github-writes'),'not listed in a Fox turn without a Grant');
assert.deepEqual(standingActions(actions,codex,[...codexDefaults,writeGrant],false,now).filter(a=>a.target==='github-writes').map(a=>a.action),['run']);
// The reach: the host checks it after the gateway's decision, before GitHub is asked anything.
const reach=(args:Record<string,unknown>,grants:Grant[]=[writeGrant],agent='codex')=>githubWriteGrantFor(agent,grants,readGithubWriteRun(args),now)?.id??null;
assert.equal(reach(moving),'codex-github-writes-example/app');
assert.equal(reach({...moving,target:'EXAMPLE/APP#7'}),'codex-github-writes-example/app','the repository compares case-insensitively');
assert.equal(reach({write:'issue.comment',target:'example/app#7',body:'Started.'}),'codex-github-writes-example/app');
assert.equal(reach({...moving,target:'example/other#7'}),null,'another repository');
assert.equal(reach({...moving,prefix:'stage:',expected:['stage:a'],set:['stage:b']}),null,'another prefix');
assert.equal(reach({...moving,prefix:undefined}),null,'every label, not only state:');
assert.equal(reach({...moving,prefix:'state:q',expected:['state:queued'],set:['state:quiet']}),'codex-github-writes-example/app','a narrower prefix');
assert.equal(reach({write:'issue.comment',target:'example/app#7',body:'Hi'},[githubWriteGrant('codex','example/app','labels','state:',now)!]),null,'labels only: no comment');
assert.equal(reach(moving,[githubWriteGrant('codex','example/app','comment','',now)!]),null,'comment only: no labels');
assert.equal(reach(moving,[writeGrant],'claude-code'),null,'another Agent\'s Grant');
assert.equal(reach(moving,[{...writeGrant,revokedAt:earlier}]),null);
assert.deepEqual(githubWriteGrants('codex',[writeGrant,draftGrant],now),[writeGrant]);
// What a run may hold: only a comment or a label transition on an Issue, checked as a draft is.
const bad=(args:Record<string,unknown>)=>{try{readGithubWriteRun(args);}catch(error){return (error as Error).message;}return '';};
assert.equal(bad({write:'issue.close',target:'example/app#7'}),GITHUB_WRITE_REASONS.write);
assert.equal(bad({write:'issue.create',target:'example/app',title:'x'}),GITHUB_WRITE_REASONS.write);
assert.equal(bad({write:'issue.comment',target:'example/app#7',body:'key ghp_'+'a'.repeat(36)}),GITHUB_DRAFT_REASONS.secret);
assert.equal(bad({write:'issue.comment',target:'example/app#7',body:'bell \u0007'}),GITHUB_DRAFT_REASONS.control);
assert.equal(bad({...moving,set:['done']}),GITHUB_DRAFT_REASONS.prefix);
assert.equal(bad({...moving,set:['STATE:QUEUED']}),GITHUB_DRAFT_REASONS.unchanged);
assert.equal(bad({...moving,expectedState:'merged'}),GITHUB_DRAFT_REASONS.invalid);
assert.equal(bad({...moving,expected:undefined}),GITHUB_DRAFT_REASONS.invalid,'what it read is required');
assert.equal(bad({...moving,expected:[]}),'','none under the prefix is a state');
assert.equal(githubWriteScopeWords(writeGrant.github!),'comment and change “state:” labels');
assert.deepEqual(githubWriteGrantAuditEntry('codex',writeGrant.github!,true,now),{at:now,agentId:'codex',target:'github-writes',action:'grant',decision:'allowed',grantId:'codex-github-writes-example/app',
 reason:'The person let this Agent comment and change “state:” labels on example/App without asking, in Settings.'});

// "Can save to your Journal" (save, and reading its own) and "Can read Agents' Journal artifacts": exactly those targets,
// never default, never given by a Fox turn's `*/*` Grant, and not a guarded write.
assert.deepEqual(artifactGrantTargets('save'),['agent-artifacts/save','agent-artifacts/read']);assert.deepEqual(artifactGrantTargets('read'),['agent-artifacts/read']);
for(const name of ['*','artifacts','all','__proto__','','define'])assert.deepEqual(artifactGrantTargets(name),[],'not a Journal artifact Grant: '+name);
assert.equal(artifactGrant('codex','*/*',now),null);assert.equal(artifactGrant('Not An Id','save',now),null);
const journalSaveGrant=artifactGrant('codex','save',now)!,journalReadGrant=artifactGrant('codex','read',now)!;
assert.deepEqual(journalSaveGrant,{id:'codex-artifacts-save',agentId:'codex',targets:['agent-artifacts/save','agent-artifacts/read'],access:'read',duration:'standing',grantedAt:now});
assert.ok(!channelDefaultGrants('codex',earlier,actions).some(g=>g.targets.some(t=>t.startsWith('agent-artifacts/'))),'no Journal artifacts in the default Grants');
const journalCall=(grants:Grant[],action:string,args:Record<string,unknown>,foxTurn:{own:boolean}|null=null,identity=codex)=>{
 const resolved=resolveAction(actions,'agent-artifacts',action,args);
 assert.equal(resolved.name,'agent_artifacts');assert.equal(worldCallWrites(resolved.name,resolved.args),false,'a Journal artifact is not a guarded write');
 return standingCallDecision({identity,grants,target:'agent-artifacts',action,tool:resolved.name,args:resolved.args,foxTurn,now});
};
const journalEntry={title:'Hourly status',body:'All green.',key:'hourly-2026-10-17T07'};
assert.equal(journalCall(codexDefaults,'save',journalEntry).decision,'denied','ungranted: refused');
assert.equal(journalCall(codexDefaults,'read',{}).decision,'denied');
assert.deepEqual(journalCall([...codexDefaults,journalSaveGrant],'save',journalEntry),{decision:'allowed',grantId:'codex-artifacts-save'});
assert.equal(journalCall([...codexDefaults,journalSaveGrant],'read',{}).decision,'allowed','saving includes reading its own');
assert.equal(journalCall([...codexDefaults,journalReadGrant],'save',journalEntry).decision,'denied','reading is not saving');
assert.deepEqual(journalCall([...codexDefaults,journalReadGrant],'read',{agent:'hermes'}),{decision:'allowed',grantId:'codex-artifacts-read'});
assert.equal(journalCall([...codexDefaults,{...journalSaveGrant,revokedAt:earlier}],'save',journalEntry).decision,'denied','taken back: refused');
assert.equal(journalCall(defaults,'save',journalEntry,{own:true},hermes).decision,'denied','a Fox turn never saves an Agent\'s Journal artifact');
assert.equal(journalCall(defaults,'read',{},{own:true},hermes).decision,'denied','nor reads them');
assert.equal(journalCall([...defaults,artifactGrant('hermes','save',now)!],'save',journalEntry,{own:false},hermes).decision,'allowed','its own Grant does, in a turn too');
assert.ok(!standingActions(actions,hermes,defaults,true,now).some(a=>a.target==='agent-artifacts'),'not listed in a Fox turn without a Grant');
assert.deepEqual(standingActions(actions,codex,[...codexDefaults,journalReadGrant],false,now).filter(a=>a.target==='agent-artifacts').map(a=>a.action),['read']);
assert.equal(artifactGranted('codex',[journalSaveGrant],'save',now),true);assert.equal(artifactGranted('codex',[journalSaveGrant],'read',now),false,'saving is not reading every Agent\'s');assert.equal(artifactGranted('hermes',[journalSaveGrant],'save',now),false);
assert.deepEqual(artifactGrantAuditEntry('codex','read',true,now),{at:now,agentId:'codex',target:'agent-artifacts',action:'grant-read',decision:'allowed',grantId:'codex-artifacts-read',reason:'The person let this Agent read Agents\' Journal artifacts in Settings.'});

// "Can draft PostHog changes" and "Can draft Notion changes": each exactly that Service's drafts/create and read, never
// default, never given by a Fox turn's `*/*` Grant, by reading the Service or by the other Service's draft Grant.
const posthogDraft=serviceDraftGrant('codex','posthog',now)!,notionDraft=serviceDraftGrant('codex','notion',now)!;
assert.deepEqual(posthogDraft,{id:'codex-posthog-drafts',agentId:'codex',targets:['posthog-drafts/create','posthog-drafts/read'],access:'read',duration:'standing',grantedAt:now});
assert.deepEqual(notionDraft.targets,['notion-drafts/create','notion-drafts/read']);
assert.equal(serviceDraftGrant('codex','github',now),null,'GitHub drafts have their own Grant');
assert.equal(serviceDraftGrant('Not An Id','posthog',now),null);
assert.ok(!channelDefaultGrants('codex',earlier,actions).some(g=>g.targets.some(t=>/^(posthog|notion)-drafts\//.test(t))),'no PostHog or Notion drafts in the default Grants');
const serviceDraftCall=(grants:Grant[],target:string,action:string,args:Record<string,unknown>,foxTurn:{own:boolean}|null=null,identity=codex)=>{
 const resolved=resolveAction(actions,target,action,args);
 assert.equal(resolved.name,'service_drafts');assert.equal(resolved.args.provider,target.split('-')[0]);assert.equal(worldCallWrites(resolved.name,resolved.args),false,'a draft is not a guarded write');
 return standingCallDecision({identity,grants,target,action,tool:resolved.name,args:resolved.args,foxTurn,now});
};
const flagging={write:'flag.set',target:'new-checkout',active:true};
assert.equal(serviceDraftCall(codexDefaults,'posthog-drafts','create',flagging).decision,'denied','ungranted: refused');
assert.equal(serviceDraftCall([...codexDefaults,serviceReadGrant('codex','posthog',now)!],'posthog-drafts','create',flagging).decision,'denied','reading PostHog is not drafting');
assert.equal(serviceDraftCall([...codexDefaults,notionDraft],'posthog-drafts','create',flagging).decision,'denied','the Notion Grant is not the PostHog one');
assert.deepEqual(serviceDraftCall([...codexDefaults,posthogDraft],'posthog-drafts','create',flagging),{decision:'allowed',grantId:'codex-posthog-drafts'});
assert.equal(serviceDraftCall([...codexDefaults,notionDraft],'notion-drafts','read',{}).decision,'allowed');
assert.equal(serviceDraftCall([...codexDefaults,{...posthogDraft,revokedAt:earlier}],'posthog-drafts','create',flagging).decision,'denied','taken back: refused');
assert.equal(serviceDraftCall(defaults,'notion-drafts','create',{write:'page.append',target:'a'.repeat(32),body:'Hi'},{own:true},hermes).decision,'denied','a Fox turn\'s */* Grant never drafts a PostHog or Notion write');
assert.ok(!standingActions(actions,hermes,defaults,true,now).some(a=>/^(posthog|notion)-drafts$/.test(a.target)),'not listed in a Fox turn without a Grant');
assert.deepEqual(standingActions(actions,codex,[...codexDefaults,posthogDraft],false,now).filter(a=>a.target.endsWith('-drafts')).map(a=>a.target+'/'+a.action),['posthog-drafts/create','posthog-drafts/read']);
assert.equal(serviceDraftGranted('codex',[posthogDraft],'posthog',now),true);assert.equal(serviceDraftGranted('codex',[posthogDraft],'notion',now),false);
assert.deepEqual(serviceDraftGrantAuditEntry('codex','notion',true,now),{at:now,agentId:'codex',target:'notion-drafts',action:'grant',decision:'allowed',grantId:'codex-notion-drafts',reason:'The person let this Agent draft Notion changes in Settings.'});

console.log('PASS agent grants: patterns, read/write and standing/once Grants, turn rule first, audit kept per Agent, host-stamped agentId, default Grants equal the channel allowlist, Fox turn and channel calls on the standing server, per-Service read Grants, ask Grants, board Grants, report Grants, GitHub draft Grants, standing GitHub write Grants and their reach, Journal artifact Grants, PostHog and Notion draft Grants.');
