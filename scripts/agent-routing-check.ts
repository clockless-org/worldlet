import assert from 'node:assert/strict';
import path from 'node:path';
import {AGENT_NOTE_LIMIT,agentAnswerReason,agentBindingInstructions,agentBindingPlace,answeringAgent,bindAgent,noteAgentPlace,readAgentBindings} from '../core/agent/index.ts';
import {conversationAttentionId,ongoingId} from '../core/ongoing/index.ts';
import {createHarnessAgents} from '../platform/electron/src/modules/fox/harness-agents.ts';
import {AGENT} from '../platform/electron/src/host/services.ts';
import {WorldLedger} from '../platform/electron/src/store/ledger.ts';
import {withTempDir} from './test-temp.ts';

// Several agents routed by channel and instructions per place (core/agent/PORTABILITY.md#which-agent-answers-where):
// the one precedence rule (person > group > Applet > area > the main agent), the bindings and notes the World keeps,
// and the host finding the places an Applet's thread is in, a brought channel conversation's person or group among them.

// The rule ----------------------------------------------------------------------------------------------------------
const agents=[{id:'main',main:true},{id:'ledger'},{id:'scout'},{id:'quill'}];
const person=agentBindingPlace('person','conv-aaaaaaaaaaaa')!,group=agentBindingPlace('group','conv-bbbbbbbbbbbb')!,applet=agentBindingPlace('applet','app-job-cccccccccccc')!,region=agentBindingPlace('region','money')!;
assert.deepEqual([person,group,applet,region],['person:conv-aaaaaaaaaaaa','group:conv-bbbbbbbbbbbb','applet:job-cccccccccccc','region:money']);
assert.equal(agentBindingPlace('applet','gmail'),null,'an Applet is named by its World object');assert.equal(agentBindingPlace('region','Money!'),null);assert.equal(agentBindingPlace('group','../x'),null);
let state=bindAgent(null,'openclaw',region,'quill');
state=bindAgent(state,'openclaw',applet,'scout');state=bindAgent(state,'openclaw',group,'ledger');
const all={person,group,applet,region};
assert.deepEqual(answeringAgent(state,'openclaw',all,agents),{agent:'ledger',main:false,by:'group',place:group,notes:[]},'a group binding beats the Applet and the area');
assert.equal(answeringAgent(bindAgent(state,'openclaw',person,'main'),'openclaw',all,agents).by,'person','a person binds even the main agent over a group');
assert.equal(answeringAgent(bindAgent(state,'openclaw',person,'main'),'openclaw',all,agents).main,true);
assert.equal(answeringAgent(state,'openclaw',{applet,region},agents).agent,'scout','an Applet beats its area');
assert.equal(answeringAgent(state,'openclaw',{region},agents).agent,'quill');
assert.deepEqual(answeringAgent(state,'openclaw',{},agents),{agent:'main',main:true,by:'main',notes:[]},'bound nowhere: the main agent');
assert.equal(answeringAgent(state,'openclaw',all,agents.filter(a=>a.id!=='ledger')).agent,'scout','a bound agent that is gone falls through to the next place');
assert.equal(answeringAgent(state,'hermes',all,agents).by,'main','a binding belongs to its Harness');
assert.throws(()=>bindAgent(state,'openclaw','main','scout'));assert.throws(()=>bindAgent(state,'openclaw',applet,'../x'));
assert.deepEqual(readAgentBindings(bindAgent(bindAgent(state,'openclaw',group,null),'openclaw',applet,null)).choices,{openclaw:{[region]:'quill'}},'unbinding leaves the wider place');
assert.deepEqual(readAgentBindings({version:1,choices:{openclaw:{'applet:gmail':'scout','main':'no','applet:y':'bad id!'},Bad:{'applet:x':'a'}}}),{version:2,choices:{openclaw:{'applet:gmail':'scout'}},notes:{}},'version 1 choices are read');
// Notes: every place the thread is in, widest first, whatever Harness answers.
state=noteAgentPlace(state,region,'Money talk: exact figures.');state=noteAgentPlace(state,group,'  This is the family group.\r\nKeep it light. ');
const answer=answeringAgent(state,'codex',all,[]);
assert.deepEqual(answer.notes,[{scope:'region',text:'Money talk: exact figures.'},{scope:'group',text:'This is the family group.\nKeep it light.'}]);
assert.equal(answer.agent,'','a Harness without agents still has notes');
assert.match(agentBindingInstructions(answer.notes),/^\n\nThe person’s own instructions for where this is said[^\n]*\n- In this area of the World: Money talk: exact figures\.\n- In this group: This is the family group\.\nKeep it light\.$/);
assert.equal(agentBindingInstructions([]),'');
assert.deepEqual(noteAgentPlace(state,region,'').notes,{[group]:'This is the family group.\nKeep it light.'},'an empty note removes it');
assert.throws(()=>noteAgentPlace(state,region,'x'.repeat(AGENT_NOTE_LIMIT+1)),/at most/);
assert.equal(agentAnswerReason('group'),'bound to this group');assert.equal(agentAnswerReason('person'),'bound to this person');assert.equal(agentAnswerReason('applet'),'bound to this Applet');
assert.equal(agentAnswerReason('region','Life'),'bound to the Life area');assert.equal(agentAnswerReason('main'),'your main agent');

// The World ----------------------------------------------------------------------------------------------------------
await withTempDir('worldlet-agent-routing-',async scratch=>{
 const world=new WorldLedger(path.join(scratch,'world'));
 // The shared flag a history read leaves: unknown until listed, kept when a later save does not say.
 world.saveHistoryCursor('openclaw','main:discord:channel:1','1','OpenClaw · Discord · #family');
 assert.equal(world.historyShared('openclaw','OpenClaw · Discord · #family'),null);
 world.saveHistoryCursor('openclaw','main:discord:channel:1','2','OpenClaw · Discord · #family',Date.now(),true);
 world.saveHistoryCursor('openclaw','main:discord:channel:1','3','OpenClaw · Discord · #family');
 assert.equal(world.historyShared('openclaw','OpenClaw · Discord · #family'),true);
 world.saveHistoryCursor('hermes','tg-dm','1','Hermes Agent · Telegram · Ana',Date.now(),false);
 world.saveHistoryCursor('hermes','cli','1','Hermes Agent · Terminal',Date.now(),false);
 // Three kept conversations: a Discord group, a Telegram chat with a person, a terminal session.
 const kept=(source:string,session:string,region:string)=>({id:ongoingId(source,session),source,session,state:'kept',proposedAt:1,decidedAt:2,laterUntil:null,turns:9,userTurns:5,first:'',last:'',region});
 world.saveOngoing([kept('openclaw','OpenClaw · Discord · #family','home'),kept('hermes','Hermes Agent · Telegram · Ana','home'),kept('hermes','Hermes Agent · Terminal','work')]);
 const familyApp='app-'+ongoingId('openclaw','OpenClaw · Discord · #family'),anaApp='app-'+ongoingId('hermes','Hermes Agent · Telegram · Ana'),terminalApp='app-'+ongoingId('hermes','Hermes Agent · Terminal');
 const list=[{id:'main',name:'Claw',main:true},{id:'ledger',name:'Ledger',model:'openai/gpt-5'}];
 const service:any={harness:{id:'openclaw',title:'OpenClaw'},agents:()=>({list:async()=>list}),channelSend:(source:string)=>({route:async(thread:string)=>thread==='cli'?null:{thread,channel:source,where:'Chat'},send:async()=>({})})};
 const host:any={store:{writable:true,state:{onboarding:{regionLayout:{assignments:{'app-gmail':'money'},names:{money:'Accounts'}}}},sampleEnabled:()=>false,ledger:()=>world},diagnostics:{record:(error:unknown)=>{throw error;}},optional:(name:string)=>name===AGENT?service:undefined};
 const chooser=createHarnessAgents(host);
 const turn=(applet:string)=>chooser.forTurn(JSON.stringify(['object:'+applet,'']));
 const scopes=async(applet:string)=>((await chooser.list(applet)).places as any[]).map(p=>p.scope);
 assert.deepEqual(await scopes(familyApp),['group','applet','region'],'a shared channel conversation is a group');
 assert.deepEqual(await scopes(anaApp),['person','applet','region'],'a direct channel chat is a person');
 assert.deepEqual(await scopes(terminalApp),['applet','region'],'a terminal session is neither');
 assert.deepEqual(await scopes('app-gmail'),['applet','region']);
 assert.equal(((await chooser.list('app-gmail')).places as any[])[1].area,'Accounts','the area where the person moved it, by its name');
 assert.deepEqual((await chooser.list(familyApp)).answering,{agent:'main',name:'Claw',by:'main',reason:'your main agent'});
 assert.deepEqual(await chooser.choose(familyApp,'ledger','group','Our family group: be warm.'),{ok:true,chosen:'ledger'});
 assert.deepEqual((await chooser.list(familyApp)).answering,{agent:'ledger',name:'Ledger',by:'group',reason:'bound to this group'});
 assert.equal(world.setting('applet-agents').choices.openclaw['group:'+conversationAttentionId('openclaw','OpenClaw · Discord · #family')],'ledger','kept in world.sqlite');
 const said=await turn(familyApp);
 assert.equal(said.agent,'ledger');assert.match(said.instructions,/In this group: Our family group: be warm\./);
 await chooser.choose(familyApp,'main','applet');
 assert.equal((await turn(familyApp)).agent,'ledger','the group still beats the Applet');
 await chooser.choose('app-gmail','ledger','region');
 assert.deepEqual((await chooser.list('app-gmail')).answering,{agent:'ledger',name:'Ledger',by:'region',reason:'bound to the Accounts area'});
 await chooser.choose('app-gmail',undefined,'region','Figures exact.');
 assert.equal((await turn('app-gmail')).agent,'ledger','notes alone leave the agent bound');
 await assert.rejects(chooser.choose('app-gmail','ledger','group'),/not in that place/);
 await assert.rejects(chooser.choose(familyApp,'nobody','group'),/Choose one of your agents/);
 assert.deepEqual(await turn(JSON.stringify(['overview',''])),{instructions:''},'the main conversation keeps the main agent and no notes');
 // A Harness without the `agents` service: no agent, the notes still go with the turn.
 service.harness={id:'codex',title:'Codex'};
 const codex=await turn('app-gmail');
 assert.equal(codex.agent,undefined);assert.match(codex.instructions,/In this area of the World: Figures exact\./);
 await assert.rejects(chooser.choose('app-gmail','ledger','applet'),/no other agents/);
 assert.deepEqual(await chooser.choose('app-gmail',undefined,'applet','Only the inbox.'),{ok:true,chosen:null});
 host.store.sampleEnabled=()=>true;
 assert.deepEqual(await turn('app-gmail'),{instructions:''},'the practice world binds nothing');
 world.close();
});
console.log('PASS agent routing: person > group > Applet > area > main in one rule, bindings and notes per place in a World, a brought channel conversation’s group or person, notes with any Harness');
