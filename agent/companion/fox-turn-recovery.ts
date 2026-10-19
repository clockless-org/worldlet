// A Fox turn that failed on the person's own Agent (owner request 2026-10-13: Fox's first reply must come back). Only 2 of
// 6 new people who reached the World heard Fox answer; the failures were sub-second, before anything streamed. Core
// decides whether the UI tries the turn once more by itself, and what Fox says when it still fails: why, in plain words,
// with Try again and Choose another Agent, never a bare error.

/** What the Agent's failure looked like from the turn. `kind`: Core's classified rule for it (diagnostics `error_rule`:
 * notRunning, noAnswer, signedOut, …); `known`: the UI's provider-failure code (model-failure.ts), when it recognised one
 * (authentication, quota, model, rate_limit, …). */
export interface FoxTurnFailure {kind?:string|null;known?:string|null;elapsedMs:number;streamed:boolean;toolsRan:boolean;attempt:number}

/** Fails at once and again: retrying cannot help, the person has to act (sign in, reinstall, choose another Agent). */
const LASTING_KINDS=new Set(['signedOut','notInstalled','missing','permission','unsupported','contextLength','badRequest','forbidden']);
/** Provider answers that a second try in the same second would only repeat. `network` and `timeout` are not here: a
 * network blip passes, and a slow turn is past FAST_MS anyway. */
const LASTING_KNOWN=new Set(['authentication','quota','model','no_local_model','update_required','paused','included_allowance','rate_limit']);
/** Only a failure this quick is tried again, so a retry never doubles a long wait. */
export const FOX_RETRY_FAST_MS=15_000;
/** How long the UI waits before the one retry: a resident Agent that was starting (Hermes Agent's gateway) gets a moment. */
export const FOX_RETRY_DELAY_MS=1_500;

/** Whether the UI tries the turn once more by itself: the first failure, quick, before any text or World tool (so nothing
 * the person saw or the World changed is repeated), and not one that needs the person. */
export function foxTurnRetry(failure:FoxTurnFailure):boolean {
 if(failure.attempt>0||failure.streamed||failure.toolsRan||!(failure.elapsedMs>=0&&failure.elapsedMs<FOX_RETRY_FAST_MS))return false;
 if(failure.known&&LASTING_KNOWN.has(failure.known))return false;
 return !(failure.kind&&LASTING_KINDS.has(failure.kind));
}

export const FOX_RETRY_ACTION='#fox-action=fox.retry';
export const FOX_CHOOSE_AGENT_ACTION='#fox-action=open.model';
/** Why it failed, for the kinds whose host text is a raw transport error (connection refused, a process exit code). */
const EXPLAINED:Record<string,string>={
 notRunning:'Your Agent is not running right now, so Fox could not answer.',
 noAnswer:'Your Agent did not answer this time.',
 processExit:'Your Agent stopped before it answered.',
 signedOut:'Your Agent is not signed in to its model, so Fox could not answer. Sign it in, then try again.',
 notInstalled:'Your Agent is no longer installed on this computer.',
};
/** What Fox says when a turn still failed: the reason (the host's own plain words, or Core's for a raw transport error `kind`),
 * then Try again and, unless the message already offers it, Choose another Agent. */
export function foxTurnFailureText(message:string,kind?:string|null):string {
 const text=String(message||'').trim();
 const reason=(kind&&Object.hasOwn(EXPLAINED,kind)?EXPLAINED[kind]:null)??(text||'Fox could not answer this time.');
 const actions=[`[Try again](${FOX_RETRY_ACTION})`,...reason.includes(FOX_CHOOSE_AGENT_ACTION)?[]:[`[Choose another Agent](${FOX_CHOOSE_AGENT_ACTION})`]];
 return reason+'\n\n'+actions.join(' ');
}
