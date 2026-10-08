import {validateWorldItem} from '../items/index.ts';
type Row=Record<string,any>;
/** Extraction candidates are private staging; M owns final card copy constraints. */
export function appletCandidateContent(raw:Row):Row {
 const bounded=(key:string,max:number)=>{
  const value=raw[key];
  if(typeof value!=='string'||!value.trim()||[...value].length>max)throw Error(`Invalid Applet candidate ${key}.`);
  return value.trim();
 };
 const title=bounded('title',200),reason=bounded('reason',600),summary=bounded('summary',1200);
 const item:Row={...raw,title,reason,summary,context:reason,...(raw.kind==='task'?{attentionReason:raw.attentionReason||reason}:{})};
 delete item.attentionContentVersion;
 validateWorldItem(item,{start:typeof item.start==='string'?Date.parse(item.start):null,end:typeof item.end==='string'?Date.parse(item.end):null});
 return item;
}
/** Restore an exact source span only when a unique match differs by whitespace alone. */
export function canonicalSourceQuotes(items:Row[],evidence:Record<string,Row>):Row[] {
 return items.map(item=>({...item,sources:Array.isArray(item.sources)?item.sources.map((ref:Row)=>{
  const text=evidence[ref.provider+':'+ref.id]?.text,quote=ref.quote;
  if(typeof text!=='string'||typeof quote!=='string'||!quote.trim()||quote.length>1000||text.includes(quote))return ref;
  const parts=quote.trim().split(/\s+/u).map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
  const matches=[...text.matchAll(new RegExp(parts.join('\\s+'),'gu'))];
  return matches.length===1&&[...matches[0][0]].length<=1000?{...ref,quote:matches[0][0]}:ref;
 }):item.sources}));
}
