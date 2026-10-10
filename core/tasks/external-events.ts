// External events (owner parity plan 2026-10-07, item 8): a webhook, a mail trigger or a hook that started the
// person's own Agent, from whichever Harness reports them (the `events` service, contracts/harness-services.ts). Each
// is Attention context of the `conversations` provider beside brought conversations (core/tasks/attention.ts), so
// the Center's ordinary synthesis shows it, usually as Worth Knowing, quoting what the Agent was asked and answered;
// once an item cites one that matters, the phone hears of it. A new message in a shared channel thread that may need the
// person (it asks something, names a date, mentions someone) joins them as a `channel` event as soon as the World reads
// it (core/agent/PORTABILITY.md#history-read-continuously). These rules know no Harness by name.
import type {HarnessExternalEvent} from '../../contracts/harness-services.ts';
import type {PhonePushRequest} from '../phone/index.ts';
import {digest,ongoingTurnText} from './ongoing.ts';

export const EXTERNAL_EVENTS=Object.freeze({
 /** Events of the past week are read (the provider's freshness), the newest 20 at a time. */
 recentDays:7,events:20,
 /** How long an event that matters waits for an item before the phone is no longer told. */
 pushWaitMs:6*3_600_000,
});
const DAY=86_400_000;
const SOURCES:Record<HarnessExternalEvent['source'],string>={webhook:'a webhook',email:'an incoming email',hook:'one of its hooks',channel:'a channel message'};

/** The observation's ID: `hev-` and a digest of the event, never its contents. */
export const externalEventAttentionId=(event:Pick<HarnessExternalEvent,'id'>)=>'hev-'+digest('event\u0000'+event.id);
export const validExternalEventAttentionId=(value:unknown):value is string=>typeof value==='string'&&/^hev-[a-z0-9]{12}$/.test(value);

/** The events the Center reads now: valid, from the past week, newest first, at most EXTERNAL_EVENTS.events. */
export function externalEventsForAttention(events:HarnessExternalEvent[],now:number):HarnessExternalEvent[] {
 return events.filter(e=>e&&typeof e.id==='string'&&typeof e.text==='string'&&e.text.trim()&&Number.isFinite(e.at)&&e.at<=now+60_000&&now-e.at<=EXTERNAL_EVENTS.recentDays*DAY)
  .sort((a,b)=>b.at-a.at||a.id.localeCompare(b.id)).slice(0,EXTERNAL_EVENTS.events);
}

const clip=(value:string,limit:number)=>value.length>limit?value.slice(0,limit-1).trimEnd()+'…':value;
/** Whether a channel message may need the person, by its words alone (no model): a question or request, a date or
 * deadline, or an @-mention. The Center's ordinary synthesis decides whether it becomes an item. */
export function channelMessageAsks(text:string):boolean {
 const said=ongoingTurnText(text);
 if(!said)return false;
 return /[?？]|\b(can|could|would|will) you\b|\b(please|pls|let me know|lmk|any update|thoughts)\b|吗|能不能|可不可以|请|麻烦|帮忙/i.test(said)
  ||/\b(today|tonight|tomorrow|deadline|due|asap|urgent|eod|eow|by (mon|tues|wednes|thurs|fri|satur|sun)day|by (noon|tonight|the end))\b|今天|今晚|明天|截止|尽快|之前/i.test(said)
  ||/(^|\s)@[\w.-]{2,}|<@!?\d+>/.test(said);
}
/** A `channel` event for one new message in a shared thread (`title` is its conversation's name, `before` the lines
 * just before it, oldest first), or null when it does not ask anything of anyone. */
export function channelMessageEvent({source,thread,title,turn,before=[]}:{source:string;thread:string;title:string;turn:{id:string;text:string;at:number};before?:string[]}):HarnessExternalEvent|null {
 const said=ongoingTurnText(turn.text);
 if(!said||!channelMessageAsks(said)||!Number.isFinite(turn.at)||turn.at<=0)return null;
 const earlier=before.map(line=>ongoingTurnText(line)).filter(Boolean).slice(-3).map(line=>'- '+clip(line,300));
 return {id:'channel:'+source+':'+thread+'@'+turn.id,source:'channel',title:clip(title||'A channel',80),
  text:'Message: '+clip(said,1500)+(earlier.length?'\n\nJust before:\n'+earlier.join('\n'):''),at:Math.round(turn.at)};
}

/** What the Center reads of one event. `agent` is the Agent's display name ("OpenClaw"). */
export function externalEventObservation(event:HarnessExternalEvent,agent:string):{id:string;title:string;text:string} {
 const when=new Date(event.at).toISOString().slice(0,16).replace('T',' ')+' UTC';
 if(event.source==='channel'){
  const header=`A new message at ${when} in “${event.title}”, a conversation the person's own Agent (${agent||'their Agent'}) is in with other people, may need the person: it asks something, names a date or mentions someone. Worth Doing when it asks the person for a reply, a decision or something by a date (Fox can offer a reply there with reply_in_channel, naming “${event.title}”); worth knowing when it only concerns them; nothing when it was for someone else or the Agent already answered it:\n\n`;
  return {id:externalEventAttentionId(event),title:event.title,text:(header+event.text).slice(0,12000)};
 }
 const header=`The person's own Agent (${agent||'their Agent'}) was started from outside by ${SOURCES[event.source]??'an outside event'} at ${when}: “${event.title}”. Worth knowing as a result: what came in and what the Agent did, not a conversation the person had. What it was asked and answered:\n\n`;
 return {id:externalEventAttentionId(event),title:event.title,text:(header+event.text).slice(0,12000)};
}
/** The original an item opens back to. */
export const externalEventOriginal=(record:{title?:unknown;text?:unknown})=>({title:typeof record.title==='string'&&record.title?record.title:'Outside event',text:typeof record.text==='string'?record.text:''});

/** Whether the phone should hear of it: something reached the Agent from outside (a webhook or mail) or a channel
 * message that asks something of the person, not the Agent's own lifecycle hooks. */
export const externalEventMatters=(event:Pick<HarnessExternalEvent,'source'>)=>event.source==='webhook'||event.source==='email'||event.source==='channel';

/** The push for an item that cites a pending event, or null. Coming Up and Worth Doing items reach the phone through
 * core/phone phoneAttentionPushes already, so only a Worth Knowing (`update`) item is pushed here. */
export function externalEventPush(item:{id?:unknown;kind?:unknown;title?:unknown;reason?:unknown;context?:unknown;sources?:unknown},pending:ReadonlySet<string>):PhonePushRequest|null {
 if(typeof item.id!=='string'||item.kind!=='update'||!Array.isArray(item.sources))return null;
 if(!item.sources.some((ref:any)=>ref?.provider==='conversations'&&pending.has(String(ref?.id))))return null;
 const title=typeof item.title==='string'&&item.title.trim()?item.title.trim():'Your Agent heard from outside';
 const body=[item.reason,item.context].find(value=>typeof value==='string'&&value.trim()) as string|undefined;
 return {kind:'task',title,body:body?.trim()??'',open:{item:item.id},act:{attention:item.id},...(/^[A-Za-z0-9_.-]{1,64}$/.test(item.id)?{collapse:item.id}:{})};
}
