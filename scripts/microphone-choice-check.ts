// Fox's microphone choice (#1228) in Chromium with fake media devices: listing, choosing a non-default
// device, the `deviceId: {exact}` constraint reaching every capture path (both browser recorders and the
// Electron media surface's page script), persistence across reload, fallback when the device is gone,
// and the list refreshing on `devicechange`; then the built app against a mocked native host
// (run `npm run build:native-ui` first, as test:companion does). Real devices are verified by use, not here.
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import path from 'node:path';
import {fakeMedia,pageErrors,worldUrl} from './browser-test.ts';

const entry=`export * from './ui/companion/microphone.ts';export {mountMicrophonePicker} from './ui/companion/microphone-picker.ts';export {createBrowserSpeech} from './ui/companion/browser-speech.ts';export {createStreamingSpeech} from './ui/companion/streaming-speech.ts';`;
const bundle=(await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'ts'},bundle:true,format:'iife',globalName:'mic',write:false})).outputFiles[0].text;
const surface=/const PAGE=`[\s\S]*?<script>([\s\S]*?)<\/script>`;/.exec(await readFile('platform/electron/src/modules/media/surface.ts','utf8'))?.[1];
assert(surface?.includes('captureStart'),'the media surface page script is readable');
const css=await readFile('resources/styles/builtin/controls.css','utf8');
const html=`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/controls.css"><body><div id="notionWorld"><button class="companion-speech-button">mic</button></div>
<script src="/bundle.js"></script><script src="/surface.js"></script><script>
window.notices=[];addEventListener('worldlet:microphone-fallback',e=>notices.push(e.detail));
// Record every capture request so the constraint each path sends is visible.
window.requests=[];const real=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
// A capture that never opens fails in 20 s, not after Chromium's four-minute device timeout.
navigator.mediaDevices.getUserMedia=async c=>{requests.push(JSON.parse(JSON.stringify(c)));const s=await Promise.race([real(c),new Promise((_,no)=>setTimeout(()=>no(Error('the fake microphone did not open in 20 s: Chromium reached a real audio device')),20000))]);window.lastStream=s;return s;};
window.picker=mic.mountMicrophonePicker({anchor:document.querySelector('.companion-speech-button'),list:()=>mic.listMicrophones()});
</script>`;
const server=http.createServer((req,res)=>{
 const body=req.url==='/bundle.js'?bundle:req.url==='/surface.js'?surface:req.url==='/controls.css'?css:req.url==='/'?html:null;
 if(body===null){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'content-type':req.url==='/'?'text/html':req.url.endsWith('.css')?'text/css':'text/javascript'});res.end(body);
});
await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://localhost:${(server.address() as any).port}/`;
const browser=await chromium.launch({executablePath:process.env.WORLDLET_TEST_BROWSER,args:['--allow-file-access-from-files',...fakeMedia]});
try{
 const page=await browser.newPage(),errors=pageErrors(page);
 await page.goto(url);
 // Labels need permission; afterwards the fake devices are listed by name.
 await page.evaluate(async()=>{(await navigator.mediaDevices.getUserMedia({audio:true})).getTracks().forEach(t=>t.stop());});
 const inputs=await page.evaluate(()=>(window as any).mic.listMicrophones());
 assert(inputs.length>=2,`Chromium lists several fake microphones (${JSON.stringify(inputs)})`);
 assert(inputs.every(d=>d.label&&d.id!=='default'),'aliases are dropped and every device has a label');
 const chosen=inputs.at(-1),other=inputs[0];

 // Listing: Default plus every device, the default checked while nothing is chosen.
 const mic=page.locator('.companion-speech-button'),menu=page.locator('.companion-mic-menu');
 await mic.click({button:'right'});await menu.waitFor();
 const items=menu.getByRole('menuitemradio');
 await page.waitForFunction(n=>document.querySelectorAll('.companion-mic-menu [role=menuitemradio]').length===n,inputs.length+1);
 assert.equal(await items.first().textContent(),'Default microphone');
 assert.equal(await items.first().getAttribute('aria-checked'),'true');
 assert.deepEqual(await items.evaluateAll(e=>e.slice(1).map(b=>b.textContent)),inputs.map(d=>d.label));

 // Choosing a non-default device saves it and checks it.
 await menu.getByRole('menuitemradio',{name:chosen.label,exact:true}).click();
 assert(await menu.isHidden(),'choosing closes the menu');
 assert.deepEqual(await page.evaluate(()=>(window as any).mic.savedMicrophone()),chosen);

 // Every capture path asks for exactly that device and gets it.
 const capture=async(path:string)=>page.evaluate(async path=>{
  const w=window as any;w.requests=[];
  if(path==='surface'){await w.__media.captureStart(w.mic.savedMicrophone());w.__media.captureCancel();}
  else{
   const speech=path==='streaming'?w.mic.createStreamingSpeech({openText(){},async transcribe(){return '';}}):(()=>{const keep=w.AudioWorkletNode;delete w.AudioWorkletNode;try{return w.mic.createBrowserSpeech({openText(){},async transcribe(){return '';}});}finally{w.AudioWorkletNode=keep;}})();
   // The streaming path needs its worklet and socket afterwards; only the capture request matters here.
   await speech.call('speechStart').catch(()=>{});await speech.call('speechCancel');
  }
  return {requests:w.requests,device:w.lastStream?.getAudioTracks()[0]?.getSettings().deviceId};
 },path);
 for(const path of ['streaming','recorded','surface']){
  const result=await capture(path);
  assert.deepEqual(result.requests.at(-1).audio.deviceId,{exact:chosen.id},`${path} sends deviceId {exact}`);
  assert.equal(result.device,chosen.id,`${path} records from the chosen device`);
 }

 // Persistence across reload.
 await page.reload();
 assert.deepEqual(await page.evaluate(()=>(window as any).mic.savedMicrophone()),chosen);
 // Chromium may hand the page new device ids after a reload: the saved choice still finds its device by label.
 const reloaded=await page.evaluate(()=>(window as any).mic.listMicrophones()),idOf=(label:string)=>reloaded.find(d=>d.label===label)?.id;
 await mic.click({button:'right'});
 await page.waitForFunction(id=>document.querySelector('.companion-mic-menu [aria-checked=true]')?.getAttribute('data-microphone')===id,idOf(chosen.label));
 await page.keyboard.press('Escape');assert(await menu.isHidden());

 // A device id that rotated still resolves by its label.
 await page.evaluate(label=>(window as any).mic.chooseMicrophone({id:'rotated-id',label}),other.label);
 assert.equal((await capture('recorded')).device,idOf(other.label),'a rotated id resolves by label');

 // Gone: fall back to the default, say so once (localized), keep the choice for a re-plugged dock.
 await page.evaluate(()=>{document.documentElement.lang='zh';(window as any).mic.chooseMicrophone({id:'gone',label:'CalDigit Thunderbolt'});});
 for(const path of ['recorded','streaming']){
  const result=await capture(path);
  assert.equal(result.requests.at(-1).audio.deviceId,undefined,`${path} falls back to the default device`);
  assert(result.device,`${path} still records`);
 }
 assert.deepEqual(await page.evaluate(()=>(window as any).notices),['所选麦克风不可用，已改用默认麦克风'],'the fallback is said once');
 assert.equal((await page.evaluate(()=>(window as any).mic.savedMicrophone())).id,'gone','the choice is kept');
 assert.equal(await page.evaluate(async()=>{const w=window as any;const r=await w.__media.captureStart(w.mic.savedMicrophone());w.__media.captureCancel();return r.fallback;}),true,'the media surface reports its fallback');
 // Without permission (no labels) a stale exact id that fails still falls back.
 await page.evaluate(()=>{const w=window as any;w.notices=[];w.mic.chooseMicrophone({id:'unknown',label:''});navigator.mediaDevices.enumerateDevices=async()=>[];});
 assert.equal((await capture('recorded')).requests.map(r=>JSON.stringify(r.audio.deviceId)).join(),'{"exact":"unknown"},','an unlabeled choice tries its id, then the default');
 assert.equal((await page.evaluate(()=>(window as any).notices)).length,1);

 // devicechange: plugging a device in refreshes the open list.
 await page.reload();
 await page.evaluate(()=>{document.documentElement.lang='zh';(window as any).mic.chooseMicrophone(null);});
 await mic.click({button:'right'});await page.waitForFunction(n=>document.querySelectorAll('.companion-mic-menu [role=menuitemradio]').length===n,inputs.length+1);
 assert.equal(await menu.getByRole('menuitemradio',{checked:true}).textContent(),'默认麦克风','the menu is localized');
 await page.evaluate(()=>{const md=navigator.mediaDevices,real=md.enumerateDevices.bind(md);md.enumerateDevices=async()=>[...await real(),{kind:'audioinput',deviceId:'dock',label:'LarkAudioDevice with a very long name that must ellipsize in the menu',groupId:'g'} as any];md.dispatchEvent(new Event('devicechange'));});
 await menu.getByRole('menuitemradio',{name:/^LarkAudioDevice/}).waitFor();
 const overflow=await menu.getByRole('menuitemradio',{name:/^LarkAudioDevice/}).evaluate(b=>({cut:b.scrollWidth>b.clientWidth,style:getComputedStyle(b).textOverflow}));
 assert.equal(overflow.style,'ellipsis');
 // Keyboard: arrows move, Escape closes and returns focus to the mic.
 await page.keyboard.press('ArrowDown');assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('role')),'menuitemradio');
 await page.keyboard.press('Escape');assert(await menu.isHidden());assert.equal(await page.evaluate(()=>document.activeElement?.className),'companion-speech-button');
 assert.deepEqual(errors,[]);

 // The app on a native host: the menu lists the media surface's devices and the choice rides on speechStart.
 const app=await browser.newPage({viewport:{width:1280,height:850},reducedMotion:'reduce'}),appErrors:string[]=[];app.on('pageerror',e=>appErrors.push(e.message));
 await app.addInitScript(()=>{const w=window as any;w.calls=[];w.fallback=false;w.webkit={messageHandlers:{worldlet:{async postMessage(b){w.calls.push(b);
  if(b.action==='snapshot')return {workspaceId:'microphone-fixture',revision:0,sources:[],knowledge:[],worldItems:[],connections:[],onboarding:{completed:true},sampleEnabled:false,cloudConsent:true};
  if(b.action==='modelStatus')return {available:true,cloudAllowed:true};
  if(b.action==='microphones')return {microphones:[{id:'surface-a',label:'CalDigit Thunderbolt 3 Audio'},{id:'surface-b',label:'LarkAudioDevice'}]};
  if(b.action==='speechStart')return {ok:true,microphoneFallback:w.fallback};
  return {ok:true};
 }}}};});
 await app.goto(worldUrl());await app.locator('#worldStartup').waitFor({state:'detached'});
 // The message bar rests low-key without its microphone (#1766); pointing at the bar brings it back.
 const appBar=app.locator('#notionCommand'),appButton=app.locator('.companion-speech-button'),appMenu=app.locator('.companion-mic-menu');
 const appMic={getAttribute:(name:string)=>appButton.getAttribute(name),click:async(options?:any)=>{await appBar.hover();await appButton.click(options);}};
 assert.match(await appMic.getAttribute('title')||'',/Right-click to choose a microphone/);
 await appMic.click({button:'right'});await appMenu.getByRole('menuitemradio',{name:'LarkAudioDevice',exact:true}).click();
 await appMic.click();await app.waitForFunction(()=>(window as any).calls.some(c=>c.action==='speechStart'));
 assert.deepEqual(await app.evaluate(()=>(window as any).calls.find(c=>c.action==='speechStart').microphone),{id:'surface-b',label:'LarkAudioDevice'});
 await app.keyboard.press('Escape');
 await app.evaluate(()=>{(window as any).fallback=true;});
 await appMic.click();await app.getByText('The chosen microphone is unavailable. Using the default microphone.').waitFor();
 assert.deepEqual(appErrors,[]);
 console.log(`PASS microphone choice: ${inputs.length} fake devices listed, chosen device on streaming, recorded and media-surface capture, reload, label re-match, single localized fallback, devicechange refresh; the app sends the media surface's device with speechStart and shows its fallback`);
}finally{await browser.close();server.close();}
