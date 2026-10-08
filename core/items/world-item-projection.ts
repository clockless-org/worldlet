import type {WorldItem} from '../../contracts/world-item.ts';
import {characters} from '../companion/index.ts';
const string=(value:unknown)=>typeof value==='string'?value:'';
const equal=(a:unknown,b:string)=>typeof a==='string'&&a.normalize('NFC')===b.normalize('NFC');
function refs(item:WorldItem):WorldItem[]{
 return Array.isArray(item.sources)&&item.sources.every(v=>v!==null&&typeof v==='object'&&!Array.isArray(v))?item.sources:[];
}
export function visibleWorldItems(items:WorldItem[],enabledSourceIDs:string[]):WorldItem[]{
 const enabled=new Set(enabledSourceIDs.map(id=>id.normalize('NFC')));
 return items.filter(item=>refs(item).some(ref=>ref.local!==true||(typeof ref.id==='string'&&enabled.has(ref.id.normalize('NFC')))));
}
const fields=new Set(['id','provider','kind','title','status','statusOrigin','priority','start','end','dueAt','occurredAt','observedAt','sourceUpdatedAt','reviewedAt','assessment','createdAt','updatedAt','eventDisposition','snoozedUntil','reason','summary','actionLabel','location','locationName','allDay','attentionContentVersion','event']);
export function queryWorldItems(items:WorldItem[],checks:WorldItem[],provider?:string):{items:WorldItem[];checks:WorldItem[]}{
 return {items:items.filter(item=>provider===undefined||equal(item.provider,provider)).map(item=>({
  ...Object.fromEntries(Object.entries(item).filter(([key])=>fields.has(key))),
  context:characters(string(item.reason||item.context)).slice(0,500).join(''),
  reason:characters(string(item.reason)).slice(0,80).join(''),
  summary:characters(string(item.summary)).slice(0,1200).join(''),
  sources:refs(item).map(ref=>({...ref,quote:characters(string(ref.quote)).slice(0,500).join('')}))
 })),checks:checks.map(check=>{
  const result={...check};
  if(Object.hasOwn(result,'error')){result.lastError=result.error;delete result.error;}
  return result;
 })};
}
/** Evidence is already authorized; host excludes sources with an invalid start timestamp. */
export function calendarItemTimes(item:WorldItem,evidence:Record<string,WorldItem>):WorldItem {
 if(item.kind!=='event'||item.provider!=='google-calendar')return item;
 const ids=[...new Set(refs(item).filter(ref=>ref.provider==='google-calendar'&&typeof ref.id==='string').map(ref=>string(ref.id).normalize('NFC')))];
 if(ids.length!==1)return item;
 const source=Object.entries(evidence).find(([key])=>equal(key,'google-calendar:'+ids[0]))?.[1];
 if(!source||typeof source.start!=='string')return item;
 const result={...item,start:source.start};
 for(const key of ['end','allDay']){
  delete result[key];
  if(Object.hasOwn(source,key))result[key]=source[key];
 }
 return result;
}
