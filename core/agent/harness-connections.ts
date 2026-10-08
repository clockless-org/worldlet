// The person's own connections in their Agent (contracts/harness-services.ts `connections`): the MCP servers and chat
// accounts they set up there, shown in the World with what each was last used for, and a server added or removed only
// through that Agent's own command after the person confirmed it. Shared rules only: reading Hermes Agent's
// `mcp_servers` (config.yaml) and chat tokens (.env, names only) and OpenClaw's `openclaw mcp status --json` and
// `openclaw channels list --json`, masking anything secret, matching a tool call in the Agent's history to its server,
// and the exact arguments of each change. Running the commands and reading the history is the host's job
// (agent-runtime/harness-connections.ts). Kept ES-compatible for JavaScriptCore and Jint.
import type {HarnessConnection,HarnessConnectionAdd,HarnessConnectionChange,HarnessConnectionUse} from '../../contracts/harness-services.ts';
import {standingRuleId} from './harness-approvals.ts';
import {hermesConfigValues} from './harness-tools.ts';

const record=(value:unknown):Record<string,any>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,any>:{};
const text=(value:unknown)=>typeof value==='string'?value.trim():'';
const clip=(value:string,limit:number)=>value.length>limit?value.slice(0,limit-1)+'…':value;
const off=(value:unknown)=>value===false||/^(false|no|0|off)$/i.test(text(value));
/** A connection's id: short, printable and stable for the same Agent, profile and name. */
export const connectionId=(harness:string,kind:string,agent:string,name:string)=>standingRuleId('connection',harness,kind,agent,name).replace(/^rule-/,'conn-');
export const isConnectionId=(value:unknown):value is string=>typeof value==='string'&&/^conn-[0-9a-f]{16}$/.test(value);

// Never a secret ------------------------------------------------------------------------------------------------

const MASK='•••';
const SECRET_NAME=/(token|secret|passw(or)?d|api[_-]?key|apikey|auth|bearer|credential|private[_-]?key|session)/i;
/** `text` with whatever could be a secret replaced by •••: a URL's user and password and query values, `NAME=value`
 * where the name says secret, a Bearer token, and long opaque strings (keys such as `ghp_…`, `sk-…`). */
export function maskSecrets(value:string):string {
 return value
  .replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi,'$1'+MASK+'@')
  .replace(/([?&][^=&#\s]+=)[^&#\s]+/g,'$1'+MASK)
  .replace(/\b(Bearer|Basic|token)(\s+)\S+/gi,'$1$2'+MASK)
  .replace(/\b([A-Za-z_][A-Za-z0-9_-]*)(=|:\s*)(?!•|Bearer\b|Basic\b)("[^"]*"|'[^']*'|\S+)/g,(all,name:string,sep:string)=>SECRET_NAME.test(name)?name+sep+MASK:all)
  .replace(/\b(?:sk|pk|rk|ghp|gho|ghu|ghs|github_pat|glpat|xox[abpr]|lin_api|ntn|secret|key)[-_][A-Za-z0-9_-]{8,}/g,match=>match.slice(0,4)+MASK)
  .replace(/[A-Za-z0-9_+=-]{32,}/g,match=>/[0-9]/.test(match)&&/[A-Za-z]/.test(match)?match.slice(0,4)+MASK:match);
}
/** Where a server is, said without secrets: its address, or its command and first arguments. */
function serverWhere(entry:Record<string,any>):string {
 const url=text(entry.url)||text(entry.serverUrl);
 if(url)return clip(maskSecrets(url),160);
 const args=Array.isArray(entry.args)?entry.args.filter((a:unknown)=>typeof a==='string'):[];
 return clip(maskSecrets([text(entry.command),...args].filter(Boolean).join(' ')),160);
}

// Hermes Agent --------------------------------------------------------------------------------------------------

/** The chat platforms whose primary credential is one `.env` token (Hermes 0.21 gateway/config.py
 * PLATFORM_TOKEN_ENV_NAMES); a platform that signs in another way is not listed. */
export const HERMES_ACCOUNT_TOKENS:Readonly<Record<string,{name:string;channel:string}>>=Object.freeze({
 TELEGRAM_BOT_TOKEN:{name:'Telegram',channel:'telegram'},DISCORD_BOT_TOKEN:{name:'Discord',channel:'discord'},SLACK_BOT_TOKEN:{name:'Slack',channel:'slack'},
 MATTERMOST_TOKEN:{name:'Mattermost',channel:'mattermost'},MATRIX_ACCESS_TOKEN:{name:'Matrix',channel:'matrix'},WEIXIN_TOKEN:{name:'Weixin',channel:'weixin'}});
/** The names set in a `.env` (with a value), never the values. */
export function dotenvNames(env:string):string[] {
 const names:string[]=[];
 for(const line of env.split(/\r?\n/)){const match=/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);if(match&&match[2].replace(/^(['"])(.*)\1$/,'$2').trim())names.push(match[1]);}
 return names;
}
/** One Hermes profile's connections: each `mcp_servers` entry (a disabled one too) and each chat account its `.env`
 * names. `agent`: the profile; `main`: the one Fox talks through by default. */
export function hermesConnections(yaml:string,envNames:readonly string[],agent:string,{main=false}:{main?:boolean}={}):HarnessConnection[] {
 const servers=record(hermesConfigValues(yaml).mcp_servers),about={agent,...main?{main:true}:{}};
 const found:HarnessConnection[]=Object.entries(servers).slice(0,100).filter(([,raw])=>raw&&typeof raw==='object').map(([name,raw])=>{
  const entry=record(raw),headers=record(entry.headers),env=record(entry.env);
  const sign:HarnessConnection['sign']=text(entry.auth).toLowerCase()==='oauth'?'oauth':Object.keys(headers).length||Object.keys(env).some(key=>SECRET_NAME.test(key))?'token':'none';
  return {id:connectionId('hermes','mcp',agent,name),kind:'mcp',name,where:serverWhere(entry),enabled:!off(entry.enabled),sign,...about,removable:true};
 });
 for(const key of envNames)if(HERMES_ACCOUNT_TOKENS[key]){const account=HERMES_ACCOUNT_TOKENS[key];found.push({id:connectionId('hermes','account',agent,account.channel),kind:'account',name:account.name,where:account.channel,enabled:true,sign:'token',...about});}
 return found;
}
/** Hermes Agent names an MCP tool `mcp__<server>__<tool>` (0.21; `mcp_<server>_<tool>` before), anything outside
 * [A-Za-z0-9_] in the server's name as `_` (tools/mcp_tool_schema.py). */
export const hermesMcpPrefixes=(server:string)=>{const safe=server.replace(/[^A-Za-z0-9_]/g,'_');return ['mcp__'+safe+'__','mcp_'+safe+'_'];};

// OpenClaw ------------------------------------------------------------------------------------------------------

/** OpenClaw's `openclaw mcp status --json` (`{path, servers:[{name, enabled, transport, launch, auth, authStatus}]}`,
 * credential-bearing arguments already redacted by it, masked again here) and `openclaw channels list --json`
 * (`{chat:{<channel>:{accounts:[ids], label, origin}}}`). Its servers and accounts belong to the whole Gateway. */
export function openClawConnections(status:unknown,channels:unknown):HarnessConnection[] {
 const found:HarnessConnection[]=[];
 for(const raw of (Array.isArray(record(status).servers)?record(status).servers:[]).slice(0,100)){
  const entry=record(raw),name=text(entry.name);
  if(!name)continue;
  const state=text(record(entry.authStatus).state);
  const sign:HarnessConnection['sign']=text(entry.auth)==='oauth'?state==='authorized'?'oauth':'needs-sign-in':'none';
  const launch=text(entry.launch).replace(/^(streamable-http|sse|stdio)\s+/,'');
  found.push({id:connectionId('openclaw','mcp','',name),kind:'mcp',name,where:clip(maskSecrets(launch||text(entry.transport)),160),enabled:entry.enabled!==false,sign,removable:true});
 }
 for(const [channel,raw] of Object.entries(record(record(channels).chat)).slice(0,50)){
  const entry=record(raw),label=text(entry.label)||channel,accounts=Array.isArray(entry.accounts)?entry.accounts.filter((a:unknown)=>typeof a==='string'&&a):[];
  for(const account of accounts.slice(0,20))found.push({id:connectionId('openclaw','account',account,channel),kind:'account',name:account==='default'?label:label+' · '+account,where:channel,enabled:true});
 }
 return found;
}
/** OpenClaw names an MCP tool `<server>__<tool>`, the server's name with anything outside [A-Za-z0-9_-] as `-`, led by
 * `mcp-` when it does not start with a letter, at most 30 characters (agents/agent-bundle-mcp-names.ts). */
export const openClawMcpPrefixes=(server:string)=>{let safe=server.trim().replace(/[^A-Za-z0-9_-]/g,'-')||'mcp';if(!/^[A-Za-z]/.test(safe))safe='mcp-'+safe;return [safe.slice(0,30)+'__'];};

// What each was last used for -------------------------------------------------------------------------------------

/** One use in the Agent's own history: a tool call (`tool`, its full name there) or a conversation on a channel. */
export type ConnectionUse={at:number;tool?:string;channel?:string;thread?:string};
/** `connections` with each one's newest use: a server by the tool calls named with its prefix (`prefixes`, the
 * Harness's own naming; the longest matching prefix wins), an account by the conversations on its channel. */
export function withLastUse(connections:HarnessConnection[],uses:readonly ConnectionUse[],prefixes:(server:string)=>string[]):HarnessConnection[] {
 const servers=connections.filter(c=>c.kind==='mcp').flatMap(c=>prefixes(c.name).map(prefix=>({id:c.id,prefix:prefix.toLowerCase()}))).sort((a,b)=>b.prefix.length-a.prefix.length);
 const newest=new Map<string,HarnessConnectionUse>();
 const keep=(id:string,use:HarnessConnectionUse)=>{const had=newest.get(id);if(!had||use.at>had.at)newest.set(id,use);};
 for(const use of uses){
  if(!Number.isFinite(use.at)||use.at<=0)continue;
  const thread=use.thread?{thread:clip(use.thread,120)}:{};
  if(use.tool){
   const name=use.tool.toLowerCase(),match=servers.find(s=>name.startsWith(s.prefix));
   if(match)keep(match.id,{at:use.at,tool:clip(use.tool.slice(match.prefix.length),80),...thread});
  }else if(use.channel)for(const c of connections)if(c.kind==='account'&&c.where===use.channel.toLowerCase())keep(c.id,{at:use.at,...thread});
 }
 return connections.map(c=>newest.has(c.id)?{...c,lastUsed:newest.get(c.id)}:c);
}

// Changes -------------------------------------------------------------------------------------------------------

/** A server the World may add: a plain name, and an http(s) address with no user or password in it, or a command
 * with at most 30 arguments (none naming a secret: a server that needs a token is set up in the Agent itself). */
export function readConnectionAdd(value:unknown):HarnessConnectionAdd {
 const v=record(value),name=text(v.name);
 if(!/^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(name))throw Error('Name it with letters, digits, - or _ (up to 48), starting with a letter.');
 if(typeof v.url==='string'&&v.url.trim()){
  const url=v.url.trim();
  if(!/^https?:\/\/[^\s/?#@]+(\/[^\s]*)?$/i.test(url)||url.length>500)throw Error('Type its address, starting with https://.');
  if(maskSecrets(url)!==url)throw Error('Leave tokens out of the address; add a server that needs one in your Agent itself.');
  return {name,url};
 }
 const words=typeof v.command==='string'?commandWords(v.command):[];
 if(!words.length)throw Error('Type its address or the command that starts it.');
 if(words.length>31||words.some(word=>word.length>400))throw Error('That command is too long.');
 if(words.some(word=>maskSecrets(word)!==word))throw Error('Leave tokens out of the command; add a server that needs one in your Agent itself.');
 return {name,command:words[0],args:words.slice(1)};
}
/** A command line as its words: spaces separate them, quotes keep spaces in one, nothing else is special (never a shell). */
export function commandWords(line:string):string[] {
 const words:string[]=[];let word='',quote='',any=false;
 for(const char of line.trim()){
  if(quote){if(char===quote)quote='';else word+=char;continue;}
  if(char==='"'||char==="'"){quote=char;any=true;continue;}
  if(/\s/.test(char)){if(word||any)words.push(word);word='';any=false;continue;}
  word+=char;
 }
 if(quote)throw Error('A quote is not closed.');
 if(word||any)words.push(word);
 return words;
}
const shown=(word:string)=>/^[A-Za-z0-9_@%+=:,./-]+$/.test(word)?word:JSON.stringify(word);
/** The words shown for a command, quoted where they need it. */
export const commandLine=(command:string,args:readonly string[])=>[command,...args].map(shown).join(' ');
/** Hermes Agent: `hermes mcp add <name> --url <url>` or `--command <cmd> --args …` (its own discovery-first add,
 * answered on stdin: no sign-in, then every tool it lists), `hermes mcp remove <name>` (answered yes). */
export function hermesConnectionCommand(change:HarnessConnectionChange,name?:string):{args:string[];stdin:string} {
 if('remove' in change)return {args:['mcp','remove',name!],stdin:'y\n'};
 const add=change.add;
 return 'url' in add?{args:['mcp','add',add.name,'--url',add.url],stdin:'n\n\n\n'}:{args:['mcp','add',add.name,'--command',add.command,...add.args.length?['--args',...add.args]:[]],stdin:'\n\n'};
}
/** OpenClaw: `openclaw mcp add <name> --url <url> --transport streamable-http` or `--command <cmd> --arg …` (it
 * connects before saving), `openclaw mcp unset <name>`. */
export function openClawConnectionCommand(change:HarnessConnectionChange,name?:string):{args:string[];stdin:string} {
 if('remove' in change)return {args:['mcp','unset',name!],stdin:''};
 const add=change.add;
 return {args:'url' in add?['mcp','add',add.name,'--url',add.url,'--transport','streamable-http']:['mcp','add',add.name,'--command',add.command,...add.args.flatMap(arg=>['--arg',arg])],stdin:''};
}
/** The last line a command printed that says why it failed (colour codes, check marks and a prompt it printed before
 * on the same line removed), masked. */
export function commandReason(output:string):string {
 const lines=output.replace(/\u001b\[[0-9;]*m/g,'').split(/\r?\n/).map(line=>line.slice(line.lastIndexOf('✗')+1).replace(/^.*\]:\s+/,'').replace(/^\s*[⚠✓]\s*/,'').trim()).filter(Boolean);
 const said=[...lines].reverse().find(line=>/fail|error|not |invalid|cannot|could not|already|refus|unknown|missing|denied|timed out/i.test(line))??lines.at(-1)??'';
 return clip(maskSecrets(said),300);
}
