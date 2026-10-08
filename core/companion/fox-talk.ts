// Talk with Fox (owner parity plan, item 7): a spoken conversation, the same on every Harness because voice is
// Worldlet's (contracts/HARNESS.md). The computer listens with its local Whisper and decides from the microphone's
// level when the person stopped; the phones decide from their recognizer's words (WorldletKit TalkRules, the Android
// kit's TalkRules) with the same pause. Fox's finished reply is read with the system voice; a short "be quiet" keeps
// Talk going without reading replies aloud. While Fox speaks the microphone stays open (echo-cancelled where the
// platform can) and the person's own voice, louder than Fox's echo, interrupts it (`talkBargeIn`). A wake word
// ("Hey Fox", 「嘿 Fox」, 「小狐」 or the Fox's own name) starts Talk on the computer: short phrases the levels single
// out (`wakeGate`) go to local Whisper and `wakeMatch` reads what it heard; `wakeState` says when it rests.
import {proactiveQuietRequest} from './fox-proactive.ts';

export const TALK={
 /** The capture's level (RMS / 5000, 0 to 1) above which the person is speaking. */
 voiceLevel:0.08,
 /** Speech this long, in all, counts as an utterance; shorter is a cough or a click. */
 speechMs:250,
 /** Silence after speech this long ends the utterance. */
 pauseMs:1100,
 /** With no speech this long the capture starts over, well before the recorder's 45-second limit. */
 idleMs:30_000,
 /** Barge-in while Fox speaks: the person's voice must pass this level and Fox's own echo by `bargeMargin`, for
  * `bargeMs`; the first `bargeSettleMs` of the reply only learn the echo. */
 bargeLevel:0.12,bargeMargin:1.6,bargeMs:300,bargeSettleMs:500,
 /** Audio kept from before a barge-in so its first words reach Whisper. */
 bargePrerollMs:800
} as const;

export type TalkHearing='listening'|'ended'|'idle';

/** Follows one capture's levels and says when the utterance ended (or nothing was said for a while). */
export function talkEndpoint(start:number){
 let since=start,voiced=0,lastVoice=0,lastAt=start;
 return {
  /** `heard` ms of speech already under way (a barge-in) counts toward the utterance. */
  reset(now:number,heard=0){since=now;voiced=heard;lastVoice=heard?now:0;lastAt=now;},
  feed(level:number,now:number):TalkHearing{
   const step=Math.max(0,Math.min(250,now-lastAt));lastAt=now;
   if(Number(level)>=TALK.voiceLevel){voiced+=step;lastVoice=now;}
   if(voiced>=TALK.speechMs)return now-lastVoice>=TALK.pauseMs?'ended':'listening';
   return now-since>=TALK.idleMs?'idle':'listening';
  }
 };
}

/** Follows the open microphone while Fox speaks and says when the person talks over it. Fox's echo is learned as
 * a decaying peak (everything in the first `bargeSettleMs`, afterwards only levels that are not the person), so
 * with headphones any voice interrupts and over speakers the person must be clearly louder than Fox. */
export function talkBargeIn(start:number){
 let echo=0,voiced=0,lastAt=start,quietSince=start;
 return {
  get voicedMs(){return voiced;},
  feed(level:number,now:number){
   const step=Math.max(0,Math.min(250,now-lastAt)),value=Math.max(0,Number(level)||0);lastAt=now;
   echo*=Math.pow(0.5,step/4000);
   if(now-start<TALK.bargeSettleMs){echo=Math.max(echo,value);return false;}
   if(value>=Math.max(TALK.bargeLevel,echo*TALK.bargeMargin)){voiced+=step;quietSince=now;}
   else{echo=Math.max(echo,value);if(now-quietSince>150)voiced=0;}
   return voiced>=TALK.bargeMs;
  }
 };
}

export const WAKE={
 /** A wake phrase is a short phrase on its own: this much speech at least, spanning no more than `maxMs`… */
 minMs:300,maxMs:2500,
 /** …after this much quiet and followed by `pauseMs` of quiet. */
 quietMs:500,pauseMs:600,
 /** At most one local Whisper check this often (each is a couple of seconds of model work). */
 gapMs:4000,
 /** Audio kept around the phrase for the check. */
 marginMs:300,
 /** How often the listener looks again at what makes it rest (a call starting or ending). */
 recheckMs:3000
} as const;

export type WakeState='off'|'listening'|'paused'|'unavailable';
/** What the wake listener does now: off unless turned on where local Whisper runs, waiting for the microphone
 * permission, resting while something else has the person's voice (Fox's own voice input, Talk, a call), the screen
 * is locked or the computer sleeps, else listening. */
export function wakeState({enabled,supported,permitted,busy,talking,inCall,locked}:{enabled:boolean,supported:boolean,permitted:boolean,busy:boolean,talking:boolean,inCall:boolean,locked:boolean}):WakeState{
 if(!supported)return 'unavailable';
 if(!enabled)return 'off';
 if(!permitted)return 'unavailable';
 return busy||talking||inCall||locked?'paused':'listening';
}

/** Follows the wake listener's levels; returns how many ms of audio to check when a short standalone phrase ended. */
export function wakeGate(start:number){
 let lastAt=start,quietSince=start,began=0,lastVoice=0,voiced=0,checked=-Infinity,tooLong=false;
 return {
  feed(level:number,now:number):number|null{
   const step=Math.max(0,Math.min(250,now-lastAt));lastAt=now;
   if(Number(level)>=TALK.voiceLevel){
    if(!began){if(now-quietSince<WAKE.quietMs){quietSince=now;return null;}began=now;voiced=0;tooLong=false;}
    voiced+=step;lastVoice=now;if(now-began>WAKE.maxMs)tooLong=true;return null;
   }
   if(!began){return null;}
   if(now-lastVoice<WAKE.pauseMs)return null;
   const span=lastVoice-began,ok=!tooLong&&voiced>=WAKE.minMs&&now-checked>=WAKE.gapMs;
   began=0;quietSince=lastVoice;
   if(!ok)return null;
   checked=now;return Math.round(span+WAKE.pauseMs+2*WAKE.marginMs);
  },
  /** A check that could not run (Whisper busy) leaves the next phrase free to be checked. */
  release(){checked=-Infinity;}
 };
}

const escapeRegex=(text:string)=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
/** Whether local Whisper's words start with the wake phrase: "Hey Fox", 「嘿 Fox」, 「嘿，小狐狸」, 「小狐」, or "Hey"
 * / 「嘿」 and the Fox's current name. Returns what was said after it (a first request), or null. */
export function wakeMatch(text:string,name=''){
 const value=String(text??'').trim(),own=String(name??'').trim();
 const names=['fox','foxy','狐狸','小狐狸','小狐','福克斯',...(own&&[...own].length>=2&&!/^fox$/i.test(own)?[escapeRegex(own)]:[])];
 const gap='[\\s,，.。!！、~～-]*',end='(?![a-z0-9])';
 const pattern=new RegExp('^'+gap+'(?:(?:hey|hi|hello|ok|okay|嘿|嗨|哈喽|你好)'+gap+'(?:'+names.join('|')+')'+end+'|小狐狸|小狐)'+gap,'iu');
 const found=pattern.exec(value);if(!found)return null;
 return {rest:value.slice(found[0].length).replace(/^[\s,，.。!！?？、]+/,'').trim()};
}

/** A short request to stop talking (安静点, be quiet…) silences spoken replies for the rest of this Talk. */
export const talkQuietRequest=(text:string)=>proactiveQuietRequest(text);

/** What the system voice reads: the reply without Worldlet's markup, link targets or Markdown marks. */
export function talkSpokenText(text:string){
 return String(text??'').replace(/<worldlet[^>]*>[\s\S]*?<\/worldlet[^>]*>/g,'').replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').replace(/[`#*_]/g,'').trim();
}

/** How long a reply may be read before listening resumes anyway, in case the voice never reports its end. */
export const talkSpeakingLimit=(text:string)=>Math.min(180_000,4000+[...talkSpokenText(text)].length*120);
