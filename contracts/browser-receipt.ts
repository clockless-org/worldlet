import type {WorldItem} from './world-item.ts';

/** Durable browser attempts are not provider-verified outcomes. */
export interface BrowserReceipt {
 id:string;operationId:string;attemptKey:string;label:string;origin:string;
 status:'unverified'|'user_confirmed'|'not_completed';createdAt:string;
 taskID?:string;taskTitle?:unknown;task?:WorldItem;inspectedAt?:string;reviewedAt?:string;
}

/** Trusted UI confirmation only; receipt inspection and permission checks stay authoritative. */
export interface BrowserOutcomeRequest {action:'browserOutcomeAction';id:string;done:boolean}
export function readBrowserOutcomeRequest(input:unknown):BrowserOutcomeRequest {
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid browser outcome request');
 const value=input as Record<string,unknown>;
 if(value.action!=='browserOutcomeAction'||Object.keys(value).some(key=>!['action','id','done'].includes(key))||
    typeof value.id!=='string'||!value.id.trim()||value.id.length>256||typeof value.done!=='boolean')throw Error('Invalid browser outcome request');
 return {action:'browserOutcomeAction',id:value.id,done:value.done};
}
