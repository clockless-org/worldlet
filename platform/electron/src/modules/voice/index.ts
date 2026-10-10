import {app,BaseWindow,systemPreferences} from 'electron';
import {SPEECH_VOCABULARY,TALK,speechPrompt,speechTerms} from '../../../../../core/companion/index.ts';
import {WorldletError} from '../../files.ts';
import {AUDIO,BROWSER,DESKTOP_COMPANION,MEDIA,SPEECH,type AudioService,type BrowserService,type DesktopCompanionService,type MediaService,type SpeechService} from '../../host/services.ts';
import type {Host,Row} from '../../host/types.ts';
import {LocalSpeech,SpeechInput,SpeechOutput} from './speech.ts';
import {WakeListener} from './wake.ts';
import {CompanionCloud} from './cloud.ts';

/** Fox's voice: dictation and Talk capture, local Whisper, the wake word, spoken replies, and Fox's cloud endpoints.
 * Capture and spoken replies run on the media surface; the World's sound ducks under them. */
export function installVoice(host:Host){
 const {store,preferences,page}=host;
 const {surface}=host.use<MediaService>(MEDIA);
 const audio=host.use<AudioService>(AUDIO);
 const local=new LocalSpeech(host);
 local.cleanAbandoned();
 const speech=new SpeechInput(surface,local);
 // The wake word (wake.ts) listens only while Fox's own voice input does not.
 const wake=new WakeListener(surface,local,speech);
 const wakeRefresh=()=>setImmediate(()=>wake.refresh());
 speech.onCaptureChanged=active=>{audio.setDucked(active,'recording');wakeRefresh();};
 speech.onEvent=value=>{void page.call('worldletSpeech',value);if(value.phase==='final'||value.phase==='error')wakeRefresh();};
 wake.name=()=>preferences.string('worldlet.companionName');
 wake.inCall=()=>host.optional<BrowserService>(BROWSER)?.inCall()??false;
 wake.onState=state=>{if(page.ready())void page.call('worldletSpeech',{phase:'wake-state',text:state});};
 // "Hey Fox": Worldlet comes forward and the page starts Talk with Fox (and sends what followed the wake word).
 wake.onWake=rest=>void (async()=>{
  const view=host.worldView(),window=view?BaseWindow.getAllWindows().find(w=>w.contentView.children.includes(view))??host.window():host.window();
  if(process.platform==='darwin')app.focus({steal:true});
  if(window){if(window.isMinimized())window.restore();window.show();window.focus();}
  view?.webContents.focus();
  for(let i=0;i<10&&!appActive();i++)await new Promise(resolve=>setTimeout(resolve,100));
  if(page.ready())void page.call('worldletSpeech',{phase:'wake',text:rest});
 })();
 const unwatchPower=wake.watchPower();
 surface.onEvent(event=>{if(event.type==='devices'&&page.ready())void page.call('worldletSpeech',{phase:'devices',text:''});});
 const spoken=new SpeechOutput(surface);
 spoken.onDuck=active=>audio.setDucked(active,'spoken-reply');
 spoken.onFinished=()=>{if(page.ready())void page.call('worldletSpeech',{phase:'spoken',text:''});};
 const cloud=new CompanionCloud();
 host.provide<SpeechService>(SPEECH,{cancelCapture:()=>speech.cancel(),stopSpeaking:()=>spoken.stop(),warm:()=>local.warm(),stopLocal:()=>local.stop(),speak:(text,enabled,voiceId,agent)=>spoken.speak(text,enabled,voiceId,agent),voices:()=>spoken.voices(),
  get localSupported(){return local.supported;},
  get wakeState(){return wake.state;},
  setWakeWord:async on=>{
   // Turning it on is the person's own choice: ask for the microphone then, never from the listener.
   if(on&&process.platform==='darwin'&&systemPreferences.getMediaAccessStatus('microphone')==='not-determined')await systemPreferences.askForMediaAccess('microphone');
   wake.set(on);return wake.state;
  },transcribe:async(pcm,language,signal)=>{await local.prepare();return local.transcribe(pcm,language,signal);}});

 const sample=()=>store.sampleEnabled();
 // Setup scope: no cloud consent yet, unless a practice world already read private browser context.
 const setupScope=()=>!(sample()&&!(host.optional<BrowserService>(BROWSER)?.privateContextWasRead()??false))&&!store.state.cloudConsent;
 const showControls=(screen:string)=>{
  const desktop=host.optional<DesktopCompanionService>(DESKTOP_COMPANION);
  if(desktop?.isDesktop)void desktop.restoreWorld();
  void page.call('worldletShowControls',screen,null);
 };
 const appActive=()=>BaseWindow.getFocusedWindow()!==null;
 let orderCapture=false;

 host.register({
  speechStart:async request=>{
   if(!appActive())throw new WorldletError('Return to Worldlet to start voice input.');
   // Talk listening while Fox speaks (`barge`): the voice goes on and the capture keeps only its latest moment.
   const barge=request.barge===true;
   if(!barge)spoken.stop();
   const microphone=request.microphone&&typeof request.microphone==='object'&&typeof (request.microphone as Row).id==='string'?{id:String((request.microphone as Row).id).slice(0,512),label:String((request.microphone as Row).label??'').slice(0,512)}:null;
   // A spoken task for Claude may run longer than a message to Fox.
   orderCapture=request.purpose==='order';
   // Whisper hears the World's names (core speechPrompt): Fox's, those the page shows, then the World's topics.
   const topics=sample()||!Array.isArray(store.state.knowledge)?[]:store.state.knowledge.map((k:Row)=>k?.topic);
   const prompt=speechPrompt(speechTerms([preferences.string('worldlet.companionName')||'Fox'],Array.isArray(request.vocabulary)?request.vocabulary.slice(0,SPEECH_VOCABULARY.terms):[],topics));
   const started=await speech.start(typeof request.language==='string'?request.language:'multi',microphone,request.purpose==='order'?180:undefined,barge?TALK.bargePrerollMs/1000+0.4:0,prompt);
   return {ok:true,...started};
  },
  // The person talked over Fox (`preroll`, keeping their first words) or Fox finished: the capture is the utterance.
  speechKeep:request=>{if(request.preroll===true)spoken.stop();speech.keep(request.preroll===true?TALK.bargePrerollMs:0);return {ok:true};},
  speechTalk:request=>{wake.setTalking(request.active===true);return {ok:true};},
  microphones:async()=>({microphones:await speech.microphones()}),
  speechStop:()=>{speech.finish();return {ok:true};},
  speechCancel:()=>{speech.cancel();return {ok:true};},
  cloudRequest:request=>{
   if(request.path==='/api/chat'&&setupScope()){showControls('privacy');throw new WorldletError('Allow selected context with Fox before sending private context. No context was sent.');}
   const id=request.streamId;
   if(typeof id==='string')return cloud.request(request,async event=>{await page.call('worldletCloudStream',id,event);});
   return cloud.request(request);
  },
  cloudCancel:request=>{if(typeof request.streamId==='string')cloud.cancel(request.streamId);return {ok:true};},
 });

 // Native capture cannot rely on a page blur event: leaving the app cancels voice input. An Order instead stops the
 // microphone and goes on with what was heard, and one already being recognised finishes (owner Order 2026-10-07).
 const leave=()=>{if(orderCapture)speech.finish();else speech.cancel();};
 if(process.platform==='darwin')app.on('did-resign-active',leave);
 const watched=new WeakSet<BaseWindow>();
 host.onPageLoaded(()=>{
  wake.set(preferences.bool('worldlet.wakeWord'));wake.setTalking(false);void page.call('worldletSpeech',{phase:'wake-state',text:wake.state});
  const window=host.window();
  if(window&&!watched.has(window)&&process.platform!=='darwin'){
   watched.add(window);
   window.on('blur',()=>setTimeout(()=>{if(!appActive())leave();},100));
  }
  local.warm();
 });
 // A reloaded World page no longer holds the controls of a capture.
 host.onPageReload(()=>speech.cancel());
 host.onQuit(()=>{wake.stop();unwatchPower();speech.cancel();spoken.stop();cloud.cancel();});
}
