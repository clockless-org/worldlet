import {validateAgentCapabilities,validateAgentEvent,AGENT_PROTOCOL_VERSION} from '../../contracts/agent.ts';
import type {HarnessHello,HarnessTurn,HarnessDelivery} from '../../contracts/harness.ts';
function object(value:unknown):Record<string,any>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid Harness protocol object.');
 return value as Record<string,any>;
}
// Kept ES-compatible for both JavaScriptCore and Jint; no TextEncoder dependency.
function bytes(value:string){return encodeURIComponent(value).replace(/%[A-F\d]{2}/g,'x').length;}
export function harnessHandshake(input:{hello:unknown;expectedId:string;action:string}):HarnessHello {
 const h=object(input.hello);
 if(h.type!=='hello'||h.protocolVersion!==AGENT_PROTOCOL_VERSION||typeof h.id!=='string'||!(/^[a-z][a-z0-9-]{0,63}$/).test(h.id)||h.id!==input.expectedId)throw Error('Agent protocol or capability handshake failed.');
 const capabilities=validateAgentCapabilities(h.capabilities);
 if(capabilities.steer)throw Error('Executable protocol v1 does not support steering; advertise steer=false.');
 if(['modelConfigure','configure','modelCatalog','modelRepair','modelAdopt'].includes(input.action)&&!capabilities.modelConfiguration)throw Error('This Harness does not support model configuration in Worldlet.');
 if(input.action==='modelLogin')throw Error('Sign in using the selected Harness; executable protocol v1 does not expose browser login.');
 if(input.action==='routine_tick'&&!capabilities.routines)throw Error('This Harness does not support scheduled execution.');
 return {type:'hello',protocolVersion:1,id:h.id,capabilities};
}
/** Official Hermes adapter's private frames, delivered raw to the native integration that owns them. */
export const HERMES_HOST_EVENTS=['google_auth','model_auth','applet'] as const;
/**
 * Pure reducer: host owns cancellation/IO; only accepted deliveries reach callers.
 * `hermes` opts a resident Hermes session into its private host events; `retired`
 * lists earlier turns of the same process whose late frames are discarded.
 */
export function harnessReceive(input:{state:HarnessTurn;frame:unknown;hermes?:boolean;retired?:string[]}):HarnessDelivery {
 const {state}=input,f=object(input.frame);
 if(state.finished)throw Error('Agent turn is already complete.');
 if(typeof f.requestId==='string'&&f.requestId!==state.requestId&&input.retired?.includes(f.requestId))return {state,kind:'stale'};
 if(!state.requestId||f.requestId!==state.requestId)throw Error('Agent returned an event for an unknown turn.');
 if(input.hermes&&(HERMES_HOST_EVENTS as readonly string[]).includes(f.type))return {state,kind:'host',frame:f};
 if(f.type==='steer_result'){
  if(!state.capabilities.steer||typeof f.controlId!=='string'||!f.controlId||typeof f.accepted!=='boolean')throw Error('Unexpected Agent steering acknowledgement.');
  return {state,kind:'steer',controlId:f.controlId,accepted:f.accepted};
 }
 if(f.type==='error'){
  if(typeof f.message!=='string'||!f.message.trim()||bytes(f.message)>128_000)throw Error('Invalid Agent error.');
  return {state:{...state,finished:true},kind:'error',message:f.message};
 }
 if(f.type==='result'){
  const value={...object(f.value)};
  if(state.action==='chat'&&(typeof value.message!=='string'||!value.message.trim()||bytes(value.message)>128_000))throw Error('Agent returned an invalid final reply.');
  if(state.action==='status')value.capabilities=validateAgentCapabilities(state.capabilities);
  return {state:{...state,finished:true},kind:'result',value};
 }
 const event=validateAgentEvent(f);
 if(event.type==='trace'&&!state.capabilities.tracing)throw Error('Harness emitted traces without advertising tracing support.');
 if(['delta','response_start'].includes(event.type)&&!state.capabilities.streaming)throw Error('Agent emitted streaming events without declaring streaming support.');
 if(event.type==='steered'&&!state.capabilities.steer)throw Error('Unexpected Agent steering event.');
 if(event.type==='tool'){
  if(!state.capabilities.tools||!event.id||event.id.length>160||state.toolIDs.includes(event.id))throw Error('Undeclared or duplicate Agent tool request.');
  return {state:{...state,toolIDs:[...state.toolIDs,event.id]},kind:'event',event};
 }
 return {state,kind:'event',event};
}
