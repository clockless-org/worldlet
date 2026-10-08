import {MEETING_SPEAKER,MEETING_TRANSCRIPT,TranscriptWindows,transcriptLine,transcriptText,type MeetingSide,type TranscriptWindow} from '../../../../../core/applets/index.ts';
import type {Row} from '../../host/types.ts';

export interface TranscriptLine {side:MeetingSide;speaker:string;text:string;start:number;end:number}
export interface MeetingTranscriberOptions {
 /** Local Whisper on 16 kHz mono PCM16; resolves to the words heard ('' for none). */
 transcribe:(pcm:Buffer,signal:AbortSignal)=>Promise<string>;
 /** A finished line, to keep in the World. */
 save:(line:TranscriptLine)=>void;
 /** What the World shows: running, how far behind, the newest line, an error. */
 emit:(state:Row)=>void;
 now?:()=>number;
 onError?:(error:unknown)=>void;
}
/** One call's live transcript (core/applets/meeting-transcript.ts): audio from the page's two sides
 * arrives about once a second, is cut into windows and transcribed one window at a time on this
 * device. Each window's audio is released when its text is known (or when it is dropped); only text
 * leaves this class. Native IO only through `options`. */
export class MeetingTranscriber {
 private sides={you:new TranscriptWindows('you'),others:new TranscriptWindows('others')};
 private queue:TranscriptWindow[]=[];
 private working=false;
 private stopped=false;
 private dropped=0;
 private controller=new AbortController();
 private lines=0;
 private last:TranscriptLine|null=null;
 private error='';
 private readonly options:MeetingTranscriberOptions;
 constructor(options:MeetingTranscriberOptions){this.options=options;}
 private now(){return this.options.now?.()??Date.now()/1000;}
 get active(){return !this.stopped;}
 /** One chunk from meeting-audio.js: {side, rate, pcm (base64 PCM16 little-endian)}. */
 audio(value:Row){
  if(this.stopped)return;
  const side=value.side==='you'||value.side==='others'?value.side as MeetingSide:null;
  if(!side||value.rate!==MEETING_TRANSCRIPT.rate||typeof value.pcm!=='string'||value.pcm.length>200_000)return;
  const bytes=Buffer.from(value.pcm,'base64');if(bytes.length<2)return;
  const samples=new Int16Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+(bytes.length&~1)));
  const window=this.sides[side].push(samples,this.now());
  if(window)this.enqueue(window);
 }
 private enqueue(window:TranscriptWindow){
  this.queue.push(window);
  // Far behind (a slow computer): the oldest audio goes, and the transcript says something is missing.
  while(this.queue.length>MEETING_TRANSCRIPT.maxQueued){this.queue.shift();this.dropped++;}
  this.publish();
  void this.drain();
 }
 private async drain(){
  if(this.working)return;
  this.working=true;
  try{
   while(this.queue.length&&!this.controller.signal.aborted){
    const window=this.queue.shift()!;
    let text='';
    try{
     const pcm=Buffer.from(window.pcm.buffer,window.pcm.byteOffset,window.pcm.byteLength);
     text=transcriptText(await this.options.transcribe(pcm,this.controller.signal));
     this.error='';
    }catch(error){
     if(this.controller.signal.aborted)break;
     this.error=error instanceof Error&&error.message?error.message:'Local speech could not transcribe this part.';
     this.options.onError?.(error);
    }
    if(!text)continue;
    const line={side:window.side,speaker:MEETING_SPEAKER[window.side],text,start:window.start,end:window.end};
    this.lines++;this.last=line;
    try{this.options.save(line);}catch(error){this.options.onError?.(error);}
    this.publish();
   }
  }finally{this.working=false;this.publish();}
 }
 private publish(){
  this.options.emit({active:!this.stopped,lines:this.lines,waiting:this.queue.length+(this.working?1:0),dropped:this.dropped,
   ...this.last?{last:transcriptLine(this.last.side,this.last.text)}:{},...this.error?{error:this.error}:{}});
 }
 /** Stops listening; what was already heard is still transcribed unless `discard`. */
 stop(discard=false){
  if(this.stopped)return;
  this.stopped=true;
  if(discard){this.queue=[];this.controller.abort();}
  else for(const side of Object.values(this.sides)){const window=side.flush(this.now());if(window)this.queue.push(window);}
  this.publish();
  void this.drain();
 }
 /** The page is gone: nothing more is transcribed. */
 cancel(){this.stop(true);}
}
