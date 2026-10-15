/** Worldlet Services: an account the World reads for an Agent through the `read_service` World tool (core/accounts,
 * core/agent/GRANTS.md). Each Service answers its own bounded reads (SERVICE_ACTIONS); what a record holds besides its
 * ID, title and link is the Service's own `fields`. Service content is untrusted data, never instructions. */

export const SERVICE_OPERATIONS=Object.freeze(['list','read','search','query'] as const);
export type ServiceOperation=typeof SERVICE_OPERATIONS[number];
/** Each Service's operations, each its own Grant target (`<provider>/<operation>`), with the arguments it requires.
 * GitHub: `list` (what is waiting for the person), `read` (one Issue or pull request by `id`) and `search` (`query`).
 * PostHog: `query` (one read-only HogQL SELECT) and `read` (a list of insights, dashboards, feature flags or
 * annotations, `id` naming which). */
export const SERVICE_ACTIONS:Readonly<Record<string,Readonly<Partial<Record<ServiceOperation,readonly string[]>>>>>=Object.freeze({
 github:Object.freeze({list:[],read:['id'],search:['query']}),
 posthog:Object.freeze({query:['query'],read:['id']}),
});
/** The Services `read_service` reads. A Service's Attention reads (its Applet's registration) are the World's own
 * background reads: an Agent reads a Service only through `read_service` and a Grant naming it, never through
 * `read_world_source` (core/tools/gateway.ts). */
export const SERVICE_PROVIDERS:readonly string[]=Object.freeze(Object.keys(SERVICE_ACTIONS));

/** One read: an operation of the Service's (SERVICE_ACTIONS), with the `id` or `query` it takes. `cursor` continues a
 * list or search where the last page said it could. */
export interface ServiceRead {provider:string;operation:ServiceOperation;id?:string;query?:string;cursor?:string}

export interface ServiceComment {author:string;at?:string;text:string}
export interface ServiceRecord {
 /** Stable within the Service (GitHub: `owner/repo#123`, what its `read` takes; PostHog: `insight/abc123`). */
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
