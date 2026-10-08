// Talk with Fox on the computer (core/companion/fox-talk.ts): listen, send each utterance as a turn, read the reply
// aloud, listen again. While Fox speaks the microphone stays open (`listenWhileSpeaking`, a capture that keeps only its
// last moment; the system voice plays outside Chromium's echo canceller) and the person's voice clearly over Fox's echo
// interrupts it (`talkBargeIn`): the voice stops and the same capture becomes the next utterance. Pressing the microphone, Fox or Space interrupts too.
// native-chat.ts owns the capture and the turn; this keeps the rhythm, so it runs with fakes in scripts/fox-talk-check.ts.
import {talkBargeIn,talkEndpoint,talkQuietRequest,talkSpeakingLimit} from '../../core/companion/index.ts';

export type TalkPhase='off'|'listening'|'thinking'|'speaking';

export function createFoxTalk({listen,finishListening,cancelListening,listenWhileSpeaking,keepListening=()=>{},speak,stopSpeaking,submit,changed=()=>{},now=Date.now,schedule=(fn:()=>void,ms:number):any=>setTimeout(fn,ms),clear=(timer:any)=>clearTimeout(timer)}:{
 /** Starts one capture; resolves false when the microphone could not start. */
 listen:()=>Promise<boolean>;finishListening:()=>void;cancelListening:()=>void;
 /** Voice barge-in, where the host has it: opens a capture while Fox speaks (false: none). `keepListening` makes it
  * the next utterance, keeping its last moment (`preroll`, the person's first words) or dropping it (Fox's echo). */
 listenWhileSpeaking?:()=>Promise<boolean>;keepListening?:(preroll:boolean)=>void;
 /** Reads a reply; resolves true when the voice is speaking it (false: spoken replies are off for Talk, or nothing to say). */
 speak:(text:string)=>Promise<boolean>;stopSpeaking:()=>void;
 submit:(text:string)=>void;changed?:()=>void;now?:()=>number;
 schedule?:(fn:()=>void,ms:number)=>any;clear?:(timer:any)=>void;
}){
 let phase:TalkPhase='off',quiet=false,token=0,timer:any=null,barge:ReturnType<typeof talkBargeIn>|null=null,overhearing=false;
 const endpoint=talkEndpoint(now());
 const set=(next:TalkPhase)=>{phase=next;changed();};
 const wait=()=>{if(timer!==null){clear(timer);timer=null;}};
 async function hear(){
  // The capture opened while Fox spoke goes on as this utterance, without Fox's echo.
  if(overhearing){overhear(false);return;}
  wait();const turn=++token;endpoint.reset(now());set('listening');
  let started=false;try{started=await listen();}catch{}
  if(turn===token&&phase==='listening'&&!started)stop();
 }
 /** The capture open while Fox spoke becomes the utterance: with its last moment after a barge-in, else without. */
 function overhear(preroll:boolean){wait();token++;overhearing=false;const heard=preroll?barge?.voicedMs??0:0;barge=null;keepListening(preroll);endpoint.reset(now(),heard);set('listening');}
 function stop(){if(phase==='off')return;wait();token++;const was=phase;phase='off';barge=null;if(was==='speaking')stopSpeaking();if(was==='listening'||overhearing)cancelListening();overhearing=false;changed();}
 return {
  get phase(){return phase;},get on(){return phase!=='off';},get quiet(){return quiet;},
  /** Starts Talk; `first` is a request already heard (said with the wake word), sent as the first turn. */
  start(first=''){if(phase!=='off')return;quiet=false;if(String(first??'').trim()){token++;set('thinking');submit(first);}else void hear();},
  stop,
  toggle(){if(phase==='off')this.start();else stop();},
  /** A level from the capture under way. */
  level(value:number){
   if(phase==='speaking'&&overhearing&&barge){if(barge.feed(value,now())){stopSpeaking();overhear(true);}return;}
   if(phase!=='listening')return;
   const heard=endpoint.feed(value,now());
   if(heard==='ended'){token++;set('thinking');finishListening();}
   // Nothing said for a while: start the capture over before the recorder's own limit sends silence.
   else if(heard==='idle'){cancelListening();void hear();}
  },
  /** The capture's transcript. True when Talk took it (and sent it as a turn). */
  heard(text:string){
   if(phase==='off')return false;
   if(!String(text??'').trim()){void hear();return true;}
   if(talkQuietRequest(text)){quiet=true;stopSpeaking();}
   token++;set('thinking');submit(text);return true;
  },
  /** The capture heard nothing worth sending (silence, a cough): listen again. */
  missed(){if(phase!=='off')void hear();},
  /** The turn ended with this reply ('' when it said nothing): read it, then listen again. */
  async replied(text:string){
   if(phase!=='thinking')return;
   if(quiet||!String(text??'').trim()){void hear();return;}
   const turn=++token;set('speaking');
   let speaking=false;try{speaking=await speak(text);}catch{}
   if(turn!==token||(phase as TalkPhase)!=='speaking')return;
   if(!speaking){void hear();return;}
   timer=schedule(()=>{timer=null;if(turn===token&&phase==='speaking')void hear();},talkSpeakingLimit(text));
   if(!listenWhileSpeaking)return;
   let open=false;try{open=await listenWhileSpeaking();}catch{}
   // The voice ended while the capture opened: it is the next utterance's (Fox's echo dropped), or Talk ended.
   if(turn!==token||(phase as TalkPhase)!=='speaking'){if(open){const now=phase as TalkPhase;if(now==='listening')keepListening(false);else if(now==='off')cancelListening();}return;}
   if(open){overhearing=true;barge=talkBargeIn(now());changed();}
  },
  /** Whether the microphone is open while Fox speaks. */
  get overhearing(){return overhearing;},
  /** The capture open while Fox spoke went away (moving elsewhere): the voice goes on and Talk listens after it. */
  dropped(){if(overhearing){overhearing=false;barge=null;changed();}else if(phase==='listening')void hear();},
  /** The system voice finished reading. */
  spoken(){if(phase==='speaking')void hear();},
  /** Barge-in: the person pressed to talk while Fox spoke. `listenAgain` false when that press starts its own capture. */
  interrupt(listenAgain=true){
   if(phase!=='speaking')return false;
   stopSpeaking();
   if(overhearing)overhear(false);else if(listenAgain)void hear();else{wait();token++;endpoint.reset(now());set('listening');}
   return true;
  }
 };
}
export type FoxTalk=ReturnType<typeof createFoxTalk>;
