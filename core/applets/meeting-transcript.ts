/** Live meeting transcripts (owner request 2026-10-04): while the person has transcription on in a
 * Meetings call, each side of the call (the person's microphone, everyone else) arrives as 16 kHz
 * mono PCM16 about once a second and is cut into windows for local Whisper. A window ends at a pause
 * once it holds a few seconds, or at `maxSeconds` (local Whisper takes at most 45 s at once). Windows
 * that are silence throughout are dropped before any transcription. Only text is kept; the audio of
 * a window is released once it is transcribed. Pure: no clock, no IO. */
export const MEETING_TRANSCRIPT={
 rate:16000,
 /** A window is cut at the first quiet second after this many seconds. */
 minSeconds:6,
 /** And always at this length. */
 maxSeconds:25,
 /** RMS (of full scale) under which one second counts as quiet. */
 quiet:0.004,
 /** Windows waiting for Whisper beyond this many: the oldest are dropped and the gap is noted. */
 maxQueued:24,
} as const;
export type MeetingSide='you'|'others';
export const MEETING_SPEAKER:Record<MeetingSide,string>={you:'You',others:'Others'};
export interface TranscriptWindow {side:MeetingSide;start:number;end:number;pcm:Int16Array}

/** RMS of PCM16 samples as a fraction of full scale. */
export function pcmLevel(samples:Int16Array){
 if(!samples.length)return 0;
 let sum=0;for(const value of samples){const x=value/32768;sum+=x*x;}
 return Math.sqrt(sum/samples.length);
}
/** One side's audio as it arrives, cut into windows to transcribe. `at` is when a chunk arrived, in
 * seconds; a window's start is its first chunk's arrival minus that chunk's length. */
export class TranscriptWindows {
 private chunks:Int16Array[]=[];
 private length=0;
 private start=0;
 private heard=false;
 readonly side:MeetingSide;
 constructor(side:MeetingSide){this.side=side;}
 /** Adds a chunk; returns the window it completes, if any. */
 push(samples:Int16Array,at:number):TranscriptWindow|null {
  if(!samples.length)return null;
  if(!this.length)this.start=at-samples.length/MEETING_TRANSCRIPT.rate;
  this.chunks.push(samples);this.length+=samples.length;
  const quiet=pcmLevel(samples)<MEETING_TRANSCRIPT.quiet;
  if(!quiet)this.heard=true;
  const seconds=this.length/MEETING_TRANSCRIPT.rate;
  // Silence alone is never a window: it is let go as it arrives.
  if(!this.heard&&quiet){this.reset();return null;}
  if(seconds>=MEETING_TRANSCRIPT.maxSeconds||(seconds>=MEETING_TRANSCRIPT.minSeconds&&quiet))return this.cut(at);
  return null;
 }
 /** What is waiting, as a last window (transcription stopped or the page left). */
 flush(at:number):TranscriptWindow|null {return this.length&&this.heard?this.cut(at):(this.reset(),null);}
 private cut(at:number):TranscriptWindow {
  const pcm=new Int16Array(this.length);let offset=0;
  for(const chunk of this.chunks){pcm.set(chunk,offset);offset+=chunk.length;}
  const cut={side:this.side,start:this.start,end:at,pcm};
  this.reset();return cut;
 }
 private reset(){this.chunks=[];this.length=0;this.heard=false;}
}
/** Whisper's well-known inventions on near-silence and music, never kept as speech. */
export function transcriptText(text:unknown){
 const value=String(text??'').replace(/\s+/g,' ').trim();
 if(!value)return '';
 if(/^[\s.,!?…。，！？-]*$/.test(value))return '';
 if(/^(?:\(|\[)?(?:music|silence|applause|laughter|blank_audio|音乐|字幕.*)(?:\)|\])?$/i.test(value))return '';
 if(/^(?:thanks? (?:you )?for watching[.!]?|please subscribe[.!]?|请不吝点赞.*|明镜与点点栏目.*)$/i.test(value))return '';
 return value;
}
/** A finished line as kept in the World: who spoke and what was said. */
export function transcriptLine(side:MeetingSide,text:string){return MEETING_SPEAKER[side]+': '+text;}
