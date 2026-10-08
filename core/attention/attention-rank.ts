import type {AttentionWorkflow} from '../../contracts/attention.ts';
/** Attention ranking signals (#1152, owner decision 2026-10-01). Importance first, then fit with
 * the moment; within those, explicit unfinished obligations and deadlines come before the
 * user's own mail workflow: kept in the inbox ranks higher, archived ranks lower and unread
 * ranks a little higher. Archive alone is not evidence of completion, so it never hides a
 * finding or outranks an obligation or deadline; resolution stays an extraction decision. */
export const attentionRankWeights={obligation:8,deadline:8,inbox:2,archived:-2,unread:1,fresh:1} as const;
/** Due within this window, or overdue by less than `attentionTimeliness.lapsedDays`, counts as a deadline. */
export const attentionDeadlineHours=72;
/** Timeliness (owner decision 2026-10-04): an item due soon or just overdue ranks with important
 * work; fresh evidence ranks a little higher; stale evidence with nothing upcoming, a deadline
 * long past and an event that is over rank lower. It weighs order and focus admission, never hides
 * or settles an item, and every time is a trusted record (mail receipt, extracted due date, event time). */
export const attentionTimeliness={urgentHours:24,recentOverdueDays:3,lapsedDays:14,freshHours:48,staleDays:14,oldDays:30,eventGraceMinutes:60} as const;
export type AttentionRankItem={state?:string;dueAt?:unknown;placement?:unknown;unread?:unknown;receivedAt?:unknown;occurredAt?:unknown;sourceUpdatedAt?:unknown;start?:unknown;end?:unknown;allDay?:unknown};
const day=86400000;
/** A calendar date alone is the viewer's local day: it starts at local midnight, and as a due date
 * it lasts until the end of that day. */
function instant(value:unknown,endOfDay=false):number {
 if(typeof value==='number')return value;
 if(typeof value!=='string')return NaN;
 const date=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
 return date?new Date(+date[1],+date[2]-1,+date[3]+(endOfDay?1:0)).getTime()-(endOfDay?1:0):Date.parse(value);
}
/** When the evidence arrived: the mail receipt the reader reports, else when the source says it
 * happened or changed. Never the local first observation: a first sync observes a whole backlog at once. */
export function attentionArrivedAt(item:AttentionRankItem):number {
 for(const value of [item.receivedAt,item.occurredAt,item.sourceUpdatedAt]){const t=instant(value);if(Number.isFinite(t)&&t>0)return t;}
 return NaN;
}
/** An event (or dated matter) that has finished: its end, else its start plus a short grace
 * (a whole day for an all-day date), is behind us. */
export function attentionOver(item:AttentionRankItem,now:number):boolean {
 const start=instant(item.start),end=instant(item.end);
 if(Number.isFinite(end)&&end>start)return end<=now;
 if(!Number.isFinite(start))return false;
 return start+(item.allDay===true||typeof item.start==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(item.start)?day:attentionTimeliness.eventGraceMinutes*60000)<=now;
}
/** The importance level an item takes part at, given its timeliness. Due within a day or just
 * overdue is at least important (3); never above that, so time alone never makes an item pressing.
 * Stale or lapsed matters lose a level or two but stay above 0.5, below any current item at their
 * own level; 0 is kept for a matter that is over. */
export function attentionTimelyLevel(item:AttentionRankItem,level:number,now:number):number {
 const t=attentionTimeliness,due=instant(item.dueAt,true);
 if(attentionOver(item,now))return 0;
 if(Number.isFinite(due)){
  if(due-now<=t.urgentHours*3600000&&now-due<=t.recentOverdueDays*day)return Math.max(level,3);
  if(now-due>t.lapsedDays*day)return Math.max(0.5,level-1);
  if(due>now)return level;
 }
 if(Number.isFinite(instant(item.start)))return level;
 const age=now-attentionArrivedAt(item);
 return age>t.oldDays*day?Math.max(0.5,level-2):age>t.staleDays*day?Math.max(0.5,level-1):level;
}

/** Keep only well-formed workflow facts. A source without an observed label set has unknown
 * placement, never "archived". */
export function attentionWorkflow(input:{placement?:unknown;unread?:unknown}|undefined):AttentionWorkflow|undefined {
 const value:AttentionWorkflow={};
 if(input?.placement==='inbox'||input?.placement==='archived')value.placement=input.placement;
 if(typeof input?.unread==='boolean')value.unread=input.unread;
 return Object.keys(value).length?value:undefined;
}
/** One item's workflow across its sources: anywhere in the inbox is inbox, archived only
 * when every placed source is archived; any unread source is unread. */
export function combinedWorkflow(values:(AttentionWorkflow|undefined)[]):AttentionWorkflow|undefined {
 const known=values.filter((v):v is AttentionWorkflow=>!!v);
 const placed=known.map(v=>v.placement).filter(Boolean),reads=known.map(v=>v.unread).filter(v=>typeof v==='boolean');
 const value:AttentionWorkflow={};
 if(placed.length)value.placement=placed.includes('inbox')?'inbox':'archived';
 if(reads.length)value.unread=reads.includes(true);
 return Object.keys(value).length?value:undefined;
}
export function attentionDeadline(dueAt:unknown,now:number):boolean {
 const time=instant(dueAt,true);
 return Number.isFinite(time)&&time-now<=attentionDeadlineHours*3600000&&now-time<=attentionTimeliness.lapsedDays*day;
}
/** Arrived within the last two days. */
export function attentionFresh(item:AttentionRankItem,now:number):boolean {
 const age=now-attentionArrivedAt(item);
 return age>=0&&age<=attentionTimeliness.freshHours*3600000;
}
/** Combined secondary signal. Its workflow and freshness part spans less than either obligation
 * or deadline weight, so placement, unread state and freshness reorder only among comparable items. */
export function attentionSignalScore(item:AttentionRankItem,now:number):number {
 const w=attentionRankWeights;
 return (item.state==='needsAction'?w.obligation:0)+(attentionDeadline(item.dueAt,now)?w.deadline:0)
  +(item.placement==='inbox'?w.inbox:item.placement==='archived'?w.archived:0)+(item.unread===true?w.unread:0)+(attentionFresh(item,now)?w.fresh:0);
}
