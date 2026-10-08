import assert from 'node:assert/strict';
import {FOX_FOREGROUND_ACTIVITIES} from '../contracts/companion-activity.ts';
import {validateAgentEvent} from '../contracts/agent.ts';
import {toolAnimationActivity,stageAnimationActivity} from '../core/companion/companion-activity.ts';
import {activityPose,activityPresentation,mountCompanionLife} from '../ui/companion/companion-life.ts';
import {createWorldToolRuntime} from '../platform/bridge/world-tool-runtime.ts';
import {createAgentClient} from '../platform/bridge/agent-client.ts';
for(const activity of FOX_FOREGROUND_ACTIVITIES){
 assert.equal((validateAgentEvent({type:'progress',name:'external_tool',activity}) as any).activity,activity);
 for(const text of ['Reading','Not reading','正在写','検索しています',''])assert.equal(activityPose('working',text,{activity,source:'tool'}),activity);
 for(const state of ['idle','listening','talking','writing','preparing','transcribing'])assert.equal(activityPose(state,'',{activity,source:'tool'}),state,'Foreground input priority');
}
for(const activity of ['succeeded','urgent','sleeping','unknown',null,{},32])assert.throws(()=>validateAgentEvent({type:'progress',name:'x',activity}));
// Windows validates phases through Core harnessReceive (#454), so validateAgentEvent above covers both hosts.
assert.deepEqual(validateAgentEvent({type:'progress',name:'read_content'}),{type:'progress',name:'read_content'});
assert.equal(activityPose('working','Searching the universe'),'working');
assert.equal(toolAnimationActivity('find_content'),'searching');assert.equal(toolAnimationActivity('read_world_source'),'reading');
assert.equal(toolAnimationActivity('prepare_email'),'drafting');assert.equal(toolAnimationActivity('delete_content'),'organizing');
assert.equal(toolAnimationActivity('browse_web',{operation:'read'}),'reading');assert.equal(toolAnimationActivity('unknown_search_in_name'),'working');
assert.equal(stageAnimationActivity('waiting'),'awaiting_service');
assert.equal(activityPresentation('calculating'),'working');assert.equal(activityPresentation('awaiting_service'),'listening');
for(const activity of ['awaiting_user','awaiting_service'])assert.equal(activityPresentation(activity,true),activity,'Authored waits must not collapse to listening');
for(const task of ['comparing','planning','drafting','calculating','organizing','creating','checking'])assert.equal(activityPresentation(task,true),task,'Authored task must retain its own performance');
const avatar={dataset:{}} as HTMLElement,life=mountCompanionLife(null,null,avatar);
life.update({state:'working',signal:{activity:'comparing',source:'tool'}});assert.equal(avatar.dataset.semanticState,'comparing');assert.equal(avatar.dataset.activity,'working');
life.update({state:'idle',signal:{activity:'reading',source:'tool'}});assert.equal(avatar.dataset.activity,'idle');
(globalThis as any).__WORLDLET_ENV_ASSETS__={companionAnatomy:{}};
for(const activity of ['awaiting_user','awaiting_service','comparing','planning','drafting','calculating','organizing','creating','checking'] as const){
 life.update({state:'working',signal:{activity,source:'stage'}});
 assert.equal(avatar.dataset.activity,activity);assert.equal(avatar.dataset.semanticState,activity);
 life.update({state:'listening',signal:{activity,source:'stage'}});assert.equal(avatar.dataset.activity,'listening','Microphone retains priority');
}
delete (globalThis as any).__WORLDLET_ENV_ASSETS__;
let dispatched=0;const resolved:string[]=[];
const runtime=createWorldToolRuntime({sample:true,execute:async()=>{dispatched++;return {ok:true};},onToolStart:(name,args)=>resolved.push(toolAnimationActivity(name,args))});
await runtime.gateway('call_world_tool',{target:'content',action:'read',arguments:JSON.stringify({id:'note-1'})},'read-1');
assert.deepEqual(resolved,['reading']);assert.equal(dispatched,1);
await runtime.callTool('read_content_page',{id:'note-1',offset:0},'read-1');assert.equal(dispatched,1,'Replay does not fabricate another activity');
await runtime.callTool('read_content_page',{id:42},'invalid');assert.deepEqual(resolved,['reading']);
const denied=createWorldToolRuntime({sample:true,allowActions:false,execute:async()=>{throw Error('must not execute');},onToolStart:()=>resolved.push('invalid')});
await denied.callTool('read_content_page',{id:'note-1',offset:0},'denied');assert.deepEqual(resolved,['reading']);
(globalThis as any).window=new EventTarget();const signals:any[]=[];let turn='';
const client=createAgentClient(async(action,body)=>{
 if(action==='agentChat'){
  turn=body.id;window.worldletAgentEvent(turn,{type:'status',stage:'waiting'});
  window.worldletAgentEvent(turn,{type:'progress',name:'external_compute',activity:'calculating'});
  window.worldletAgentEvent(turn,{type:'progress',name:'read_content_page'});
  await window.worldletAgentTool(turn,{id:'read-2',name:'read_content_page',args:{id:'note-1',offset:0}});
  return {message:'Fixture response'};
 }
 return {ok:true};
},{sample:true});
await client({text:'Fixture only',context:{},execute:async()=>({ok:true}),onStatus:(_text,_kind,signal)=>signals.push(signal)});
assert.deepEqual(signals.map(s=>s.activity),['awaiting_service','calculating','reading','reading']);
const count=signals.length;window.worldletAgentEvent(turn,{type:'progress',name:'find_content'});assert.equal(signals.length,count,'Late activity ignored');
console.log('PASS typed foreground phases across protocol, exact tool dispatch, neutral Harness client, prose independence, input priority, replay/permission boundaries, presentation fallback and late-event isolation.');
