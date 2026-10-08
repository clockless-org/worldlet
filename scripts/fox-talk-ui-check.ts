// Talk with Fox in the built app against a mocked native host (run `npm run build:native-ui` first, as test:companion
// does): the microphone menu turns Talk on, the capture's levels end an utterance, the transcript goes to Fox, the reply
// is read with `talk: true` while a barge capture stays open, the "spoken" event keeps that capture as the next
// utterance, a click on the microphone or the person's voice over Fox's echo interrupts the voice, "安静点" keeps Talk
// without reading, Escape ends it, and the host's wake word shows on the microphone and starts Talk. Rhythm and endpointing details: scripts/fox-talk-check.ts.
import assert from 'node:assert/strict';
import {fileAccess,launchTestBrowser,pageErrors,worldUrl} from './browser-test.ts';

const browser=await launchTestBrowser(fileAccess);
try{
 const app=await browser.newPage({viewport:{width:1280,height:850},reducedMotion:'reduce'}),errors=pageErrors(app);
 await app.addInitScript(()=>{const w=window as any;w.calls=[];w.webkit={messageHandlers:{worldlet:{async postMessage(b){w.calls.push(b);
  if(b.action==='snapshot')return {workspaceId:'talk-fixture',revision:0,sources:[],knowledge:[],worldItems:[],connections:[],onboarding:{completed:true},sampleEnabled:false,cloudConsent:true};
  if(b.action==='modelStatus')return {available:true,cloudAllowed:true};
  if(b.action==='microphones')return {microphones:[]};
  if(b.action==='agentChat')return {message:/安静/.test(JSON.stringify(b))?'好的。':'You have two meetings today.'};
  if(b.action==='speakReply')return b.text?{ok:true,spoken:true}:{ok:true};
  return {ok:true};
 }}}};});
 await app.goto(worldUrl());await app.locator('#worldStartup').waitFor({state:'detached'});
 const root=app.locator('#notionWorld'),bar=app.locator('#notionCommand'),mic=app.locator('.companion-speech-button'),menu=app.locator('.companion-mic-menu');
 const count=(action:string)=>app.evaluate(a=>(window as any).calls.filter(c=>c.action===a).length,action);
 const until=(action:string,n:number)=>app.waitForFunction(([a,n])=>(window as any).calls.filter(c=>c.action===a).length>=n,[action,n] as const);
 const talk=()=>root.getAttribute('data-talk');
 const host=(detail:object)=>app.evaluate(d=>(window as any).worldletSpeech(d),detail);
 // Speech, then a pause: levels as the host sends them, every 60 ms.
 const utterance=()=>app.evaluate(()=>new Promise<void>(resolve=>{let n=0;const t=setInterval(()=>{(window as any).worldletSpeech({phase:'level',text:String(n<10?0.4:0.01)});if(++n>35){clearInterval(t);resolve();}},60);}));

 await bar.hover();await mic.click({button:'right'});
 await menu.getByRole('menuitemcheckbox',{name:'Talk with Fox'}).click();
 await until('speechStart',1);
 assert.equal(await talk(),'listening');
 assert.match(await mic.getAttribute('title')||'',/Talk is on/);
 await utterance();await until('speechStop',1);
 await host({phase:'processing',text:''});await host({phase:'final',text:'What is on today?'});
 await until('agentChat',1);
 await app.waitForFunction(()=>(window as any).calls.some(c=>c.action==='speakReply'&&c.talk===true&&/two meetings/.test(c.text)));
 await app.waitForFunction(()=>document.querySelector('#notionWorld')?.getAttribute('data-talk')==='speaking');
 assert.equal(await count('speechTalk'),1,'the host hears that Talk is on (its wake listener rests)');
 assert.ok(!(await app.evaluate(()=>(window as any).calls.some(c=>c.action==='speakReply'&&c.text&&!c.talk))),'the ordinary spoken reply is not sent as well');
 // While Fox speaks the microphone stays open for barge-in, without stopping the voice.
 const barges=()=>app.evaluate(()=>(window as any).calls.filter(c=>c.action==='speechStart'&&c.barge===true).length);
 await until('speechStart',2);assert.equal(await barges(),1);
 assert.match(await bar.locator('textarea,input').first().getAttribute('placeholder')||'',/talk or click the microphone to interrupt/);
 const keeps=(preroll:boolean)=>app.evaluate(p=>(window as any).calls.filter(c=>c.action==='speechKeep'&&c.preroll===p).length,preroll);

 // The voice finished: the open capture becomes the next utterance, without Fox's echo.
 await host({phase:'spoken',text:''});
 await app.waitForFunction(()=>(window as any).calls.some(c=>c.action==='speechKeep'&&c.preroll===false));
 assert.equal(await talk(),'listening');assert.equal(await count('speechStart'),2,'no new capture');
 await host({phase:'final',text:'And tomorrow?'});await until('agentChat',2);
 await app.waitForFunction(()=>document.querySelector('#notionWorld')?.getAttribute('data-talk')==='speaking');
 await until('speechStart',3);
 // A click on the microphone stops the voice and listens on the open capture.
 const stops=await app.evaluate(()=>(window as any).calls.filter(c=>c.action==='speakReply'&&c.stop).length);
 await bar.hover();await mic.click();
 await app.waitForFunction(()=>(window as any).calls.filter(c=>c.action==='speechKeep'&&c.preroll===false).length>=2);
 assert.equal(await talk(),'listening');
 assert.ok(await app.evaluate(n=>(window as any).calls.filter(c=>c.action==='speakReply'&&c.stop).length>n,stops),'the voice was stopped');

 // Voice barge-in: Fox's quiet echo, then the person speaking over it.
 await host({phase:'final',text:'One more thing'});await until('agentChat',3);
 await app.waitForFunction(()=>document.querySelector('#notionWorld')?.getAttribute('data-talk')==='speaking');
 await until('speechStart',4);
 const voiceStops=await app.evaluate(()=>(window as any).calls.filter(c=>c.action==='speakReply'&&c.stop).length);
 await app.evaluate(()=>new Promise<void>(resolve=>{let n=0;const t=setInterval(()=>{(window as any).worldletSpeech({phase:'level',text:String(n<12?0.05:0.7)});if(++n>24){clearInterval(t);resolve();}},60);}));
 await app.waitForFunction(()=>document.querySelector('#notionWorld')?.getAttribute('data-talk')==='listening');
 assert.equal(await keeps(true),1,'the capture keeps the person’s first words');
 assert.ok(await app.evaluate(n=>(window as any).calls.filter(c=>c.action==='speakReply'&&c.stop).length>n,voiceStops),'talking over Fox stopped its voice');
 await app.evaluate(()=>new Promise<void>(resolve=>{let n=0;const t=setInterval(()=>{(window as any).worldletSpeech({phase:'level',text:'0.01'});if(++n>25){clearInterval(t);resolve();}},60);}));
 await until('speechStop',2);

 // "安静点": Fox hears it, Talk goes on without reading replies.
 const reads=await app.evaluate(()=>(window as any).calls.filter(c=>c.action==='speakReply'&&c.talk).length);
 await host({phase:'final',text:'安静点'});await until('agentChat',4);await until('speechStart',5);
 assert.equal(await talk(),'listening');
 assert.equal(await app.evaluate(()=>(window as any).calls.filter(c=>c.action==='speakReply'&&c.talk).length),reads,'a quiet Talk reads nothing');

 // Silence: listen again without a turn.
 await host({phase:'error',text:'I did not hear speech. Hold Fox and try again.'});await until('speechStart',6);
 assert.equal(await count('agentChat'),4);assert.equal(await talk(),'listening');

 // Escape ends Talk and the capture.
 const cancels=await count('speechCancel');
 await app.keyboard.press('Escape');
 await app.waitForFunction(()=>document.querySelector('#notionWorld')?.getAttribute('data-talk')==='off');
 assert.ok(await count('speechCancel')>cancels);
 assert.ok(await app.evaluate(()=>(window as any).calls.some(c=>c.action==='speechTalk'&&c.active===false)),'the host hears that Talk ended');
 await bar.hover();await mic.click({button:'right'});
 assert.equal(await menu.getByRole('menuitemcheckbox',{name:'Talk with Fox'}).getAttribute('aria-checked'),'false');
 await app.keyboard.press('Escape');

 // The wake word: its light on the microphone while the host listens, and "Hey Fox, …" starting Talk with that request.
 await host({phase:'wake-state',text:'listening'});
 assert.equal(await root.getAttribute('data-wake'),'listening');
 assert.match(await mic.getAttribute('title')||'',/Listening for “Hey /);
 await host({phase:'wake',text:'what is on tomorrow?'});await until('agentChat',5);
 assert.ok(await app.evaluate(()=>/what is on tomorrow/.test(JSON.stringify((window as any).calls.filter(c=>c.action==='agentChat').at(-1)))),'the request said with the wake word is the first turn');
 assert.notEqual(await talk(),'off','the wake word started Talk');
 await app.keyboard.press('Escape');
 await app.waitForFunction(()=>document.querySelector('#notionWorld')?.getAttribute('data-talk')==='off');
 assert.deepEqual(errors,[]);
 console.log('PASS Talk with Fox: menu toggle, level endpointing, turn, spoken reply with talk, open microphone while speaking, click and voice barge-in, quiet, silence, Escape, wake word');
}finally{await browser.close();}
