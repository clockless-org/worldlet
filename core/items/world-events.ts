import policy from '../../contracts/world-event-policy.json' with {type:'json'};
import {characters} from '../companion/index.ts';
const fields=new Set(policy.fields),plumbing=new Set(policy.plumbing);
/** Allowlisted identifiers/states only. Never persist arbitrary chat/request bodies. */
export function worldEvent(action:string,body:Record<string,unknown>):{body:Record<string,unknown>;applet?:string}|null {
 if(plumbing.has(action)||body.operation==='status'||(typeof body.operation==='string'&&plumbing.has(action+':'+body.operation)))return null;
 const result:Record<string,unknown>={};
 const id=body.id;
 for(const [key,value] of Object.entries(body)){
  if(!fields.has(key))continue;
  if(typeof value==='string'?characters(value).length<=120:typeof value==='boolean'||(typeof value==='number'&&Number.isFinite(value)))result[key]=value;
 }
 if(typeof id==='string'&&characters(id).length<=120&&['app-','item-','source-','building-'].some(prefix=>id.startsWith(prefix)))result.id=id;
 const applet=['moduleId','appletId','provider','moduleKey'].map(key=>body[key]).find(v=>typeof v==='string'&&v.length>0&&characters(v).length<=120) as string|undefined;
 return {body:result,...(applet===undefined?{}:{applet})};
}

type HistoryRow={kind?:unknown;key?:unknown;applet?:unknown;body?:Record<string,unknown>;at:string};
function sameValue(a:unknown,b:unknown):boolean {
 if(a===b)return true;
 // Foundation NSNumber equality treats numeric and boolean scalar values alike.
 if(['boolean','number'].includes(typeof a)&&['boolean','number'].includes(typeof b))return Number(a)===Number(b);
 if(Array.isArray(a)&&Array.isArray(b))return a.length===b.length&&a.every((v,i)=>sameValue(v,b[i]));
 if(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b)){
  const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>Object.hasOwn(b,k)&&sameValue(a[k],b[k]));
 }
 return false;
}
/** Input is newest-first journal rows; host has formatted timestamps for presentation. */
export function recentWorldHistory(rows:HistoryRow[],limit:number):Record<string,unknown>[] {
 if(!Number.isInteger(limit)||limit<=0)return [];
 const result:Record<string,unknown>[]=[];
 let previous:Record<string,unknown>={};
 for(const row of rows){
  if(typeof row.kind==='string'&&(row.kind.startsWith('activity.')||row.kind.startsWith('conversation.')))continue; // Explicit history queries own private page evidence.
  if(policy.conversation.includes(typeof row.kind==='string'?row.kind:''))continue;
  const event:Record<string,unknown>={...(row.body??{}),kind:row.kind??''};
  if(row.key!==undefined)event.applet=row.key;
  else if(row.applet!==undefined)event.applet=row.applet;
  if(sameValue(event,previous))continue;
  previous={...event};
  event.at=row.at;result.push(event);
  if(result.length===limit)break;
 }
 return result;
}
