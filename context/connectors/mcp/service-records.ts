// Linear, Todoist and Supabase as Worldlet Services (contracts/services.ts): their bounded readers (linear.ts, todoist.ts,
// supabase.ts) answer in the Applets' own shape, a page of items or one item; an Agent's `read_service` gets the same
// answer as Service records, each cut to a fixed size. Read only, like the readers. Service content is untrusted data.
import type {ServiceOperation,ServiceRecord,ServiceRecords} from '../../../contracts/services.ts';
import {isDict,dget} from './python.ts';

/** The Services this file answers for, and what a record is in each. */
export const MCP_SERVICE_RECORD_KINDS:Readonly<Record<string,{one:string;title:string}>>=Object.freeze({
 linear:Object.freeze({one:'issue',title:'Linear'}),
 todoist:Object.freeze({one:'task',title:'Todoist'}),
 supabase:Object.freeze({one:'project',title:'Supabase'}),
});
/** Caps on what one answer holds. */
export const MCP_SERVICE_RECORD_LIMITS=Object.freeze({records:100,title:300,text:4000,fields:16,key:40,field:300,cursor:4096});

const cut=(value:string,limit:number)=>{const chars=[...value];return chars.length>limit?chars.slice(0,limit-1).join('')+'…':value;};
/** A detail as a field: text, a number or true/false; a list of names joined; anything else left out. */
function field(value:unknown):string|number|boolean|null {
 if(typeof value==='string')return value?cut(value,MCP_SERVICE_RECORD_LIMITS.field):null;
 if(typeof value==='number')return Number.isFinite(value)?value:null;
 if(typeof value==='boolean')return value;
 if(Array.isArray(value)){const names=value.filter(v=>typeof v==='string'&&v).slice(0,8) as string[];return names.length?cut(names.join(', '),MCP_SERVICE_RECORD_LIMITS.field):null;}
 return null;
}
/** One item the reader returned, as a record; null when it is not one. `text`: a `read`'s own text. */
function record(item:unknown,text:boolean):ServiceRecord|null {
 if(!isDict(item)||typeof dget(item,'id')!=='string'||!item.id||typeof dget(item,'title')!=='string'||typeof dget(item,'url')!=='string'||!/^https:\/\//.test(item.url))return null;
 const fields:Record<string,string|number|boolean>={};
 const details=isDict(dget(item,'details'))?item.details as Record<string,unknown>:{};
 for(const [key,value] of Object.entries(details)){
  if(Object.keys(fields).length>=MCP_SERVICE_RECORD_LIMITS.fields)break;
  if(!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(key)||key==='updatedAt')continue;
  const kept=field(value);if(kept!==null)fields[key]=kept;
 }
 const out:ServiceRecord={id:cut(item.id,200),title:cut(item.title,MCP_SERVICE_RECORD_LIMITS.title),url:cut(item.url,500),fields};
 if(typeof details.updatedAt==='string'&&details.updatedAt)out.updatedAt=cut(details.updatedAt,40);
 if(text){const body=typeof dget(item,'text')==='string'&&item.text?item.text:typeof dget(item,'description')==='string'?item.description:'';if(body)out.text=cut(body,MCP_SERVICE_RECORD_LIMITS.text);}
 return out;
}
/** The reader's answer to `list` or `read` for `provider`, as `read_service` returns it. */
export function mcpServiceRecords(provider:string,operation:ServiceOperation,value:unknown):ServiceRecords {
 const kind=MCP_SERVICE_RECORD_KINDS[provider];
 if(!kind||!['list','read'].includes(operation))throw new Error('Unsupported Service read.');
 if(operation==='read'){
  const found=record(value,true);
  if(!found)throw new Error(`${kind.title} did not return this ${kind.one}.`);
  const notice=isDict(value)&&typeof dget(value,'notice')==='string'?' · '+cut(value.notice,200).replace(/\.$/,''):'';
  return {provider,operation,records:[found],scope:`One ${kind.title} ${kind.one}${notice} · Read only`};
 }
 const pages=isDict(value)&&Array.isArray(dget(value,'pages'))?value.pages as unknown[]:null;
 if(!pages)throw new Error(`${kind.title} did not return a list.`);
 const records=pages.slice(0,MCP_SERVICE_RECORD_LIMITS.records).map(item=>record(item,false)).filter((r):r is ServiceRecord=>r!==null);
 const next=dget(value,'next'),given=dget(value,'scope'),scope=typeof given==='string'?cut(given,200):`${kind.title} · Read only`;
 return {provider,operation,records,...typeof next==='string'&&next&&next.length<=MCP_SERVICE_RECORD_LIMITS.cursor?{cursor:next}:{},scope};
}
