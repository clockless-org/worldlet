// What the person's Agent remembers (contracts/harness-services.ts `memory`), shown read-only in Settings › Your Agent ›
// Memory (owner decision 2026-10-11): each entry of the files it keeps, and the plain request Fox's conversation gets
// when the person asks it to forget one. No Agent here has a command that forgets one entry (Hermes Agent's `hermes
// memory` sets up, shows, turns off or resets its provider; OpenClaw's `memory forget` drops a session's index, `memory
// reset` everything), so Worldlet never edits these files: the Agent's own memory tool does it when asked. Also the
// read-only views of Claude Code’s and Codex’s own settings that Settings › Your Agent shows with a note on where to change
// them: their standing rules and their MCP servers. Reading the files is the host's job (agent-runtime/harness-memory.ts).
// Kept ES-compatible for JavaScriptCore and Jint.
import type {HarnessConnection,HarnessMemoryEntry,HarnessStandingRule} from '../../contracts/harness-services.ts';
import type {AgentMcpServer} from './agent-integrations.ts';
import {standingRuleId} from './harness-approvals.ts';
import {connectionId,maskSecrets} from './harness-connections.ts';

const ENTRY=2000,ENTRIES=300;
const clip=(value:string,limit:number)=>value.length>limit?value.slice(0,limit-1)+'…':value;
/** One memory file as entries: split on `§` where the Agent separates items that way (Hermes Agent's memory tool), else
 * on blank lines; headings, rules and empty template lines are not entries. Ids are stable for the same text. */
export function memoryEntries(text:string,{harness,kind,where}:{harness:string;kind:HarnessMemoryEntry['kind'];where:string}):HarnessMemoryEntry[] {
 const parts=/(^|\n)\s*§\s*(\n|$)/.test(text)?text.split(/\n?\s*§\s*\n?/):text.split(/\r?\n[ \t]*\r?\n/);
 const seen=new Set<string>(),out:HarnessMemoryEntry[]=[];
 for(const part of parts){
  const lines=part.split(/\r?\n/).map(line=>line.trimEnd()).filter(line=>line.trim()&&!/^\s*(#{1,6}\s|---+$|===+$|<!--.*-->$)/.test(line));
  const entry=lines.join('\n').trim();
  if(entry.length<2||seen.has(entry))continue;
  seen.add(entry);
  out.push({id:standingRuleId('memory',harness,kind,where,entry).replace(/^rule-/,'mem-'),kind,text:clip(entry,ENTRY),where});
  if(out.length>=ENTRIES)break;
 }
 return out;
}
export const isMemoryEntryId=(value:unknown):value is string=>typeof value==='string'&&/^mem-[0-9a-f]{16}$/.test(value);
/** What Fox's conversation is asked when the person wants the Agent to forget one entry: plain words, the entry
 * quoted, the Agent's own memory tool doing it. */
export function memoryForgetRequest(title:string,entry:Pick<HarnessMemoryEntry,'text'>):string {
 const quoted=clip(entry.text.replace(/\s+/g,' ').trim(),400);
 return `Please forget this from ${title}’s memory: “${quoted}”. Use ${title}’s own memory to remove it, then tell me it is gone.`;
}

// Claude Code and Codex: shown, not changed --------------------------------------------------------------------------

/** Claude Code's user settings (settings.json `permissions.allow`, written by its `/permissions` and its prompts'
 * “don't ask again”): `Bash(npm test:*)` is a command it may run, anything else (`mcp__server__tool`, `WebFetch(domain:…)`,
 * `Edit`) a tool it may use. Its per-project rules live in each project's `.claude` folder and are not listed. */
export function claudeCodeStandingRules(settings:unknown):HarnessStandingRule[] {
 const allow=(settings as any)?.permissions?.allow;
 const entries=Array.isArray(allow)?[...new Set(allow.filter((item:unknown):item is string=>typeof item==='string'&&item.trim()!==''))]:[];
 return entries.slice(0,500).map(entry=>{
  const command=/^Bash\((.*)\)$/s.exec(entry.trim());
  return {id:standingRuleId('claude-code','',entry),allows:clip(command?command[1]:entry,300),agent:'*',kind:command?'command' as const:'tool' as const};
 });
}
/** Codex's rules files (`$CODEX_HOME/rules/*.rules`): each line its approvals append for an always-allowed command
 * prefix, exactly as it writes them (codex-rs/execpolicy/src/amend.rs: `prefix_rule(pattern=["git", "status"],
 * decision="allow")`). Rules the person wrote by hand in other shapes are their own policy and are not listed. */
export function codexStandingRules(rules:string):HarnessStandingRule[] {
 const out:HarnessStandingRule[]=[],seen=new Set<string>();
 for(const line of rules.split(/\r?\n/)){
  const match=/^prefix_rule\(pattern=(\[.*\]), decision="allow"\)\s*$/.exec(line.trim());
  if(!match)continue;
  let tokens:unknown;try{tokens=JSON.parse(match[1]);}catch{continue;}
  if(!Array.isArray(tokens)||!tokens.length||!tokens.every(token=>typeof token==='string'))continue;
  const allows=(tokens as string[]).map(token=>/[\s"']/.test(token)?JSON.stringify(token):token).join(' ');
  if(seen.has(allows))continue;seen.add(allows);
  out.push({id:standingRuleId('codex','',allows),allows:clip(allows,300),agent:'*',kind:'command'});
  if(out.length>=500)break;
 }
 return out;
}
/** The MCP servers an Agent's own settings name (agent-runtime/agent-integrations.ts readAgentIntegrations), as
 * connections shown read-only: masked, never removable from Worldlet. */
export function agentServerConnections(harness:string,servers:readonly AgentMcpServer[]):HarnessConnection[] {
 return servers.slice(0,300).map(server=>{
  const where=server.url?maskSecrets(server.url):maskSecrets([server.command??'',...(server.args??[])].filter(Boolean).join(' '));
  const sign=server.bearerTokenEnv||Object.keys(server.headers??{}).some(name=>/^authorization$/i.test(name))?'token' as const:'none' as const;
  return {id:connectionId(harness,'mcp','',server.name),kind:'mcp' as const,name:server.name,where:clip(where,160),enabled:true,sign,removable:false};
 });
}
/** Where the person changes what Settings › Your Agent shows read-only for an Agent with no command Worldlet uses for
 * it: one plain sentence per Agent and part, or '' when the page says nothing more. */
const READ_ONLY:Readonly<Record<string,Partial<Record<'skills'|'connections',string>>>>=Object.freeze({
 'claude-code':{skills:'Claude Code keeps these in the skills folder of its home (~/.claude/skills). Change them there.',connections:'Claude Code keeps these in its own settings. Change them in Claude Code itself.'},
 codex:{skills:'Codex keeps these in the skills folder of its home (~/.codex/skills). Change them there.',connections:'Codex keeps these in its own settings. Change them in Codex itself.'},
 pi:{skills:'pi keeps these in the skills folder of its home (~/.pi/agent/skills). Change them there.'},
});
export function harnessReadOnlyNote(harness:string,part:'skills'|'connections'):string {return READ_ONLY[harness]?.[part]??'';}
