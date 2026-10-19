// Who may use a connected service (agent/gate/GRANTS.md#settings--connectors): the sentences under its tile in plain
// words (core connectorWhoMayUse), reading on by default for the Agent Fox uses when a Service becomes connected
// (agent-runtime/service-readers.ts serviceReadDefaults) and nothing on a restart, a Grant the person took back staying
// off until the Service is connected anew, nothing for a revoked Agent or before anything was seen, and the Agents the
// tile lists (serviceReaders), against a real Agent access store.
import assert from 'node:assert/strict';
import path from 'node:path';
import {connectorWhoMayUse,plainConnectorText} from '../context/sources/index.ts';
import {serviceGranted} from '../agent/gate/index.ts';
import {createAgentAccess} from '../platform/electron/src/modules/agents/agent-access.ts';
import {serviceReadDefaults,serviceReaders} from '../platform/electron/src/modules/agents/service-readers.ts';
import {WorldLedger} from '../platform/electron/src/store/ledger.ts';
import {withTempDir} from './test-temp.ts';

// The sentences.
const one=connectorWhoMayUse('PostHog',{main:{id:'claude-code',name:'Claude Code',granted:true},others:[{id:'codex',name:'Codex',granted:false},{id:'hermes',name:'Hermes Agent',granted:true}]});
assert.deepEqual(one.main,{id:'claude-code',text:'Fox and Claude Code can look at your PostHog.',on:true});
assert.equal(one.fox,null);
assert.equal(one.changes,'Before anything is changed, Worldlet asks you.');
assert.deepEqual(one.others,{text:'Hermes Agent can look too. Other Agents ask you the first time.',choose:'Choose Agents',
 agents:[{id:'codex',text:'Codex can look at your PostHog',on:false},{id:'hermes',text:'Hermes Agent can look at your PostHog',on:true}]});
const alone=connectorWhoMayUse('GitHub',{main:null,others:[]});
assert.deepEqual([alone.main,alone.fox,alone.others],[null,'Fox can look at your GitHub when you ask.',null]);
assert.equal(connectorWhoMayUse('GitHub',{main:null,others:[{id:'a',name:'A',granted:true},{id:'b',name:'B',granted:true},{id:'c',name:'C',granted:true}]}).others!.text,'A, B and C can look too. Other Agents ask you the first time.');
for(const view of [one,alone])for(const text of [view.main?.text,view.fox,view.changes,view.others?.text,view.others?.choose,...view.others?.agents.map(agent=>agent.text)??[]].filter(Boolean))
 assert.ok(plainConnectorText(String(text)),'plain words: '+text);

await withTempDir('worldlet-readers-',async dir=>{
 const ledger=new WorldLedger(path.join(dir,'world'));
 const secrets=new Map<string,string>();
 const vault={get:(id:string)=>secrets.get(id)??null,set:(id:string,value:string)=>{secrets.set(id,value);},delete:(id:string)=>{secrets.delete(id);},deleteAll:()=>secrets.clear()};
 const root=path.join(dir,'access'),access=createAgentAccess({root,vault,ledger:()=>ledger});
 for(const [id,name] of [['claude-code','Claude Code'],['codex','Codex'],['hermes','Hermes Agent']])access.ensure({id,name,harness:id,kind:'local'});
 let selected:string|null='claude-code',ready=false;
 const reads=(id:string,provider:string)=>serviceGranted(id,access.grants(id),provider,new Date().toISOString());
 const defaults=serviceReadDefaults({root,access:()=>ready?access:null,selected:()=>selected});
 // Before Agent access is ready nothing is seen; the first time, what is connected stays as it is.
 defaults(['github']);
 ready=true;
 defaults(['github']);
 assert.equal(reads('claude-code','github'),false,'a Service connected before this change gets no Grant');
 // Connecting a Service gives the Agent Fox uses its read Grant, and only that Agent.
 defaults(['github','posthog']);
 assert.equal(reads('claude-code','posthog'),true);
 assert.deepEqual([reads('codex','posthog'),reads('hermes','posthog')],[false,false]);
 // The person takes it back: a restart (a new watcher over the same World) gives nothing again.
 assert.ok(access.ungrantService('claude-code','posthog'));
 const restarted=serviceReadDefaults({root,access:()=>access,selected:()=>selected});
 restarted(['github','posthog']);
 assert.equal(reads('claude-code','posthog'),false,'a Grant taken back stays off');
 // Disconnected and connected anew: on again, for the Agent Fox uses now.
 restarted(['github']);selected='codex';restarted(['github','posthog']);
 assert.deepEqual([reads('codex','posthog'),reads('claude-code','posthog')],[true,false]);
 // No Agent in use, or a revoked one: nothing.
 selected=null;restarted(['github','posthog','cloudflare']);
 assert.equal(['claude-code','codex','hermes'].some(id=>reads(id,'cloudflare')),false);
 restarted(['github','posthog']);selected='hermes';access.revoke('hermes');restarted(['github','posthog','cloudflare']);
 assert.equal(reads('hermes','cloudflare'),false,'a revoked Agent gets nothing');
 // The tile's list: the Agent Fox uses and the others not revoked, each with whether it may read.
 assert.deepEqual(serviceReaders(access,'posthog','codex'),{main:{id:'codex',name:'Codex',granted:true},others:[{id:'claude-code',name:'Claude Code',granted:false}]});
 assert.deepEqual(serviceReaders(access,'posthog',null).main,null);
 // The audit says the person's choice, as the checkbox in Agent › Access does.
 assert.ok(ledger.agentAudit('codex',5).some((entry:any)=>entry.target==='posthog'&&entry.action==='grant'));
});
console.log('PASS Who may use a service: plain sentences (Fox and the Agent in use, changes ask first, Choose Agents); connecting gives the Agent Fox uses its read Grant once, nothing on restart, a Grant taken back stays off until connected anew, nothing for no Agent or a revoked one; the tile lists the Agents not revoked');
