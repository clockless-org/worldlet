import assert from 'node:assert/strict';
import {createBrowserSpeech} from '../ui/companion/browser-speech.ts';
const events:any[]=[],recorders:any[]=[],permissions:any[]=[],uploads:any[]=[];
let stopped=0,opened=0;
Object.defineProperty(globalThis,'window',{value:new EventTarget(),configurable:true});
Object.defineProperty(globalThis,'document',{value:new EventTarget(),configurable:true});
Object.defineProperty(globalThis,'navigator',{value:{mediaDevices:{getUserMedia:()=>new Promise((resolve,reject)=>permissions.push({resolve,reject}))}},configurable:true});
Object.assign(globalThis,{isSecureContext:true,AudioWorkletNode:undefined});
class Recorder {
 static isTypeSupported(){return true;}
 state='inactive';mimeType='audio/webm';calls=0;onstart:any;onstop:any;onerror:any;ondataavailable:any;
 constructor(..._args:any[]){recorders.push(this);}
 start(){this.state='recording';}stop(){this.calls++;this.state='inactive';}
}
Object.assign(globalThis,{MediaRecorder:Recorder});
window.addEventListener('worldlet:speech',(e:any)=>events.push(e.detail));
const speech=createBrowserSpeech({openText(){opened++;},transcribe(_blob:any,signal:any){return new Promise((resolve,reject)=>uploads.push({resolve,reject,signal}));}});
const stream=()=>({getTracks:()=>[{stop(){stopped++;}}]});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function begin(){const p=speech.call('speechStart');permissions.at(-1).resolve(stream());await tick();recorders.at(-1).onstart();await p;return recorders.at(-1);}
function flush(r:any){r.ondataavailable({data:new Blob(['x'.repeat(256)])});r.onstop();}
// A release before permission resolves must prevent delayed recording.
let p=speech.call('speechStart');await speech.call('speechStop');permissions.at(-1).resolve(stream());await assert.rejects(p,/canceled/);
assert.equal(recorders.length,0);assert.equal(stopped,1);
// Late permission denial after cancellation cannot reopen text input.
p=speech.call('speechStart');await speech.call('speechCancel');permissions.at(-1).reject({name:'NotAllowedError'});await assert.rejects(p,/canceled/);assert.equal(opened,0);
// Two stop events produce one recording upload and one final result.
let r=await begin();const first=speech.call('speechStop'),second=speech.call('speechStop');assert.equal(r.calls,1);flush(r);await tick();assert.equal(uploads.length,1);uploads[0].resolve('first');await Promise.all([first,second]);assert.deepEqual(events.filter(e=>e.phase==='final').map(e=>e.text),['first']);
// Error during stop settles its promise and releases the microphone.
r=await begin();const failed=speech.call('speechStop');r.onerror();await failed;assert.equal(uploads.length,1);assert.match(events.at(-1).text,/unexpectedly/);
// Cancellation before recorder start also settles start; late onstart is detached.
p=speech.call('speechStart');permissions.at(-1).resolve(stream());await tick();const pendingRecorder=recorders.at(-1);await speech.call('speechStop');await assert.rejects(p,/canceled/);assert.equal(pendingRecorder.onstart,null);
// A prior upload resolving late must not clear the new upload or submit its text.
r=await begin();const oldStop=speech.call('speechStop');flush(r);await tick();const old=uploads.at(-1);
r=await begin();assert.equal(old.signal.aborted,true);const newStop=speech.call('speechStop');flush(r);await tick();const latest=uploads.at(-1);
old.resolve('stale');await oldStop;await speech.call('speechCancel');assert.equal(latest.signal.aborted,true);latest.resolve('also canceled');await newStop;
assert.deepEqual(events.filter(e=>e.phase==='final').map(e=>e.text),['first']);assert.equal(stopped,6);
console.log('PASS recorded speech: pending permission/start cancellation, duplicate stop, stop error, and overlapping transcription isolation; no audio or network used');
