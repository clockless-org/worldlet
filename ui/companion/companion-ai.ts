import {withFoxTurnAnalytics,withToolAnalytics} from '../shell/index.ts';
import {isRequestCancellation} from '../shell/index.ts';
import {replyAction} from './reply-actions.ts';
import {runAudioCommand} from '../shell/index.ts';
import {musicReply} from '../shell/index.ts';
import {speechLanguage} from './speech-language.ts';
import {createBrowserSpeech} from './browser-speech.ts';
import {listMicrophones,microphoneFallback,savedMicrophone} from './microphone.ts';
import {createNativeChat} from './native-chat.ts';
import {installFieldDictation} from './field-dictation.ts';
import {foxContext} from './fox-context.ts';
import {contextThread} from '../attention/index.ts';
import {isDesktopCompanion} from './world-surface.ts';

// Tools that act on the visible page; the ones that can move it also update the tracked view.
const VIEW_CHANGING_TOOLS=new Set(['show_artifact','open_artifact','perform_action','move_view','visit_place','open_applet','open_content','browse_web']);
const VIEW_DEPENDENT_TOOLS=new Set([...VIEW_CHANGING_TOOLS,'scroll_browser','automate_browser']);

// Chat uses the selected Agent adapter.
export function createCompanionAI(unavailable: any,transport: any={}){return (options: any)=>{
 const desktop=isDesktopCompanion;
 const worldRoute=options.chatRoute,worldExecute=withToolAnalytics(options.execute,transport.nativeCall,()=>!!transport.nativeCall&&!transport.sample);
 options={...options,chatRoute:()=>desktop()?null:worldRoute?.(),execute:async(name,args,meta)=>{
  // Fox's held page shows beside the desktop Companion (#1175): its steps need no World.
  if(desktop()&&VIEW_DEPENDENT_TOOLS.has(name)&&!(name==='automate_browser'&&options.foxPageHeld?.()))await transport.nativeCall?.('openWorld');
  return worldExecute(name,args,meta);
 }};
 if(typeof transport.runAgent!=='function')throw Error('Fox requires an Agent adapter.');
 transport.runAgent.useWorld?.({execute:options.execute,codex:transport.codex});
 let controller=null,activeRun=null;
 const request=transport.request||((path,body,signal)=>fetch(path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':body instanceof Blob?body.type:'application/json'}:{},...(body?{body:body instanceof Blob?body:JSON.stringify(body)}:{}),signal}));
 async function chat(body){
  if(transport.nativeCall)void transport.nativeCall('speakReply',{stop:true}).catch(()=>{});
  controller?.abort();const current=new AbortController();controller=current;const {signal}=current;
  let appliedView=null;
  const currentView=()=>{const view=ui?.contextSnapshot?.();return JSON.stringify([view?.key,view?.view?.id]);};
  const appliedContext=()=>appliedView!==null&&appliedView===currentView();
  let ready;const runState={ready:new Promise(resolve=>{ready=resolve;}),canSteer:false};activeRun=runState;
  try{
   body.trace?.mark('prepareStartedMs');
   // A Worldlet-originated request (a button, not the user's words) never goes to a
   // routed external session and never carries user authority into tools.
   const route=body.invitation||body.origin==='system'?null:options.chatRoute?.();
   if(route)return await route.run(body.text,{signal,onDelta:body.onDelta});
   const modelOptions=await transport.modelOptions?.()||{};
   body.trace?.mark('modelStatusMs');
   if(!navigator.onLine&&modelOptions.provider!=='agent')throw Error('You are offline. You can still read and explore your world. Chat and changes through Fox need a connection.');
   signal.throwIfAborted();
   const minimal=!!modelOptions.setup;
   const context=minimal?{}:foxContext(body.context);
   let toolView=JSON.stringify([body.context?.key,body.context?.view?.id]);
   body.trace?.mark('contextReadyMs');
   const pending=transport.runAgent({text:body.text,history:minimal?[]:body.history,context,...minimal?{}:{thread:contextThread(body.context?.key,body.context?.view?.id)},execute:async(name,args,meta)=>{
    if(body.invitation)return {error:'A greeting is text only. Wait for an explicit user request before taking actions.'};
    // Explicit record-ID reads/writes can finish in the original task. Relative
    // navigation and visible-page actions must never drift onto a new selection.
    // Fox's page held for its task (the task picture-in-picture window, #1175) is not the
    // person's selection: Fox's steps on it continue while the person moves around the World.
    const held=name==='automate_browser'&&!!options.foxPageHeld?.();
    if(VIEW_DEPENDENT_TOOLS.has(name)&&!held&&currentView()!==toolView)return {error:'The user changed views. Do not act on the new selection or navigate them away. Ask before continuing this view-dependent action.'};
    const before=currentView();
    const result=await options.execute(name,args,meta);
    if(VIEW_CHANGING_TOOLS.has(name)||(name==='automate_browser'&&args?.operation==='open')){
     toolView=currentView();if(toolView!==before)appliedView=toolView;
    }
    return result;
   },request,signal,trace:body.trace,origin:body.origin==='system'?'system':'user',shown:body.shown,
    ...modelOptions,allowActions:!body.invitation,onStatus:body.onStatus,onDelta:partial=>body.onDelta?.(partial,{appliedContext:appliedContext()}),codex:transport.codex});
   runState.canSteer=!!transport.runAgent?.steer;ready();
   const result=await pending;
   return {...result,contextChars:JSON.stringify(context).length,appliedContext:appliedContext()};
  }catch(error){throw isRequestCancellation(error)?new DOMException('The request was cancelled.','AbortError'):error;}

  finally{ready();if(activeRun===runState)activeRun=null;if(controller===current)controller=null;}
 }
 // Work Worldlet starts by itself (the day's plan and summary) runs beside the conversation, in a background
 // session of its own (owner Order 2026-10-07): it never aborts the person's turn, nor theirs it, and it is never
 // steered. Its tools still act on the World, so what it makes (an artifact) shows.
 async function background(body){
  const modelOptions=await transport.modelOptions?.()||{};
  if(modelOptions.setup)throw Error('Fox is not set up yet.');
  return transport.runAgent({text:body.text,history:[],context:foxContext(body.context),thread:contextThread(body.context?.key,body.context?.view?.id),execute:options.execute,request,origin:'system',shown:body.shown,...modelOptions,allowActions:true,background:true,codex:transport.codex});
 }
 async function transcribe(audio,signal,preview=false){
  if(!navigator.onLine)throw Error('Voice transcription needs a connection. Tap Fox to type while offline.');
  signal.throwIfAborted();
  const response=await request(preview?'/api/transcribe/preview':'/api/transcribe',audio,signal);
  const data=await response.json().catch(()=>({}));
  if(!response.ok){throw Error(data.error||'Voice transcription failed. Please try again.');}
  const text=String(data.text||'').trim();if(!text)throw Error('I did not catch any words. Hold Fox and try again.');return text;
 }
 let ui;
 // Native hosts transcribe on device and emit the final text themselves, with the World's names as Whisper's hint.
 const speech=transport.nativeCall?{call:async(action,body)=>{if(action!=='speechStart')return transport.nativeCall(action,body);const result=await transport.nativeCall(action,{...body,language:speechLanguage(),microphone:savedMicrophone(),vocabulary:options.speechVocabulary?.()||[]});if(result?.microphoneFallback)microphoneFallback();return result;}}:createBrowserSpeech({openText:()=>ui?.openText(),transcribe});
 // The media surface's device ids are the ones its capture accepts, so native hosts list there.
 const microphones=async()=>{if(!transport.nativeCall)return listMicrophones();const result=await transport.nativeCall('microphones').catch(()=>null);return Array.isArray(result?.microphones)?result.microphones:[];};
 async function runReplyAction({href,label}){
  const action=replyAction(href);if(!action||!transport.nativeCall)throw Error('This action is unavailable.');
  const result=action.method==='backgroundMusic'?await runAudioCommand(transport.nativeCall,action.args):await transport.nativeCall(action.method,action.args);
  if(result.ok===false||result.error)throw Error(result.error||'The action could not finish.');
  return action.method==='backgroundMusic'?{message:musicReply(label,result)}:{};
 }
 async function steer(text){const current=activeRun;if(!current)return {accepted:false};await current.ready;if(activeRun!==current||!current.canSteer)return {accepted:false};return transport.runAgent.steer(text);}
 const trackedChat=withFoxTurnAnalytics(chat,transport.nativeCall,()=>!!transport.nativeCall&&!transport.sample);
 const call=(action,body)=>action==='steer'?steer(body.text):action==='replyAction'?runReplyAction(body):action.startsWith('speech')?speech.call(action,body):action==='microphones'?microphones():action==='harnessAgents'?(transport.nativeCall&&!transport.sample?transport.nativeCall('harnessAgents',body):Promise.resolve(null)):action==='chat'?trackedChat(body):action==='background'?background(body):action==='cancel'?(controller?.abort(),transport.nativeCall?.('speakReply',{stop:true})||Promise.resolve()):action==='agentWarm'?(transport.nativeCall&&!transport.sample?transport.nativeCall('agentWarm',body):Promise.resolve({warm:false})):unavailable(action,body);
 ui=createNativeChat(call)({...options,recallStorage:transport.nativeCall&&!transport.sample?{load:()=>transport.nativeCall('conversationRecall'),save:rows=>transport.nativeCall('conversationRecall',{rows})}:null,steering:!!transport.runAgent?.steer,holdToSpeak:!!transport.nativeCall,replyActions:!!transport.nativeCall,onSpokenReply:text=>transport.nativeCall?.('speakReply',{text:String(text).slice(0,12000)}),
  // Talk with Fox reads each reply unless Talk's own spoken replies are off (`worldlet.talkReplies`); the host says whether it speaks,
  // and keeps an echo-cancelled microphone open meanwhile so the person can talk over Fox (`speechStart` with `barge`).
  talkVoice:transport.nativeCall?{bargeIn:true,speak:async text=>(await transport.nativeCall('speakReply',{text:String(text).slice(0,12000),talk:true}))?.spoken===true,stop:()=>{void transport.nativeCall('speakReply',{stop:true})?.catch?.(()=>{});}}:null});
 // Any text field of the World takes dictation too, through the same local Whisper and hint (field-dictation.ts).
 if(transport.nativeCall)installFieldDictation({call:(action,body)=>speech.call(action,body)});
 if(transport.nativeCall)void transport.nativeCall('companionProfile').then(profile=>{window.dispatchEvent(new CustomEvent('worldlet:companion-appearance',{detail:profile}));window.dispatchEvent(new CustomEvent('worldlet:attention-focus',{detail:{mode:profile.attentionFocus||'auto'}}));}).catch(()=>{});
 window.addEventListener('worldlet:model-changed',()=>ui.cancel());
 window.addEventListener('pagehide',()=>controller?.abort());
 return ui;
};}
