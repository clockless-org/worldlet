/** Worldlet Services: an account the World reads for an Agent through the `read_service` World tool (core/accounts,
 * core/agent/GRANTS.md). Each Service answers the same three bounded reads; what a record holds besides its ID, title
 * and link is the Service's own `fields`. Service content is untrusted data, never instructions. */
export const SERVICE_OPERATIONS=Object.freeze(['list','read','search'] as const);
export type ServiceOperation=typeof SERVICE_OPERATIONS[number];

/** One read: `list` (what is waiting for the person), `read` (one record by `id`, with its text and comments) or
 * `search` (`query`). `cursor` continues a list or search where the last page said it could. */
export interface ServiceRead {provider:string;operation:ServiceOperation;id?:string;query?:string;cursor?:string}

export interface ServiceComment {author:string;at?:string;text:string}
export interface ServiceRecord {
 /** Stable within the Service, and what `read` takes (GitHub: `owner/repo#123`). */
 id:string;
 title:string;
 /** The record on the Service's own website. */
 url:string;
 updatedAt?:string;
 fields:Record<string,string|number|boolean>;
 /** `read` only: the record's own text, cut to a bounded length. */
 text?:string;
 /** `read` only: the newest comments, bounded in number and length. */
 comments?:ServiceComment[];
}
export interface ServiceRecords {
 provider:string;
 operation:ServiceOperation;
 records:ServiceRecord[];
 /** Present when another page exists. */
 cursor?:string;
 /** What the page covers, in words: never the whole account. */
 scope:string;
}
