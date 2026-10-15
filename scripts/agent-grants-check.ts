import assert from 'node:assert/strict';
import type {AgentIdentity,Grant} from '../contracts/agent-identity.ts';
import {AGENT_AUDIT_KEEP,GRANT_REASONS,agentAuditEntry,grantCoversTarget,grantDecision,grantPatternMatches,keepAgentAudit,readAgentIdentity,readGrant} from '../core/agent/grants.ts';
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

console.log('PASS agent grants: patterns, read/write and standing/once Grants, turn rule first, audit kept per Agent, host-stamped agentId.');
