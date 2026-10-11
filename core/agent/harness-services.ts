// Which Harness services (contracts/harness-services.ts) each local Harness provides today, and how. The World reads
// this, never a Harness name, to decide what it can offer; an adapter that gains a service updates its row here and
// scripts/harness-contract-check.ts keeps every row valid. Plan and owner goal: contracts/HARNESS.md#harness-services-v2.
import {validateHarnessServices,type HarnessApprovalFeatures,type HarnessServiceName,type HarnessServiceMode,type HarnessServices,type HarnessLocation} from '../../contracts/harness-services.ts';
const row=(harness:string,services:HarnessServices['services'],approvalFeatures?:HarnessApprovalFeatures)=>validateHarnessServices({version:2,harness,services,...approvalFeatures?{approvalFeatures}:{}});
export const HARNESS_SERVICES:Readonly<Record<string,HarnessServices>>=Object.freeze({
 // History in mode `files` for every Harness below: its own folder read again by agent-runtime/agent-history.ts and
 // appended by fox/history-sync.ts (core/agent/PORTABILITY.md#history-read-continuously).
 // One resident `hermes acp` process, an ACP session per Fox thread on the person's own Hermes home, its permission
 // prompts answered in the World (agent-runtime/harness-sessions.ts; also on a turn that falls back to a process of its
 // own, local-harness.ts TurnApprovals); history from state.db; webhook runs from state.db
 // (`source` webhook); tools from config.yaml's ACP toolsets (core/agent/harness-events.ts, harness-tools.ts); its cron jobs run on its own
 // ticker (`hermes gateway`), each run read from cron/output (Worldlet's own routines in the attached profile share
 // Hermes' claim, so they never run twice; core/agent/PORTABILITY.md#scheduled-jobs-on-the-persons-own-agent).
 // Its profiles (`agents`, files: ~/.hermes and profiles/<name>/, each with its SOUL.md and config.yaml); a chosen one
 // answers an Applet's thread through `hermes -p <name>` (agent-runtime/harness-agents.ts).
 // A reply the person approved goes into the Telegram or Discord chat a conversation came from through `hermes send
 // --to <platform>:<chat>[:<thread>]`, with its gateway's own credentials (`send`, agent-runtime/harness-send.ts).
 // No `voice`: its speech is an Agent tool (`text_to_speech`) and the dashboard's `/api/audio/speak`, with no command
 // that speaks one line, so Fox's replies are read by a system voice (core/agent/harness-voice.ts).
 // Its standing rules: each profile's `command_allowlist` in config.yaml (where an Always is saved), revoked with its own
 // `hermes config set`; a running Hermes reads the list only when it starts, so Worldlet restarts its own ACP process.
 // What an approved command or edit changed: the ACP tool call's diff content (core/agent/harness-approvals.ts).
 // Its models (`models`): the ones its `session/new` lists, an Applet's thread switched with ACP `session/set_model`
 // (core/agent/harness-models.ts); each turn's tokens from the `session/prompt` result's usage, never a cost (it sends none).
 // Its connections (`connections`, files): each profile's `mcp_servers` in config.yaml and the chat tokens its .env names
 // (names only), each server's last use from the `mcp__<server>__` tool rows in state.db; a server added or removed with
 // its own `hermes mcp add` / `hermes mcp remove` in that profile's HERMES_HOME (agent-runtime/harness-connections.ts).
 // Its skills (`skills`, files): `<home>/skills/**/SKILL.md` without the ones it ships (`.bundled_manifest`), each last
 // run from its own `skills/.usage.json`; a skill the person saves is a new `skills/<name>/SKILL.md`, where its own
 // `skill_manage` creates one, since its command line installs only from a hub or a URL (agent-runtime/harness-skills.ts).
 hermes:row('hermes',{conversation:'native',history:'files',schedule:'files',approvals:'native',events:'files',tools:'files',agents:'files',models:'native',send:'native',connections:'files',skills:'files'},
  {rules:'files',revoke:'restart',revokeNote:'Hermes Agent reads its allowlist when it starts, so Worldlet restarts its own conversation with it. If `hermes gateway` runs, restart it too.',changes:'diffs'}),
 // A session per Fox thread on its running Gateway (`/v1/responses`, World tools as client function tools), else
 // `openclaw agent exec` per turn in the person's workspace; history from openclaw-agent.sqlite; its automations run in
 // its Gateway, each run read from task_runs in state/openclaw.sqlite; hook, Gmail and IMAP runs from its `hook:` sessions;
 // tools from openclaw.json's tool policy and plugins; phone calls from the voice-call plugin's own store (`calls`,
 // core/agent/harness-calls.ts). Its agents (`agents`, files: openclaw.json and each agent's workspace instructions); a
 // chosen one answers an Applet's thread on the Gateway as `openclaw/<id>`. Its exec approvals for the session a Fox
 // turn runs on come from the Gateway's WebSocket while the turn runs and are answered there (`exec.approval.resolve`,
 // agent-runtime/harness-sessions.ts GatewayApprovals). A reply the person approved goes to the channel a session was
 // delivered to (its `deliveryContext`) through `openclaw message send` (`send`, agent-runtime/harness-send.ts). Hermes
 // Agent above keeps no call record (its optional telephony skill logs none), so it declares no `calls`.
 // Fox's spoken replies in its own text-to-speech provider and voice: `openclaw infer tts convert` (`voice`,
 // core/agent/harness-voice.ts, agent-runtime/harness-voice.ts).
 // Its standing rules through its own CLI: `openclaw approvals get --json` (allow-always allowlist entries and MCP tool
 // grants per agent) and `approvals grants list` (automation grants), revoked with `approvals set --stdin` and
 // `approvals grants revoke`, which take effect at the next command. An approved command's result arrives as the
 // Gateway's tool event for the turn's session: its output, never which files it changed.
 // Its models (`models`): the ones openclaw.json names for the agent, an Applet's thread switched with the Gateway's
 // `x-openclaw-model` header (`--model` on a per-turn `agent exec`); each response's tokens from its `usage`, no cost.
 // Its connections (`connections`, native): `openclaw mcp status --json` and `openclaw channels list --json`, each
 // server's last use from its `<server>__` tool calls in openclaw-agent.sqlite; added with `openclaw mcp add` (it connects
 // first) and removed with `openclaw mcp unset`.
 // Its skills (`skills`, native): each agent's workspace `skills/` and the shared `skills/` in its state folder, read
 // there; a skill the person saves goes in with its own `openclaw skills install <folder> --as <name> --agent <id>`.
 // It records a skill's use only behind its Gateway (`skills curator status`), so the World's synced turns say when.
 openclaw:row('openclaw',{conversation:'native',history:'files',schedule:'files',approvals:'native',events:'files',calls:'files',tools:'files',agents:'files',models:'native',send:'native',voice:'native',connections:'native',skills:'native'},
  {rules:'native',revoke:'live',revokeNote:'A revoked MCP tool grant stops in OpenClaw’s next session.',changes:'output'}),
 // Claude Code and pi: their session files; Codex: its rollout files and session_index.jsonl.
 'claude-code':row('claude-code',{conversation:'native',history:'files'}),
 codex:row('codex',{conversation:'native',history:'files'}),
 pi:row('pi',{conversation:'native',history:'files'}),
 // Fox's Agent on another computer (core/phone/README.md#another-computers-agent): each turn goes sealed to the paired
 // Worldlet there, which runs it on that computer's own Harness in a session per Fox thread and sends its World tool
 // calls back, and its permission prompts come here as approval cards; its `status` names the computer, and that Worldlet's `desktop` slot lists the person's agents there.
 remote:row('remote',{conversation:'worldlet',location:'worldlet',agents:'worldlet',approvals:'worldlet'}),
 // An OpenClaw Gateway on another computer, reached directly with the address and token the person typed (no Worldlet
 // there; core/agent/remote-gateway.ts, agent-runtime/remote-gateway.ts): a session per Fox thread on its `/v1/responses`,
 // World tool calls as client function tools that run here, and its exec approvals over its WebSocket while a turn runs
 // (its device must be approved there: `openclaw devices`). Its files are not here, so no history, schedule, agents or models.
 'remote-openclaw':row('remote-openclaw',{conversation:'native',location:'native',approvals:'native'}),
});
/** Where `harness` runs: a Harness that declares `location` runs on the computer its status names; any other here.
 * `direct`: reached without a Worldlet there (location `native`), not through a paired one (`worldlet`). */
export function harnessLocation(harness:string,status:{location?:unknown}={}):HarnessLocation {
 const at=status.location as {kind?:unknown;computer?:unknown}|undefined,mode=harnessService(harness,'location');
 return mode&&at?.kind==='remote'&&typeof at.computer==='string'&&at.computer?{kind:'remote',computer:at.computer.slice(0,60),...mode==='native'?{direct:true as const}:{}}:{kind:'local'};
}
/** What the person is told when Fox's Agent cannot place a call from the World (its `calls` has no `place`, or it
 * declares no `calls`): why, in that Harness's terms where its row knows them, then how to get one. */
const NO_CALLS:Readonly<Record<string,string>>=Object.freeze({hermes:'Hermes Agent’s optional telephony skill can place a call when you ask it in a chat, but it keeps no record of the call, so the World can neither start one through it nor follow it.'});
export function harnessNoCallsNote(harness:string):string {
 return (NO_CALLS[harness]??'Your Agent has no phone calling Worldlet can use.')+' To have your Agent call from the World, choose OpenClaw with its Voice Call plugin as Fox’s Agent in Settings › Your Agent (`openclaw plugins install @openclaw/voice-call`, then a Twilio, Telnyx or Plivo number in its settings).';
}
/** How `harness` provides `service`, or null when it does not. */
export function harnessService(harness:string,service:HarnessServiceName):HarnessServiceMode|null {
 return HARNESS_SERVICES[harness]?.services[service]??null;
}
/** How `harness` keeps and reports approvals beyond answering them (contracts/harness-services.ts HarnessApprovalFeatures). */
export function harnessApprovalFeatures(harness:string):HarnessApprovalFeatures {
 return HARNESS_SERVICES[harness]?.approvalFeatures??{};
}
