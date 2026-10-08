// The `models` Harness service (contracts/harness-services.ts HarnessModels): the models the person's own Agent can
// answer with, and which one answers in an Applet's thread (a cheaper one for an Applet that does not need the best).
// Only switches the Agents really have: Hermes Agent's ACP `session/set_model` with an id its `session/new` listed
// (`models.availableModels`, "provider:model", acp_adapter/server.py 0.21.3), and OpenClaw's `x-openclaw-model` header
// on `/v1/responses` (its `model` field names an agent, docs gateway/openai-http-api "Agent-first model contract",
// 2026.9.8) with a model its openclaw.json names. Shared rules only; the host asks the Agent. Kept ES-compatible for
// JavaScriptCore and Jint.
import type {HarnessModel} from '../../contracts/harness-services.ts';
import {appletAgentThread} from './harness-agents.ts';
import {harnessSessionThread} from './harness-sessions.ts';

const record=(value:unknown):Record<string,any>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,any>:{};
/** A model id as an Agent names it ("openrouter:anthropic/claude-haiku-4.5", "openai/gpt-5.4-mini"). */
export const isHarnessModelId=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:@/+-]{0,199}$/.test(value);

/** ACP `session/new` / `session/load` result `models` (SessionModelState): each model and the current one. */
export function acpModels(result:unknown):HarnessModel[] {
 const state=record(record(result).models),current=state.currentModelId;
 const listed=Array.isArray(state.availableModels)?state.availableModels.map(record):[];
 const out:HarnessModel[]=[];
 for(const item of listed){
  if(!isHarnessModelId(item.modelId)||out.some(model=>model.id===item.modelId))continue;
  out.push({id:item.modelId,name:typeof item.name==='string'&&item.name.trim()?item.name.trim().slice(0,120):item.modelId,...item.modelId===current?{current:true}:{}});
  if(out.length>=60)break;
 }
 return out;
}
/** OpenClaw: the models its openclaw.json names for an agent (its own `model`, else the defaults'): primary first,
 * then fallbacks, the utility model and the `agents.defaults.models` catalog (with their aliases). */
export function openClawModels(config:unknown,agent?:string):HarnessModel[] {
 const agents=record(record(config).agents),defaults=record(agents.defaults),catalog=record(defaults.models);
 const own=agent?record(record(agents.entries)[agent]??(Array.isArray(agents.list)?agents.list.map(record).find(entry=>entry.id===agent):undefined)):{};
 const slot=(value:unknown)=>typeof value==='string'?{primary:value,fallbacks:[]}:{primary:record(value).primary,fallbacks:Array.isArray(record(value).fallbacks)?record(value).fallbacks:[]};
 const chosen=own.model!==undefined?slot(own.model):slot(defaults.model);
 const ids=[chosen.primary,...chosen.fallbacks,defaults.utilityModel,...Object.keys(catalog),...Object.keys(record(own.models))];
 const out:HarnessModel[]=[];
 for(const id of ids){
  if(!isHarnessModelId(id)||out.some(model=>model.id===id))continue;
  const alias=record(catalog[id]).alias;
  out.push({id,name:typeof alias==='string'&&alias.trim()?`${alias.trim().slice(0,40)} (${id})`:id,...id===chosen.primary?{current:true}:{}});
  if(out.length>=60)break;
 }
 return out;
}

// Which model answers in an Applet's thread --------------------------------------------------------------------------

/** Per Harness, the model chosen for a Fox thread (`applet:<id>`); a thread with no choice uses the Agent's own. */
export type AppletModels={version:1;choices:Record<string,Record<string,string>>};
const HARNESS_ID=/^[a-z][a-z0-9-]{0,63}$/;
export function readAppletModels(value:unknown):AppletModels {
 const choices:AppletModels['choices']={};
 for(const [harness,threads] of Object.entries(record(record(value).choices))){
  if(!HARNESS_ID.test(harness))continue;
  const kept:Record<string,string>={};
  for(const [thread,model] of Object.entries(record(threads)))if(thread.startsWith('applet:')&&thread.length<=130&&isHarnessModelId(model))kept[thread]=model;
  if(Object.keys(kept).length)choices[harness]=kept;
 }
 return {version:1,choices};
}
/** The choice for `applet`; `model` null returns the thread to the Agent's own model. */
export function chooseAppletModel(state:unknown,harness:string,applet:string,model:string|null):AppletModels {
 const next=readAppletModels(state),thread=appletAgentThread(applet);
 if(!thread||!HARNESS_ID.test(harness))throw Error('Choose an Applet.');
 if(model!==null&&!isHarnessModelId(model))throw Error('Choose one of your Agent’s models.');
 const threads={...next.choices[harness]};
 if(model)threads[thread]=model;else delete threads[thread];
 if(Object.keys(threads).length)next.choices[harness]=threads;else delete next.choices[harness];
 return next;
}
/** The model chosen for the thread a turn is said in (the chat's place thread) while the Agent still lists it;
 * otherwise undefined, and the Agent's own answers. */
export function appletModelFor(state:unknown,harness:string,thread:unknown,models:HarnessModel[]):string|undefined {
 const chosen=readAppletModels(state).choices[harness]?.[harnessSessionThread(thread)];
 return chosen&&models.some(model=>model.id===chosen)?chosen:undefined;
}
