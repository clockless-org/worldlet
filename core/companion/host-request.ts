import type {FoxHostRequest,FoxHostAction} from '../../contracts/fox.ts';
import {utf8Length} from './companion-text.ts';
/** Reject malformed requests identically in Mac, Windows and shared UI.
 * Client scope/history never authorizes private access; hosts resolve their own scope. */
export function readFoxHostRequest(input:unknown):FoxHostRequest {
 const fail=()=>{throw Error('Invalid Fox request.');};
 if(!input||typeof input!=='object'||Array.isArray(input))return fail();
 const r=input as Record<string,unknown>;
 const aliases={hermesChat:'agentChat',hermesSteer:'agentSteer',hermesCancel:'agentCancel'};
 const action=(aliases[r.action as string]??r.action) as FoxHostAction;
 if(!['agentChat','agentSteer','agentCancel'].includes(action))return fail();
 const allowed=action==='agentChat'?['action','id','text','context','thread','history','sample','allowActions','shown','background']:action==='agentSteer'?['action','id','text']:['action','id'];
 if(Object.keys(r).some(k=>!allowed.includes(k)))return fail();
 const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
 if(action==='agentCancel'){
  if(r.id!==undefined&&!uuid(r.id))return fail();
  return {action,...r.id!==undefined?{id:r.id as string}:{}};
 }
 if(!uuid(r.id)||typeof r.text!=='string'||!r.text.trim()||utf8Length(r.text)>32000)return fail();
 if(action==='agentSteer')return {action,id:r.id as string,text:r.text};
 for(const key of ['sample','allowActions','background'])if(r[key]!==undefined&&typeof r[key]!=='boolean')return fail();
 // The place and view the turn was asked in; the host keeps it with the turn (at most 1100 characters).
 if(r.thread!==undefined&&typeof r.thread!=='string')return fail();
 if(r.shown!==undefined&&(typeof r.shown!=='string'||!r.shown.trim()||r.shown.length>200))return fail();
 if(r.context!==undefined&&(!r.context||typeof r.context!=='object'||Array.isArray(r.context)))return fail();
 if(r.history!==undefined&&(!Array.isArray(r.history)||r.history.length>6||r.history.some(v=>!v||typeof v!=='object'||!['user','assistant'].includes(v.role)||typeof v.text!=='string'||v.text.length>2000||Object.keys(v).some(k=>!['role','text'].includes(k)))))return fail();
 return {...r,action,...typeof r.thread==='string'?{thread:r.thread.slice(0,1100)}:{}} as FoxHostRequest;
}
