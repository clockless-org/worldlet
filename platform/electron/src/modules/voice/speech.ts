import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {systemPreferences} from 'electron';
import {WorldletError,adoptFolder,ensureDirectory} from '../../files.ts';
import {installationRoot,legacyFolder} from '../../profile.ts';
import type {Host} from '../../host/types.ts';
import type {MediaSurface} from '../media/surface.ts';
import {WINDOWS_BASE,cancelled,environment,run} from '../media/io.ts';
import {helperPython} from '../media/local-tools.ts';
import {talkSpokenText} from '../../../../../core/companion/index.ts';
import type {HarnessVoice} from '../../../../../contracts/harness-services.ts';

const LIMIT_SECONDS=45,LONG_LIMIT_SECONDS=180;
const wav=(pcm:Buffer)=>{
 const header=Buffer.alloc(44);
 header.write('RIFF',0,'ascii');header.writeUInt32LE(pcm.length+36,4);header.write('WAVEfmt ',8,'ascii');
 header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);header.writeUInt32LE(16000,24);header.writeUInt32LE(32000,28);
 header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);header.write('data',36,'ascii');header.writeUInt32LE(pcm.length,40);
 return Buffer.concat([header,pcm]);
};

/** Local Whisper transcription: MLX on Mac (`whisper_local.py`), faster-whisper in a private
 * runtime on Windows (`whisper_windows.py`). Audio and the model stay on this device. */
export class LocalSpeech {
 private host:Host;
 private preparation:Promise<void>|null=null;
 private preparing:AbortController|null=null;
 private retryAfter=0;
 private background=false;
 private warming:NodeJS.Timeout|null=null;
 /** Helper runs still holding files under the library's speech folder. */
 private running=new Set<Promise<unknown>>();
 ready=false;
 constructor(host:Host){this.host=host;}
 get supported(){return process.platform==='darwin'||process.platform==='win32';}
 /** `<library>/speech` on Windows; on Mac the installation library's, beside Fox's runtime (`installationRoot`). */
 private get root(){return path.join(process.platform==='win32'?this.host.profile.root:installationRoot(this.host.profile),'speech');}
 /** A Mac release kept the MLX packages and model in `Worldlet Speech` beside the library until 2026-10-04:
  * they move in once (packages installed with `pip --target` and the model hold no absolute paths). */
 private adoptLegacy(){if(process.platform==='darwin'&&this.host.profile.channel==='release')adoptFolder(legacyFolder('Worldlet Speech'),this.root);}
 private script(){return path.join(this.host.profile.webRoot,'local-tools',process.platform==='win32'?'whisper_windows.py':'whisper_local.py');}
 /** Windows recordings live under the library; remove any a crash left behind (with its names hint). */
 cleanAbandoned(){
  if(process.platform!=='win32')return;
  try{for(const name of fs.readdirSync(this.root))if(/^recording-[0-9a-f]{32}\.(wav|txt)$/.test(name)){const file=path.join(this.root,name);if(!fs.lstatSync(file).isSymbolicLink())fs.rmSync(file,{force:true});}}catch{}
 }
 private async run(operation:'prepare'|'transcribe',args:string[],signal?:AbortSignal){
  const python=await helperPython(this.host);
  if(signal?.aborted)throw cancelled();
  const windows=process.platform==='win32';
  if(!windows)this.adoptLegacy();
  const argv=windows?['-I','-B',this.script(),operation,this.root,...args]:['-B',this.script(),operation,this.root,...args];
  const env=windows?environment([...WINDOWS_BASE,'PROGRAMFILES','PROGRAMFILES(X86)','PROGRAMDATA','SSL_CERT_FILE','HTTPS_PROXY','HTTP_PROXY','NO_PROXY']):environment(['HOME','PATH','TMPDIR','LANG','SSL_CERT_FILE','HTTPS_PROXY','HTTP_PROXY','NO_PROXY']);
  // A spoken Order runs up to LONG_LIMIT_SECONDS, which a CPU-only computer takes a while to recognise.
  const timeout=operation==='prepare'?(windows?15*60_000:900_000):300_000;
  const running=run(python,argv,{env,timeout,signal,limit:64_000,timeoutMessage:'Local speech setup or recognition timed out. Try again.'});
  this.running.add(running);
  const result=await running.finally(()=>this.running.delete(running));
  let value:any=null;
  try{value=JSON.parse(result.stdout.toString('utf8'));}catch{}
  if(result.code!==0||!value||typeof value!=='object'){
   if(windows)throw new WorldletError(operation==='prepare'?'Local speech setup failed. Check your connection and try again, or type to Fox.':'Local speech could not understand this recording. Try again or type to Fox.');
   throw new WorldletError('Local speech recognition is unavailable. Check your connection for the first download, then try again.');
  }
  return value;
 }
 prepare(){
  if(!this.supported)return Promise.reject(new WorldletError('Local speech is not available on this computer. Type to Fox instead.'));
  if(!this.preparation){
   const controller=new AbortController();
   const preparation=this.run('prepare',[],controller.signal).then(()=>{this.ready=true;});
   this.preparation=preparation;this.preparing=controller;
   preparation.catch(()=>{if(this.preparation===preparation)this.preparation=null;}).finally(()=>{if(this.preparing===controller)this.preparing=null;});
  }
  return this.preparation;
 }
 /** Retry failed background preparation at most once a minute, after the World paints. */
 warm(){
  if(!this.supported||this.ready||this.background||Date.now()<this.retryAfter)return;
  this.background=true;
  this.warming=setTimeout(()=>{this.warming=null;this.prepare().catch(error=>{if(error?.name!=='AbortError')this.retryAfter=Date.now()+60_000;}).finally(()=>{this.background=false;});},3000);
 }
 /** Stops preparation and waits until no helper holds the speech folder: on Windows an open
  * file there makes Reset's move of the library fail. The next `warm` or voice input starts over. */
 async stop(){
  if(this.warming){clearTimeout(this.warming);this.warming=null;this.background=false;}
  this.preparing?.abort();
  await Promise.allSettled([...this.running]);
 }
 /** `prompt`: the World's names for Whisper (core speechPrompt), in a file beside the recording, never on the command line. */
 async transcribe(pcm:Buffer,language:string,signal:AbortSignal,prompt=''):Promise<string> {
  const windows=process.platform==='win32';
  const file=windows?path.join(ensureDirectory(this.root),`recording-${crypto.randomUUID().replace(/-/g,'')}.wav`):path.join(os.tmpdir(),`worldlet-voice-${crypto.randomUUID().toUpperCase()}.wav`);
  const hint=prompt?file.replace(/\.wav$/,'.txt'):'';
  fs.writeFileSync(file,wav(pcm),{mode:0o600});
  if(hint)fs.writeFileSync(hint,prompt,{mode:0o600});
  try{
   const value=await this.run('transcribe',[file,language,...hint?[hint]:[]],signal);
   return String(value.text??'').trim();
  }catch(error){if(!signal.aborted&&windows){this.ready=false;this.preparation=null;}throw error;}
  finally{fs.rmSync(file,{force:true});if(hint)fs.rmSync(hint,{force:true});}
 }
}

/** Fox voice input: 16 kHz mono PCM captured in the media surface, then transcribed locally. */
export class SpeechInput {
 private surface:MediaSurface;
 private local:LocalSpeech;
 private epoch=0;
 private capturing=false;
 private language='multi';
 /** Whisper's hint for this capture: the World's names (core speechPrompt). */
 private prompt='';
 private limit:NodeJS.Timeout|null=null;
 private seconds=LIMIT_SECONDS;
 private lastLevelAt=0;
 private transcription:AbortController|null=null;
 /** Rolling while Fox speaks in Talk (`start` with `roll`), until `keep`. */
 private rolling=false;
 /** The microphone the page chose last; the wake word listens on it too. */
 microphone:{id:string,label:string}|null=null;
 onCaptureChanged:(active:boolean)=>void=()=>{};
 onEvent:(value:{phase:string,text:string})=>void=()=>{};
 constructor(surface:MediaSurface,local:LocalSpeech){
  this.surface=surface;this.local=local;
  surface.onEvent(event=>{
   if(!this.capturing||event.tag==='wake')return;
   if(event.type==='level'){
    const now=Date.now();
    if(now-this.lastLevelAt>=60){this.lastLevelAt=now;this.onEvent({phase:'level',text:String(event.value)});}
    if(event.total>=this.seconds*16000)this.finish();
   }else if(event.type==='capture-ended'||event.type==='gone'){
    this.cancel();this.onEvent({phase:'error',text:'The microphone stopped. Check the input device and try again.'});
   }
  });
 }
 /** Input devices as the media surface sees them; their ids are the ones `start` accepts. */
 async microphones(){
  this.surface.allowList=true;
  try{
   const list=await this.surface.call<{id:string,label:string}[]>('microphones');
   return (Array.isArray(list)?list:[]).filter(d=>typeof d?.id==='string'&&d.id).map(d=>({id:d.id,label:String(d.label??'')}));
  }finally{this.surface.allowList=false;}
 }
 /** Capturing or recognising: the microphone is Fox's voice input's, not the wake word's. */
 get busy(){return this.capturing||this.transcription!==null;}
 /** `seconds` lengthens one capture (Order's spoken tasks); at most LONG_LIMIT_SECONDS. `roll` keeps only the
  * latest seconds and no time limit (Talk listening while Fox speaks) until `keep`. */
 async start(language:string,microphone:{id:string,label:string}|null=null,seconds=LIMIT_SECONDS,roll=0,prompt=''){
  this.cancel();this.microphone=microphone;
  this.seconds=Math.max(1,Math.min(LONG_LIMIT_SECONDS,seconds));
  if(!/^(multi|[a-z]{2,3})$/.test(String(language)))throw new WorldletError('Choose a speech language or automatic speech recognition.');
  this.language=language;this.prompt=prompt;const turn=this.epoch;
  if(process.platform==='darwin'){
   const status=systemPreferences.getMediaAccessStatus('microphone');
   const allowed=status==='granted'?true:status==='not-determined'?await systemPreferences.askForMediaAccess('microphone'):false;
   if(turn!==this.epoch)throw cancelled();
   if(!allowed)throw new WorldletError('Allow Worldlet in System Settings → Privacy & Security → Microphone, or tap Fox to type.');
  }
  this.surface.allowCapture=true;let fallback=false;
  try{fallback=!!(await this.surface.call<{fallback?:boolean}>('captureStart',microphone,this.seconds,roll,'speech'))?.fallback;}
  catch{
   this.surface.allowCapture=false;
   if(turn===this.epoch)this.cancel();
   throw new WorldletError(process.platform==='win32'?'Could not open the microphone. Check the input device and Windows microphone privacy settings.':'Check your microphone input device.');
  }
  if(turn!==this.epoch){this.surface.callIfOpen('captureCancel','speech');throw cancelled();}
  this.capturing=true;this.rolling=roll>0;this.onCaptureChanged(true);
  // Retry failed background preparation without waiting for it.
  this.local.warm();
  if(!this.rolling)this.limit=setTimeout(()=>{this.limit=null;this.finish();},this.seconds*1000);
  return {microphoneFallback:fallback};
 }
 /** The rolling capture becomes the utterance, starting `keepMs` back (the person's first words), or now. */
 keep(keepMs:number){
  if(!this.capturing||!this.rolling)return;
  this.rolling=false;this.surface.callIfOpen('captureKeep',keepMs);
  this.limit=setTimeout(()=>{this.limit=null;this.finish();},this.seconds*1000);
 }
 finish(){
  if(!this.capturing)return;
  const turn=this.epoch;
  this.capturing=false;this.rolling=false;if(this.limit){clearTimeout(this.limit);this.limit=null;}
  this.onCaptureChanged(false);
  this.onEvent({phase:'processing',text:'Understanding your voice…'});
  const controller=new AbortController();this.transcription=controller;
  void (async()=>{
   let pcm:Buffer;
   try{pcm=Buffer.from(await this.surface.call<string>('captureStop'),'base64');}catch{pcm=Buffer.alloc(0);}
   finally{this.surface.allowCapture=false;}
   const current=()=>turn===this.epoch&&!controller.signal.aborted;
   try{
    let text='';
    if(pcm.length>=3200){
     if(!this.local.ready){
      if(current())this.onEvent({phase:'processing',text:'Preparing local speech. The first use downloads a model; audio stays on this device.'});
      await this.local.prepare();
      if(!current())return;
      this.onEvent({phase:'processing',text:'Understanding your voice…'});
     }
     text=await this.local.transcribe(pcm,this.language,controller.signal,this.prompt);
    }
    if(!current())return;
    this.transcription=null;
    this.onEvent({phase:text?'final':'error',text:text||'I did not hear speech. Hold Fox and try again.'});
   }catch(error){
    if(!current())return;
    this.transcription=null;
    this.onEvent({phase:'error',text:error instanceof WorldletError&&!/timed out/.test(error.message)?error.message:'Local speech is not ready. Check your connection for the first download and try again, or type to Fox.'});
   }
  })();
 }
 cancel(){
  this.transcription?.abort();this.transcription=null;
  this.epoch+=1;this.lastLevelAt=0;
  if(this.limit){clearTimeout(this.limit);this.limit=null;}
  this.surface.callIfOpen('captureCancel','speech');this.surface.allowCapture=false;
  const was=this.capturing;this.capturing=false;this.rolling=false;
  if(was)this.onCaptureChanged(false);
 }
}

// Script-based language guess for an automatic voice (Mac used NLLanguageRecognizer,
// Windows the ELS service); Latin text keeps the system's default voice.
function replyLanguage(text:string){
 const scripts:[RegExp,string][]=[[/\p{Script=Hiragana}|\p{Script=Katakana}/u,'ja'],[/\p{Script=Hangul}/u,'ko'],[/\p{Script=Han}/u,'zh'],[/\p{Script=Cyrillic}/u,'ru'],[/\p{Script=Arabic}/u,'ar'],[/\p{Script=Hebrew}/u,'he'],[/\p{Script=Thai}/u,'th'],[/\p{Script=Greek}/u,'el'],[/\p{Script=Devanagari}/u,'hi']];
 for(const [pattern,language] of scripts)if(pattern.test(text))return language;
 return null;
}
export const plainReply=talkSpokenText;

/** Spoken Fox replies: in the Agent's own voice (its Harness `voice` service) when the person kept the automatic
 * voice, otherwise, or when that clip cannot be made or played, through the system voices Chromium exposes. */
export class SpeechOutput {
 private surface:MediaSurface;
 private token=0;
 private speaking=false;
 onDuck:(active:boolean)=>void=()=>{};
 /** A reply stopped being read: it ended, was stopped or the surface went away (Talk with Fox listens again). */
 onFinished:()=>void=()=>{};
 constructor(surface:MediaSurface){
  this.surface=surface;
  surface.onEvent(event=>{
   if(event.type==='gone'&&this.speaking){this.speaking=false;this.onDuck(false);this.onFinished();}
   if(event.type!=='speech'||event.token!==this.token)return;
   if(event.event==='end'&&this.speaking){this.speaking=false;this.onDuck(false);this.onFinished();}
  });
 }
 async voices(){
  const list=await this.surface.call<{id:string,name:string,language:string,default?:boolean}[]>('voices');
  return (list??[]).filter(v=>typeof v?.id==='string'&&v.id).map(({id,name,language})=>({id,name:String(name??id),language:String(language??'')}));
 }
 stop(){this.token+=1;this.surface.callIfOpen('stopSpeaking');const was=this.speaking;this.speaking=false;this.onDuck(false);if(was)this.onFinished();}
 /** True when the reply is being read. */
 async speak(text:string,enabled:boolean,voiceId:string,agent:HarnessVoice|null=null):Promise<boolean>{
  this.stop();
  if(!enabled)return false;
  const plain=plainReply(text);
  if(!plain)return false;
  const token=this.token;
  if(agent&&!voiceId){
   const clip=await agent.speak(plain).catch(()=>null);
   if(token!==this.token)return false;
   if(clip){
    this.speaking=true;this.onDuck(true);
    try{await this.surface.call('speakClip',token,`data:${clip.mimeType};base64,${Buffer.from(clip.audio).toString('base64')}`);return token===this.token;}
    catch{if(token!==this.token)return false;this.speaking=false;this.onDuck(false);}
   }
  }
  let voice='',language:string|null=null;
  const voices=await this.voices().catch(()=>[]);
  if(token!==this.token)return false;
  // A Mac AVSpeech identifier ends with the voice name Chromium reports.
  const chosen=voiceId?voices.find(v=>v.id===voiceId)??voices.find(v=>v.id===voiceId.split('.').pop()):undefined;
  if(chosen)voice=chosen.id;
  else{
   language=replyLanguage(plain);
   const match=language?voices.find(v=>v.language.toLowerCase().split(/[-_]/)[0]===language):undefined;
   if(match)voice=match.id;
  }
  this.speaking=true;this.onDuck(true);
  try{await this.surface.call('speak',token,plain.slice(0,12000),voice,language);}
  catch(error){if(token===this.token){this.speaking=false;this.onDuck(false);}throw error;}
  return token===this.token;
 }
}
