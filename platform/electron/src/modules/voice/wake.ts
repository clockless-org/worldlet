import {powerMonitor,systemPreferences} from 'electron';
import {WAKE,wakeGate,wakeMatch,wakeState,type WakeState} from '../../../../../core/companion/index.ts';
import type {MediaSurface} from '../media/surface.ts';
import type {LocalSpeech,SpeechInput} from './speech.ts';

export type {WakeState};

/** The wake word on the computer (core/companion/fox-talk.ts): while `worldlet.wakeWord` is on, the media surface
 * keeps a rolling 4-second capture whose levels single out short standalone phrases (`wakeGate`); each goes to local
 * Whisper on this device (`LocalSpeech`) and `wakeMatch` decides. Nothing is recorded or sent anywhere; the audio
 * lives only in that rolling buffer. It rests while Fox's own voice input or Talk has the microphone, during a call in
 * Meetings (`inCall`, looked at again every few seconds), while the screen is locked or the computer sleeps, and until Worldlet has the microphone permission; it never asks for it itself. */
export class WakeListener {
 private surface:MediaSurface;
 private local:LocalSpeech;
 private speech:SpeechInput;
 private enabled=false;
 private talking=false;
 private locked=false;
 private open=false;
 private starting=false;
 private checking:AbortController|null=null;
 private gate=wakeGate(Date.now());
 private retry:NodeJS.Timeout|null=null;
 /** After a wake, until the page says Talk started; a page that did not start it frees the microphone again. */
 private waking:NodeJS.Timeout|null=null;
 private current:WakeState='off';
 /** The Fox's name now ("Hey Momo" as well as "Hey Fox"). */
 name:()=>string=()=>'';
 /** A call in Meetings (BrowserService.inCall). */
 inCall:()=>boolean=()=>false;
 private recheck:NodeJS.Timeout|null=null;
 /** The microphone would not open: try again after this. */
 private failedUntil=0;
 /** The wake word was heard; `rest` is what was said after it. */
 onWake:(rest:string)=>void=()=>{};
 onState:(state:WakeState)=>void=()=>{};
 constructor(surface:MediaSurface,local:LocalSpeech,speech:SpeechInput){
  this.surface=surface;this.local=local;this.speech=speech;
  surface.onEvent(event=>{
   if(event.tag!=='wake'||!this.open)return;
   if(event.type==='level'){const ms=this.gate.feed(Number(event.value)||0,Date.now());if(ms)void this.check(ms);}
   else if(event.type==='capture-ended'){this.close();this.later(5000);}
  });
  surface.onEvent(event=>{if(event.type==='gone'&&this.open){this.open=false;this.later(5000);}});
 }
 get supported(){return this.local.supported;}
 get state(){return this.current;}
 /** The wake word preference turned on or off. */
 set(on:boolean){
  this.enabled=on&&this.supported;if(on)this.local.warm();
  // A call starts or ends without telling the listener: it looks again while it is on.
  if(this.enabled&&!this.recheck)this.recheck=setInterval(()=>this.refresh(),WAKE.recheckMs);
  else if(!this.enabled&&this.recheck){clearInterval(this.recheck);this.recheck=null;}
  this.refresh();
 }
 /** Talk with Fox is on (the page says): Talk has the microphone. */
 setTalking(on:boolean){if(this.waking){clearTimeout(this.waking);this.waking=null;}this.talking=on;this.refresh();}
 watchPower(){
  const lock=()=>{this.locked=true;this.refresh();},unlock=()=>{this.locked=false;this.refresh();};
  powerMonitor.on('lock-screen',lock);powerMonitor.on('suspend',lock);powerMonitor.on('unlock-screen',unlock);powerMonitor.on('resume',unlock);
  return ()=>{powerMonitor.off('lock-screen',lock);powerMonitor.off('suspend',lock);powerMonitor.off('unlock-screen',unlock);powerMonitor.off('resume',unlock);};
 }
 private permitted(){return process.platform!=='darwin'||systemPreferences.getMediaAccessStatus('microphone')==='granted';}
 private publish(state:WakeState){if(state!==this.current){this.current=state;this.onState(state);}}
 private later(ms:number){if(this.retry)clearTimeout(this.retry);this.retry=setTimeout(()=>{this.retry=null;this.refresh();},ms);}
 /** Opens or closes the wake capture for the state now; called again whenever Fox's voice input changes. */
 refresh(){
  let inCall=false;try{inCall=this.enabled&&this.inCall();}catch{}
  const state=wakeState({enabled:this.enabled,supported:this.supported,permitted:this.enabled&&this.permitted(),busy:this.speech.busy,talking:this.talking,inCall,locked:this.locked});
  if(state!=='listening'){this.close();this.publish(state);return;}
  if(Date.now()<this.failedUntil){this.publish('unavailable');return;}
  this.publish('listening');
  if(this.open||this.starting)return;
  this.starting=true;this.surface.allowWake=true;
  this.surface.call('captureStart',this.speech.microphone,45,4,'wake').then(()=>{
   this.starting=false;
   // Voice input may have taken the microphone while this one opened.
   if(this.current!=='listening'){this.surface.callIfOpen('captureCancel','wake');this.surface.allowWake=false;return;}
   this.open=true;this.gate=wakeGate(Date.now());
  },()=>{this.starting=false;this.surface.allowWake=false;this.failedUntil=Date.now()+60_000;this.publish('unavailable');this.later(60_000);});
 }
 private close(){
  this.checking?.abort();this.checking=null;
  if(this.open||this.starting)this.surface.callIfOpen('captureCancel','wake');
  this.open=false;if(!this.starting)this.surface.allowWake=false;
 }
 /** One short phrase: its audio (the last `ms` of the rolling capture) through local Whisper. */
 private async check(ms:number){
  if(this.checking||!this.local.ready){this.gate.release();if(!this.local.ready)this.local.warm();return;}
  const controller=new AbortController();this.checking=controller;
  try{
   const pcm=Buffer.from(await this.surface.call<string>('captureSnapshot',Math.min(ms,4000)),'base64');
   if(controller.signal.aborted||pcm.length<WAKE.minMs*32)return;
   const text=await this.local.transcribe(pcm,'multi',controller.signal);
   if(controller.signal.aborted||!this.open)return;
   const heard=wakeMatch(text,this.name());
   if(!heard)return;
   // Talk takes the microphone from here; the listener rests until Talk ends (`setTalking`).
   this.talking=true;this.close();this.publish('paused');
   this.waking=setTimeout(()=>{this.waking=null;this.talking=false;this.refresh();},8000);
   this.onWake(heard.rest);
  }catch{}
  finally{if(this.checking===controller)this.checking=null;}
 }
 stop(){for(const timer of [this.retry,this.waking])if(timer)clearTimeout(timer);if(this.recheck)clearInterval(this.recheck);this.retry=this.waking=this.recheck=null;this.enabled=false;this.close();}
}
