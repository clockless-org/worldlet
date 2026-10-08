import {createStreamingSpeech} from './streaming-speech.ts';
import {openMicrophone} from './microphone.ts';
// The browser captures a short recording locally. The same-origin Worker sends
// it to Cloudflare Workers AI for transcription; no provider credential enters
// the page and no partial transcript is displayed.
export function createBrowserSpeech(options){
 if(typeof AudioWorkletNode!=='undefined'&&typeof AudioContext!=='undefined')return createStreamingSpeech(options);
 return createRecordedSpeech(options);
}
function createRecordedSpeech({openText,transcribe}){
 let current=null;
 const emit=(phase,text='')=>window.dispatchEvent(new CustomEvent('worldlet:speech',{detail:{phase,text}}));
 const stopTracks=value=>value?.getTracks().forEach(track=>track.stop());
 function release(s){
  clearTimeout(s.timer);stopTracks(s.stream);s.stream=null;
  const r=s.recorder;s.recorder=null;
  if(r){r.onstart=r.ondataavailable=r.onstop=r.onerror=null;if(r.state!=='inactive')try{r.stop();}catch{}}
  s.chunks=[];
 }
 function cancel(){
  const s=current;if(!s)return;current=null;
  s.upload?.abort();release(s);s.stopResolve?.(null);s.startReject?.(Error('Voice input canceled.'));
 }
 function mimeType(){
  const types=['audio/webm;codecs=opus','audio/mp4;codecs=mp4a.40.2','audio/mp4','audio/webm','audio/ogg;codecs=opus'];
  return types.find(type=>MediaRecorder.isTypeSupported?.(type))||'';
 }
 async function start(){
  cancel();
  if(!isSecureContext||!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){
   openText();throw Error('Voice recording is unavailable here. Tap Fox to type instead.');
  }
  const s={stream:null,recorder:null,chunks:[],timer:null,upload:null,startReject:null,stopResolve:null,started:false,finishing:false};current=s;
  let stream;
  try{stream=await openMicrophone({echoCancellation:true,noiseSuppression:true,autoGainControl:true});}
  catch(error){
   if(current!==s)throw Error('Voice input canceled.');
   current=null;openText();const denied=error?.name==='NotAllowedError'||error?.name==='SecurityError';
   throw Error(denied?'Microphone access was denied. Allow it in browser settings, or tap Fox to type.':'No microphone is available. Tap Fox to type instead.');
  }
  if(current!==s){stopTracks(stream);throw Error('Voice input canceled.');}
  s.stream=stream;
  return new Promise<void>((resolve,reject)=>{
   s.startReject=reject;
   try{
    const type=mimeType(),r=new MediaRecorder(stream,type?{mimeType:type}:undefined);s.recorder=r;
    r.ondataavailable=event=>{if(current===s&&event.data?.size)s.chunks.push(event.data);};
    r.onstart=()=>{if(current!==s)return;s.started=true;s.startReject=null;s.timer=setTimeout(()=>stop(),45000);resolve();};
    r.onerror=()=>{
     if(current!==s)return;current=null;release(s);s.stopResolve?.(null);
     if(s.started)emit('error','Recording stopped unexpectedly. Hold Fox and try again.');
     else reject(Error('The microphone could not start. Tap Fox to type instead.'));
    };
    r.start(250);
   }catch{if(current===s)current=null;release(s);openText();reject(Error('This browser cannot record voice. Tap Fox to type instead.'));}
  });
 }
 async function stop(){
  const s=current;if(!s||s.finishing)return;
  // Release during permission/startup invalidates the attempt, including late grants.
  if(!s.started){cancel();return;}
  s.finishing=true;clearTimeout(s.timer);emit('processing');
  const r=s.recorder;
  const blob=await new Promise<Blob>(resolve=>{
   s.stopResolve=resolve;
   r.onstop=()=>resolve(new Blob(s.chunks,{type:r.mimeType||s.chunks[0]?.type||'application/octet-stream'}));
   if(r.state==='inactive')r.onstop();else try{r.stop();}catch{r.onstop();}
  });
  if(current!==s||!blob)return;
  release(s);s.stopResolve=null;
  if(blob.size<128){current=null;emit('error','I did not hear enough audio. Hold Fox and try again.');return;}
  s.upload=new AbortController();
  try{
   const text=await transcribe(blob,s.upload.signal);
   if(current===s)emit('final',text);
  }catch(error){if(current===s&&error?.name!=='AbortError')emit('error',error?.message||'Voice transcription failed. Please try again.');}
  finally{if(current===s)current=null;}
 }
 window.addEventListener('pagehide',cancel);
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&current){cancel();emit('error','Voice input canceled. Hold Fox to start again.');}});
 return {call(action){if(action==='speechStart')return start();if(action==='speechStop')return stop();cancel();return Promise.resolve();}};
}
