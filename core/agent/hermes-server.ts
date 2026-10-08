// Hermes Agent as a resident service (owner decision 2026-10-08, Kelvin: "从我们的角度不应该区分这两种状态，他没装我们就
// 帮他装上，装上以后不管是原来他自己装的，还是我们帮他装的，我们 Fox、我们 Worldlet 连过去都是一条路径"): whichever Hermes Agent
// Fox uses, the standard one Worldlet set up or the person's own, runs as an always-online service on the computer, started
// at login and kept running after Worldlet quits, like a Telegram bot. Shared rules only: where that profile's API server
// listens and with which key (as Hermes Agent 0.21's gateway resolves them, gateway/config_env.py `_api_server`), what
// Worldlet adds when it has no key, when a profile must not become a service, and World tools registered on Hermes.
// Reading the files, running `hermes gateway` and the HTTP calls are the host's (agent-runtime/hermes-service.ts and
// harness-sessions.ts HermesServerConversation). Kept ES-compatible for JavaScriptCore and Jint.
import {hermesConfigValues} from './harness-tools.ts';
import {turnGuardedWrite} from './turn-trust.ts';

const record=(value:unknown):Record<string,any>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,any>:{};
/** Hermes Agent's API server port when nothing sets one (gateway/platforms/api_server.py DEFAULT_PORT). */
export const HERMES_SERVER_PORT=8642;
/** What Hermes refuses as an API_SERVER_KEY (hermes_cli/auth.py has_usable_secret, min_length 16, and its placeholders):
 * the server will not start with one, so Worldlet treats it as no key. */
const PLACEHOLDERS=['*','**','***','changeme','your_api_key','your_api_key_here','your-api-key','placeholder','example','dummy','null','none'];
export const usableHermesServerKey=(value:unknown):value is string=>typeof value==='string'&&value.trim().length>=16&&PLACEHOLDERS.indexOf(value.trim().toLowerCase())<0;

/** `KEY=value` lines of a profile's `.env` (quotes removed). */
export function dotenvValues(text:string):Record<string,string> {
 const values:Record<string,string>={};
 for(const line of String(text??'').split(/\r?\n/)){const match=/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);if(match)values[match[1]]=match[2].replace(/^(['"])(.*)\1$/,'$2');}
 return values;
}
/** One profile's API server as its gateway starts it: the `.env` (API_SERVER_KEY, API_SERVER_PORT, API_SERVER_HOST) wins
 * over config.yaml `platforms.api_server.extra` (key, port, host); `platforms.api_server.enabled: false` keeps it off
 * whatever the key (an explicit disable beats the environment since Hermes 0.21). `key` is null when none is usable.
 * Read only: the person's own key and port are used as they are, never replaced. */
export interface HermesServerSettings {port:number;host:string;key:string|null;off:boolean}
export function hermesServerSettings(yaml:string,dotenv:string):HermesServerSettings {
 const server=record(record(hermesConfigValues(String(yaml??'')).platforms).api_server),extra=record(server.extra),env=dotenvValues(dotenv);
 const key=[env.API_SERVER_KEY,extra.key].find(usableHermesServerKey)??null;
 const port=[env.API_SERVER_PORT,extra.port].map(Number).find(value=>Number.isInteger(value)&&value>0&&value<65536)??HERMES_SERVER_PORT;
 const host=[env.API_SERVER_HOST,extra.host].find(value=>typeof value==='string'&&!!value.trim())?.trim()??'127.0.0.1';
 return {port,host,key:key?key.trim():null,off:String(server.enabled).toLowerCase()==='false'};
}
/** What Worldlet appends to the profile's `.env` when it has no usable key: a strong random key (`secret`, 64 hex digits
 * from the host's random source) and the loopback address, so the server answers on this computer only. */
export function hermesServerEnvLines(secret:string):string {
 if(!usableHermesServerKey(secret)||/\s/.test(secret))throw new Error('The API server key is not usable.');
 return '# Hermes Agent API server for Fox on this computer only, added by Worldlet (owner decision 2026-10-08).\nAPI_SERVER_KEY='+secret+'\nAPI_SERVER_HOST=127.0.0.1\n';
}
/** A profile whose model is this computer's Codex sign-in, borrowed read-only (`worldlet_source`/`worldlet_route`
 * local-codex, harness/hermes/model_tiers.py configured_source): its gateway service would run Hermes' own command line
 * without that borrow (harness/hermes/hermes_command.py), and refreshing the single-use Codex token there would sign the
 * Codex app out. Such a profile is not made a service. */
export function hermesBorrowsCodex(yaml:string):boolean {
 const model=record(hermesConfigValues(String(yaml??'')).model);
 return model.worldlet_source==='local-codex'||model.worldlet_route==='local-codex';
}
// World tools on Hermes (owner decision 2026-10-08 19:15Z, Kelvin: "把 World 工具挂到 Hermes 上，让它所有渠道都能用"): Worldlet's
// `worldlet` MCP server (the same two gateway tools) is registered in the profile's `mcp_servers`, so every Hermes channel
// (Fox through its API server, Telegram, the phone…) can use them. Hermes 0.21.3's API server runs only its own tools, so
// this is how Fox's conversation reaches World tools there. Its stdio shim relays to a standing loopback endpoint in the
// running Worldlet; the endpoint and its token (rotated each app run) are in an owner-only file in the profile.
export const HERMES_WORLD_TOOLS='worldlet';
export const HERMES_WORLD_TOOLS_SHIM='worldlet-mcp-standing.cjs';
export interface HermesWorldToolsServer {command:string;args:string[];env:Record<string,string>}
/** The profile's `worldlet` entry: `missing`, `current` (exactly `server`), `outdated` (Worldlet's, another Electron or
 * place, say after an update), `off` (Worldlet's, turned off by the person: left so) or `theirs` (another server by that
 * name: never touched). */
export type HermesWorldToolsState='missing'|'current'|'outdated'|'off'|'theirs';
export function hermesWorldTools(yaml:string,server:HermesWorldToolsServer):HermesWorldToolsState {
 const entry=worldToolsEntry(yaml);
 if(!Object.keys(entry).length)return 'missing';
 const args:unknown[]=Array.isArray(entry.args)?entry.args:[];
 if(!args.some(arg=>String(arg).slice(-HERMES_WORLD_TOOLS_SHIM.length)===HERMES_WORLD_TOOLS_SHIM))return 'theirs';
 if(String(entry.enabled).toLowerCase()==='false')return 'off';
 const env=record(entry.env),same=entry.command===server.command&&args.join('\n')===server.args.join('\n')&&Object.keys(server.env).every(key=>String(env[key]??'')===server.env[key]);
 return same?'current':'outdated';
}
const worldToolsEntry=(yaml:string)=>record(record(hermesConfigValues(String(yaml??'')).mcp_servers)[HERMES_WORLD_TOOLS]);
/** Whether the profile can reach World tools through Worldlet's entry (Fox's conversation on its API server needs it). */
export function hermesWorldToolsRegistered(yaml:string):boolean {
 const entry=worldToolsEntry(yaml),args:unknown[]=Array.isArray(entry.args)?entry.args:[];
 return String(entry.enabled).toLowerCase()!=='false'&&args.some(arg=>String(arg).slice(-HERMES_WORLD_TOOLS_SHIM.length)===HERMES_WORLD_TOOLS_SHIM);
}
/** Hermes' own `hermes mcp add` for it (it connects first and saves only this entry; other entries are never touched),
 * answered on stdin: overwrite Worldlet's outdated entry, enable every tool it lists. Null when nothing is to change. */
export function hermesWorldToolsCommand(server:HermesWorldToolsServer,state:HermesWorldToolsState):{args:string[];stdin:string}|null {
 if(state!=='missing'&&state!=='outdated')return null;
 const env=Object.keys(server.env).map(key=>key+'='+server.env[key]);
 return {args:['mcp','add',HERMES_WORLD_TOOLS,'--command',server.command,...env.length?['--env',...env]:[],'--args',...server.args],stdin:(state==='outdated'?'y\n':'')+'\n'};
}
/** World tools reached from a Hermes channel outside any Fox turn (Telegram, the phone, a cron run): such a call is a
 * turn of its own that starts untrusted, so Core's write rule refuses guarded writes, and only reads and a draft for
 * the person's review run; everything else is refused with HERMES_CHANNEL_READ_ONLY. Fail closed: a tool not named here
 * is refused. `_world_authorize` names the service it authorizes. */
const CHANNEL_TOOLS=['query_world_items','read_world_history','read_companion_archive','meeting_decisions','read_world_source','read_connected_google','prepare_email','_source_begin','_source_result','_email_review'];
export const HERMES_CHANNEL_READ_ONLY='This came through another Hermes channel, outside a conversation with Fox in Worldlet: only reading and preparing a draft for the person to review in Worldlet run here. Anything that changes the World needs the person\'s confirmation: ask them to do it with Fox in Worldlet.';
export function hermesChannelToolAllowed(event:{name?:unknown;args?:unknown}):boolean {
 const args=record(event.args),name=event.name==='_world_authorize'?args.name:event.name;
 return CHANNEL_TOOLS.indexOf(String(name))>=0;
}
/** A standing-server call that is not Fox's own (HermesOwnCalls finds no announcement of it in a running Fox turn's
 * stream) may come from another channel (MCP calls name no Hermes session), so a guarded World write (Core's
 * turnGuardedWrite: item, check, routine, note and preference writes, a DoorDash cart, an Applet task) never runs on it
 * directly (owner decision 2026-10-08 19:15Z: writes keep needing the person's confirmation): during a Fox turn it waits
 * for the person on the approval card in Fox's dialogue (Allow once or Deny, never Always), and with no turn it is
 * refused (HERMES_CHANNEL_READ_ONLY). Fox's own calls never come here: they run under the turn's trust with the undo
 * notice after the fact (Kelvin, #2126: Worldlet asks as little as possible). Null: not a guarded write. The card names
 * the change as the tool and its arguments, cut short. */
export function hermesStandingWriteApproval(name:string,args:Record<string,unknown>,agent='Hermes Agent'):{title:string;detail:string;choices:['once','deny']}|null {
 // Handing work to an Applet task is not guarded in a Fox turn (turn-trust.ts, owner decision 2026-10-08): the task runs
 // under the person's own words. A standing-server call may not be the person's at all, and the task then writes on its
 // own runtime without this card, so here it asks too.
 const target=turnGuardedWrite({type:'tool',name,args})??(name==='start_applet_task'?name:null);
 if(!target)return null;
 let detail=target+' '+JSON.stringify(args??{});
 if(detail.length>400)detail=detail.slice(0,399)+'…';
 return {title:agent+' wants to change your World',detail,choices:['once','deny']};
}
export const HERMES_STANDING_WRITE_DECLINED='The person did not confirm this change in Worldlet, so nothing changed. Do not try it again unless they ask.';

// Fox's own calls on the standing server (owner decision on PR #2237: only calls that are not Fox's own get the card).
// Hermes announces each tool call on the running turn's own stream before it runs it (agent/tool_executor.py
// _begin_tool_execution: tool.started and tool_start_callback before execute): the API server as a `function_call`
// `response.output_item.added` with its arguments (gateway/platforms/api_server_openai_routes.py emit_tool_started), ACP
// as a `tool_call` session update titled with the tool's name and carrying its arguments as rawInput when the tool is
// not one of Hermes' own (acp_adapter/tools.py _build_tool_start). An MCP tool is named `mcp__<server>__<tool>`
// (tools/mcp_tool_schema.py), and Hermes passes the arguments to the server unchanged, so a standing call that equals a
// pending announcement of the same tool is the turn's. The call id is not passed through MCP: arguments are the key.
export interface HermesAnnouncedCall {name:string;arguments:unknown}
const WORLD_TOOL_PREFIX='mcp__'+HERMES_WORLD_TOOLS+'__';
const parsed=(value:unknown)=>{if(typeof value!=='string')return value??{};try{return JSON.parse(value||'{}');}catch{return value;}};
const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical((value as Record<string,unknown>)[key])])):value;
const sameCall=(announced:HermesAnnouncedCall,call:{name:unknown;arguments:unknown})=>announced.name===WORLD_TOOL_PREFIX+String(call.name)&&JSON.stringify(canonical(parsed(announced.arguments)))===JSON.stringify(canonical(parsed(call.arguments)));
/** An announcement on the API server stream (a `function_call` item added) of a call to Worldlet's standing server. */
export function hermesStreamAnnouncement(item:unknown):HermesAnnouncedCall|null {
 const value=record(item);
 return value.type==='function_call'&&typeof value.name==='string'&&value.name.startsWith(WORLD_TOOL_PREFIX)?{name:value.name,arguments:value.arguments}:null;
}
/** An ACP `tool_call` session update announcing a call to Worldlet's standing server (title `<tool>` or `<tool>: …`). */
export function hermesAcpAnnouncement(update:unknown):HermesAnnouncedCall|null {
 const value=record(update),name=typeof value.title==='string'?value.title.split(':')[0].trim():'';
 return value.sessionUpdate==='tool_call'&&name.startsWith(WORLD_TOOL_PREFIX)?{name,arguments:value.rawInput}:null;
}
/** One Fox turn's announced calls. `take` answers whether a standing call is one of them (each announcement matches once),
 * waiting up to `wait` ms: the stream frame and the MCP call travel apart, so the call may come first. */
export class HermesOwnCalls {
 private calls:HermesAnnouncedCall[]=[];private waiters=new Set<()=>void>();private closed=false;
 announce(call:HermesAnnouncedCall){if(this.closed)return;this.calls.push(call);if(this.calls.length>64)this.calls.shift();for(const wake of [...this.waiters])wake();}
 /** Whether the call is pending now, without taking it (several Fox turns: which one it belongs to). */
 has(call:{name:unknown;arguments:unknown}){return this.calls.some(item=>sameCall(item,call));}
 async take(call:{name:unknown;arguments:unknown},wait=HERMES_ANNOUNCE_WAIT_MS):Promise<boolean> {
  const found=()=>{const at=this.calls.findIndex(item=>sameCall(item,call));if(at<0)return false;this.calls.splice(at,1);return true;};
  if(found())return true;
  if(wait<=0||this.closed)return false;
  return await new Promise<boolean>(resolve=>{
   const wake=()=>{if(found())done(true);else if(this.closed)done(false);};
   const done=(value:boolean)=>{clearTimeout(timer);this.waiters.delete(wake);resolve(value);};
   const timer=setTimeout(()=>done(found()),wait);
   this.waiters.add(wake);
  });
 }
 /** The turn ended: nothing pending, or announced later, is its own any longer. */
 close(){this.closed=true;this.calls=[];for(const wake of [...this.waiters])wake();}
}
export const HERMES_ANNOUNCE_WAIT_MS=1500;
