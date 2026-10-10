// The oldest version of each Agent Worldlet works with (owner decision 2026-10-10). Each minimum is the oldest release
// that has everything Worldlet's adapter for that Agent uses (local-harness.ts and the files it names), and `needs`
// says what set it, so the next bump starts from there. Worldlet never updates an Agent itself: below the minimum it
// says so when the person connects it and offers the Agent's own update command, which runs in their Terminal like a
// sign-in (model-providers.ts). Changing a minimum is an edit to AGENT_VERSIONS. Kept ES-compatible for JavaScriptCore
// and Jint.
import type {LocalHarnessId} from './local-harness.ts';

export interface AgentVersionRule {
 /** The oldest supported version, as the Agent's `--version` prints it. */
 minimum:string;
 /** What needs it: the newest feature Worldlet uses, and where that is checked. */
 needs:string;
 /** The Agent's own update command (arguments after its executable), or null when it has none and is updated the way
  * it was installed; `howTo` then says how. */
 update:string[]|null;
 howTo:string;
}

export const AGENT_VERSIONS:Readonly<Record<LocalHarnessId,AgentVersionRule>>={
 // `--no-session-persistence` (cli.js) is new in 2.0.63; `--tools ""` in 2.0.31. `claude update` updates npm and native
 // installs itself and names the command for Homebrew and winget ones.
 'claude-code':{minimum:'2.0.63',needs:'`--no-session-persistence`, which keeps Fox\'s turns out of Claude Code\'s history (new in 2.0.63)',update:['update'],howTo:'Run `claude update` in Terminal.'},
 // Per-tool `mcp_servers.<server>.tools.<tool>.approval_mode` (codex-rs/core/src/config/types.rs) is new in 0.117.0; older
 // Codex ignores the key and cancels World tool calls that would ask. `codex update` only exists from 0.128.0, so an
 // older Codex is updated the way it was installed.
 codex:{minimum:'0.117.0',needs:'per-tool `approval_mode` for MCP servers, so World tools are not cancelled (new in 0.117.0)',update:null,howTo:'Update Codex the way you installed it: `npm install -g @openai/codex@latest`, or `brew upgrade --cask codex`.'},
 // `hermes config get <key> --json --raw` (harness-approvals' revoke reads a key unmasked; hermes_cli/subcommands/config.py)
 // is new in 0.21.4; older Hermes rejects the flag. OpenCode Go also needs 0.21.1+ (its x-opencode-session header).
 hermes:{minimum:'0.21.4',needs:'`hermes config get --json --raw` (new in 0.21.4); OpenCode Go also needs the session header of 0.21.1',update:['update'],howTo:'Run `hermes update` in Terminal.'},
 // `agent exec` (an embedded turn without a running Gateway, docs/cli/agent.md) and `approvals grants list`/`revoke`
 // (src/cli/exec-approvals-cli.ts) first ship in 2026.8.1; the 2026.7.33-7.35 extended-stable releases have neither.
 openclaw:{minimum:'2026.8.1',needs:'`openclaw agent exec` for one turn and `openclaw approvals grants` (both new in 2026.8.1)',update:['update'],howTo:'Run `openclaw update` in Terminal.'},
 // `--tools` allowlisting extension tools and `--no-tools` turning them off too (CHANGELOG 0.68.0). `pi update` only
 // exists from 0.70.3, and the package moved to @earendil-works/pi-coding-agent at 0.74.0.
 pi:{minimum:'0.68.0',needs:'`--tools` naming extension tools, which is how World tools reach pi (new in 0.68.0)',update:null,howTo:'Update pi the way you installed it: `npm install -g @earendil-works/pi-coding-agent` (it replaces @mariozechner/pi-coding-agent).'}
};

/** The first dotted version number in an Agent's `--version` line ("2.1.0 (Claude Code)", "codex-cli 0.130.0",
 * "Hermes Agent v0.21.3", "OpenClaw 2026.9.8"), or null. */
export function parseAgentVersion(line:unknown):string|null {
 // A whole word ("v" allowed before it, a build or prerelease suffix after), so a commit id's digits are never read.
 const match=typeof line==='string'?/(?:^|[\s(v])(\d+)\.(\d+)(?:\.(\d+))?(?=$|[\s)+,-])/.exec(line):null;
 return match?[match[1],match[2],match[3]??'0'].map(Number).join('.'):null;
}
/** Negative when `a` is older than `b`; numbers compared part by part, missing parts read as 0. */
export function compareAgentVersions(a:string,b:string):number {
 const x=a.split('.').map(Number),y=b.split('.').map(Number);
 for(let i=0;i<Math.max(x.length,y.length);i++){const d=(x[i]||0)-(y[i]||0);if(d)return d<0?-1:1;}
 return 0;
}

/** What the page shows about an Agent's version. `outdated` only when its version was read and is below the minimum: an
 * Agent whose version cannot be read is not turned away for it. `update`: Worldlet can open its own update command. */
export interface AgentVersionStatus {current:string|null;minimum:string;outdated:boolean;update:boolean;howTo:string}
export function agentVersionStatus(id:LocalHarnessId,line:unknown):AgentVersionStatus {
 const rule=AGENT_VERSIONS[id],current=parseAgentVersion(line);
 return {current,minimum:rule.minimum,outdated:current!==null&&compareAgentVersions(current,rule.minimum)<0,update:rule.update!==null,howTo:rule.howTo};
}
/** The sentence that turns a too-old Agent away when it is chosen. */
export function agentTooOldMessage(title:string,status:AgentVersionStatus):string {
 return `${title} ${status.current} is too old for Worldlet, which needs ${status.minimum} or newer. `+(status.update?`Choose Update ${title}, then try again.`:status.howTo+' Then try again.');
}
