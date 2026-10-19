// Service collection reuses the shared source-check schedule and failure policy. IO, timers and leases stay in Platform.
import {configureSourceCheck,finishSourceCheck,startSourceCheck} from '../../agent/tasks/index.ts';
import {readStoredServicePreset,servicePresetRead} from '../accounts/index.ts';
import type {ServicePreset} from '../../contracts/service-presets.ts';
import type {ServiceRead,ServiceRecords,ServiceRecord} from '../../contracts/services.ts';
import type {ServiceSyncJob,ServiceSyncCheckpoint,ServiceSyncSnapshot} from '../../contracts/service-sync.ts';

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

// Sync on by default (context/applets/INTEGRATIONS.md#scheduled-service-collection): once a Service is connected, the World
// keeps one bounded read of it fresh on its own, so Agents find its context in the World without asking the Service
// each time. The person turns it off on the Service's tile; off stays off, and a reconnect keeps their choice.

/** How often a default sync runs, in minutes. */
export const SERVICE_SYNC_DEFAULT_MINUTES=60;
/** The read each Service keeps fresh by default: what is waiting for the person on GitHub, PostHog's loudest errors,
 * Cloudflare's Workers, the sites Search Console can see. Notion has none: its pages are chosen one by one. */
export const SERVICE_SYNC_DEFAULTS:Readonly<Record<string,{name:string;read:{operation:ServiceRead['operation'];id?:string}}>>=Object.freeze({
 github:{name:'GitHub: waiting for you',read:{operation:'list'}},
 posthog:{name:'PostHog: errors',read:{operation:'read',id:'errors'}},
 cloudflare:{name:'Cloudflare: Workers',read:{operation:'read',id:'workers'}},
 'search-console':{name:'Search Console: sites',read:{operation:'list'}},
});
/** The default sync's preset ID for a Service (`github-updates`). */
export const serviceSyncDefaultId=(provider:string)=>`${provider}-updates`;
/** The preset a default sync reads, as saved. */
export function serviceSyncDefaultPreset(provider:string,at:string):ServicePreset|null {
 const read=SERVICE_SYNC_DEFAULTS[provider];
 return read?{id:serviceSyncDefaultId(provider),name:read.name,provider,read:{...read.read},note:'Kept up to date while the Service is connected.',createdAt:at,updatedAt:at}:null;
}
/** What to do about a connected Service's default sync: start it (never set up), bind it again (on, but made with an
 * earlier connection), or nothing (on and current, or the person turned it off). */
export function serviceSyncDefaultStep(job:ServiceSyncJob|null|undefined,binding:string):'start'|'rebind'|'none' {
 if(!job)return 'start';
 if(job.check?.enabled!==true)return 'none';
 return job.binding===binding?'none':'rebind';
}
/** The tile's line about it, in plain words: "Updated 5 minutes ago", "Updating…", "Not updated yet", "Could not update
 * just now. It tries again soon.", or "Not kept up to date" when off. `now` in seconds. */
export function serviceSyncLine(job:{check:Record<string,any>;snapshotAt?:number|null}|null|undefined,now:number):string {
 if(!job||job.check?.enabled!==true)return 'Not kept up to date.';
 if(job.check.lastStatus==='running'||job.check.lastStatus==='partial')return 'Updating…';
 const at=typeof job.snapshotAt==='number'?job.snapshotAt:null;
 if(job.check.lastStatus==='error')return at?`Could not update just now; last updated ${ago(now-at)}. It tries again soon.`:'Could not update just now. It tries again soon.';
 return at?`Updated ${ago(now-at)}.`:'Not updated yet.';
}
function ago(seconds:number):string {
 const minutes=Math.max(0,Math.floor(seconds/60));
 if(minutes<1)return 'just now';
 if(minutes<60)return `${minutes} minute${minutes===1?'':'s'} ago`;
 const hours=Math.floor(minutes/60);
 if(hours<24)return `${hours} hour${hours===1?'':'s'} ago`;
 const days=Math.floor(hours/24);
 return `${days} day${days===1?'':'s'} ago`;
}
