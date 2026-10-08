// The `calls` Harness service (contracts/harness-services.ts HarnessCalls) read from the Harness's own folder (mode
// `files`): phone calls the person's own Agent placed or answered, as the Harness recorded them (Kelvin 2026-10-08: a
// call made or received through the person's Agent leaves a record in the World). OpenClaw's voice-call plugin
// (Twilio, Telnyx, Plivo; @openclaw/voice-call 2026.9.8, extensions/voice-call/src/manager/store.ts) keeps one
// snapshot of a call each time it changes, in its own store: `plugins.entries.voice-call.config.store`, else
// `<OpenClaw state>/voice-calls`, as `state/openclaw.sqlite` rows of `plugin_state_entries` (namespace
// `call-record-events`, the chunks base64 in `call-record-event-chunks`), before 2026.9 as `calls.jsonl` lines. The
// newest snapshot of a call is the call. Hermes Agent keeps no call record (its optional telephony skill logs none).
// The host reads the rows; these are the rules. Kept ES-compatible for JavaScriptCore and Jint.
import type {HarnessCall,HarnessCallLine,HarnessCallLive,HarnessCallOutcome,HarnessCallRequest} from '../../contracts/harness-services.ts';
import {harnessEventTime} from './harness-events.ts';

const text=(value:unknown)=>typeof value==='string'?value.trim():'';
const clip=(value:string,limit:number)=>value.length>limit?value.slice(0,limit-1).trimEnd()+'…':value;
const record=(value:unknown):Record<string,any>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,any>:{};

/** The plugin's own store setting, '' for its default below the OpenClaw state folder; the host resolves `~`. */
export function openClawVoiceCallStore(config:unknown):string {
 return text(record(record(record(record(record(config).plugins).entries)['voice-call']).config).store);
}
/** The plugin-state namespaces of a call's snapshots and of their chunks. */
export const OPENCLAW_CALL_NAMESPACES=Object.freeze({events:'call-record-events',chunks:'call-record-event-chunks'});
/** A chunk's key: the snapshot's key, then `:chunk:` and its four-digit index. */
export const openClawCallChunkKey=(event:string,index:number)=>event+':chunk:'+String(index).padStart(4,'0');
/** One stored line or reassembled snapshot as the call record it holds: a v2 envelope (`{version:2,call}`) or the
 * record itself; null for anything else. */
export function openClawCallRecord(line:string):Record<string,any>|null {
 let value:unknown;
 try{value=JSON.parse(line);}catch{return null;}
 const row=record(value),call=row.version===2?record(row.call):row;
 return text(call.callId)&&(call.direction==='outbound'||call.direction==='inbound')?call:null;
}

const LIVE:Record<string,HarnessCallLive>={initiated:'dialing',ringing:'ringing',answered:'talking',active:'talking',speaking:'talking',listening:'talking'};
const ENDED=['completed','hangup-user','hangup-bot','timeout','error','failed','no-answer','busy','voicemail'];
const LINES=80;
/** A voice-call record as the World's call, or null when it is not one. Its transcript is the final lines, the
 * Agent's (`bot`) and the other party's (`user`); a rejected inbound call carries `metadata.rejectionReason`. */
export function openClawHarnessCall(value:unknown):HarnessCall|null {
 const call=record(value),id=text(call.callId),direction=call.direction==='inbound'?'inbound':call.direction==='outbound'?'outbound':null;
 const startedAt=harnessEventTime(call.startedAt);
 if(!id||!direction||!startedAt)return null;
 const metadata=record(call.metadata);
 const transcript:HarnessCallLine[]=(Array.isArray(call.transcript)?call.transcript:[]).map(record)
  .filter(line=>line.isFinal!==false&&text(line.text)&&(line.speaker==='bot'||line.speaker==='user'))
  .slice(-LINES).map(line=>({speaker:line.speaker==='bot'?'agent':'peer',text:clip(text(line.text),1000),at:harnessEventTime(line.timestamp)}));
 const answeredAt=harnessEventTime(call.answeredAt),endedAt=harnessEventTime(call.endedAt);
 const state=text(call.state),reason=text(call.endReason)||(ENDED.includes(state)?state:'');
 const answered=!!answeredAt||transcript.some(line=>line.speaker==='peer');
 const unanswered:HarnessCallOutcome=direction==='inbound'?'missed':'no-answer';
 const outcome:HarnessCallOutcome=!reason?'in-progress':text(metadata.rejectionReason)?'rejected'
  :reason==='busy'||reason==='voicemail'?reason:reason==='error'||reason==='failed'?'failed'
  :reason==='no-answer'?unanswered:answered?'completed':unanswered;
 const peer=clip(text(direction==='outbound'?call.to:call.from)||'unknown',60);
 // An inbound call's opening line is the plugin's greeting, not something the person asked for.
 const message=direction==='outbound'?clip(text(metadata.initialMessage),600):'';
 const live=outcome==='in-progress'?LIVE[state]:undefined;
 return {id:'openclaw:'+id,direction,peer,startedAt,...answeredAt?{answeredAt}:{},...endedAt?{endedAt}:{},outcome,...live?{live}:{},transcript,
  ...message?{message}:{},...text(metadata.requesterSessionKey)?{requestedBy:text(metadata.requesterSessionKey)}:{},...text(call.agentId)?{agent:text(call.agentId)}:{}};
}
/** Each call once, as its newest snapshot (`records` oldest first), newest call first. */
export function openClawHarnessCalls(records:unknown[]):HarnessCall[] {
 const latest=new Map<string,HarnessCall>();
 for(const value of records){const call=openClawHarnessCall(value);if(call){latest.delete(call.id);latest.set(call.id,call);}}
 return [...latest.values()].sort((a,b)=>b.startedAt-a.startedAt||a.id.localeCompare(b.id));
}

// Placing a call from the World ------------------------------------------------------------------------------------
// The plugin's own command line (@openclaw/voice-call 2026.9.8 src/cli.ts): `openclaw voicecall call --to <E.164>
// --message <text> --mode conversation` goes through the running Gateway (`voicecall.initiate`) and prints
// `{"callId":…}`; `voicecall end --call-id <id>` hangs up. A conversation call stays open after the opening and the
// plugin's voice agent answers the other party, with the opening (and so the person's ask) in its transcript.
/** Whether the voice-call plugin is enabled with a provider in openclaw.json; otherwise how to set it up. */
export function openClawCallPlacing(config:unknown):{ready:true}|{ready:false;note:string} {
 const entry=record(record(record(config).plugins).entries)['voice-call'];
 if(!entry||typeof entry!=='object')return {ready:false,note:'Your OpenClaw has no Voice Call plugin. Install it with `openclaw plugins install @openclaw/voice-call`, give it a Twilio, Telnyx or Plivo number under plugins.entries.voice-call.config, then restart its Gateway.'};
 if(record(entry).enabled!==true)return {ready:false,note:'Your OpenClaw’s Voice Call plugin is turned off. Set plugins.entries.voice-call.enabled to true and restart its Gateway; `openclaw voicecall setup` says what else it needs.'};
 if(!text(record(record(entry).config).provider))return {ready:false,note:'Your OpenClaw’s Voice Call plugin has no phone provider yet. Run `openclaw voicecall setup` to see what it needs (a Twilio, Telnyx or Plivo number).'};
 return {ready:true};
}
export const openClawCallArgs=(request:HarnessCallRequest)=>['voicecall','call','--to',request.to,'--message',request.message,'--mode','conversation'];
export const openClawHangUpArgs=(callId:string)=>['voicecall','end','--call-id',callId];
/** The call the plugin started (`{"callId":…}` on stdout) as the World's call id, or its reason. */
export function openClawCallResult(code:number|null,stdout:string,stderr=''):{id:string}|{error:string} {
 const start=stdout.indexOf('{');
 let value:Record<string,any>={};
 if(start>=0)try{value=record(JSON.parse(stdout.slice(start)));}catch{}
 const id=text(value.callId);
 if(code===0&&id&&/^[\w:.-]{1,120}$/.test(id))return {id:'openclaw:'+id};
 const last=stderr.trim().split('\n').filter(Boolean).slice(-1)[0]??'';
 return {error:clip(text(value.error)||last.replace(/^error:\s*/i,'')||'Your Agent could not place the call.',300)};
}
