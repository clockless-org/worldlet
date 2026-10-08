import assert from 'node:assert/strict';
import {createAgentClient} from '../platform/bridge/agent-client.ts';
// Hermes setup and normal chat share this same public native audio bridge.
(globalThis as any).window=new EventTarget();
let nativeCalls=0;
const hermes=createAgentClient(async(action,body)=>{
 if(action==='agentChat'){
  const receipt=await window.worldletAgentTool(body.id,{id:'music',name:'control_background_music',args:{operation:'play'}});
  assert.equal(receipt.state,'playing');
  return {message:'正在播放。'};
 }
 assert.equal(action,'backgroundMusic');assert.equal(body.operation,'play');nativeCalls++;
 return {ok:true,state:'playing',source:'radio'};
});
await hermes({text:'播放音乐',context:{},execute:async()=>{throw Error('No private-source tools required');}});
assert.equal(nativeCalls,1);
console.log('PASS Agent audio capability, native dispatch and no private-source dependency.');
