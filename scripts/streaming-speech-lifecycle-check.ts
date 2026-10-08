import assert from 'node:assert/strict';
import {createStreamingSpeech} from '../ui/companion/streaming-speech.ts';
const events:any[]=[],nodes:any[]=[],sockets:any[]=[];
let resolvePermission:any,tracksStopped=0,uploads=0,contextClosed=0;
Object.defineProperty(globalThis,'window',{value:new EventTarget(),configurable:true});
Object.defineProperty(globalThis,'document',{value:new EventTarget(),configurable:true});
Object.defineProperty(globalThis,'location',{value:{href:'https://fixture.invalid/'},configurable:true});
Object.defineProperty(globalThis,'navigator',{value:{languages:['en'],mediaDevices:{getUserMedia:()=>new Promise(resolve=>{resolvePermission=resolve;})}},configurable:true});
const stream=()=>({getTracks:()=>[{stop(){tracksStopped++;}}]});
class Context {
 audioWorklet={addModule:async()=>{}};destination={};
 async resume(){} async close(){contextClosed++;}
 createMediaStreamSource(){return {connect(){},disconnect(){}};}
}
class Node {
 port={onmessage:null as any,postMessage:(_message:string)=>{}};
 constructor(){nodes.push(this);}connect(){}disconnect(){}
}
class Socket {
 static OPEN=1;static CONNECTING=0;readyState=1;bufferedAmount=0;
 onopen:any;onmessage:any;onclose:any;onerror:any;sent:any[]=[];
 constructor(){sockets.push(this);}send(value:any){this.sent.push(value);}close(){this.readyState=3;}
}
Object.assign(globalThis,{AudioContext:Context,AudioWorkletNode:Node,WebSocket:Socket});
window.addEventListener('worldlet:speech',(e:any)=>events.push(e.detail));
const speech=createStreamingSpeech({openText(){},async transcribe(){uploads++;return 'fixture';}});
// Release while the permission prompt is pending: late permission must not start capture.
const pending=speech.call('speechStart');await speech.call('speechStop');resolvePermission(stream());
await assert.rejects(pending,/canceled/);assert.equal(sockets.length,0);assert.equal(tracksStopped,1);assert.equal(uploads,0);
// Duplicate release events during the worklet flush must close only once.
const started=speech.call('speechStart');resolvePermission(stream());await started;
const node=nodes.at(-1),socket=sockets.at(-1);
const first=speech.call('speechStop'),second=speech.call('speechStop');
node.port.onmessage({data:'flushed'});await Promise.all([first,second]);
assert.equal(events.filter(e=>e.phase==='processing').length,1);
assert.equal(socket.sent.filter(v=>v==='{"type":"CloseStream"}').length,1);
socket.onmessage({data:JSON.stringify({type:'Results',is_final:true,start:0,channel:{alternatives:[{transcript:'Hello Fox'}]}})});
socket.onmessage({data:JSON.stringify({type:'Metadata'})});
assert.equal(events.filter(e=>e.phase==='final').length,1);assert.equal(contextClosed,1);assert.equal(uploads,0);
// Cancel capture before final transcription: no late reply can submit text.
const next=speech.call('speechStart');resolvePermission(stream());await next;
const stale=sockets.at(-1);await speech.call('speechCancel');
stale.onmessage({data:JSON.stringify({type:'Results',is_final:true,channel:{alternatives:[{transcript:'Must be discarded'}]}})});
stale.onmessage({data:JSON.stringify({type:'Metadata'})});
assert.equal(events.filter(e=>e.phase==='final').length,1);
console.log('PASS pending-permission release, duplicate stop, single final result and late canceled result isolation; no audio or network used');
