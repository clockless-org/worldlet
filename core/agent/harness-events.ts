// The `events` Harness service (contracts/harness-services.ts HarnessEvents) read from the Harness's own folder (mode
// `files`): runs that something outside started, as the Harness recorded them (owner parity plan 2026-10-07, item 8).
// OpenClaw keeps a hook run as a session whose key carries `hook` (`hook:<uuid>`, mapped `hook:<name>:…`, Gmail Pub/Sub
// `hook:gmail:<message id>`, the IMAP plugin `hook:imap:<account>:<uidvalidity>:<uid>`; docs.openclaw.ai/automation);
// Hermes Agent keeps a webhook run as a `state.db` session whose source is `webhook` and whose chat is
// `webhook/<route>`. Lifecycle hooks (OpenClaw internal hooks, Hermes `~/.hermes/hooks`) run code inside the gateway
// and record no run of their own, so neither reports them. The host reads the rows; these are the rules. Kept
// ES-compatible for JavaScriptCore and Jint.
import type {HarnessExternalEvent} from '../../contracts/harness-services.ts';

const text=(value:unknown)=>typeof value==='string'?value.trim():'';
const clip=(value:string,limit:number)=>value.length>limit?value.slice(0,limit-1).trimEnd()+'…':value;
/** Epoch milliseconds from seconds, milliseconds or an ISO string; 0 when unknown. */
export const harnessEventTime=(value:unknown):number=>{
 const n=typeof value==='number'?value:typeof value==='string'&&/^\d+(\.\d+)?$/.test(value.trim())?Number(value):typeof value==='string'?Date.parse(value):NaN;
 return Number.isFinite(n)&&n>0?Math.round(n<1e12?n*1000:n):0;
};
/** What an event says: the latest message that started a run and the Agent's answer to it, each bounded (a persistent
 * hook session, such as Gmail's `hook:gmail:ingress`, holds many runs; each new one is a new event). */
const body=(message:string,answer:string)=>clip([message&&'Started with: '+clip(message,1500),answer&&'Answer: '+clip(answer,1500)].filter(Boolean).join('\n\n'),3200);

export interface OpenClawSessionFacts {key:string;createdVia?:string|null;label?:string|null;displayName?:string|null;updatedAt?:unknown;message?:string|null;answer?:string|null}
/** An OpenClaw session started from outside, or null for every other session (conversations, cron, sub-agents). */
export function openClawExternalEvent(facts:OpenClawSessionFacts):HarnessExternalEvent|null {
 const key=text(facts.key),parts=key.toLowerCase().split(':'),via=text(facts.createdVia).toLowerCase();
 const at=parts.indexOf('hook');
 if(at<0&&via!=='hook'&&via!=='webhook')return null;
 const kind=at>=0?parts[at+1]??'':'';
 const email=kind==='gmail'||kind==='imap';
 const named=text(facts.label)||text(facts.displayName);
 // `hook:<uuid>` is an anonymous /hooks/agent call; a mapped hook names itself in the next part.
 const mapping=kind&&!/^[0-9a-f-]{16,}$/.test(kind)?kind:'';
 const title=clip(named||(kind==='gmail'?'Gmail message':kind==='imap'?'Email ('+(parts[at+2]||'IMAP')+')':mapping?'Webhook '+mapping:'Webhook call'),80);
 const when=harnessEventTime(facts.updatedAt);
 const said=body(text(facts.message),text(facts.answer));
 if(!when||!said)return null;
 return {id:'openclaw:'+key+'@'+when,source:email?'email':'webhook',title,text:said,at:when};
}

export interface HermesSessionFacts {id:string;source?:string|null;displayName?:string|null;title?:string|null;startedAt?:unknown;message?:string|null;answer?:string|null}
/** A Hermes Agent webhook run, or null for every other session. */
export function hermesExternalEvent(facts:HermesSessionFacts):HarnessExternalEvent|null {
 if(text(facts.source).toLowerCase()!=='webhook'||!text(facts.id))return null;
 const route=text(facts.displayName).replace(/^webhook\//,'');
 const at=harnessEventTime(facts.startedAt),said=body(text(facts.message),text(facts.answer));
 if(!at||!said)return null;
 return {id:'hermes:'+text(facts.id),source:'webhook',title:clip(text(facts.title)||(route?'Webhook '+route:'Webhook call'),80),text:said,at};
}
