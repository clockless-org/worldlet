/** Agent reports (core/agent/GRANTS.md#agent-reports): what each Agent says it is doing, so the person and the other
 * Agents in the World can see who is working on what, who is free and who has gone quiet. An Agent reports through the
 * `worldlet` MCP server; the host stamps its `agentId` from the token that made the call and the time it arrived, never
 * from what the model sent. Each Agent has one report, replaced by its next; it counts as live for its `ttlMinutes`.
 * Hosts own clocks and storage; Core decides (core/agent/reports.ts). */

/** `working` on something; `idle` and ready for work; `blocked` waiting on someone or something; `offline` on purpose
 * (stopping, paused). */
export type AgentReportStatus='working'|'idle'|'blocked'|'offline';
export const AGENT_REPORT_STATUSES:readonly AgentReportStatus[]=Object.freeze(['working','idle','blocked','offline']);
/** How a report reads now: `live` within its `ttlMinutes`; `stale` after that, for up to AGENT_REPORT_LIMITS.staleTtls
 * more of them; `offline` after that, when it said `offline`, or with no report at all. */
export type AgentLiveness='live'|'stale'|'offline';
export const AGENT_LIVENESS:readonly AgentLiveness[]=Object.freeze(['live','stale','offline']);

/** One thing the Agent is working on. */
export interface AgentReportWork {
 title:string;
 /** One https link (an Issue, a pull request, a document). */
 url?:string;
 /** The Agent's own word for where it stands ("running checks", "review"). */
 state?:string;
 /** ISO instant it started, as the Agent says. */
 since?:string;
}
export type AgentRunStatus='queued'|'running'|'passed'|'failed'|'cancelled';
export const AGENT_RUN_STATUSES:readonly AgentRunStatus[]=Object.freeze(['queued','running','passed','failed','cancelled']);
/** One run the Agent made or is making: a build, a release, a check. */
export interface AgentReportRun {
 /** The Agent's own ID for it. */
 id:string;
 title:string;
 status:AgentRunStatus;
 url?:string;
 startedAt?:string;
 finishedAt?:string;
}

export interface AgentReport {
 /** Host-stamped from the token. */
 agentId:string;
 status:AgentReportStatus;
 /** One line the person reads ("Building the Windows installer"). */
 summary:string;
 work:AgentReportWork[];
 runs:AgentReportRun[];
 /** How much work it can take at once, and how much it has now. */
 capacity?:{slots:number;busy:number};
 /** What the Agent is for, in its own word ("release", "development"). */
 role?:string;
 tags:string[];
 /** How long this report counts as live. */
 ttlMinutes:number;
 /** When the Agent observed what it reports (its own clock, never later than the host's). */
 observedAt:string;
 /** When the host received it (host clock). */
 reportedAt:string;
}

export const AGENT_REPORT_LIMITS=Object.freeze({
 summary:280,work:20,title:200,state:40,link:2000,runs:20,runId:80,role:40,tags:8,tag:40,slots:100,
 /** Minutes a report counts as live, by default and at most. */
 ttlDefault:15,ttlMin:1,ttlMax:1440,
 /** How many of its own `ttlMinutes` a report stays `stale` before it reads `offline`. */
 staleTtls:4,
 /** How far ahead of the host's clock an Agent's `observedAt` may be (clock drift). */
 aheadMinutes:5,
});

/** The World gateway targets (`agents/<action>`), each its own Grant target. Only an Agent's own "Can report its work"
 * and "Can see other Agents" Grants name them; a Fox turn's Grant never does. */
export const AGENT_REPORT_TARGET='agents';
export const AGENT_REPORT_ACTIONS=Object.freeze({report:'agents/report',list:'agents/list'} as const);

/** `agents/report` arguments, as the model sends them (any `agentId` or `reportedAt` is ignored). */
export interface AgentReportPost {status:AgentReportStatus;summary?:string;work?:AgentReportWork[];runs?:AgentReportRun[];capacity?:{slots:number;busy:number};role?:string;tags?:string[];ttlMinutes?:number;observedAt?:string}
/** `agents/list`: every Agent in the World, or those it names, or those that read one way now. */
export interface AgentListArgs {ids?:string[];liveness?:AgentLiveness}
/** One Agent as `agents/list` and Settings › Agent show it. */
export interface AgentListEntry {id:string;name:string;harness:string;kind:'local'|'remote';liveness:AgentLiveness;report?:AgentReport}

/** The board's `agents` source (core/board/README.md#the-agents-source): a preset of provider `agents` (operation
 * `list`) reads what `agents/list` returns, from this World's own records with no Service, as records a board block
 * shows. Its `id` names what each record is: `agents` (one per Agent), `runs` (one per run an Agent reported, newest
 * first) or `totals` (one record of counts). Its optional `query` narrows it: terms separated by spaces, every one of
 * which must hold. `tag:`, `role:`, `agent:` (an Agent's ID) and `liveness:` choose Agents; `status:` is a run's status
 * (`runs`, `totals`) or a report's (`agents`); each takes one or more values separated by commas, any of which may
 * match. Any other word must appear, in any case, in the run's title (`runs`, `totals`) or the Agent's name or summary
 * (`agents`). */
export type AgentBoardList='agents'|'runs'|'totals';
export const AGENT_BOARD_LISTS:readonly AgentBoardList[]=Object.freeze(['agents','runs','totals']);
export const AGENT_BOARD_FILTERS:readonly string[]=Object.freeze(['tag','role','agent','liveness','status']);
export const AGENT_BOARD_LIMITS=Object.freeze({query:200,terms:12});
