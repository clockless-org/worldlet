import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {WebContentsView,session,type WebContents} from 'electron';
import {scriptJSON as json} from '../../host/page.ts';
import type {Row} from '../../host/types.ts';

// The host-owned playback and capture surface: a detached Chromium view that no window
// shows, so ambience, radio, Voice Memos playback, speech capture and spoken replies keep
// running while the World page reloads or hides into the desktop Companion. It has no
// host bridge; the host drives it with executeJavaScript and drains its events.
const PAGE=`<!doctype html><meta charset="utf-8"><title>Worldlet media</title><script>
'use strict';
const players=new Map(),queue=[];let wake=null,capture=null,clip=null;
function emit(event){queue.push(event);if(queue.length>400)queue.splice(0,queue.length-400);if(wake){const w=wake;wake=null;w();}}
navigator.mediaDevices.addEventListener('devicechange',()=>emit({type:'devices'}));
function finite(n){return Number.isFinite(n)?n:0;}
function info(id){const p=players.get(id);if(!p)return null;const a=p.audio;return {token:p.token,time:finite(a.currentTime),duration:Number.isFinite(a.duration)?a.duration:null,paused:a.paused,ended:a.ended,readyState:a.readyState,error:a.error?(a.error.code||1):0,volume:a.volume};}
function unload(id){const p=players.get(id);if(!p)return;clearInterval(p.fade);p.dead=true;p.audio.pause();p.audio.removeAttribute('src');p.audio.load();players.delete(id);}
function stopFade(p){if(p&&p.fade){clearInterval(p.fade);p.fade=0;}}
window.__media={
 next(){if(queue.length)return Promise.resolve(queue.splice(0));return new Promise(resolve=>{const timer=setTimeout(()=>{wake=null;resolve([]);},10000);wake=()=>{clearTimeout(timer);resolve(queue.splice(0));};});},
 load(id,token,url,loop){
  unload(id);const audio=new Audio(),p={audio,token,fade:0,dead:false,last:0};
  audio.preload='auto';audio.loop=!!loop;audio.volume=0;players.set(id,p);
  for(const name of ['playing','pause','waiting','stalled','ended','error','loadedmetadata','seeked'])audio.addEventListener(name,()=>{if(!p.dead)emit({type:'media',id,token,event:name,time:finite(audio.currentTime),duration:Number.isFinite(audio.duration)?audio.duration:null,error:audio.error?(audio.error.code||1):0});});
  audio.addEventListener('timeupdate',()=>{const now=Date.now();if(p.dead||now-p.last<1000)return;p.last=now;emit({type:'media',id,token,event:'time',time:finite(audio.currentTime),duration:Number.isFinite(audio.duration)?audio.duration:null});});
  audio.src=url;return true;
 },
 async play(id){const p=players.get(id);if(!p)throw Error('missing');await p.audio.play();return info(id);},
 pause(id){const p=players.get(id);if(p)p.audio.pause();return info(id);},
 stop(id){const p=players.get(id);if(p){p.audio.pause();try{p.audio.currentTime=0;}catch{}}return info(id);},
 unload(id){unload(id);return true;},
 info(id){return info(id);},
 metadata(id,timeout){const p=players.get(id);if(!p)return Promise.resolve(null);const a=p.audio;if(a.readyState>=1||a.error)return Promise.resolve(info(id));
  return new Promise(resolve=>{const done=()=>{clearTimeout(timer);a.removeEventListener('loadedmetadata',done);a.removeEventListener('error',done);resolve(info(id));};const timer=setTimeout(done,timeout);a.addEventListener('loadedmetadata',done);a.addEventListener('error',done);});},
 seek(id,seconds){const p=players.get(id);if(!p)return Promise.resolve(false);const a=p.audio;
  return new Promise(resolve=>{const done=ok=>{clearTimeout(timer);a.removeEventListener('seeked',yes);resolve(ok);},yes=()=>done(true),timer=setTimeout(()=>done(false),15000);a.addEventListener('seeked',yes);try{a.currentTime=seconds;}catch{done(false);}});},
 volume(id,value){const p=players.get(id);if(p){stopFade(p);p.audio.volume=Math.max(0,Math.min(1,value));}return true;},
 // One cancellable smoothstep envelope per player, like the native AudioVolumeFade.
 fade(id,from,to,duration){const p=players.get(id);if(!p)return false;stopFade(p);const started=performance.now();
  const step=()=>{const progress=Math.min(1,(performance.now()-started)/(duration*1000)),eased=progress*progress*(3-2*progress);p.audio.volume=Math.max(0,Math.min(1,from+(to-from)*eased));if(progress>=1)stopFade(p);};
  step();if(p.audio.volume!==to)p.fade=setInterval(step,16);return true;},
 cancelFade(id){stopFade(players.get(id));return true;},
 async microphones(){const list=await navigator.mediaDevices.enumerateDevices();return list.filter(d=>d.kind==='audioinput'&&d.deviceId&&d.deviceId!=='default'&&d.deviceId!=='communications').map(d=>({id:d.deviceId,label:d.label}));},
 // The page's choice (#1228): its id, else the same label; a missing device falls back to the default. One capture
 // at a time, tagged by its owner ('speech' for Fox's voice input, 'wake' for the wake word). roll seconds keep only
 // the capture's latest moment (the wake word's, and Talk's while Fox speaks) until captureKeep.
 async captureStart(choice,seconds=45,roll=0,tag='speech'){
  if(capture)this.captureCancel();
  const base={channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true};let fallback=false,stream=null;
  if(choice&&choice.id){
   const inputs=await this.microphones().catch(()=>[]),found=inputs.find(d=>d.id===choice.id)||(choice.label?inputs.find(d=>d.label===choice.label):null);
   if(found||!inputs.some(d=>d.label))try{stream=await navigator.mediaDevices.getUserMedia({audio:{...base,deviceId:{exact:found?found.id:choice.id}},video:false});}catch(error){if(!['OverconstrainedError','NotFoundError','NotReadableError'].includes(error&&error.name))throw error;}
   fallback=!stream;
  }
  if(!stream)stream=await navigator.mediaDevices.getUserMedia({audio:base,video:false});
  const context=new AudioContext(),source=context.createMediaStreamSource(stream),node=context.createScriptProcessor(1024,1,1);
  const state={stream,context,source,node,chunks:[],total:0,sum:0,count:0,phase:0,samples:[],roll:Math.round(roll*16000),tag};capture=state;
  // Average down to 16 kHz mono PCM16 in place, keeping the capture's own limit (45 seconds, an Order's 180).
  const keep=Math.round(seconds*16000);
  node.onaudioprocess=event=>{
   if(capture!==state)return;const input=event.inputBuffer.getChannelData(0),rate=context.sampleRate;let energy=0,n=0;
   for(let i=0;i<input.length;i++){state.sum+=input[i];state.count++;state.phase+=16000;if(state.phase>=rate){state.phase-=rate;const s=Math.max(-1,Math.min(1,state.sum/state.count)),v=Math.round(s*(s<0?32768:32767));state.samples.push(v);energy+=v*v;n++;state.sum=0;state.count=0;}}
   if(state.samples.length){if(state.total<keep){const chunk=Int16Array.from(state.samples.slice(0,keep-state.total));state.chunks.push(chunk);state.total+=chunk.length;}state.samples=[];}
   while(state.roll&&state.chunks.length>1&&state.total-state.chunks[0].length>=state.roll)state.total-=state.chunks.shift().length;
   if(n)emit({type:'level',value:Math.min(1,Math.sqrt(energy/n)/5000),total:state.total,tag:state.tag});
  };
  for(const track of stream.getAudioTracks())track.addEventListener('ended',()=>{if(capture===state)emit({type:'capture-ended',tag});});
  source.connect(node);node.connect(context.destination);await context.resume();return {fallback};
 },
 // A rolling capture becomes an ordinary one, keeping its latest keepMs (0: nothing) as its start.
 captureKeep(keepMs=0){const state=capture;if(!state)return false;const want=Math.round(keepMs*16);while(state.chunks.length&&state.total-state.chunks[0].length>=want)state.total-=state.chunks.shift().length;if(!want){state.chunks=[];state.total=0;}state.roll=0;return true;},
 // The latest ms of the capture under way, base64 PCM16, without stopping it (the wake word's check).
 captureSnapshot(ms){const state=capture;if(!state)return '';const want=Math.round(ms*16),parts=[];let have=0;for(let i=state.chunks.length-1;i>=0&&have<want;i--){parts.unshift(state.chunks[i]);have+=state.chunks[i].length;}
  const pcm=new Uint8Array(have*2);let offset=0;for(const chunk of parts){pcm.set(new Uint8Array(chunk.buffer,chunk.byteOffset,chunk.byteLength),offset);offset+=chunk.byteLength;}
  let text='';for(let i=0;i<pcm.length;i+=0x8000)text+=String.fromCharCode.apply(null,pcm.subarray(i,i+0x8000));return btoa(text);},
 captureStop(){
  const state=capture;capture=null;if(!state)return '';
  state.node.onaudioprocess=null;try{state.source.disconnect();state.node.disconnect();}catch{}
  for(const track of state.stream.getTracks())track.stop();state.context.close().catch(()=>{});
  const pcm=new Uint8Array(state.total*2);let offset=0;
  for(const chunk of state.chunks){pcm.set(new Uint8Array(chunk.buffer,chunk.byteOffset,chunk.byteLength),offset);offset+=chunk.byteLength;}
  let text='';for(let i=0;i<pcm.length;i+=0x8000)text+=String.fromCharCode.apply(null,pcm.subarray(i,i+0x8000));return btoa(text);
 },
 // Only its owner's capture (tag), or any.
 captureCancel(tag){const state=capture;if(!state||(tag&&state.tag!==tag))return true;capture=null;state.node.onaudioprocess=null;for(const track of state.stream.getTracks())track.stop();state.context.close().catch(()=>{});return true;},
 voices(){return new Promise(resolve=>{let done=false;const read=()=>{const list=speechSynthesis.getVoices();if(!list.length||done)return;done=true;resolve(list.map(v=>({id:v.voiceURI,name:v.name,language:v.lang,default:v.default})));};read();speechSynthesis.addEventListener('voiceschanged',read);setTimeout(()=>{if(!done){done=true;resolve(speechSynthesis.getVoices().map(v=>({id:v.voiceURI,name:v.name,language:v.lang,default:v.default})));}},3000);});},
 speak(token,text,voice,language){
  speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(text);
  const chosen=voice?speechSynthesis.getVoices().find(v=>v.voiceURI===voice):null;if(chosen)utterance.voice=chosen;if(language&&!chosen)utterance.lang=language;
  utterance.onstart=()=>emit({type:'speech',token,event:'start'});utterance.onend=()=>emit({type:'speech',token,event:'end'});utterance.onerror=()=>emit({type:'speech',token,event:'end'});
  speechSynthesis.speak(utterance);return true;
 },
 // A clip the Agent's own voice made (a data: URL); like an utterance it ends with a speech event, but a clip that
 // never started rejects instead, so the reply is read by a system voice.
 speakClip(token,url){
  speechSynthesis.cancel();if(clip){clip.pause();clip=null;}
  const audio=new Audio(url);let started=false;clip=audio;
  const end=()=>{if(clip!==audio)return;clip=null;if(started)emit({type:'speech',token,event:'end'});};
  audio.onended=end;audio.onerror=end;
  return audio.play().then(()=>{started=true;emit({type:'speech',token,event:'start'});return true;},error=>{if(clip===audio)clip=null;throw error;});
 },
 stopSpeaking(){speechSynthesis.cancel();if(clip){const audio=clip;clip=null;audio.pause();audio.removeAttribute('src');audio.load();}return true;},
 locate(){return new Promise(resolve=>navigator.geolocation.getCurrentPosition(p=>resolve({latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy,at:p.timestamp}),e=>resolve({error:e.code===1?'denied':e.code===3?'timeout':'unavailable'}),{enableHighAccuracy:false,timeout:18000,maximumAge:300000}));}
};
</script>`;

export class MediaSurface {
 private view:WebContentsView|null=null;
 private opening:Promise<WebContentsView>|null=null;
 private directory='';
 private closed=false;
 private listeners=new Set<(event:Row)=>void>();
 /** True while it may hold the microphone (`allowWake` for the wake word); only then does its session grant `media`. */
 allowCapture=false;
 allowWake=false;
 /** True while listing microphones, so device labels are readable; it never grants capture. */
 allowList=false;
 /** True during one location request; only then does its session grant `geolocation`. */
 allowLocation=false;
 onEvent(listener:(event:Row)=>void){this.listeners.add(listener);}
 private emit(event:Row){for(const listener of this.listeners)try{listener(event);}catch{}}
 private open(){
  if(this.closed)return Promise.reject(Error('The app is closing.'));
  if(this.opening)return this.opening;
  const opening=(async()=>{
   if(!this.directory)this.directory=fs.mkdtempSync(path.join(os.tmpdir(),'worldlet-media-'));
   const file=path.join(this.directory,'player.html');
   fs.writeFileSync(file,PAGE,{mode:0o600});
   const media=session.fromPartition('worldlet-media');
   const own=(contents:WebContents|null)=>!!contents&&contents===this.view?.webContents;
   media.setPermissionRequestHandler((contents,permission,answer,details)=>{
    if(permission==='geolocation'){answer(this.allowLocation&&own(contents));return;}
    const types=(details as {mediaTypes?:string[]}).mediaTypes??[];
    answer(permission==='media'&&(this.allowCapture||this.allowWake)&&own(contents)&&types.length>0&&types.every(type=>type==='audio'));
   });
   media.setPermissionCheckHandler((contents,permission,_origin,details)=>permission==='geolocation'?this.allowLocation&&own(contents):permission==='media'&&(this.allowCapture||this.allowWake||this.allowList)&&own(contents)&&(details as {mediaType?:string}).mediaType!=='video');
   const view=new WebContentsView({webPreferences:{session:media,sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,backgroundThrottling:false,autoplayPolicy:'no-user-gesture-required',spellcheck:false}});
   const contents=view.webContents;
   contents.setWindowOpenHandler(()=>({action:'deny'}));
   contents.on('will-navigate',event=>event.preventDefault());
   contents.on('render-process-gone',()=>{if(this.view===view){this.view=null;this.opening=null;this.emit({type:'gone'});}});
   this.view=view;
   await contents.loadFile(file);
   void this.pump(view);
   return view;
  })();
  this.opening=opening;
  opening.catch(()=>{if(this.opening===opening){this.opening=null;this.view=null;}});
  return opening;
 }
 private async pump(view:WebContentsView){
  while(!this.closed&&this.view===view&&!view.webContents.isDestroyed()){
   let events:Row[];
   try{events=await view.webContents.executeJavaScript('__media.next()',true);}catch{break;}
   for(const event of events??[])this.emit(event);
  }
 }
 async call<T=any>(method:string,...args:unknown[]):Promise<T> {
  const view=await this.open();
  return view.webContents.executeJavaScript(`__media.${method}(...${json(args)})`,true);
 }
 /** Only a call already made can still find the surface; nothing reopens it while idle. */
 callIfOpen(method:string,...args:unknown[]){if(this.view)void this.call(method,...args).catch(()=>{});}
 close(){
  this.closed=true;
  const view=this.view;this.view=null;this.opening=null;
  try{if(view&&!view.webContents.isDestroyed())view.webContents.close();}catch{}
  if(this.directory)fs.rmSync(this.directory,{recursive:true,force:true});
 }
}
