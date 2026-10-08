// Live meeting transcripts (owner request 2026-10-04): the call's audio is cut into windows for local
// Whisper, only text is kept in the World, the page hooks hear both sides of a real WebRTC call in
// Chromium, it starts with the call in Meetings (owner request 2026-10-06), and Fox can never start it.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {MEETING_TRANSCRIPT,TranscriptWindows,pcmLevel,transcriptText} from '../core/applets/meeting-transcript.ts';
import {webTranscript,type WebRecord} from '../core/browser/index.ts';
import {MeetingTranscriber} from '../platform/electron/src/modules/browser/meeting-transcript.ts';
import {WebRecorder,readRecordings} from '../platform/electron/src/modules/browser/recorder.ts';
import {WorldLedger} from '../platform/electron/src/store/ledger.ts';
import {installMeetingAudio} from '../platform/bridge/meeting-audio.js';
import {fakeMedia,launchTestBrowser} from './browser-test.ts';

const RATE=MEETING_TRANSCRIPT.rate;
const tone=(seconds:number,level=.2)=>Int16Array.from({length:Math.round(seconds*RATE)},(_,i)=>Math.round(Math.sin(i/8)*level*32767));
const silence=(seconds:number)=>new Int16Array(Math.round(seconds*RATE));

// Windows ------------------------------------------------------------------------------------------
{
 assert.equal(pcmLevel(silence(1)),0);assert.ok(pcmLevel(tone(1))>.1);
 const w=new TranscriptWindows('you');let at=100;
 for(let i=0;i<10;i++)assert.ok(w.push(silence(1),++at)===null,'silence alone is never a window');
 for(let i=0;i<4;i++)assert.ok(w.push(tone(1),++at)===null,'speech under the minimum keeps going');
 assert.ok(w.push(silence(1),++at)===null,'a pause before six seconds does not cut');
 const cut=w.push(silence(1),++at);
 assert.ok(cut&&cut.side==='you'&&cut.pcm.length===6*RATE&&cut.start===110&&cut.end===at,'a pause after six seconds ends the window: '+JSON.stringify(cut&&{start:cut.start,end:cut.end,length:cut.pcm.length}));
 const long=new TranscriptWindows('others');let window=null,count=0;
 while(!window&&count<40){window=long.push(tone(1),++count);}
 assert.equal(count,MEETING_TRANSCRIPT.maxSeconds,'nonstop speech is cut at the maximum');
 assert.ok(long.push(tone(.5),50)===null&&long.flush(51)?.pcm.length===RATE/2,'flush returns what is waiting');
 assert.equal(new TranscriptWindows('you').flush(1),null);
 for(const noise of ['','  ','...','(Music)','[BLANK_AUDIO]','Thanks for watching!','字幕由Amara.org社区提供'])assert.equal(transcriptText(noise),'',noise);
 assert.equal(transcriptText('  Let us ship   it on Friday. '),'Let us ship it on Friday.');
 console.log('PASS windows end at a pause after 6 s or at 25 s; silence and Whisper inventions are dropped');
}

// Transcriber and storage -------------------------------------------------------------------------
{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'worldlet-meeting-'));
 const ledger=new WorldLedger(folder);
 let clock=1_800_000_000;
 const page={url:'https://meet.google.com/abc-defg-hij',title:'Meet - abc-defg-hij',cdp:async()=>({})};
 const recorder=new WebRecorder(page,(visits,rows)=>ledger.recordWeb(visits,rows),{applet:'meetings',now:()=>clock});
 const heard:number[]=[],states:any[]=[];let active=0,most=0;
 const session='5b0f7d1e-4f0e-4c55-9a8e-2f1d3c4b5a69';
 const transcriber=new MeetingTranscriber({
  now:()=>clock,
  transcribe:async pcm=>{active++;most=Math.max(most,active);heard.push(pcm.length/2);await new Promise(r=>setTimeout(r,20));active--;return heard.length===2?'(Music)':heard.length===1?'Shall we look at the board first?':'Yes, Mao has the numbers.';},
  save:line=>recorder.note('transcript',line.speaker+': '+line.text,{speaker:line.speaker,meeting:'Design sync',session,start:line.start,end:line.end}),
  emit:state=>states.push(state)
 });
 const send=(side:string,pcm:Int16Array)=>{clock++;transcriber.audio({side,rate:RATE,pcm:Buffer.from(pcm.buffer).toString('base64')});};
 for(let i=0;i<7;i++)send('you',tone(1));send('you',silence(1));
 for(let i=0;i<7;i++)send('others',tone(1));send('others',silence(1));
 for(let i=0;i<3;i++)send('others',tone(1));
 transcriber.audio({side:'nobody',rate:RATE,pcm:'AAAA'});transcriber.audio({side:'you',rate:48000,pcm:'AAAA'});
 transcriber.stop();
 send('you',tone(1));
 await new Promise(r=>setTimeout(r,300));
 assert.equal(most,1,'one window at a time');
 assert.deepEqual(heard,[8*RATE,8*RATE,3*RATE],'both sides and the last words after Stop are transcribed; audio after Stop is not');
 assert.equal(states.at(-1).active,false);assert.equal(states.at(-1).lines,2);assert.equal(states.at(-1).waiting,0);
 assert.equal(states.at(-1).last,'Others: Yes, Mao has the numbers.');
 recorder.flush();
 const list=ledger.meetingTranscripts();
 assert.equal(list.length,1);assert.equal(list[0].session,session);assert.equal(list[0].meeting,'Design sync');assert.equal(list[0].lines,2);assert.equal(list[0].site,'meet.google.com');
 const lines=ledger.meetingTranscript(session);
 assert.deepEqual(lines.map(l=>[l.speaker,l.text]),[['You','You: Shall we look at the board first?'],['Others','Others: Yes, Mao has the numbers.']]);
 // Fox reads it as part of the call's visit, narrowed to the transcript.
 const visit=ledger.webVisits({terms:['Mao has the numbers'],before:clock+10}).visits[0];
 assert.ok(visit,'the transcript is searchable');
 const read=readRecordings('record',{id:visit.id,only:'transcript'},{ledger,onScreen:'',now:clock,offsetMinutes:0});
 assert.match(String(read.text),/You said in “Design sync”: Shall we look at the board first\?/);
 assert.match(String(read.text),/Others said in “Design sync”: Yes, Mao has the numbers\./);
 const rows=ledger.webRecords(visit.id).records as WebRecord[];
 assert.ok(webTranscript(visit,rows).text.includes('Others said'));
 // A discarded transcript stops at once.
 let calls=0;const gone=new MeetingTranscriber({transcribe:async()=>{calls++;return 'x';},save:()=>{},emit:()=>{}});
 for(let i=0;i<8;i++)gone.audio({side:'you',rate:RATE,pcm:Buffer.from(tone(1).buffer).toString('base64')});
 gone.cancel();await new Promise(r=>setTimeout(r,50));
 assert.ok(calls<=1,'a closed page transcribes nothing more');
 ledger.close?.();fs.rmSync(folder,{recursive:true,force:true});
 console.log('PASS both sides transcribed one window at a time, kept as text in the call\'s visit, listed and read back for Fox');
}

// Page hooks in a real Chromium call --------------------------------------------------------------
{
 const browser=await launchTestBrowser({args:[...fakeMedia,'--autoplay-policy=no-user-gesture-required']});
 try{
  const html=`<!doctype html><title>Meet</title><audio id="remote" autoplay></audio><script>
   window.call=async()=>{
    const mic=await Promise.race([navigator.mediaDevices.getUserMedia({audio:true}),new Promise((_,no)=>setTimeout(()=>no(Error('the fake microphone did not open in 20 s: Chromium reached a real audio device')),20000))]);
    const a=new RTCPeerConnection(),b=new RTCPeerConnection();
    a.onicecandidate=e=>e.candidate&&b.addIceCandidate(e.candidate);b.onicecandidate=e=>e.candidate&&a.addIceCandidate(e.candidate);
    b.ontrack=e=>{document.getElementById('remote').srcObject=new MediaStream([e.track]);};
    const ctx=new AudioContext(),osc=ctx.createOscillator(),dest=ctx.createMediaStreamDestination();osc.connect(dest);osc.start();
    a.addTrack(dest.stream.getAudioTracks()[0],dest.stream);
    await a.setLocalDescription();await b.setRemoteDescription(a.localDescription);await b.setLocalDescription();await a.setRemoteDescription(b.localDescription);
    // A call that plays its own decoded audio through Web Audio (Zoom's web client).
    const played=new AudioContext(),beep=played.createOscillator();beep.connect(played.destination);beep.start();
    return mic.getAudioTracks().length;
   };</script>`;
  const run=async(url:string)=>{
   const context=await browser.newContext({permissions:['microphone']});
   const page=await context.newPage();
   await page.route('https://*/**',route=>route.fulfill({contentType:'text/html',body:html}));
   const received:any[]=[];
   await page.exposeBinding('worldletMeetingTest',(_source,payload)=>{received.push(JSON.parse(payload));});
   await page.addInitScript(`(${installMeetingAudio.toString()})('worldletMeetingTest')`);
   await page.goto(url);
   return {page,received,context};
  };
  {
   const {page,received,context}=await run('https://meet.google.com/abc-defg-hij');
   assert.equal(await page.evaluate(()=>typeof (window as any).worldletMeetingTest),'undefined','the page never sees the binding');
   assert.equal(await page.evaluate(()=>(window as any).call()),1);
   await page.waitForTimeout(1500);
   assert.equal(received.length,0,'nothing is captured before the person starts it');
   const status=await page.evaluate(()=>(window as any).__worldletMeetingAudio.status());
   assert.ok(status.others>=1&&status.you===1,'the hooks found the call\'s tracks: '+JSON.stringify(status));
   assert.equal(await page.evaluate(()=>(window as any).__worldletMeetingAudio.start()),true);
   await page.waitForFunction(()=>true,null,{timeout:100});
   const deadline=Date.now()+8000;
   const level=(side:string)=>Math.max(0,...received.filter(r=>r.side===side).map(r=>pcmLevel(new Int16Array(Uint8Array.from(Buffer.from(r.pcm,'base64')).buffer))));
   while(Date.now()<deadline&&!(level('you')>.001&&level('others')>.001))await page.waitForTimeout(250);
   assert.ok(received.every(r=>r.rate===16000),'16 kHz chunks');
   assert.ok(level('others')>.001,'other participants are heard: '+level('others'));
   assert.ok(level('you')>.001,'the person\'s microphone is heard: '+level('you'));
   assert.equal(await page.evaluate(()=>(window as any).__worldletMeetingAudio.stop()),true);
   const after=received.length;await page.waitForTimeout(1500);
   assert.ok(received.length<=after+1,'nothing more after Stop');
   await context.close();
  }
  {
   const {page,received,context}=await run('https://example.com/');
   assert.equal(await page.evaluate(()=>typeof (window as any).__worldletMeetingAudio),'undefined','other sites get no hooks');
   assert.equal(received.length,0);
   await context.close();
  }
  console.log('PASS meeting pages hear both sides of a real WebRTC call and Web Audio, only after Start, at 16 kHz; other sites get nothing');
 }finally{await browser.close();}
}

// Wiring -------------------------------------------------------------------------------------------
{
 const read=(file:string)=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
 const device=read('platform/electron/src/modules/browser/device.ts');
 assert.match(device,/if\(agent\)throw new WorldletError\('Only the person can transcribe a meeting/,'Fox can never start a transcript');
 assert.match(device,/private close\(\)\{\n  this\.endTranscript\(\);/,'closing the call ends its transcript');
 assert.match(device,/private park\(live\?:string\[\]\)\{\n  this\.endTranscript\(\);/,'leaving the call ends its transcript');
 const page=read('platform/electron/src/modules/browser/engine/page.ts');
 // Every website page (a meeting page among them) starts blank and is loaded through load().
 assert.match(page,/const deferred=!!parsed&&publicPage\(parsed\);\n  const start='about:blank';/,'a meeting page starts blank');
 assert.match(page,/if\(deferred\)this\.load\(parsed!\.href\);/,'its first load goes through load()');
 assert.match(page,/try\{await this\.installMeetingAudio\(\);this\.meetingReady=true;\}/,'and loads after its hooks are installed');
 const world=read('ui/shell/notion-world.ts');
 assert.match(world,/'meeting:transcript:start',label:'Transcribe'/);
 // A call page that can be heard starts its transcript; Stop (or a failed start) keeps it off for that call.
 assert.match(device,/else if\(!this\.transcript&&view instanceof CefPageView&&view\.meetingAudioReady&&meetingPage\(view\.url\)&&this\.browser===view&&!view\.hidden\)this\.emit\(\{phase:'meeting-ready'\}\);/,'the host says when a call page can be heard');
 assert.match(world,/if\(value\?\.phase==='meeting-ready'\)\{if\(!data\.sample&&!transcriptDeclined&&!transcriptState\?\.active&&meetingCallOpen\(\)\)void setTranscribing\(true\);return;\}/,'the World starts it, never in the practice world or after Stop');
 assert.match(world,/async function setTranscribing\(on\)\{[^]*?if\(!on\)transcriptDeclined=true;[^]*?if\(error\)\{transcriptDeclined=true;/,'Stop and a failed start keep it off');
 assert.match(world,/openedMeeting=meeting;transcriptDeclined=false;/,'each call opened starts fresh');
 const bar=read('ui/applets/meetings/transcript.ts');
 assert.match(bar,/Let everyone in the call know/,'the bar reminds the person to tell the others');
 assert.match(bar,/node\('button','meeting-transcribing-stop','Stop'\)/,'the bar always has Stop');
 console.log('PASS a call starts its transcript and Stop keeps it off; Fox never starts one; it ends with the call; the bar shows Stop and the reminder');
}
