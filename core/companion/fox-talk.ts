// Talk with Fox (owner parity plan, item 7): a spoken conversation, the same on every Harness because voice is
// Worldlet's (contracts/HARNESS.md). The computer listens with its local Whisper and decides from the microphone's
// level when the person stopped; the phones decide from their recognizer's words (WorldletKit TalkRules, the Android
// kit's TalkRules) with the same pause. Fox's finished reply is read with the system voice; a short "be quiet" keeps
// Talk going without reading replies aloud. While Fox speaks the microphone stays open (echo-cancelled where the
// platform can) and the person's own voice, louder than Fox's echo, interrupts it (`talkBargeIn`).
// There is no wake word (owner request 2026-10-10): Talk starts from the microphone's menu.
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

/** A short request to stop talking (安静点, be quiet…) silences spoken replies for the rest of this Talk. */
export const talkQuietRequest=(text:string)=>proactiveQuietRequest(text);

/** What the system voice reads: the reply without Worldlet's markup, link targets or Markdown marks. */
export function talkSpokenText(text:string){
 return String(text??'').replace(/<worldlet[^>]*>[\s\S]*?<\/worldlet[^>]*>/g,'').replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').replace(/[`#*_]/g,'').trim();
}

/** How long a reply may be read before listening resumes anyway, in case the voice never reports its end. */
export const talkSpeakingLimit=(text:string)=>Math.min(180_000,4000+[...talkSpokenText(text)].length*120);
