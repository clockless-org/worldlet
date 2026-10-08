// Talk with Fox (owner parity plan item 7): when an utterance ends (core/companion/fox-talk.ts), and the rhythm on the
// computer (ui/companion/fox-talk.ts): listen, send, read the reply, listen again; a press or the person's voice over
// Fox's echo interrupts it (barge-in), "be quiet" keeps Talk without the voice; and the wake word's gate and match.
// Fakes only: no microphone, voice or model. The phones' pause, quiet and barge-in rules are in WorldletKit's
// TalkRulesTests and the Android kit's TalkRulesTest.
import assert from 'node:assert/strict';
import {TALK,WAKE,talkBargeIn,talkEndpoint,talkQuietRequest,talkSpeakingLimit,talkSpokenText,wakeGate,wakeMatch,wakeState} from '../core/companion/index.ts';
import {createFoxTalk} from '../ui/companion/fox-talk.ts';

// Endpointing from the capture's levels, one every 60 ms as the host sends them.
const feed=(levels:number[],start=0)=>{const e=talkEndpoint(start);let t=start,last:string='listening';for(const level of levels){t+=60;last=e.feed(level,t);if(last!=='listening')break;}return {last,t};};
assert.equal(feed(Array(40).fill(0.01)).last,'listening','silence alone never ends an utterance');
assert.equal(feed([...Array(3).fill(0.3),...Array(30).fill(0.01)]).last,'listening','a click shorter than speechMs is not speech');
const spoken=feed([...Array(10).fill(0.3),...Array(30).fill(0.01)]);
assert.equal(spoken.last,'ended','speech then a pause ends the utterance');
assert.ok(spoken.t-600>=TALK.pauseMs&&spoken.t-600<TALK.pauseMs+120,'it ends about pauseMs after the last voiced level');
assert.equal(feed([...Array(10).fill(0.3),...Array(10).fill(0.01),...Array(10).fill(0.3),...Array(10).fill(0.01)]).last,'listening','a short breath mid-sentence keeps listening');
assert.equal(feed(Array(Math.ceil(TALK.idleMs/60)+1).fill(0.01)).last,'idle','a long silence starts the capture over');
assert.ok(TALK.idleMs<45_000,'idle comes before the recorder’s own 45-second limit');

// Barge-in levels while Fox speaks, every 60 ms: Fox's echo is learned, the person must be clearly louder.
const barge=(levels:number[])=>{const b=talkBargeIn(0);let t=0;for(const level of levels){t+=60;if(b.feed(level,t))return t;}return 0;};
assert.equal(barge(Array(80).fill(0.01)),0,'silence (headphones) never interrupts');
assert.ok(barge([...Array(10).fill(0.01),...Array(10).fill(0.3)]),'with headphones the person’s voice interrupts');
assert.equal(barge([...Array(10).fill(0.01),...Array(3).fill(0.3),...Array(20).fill(0.01)]),0,'a click is not a voice');
const echo=[0.15,0.25,0.2,0.1,0.22,0.18];
assert.equal(barge(Array(80).fill(0).map((_,i)=>echo[i%echo.length])),0,'Fox’s own echo over speakers never interrupts');
assert.ok(barge([...Array(20).fill(0).map((_,i)=>echo[i%echo.length]),...Array(10).fill(0.6)]),'the person speaking up over the echo interrupts');
assert.equal(barge([...Array(20).fill(0).map((_,i)=>echo[i%echo.length]),...Array(10).fill(0.3)]),0,'a voice no louder than the echo does not');
assert.equal(barge(Array(Math.floor(TALK.bargeSettleMs/60)).fill(0.6)),0,'the reply’s first moment only learns the echo');
{const e=talkEndpoint(0);e.reset(0,TALK.bargeMs);let last='';for(let t=60;t<=TALK.pauseMs+60;t+=60)last=e.feed(0.01,t);assert.equal(last,'ended','a barge-in’s speech already counts toward the utterance');}

// The wake word: short standalone phrases go to Whisper, and what it heard starts with the wake phrase.
const gate=(levels:number[],start=0)=>{const g=wakeGate(start);let t=start;const found:number[]=[];for(const level of levels){t+=60;const ms=g.feed(level,t);if(ms)found.push(ms);}return found;};
const quiet=(ms:number)=>Array(Math.ceil(ms/60)).fill(0.01),voice=(ms:number)=>Array(Math.ceil(ms/60)).fill(0.3);
assert.equal(gate([...quiet(1000),...voice(700),...quiet(800)]).length,1,'"Hey Fox" on its own is checked');
assert.ok(gate([...quiet(1000),...voice(700),...quiet(800)])[0]<=4000,'its audio fits the rolling capture');
assert.equal(gate([...quiet(1000),...voice(200),...quiet(800)]).length,0,'a click is not checked');
assert.equal(gate([...quiet(1000),...voice(4000),...quiet(800)]).length,0,'long talk (a call, a video) is never checked');
assert.equal(gate([...quiet(1000),...voice(700),...quiet(800),...voice(700),...quiet(800)]).length,1,'at most one check per gapMs');
assert.equal(gate([...quiet(1000),...voice(700),...quiet(800),...quiet(WAKE.gapMs),...voice(700),...quiet(800)]).length,2);
assert.equal(gate(Array(400).fill(0.01)).length,0,'silence costs nothing');
for(const [text,rest] of [['Hey Fox.',''],['hey, fox!',''],['Hey Fox, what is on today?','what is on today?'],['OK Fox','' ],['嘿 Fox',''],['嘿，小狐狸。',''],['小狐，明天几点开会？','明天几点开会？'],['嗨狐狸',''],['Hey Momo, hi','hi']] as const)
 assert.deepEqual(wakeMatch(text,'Momo'),{rest},text);
for(const text of ['hey folks','Hey foxes are cute','the fox jumped','fox','','hey','Hey Momo'])assert.equal(wakeMatch(text),null,text);
assert.deepEqual(wakeMatch('嘿 小白','小白'),{rest:''},'a renamed Fox answers to its name');
// When the wake listener listens: only when on, permitted and nothing else has the person's voice (a Meetings call too).
const ready={enabled:true,supported:true,permitted:true,busy:false,talking:false,inCall:false,locked:false};
assert.equal(wakeState(ready),'listening');
assert.equal(wakeState({...ready,inCall:true}),'paused','a call in Meetings pauses it');
assert.equal(wakeState({...ready,inCall:false}),'listening','and it listens again once the call ends');
for(const key of ['busy','talking','locked'] as const)assert.equal(wakeState({...ready,[key]:true}),'paused',key);
assert.equal(wakeState({...ready,enabled:false,inCall:true}),'off','off stays off');
assert.equal(wakeState({...ready,permitted:false}),'unavailable');
assert.equal(wakeState({...ready,supported:false}),'unavailable','no local Whisper (Linux)');
assert.equal(wakeMatch('Hey a','a'),null,'a one-letter name is too easy to hear');

// The quiet rule is Fox's own (core/companion/fox-proactive.ts).
for(const text of ['安静点','be quiet','闭嘴','Fox 别说话了'])assert.ok(talkQuietRequest(text),text);
for(const text of ['what is quiet hours','帮我安静地整理一下邮件'])assert.ok(!talkQuietRequest(text),text);
assert.equal(talkSpokenText('**Done**: see [the note](worldlet://x) <worldlet-action>x</worldlet-action>'),'Done: see the note');
assert.ok(talkSpeakingLimit('a'.repeat(100000))<=180_000);

// The rhythm, with a fake capture, turn and voice.
function harness({speaks=true,overhears=false}={}){
 const log:string[]=[];let clock=0;const timers:{fn:()=>void,at:number}[]=[];
 const talk=createFoxTalk({
  listen:async()=>{log.push('listen');return true;},finishListening:()=>log.push('finish'),cancelListening:()=>log.push('cancel'),
  ...(overhears?{listenWhileSpeaking:async()=>{log.push('overhear');return true;},keepListening:(preroll:boolean)=>log.push(preroll?'keep:preroll':'keep')}:{}),
  speak:async text=>{log.push('speak:'+text);return speaks;},stopSpeaking:()=>log.push('hush'),submit:text=>log.push('send:'+text),
  now:()=>clock,schedule:(fn,ms)=>{const t={fn,at:clock+ms};timers.push(t);return t;},clear:t=>{const i=timers.indexOf(t);if(i>=0)timers.splice(i,1);}
 });
 const levels=(values:number[])=>{for(const v of values){clock+=60;talk.level(v);}};
 const advance=(ms:number)=>{clock+=ms;for(const t of [...timers])if(t.at<=clock){timers.splice(timers.indexOf(t),1);t.fn();}};
 return {talk,log,levels,advance};
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));

{
 const {talk,log,levels}=harness();
 talk.start();await tick();
 assert.equal(talk.phase,'listening');assert.deepEqual(log,['listen']);
 levels([...Array(10).fill(0.4),...Array(25).fill(0.01)]);
 assert.equal(talk.phase,'thinking','the pause ends listening');assert.equal(log.at(-1),'finish');
 assert.ok(talk.heard('明天几点开会'));assert.equal(log.at(-1),'send:明天几点开会');
 levels(Array(40).fill(0.5));assert.equal(log.filter(l=>l==='finish').length,1,'levels while Fox thinks are not heard');
 await talk.replied('十点。');
 assert.equal(talk.phase,'speaking');assert.equal(log.at(-1),'speak:十点。');
 levels(Array(40).fill(0.5));assert.equal(log.filter(l=>l==='finish').length,1,'listening pauses while Fox speaks');
 talk.spoken();await tick();
 assert.equal(talk.phase,'listening','Fox finished: listen again');assert.equal(log.at(-1),'listen');
 // Barge-in: a press while Fox speaks stops the voice and listens.
 talk.heard('再说一遍');await talk.replied('十点，在三楼。');assert.equal(talk.phase,'speaking');
 assert.ok(talk.interrupt());await tick();
 assert.deepEqual(log.slice(-2),['hush','listen']);assert.equal(talk.phase,'listening');
 assert.ok(!talk.interrupt(),'nothing to interrupt while listening');
 // A late "spoken" from the interrupted reply changes nothing.
 talk.spoken();assert.equal(log.filter(l=>l==='listen').length,3);
 // Silence or a cough: listen again without a turn.
 talk.missed();await tick();assert.equal(log.at(-1),'listen');
 assert.ok(talk.heard(''));await tick();assert.equal(log.at(-1),'listen');
 // Quiet: the line still goes to Fox (its proactive rule hears it), but replies are no longer read.
 talk.heard('安静点');assert.ok(talk.quiet);assert.deepEqual(log.slice(-2),['hush','send:安静点']);
 await talk.replied('好。');await tick();assert.equal(talk.phase,'listening');assert.ok(!log.includes('speak:好。'));
 // Ending Talk stops the capture; afterwards nothing is taken.
 talk.stop();assert.equal(talk.phase,'off');assert.equal(log.at(-1),'cancel');
 assert.equal(talk.heard('hello'),false,'with Talk off a transcript goes the ordinary way');
 talk.start();assert.ok(!talk.quiet,'a new Talk reads replies again');talk.stop();
}
{
 // Spoken replies off for Talk: listen again as soon as the reply is shown.
 const {talk,log}=harness({speaks:false});
 talk.start();await tick();talk.heard('hi');await talk.replied('Hey.');await tick();
 assert.equal(talk.phase,'listening');assert.equal(log.at(-1),'listen');talk.stop();
}
{
 // A voice that never reports its end: listening resumes after talkSpeakingLimit.
 const {talk,log,advance}=harness();
 talk.start();await tick();talk.heard('hi');await talk.replied('Hey there.');
 advance(talkSpeakingLimit('Hey there.')-1);assert.equal(talk.phase,'speaking');
 advance(2);await tick();assert.equal(talk.phase,'listening');assert.equal(log.at(-1),'listen');
 // A long silence restarts the capture.
 const {talk:idle,log:idleLog,levels}=harness();
 idle.start();await tick();levels(Array(Math.ceil(TALK.idleMs/60)+1).fill(0));await tick();
 assert.deepEqual(idleLog,['listen','cancel','listen']);idle.stop();talk.stop();
}
{
 // The microphone could not start: Talk ends.
 const talk=createFoxTalk({listen:async()=>false,finishListening(){},cancelListening(){},speak:async()=>true,stopSpeaking(){},submit(){}});
 talk.start();await tick();assert.equal(talk.phase,'off');
}
{
 // Voice barge-in: the microphone stays open while Fox speaks; Fox's echo does nothing, the person's voice stops it and
 // the same capture, with its first words, is the next utterance.
 const {talk,log,levels}=harness({overhears:true});
 talk.start();await tick();talk.heard('hi');await talk.replied('Hello there, here is a long answer.');
 assert.equal(talk.phase,'speaking');assert.ok(talk.overhearing);assert.equal(log.at(-1),'overhear');
 levels(Array(40).fill(0).map((_,i)=>echo[i%echo.length]));assert.equal(talk.phase,'speaking','Fox’s echo keeps it speaking');
 levels(Array(8).fill(0.7));
 assert.equal(talk.phase,'listening','talking over Fox interrupts it');assert.deepEqual(log.slice(-2),['hush','keep:preroll']);
 assert.equal(log.filter(l=>l==='listen').length,1,'no new capture: the open one goes on');
 levels([...Array(4).fill(0.7),...Array(25).fill(0.01)]);assert.equal(talk.phase,'thinking');assert.equal(log.at(-1),'finish');
 // Fox finishes without being interrupted: the open capture goes on without Fox's echo.
 talk.heard('ok');await talk.replied('Sure.');talk.spoken();await tick();
 assert.equal(talk.phase,'listening');assert.equal(log.at(-1),'keep');assert.ok(!talk.overhearing);
 // A click while Fox speaks keeps the open capture too.
 talk.heard('and?');await talk.replied('More.');assert.ok(talk.interrupt());assert.deepEqual(log.slice(-2),['hush','keep']);
 // Moving elsewhere drops the open capture: the voice goes on, and Talk listens once it ends.
 talk.heard('x');await talk.replied('Y.');talk.dropped();assert.ok(!talk.overhearing);assert.equal(talk.phase,'speaking');
 talk.spoken();await tick();assert.equal(log.at(-1),'listen');
 // Ending Talk while Fox speaks closes the open capture.
 talk.heard('z');await talk.replied('W.');talk.stop();assert.equal(log.at(-1),'cancel');
}
{
 // The wake word starts Talk; a request said with it is the first turn.
 const {talk,log}=harness();
 talk.start('what is on today?');assert.equal(talk.phase,'thinking');assert.equal(log.at(-1),'send:what is on today?');talk.stop();
}
console.log('fox talk ok');
