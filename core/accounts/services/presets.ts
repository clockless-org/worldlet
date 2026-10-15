// Service presets (contracts/service-presets.ts, core/applets/INTEGRATIONS.md#service-presets): named, saved reads of a
// Worldlet Service. Pure: hosts supply the stored presets and the clock, and save what comes back. Each read is checked
// as its Service's reader would check it before anything is sent (a HogQL SELECT only, a GitHub search of up to 256
// characters, one of Cloudflare's fixed reports), so a preset that saves is one that may run. Every refusal throws an
// Error whose message the person or the Agent is shown.
import {SERVICE_ACTIONS,SERVICE_PROVIDERS,SERVICE_TITLES,type ServiceOperation,type ServiceRead} from '../../../contracts/services.ts';
import {SERVICE_PRESET_LIMITS,type ServicePreset,type ServicePresetRead,type ServicePresetSave} from '../../../contracts/service-presets.ts';
import {looksSecret} from '../../agent/index.ts';
import {hogqlSelect,POSTHOG_LIMITS,POSTHOG_LISTS} from './posthog.ts';
import {CLOUDFLARE_READS} from './cloudflare.ts';
import {GITHUB_LIMITS,githubRecordId} from '../mcp/github.ts';

export const PRESET_REASONS=Object.freeze({
 invalid:'This preset is not valid.',
 id:`Name the preset's ID with lowercase letters, digits and -, at most ${SERVICE_PRESET_LIMITS.id}.`,
 name:`Give the preset a name of up to ${SERVICE_PRESET_LIMITS.name} characters on one line.`,
 service:`A preset reads one Worldlet Service: ${SERVICE_PROVIDERS.join(', ')}.`,
 secret:'Presets may not hold passwords, tokens or keys: the Service\'s key stays in its connection.',
 control:'Presets may not hold control characters.',
 full:`This World already keeps ${SERVICE_PRESET_LIMITS.presets} presets. Delete one first.`,
 missing:'No such preset.',
});

/** A preset ID: chosen by whoever saves it, file-name safe. */
export const SERVICE_PRESET_ID=new RegExp(`^[a-z0-9][a-z0-9-]{0,${SERVICE_PRESET_LIMITS.id-1}}$`);
// C0 and C1 controls, DEL, and the bidirectional overrides that make text read differently from what it holds.
const CONTROL=/[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/;
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const instant=(value:unknown):value is string=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const fail=(reason:string):never=>{throw new Error(reason);};
const only=(value:Record<string,unknown>,keys:string[])=>{for(const key of Object.keys(value))if(!keys.includes(key))fail(PRESET_REASONS.invalid);};
const absent=(value:unknown)=>value===undefined||value===null||value==='';

/** One line of text: no control characters, nothing that looks like a credential, at most `limit` characters. */
function line(value:unknown,limit:number,reason:string,required=true):string {
 if(absent(value)){if(required)fail(reason);return '';}
 if(typeof value!=='string')return fail(reason);
 if(CONTROL.test(value))fail(PRESET_REASONS.control);
 const clean=value.trim();
 if(required&&!clean||[...clean].length>limit)fail(reason);
 if(looksSecret(clean))fail(PRESET_REASONS.secret);
 return clean;
}
/** A Service reader's own check; its plain message is the refusal. */
function checked<T>(work:()=>T):T {
 try{return work();}catch(error){return fail(error instanceof Error&&error.message?error.message:PRESET_REASONS.invalid);}
}

/** The read a preset makes, checked as the Service's reader checks it: one of the Service's operations, with exactly the
 * arguments it takes. A query may run over several lines (HogQL); nothing may look like a credential. */
export function readServicePresetRead(provider:unknown,input:unknown):ServicePresetRead {
 if(typeof provider!=='string'||!SERVICE_PROVIDERS.includes(provider))return fail(PRESET_REASONS.service);
 const value=record(input);only(value,['operation','id','query']);
 const operations=SERVICE_ACTIONS[provider];
 const operation=value.operation;
 if(typeof operation!=='string'||!Object.hasOwn(operations,operation))return fail(`${SERVICE_TITLES[provider]} presets read with ${Object.keys(operations).join(' or ')}.`);
 for(const key of ['id','query'])if(!absent(value[key])&&(typeof value[key]!=='string'||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f‪-‮⁦-⁩]/.test(value[key] as string)))fail(PRESET_REASONS.control);
 for(const key of ['id','query'])if(typeof value[key]==='string'&&looksSecret(value[key] as string))fail(PRESET_REASONS.secret);
 const read:ServicePresetRead={operation:operation as ServiceOperation};
 const id=absent(value.id)?'':String(value.id).trim(),query=absent(value.query)?'':String(value.query).trim();
 const takes=(ids:boolean,queries:boolean)=>{
  if(id&&!ids||query&&!queries)fail(`${SERVICE_TITLES[provider]}'s ${operation} takes ${[ids&&'an id',queries&&'a query'].filter(Boolean).join(' and ')||'nothing else'}.`);
 };
 if(provider==='github'){
  if(operation==='list')takes(false,false);
  if(operation==='read'){takes(true,false);const parsed=checked(()=>githubRecordId(id));read.id=`${parsed.owner}/${parsed.repo}#${parsed.number}`;}
  if(operation==='search'){
   takes(false,true);
   if(!query||[...query].length>GITHUB_LIMITS.query||/[\r\n\t]/.test(query))fail(`Search GitHub with one line of up to ${GITHUB_LIMITS.query} characters.`);
   read.query=query;
  }
 }else if(provider==='posthog'){
  if(operation==='query'){takes(false,true);read.query=checked(()=>hogqlSelect(query));}
  if(operation==='read'){
   takes(true,true);
   if(!POSTHOG_LISTS.includes(id))fail(`Read one PostHog list: ${POSTHOG_LISTS.join(', ')}.`);
   if([...query].length>POSTHOG_LIMITS.search||/[\r\n\t]/.test(query))fail(`Filter a PostHog list by a name of up to ${POSTHOG_LIMITS.search} characters.`);
   read.id=id;if(query)read.query=query;
  }
 }else if(provider==='cloudflare'){
  takes(true,false);
  if(!CLOUDFLARE_READS.includes(id))fail(`Read one of Cloudflare's reports: ${CLOUDFLARE_READS.join(' or ')}.`);
  read.id=id;
 }else{
  // A Service added to SERVICE_ACTIONS without rules here is refused until it has them.
  fail(PRESET_REASONS.service);
 }
 for(const required of operations[operation as ServiceOperation]??[])if(!read[required as 'id'|'query'])fail(PRESET_REASONS.invalid);
 return read;
}

/** A preset to save, checked. */
export function readServicePresetSave(input:unknown):ServicePresetSave {
 const value=record(input);only(value,['id','name','provider','read','note']);
 if(typeof value.id!=='string'||!SERVICE_PRESET_ID.test(value.id))fail(PRESET_REASONS.id);
 const save:ServicePresetSave={id:value.id as string,name:line(value.name,SERVICE_PRESET_LIMITS.name,PRESET_REASONS.name),provider:value.provider as string,
  read:readServicePresetRead(value.provider,value.read)};
 const note=line(value.note,SERVICE_PRESET_LIMITS.note,PRESET_REASONS.invalid,false);if(note)save.note=note;
 return save;
}

/** Saves one preset: a new ID adds it (refused once the World keeps SERVICE_PRESET_LIMITS.presets), a known ID replaces
 * it and keeps when it was first made. Returns the saved preset and every preset after the save, by ID. */
export function saveServicePreset(presets:readonly ServicePreset[],input:unknown,now:string):{preset:ServicePreset;presets:ServicePreset[]} {
 if(!instant(now))fail(PRESET_REASONS.invalid);
 const save=readServicePresetSave(input),previous=presets.find(preset=>preset.id===save.id);
 if(!previous&&presets.length>=SERVICE_PRESET_LIMITS.presets)fail(PRESET_REASONS.full);
 const preset:ServicePreset={id:save.id,name:save.name,provider:save.provider,read:save.read,...save.note?{note:save.note}:{},createdAt:previous?.createdAt??now,updatedAt:now};
 return {preset,presets:[...presets.filter(item=>item.id!==save.id),preset].sort((a,b)=>a.id.localeCompare(b.id))};
}

/** Every preset but `id`; refused when there is no such preset. */
export function removeServicePreset(presets:readonly ServicePreset[],id:unknown):ServicePreset[] {
 if(typeof id!=='string'||!presets.some(preset=>preset.id===id))return fail(PRESET_REASONS.missing);
 return presets.filter(preset=>preset.id!==id);
}

/** A stored preset, checked again as if it were saved now; null when it is not one (or no longer passes). */
export function readStoredServicePreset(value:unknown):ServicePreset|null {
 const v=record(value);
 if(!instant(v.createdAt)||!instant(v.updatedAt))return null;
 try{
  const save=readServicePresetSave({id:v.id,name:v.name,provider:v.provider,read:v.read,...v.note===undefined?{}:{note:v.note}});
  return {...save,createdAt:v.createdAt,updatedAt:v.updatedAt};
 }catch{return null;}
}

/** The one Service read a preset makes, as `read_service` takes it: always its first page. */
export function servicePresetRead(preset:ServicePreset):ServiceRead {
 return {provider:preset.provider,operation:preset.read.operation,...preset.read.id?{id:preset.read.id}:{},...preset.read.query?{query:preset.read.query}:{}};
}
