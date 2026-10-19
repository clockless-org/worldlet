/** Service presets (context/applets/INTEGRATIONS.md#service-presets): a named, saved read of one Worldlet Service, such as
 * a PostHog HogQL query or a GitHub search over a set of repositories, kept in the person's own World so a board block
 * (or anything else) names the preset instead of repeating the read. A preset holds only what to read: the Service's
 * key stays in the vault (`mcp:github`, `service:<name>`) and the Service's connection keeps its own settings (PostHog's
 * address and project, Cloudflare's account, HTTP JSON's endpoints). Anything that looks like a password, token or key is refused, never kept.
 * Hosts own the clock and storage; Core decides (context/sources/services/presets.ts). */
import type {ServiceOperation} from './services.ts';
import {SERVICE_PROVIDERS} from './services.ts';

/** Presets the World answers from its own records, with no Service and no network: `agents`, what the Agents in this
 * World report (contracts/agent-reports.ts, `agents/list`). A board reads them as it reads a Service preset; they add
 * no `read_service` operation and no "Can read <Service>" Grant. */
export const WORLD_PRESET_PROVIDERS:readonly string[]=Object.freeze(['agents']);
/** Owner collection presets include Notion pages. This does not add a live Agent Service tool or Grant. */
export const SERVICE_PRESET_PROVIDERS:readonly string[]=Object.freeze([...SERVICE_PROVIDERS,'notion',...WORLD_PRESET_PROVIDERS]);

/** What to read: one operation of the Service's (SERVICE_ACTIONS) with the `id` or `query` it takes. Never a cursor:
 * a preset always reads the first page. */
export interface ServicePresetRead {operation:ServiceOperation;id?:string;query?:string}

export interface ServicePreset {
 /** Chosen by whoever saves it, so a board names it readably: lowercase letters, digits and `-`, at most 48. */
 id:string;
 /** What the person calls it ("Weekly signups"). */
 name:string;
 /** A provider in SERVICE_PRESET_PROVIDERS; Notion is collected by the World, not read live by an Agent; `agents` is
  * the World's own (WORLD_PRESET_PROVIDERS). */
 provider:string;
 read:ServicePresetRead;
 /** One optional line on what it is for. */
 note?:string;
 /** ISO instants, host clock. `createdAt` stays when a preset is saved again under its ID. */
 createdAt:string;
 updatedAt:string;
}

export const SERVICE_PRESET_LIMITS=Object.freeze({
 /** Presets one World keeps. */
 presets:100,
 id:48,name:80,note:300,
});

/** A preset as saved (`servicePresets` `save`): the host stamps the times. */
export interface ServicePresetSave {id:string;name:string;provider:string;read:ServicePresetRead;note?:string}
