/** Tracked links (core/agent/GRANTS.md#tracked-links): the person's table of things they put out (a post, a thread, an
 * article, a video) from draft to published, each with where it went, the link that counts its visitors and how many
 * people saw it. An Agent keeps rows through the `worldlet` MCP server; the host stamps the Agent from the token that
 * made the call, never from what the model sent. Hosts own clocks and storage; Core decides (core/agent/tracked-links.ts). */

/** `draft` while it is written; `ready` to go out; `published` once it is out (with its url); `dropped` if it never will. */
export type TrackedLinkState='draft'|'ready'|'published'|'dropped';
export const TRACKED_LINK_STATES:readonly TrackedLinkState[]=Object.freeze(['draft','ready','published','dropped']);

export interface TrackedLink {
 /** The person's or Agent's own ID for it (letters, digits and `-`), also what a tracking link carries. */
 id:string;
 title:string;
 /** One or two lines on what it says. */
 summary:string;
 /** What it is, in the person's words: post, thread, article, video… */
 type:string;
 /** Where it goes: x, reddit, a newsletter… */
 channel:string;
 state:TrackedLinkState;
 /** Its full text, when it is written here. */
 text:string;
 tags:string[];
 /** Where it was published (https). */
 url?:string;
 /** The link people follow that says it came from this piece (https), for example `https://example.com/?c=<id>`. */
 trackingUrl?:string;
 publishedAt?:string;
 /** How many people saw it where it was published, and when that was read. */
 views?:number;
 viewsAt?:string;
 /** Pictures or files that go with it: https links or file names. */
 media:string[];
 /** The Agent that last changed it, host-stamped; none when the person did. */
 agentId?:string;
 /** 1 when created; each change adds one. */
 revision:number;
 createdAt:string;
 updatedAt:string;
}

export const TRACKED_LINK_LIMITS=Object.freeze({
 id:64,title:200,summary:1000,type:20,channel:40,text:20_000,tags:8,tag:40,link:2000,media:8,
 /** Rows one `links/save` call may create or change. */
 save:50,
 /** Rows one `links/read` call returns, newest first. */
 read:100,
 /** Rows a World keeps. */
 total:5000,
});

/** The World gateway targets (`links/<action>`), each its own Grant target. Only an Agent's own "Can see your tracked
 * links" and "Can keep your tracked links" Grants name them; a Fox turn's Grant never does. */
export const TRACKED_LINK_TARGET='links';
export const TRACKED_LINK_ACTIONS=Object.freeze({read:'links/read',save:'links/save'} as const);

/** One row in `links/save`: `id` and only the fields that change; a new row needs a title. `null` clears an optional
 * field. */
export type TrackedLinkSave={id:string}&Partial<Record<'title'|'summary'|'type'|'channel'|'state'|'text'|'url'|'trackingUrl'|'publishedAt'|'viewsAt',string|null>>&{tags?:string[];media?:string[];views?:number|null};
/** `links/read`: particular rows, or the newest (by when published, else created) narrowed by state, channel and time. */
export interface TrackedLinkRead {ids?:string[];state?:TrackedLinkState;channel?:string;since?:string;limit?:number}
