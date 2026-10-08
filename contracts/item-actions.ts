/** Local Attention state only. These operations never mutate the source service. */
export type ItemStatus='open'|'read'|'done'|'dismissed';
export interface ItemHostBodies {
 worldItemRead:{id:string};
 /** `by:'fox'`: the person confirms work Fox did for them; recorded on the item as `completedBy`. */
 worldItemStatus:{id:string;status:ItemStatus;snoozedUntil?:string;by?:'fox'};
}
export type ItemHostRequest={[K in keyof ItemHostBodies]:{action:K}&ItemHostBodies[K]}[keyof ItemHostBodies];
export function isItemHostAction(action:unknown):action is keyof ItemHostBodies {
 return action==='worldItemRead'||action==='worldItemStatus';
}
/** Validate wire shape here; Core validates snooze time against the host clock. */
export function readItemHostRequest(input:unknown):ItemHostRequest {
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid item request');
 const value=input as Record<string,unknown>;
 if(!isItemHostAction(value.action))throw Error('Unknown item action');
 const allowed=value.action==='worldItemRead'?['action','id']:['action','id','status','snoozedUntil','by'];
 if(Object.keys(value).some(key=>!allowed.includes(key)))throw Error('Unknown item request field');
 if(typeof value.id!=='string'||!value.id.trim()||value.id.length>256)throw Error('Invalid item ID');
 if(value.action==='worldItemRead')return {action:value.action,id:value.id};
 if(!['open','read','done','dismissed'].includes(value.status as string))throw Error('Invalid item status');
 if(value.snoozedUntil!==undefined&&(typeof value.snoozedUntil!=='string'||value.snoozedUntil.length>64))throw Error('Invalid snooze time');
 if(value.by!==undefined&&(value.by!=='fox'||value.status!=='done'))throw Error('Invalid item outcome');
 return {action:value.action,id:value.id,status:value.status as ItemStatus,...value.snoozedUntil!==undefined?{snoozedUntil:value.snoozedUntil as string}:{},...value.by?{by:'fox' as const}:{}};
}
