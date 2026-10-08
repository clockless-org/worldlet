import path from 'node:path';
import {app,BaseWindow,systemPreferences} from 'electron';
import {SPEECH_VOCABULARY,TALK,speechPrompt,speechTerms} from '../../../../../core/companion/index.ts';
import {WorldletError} from '../../files.ts';
import {AUDIO,BROWSER,DESKTOP_COMPANION,DEVELOPMENT_SESSIONS,SPEECH,type AudioService,type BrowserService,type DesktopCompanionService,type DevelopmentSessionsService,type SpeechService} from '../../host/services.ts';
import type {Host,Row} from '../../host/types.ts';
import {MediaSurface} from './surface.ts';
import {WorldAudio} from './audio.ts';
import {LocalMusic} from './local-music.ts';
import {LocalSpeech,SpeechInput,SpeechOutput} from './speech.ts';
import {WakeListener} from './wake.ts';
import {VoiceMemos} from './voice-memos.ts';
import {weatherActions} from './weather.ts';
import {CompanionCloud} from './cloud.ts';
import {ClaudeSessions,CodexSessions,CodexTasks,developmentSessions,discoverCodex} from './coding.ts';
import {killAll} from './io.ts';

/** Sound, voice, weather, Fox's cloud endpoints and local coding tools. Playback, capture
 * and spoken replies run in one host-owned media surface that outlives the World page. */
export function installMedia(host:Host){
 const {store,preferences,page}=host;
 const surface=new MediaSurface();
 let pushQueued=false;
 const audioChanged=()=>{
  if(pushQueued)return;pushQueued=true;
  setImmediate(()=>{pushQueued=false;if(page.ready())void page.call('worldletAudio',audio.snapshot);});
 };
 const audio=new WorldAudio(surface,preferences,host.profile.webRoot,audioChanged);
 // The computer's own music players (Apple Music, Spotify, 汽水音乐…), controlled from the World's corner.
 const music=new LocalMusic(state=>{if(page.ready())void page.call('worldletLocalMusic',state);});
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
 const memos=new VoiceMemos(host,surface);
 const cloud=new CompanionCloud();
 const codexSessions=new CodexSessions(host);
 codexSessions.onEvent=event=>{void page.call('worldletCodexEvent',event);};
 const codexTasks=new CodexTasks(()=>store.ledger());
 const claude=new ClaudeSessions(host);

 host.provide<AudioService>(AUDIO,{setDucked:(active,reason)=>audio.setDucked(active,reason),snapshot:()=>audio.snapshot,stop:()=>audio.stop()});
 host.provide<DevelopmentSessionsService>(DEVELOPMENT_SESSIONS,{list:(provider,operation,id,offset=0)=>developmentSessions(host,provider,operation,id,offset)});
 host.provide<SpeechService>(SPEECH,{cancelCapture:()=>speech.cancel(),stopSpeaking:()=>spoken.stop(),warm:()=>local.warm(),stopLocal:()=>local.stop(),speak:(text,enabled,voiceId,agent)=>spoken.speak(text,enabled,voiceId,agent),voices:()=>spoken.voices(),
  get localSupported(){return local.supported;},
  get wakeState(){return wake.state;},
  setWakeWord:async on=>{
   // Turning it on is the person's own choice: ask for the microphone then, never from the listener.
   if(on&&process.platform==='darwin'&&systemPreferences.getMediaAccessStatus('microphone')==='not-determined')await systemPreferences.askForMediaAccess('microphone');
   wake.set(on);return wake.state;
  },transcribe:async(pcm,language,signal)=>{await local.prepare();return local.transcribe(pcm,language,signal);}});

 const sample=()=>store.sampleEnabled();
 const personal=(message:string)=>{if(!store.writable||sample())throw new WorldletError(message);};
 // Setup scope: no cloud consent yet, unless a practice world already read private browser context.
 const setupScope=()=>!(sample()&&!(host.optional<BrowserService>(BROWSER)?.privateContextWasRead()??false))&&!store.state.cloudConsent;
 const showControls=(screen:string)=>{
  const desktop=host.optional<DesktopCompanionService>(DESKTOP_COMPANION);
  if(desktop?.isDesktop)void desktop.restoreWorld();
  void page.call('worldletShowControls',screen,null);
 };
 // The Mac library recorded the discovered CLI the first time it found one.
 const codexPath=()=>{
  if(!store.state.codexPath){const found=discoverCodex();if(found&&store.writable){store.state.codexPath=found;try{store.persist();}catch{}}return found;}
  return String(store.state.codexPath);
 };
 const appActive=()=>BaseWindow.getFocusedWindow()!==null;
 let orderCapture=false;

 host.register({
  worldAudio:request=>audio.command(request),
  localMusic:request=>{
   const operation=typeof request.operation==='string'?request.operation:'status';
   // The practice world never shows the person's own music.
   if(operation==='watch')return music.watch(request.active===true&&!store.sampleEnabled());
   if(store.sampleEnabled())throw new WorldletError('Open your personal world to control your music.');
   if(operation==='status')return music.snapshot;
   if(operation==='command')return music.command(request);
   return music.appleMusic(request);
  },
  backgroundMusic:request=>{const {action:_action,...body}=request;return audio.control(body);},
  cancelAudioRequest:request=>{if(typeof request.requestID==='string')audio.radio.cancelPending(request.requestID);return {ok:true};},
  voiceMemos:request=>memos.handle(request),
  ...weatherActions(host,surface),
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
  codexSession:request=>{
   personal('Open your personal world to use Codex.');
   return codexSessions.execute(typeof request.operation==='string'?request.operation:'',request,codexPath());
  },
  codexTask:request=>{
   if(!store.writable||sample()||typeof request.operation!=='string')throw new WorldletError('Open your personal world to run a Codex task.');
   if(request.operation==='delegate_codex'&&!store.state.cloudConsent){showControls('privacy');throw new WorldletError('Allow selected context with Fox before delegating a coding task. No task was sent.');}
   return codexTasks.execute(request.operation,request,path.join(store.root,'agent/private/codex'),codexPath(),typeof store.state.model==='string'?store.state.model:'');
  },
  codexCancel:()=>{codexTasks.cancel();return {ok:true};},
  claudeSession:async request=>{
   personal('Open your personal world to use Claude Code.');
   if(request.operation==='cancel'){claude.cancel();void page.call('worldletClaudeCancel');return {ok:true};}
   if(request.operation!=='send'||typeof request.id!=='string'||typeof request.text!=='string')throw new WorldletError('Choose a Claude Code session first.');
   return claude.run(request.id,request.text,async event=>{
    const value=await page.call<Row>('worldletClaudeEvent',event);
    return value&&typeof value==='object'?value:{};
   });
  },
  developmentSessions:request=>{
   if(sample())throw new WorldletError('Open your personal world to read local sessions.');
   const offset=typeof request.offset==='number'&&Number.isInteger(request.offset)?request.offset:0;
   return developmentSessions(host,typeof request.provider==='string'?request.provider:'',typeof request.operation==='string'?request.operation:'list',typeof request.id==='string'?request.id:'',offset);
  }
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
  if(preferences.bool('worldlet.voiceMemos.retryAfterRestart'))void host.worldView()?.webContents.executeJavaScript("location.hash='object=app-voice-memos'").catch(()=>{});
  local.warm();
  audio.setDucked(false,'live');
 });
 // A reloaded World page no longer holds the controls of a recording or a capture.
 host.onPageReload(()=>{speech.cancel();memos.stop();music.watch(false);});
 host.onQuit(()=>{
  wake.stop();unwatchPower();music.watch(false);speech.cancel();spoken.stop();cloud.cancel();codexTasks.cancel();claude.cancel();codexSessions.close();
  killAll();surface.close();
 });
}
