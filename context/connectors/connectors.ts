// The services a person connects to their World, one entry each, so Settings, setup and Advanced all render from
// one list. Pure data and rules: the Platform signs in and keeps the credential; nothing here reaches the network.

/** How a service is connected by default.
 * - `mcp-oauth`: the service's own sign-in page, opened from this device; Worldlet registers itself there as a
 *   public client (no secret) and waits on a loopback address (platform/host/modules/connectors/mcp-account.ts).
 * - `google`: Worldlet's own Google sign-in (Mail, Calendar, Drive; Search Console adds its own read permission).
 * - `key`: a pasted key or file (`TOKEN_PROVIDERS` in context/applets/sources.ts), until the service gets a sign-in.
 * - `github-device`: the official Worldlet GitHub App's device code (context/connectors/github-device.ts): the person types a
 *   short code on github.com; only the App's public client ID is used, with no secret and no loopback address.
 * - `local` is reserved for this computer's own apps. */
export type ConnectorMechanism='mcp-oauth'|'github-device'|'google'|'key'|'local';
/** What else connects this service when the default cannot: a pasted key, the Agent's own connection, or a Google
 * service account. Each is shown under Advanced only. */
export type ConnectorFallback='key'|'agent'|'service-account';

export interface Connector {
 /** The connection's name: the vault entry (`mcp:<id>`, `service:<id>`) and the source provider. */
 readonly id:string;
 /** The service's own name, as the person knows it. */
 readonly name:string;
 /** One plain line of what connecting lets Worldlet see. No technical words. */
 readonly purpose:string;
 readonly mechanism:ConnectorMechanism;
 /** The source providers this connection serves (Google's one sign-in serves Mail, Calendar and Drive). */
 readonly providers:readonly string[];
 /** What the sign-in asks for. `read` is asked for at connect; `write` only when the person first approves a change
  * that needs it. Empty: the service's own default (it names none, or offers only one). Never every scope the
  * service offers. */
 readonly scopes:{readonly read:readonly string[];readonly write:readonly string[]};
 /** After sign-in, the one choice the person makes when the service has several (a project, an account). */
 readonly pick?:string;
 readonly fallback:readonly ConnectorFallback[];
 /** Where Settings › Connectors shows it: `always` a tile of its own; `connected` a tile only once connected (a
  * service that connects with a key, under Advanced, or from its Thing); `advanced` only under Advanced. */
 readonly shown:'always'|'connected'|'advanced';
 /** The World region its Thing lives in (context/applets catalog), so a connection made in Settings lands there. */
 readonly region?:string;
 /** Connects on a host with no screen (the Node host). A loopback sign-in needs a browser on the same machine. */
 readonly headless:boolean;
}

const none:readonly string[]=Object.freeze([]);
const scopes=(read:readonly string[],write:readonly string[]=none)=>Object.freeze({read:Object.freeze([...read]),write:Object.freeze([...write])});
const entry=(value:Connector):Connector=>Object.freeze({...value,providers:Object.freeze([...value.providers]),fallback:Object.freeze([...value.fallback])});

/** Every connector, in the order the page shows them. Scope lists were read from each server's published metadata
 * (RFC 9728 `scopes_supported`) on 2026-10-17 and cut to what the World's readers use. */
export const CONNECTORS:readonly Connector[]=Object.freeze([
 entry({id:'google',name:'Google',purpose:'See your mail, calendar and files in Google.',mechanism:'google',providers:['gmail','google-calendar','google-drive'],shown:'always',region:'home',
  // Google's sign-in asks per service, in context/connectors/google and the host's Google account; not from this list.
  scopes:scopes([]),fallback:[],headless:false}),
 // Notion's server offers one scope, `default`.
 entry({id:'notion',name:'Notion',purpose:'See your pages and databases in Notion.',mechanism:'mcp-oauth',providers:['notion'],shown:'always',region:'work',scopes:scopes(['default']),fallback:['agent'],headless:false}),
 entry({id:'linear',name:'Linear',purpose:'See your issues and projects in Linear.',mechanism:'mcp-oauth',providers:['linear'],shown:'always',region:'work',scopes:scopes(['read'],['write']),fallback:['agent'],headless:false}),
 // Todoist's server offers only `data:read_write`; completing a task still needs the person's approval on its card.
 entry({id:'todoist',name:'Todoist',purpose:'See your tasks in Todoist.',mechanism:'mcp-oauth',providers:['todoist'],shown:'always',region:'work',scopes:scopes(['data:read_write']),fallback:['agent'],headless:false}),
 // The reader calls only `list_projects` and `get_project` on the read-only, account-only address.
 entry({id:'supabase',name:'Supabase',purpose:'See your projects in Supabase.',mechanism:'mcp-oauth',providers:['supabase'],shown:'always',region:'work',scopes:scopes(['organizations:read','projects:read']),fallback:['agent'],headless:false}),
 // PayPal's server names no scopes: its own default.
 entry({id:'paypal',name:'PayPal',purpose:'See your PayPal activity.',mechanism:'mcp-oauth',providers:['paypal'],shown:'connected',region:'money',scopes:scopes([]),fallback:['agent'],headless:false}),
 // GitHub offers no sign-in Worldlet can register for: the official Worldlet GitHub App's device code, which needs no
 // secret and works with no screen. A GitHub App's user token carries the App's permissions, not scopes.
 entry({id:'github',name:'GitHub',purpose:'See your issues and pull requests on GitHub.',mechanism:'github-device',providers:['github'],shown:'always',region:'work',scopes:scopes([]),fallback:['agent','key'],headless:true}),
 // Reading only at sign-in; the two writes a PostHog draft makes are asked for when the person first approves one.
 // `user:read` names the projects to choose from.
 entry({id:'posthog',name:'PostHog',purpose:'See your product numbers and errors in PostHog.',mechanism:'mcp-oauth',providers:['posthog'],shown:'always',region:'work',
  scopes:scopes(['user:read','project:read','query:read','insight:read','dashboard:read','feature_flag:read','annotation:read','error_tracking:read'],['annotation:write','feature_flag:write']),pick:'project',fallback:['key'],headless:false}),
 // Cloudflare's server names only its own two in its resource metadata; its authorization server offers the rest.
 // `offline_access` keeps the sign-in past a day; the three analytics reads are Workers, zones and their traffic.
 entry({id:'cloudflare',name:'Cloudflare',purpose:'See your site traffic in Cloudflare.',mechanism:'mcp-oauth',providers:['cloudflare'],shown:'always',region:'work',
  scopes:scopes(['offline_access','user:read','account:read','account-analytics.read','zone.read','analytics.read']),pick:'account',fallback:['key'],headless:false}),
 // Worldlet's own Google sign-in with the read-only Search Console permission, asked for only from this tile; a service
 // account under Advanced for a World with no one at the screen.
 entry({id:'search-console',name:'Search Console',purpose:'See how your sites do in Google Search.',mechanism:'google',providers:['search-console'],shown:'always',region:'work',
  scopes:scopes(['https://www.googleapis.com/auth/webmasters.readonly']),fallback:['service-account'],headless:false}),
 entry({id:'http',name:'HTTP JSON',purpose:'Read your own JSON address.',mechanism:'key',providers:['http'],shown:'advanced',scopes:scopes([]),fallback:['key'],headless:true}),
]);

/** Words the default path of Settings › Connectors never shows (they belong under Advanced): someone who knows nothing
 * about computers connects a service without meeting them. `scripts/connectors-check.ts` and
 * `scripts/connectors-ui-check.ts` fail when one appears. */
export const CONNECTOR_TECHNICAL_WORDS=/\b(?:keys?|tokens?|scopes?|mcp|oauth|apis?|ids?|endpoints?|grants?|terminal)\b/i;
/** True when `text` has none of CONNECTOR_TECHNICAL_WORDS. */
export const plainConnectorText=(text:string)=>!CONNECTOR_TECHNICAL_WORDS.test(text);

/** The connector named `id`, or null. */
export function connector(id:string):Connector|null {
 return CONNECTORS.find(item=>item.id===id)??null;
}
/** The scopes a sign-in for `id` asks for: the connector's own list (`write` adds its write list), kept to those the
 * service says it offers when it says so. Empty (no scope sent, the service's default) for an unknown connector or
 * one with no list; never everything the service offers. */
export function connectorScopes(id:string,offered?:unknown,options:{write?:boolean}={}):string[] {
 const item=connector(id);
 if(!item)return [];
 const wanted=[...item.scopes.read,...options.write?item.scopes.write:[]];
 if(!Array.isArray(offered)||!offered.length)return wanted;
 const supported=new Set(offered.filter((scope):scope is string=>typeof scope==='string'));
 return wanted.filter(scope=>supported.has(scope));
}
