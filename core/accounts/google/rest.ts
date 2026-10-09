/** The Google REST calls the World's own Google connection makes (Gmail, Calendar, Drive), as Core sees them:
 * the Platform supplies the authorized transport (OAuth, refresh, timeouts), a development build a fictional
 * account. Paths are relative to https://www.googleapis.com/ (for example `gmail/v1/users/me/profile`).
 * Query values that are arrays repeat the parameter (`metadataHeaders=From&metadataHeaders=To`). */
export type GoogleQuery=Record<string,string|number|boolean|string[]|undefined>;
export interface GoogleRest {
 /** A JSON GET. Rejects with a GoogleRestError on a non-2xx answer. */
 get(path:string,query?:GoogleQuery):Promise<any>;
 /** Several JSON GETs, answered in request order (Gmail pages read a page of threads together). */
 getAll(requests:{path:string;query?:GoogleQuery}[]):Promise<any[]>;
 /** A JSON POST, sent once (never retried). */
 post(path:string,body:unknown,query?:GoogleQuery):Promise<any>;
 /** Raw bytes of a GET (Drive export). */
 bytes(path:string,query?:GoogleQuery):Promise<Uint8Array>;
}
/** A Google answer that was not 2xx: its HTTP status and Google's error reason, never the body. */
export class GoogleRestError extends Error {
 readonly status:number;readonly reason:string;
 constructor(status:number,reason:string,message=`Google answered ${status}${reason?' ('+reason+')':''}.`){super(message);this.name='GoogleRestError';this.status=status;this.reason=reason;}
}
/** Mail send receipts kept beside the World's Google connection (one per reviewed draft). */
export interface MailReceipts {
 read(id:string):Record<string,unknown>|null;
 /** Creates the receipt only when none exists yet; false when one already does. */
 create(id:string,value:Record<string,unknown>):boolean;
 write(id:string,value:Record<string,unknown>):void;
}
