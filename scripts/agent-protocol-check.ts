import assert from 'node:assert/strict';
import {validateAgentEvent,validateAgentDescriptor,validateAgentCapabilities} from '../contracts/agent.ts';
const capabilities={streaming:true,tools:true,cancel:true,steer:false,memory:false,sessions:false};
assert.equal(validateAgentDescriptor({protocolVersion:1,id:'example',name:'Example',capabilities}).id,'example');
assert.throws(()=>validateAgentDescriptor({protocolVersion:2,id:'example',name:'Example',capabilities}));
assert.throws(()=>validateAgentEvent({type:'delta',text:42}));
assert.throws(()=>validateAgentEvent({type:'tool',id:'a',name:'open_applet',args:[]}));
assert.throws(()=>validateAgentEvent({type:'hermes_internal'}));
assert.deepEqual(validateAgentEvent({type:'delta',text:'Hello',requestId:'transport-secret'}),{type:'delta',text:'Hello'});
assert.deepEqual(validateAgentEvent({type:'tool',id:'a',name:'open_applet',args:{id:'app-browser'}}),{type:'tool',id:'a',name:'open_applet',args:{id:'app-browser'}});
console.log('PASS: protocol version, capability declaration, event validation and transport isolation');

// Run the actual UI client against a provider-independent adapter fixture.
const {createAgentClient}=await import('../platform/bridge/agent-client.ts');
// The client listens for Applet tasks and announces Fox's steps on window, as in the app.
(globalThis as any).window=new EventTarget();
let controls=0,turnID='',finish:any;const deltas:string[]=[],requests:string[]=[];
const client=createAgentClient(async(action,body)=>{
 requests.push(action);
 if(action==='agentChat'){
  if(body.text==='play music')assert.deepEqual(body.history,[{role:'user',text:'Earlier in Mail'}]);
  turnID=body.id;
  window.worldletAgentEvent(body.id,{type:'response_start'});
  window.worldletAgentEvent(body.id,{type:'delta',text:'Hello'});
  window.worldletAgentEvent(body.id,{type:'delta',text:' world'});
  const receipt=await window.worldletAgentTool(body.id,{type:'tool',id:'music',name:'control_background_music',args:{operation:'play'}});
  if(body.text==='wait')await new Promise(resolve=>finish=resolve);
  return {message:'Hello world',receipt};
 }
 if(action==='backgroundMusic'){controls++;return {ok:true,state:'playing'};}
 if(action==='agentCancel'){finish?.();return {ok:true};}
 if(action==='agentSteer')return {accepted:true};
 throw Error('Unexpected bridge action: '+action);
});
const result=await client({text:'play music',context:{},history:[{role:'system',text:'discard'},{role:'user',text:'Earlier in Mail'}],execute:async()=>({ok:true}),onDelta:text=>deltas.push(text)});
assert.deepEqual(deltas,['Hello','Hello world']);assert.equal(result.receipt.state,'playing');assert.equal(controls,1);
await client({text:'greeting',context:{},allowActions:false,execute:async()=>({ok:true})});assert.equal(controls,1,'greeting cannot run a tool');
const abort=new AbortController();const pending=client({text:'wait',context:{},signal:abort.signal,execute:async()=>({ok:true})});
while(!finish)await new Promise(r=>setTimeout(r,1));
assert.equal((await client.steer('additional context')).accepted,true);abort.abort();await pending;
assert.ok(requests.includes('agentCancel'));assert.ok(requests.includes('agentSteer'));
assert.match((await window.worldletAgentTool(turnID,{id:'late',name:'control_background_music',args:{operation:'play'}})).error,/no longer active/);
console.log('PASS: neutral streaming, World tool receipts, greeting restriction, steering, cancellation and late-event isolation');

// An Applet task can come before the conversation's first turn (a game review Worldlet starts by itself once
// the person stops playing, #1598): with the World executor handed over at start, its tools run.
{
 let played=0;
 const fresh=createAgentClient(async action=>{if(action==='backgroundMusic'){played++;return {ok:true,state:'playing'};}throw Error('Unexpected bridge action: '+action);});
 const task=(id:string)=>window.dispatchEvent(Object.assign(new Event('worldlet:applet-task'),{detail:{id,applet:'app-pokemon-showdown',status:'started',request:'Review the battles I just played.',trust:{untrusted:true,sources:['browse_web']}}}));
 task('task-before-world');
 assert.match((await window.worldletAgentTool('task-before-world',{id:'t',name:'control_background_music',args:{operation:'play'}})).error,/no longer active/,'without a World executor a task cannot run tools');
 fresh.useWorld({execute:async()=>({ok:true}),codex:null});
 task('task-review');
 assert.equal((await window.worldletAgentTool('task-review',{id:'t',name:'control_background_music',args:{operation:'play'}})).state,'playing');
 assert.equal(played,1);
 console.log('PASS: an Applet task started before any conversation turn runs its tools');
}

assert.deepEqual(validateAgentCapabilities(capabilities),capabilities);
assert.equal(validateAgentCapabilities({...capabilities,routines:true,modelConfiguration:true}).routines,true);
for(const value of [null,1,'true',{},[]])assert.throws(()=>validateAgentCapabilities({...capabilities,routines:value}));
console.log('PASS optional Harness capabilities are absent-by-default and strictly boolean');

// Shared untrusted-turn rule.
const {readsUntrusted,observeTool,writeDecision,persists}=await import('../core/agent/index.ts');
for(const [name,args,expected] of [['memory',{},false],['web_search',{},true],['mcp_any_tool',{},true],['call_world_tool',{target:'settings',action:'open'},false],['call_world_tool',{target:'content',action:'read'},true]] as const)assert.equal(readsUntrusted(name,args),expected,name);
const trusted={untrustedSource:null},tainted=observeTool(trusted,'web_extract');
assert.deepEqual(writeDecision(observeTool(trusted,'memory'),true),{allowed:true});
assert.equal(writeDecision(tainted,true).allowed,false);
assert.deepEqual(writeDecision(tainted,false),{allowed:true});
assert.deepEqual(['memory','skill_manage','skill_view','skills_list','web_extract'].map(persists),[true,true,false,false,false]);
assert.equal(writeDecision(tainted,persists('memory')).allowed,false);
console.log('PASS untrusted-turn rule: fail-closed taint, automatic write denial including memory and skills, read-only tools unaffected');
