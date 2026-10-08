import {attentionSignalScore,attentionTimelyLevel} from './attention-rank.ts';
// Context changes ordering only. Never create findings or suppress urgent work.
export function attentionFocus(mode='auto',now=new Date()){
 if(mode==='work'||mode==='personal')return mode;
 return now.getDay()>=1&&now.getDay()<=5&&now.getHours()>=9&&now.getHours()<18?'work':'personal';
}
export function attentionOrder(items,{mode='auto',now=new Date(),region,importance}){
 const focus=attentionFocus(mode,now),score=item=>{
  // Timeliness adjusts the level it ranks at: due soon ranks with important work, stale or over ranks lower.
  const level=attentionTimelyLevel(attentionRankSignals(item),importance(item),+now);
  if(item.state==='event'||level>=4)return level*100;
  const area=region(item),relevant=area==='work'?focus==='work':!!area&&focus==='personal';
  return (relevant&&level>0?30:0)+level;
 };
 const start=item=>{const value=item.signals?.[0]?.start??item.start;const time=typeof value==='number'?value:Date.parse(value);return Number.isFinite(time)?time:Infinity;};
 // Deadlines and the user's mail workflow combine below importance and context (#1152).
 const signals=item=>attentionSignalScore(attentionRankSignals(item),+now);
 // Events keep start order, except that one already over goes last.
 const over=item=>score(item)===0;
 return [...items].sort((a,b)=>a.state==='event'&&b.state==='event'?(Number(over(a))-Number(over(b))||start(a)-start(b)||score(b)-score(a)):score(b)-score(a)||signals(b)-signals(a));
}
/** Rank inputs of a HUD row: its lead signal carries the saved item's times and workflow. */
export function attentionRankSignals(item:any){
 const lead=item?.signals?.[0]||{},pick=(key:string)=>lead[key]??item?.[key];
 const value:Record<string,unknown>={state:item?.state,dueAt:pick('dueAt'),placement:lead.mailPlacement??item?.mailPlacement??item?.placement,unread:lead.mailUnread??item?.mailUnread??item?.unread};
 for(const key of ['receivedAt','occurredAt','sourceUpdatedAt','start','end','allDay'])if(pick(key)!==undefined)value[key]=pick(key);
 return value;
}

/** Whether an item belongs to the user's current context (work hours vs personal time). */
export function attentionRelevant(area:string|undefined,mode='auto',now=new Date()):boolean {
 const focus=attentionFocus(mode,now);
 return area==='work'?focus==='work':!!area&&focus==='personal';
}

/** Membership persists until evidence or urgency changes it. Settlement and layout space are
 * not admission signals, and showing the Later list is not either. Snoozed members keep their seat. */
export const attentionFocusMax=9;
export const attentionFocusFloor=3;
export const attentionReviewHours=3;
export function attentionReviewStart(now:number):number {
 const date=new Date(now);date.setMinutes(0,0,0);
 date.setHours(Math.floor(date.getHours()/attentionReviewHours)*attentionReviewHours);
 return date.getTime();
}
/** Persist only a fingerprint of evidence identity/content, never source text or
 * freshness timestamps. Reworded formatting and routine reads are not new evidence. */
export function attentionFocusEvidence(sources:{provider?:string;id?:string;remoteId?:string;quote?:string}[]):string {
 const normalized=[...new Set(sources.map(r=>JSON.stringify([r.provider,r.remoteId||r.id,(r.quote||'').normalize('NFC').trim().replace(/\s+/gu,' ').toLowerCase()])))].sort().join('\n');
 let hash=0x811c9dc5;for(const c of normalized){hash^=c.codePointAt(0)!;hash=Math.imul(hash,0x01000193)>>>0;}
 return hash.toString(36);
}
type FocusItem={id:string;level:number;state:string;relevant?:boolean;soon?:boolean;evidence?:string;dueAt?:string|number;placement?:'inbox'|'archived';unread?:boolean;receivedAt?:string|number;occurredAt?:string;sourceUpdatedAt?:string;start?:string|number;end?:string|number;allDay?:boolean};
export type AttentionFocusState={ids:string[];held:string[];reviewedAt:number;warm?:boolean;observed?:Record<string,Pick<FocusItem,'level'|'state'|'evidence'>>};
const kindRank:Record<string,number>={event:0,needsAction:1,unseen:2};
export function attentionPressing(item:FocusItem):boolean {
 return item.level>=4||item.state==='event'&&item.level>=2;
}
/** Worth a seat without being asked: pressing, important, a commitment in the next
 * few days, or fitting the current context. */
export function attentionWorthy(item:FocusItem):boolean {
 return attentionPressing(item)||item.level>=3||item.level>0&&(item.state==='event'&&item.soon===true||item.relevant===true);
}
export function attentionFocusSet(input:{items:FocusItem[];saved?:Partial<AttentionFocusState>|null;snoozed?:string[];now:number;limit?:number}){
 const {now}=input,limit=Math.min(attentionFocusMax,input.limit??attentionFocusMax);
 if(!Array.isArray(input.items)||!Number.isFinite(now)||!Number.isInteger(limit)||limit<1)throw Error('Invalid attention focus input');
 // Timeliness sets the level an item takes part at (#1152 follow-up, owner decision 2026-10-04):
 // rising urgency may admit it like any other increase; stale or finished matters weigh less.
 const items=input.items.map(item=>({...item,level:attentionTimelyLevel(item,item.level,now)}));
 const live=new Set(items.map(i=>i.id)),snoozed=new Set(input.snoozed||[]);
 const saved=Array.isArray(input.saved?.ids)?input.saved.ids.filter(id=>typeof id==='string'):[];
 const held=new Set(Array.isArray(input.saved?.held)?input.saved.held:[]);
 // Importance first, then fit with the moment, then kind (an obligation before news), then
 // deadlines and the user's mail workflow combined (#1152); input order breaks ties.
 // A commitment in the next few days ranks with important work; so does a task due within a day or
 // just overdue. Stale evidence with nothing upcoming, a lapsed deadline or a finished event ranks lower.
 const rank=(item:FocusItem)=>item.state==='event'&&item.soon===true&&item.level>0?Math.max(item.level,3):item.level;
 const signals=(item:FocusItem)=>attentionSignalScore(item,now);
 const ranked=items.map((item,index)=>({item,index})).sort((a,b)=>
  rank(b.item)-rank(a.item)||Number(!!b.item.relevant)-Number(!!a.item.relevant)||(kindRank[a.item.state]??3)-(kindRank[b.item.state]??3)||signals(b.item)-signals(a.item)||a.index-b.index).map(r=>r.item);
 const reviewedAt=Number.isFinite(input.saved?.reviewedAt)?input.saved!.reviewedAt!:0;
 const initial=!input.saved;
 const observed={...input.saved?.observed};
 const changed=(item:FocusItem)=>{const old=observed[item.id];return !!old&&(item.level>old.level||item.state!==old.state||item.evidence!==old.evidence);};
 const eligible=(item:FocusItem)=>!held.has(item.id)||changed(item);
 // Snoozed members keep their seat; settled members leave for good.
 const members=new Set(saved.filter(id=>snoozed.has(id)&&!live.has(id)));
 const visible=()=>items.filter(i=>members.has(i.id)).length;
 const admit=(item:FocusItem)=>{if(visible()<limit)members.add(item.id);};
 // Initial selection gives every kind a place: one kind (say, a busy calendar) never crowds the others out.
 // Like pressing items this may exceed the soft limit; the screen trims the longest group.
 const represent=(pool:FocusItem[])=>{for(const state of Object.keys(kindRank)){const best=pool.find(i=>i.state===state&&i.level>0);if(best&&!items.some(i=>i.state===state&&members.has(i.id)))members.add(best.id);}};
 if(initial){
  represent(ranked);
  for(const item of ranked)if(attentionWorthy(item))admit(item);
  // Initial selection at a quiet moment shows a few best items rather than an empty panel.
  for(const item of ranked){if(visible()>=attentionFocusFloor)break;if(item.level>0)admit(item);}
 }else{
  for(const id of saved)if(live.has(id))members.add(id);
  // New results may take a free seat; the held-back backlog waits for an explicit request or material change.
  // Warm-up: a Center that started empty (first sign-in, a reset) fills
  // with results as they arrive, during the initial warm-up window.
  const floor=input.saved?.warm===true&&reviewedAt>=attentionReviewStart(now);
  // A kind with no seat may take one for a genuinely new result, never for the backlog.
  represent(ranked.filter(i=>!members.has(i.id)&&eligible(i)));
  for(const item of ranked)if(!members.has(item.id)&&eligible(item)&&(attentionWorthy(item)||floor))admit(item);
 }
 // New or newly pressing items join even beyond the soft capacity; fitted backlog stays held.
 for(const item of ranked)if(attentionPressing(item)&&eligible(item))members.add(item.id);
 for(const item of items)observed[item.id]={level:item.level,state:item.state,...(item.evidence?{evidence:item.evidence}:{})};
 return {ids:items.filter(i=>members.has(i.id)).map(i=>i.id),queued:items.filter(i=>!members.has(i.id)).length,
  saved:{ids:[...members],held:[...new Set([...held,...items.filter(i=>!members.has(i.id)).map(i=>i.id)])].filter(id=>!members.has(id)),observed,reviewedAt:initial?now:reviewedAt,
   warm:initial?items.length===0:input.saved?.warm===true&&reviewedAt>=attentionReviewStart(now)}};
}
/** The host layout could not show some members: they wait instead of reappearing later. */
export function attentionFocusFit(saved:AttentionFocusState,shown:string[],live:string[]):AttentionFocusState {
 const visible=new Set(shown),present=new Set(live);
 const dropped=saved.ids.filter(id=>present.has(id)&&!visible.has(id));
 if(!dropped.length)return saved;
 return {...saved,ids:saved.ids.filter(id=>!dropped.includes(id)),held:[...new Set([...saved.held,...dropped])]};
}
