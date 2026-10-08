// Local display cache. These keys identify views, NOT Agent sessions.
import {FOX_MAIN_THREAD,companionHistory} from '../../contracts/companion-conversation.ts';
export {FOX_MAIN_THREAD,companionHistory};
export function restoredMainHistory(rows){
 // Legacy view caches have no reliable cross-view chronology. Seed from the
 // most recently saved view, never concatenate them into an invented transcript.
 return companionHistory(rows.find(r=>r.key===FOX_MAIN_THREAD&&r.view==='')?.history||rows.at(-1)?.history);
}
export const contextThread=(place,source='')=>JSON.stringify([String(place||'overview'),String(source||'')]);
export function cleanRecall(values){
 if(!Array.isArray(values))return [];
 return values.slice(-80).flatMap(v=>{
  if(!v||typeof v.key!=='string'||v.key.length>500||typeof v.view!=='string'||v.view.length>500||typeof v.text!=='string')return [];
  return [{id:'restored:'+contextThread(v.key,v.view),key:v.key,view:v.view,text:v.text.slice(0,12000),location:String(v.location||'').slice(0,160),...(Number.isFinite(v.at)?{at:v.at}:{}),history:(Array.isArray(v.history)?v.history:[]).slice(-6).filter(h=>['user','assistant'].includes(h?.role)&&typeof h.text==='string').map(h=>({role:h.role,text:h.text.slice(0,2000)}))}];
 });
}
