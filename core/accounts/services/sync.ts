// Service collection reuses the shared source-check schedule and failure policy. IO, timers and leases stay in Platform.
import {configureSourceCheck,finishSourceCheck,startSourceCheck} from '../../tasks/index.ts';
import {readStoredServicePreset,servicePresetRead} from './presets.ts';
import type {ServicePreset} from '../../../contracts/service-presets.ts';
import type {ServiceRead,ServiceRecords,ServiceRecord} from '../../../contracts/services.ts';
import type {ServiceSyncJob,ServiceSyncCheckpoint,ServiceSyncSnapshot} from '../../../contracts/service-sync.ts';

export const SERVICE_SYNC_LIMITS=Object.freeze({pages:20,records:1000,characters:2_000_000,pageDelay:5,timeoutMs:240_000});
const object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export const serviceSyncReadKey=(preset:ServicePreset)=>JSON.stringify(servicePresetRead(preset));
/** Pin the exact read and account at configuration time; later edits require another owner decision. */
export function configureServiceSync(previous:ServiceSyncJob|undefined,preset:ServicePreset,binding:string,request:Record<string,unknown>,now:number):ServiceSyncJob {
 if(!readStoredServicePreset(preset)||!binding||binding.length>200||Object.keys(request).some(k=>!['enabled','intervalMinutes'].includes(k)))throw Error('Invalid Service sync configuration.');
 if(typeof request.enabled!=='boolean')throw Error('Choose whether to enable this sync.');
 const check=configureSourceCheck(previous?.check,{...request,provider:preset.id},[preset.id],now);
 return {id:preset.id,provider:preset.provider,preset:structuredClone(preset),binding,revision:(previous?.revision??0)+1,check};
}
export function serviceSyncStart(job:ServiceSyncJob,now:number):ServiceSyncJob {return {...job,check:startSourceCheck(job.check,now)};}
export function serviceSyncFailure(job:ServiceSyncJob,now:number,message:string):ServiceSyncJob {
 return {...job,check:finishSourceCheck(job.check,job.check,'error',now,message)};
}
/** Only normalized reader results enter the ledger, never an arbitrary provider response or error. */
export function serviceSyncPage(request:ServiceRead,value:unknown):ServiceRecords {
 if(!object(value)||value.provider!==request.provider||value.operation!==request.operation||!Array.isArray(value.records)||value.records.length>SERVICE_SYNC_LIMITS.records||typeof value.scope!=='string'||value.scope.length>2000)throw Error('Invalid Service sync page.');
 if(value.cursor!==undefined&&(typeof value.cursor!=='string'||!value.cursor||value.cursor.length>2000||/[\x00-\x1f\x7f]/.test(value.cursor)))throw Error('Invalid Service sync cursor.');
 const records=value.records.map((r:unknown):ServiceRecord=>{
  if(!object(r)||typeof r.id!=='string'||!r.id||r.id.length>500||typeof r.title!=='string'||r.title.length>2000||typeof r.url!=='string'||r.url.length>4000||!object(r.fields)||Object.keys(r.fields).length>100)throw Error('Invalid Service sync record.');
  const fields:ServiceRecord['fields']={};
  for(const [key,val] of Object.entries(r.fields)){
   if(key.length>200||!['string','number','boolean'].includes(typeof val)||typeof val==='number'&&!Number.isFinite(val))throw Error('Invalid Service sync fields.');
   Object.defineProperty(fields,key,{value:val,enumerable:true,writable:true,configurable:true});
  }
  const result:ServiceRecord={id:r.id,title:r.title,url:r.url,fields};
  for(const key of ['updatedAt','text'] as const)if(r[key]!==undefined){if(typeof r[key]!=='string')throw Error('Invalid Service sync text.');result[key]=r[key];}
  if(r.comments!==undefined){
   if(!Array.isArray(r.comments)||r.comments.length>100)throw Error('Invalid Service sync comments.');
   result.comments=r.comments.map((c:unknown)=>{if(!object(c)||typeof c.author!=='string'||typeof c.text!=='string'||c.at!==undefined&&typeof c.at!=='string')throw Error('Invalid Service sync comment.');return {author:c.author,text:c.text,...c.at===undefined?{}:{at:c.at}};});
  }
  return result;
 });
 const page:ServiceRecords={provider:request.provider,operation:request.operation,records,scope:value.scope,...value.cursor?{cursor:value.cursor}:{}};
 if(JSON.stringify(page).length>SERVICE_SYNC_LIMITS.characters)throw Error('Service sync page is too large.');
 return page;
}
/** Advance only after validation. A final page atomically replaces the last good snapshot; no absence means deletion. */
export function finishServiceSyncPage(job:ServiceSyncJob,checkpoint:ServiceSyncCheckpoint|undefined,page:ServiceRecords,now:number):{job:ServiceSyncJob;checkpoint?:ServiceSyncCheckpoint;snapshot?:ServiceSyncSnapshot} {
 const start=checkpoint??{seen:[],pages:0,records:[],startedAt:now};
 if(page.cursor&&(page.cursor===start.cursor||start.seen.includes(page.cursor)))throw Error('Service sync cursor repeated.');
 const records=new Map(start.records.map(row=>[row.id,row]));for(const row of page.records)records.set(row.id,row);
 const next:ServiceSyncCheckpoint={cursor:page.cursor,seen:[...start.seen,...page.cursor?[page.cursor]:[]],pages:start.pages+1,records:[...records.values()],startedAt:start.startedAt};
 if(next.records.length>SERVICE_SYNC_LIMITS.records||JSON.stringify(next).length>SERVICE_SYNC_LIMITS.characters||page.cursor&&next.pages>=SERVICE_SYNC_LIMITS.pages)throw Error('Service sync traversal reached its limit. Narrow the preset.');
 if(page.cursor)return {job:{...job,check:{...job.check,lastStatus:'partial',nextAt:now+SERVICE_SYNC_LIMITS.pageDelay}},checkpoint:next};
 const check=finishSourceCheck(job.check,job.check,'complete',now);check.nextAt=now+Number(check.intervalMinutes)*60;
 return {job:{...job,check},snapshot:{id:job.id,provider:page.provider,operation:page.operation,scope:page.scope,records:next.records,collectedAt:now,startedAt:next.startedAt,pages:next.pages,coverage:'bounded-reader'}};
}
