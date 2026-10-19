import assert from 'node:assert/strict';
import {REPORT_REASONS,agentLiveness,listAgents,makeAgentReport,readStoredReport} from '../agent/agents/reports.ts';
import {AGENT_REPORT_LIMITS} from '../contracts/agent-reports.ts';
import type {AgentIdentity} from '../contracts/agent-identity.ts';

// Agent reports in Core (agent/agents/reports.ts, agent/agents/GRANTS.md#agent-reports): what one report may hold, the
// host-stamped Agent and time, how it reads as time passes, and what agents/list returns.
const now='2026-10-17T12:00:00.000Z',later=(minutes:number)=>new Date(Date.parse(now)+minutes*60_000).toISOString();
const refused=(input:unknown,reason:string=REPORT_REASONS.invalid)=>assert.throws(()=>makeAgentReport('codex',input,now),{message:reason},JSON.stringify(input));

// A full report: the caller's own ID and the host's time are stamped; an agentId or reportedAt the model sent is dropped.
const full=makeAgentReport('codex',{agentId:'hermes',reportedAt:'2020-01-01T00:00:00.000Z',status:'working',summary:'Building the installer',role:'Release',tags:['mac','Beta'],
 work:[{title:'Fix the build',url:'https://github.com/example/app/pull/1',state:'checks',since:'2026-10-17T11:30:00Z'}],
 runs:[{id:'beta-4470',title:'Beta 4470',status:'running',url:'https://github.com/example/app/actions/runs/1',startedAt:'2026-10-17T11:40:00Z'}],capacity:{slots:2,busy:1},ttlMinutes:30,observedAt:'2026-10-17T11:59:00Z'},now);
assert.deepEqual(full,{agentId:'codex',status:'working',summary:'Building the installer',role:'release',tags:['mac','beta'],
 work:[{title:'Fix the build',url:'https://github.com/example/app/pull/1',state:'checks',since:'2026-10-17T11:30:00.000Z'}],
 runs:[{id:'beta-4470',title:'Beta 4470',status:'running',url:'https://github.com/example/app/actions/runs/1',startedAt:'2026-10-17T11:40:00.000Z'}],capacity:{slots:2,busy:1},
 ttlMinutes:30,observedAt:'2026-10-17T11:59:00.000Z',reportedAt:now});
// The least a report holds: a status. It lives for the default time.
const idle=makeAgentReport('hermes',{status:'idle'},now);
assert.deepEqual(idle,{agentId:'hermes',status:'idle',summary:'',work:[],runs:[],tags:[],ttlMinutes:AGENT_REPORT_LIMITS.ttlDefault,observedAt:now,reportedAt:now});

// Refused, never stored: a bad status, unknown fields, control characters, a credential, a link that is not https, bad
// numbers, too much, duplicates, a time ahead of the host's clock, and a caller that is not an Agent.
refused({});refused({status:'busy'});refused({status:'idle',color:'red'});refused({status:'idle',work:[{title:'a',owner:'b'}]});
refused({status:'idle',summary:'two\nlines'},REPORT_REASONS.control);refused({status:'idle',summary:'a‮b'},REPORT_REASONS.control);
refused({status:'idle',summary:'token ghp_'+'a'.repeat(36)},REPORT_REASONS.secret);
refused({status:'idle',work:[{title:'a',url:'http://example.com'}]},REPORT_REASONS.link);refused({status:'idle',work:[{title:'a',url:'https://user:pw@example.com'}]},REPORT_REASONS.link);
refused({status:'idle',ttlMinutes:0});refused({status:'idle',ttlMinutes:1441});refused({status:'idle',ttlMinutes:1.5});
refused({status:'idle',capacity:{slots:0,busy:0}},REPORT_REASONS.capacity);refused({status:'idle',capacity:{slots:2,busy:3}},REPORT_REASONS.capacity);
refused({status:'idle',summary:'x'.repeat(AGENT_REPORT_LIMITS.summary+1)});
refused({status:'idle',work:Array.from({length:AGENT_REPORT_LIMITS.work+1},(_,i)=>({title:'w'+i}))});
refused({status:'idle',tags:['a','A']});refused({status:'idle',runs:[{id:'r',title:'a',status:'passed'},{id:'r',title:'b',status:'failed'}]});
refused({status:'idle',runs:[{id:'r',title:'a',status:'green'}]});refused({status:'idle',runs:[{id:'../r',title:'a',status:'passed'}]});
refused({status:'idle',observedAt:later(AGENT_REPORT_LIMITS.aheadMinutes+1)});refused({status:'idle',observedAt:'yesterday'});
assert.equal(makeAgentReport('codex',{status:'idle',observedAt:later(AGENT_REPORT_LIMITS.aheadMinutes)},now).reportedAt,now,'a little clock drift is fine');
assert.throws(()=>makeAgentReport('Not An Id',{status:'idle'},now),{message:REPORT_REASONS.invalid});

// Liveness: live within its time to live, stale for four more of them, then offline; offline at once when it said so.
assert.equal(agentLiveness(full,later(29)),'live');
assert.equal(agentLiveness(full,later(30)),'stale');
assert.equal(agentLiveness(full,later(30*5-1)),'stale');
assert.equal(agentLiveness(full,later(30*5)),'offline');
assert.equal(agentLiveness(makeAgentReport('codex',{status:'offline'},now),now),'offline');
assert.equal(agentLiveness(null,now),'offline');

// agents/list: every Agent not revoked, newest report first and those with none last, filtered by ids or liveness.
const identities:AgentIdentity[]=[
 {id:'hermes',name:'Hermes Agent',harness:'hermes',kind:'local',createdAt:'2026-10-01T00:00:00.000Z'},
 {id:'codex',name:'Codex',harness:'codex',kind:'local',createdAt:'2026-10-01T00:00:00.000Z'},
 {id:'claude-code',name:'Claude Code',harness:'claude-code',kind:'remote',createdAt:'2026-10-01T00:00:00.000Z'},
 {id:'gone',name:'Gone',harness:'pi',kind:'local',createdAt:'2026-10-01T00:00:00.000Z',revokedAt:'2026-10-02T00:00:00.000Z'},
];
const older=makeAgentReport('hermes',{status:'idle'},later(-20)),revokedReport=makeAgentReport('gone',{status:'working'},now);
const listed=listAgents(identities,[older,full,revokedReport],{},now);
assert.deepEqual(listed.map(entry=>[entry.id,entry.liveness]),[['codex','live'],['hermes','stale'],['claude-code','offline']]);
assert.deepEqual(listed[0],{id:'codex',name:'Codex',harness:'codex',kind:'local',liveness:'live',report:full});
assert.ok(!('report' in listed[2]),'no report yet');
assert.deepEqual(listAgents(identities,[older,full],{liveness:'stale'},now).map(entry=>entry.id),['hermes']);
assert.deepEqual(listAgents(identities,[older,full],{ids:['claude-code','gone']},now).map(entry=>entry.id),['claude-code'],'a revoked Agent is never listed');
assert.throws(()=>listAgents(identities,[],{liveness:'busy'},now),{message:REPORT_REASONS.invalid});
assert.throws(()=>listAgents(identities,[],{agentId:'codex'},now),{message:REPORT_REASONS.invalid});

// A stored report reads back as it was; anything else is dropped.
assert.deepEqual(readStoredReport(JSON.parse(JSON.stringify(full))),full);
assert.equal(readStoredReport({agentId:'codex',status:'idle'}),null);
assert.equal(readStoredReport({...full,status:'busy'}),null);

console.log('PASS agent reports: host-stamped Agent and time, refused input never kept, live then stale then offline, agents/list without revoked Agents.');
