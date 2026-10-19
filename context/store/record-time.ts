// When a record's evidence happened, read from the times it carries. Shared by Attention's ranking (Agent) and the
// reply drafts in Context, so it lives with the records (#681).
export type AttentionRankItem={state?:string;dueAt?:unknown;placement?:unknown;unread?:unknown;receivedAt?:unknown;occurredAt?:unknown;sourceUpdatedAt?:unknown;start?:unknown;end?:unknown;allDay?:unknown};
/** A calendar date alone is the viewer's local day: it starts at local midnight, and as a due date
 * it lasts until the end of that day. */
export function recordInstant(value:unknown,endOfDay=false):number {
 if(typeof value==='number')return value;
 if(typeof value!=='string')return NaN;
 const date=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
 return date?new Date(+date[1],+date[2]-1,+date[3]+(endOfDay?1:0)).getTime()-(endOfDay?1:0):Date.parse(value);
}
/** When the evidence arrived: the mail receipt the reader reports, else when the source says it
 * happened or changed. Never the local first observation: a first sync observes a whole backlog at once. */
export function attentionArrivedAt(item:AttentionRankItem):number {
 for(const value of [item.receivedAt,item.occurredAt,item.sourceUpdatedAt]){const t=recordInstant(value);if(Number.isFinite(t)&&t>0)return t;}
 return NaN;
}
