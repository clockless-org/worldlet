/** Worldlet Agent Protocol v1. Adapter-native events never cross this boundary. */
import {isFoxForegroundActivity} from './companion-activity.ts';
import type {FoxForegroundActivity} from './companion-activity.ts';
export const AGENT_PROTOCOL_VERSION=1;
export type AgentCapabilities={streaming:boolean;tools:boolean;cancel:boolean;steer:boolean;memory:boolean;sessions:boolean;modelConfiguration?:boolean;routines?:boolean;tracing?:boolean};
export type AgentDescriptor={protocolVersion:1;id:string;name:string;capabilities:AgentCapabilities};
export type AgentTraceKind='tool.requested'|'tool.result'|'model.requested'|'model.result'|'model.interrupted';
export type AgentEvent={type:'trace';kind:AgentTraceKind;payload:Record<string,unknown>}|{type:'delta';text:string}|{type:'response_start'|'steered'|'model_required'}|{type:'status';stage:string}|{type:'progress';name:string;activity?:FoxForegroundActivity}|{type:'tool';id:string;name:string;args:Record<string,unknown>};
export function validateAgentEvent(value:unknown):AgentEvent {
 if(!value||typeof value!=='object')throw Error('Invalid Agent event.');
 const e=value as Record<string,unknown>;
 switch(e.type){
  case 'trace':if(['tool.requested','tool.result','model.requested','model.result','model.interrupted'].includes(String(e.kind))&&e.payload&&typeof e.payload==='object'&&!Array.isArray(e.payload))return {type:'trace',kind:e.kind as AgentTraceKind,payload:e.payload as Record<string,unknown>};break;
  case 'delta':if(typeof e.text==='string')return {type:'delta',text:e.text};break;
  case 'response_start':case 'steered':case 'model_required':return {type:e.type};
  case 'status':if(typeof e.stage==='string')return {type:'status',stage:e.stage};break;
  case 'progress':if(typeof e.name==='string'&&(e.activity===undefined||isFoxForegroundActivity(e.activity)))return {type:'progress',name:e.name,...(e.activity===undefined?{}:{activity:e.activity as FoxForegroundActivity})};break;
  case 'tool':if(typeof e.id==='string'&&typeof e.name==='string'&&e.args&&typeof e.args==='object'&&!Array.isArray(e.args))return {type:'tool',id:e.id,name:e.name,args:e.args as Record<string,unknown>};break;
 }
 throw Error('Unsupported or malformed Agent event: '+String(e.type));
}
export function validateAgentCapabilities(value:unknown):AgentCapabilities {
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Missing Agent capabilities.');
 const result={} as AgentCapabilities;
 for(const key of ['streaming','tools','cancel','steer','memory','sessions'] as const){
  if(typeof value[key]!=='boolean')throw Error('Agent capability must be boolean: '+key);
  result[key]=value[key];
 }
 for(const key of ['modelConfiguration','routines','tracing'] as const){
  if(value[key]!==undefined&&typeof value[key]!=='boolean')throw Error('Agent capability must be boolean: '+key);
  if(value[key]!==undefined)result[key]=value[key] as boolean;
 }
 return result;
}
export function validateAgentDescriptor(value:unknown):AgentDescriptor {
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid Agent descriptor.');
 const d=value as AgentDescriptor;
 if(d.protocolVersion!==AGENT_PROTOCOL_VERSION||typeof d.id!=='string'||!(/^[a-z][a-z0-9-]{0,63}$/).test(d.id)||typeof d.name!=='string'||!d.name.trim()||d.name.length>160)throw Error('Agent adapter requires Worldlet protocol version 1 and a valid identity.');
 return {protocolVersion:1,id:d.id,name:d.name,capabilities:validateAgentCapabilities(d.capabilities)};
}
