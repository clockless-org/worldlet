import {AGENT_ASK_TARGET,AGENT_WAKE_LIMITS,WAKE_ASK_ID,type AgentAsk,type AgentOrders} from '../../contracts/agent-asks.ts';
import {AGENT_ID_PATTERN,type AgentAuditEntry} from '../../contracts/agent-identity.ts';
import {looksSecret} from './agent-profile.ts';

/** Orders and waking an Agent (agent/agent/GRANTS.md#orders-and-waking-an-agent). Pure: the World's order target ("Give
 * new work to") and each Agent's wake command as the person typed them in Settings, checked; which Agent a new piece
 * of work wakes, and when. Hosts keep the setting and run the program. */

export const ORDER_REASONS=Object.freeze({
 invalid:'A wake command is a list of words: the program, then each of its arguments.',
 program:'A wake command starts with the full path of a program, like /usr/local/bin/wake-agent.',
 args:`A wake command may have at most ${AGENT_WAKE_LIMITS.args} arguments after the program, each at most ${AGENT_WAKE_LIMITS.arg} characters.`,
 control:'A wake command may not hold control characters or line breaks.',
 secret:'A wake command may not hold passwords, tokens or keys. Keep them where the program reads them itself.',
 agent:'That Agent is not known here, or it was revoked.',
});
// Every C0 and C1 control (tab and line breaks included), DEL, and the bidirectional overrides.
const CONTROL=/[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/;
/** An absolute program path: `/…` on macOS and Linux, `C:\…` on Windows. */
const ABSOLUTE=/^(?:\/(?!\/)|[A-Za-z]:[\\/])/;
const fail=(reason:string):never=>{throw new Error(reason);};

/** A wake command as the page sent it, checked: the program's absolute path, then at most AGENT_WAKE_LIMITS.args
 * arguments, each at most AGENT_WAKE_LIMITS.arg characters, with no control characters and nothing that looks like a
 * credential. The program is never the placeholder. An empty list clears it (null). Nothing is ever split, joined or
 * read by a shell. */
export function readWakeCommand(value:unknown):string[]|null {
 if(!Array.isArray(value))return fail(ORDER_REASONS.invalid);
 if(!value.length)return null;
 if(!value.every(word=>typeof word==='string'))return fail(ORDER_REASONS.invalid);
 const words=value as string[];
 if(words.length-1>AGENT_WAKE_LIMITS.args||words.some(word=>[...word].length>AGENT_WAKE_LIMITS.arg))fail(ORDER_REASONS.args);
 if(words.some(word=>CONTROL.test(word)))fail(ORDER_REASONS.control);
 if(!ABSOLUTE.test(words[0])||words[0].includes(WAKE_ASK_ID))fail(ORDER_REASONS.program);
 if(words.some(word=>looksSecret(word)))fail(ORDER_REASONS.secret);
 return [...words];
}
/** The program and arguments to run for one piece of work: each argument that is exactly WAKE_ASK_ID becomes the
 * work's ID; nothing else is replaced. */
export function wakeArgv(command:readonly string[],askId:string):{program:string;args:string[]} {
 return {program:command[0],args:command.slice(1).map(word=>word===WAKE_ASK_ID?askId:word)};
}
/** The stored setting, checked; a value that is not valid is dropped, not repaired. */
export function readOrders(value:unknown):AgentOrders {
 const v=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
 const wake:Record<string,string[]>={};
 const stored=v.wake&&typeof v.wake==='object'&&!Array.isArray(v.wake)?v.wake as Record<string,unknown>:{};
 for(const [agentId,command] of Object.entries(stored)){
  if(!AGENT_ID_PATTERN.test(agentId))continue;
  try{const checked=readWakeCommand(command);if(checked)wake[agentId]=checked;}catch{}
 }
 return {...typeof v.defaultFor==='string'&&AGENT_ID_PATTERN.test(v.defaultFor)?{defaultFor:v.defaultFor}:{},wake};
}
/** The Agent a newly posted ask wakes: work for an Agent other than the one that posted it. An Agent's own work for
 * itself wakes nothing. */
export const askWakes=(ask:AgentAsk):string|null=>ask.kind==='input'&&ask.status==='open'&&ask.for&&ask.for!==ask.agentId?ask.for:null;
/** Milliseconds until an Agent may be woken again, after its last wake at `lastAt` (0: now). At most one wake per
 * AGENT_WAKE_LIMITS.debounceSeconds. */
export function wakeDelay(lastAt:number|undefined,now:number):number {
 if(lastAt===undefined||!Number.isFinite(lastAt))return 0;
 return Math.max(0,lastAt+AGENT_WAKE_LIMITS.debounceSeconds*1000-now);
}
/** What one wake came to, in a short line for the Agent's audit; no output is kept. */
export function wakeAuditEntry(agentId:string,askId:string,outcome:{code?:number|null;signal?:string|null;timedOut?:boolean;error?:string},at:string):AgentAuditEntry {
 const words=outcome.error!==undefined?`could not start: ${outcome.error}`.slice(0,200)
  :outcome.timedOut?`stopped after ${AGENT_WAKE_LIMITS.timeoutSeconds/60} minutes`:outcome.signal?`ended by ${outcome.signal}`:`exited with ${outcome.code}`;
 const ok=outcome.error===undefined&&!outcome.timedOut&&!outcome.signal&&outcome.code===0;
 return {at,agentId,target:AGENT_ASK_TARGET,action:'wake',decision:ok?'allowed':'denied',reason:`Woken for work ${askId}: ${words}.`};
}
/** The person's change in Settings, for the Agent's audit: its wake command set or removed, or it chosen as the Agent
 * new work goes to (or no longer). */
export function orderAuditEntry(agentId:string,change:'set-wake'|'clear-wake'|'order-target'|'clear-order-target',at:string):AgentAuditEntry {
 const reason={'set-wake':'The person set the program Worldlet runs to wake this Agent.','clear-wake':'The person removed this Agent\'s wake command.',
  'order-target':'The person chose this Agent for new work.','clear-order-target':'The person stopped giving new work to this Agent by default.'}[change];
 return {at,agentId,target:AGENT_ASK_TARGET,action:change,decision:'allowed',reason};
}
