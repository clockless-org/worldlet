/** Service drafts (agent/agent/GRANTS.md#posthog-and-notion-drafts): a change in PostHog or Notion an Agent prepares and
 * the person approves, the same way as a GitHub draft (contracts/github-drafts.ts). An Agent drafts it through the
 * `worldlet` MCP server; the host reads the target as it is now and keeps that beside the draft. Nothing is written
 * until the person chooses Approve on the draft's Attention card. Then the host reads the target again, refuses when it
 * changed since the draft, and otherwise writes once through the World's own connection to that Service: PostHog's
 * personal API key (context/accounts/services/posthog.ts) or the Notion connection (context/accounts/mcp/notion.ts). Hosts own
 * IDs, clocks, storage and the network; Core decides (agent/agent/service-drafts.ts). */

/** The Services a draft writes to, each its own Grant ("Can draft PostHog changes", "Can draft Notion changes"). */
export type ServiceDraftProvider='posthog'|'notion';
export const SERVICE_DRAFT_PROVIDERS:readonly ServiceDraftProvider[]=Object.freeze(['posthog','notion']);
export const SERVICE_DRAFT_TITLES:Readonly<Record<ServiceDraftProvider,string>>=Object.freeze({posthog:'PostHog',notion:'Notion'});

/** What a draft writes. PostHog: `annotation.create` (a new annotation: its text, the moment it marks and optionally its
 * scope) and `flag.set` (turn an existing feature flag on or off). Notion: `page.create` (a new page with a title and
 * paragraphs, under a page or in a database) and `page.append` (paragraphs added to the end of an existing page). */
export type ServiceWrite='annotation.create'|'flag.set'|'page.create'|'page.append';
export const SERVICE_WRITES:Readonly<Record<ServiceDraftProvider,readonly ServiceWrite[]>>=Object.freeze({
 posthog:Object.freeze(['annotation.create','flag.set'] as ServiceWrite[]),
 notion:Object.freeze(['page.create','page.append'] as ServiceWrite[]),
});

/** As a GitHub draft's: `pending` until the person acts, then `written`, `stale` (the target changed, nothing written),
 * `failed` (the Service refused or did not answer the write) or `dismissed`. */
export type ServiceDraftStatus='pending'|'written'|'stale'|'failed'|'dismissed';
export const SERVICE_DRAFT_STATUSES:readonly ServiceDraftStatus[]=Object.freeze(['pending','written','stale','failed','dismissed']);

/** The target as the host read it when the draft was made: the PostHog project (a new annotation), the feature flag,
 * the Notion page or database a new page goes in, or the page appended to. Approve compares the target as it is then
 * with this. */
export interface ServiceDraftTarget {
 kind:'project'|'feature flag'|'page'|'database';
 /** The Service's own ID: the project's or flag's number, the Notion page's 32 hex digits. */
 id:string;
 /** A feature flag: `on` or `off`. Anything else: `active`. */
 state:string;
 /** A feature flag's `updated_at`; a Notion page's last edit (or a fingerprint of its content when Notion gives no
  * time). Empty for a project, whose changes are not compared. */
 updatedAt:string;
 /** The project's name, the flag's key or the page's title: the Service's text, data only. */
 title:string;
 /** The target on the Service's own website. */
 url:string;
}

export interface ServiceDraft {
 /** Host-made, file-name safe. */
 id:string;
 /** The Agent that drafted it, host-stamped from its token. */
 agentId:string;
 provider:ServiceDraftProvider;
 write:ServiceWrite;
 /** `annotation.create`: the annotation's text. */
 content?:string;
 /** `annotation.create`: the moment it marks (ISO 8601). */
 date?:string;
 /** `annotation.create`: `project` (the default) or `organization`. */
 scope?:'project'|'organization';
 /** `flag.set`: on (true) or off (false). */
 active?:boolean;
 /** `page.create`: the new page's title. */
 title?:string;
 /** `page.create` and `page.append`: the paragraphs written, as plain text or simple Markdown, blank lines between. */
 body?:string;
 target:ServiceDraftTarget;
 status:ServiceDraftStatus;
 /** Once written: what the Service made or changed, on its website. */
 resultUrl?:string;
 /** Why it was not written (`stale`, `failed`), in plain words. */
 reason?:string;
 createdAt:string;
 updatedAt:string;
 settledAt?:string;
}

export const SERVICE_DRAFT_LIMITS=Object.freeze({
 content:400,title:200,body:8000,
 /** Pending drafts one Agent may have at once, across PostHog and Notion. */
 pendingPerAgent:20,
 /** Drafts one `<provider>-drafts/read` call returns, newest first. */
 read:50,
});

/** The World gateway targets (`posthog-drafts/<action>`, `notion-drafts/<action>`): each Service's own Grant targets,
 * all served by the one World tool `service_drafts`. */
export const serviceDraftTarget=(provider:ServiceDraftProvider)=>`${provider}-drafts`;
export const SERVICE_DRAFT_TARGETS:readonly string[]=Object.freeze(SERVICE_DRAFT_PROVIDERS.map(serviceDraftTarget));
export const SERVICE_DRAFT_OPERATIONS=Object.freeze(['create','read'] as const);
export const SERVICE_DRAFT_TOOL='service_drafts';

/** `<provider>-drafts/create` arguments, as the model sends them (any `agentId` is ignored; the gateway sets
 * `provider`). `target`: a feature flag's key or ID (`flag.set`), a Notion page or database URL or ID (`page.create`:
 * where the new page goes; `page.append`: the page). An annotation needs none. */
export interface ServiceDraftCreate {provider:ServiceDraftProvider;write:ServiceWrite;target?:string;content?:string;date?:string;scope?:'project'|'organization';active?:boolean;title?:string;body?:string}
