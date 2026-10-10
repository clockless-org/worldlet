import path from 'node:path';
import {WorldletError} from '../../files.ts';
import {DESKTOP_COMPANION,DEVELOPMENT_SESSIONS,MEDIA,type DesktopCompanionService,type DevelopmentSessionsService,type MediaService} from '../../host/services.ts';
import type {Host,Row} from '../../host/types.ts';
import {VoiceMemos} from './voice-memos.ts';
import {weatherActions} from './weather.ts';
import {ClaudeSessions,CodexSessions,CodexTasks,developmentSessions,discoverCodex} from './coding.ts';

/** Applets that drive the computer's own apps and tools: Voice Memos, Weather, Codex and Claude Code sessions,
 * and the coding tasks Fox delegates to Codex. */
export function installAppletTools(host:Host){
 const {store,preferences,page}=host;
 const {surface}=host.use<MediaService>(MEDIA);
 const memos=new VoiceMemos(host,surface);
 const codexSessions=new CodexSessions(host);
 codexSessions.onEvent=event=>{void page.call('worldletCodexEvent',event);};
 const codexTasks=new CodexTasks(()=>store.ledger());
 const claude=new ClaudeSessions(host);
 host.provide<DevelopmentSessionsService>(DEVELOPMENT_SESSIONS,{list:(provider,operation,id,offset=0)=>developmentSessions(host,provider,operation,id,offset)});

 const sample=()=>store.sampleEnabled();
 const personal=(message:string)=>{if(!store.writable||sample())throw new WorldletError(message);};
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

 host.register({
  voiceMemos:request=>memos.handle(request),
  ...weatherActions(host,surface),
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
 host.onPageLoaded(()=>{
  if(preferences.bool('worldlet.voiceMemos.retryAfterRestart'))void host.worldView()?.webContents.executeJavaScript("location.hash='object=app-voice-memos'").catch(()=>{});
 });
 // A reloaded World page no longer holds the controls of a recording.
 host.onPageReload(()=>memos.stop());
 host.onQuit(()=>{codexTasks.cancel();claude.cancel();codexSessions.close();});
}
