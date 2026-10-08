import {speechLanguage} from './speech-language.ts';
import {openMicrophone} from './microphone.ts';
export function pcmWav(chunks){
 const size=chunks.reduce((n,c)=>n+c.byteLength,0),header=new ArrayBuffer(44),v=new DataView(header);
 const text=(offset,value)=>[...value].forEach((c,i)=>v.setUint8(offset+i,c.charCodeAt(0)));
 text(0,'RIFF');v.setUint32(4,36+size,true);text(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,16000,true);v.setUint32(28,32000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);text(36,'data');v.setUint32(40,size,true);return new Blob([header,...chunks],{type:'audio/wav'});
}
export function createStreamingSpeech({openText,transcribe}){
 let current=null;
 const emit=(phase,text='')=>window.dispatchEvent(new CustomEvent('worldlet:speech',{detail:{phase,text}}));
 function closeMic(s){s.stream?.getTracks().forEach(t=>t.stop());s.source?.disconnect();s.node?.disconnect();s.context?.close().catch(()=>{});}
 function cancel(){const s=current;if(!s)return;current=null;s.done=true;clearTimeout(s.timer);clearTimeout(s.finishTimer);clearInterval(s.previewTimer);s.previewUpload?.abort();closeMic(s);s.socket?.close();s.upload?.abort();s.flush?.();}
 function complete(s,text){if(current!==s||s.done)return;s.done=true;clearTimeout(s.timer);clearTimeout(s.finishTimer);s.socket?.close();current=null;emit(text?'final':'error',text||'I did not catch any words. Hold Fox and try again.');}
 async function fallback(s){if(current!==s||s.done||s.upload)return;clearTimeout(s.finishTimer);s.socket?.close();s.upload=new AbortController();
  try{complete(s,await transcribe(pcmWav(s.chunks),s.upload.signal));}catch(e){if(current===s&&!s.done){cancel();emit('error',e.message||'Voice transcription failed.');}}
 }
 function receive(s,event){if(current!==s||s.done)return;let value;try{value=JSON.parse(event.data);}catch{return;}
  const text=value.channel?.alternatives?.[0]?.transcript||'';
  if(value.type==='Results'){
   if(value.is_final){if(text)s.segments.set(value.start??s.segments.size,text);s.draft='';}else s.draft=text;
   s.text=[...s.segments.values(),s.draft].filter(Boolean).join(' ').trim();if(s.text)emit('partial',s.text);
  }
  if(value.type==='Metadata'&&s.stopping){const final=[...s.segments.values()].join(' ').trim();if(final)complete(s,final);else fallback(s);}
  if(value.type==='Error'){s.failed=true;if(s.stopping)fallback(s);}
 }
 async function start(){cancel();const s: any={chunks:[],pending:[],segments:new Map(),text:'',draft:'',done:false,stopping:false,failed:false};current=s;
  try{
   s.stream=await openMicrophone({echoCancellation:true,noiseSuppression:true,autoGainControl:true});
   if(current!==s){closeMic(s);throw Error('Voice input canceled.');}
   s.context=new AudioContext();await s.context.audioWorklet.addModule('/pcm-worklet.js');await s.context.resume();
   if(current!==s){closeMic(s);throw Error('Voice input canceled.');}
   const url=new URL('/api/speech/stream',location.href);url.searchParams.set('language',speechLanguage());url.protocol=url.protocol==='https:'?'wss:':'ws:';
   s.socket=new WebSocket(url);s.socket.onopen=()=>{if(current!==s){s.socket.close();return;}for(const chunk of s.pending)s.socket.send(chunk);s.pending=[];if(s.stopping)s.socket.send(JSON.stringify({type:'CloseStream'}));};
   s.socket.onmessage=e=>receive(s,e);s.socket.onerror=()=>{s.failed=true;if(s.stopping)fallback(s);};
   s.socket.onclose=()=>{s.failed=true;if(s.stopping&&!s.done){fallback(s);}};
   s.source=s.context.createMediaStreamSource(s.stream);s.node=new AudioWorkletNode(s.context,'fox-pcm');
   s.node.port.onmessage=e=>{if(e.data==='flushed'){s.flush?.();return;}if(current!==s||s.done)return;const chunk=e.data;s.chunks.push(chunk);if(!s.failed){if(s.socket.readyState===WebSocket.OPEN&&s.socket.bufferedAmount<256000)s.socket.send(chunk);else if(s.socket.readyState===WebSocket.CONNECTING)s.pending.push(chunk);else s.failed=true;}};
   s.source.connect(s.node);s.node.connect(s.context.destination);s.timer=setTimeout(stop,45000);
   s.previewTimer=setInterval(async()=>{if(current!==s||s.done||s.stopping||!s.failed||s.previewUpload||!s.chunks.length)return;const upload=new AbortController();s.previewUpload=upload;try{const text=await transcribe(pcmWav(s.chunks),upload.signal,true);if(current===s&&!s.stopping&&!upload.signal.aborted)emit('partial',text);}catch{}finally{if(s.previewUpload===upload)s.previewUpload=null;}},3200);
  }catch(e){if(current!==s)throw Error('Voice input canceled.');cancel();openText();throw Error(e.name==='NotAllowedError'?'Microphone access was denied. Allow it in browser settings, or tap Fox to type.':e.message||'The microphone could not start.');}
 }
 async function stop(){const s=current;if(!s||s.stopping||s.finishing)return;if(!s.node){cancel();return;}s.finishing=true;clearTimeout(s.timer);clearInterval(s.previewTimer);s.previewUpload?.abort();emit('processing');
  if(s.node)await new Promise<void>(resolve=>{const timer=setTimeout(resolve,150);s.flush=()=>{clearTimeout(timer);resolve();};s.node.port.postMessage('flush');});
  if(current!==s)return;closeMic(s);s.stopping=true;
  if(s.failed||s.socket?.readyState!==WebSocket.OPEN){fallback(s);return;}
  s.graceful=true;s.socket.send(JSON.stringify({type:'CloseStream'}));s.finishTimer=setTimeout(()=>fallback(s),5000);
 }
 window.addEventListener('pagehide',cancel);document.addEventListener('visibilitychange',()=>{if(document.hidden&&current){cancel();emit('error','Voice input canceled. Hold Fox to start again.');}});
 return {call(action){if(action==='speechStart')return start();if(action==='speechStop')return stop();cancel();return Promise.resolve();}};
}
