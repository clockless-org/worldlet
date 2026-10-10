// Phone calls through the person's own Agent (Kelvin 2026-10-08), from whichever Harness reports them (the `calls`
// service, contracts/harness-services.ts). Each ended call is Attention context of the `conversations` provider beside
// brought conversations and outside events (core/tasks/attention.ts, external-events.ts), so the Center's ordinary
// synthesis shows it: a missed call, or one that left the person something to do, as Worth Doing; any other finished
// call as Worth Knowing. A call Fox placed from a thread is reported back there in one line. These rules know no
// Harness by name.
import type {HarnessCall} from '../../contracts/harness-services.ts';
import {digest} from './ongoing.ts';

export const HARNESS_CALLS=Object.freeze({
 /** Calls of the past week are read, the newest 20 at a time. */
 recentDays:7,calls:20,
 /** How long a call that matters waits for an item before the phone is no longer told. */
 pushWaitMs:6*3_600_000,
 /** A call that ended longer ago than this is not reported to its thread any more (a first read, a long sleep). */
 reportWithinMs:12*3_600_000,
 /** Calls remembered as reported. */
 reported:200,
 /** What the person confirms before a call: the reason and the ask, each at most this long; the opening at most `opening`. */
 brief:300,opening:600,
 /** A call the World shows live: one in progress that started within this long (an older one is a stale record). */
 liveWithinMs:2*3_600_000,
 /** A call waiting for the person's Call button is dropped after this long. */
 offerWaitMs:30*60_000,
 /** The transcript lines the page shows of a call as it runs. */
 liveLines:40,
});
const DAY=86_400_000;
const clip=(value:string,limit:number)=>value.length>limit?value.slice(0,limit-1).trimEnd()+'…':value;
const sentence=(value:string)=>value.replace(/\s+/g,' ').trim();
const utc=(at:number)=>new Date(at).toISOString().slice(0,16).replace('T',' ')+' UTC';

/** The observation's ID: `hcall-` and a digest of the call, never its number or words. */
export const callAttentionId=(call:Pick<HarnessCall,'id'>)=>'hcall-'+digest('call\u0000'+call.id);
export const validCallAttentionId=(value:unknown):value is string=>typeof value==='string'&&/^hcall-[a-z0-9]{12}$/.test(value);

/** Seconds the call was connected, or null when it never was. */
export function callSeconds(call:Pick<HarnessCall,'answeredAt'|'endedAt'|'startedAt'|'outcome'>):number|null {
 if(call.outcome!=='completed'||!call.endedAt)return null;
 const from=call.answeredAt||call.startedAt;
 return call.endedAt>from?Math.round((call.endedAt-from)/1000):null;
}
const duration=(seconds:number|null)=>seconds===null?'':seconds<60?`${seconds} s`:`${Math.round(seconds/60)} min`;
const ended=(call:HarnessCall)=>call.outcome!=='in-progress';

/** The calls the Center reads now: ended, from the past week, newest first, at most HARNESS_CALLS.calls. */
export function callsForAttention(calls:HarnessCall[],now:number):HarnessCall[] {
 return calls.filter(c=>c&&typeof c.id==='string'&&ended(c)&&Number.isFinite(c.startedAt)&&c.startedAt<=now+60_000&&now-(c.endedAt||c.startedAt)<=HARNESS_CALLS.recentDays*DAY)
  .sort((a,b)=>(b.endedAt||b.startedAt)-(a.endedAt||a.startedAt)||a.id.localeCompare(b.id)).slice(0,HARNESS_CALLS.calls);
}

/** A short name for the call: "Missed call from +1 555…", "Call to …". */
export function callTitle(call:HarnessCall):string {
 if(call.outcome==='missed')return clip('Missed call from '+call.peer,80);
 return clip((call.direction==='inbound'?'Call from ':'Call to ')+call.peer,80);
}
const OUTCOMES:Record<HarnessCall['outcome'],string>={'in-progress':'still going on',completed:'answered and finished',missed:'missed: nobody answered and the caller hung up',
 'no-answer':'not answered',busy:'busy',voicemail:'it reached voicemail',failed:'it did not go through',rejected:'turned away by the Agent\'s inbound policy'};

/** What the Center reads of one call. `agent` is the Agent's display name ("OpenClaw"). */
export function callObservation(call:HarnessCall,agent:string):{id:string;title:string;text:string} {
 const who=agent||'their Agent',seconds=callSeconds(call);
 const what=call.direction==='inbound'?`${call.peer} called the person's own Agent (${who})`:`The person's own Agent (${who}) called ${call.peer}`;
 const kind=call.outcome==='missed'?'Worth doing: a call the person missed; they may want to call back.'
  :'If the call left the person something to do (a callback, a promise, a date, a question to answer), that is worth doing; otherwise it is worth knowing as a result, not a conversation the person had.';
 const lines=[`${what} at ${utc(call.startedAt)}. Outcome: ${OUTCOMES[call.outcome]}${seconds!==null?`, ${duration(seconds)}`:''}. ${kind}`];
 if(call.message)lines.push('What the Agent was asked to say: '+clip(call.message,600));
 if(call.summary)lines.push('Summary: '+clip(call.summary,1500));
 if(call.transcript.length)lines.push('Transcript:\n'+call.transcript.map(line=>`${line.at?'['+utc(line.at).slice(11,16)+'] ':''}${line.speaker==='agent'?who:'Them'}: ${line.text}`).join('\n'));
 return {id:callAttentionId(call),title:callTitle(call),text:lines.join('\n\n').slice(0,12000)};
}

/** Whether the phone should hear of it: someone called the person's Agent (a call it placed is reported in its
 * thread, or the person set it going themselves). */
export const callMatters=(call:Pick<HarnessCall,'direction'|'outcome'>)=>call.direction==='inbound'&&call.outcome!=='rejected';

/** The Fox thread that asked for the call: the one whose resident session (`owned`, session name to thread) placed it.
 * A Harness may file the session under a longer key that ends with the name (`agent:main:<name>`). */
export function callThread(call:Pick<HarnessCall,'requestedBy'>,owned:Iterable<[string,string]>):string|null {
 const by=call.requestedBy;
 if(!by)return null;
 for(const [session,thread] of owned)if(session&&(by===session||by.endsWith(':'+session)))return thread;
 return null;
}
/** Fox's one line on how a call it placed went. */
export function callLine(call:HarnessCall):string {
 const to=call.direction==='inbound'?'The call from '+call.peer:'The call to '+call.peer;
 if(call.outcome!=='completed')return {missed:to+' was missed.','no-answer':to+' was not answered.',busy:call.peer+' was busy.',voicemail:to+' reached voicemail.',
  failed:to+' did not go through.',rejected:to+' was turned away.','in-progress':to+' is still going on.'}[call.outcome];
 const seconds=callSeconds(call),done=`${to} is done${seconds!==null?` (${duration(seconds)})`:''}.`;
 if(call.summary)return clip(done+' '+call.summary.replace(/\s+/g,' ').trim(),300);
 const said=[...call.transcript].reverse().find(line=>line.speaker==='peer');
 return said?clip(`${done} Last thing they said: “${clip(said.text.replace(/\s+/g,' ').trim(),180)}”`,300):done;
}
/** Whether an ended call should still be reported to its thread now. */
export const callReportDue=(call:HarnessCall,now:number)=>ended(call)&&now-(call.endedAt||call.startedAt)<=HARNESS_CALLS.reportWithinMs;
/** The original an item opens back to. */
export const callOriginal=(record:{title?:unknown;text?:unknown})=>({title:typeof record.title==='string'&&record.title?record.title:'Phone call',text:typeof record.text==='string'?record.text:''});

// Calling from an Applet (core/agent/PORTABILITY.md#calling-from-an-applet) -------------------------------------------
// An Applet item with a phone number offers Call; its data fills in who, why and what to ask; the person reads and
// edits that in Fox's card and only their Call dials, through the Harness's `calls.place`; the call then shows live.

/** A number the Agent can dial: E.164 from how an Applet wrote it (`+` or `00`, then 8 to 15 digits; spaces, dots,
 * dashes and brackets dropped); null otherwise, never a guessed country code. */
export function callNumber(value:unknown):string|null {
 if(typeof value!=='string')return null;
 const raw=value.trim();
 if(!/^(\+|00)[0-9 ()\-.]{7,24}$/.test(raw))return null;
 const digits=raw.replace(/^00/,'').replace(/\D/g,'');
 return digits.length>=8&&digits.length<=15&&digits[0]!=='0'?'+'+digits:null;
}
/** What the person confirms: whom the Agent calls (`who` a name, `to` the number), for whom it calls (`behalf`), why
 * and what it should find out, and the Applet it came from. */
export type CallBrief={to:string;who:string;behalf:string;why:string;ask:string;from:string};
/** A brief from an Applet's (or the person's edited) fields, or why it cannot be one. */
export function callBrief(input:Record<string,unknown>):CallBrief|{error:string} {
 const to=callNumber(input.to);
 if(!to)return {error:'That is not a phone number your Agent can dial. Use the full international number, starting with +.'};
 const field=(value:unknown,limit:number=HARNESS_CALLS.brief)=>typeof value==='string'?clip(sentence(value),limit):'';
 const why=field(input.why),ask=field(input.ask);
 if(!why&&!ask)return {error:'Say why your Agent is calling or what it should find out.'};
 return {to,who:field(input.who,60),behalf:field(input.behalf,80)||'someone you know',why,ask,from:field(input.from,40)};
}
/** What the Agent says first when the call connects: that it is an AI assistant, for whom, why, and the ask; the
 * Agent carries the conversation on from there. */
export function callOpening(brief:CallBrief):string {
 const first=brief.who&&!/^\+?[0-9 ()\-.]+$/.test(brief.who)?' '+brief.who.split(/\s+/)[0]:'';
 const why=brief.why.replace(/[.!?…]+$/,'');
 return clip(`Hi${first}, this is an AI assistant calling for ${brief.behalf}${why?`, ${why}`:''}.${brief.ask?' '+brief.ask:''}`,HARNESS_CALLS.opening);
}
/** A conversation with one person at a phone number in a messaging Applet (Messages today) as the brief the person
 * confirms: their name and number; why, the last thing they said; the ask, the person's own question when it is the
 * last line and still unanswered. Null for a group or an address that is not a number. */
export function conversationCallBrief(conversation:{title?:string;participants?:unknown[];group?:boolean;messages?:{fromMe?:boolean;text?:string}[]},from:string):CallBrief|null {
 const people=(conversation.participants??[]).filter((p):p is string=>typeof p==='string'&&!!p);
 const to=!conversation.group&&people.length===1?callNumber(people[0]):null;
 if(!to)return null;
 const lines=(conversation.messages??[]).filter(line=>typeof line.text==='string'&&line.text.trim());
 const theirs=[...lines].reverse().find(line=>!line.fromMe),last=lines.at(-1);
 const asked=last?.fromMe&&/\?\s*$/.test(last.text!)?clip(sentence(last.text!),HARNESS_CALLS.brief):'';
 const why=asked?'following up on their last message':theirs?`about your message “${clip(sentence(theirs.text!),120)}”`:'following up on our messages';
 return {to,who:conversation.title&&conversation.title!==people[0]?clip(conversation.title,60):'',behalf:'the person you’ve been messaging',why,ask:asked,from:clip(from,40)};
}
/** Whether the World follows this call live now. */
export const callLive=(call:Pick<HarnessCall,'outcome'|'startedAt'>,now:number)=>call.outcome==='in-progress'&&now-call.startedAt<=HARNESS_CALLS.liveWithinMs;
/** One status line for a call as it runs, then how it went: "Ringing Anna…", "On the call with Anna · 1:05". */
export function callStatus(call:HarnessCall,now:number,who=''):string {
 const name=who||call.peer;
 if(call.outcome!=='in-progress')return callLine(who?{...call,peer:who}:call);
 if(call.live==='dialing')return `Calling ${name}…`;
 if(call.live==='ringing')return call.direction==='inbound'?`${name} is calling…`:`Ringing ${name}…`;
 const seconds=Math.max(0,Math.round((now-(call.answeredAt||call.startedAt))/1000));
 return `On the call with ${name} · ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
}
