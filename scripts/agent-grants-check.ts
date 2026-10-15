import assert from 'node:assert/strict';
import type {AgentIdentity,Grant} from '../contracts/agent-identity.ts';
import {askGrant,askGrantAuditEntry,askGrantTargets,askGranted,AGENT_AUDIT_KEEP,GRANT_REASONS,agentAuditEntry,channelDefaultGrants,serviceGrantAuditEntry,serviceGranted,serviceReadGrant,serviceReadTargets,grantCoversTarget,grantDecision,grantPatternMatches,keepAgentAudit,readAgentIdentity,readGrant,standingActions,standingCallDecision,STANDING_OUTSIDE_TURN,worldCallWrites} from '../core/agent/grants.ts';
import {HERMES_CHANNEL_READ_ONLY,hermesChannelToolAllowed} from '../core/agent/hermes-server.ts';
import {resolveAction,worldActionOf,worldActions} from '../core/tools/gateway.ts';
import {turnWriteAdmission,writeDecision} from '../core/agent/turn-trust.ts';
import {prepareWorldItem} from '../core/items/world-item-state.ts';
import {mergeArtifact,readArtifact} from '../core/artifacts/artifacts.ts';

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
assert.equal(standingActions(actions,hermes,defaults,true,now).length,actions.filter(a=>a.target!=='asks').length,'everything but asks, which only the Agent\'s own Grants name');
assert.deepEqual(standingActions(actions,{...hermes,revokedAt:earlier},defaults,true,now),[]);
// A resolved call maps back to its target and action (channelToolReply checks Grants by them).
assert.deepEqual(worldActionOf(actions,'query_world_items',{}),{target:'items',action:'query'});
assert.deepEqual(worldActionOf(actions,'share_world_link',{}),{target:'world',action:'link'});
assert.deepEqual(worldActionOf(actions,'read_world_source',{provider:'gmail'}),{target:'gmail',action:'read'});
assert.equal(worldActionOf(actions,'_source_begin',{}),null);

// "Can read <Service>" (Settings › Agent › Access): exactly that Service's read targets, as a standing read Grant; nothing
// for a name that is not a Service; never in the default Grants. A granted Agent's read_service call passes outside a
// Fox turn, an ungranted one (or another Service's) is refused, and taking it back refuses it again.
assert.deepEqual(serviceReadTargets('github'),['github/list','github/read','github/search']);
assert.deepEqual(serviceReadTargets('posthog'),['posthog/query','posthog/read']);
assert.deepEqual(serviceReadTargets('cloudflare'),['cloudflare/read']);
for(const name of ['gmail','*','github/*','__proto__','constructor','','toString'])assert.deepEqual(serviceReadTargets(name),[],'not a Service: '+name);
assert.equal(serviceReadGrant('codex','*/*',now),null,'a page never names its own patterns');assert.equal(serviceReadGrant('Not An Id','github',now),null);
const githubGrant=serviceReadGrant('codex','github',now)!;
assert.deepEqual(githubGrant,{id:'codex-service-github',agentId:'codex',targets:['github/list','github/read','github/search'],access:'read',duration:'standing',grantedAt:now});
assert.ok(!defaults.concat(channelDefaultGrants('codex',earlier,actions)).some(g=>g.targets.some(t=>/^(github|posthog|cloudflare)\//.test(t))),'no Service in the default Grants');
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

// "Can ask you" and "Can take work": exactly asks/post+read and asks/claim+resolve, never default, never given by a Fox
// turn. An ask is not a guarded write: a granted call runs outside a turn, as a draft for review does.
assert.deepEqual(askGrantTargets('ask'),['asks/post','asks/read']);assert.deepEqual(askGrantTargets('work'),['asks/claim','asks/resolve']);
for(const name of ['*','asks','all','__proto__',''])assert.deepEqual(askGrantTargets(name),[],'not an ask Grant: '+name);
assert.equal(askGrant('codex','*/*',now),null);assert.equal(askGrant('Not An Id','ask',now),null);
const askingGrant=askGrant('codex','ask',now)!,workGrant=askGrant('codex','work',now)!;
assert.deepEqual(askingGrant,{id:'codex-asks-ask',agentId:'codex',targets:['asks/post','asks/read'],access:'read',duration:'standing',grantedAt:now});
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
assert.deepEqual(standingActions(actions,codex,[...codexDefaults,askingGrant],false,now).filter(a=>a.target==='asks').map(a=>a.action),['post','read']);
assert.equal(askGranted('codex',[askingGrant],'ask',now),true);assert.equal(askGranted('codex',[askingGrant],'work',now),false);assert.equal(askGranted('hermes',[askingGrant],'ask',now),false);
assert.deepEqual(askGrantAuditEntry('codex','work',true,now),{at:now,agentId:'codex',target:'asks',action:'grant-work',decision:'allowed',grantId:'codex-asks-work',reason:'The person let this Agent take work in Settings.'});

console.log('PASS agent grants: patterns, read/write and standing/once Grants, turn rule first, audit kept per Agent, host-stamped agentId, default Grants equal the channel allowlist, Fox turn and channel calls on the standing server, per-Service read Grants, ask Grants.');
