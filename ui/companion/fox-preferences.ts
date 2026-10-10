import {hostFeatures,hostCopy} from '../../platform/bridge/features.ts';
import {companionPersona} from '../../core/companion/index.ts';
import {loginItemText} from '../../core/distribution/index.ts';

import {connectionLive} from '../../core/applets/index.ts';
import {getApp} from '../../core/applets/index.ts';
// Preferences and credential setup stay in Fox’s existing bubble, or, `embedded`, in a Settings
// page of the companion panel, where its own page list replaces Back and Done.
export function createFoxPreferences({call,view,root,setup,toggleSample,embedded=false}:{call:any;view:any;root?:any;setup:any;toggleSample?:any;embedded?:boolean}){
 let generation=0;
 const button=(label,action)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=async()=>{b.disabled=true;try{await action();}catch(e){view.setGuide({text:e.message,actions:[button('Back',()=>show())],takeover:true});}finally{b.disabled=false;}};return b;};
 const close=()=>{generation++;view.setGuide(null);};
 async function show(screen='preferences',provider?: string){
  // Fox's model is the Agent's: choosing the Agent and its provider happens in Settings › Model (core/agent/model-providers.ts).
  if(screen==='model'){generation++;if(!embedded)setup?.('closed');view.setGuide(null);window.dispatchEvent(new CustomEvent('worldlet:companion-info',{detail:{tab:'Settings',setting:'model'}}));return;}
  view.revealGuide?.();
  const turn=++generation;
  if(screen==='tasks'){
   const report=await call('diagnostics');if(turn!==generation)return;
   const runtime=report.runtimeTasks;
   if(!runtime?.supported){view.setGuide({takeover:true,text:'Task inspection is not available on this host yet.',actions:[button('Back',()=>show('diagnostics'))]});return;}
   const body=document.createElement('div');body.style.cssText='max-height:42vh;overflow:auto;';
   const table=document.createElement('table');table.style.cssText='width:100%;border-collapse:collapse;font-size:.85em;text-align:left;';
   const heading=document.createElement('tr');
   for(const label of ['Task','State','Backlog','Last success','Next attempt','Control']){const th=document.createElement('th');th.textContent=label;th.style.padding='8px';heading.append(th);}table.append(heading);
   const stamp=value=>value?new Date(value*1000).toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
   for(const task of runtime.rows||[]){
    const row=document.createElement('tr');row.style.borderTop='1px solid rgba(35,64,49,.14)';
    const name=task.owner==='attention-center'?'Attention Center':(getApp(task.owner)?.title||task.owner);
    const stage=task.id.endsWith(':analyze')?' · Analyze':task.id.endsWith(':check')?' · Sync':'';
    const elapsed=task.execution?.durationSeconds;
    const duration=elapsed==null?'':` · ${elapsed<60?Math.round(elapsed)+'s':Math.floor(elapsed/60)+'m '+Math.round(elapsed%60)+'s'}`;
    const reason=({lease_expired:'Previous run timed out',generation_changed:'Account changed',process_interrupted:'App restarted',incomplete_coverage:'Some inputs still need processing',unverified_output:'Result needs verification',offline:'Waiting for connection',authentication:'Reconnect this account',model_allowance:'Waiting for model allowance'})[task.execution?.errorCode]||'';
    const state=(task.quarantinedDeliveries?`${task.quarantinedDeliveries} need review · `:'')+task.status+(task.waitReason?' · '+(task.waitReason==='analysis_backlog'?'waiting for analysis':task.waitReason.replaceAll('_',' ')):'')+duration+(reason?' · '+reason:'');
    const backlog=(task.id.endsWith(':analyze')||task.waitReason==='analysis_backlog')?`${task.pendingAnalysis||0} to analyze`:`${task.pendingDeliveries} to deliver`;
    const age=task.id.endsWith(':analyze')||task.waitReason==='analysis_backlog'||task.oldestPendingSeconds==null?'':` · oldest ${Math.floor(task.oldestPendingSeconds/60)}m`;
    for(const text of [name+stage,state,backlog+age,stamp(task.lastSuccessAt),task.status==='running'?'Working':task.waitReason==='analysis_backlog'?'After analysis':stamp(task.nextAt)]){const cell=document.createElement('td');cell.style.padding='8px';cell.textContent=text;row.append(cell);}
    row.title=`${task.id} · ${task.pendingDeliveries} pending deliveries`+(task.scanned!==null?` · ${task.scanned} scanned`:'')+(task.runId?` · Run ${task.runId}`:'')+(task.execution?.errorCode?` · ${task.execution.errorCode}`:'')+(task.execution?.deadlineRemainingSeconds!=null?` · Deadline in ${Math.ceil(task.execution.deadlineRemainingSeconds)}s`:'');
    const control=document.createElement('td');control.style.padding='8px';
    if(task.controllable)control.append(button(task.enabled?'Pause':'Resume',async()=>{await call('runtimeTaskControl',{provider:task.owner,operation:task.enabled?'pause':'resume'});await show('tasks');}));
    if(task.owner==='attention-center'&&task.quarantinedDeliveries)control.append(button('Retry',async()=>{await call('runtimeTaskControl',{provider:task.owner,operation:'retry-quarantined'});await show('tasks');}));
    row.append(control);table.append(row);
   }
   body.append(table);
   view.setGuide({takeover:true,text:'**Background tasks**\n'+(runtime.rows?.length?'Each Applet keeps its own progress. Pause revokes active results and preserves saved progress. Items needing review are held for retry; other work continues.':'No tasks have started yet.'),body,actions:[button('Refresh',()=>show('tasks')),...(embedded?[]:[button('Back',()=>show('diagnostics')),button('Done',close)])]});return;
  }
  if(screen==='diagnostics'){
   const report=await call('diagnostics');if(turn!==generation)return;
   const connections=(report.connections||[]).map(c=>`${c.provider}: ${c.status}`).join('\n')||'No accounts connected.';
   const errors=(report.recentErrors||[]).slice(-8).map(e=>`${e.area}: ${e.code}`).join('\n')||'No errors recorded in this app run.';
   view.setGuide({takeover:true,text:`**Diagnostics**\n${report.system} · ${report.build?.version||'Development'} · Build ${report.build?.build??'unknown'}\n\n**Connections**\n${connections}\n\n**Recent errors**\n${errors}\n\n${report.scope}`,actions:[
    ...(String(report.system).startsWith('Windows')?[button('Check for updates',async()=>{const value=await call('appUpdate',{operation:'check'});window.worldletAppUpdate?.(value);view.setGuide({takeover:true,text:value.detail||value.label,actions:[button('Done',close)]});})]:[]),
    ...(report.runtimeTasks?.supported?[button('Tasks',()=>show('tasks'))]:[]),
    button('Save diagnostics',async()=>{await call('exportDiagnostics');}),button('Refresh',()=>show('diagnostics')),button('Done',close)]});return;
  }
  if(screen==='preferences'){close();view.openText();return;}
  if(screen==='connections'){
   const state=await call('snapshot');if(turn!==generation)return;
   const live=(state.connections||[]).filter(connectionLive);
   const actions=live.map(c=>button((getApp(c.provider)?.title||c.provider)+(c.label?' · '+c.label:''),()=>setup('connection',c.provider)));
   // Mac Reconnect reuses a still-valid Google grant without asking which account (Windows asks
   // every time); a fresh grant after Disconnect always asks. So say how to switch on both hosts.
   const google=live.some(c=>c.transport!=='native'&&['gmail','google-calendar','google-drive'].includes(c.provider));
   view.setGuide({takeover:true,text:live.length?'**Connected accounts.** Choose one to reconnect or disconnect it.'+(google?' To use a different Google account, disconnect Google first.':''):'**No accounts are connected yet.** Open an Applet in the world and I will offer to read it.',
    actions});
   view.revealGuide?.();return;
  }
  if(['sources','organize'].includes(screen)){
   const state=await call('snapshot');if(turn!==generation)return;
   if(state.sampleEnabled){view.setGuide({text:'**This is your practice world.** Switch to your own world to connect real sources.',actions:[button('Go to my world',toggleSample)],takeover:true});return;}
   setup(screen,provider);return;
  }
  const info=await call('foxPreferences');if(turn!==generation)return;
  const actions=[],model=info.model?.name||'DeepSeek V4 Flash';let text;
  if(screen==='privacy'){
   text='**Your privacy**\n\nChat goes to '+model+'. With context allowed, Fox may include short excerpts from your connected sources and open content. Nothing is copied automatically.\n\n'+(info.cloudConsent?'Context is allowed.':'Context is off.')+'\n\nBasic usage counts are '+(info.usageAnalyticsEnabled?'on':'off')+'. They include activity, setup and model token/cost counts. After Google sign-in, your user ID, email and available display name link these counts across devices in PostHog. Before sign-in, a random ID measures setup progress. No messages or source content are sent.';
   actions.push(button(info.cloudConsent?'Keep sources private':'Allow selected context',async()=>{await call('foxPreferences',{cloudConsent:!info.cloudConsent});await show('privacy');}));
   actions.push(button(info.usageAnalyticsEnabled?'Stop sharing usage counts':'Share basic usage counts',async()=>{await call('foxPreferenceChange',{setting:'usage_analytics',value:!info.usageAnalyticsEnabled});await show('privacy');}));
  }else if(screen==='style'){
   text='**How Fox speaks**\n\nTell me in your own words — "briefly and warmly", "call me Kelvin", "answer in English" — and I keep to it.\n\n'+(info.companionStyle?.trim()?'Now: '+info.companionStyle:'Default: '+companionPersona().summary);
   if(info.companionStyle)actions.push(button('Use default personality',async()=>{await call('foxPreferenceChange',{setting:'companion_style',value:''});await show('style');}));
  }else if(screen==='voice'){
   text='**Talk or type**\n\nClick Fox to type. Hold Fox or Space to speak, then release to send. Escape cancels. Spaces work normally while you type.\n\nVoice is transcribed on this Mac (Apple speech, or a local Whisper model), then the text goes to the same Fox conversation.';
   if(hostCopy(info).voice)text=hostCopy(info).voice;
   text+='\n\nSpoken replies are '+(info.spokenReplies?'on':'off')+'. '+hostCopy(info).voices;
   actions.push(button(info.spokenReplies?'Mute Fox':'Read replies aloud',async()=>{await call('foxPreferenceChange',{setting:'spoken_replies',value:!info.spokenReplies});await show('voice');}));
   // Talk with Fox (ui/companion/fox-talk.ts) is on hosts that report talkReplies.
   if(typeof info.talkReplies==='boolean'){
    text+='\n\n**Talk with Fox**: right-click the microphone and choose Talk with Fox. Fox listens, answers each thing you say'+(info.talkReplies?' out loud':'')+' and listens again; talk over Fox or click the microphone while it speaks to interrupt, say "be quiet" to keep Talk going without the voice, and press Escape to end it.';
    actions.push(button(info.talkReplies?'Talk without reading replies':'Read replies in Talk',async()=>{await call('foxPreferenceChange',{setting:'talk_replies',value:!info.talkReplies});await show('voice');}));
   }
   // The wake word (platform modules/voice/wake.ts), where local Whisper runs: off by default.
   if(typeof info.wakeWord==='boolean'){
    const state=info.wakeState==='unavailable'&&info.wakeWord?' It is waiting for the microphone: allow Worldlet to use it in your computer’s privacy settings.':info.wakeState==='paused'?' It rests while Fox listens or Talk is on, during a call in Meetings, and while the screen is locked.':'';
    text+='\n\n**Hey Fox**: '+(info.wakeWord?'on. Say "Hey Fox" (or 「嘿 Fox」, 「小狐」) to start Talk with Fox; the microphone stays open and shows a small light while it listens.'+state:'off. Turn it on to start Talk with Fox by saying "Hey Fox" (or 「嘿 Fox」, 「小狐」).')+' Short phrases are checked by local Whisper on this computer, a few seconds of work each; nothing is recorded or sent.';
    text+='\n\n**Dictation**: in any text field of the World, press '+(/Mac/i.test(navigator.platform)?'⌘⇧D':'Ctrl+Shift+D')+' to speak into it, and again to stop. Local Whisper hears your World’s names (its people, Applets and places) so it spells them your way.';
    actions.push(button(info.wakeWord?'Stop listening for “Hey Fox”':'Listen for “Hey Fox”',async()=>{await call('foxPreferenceChange',{setting:'wake_word',value:!info.wakeWord});await show('voice');}));
   }
   const select=document.createElement('select');select.setAttribute('aria-label','Spoken reply voice');
   // The first choice is the Agent's own voice when Fox's Agent has one (its Harness `voice` service), read by a system
   // voice for the reply's language when it cannot speak.
   for(const voice of [{id:'',name:info.agentVoice?'Your Agent’s own voice':'Automatic language',language:''},...(info.voices||[])]){const option=document.createElement('option');option.value=voice.id;option.textContent=voice.name+(voice.language?' · '+voice.language:'');option.selected=voice.id===(info.spokenVoice||'');select.append(option);}
   select.onchange=async()=>{await call('foxPreferenceChange',{setting:'spoken_voice',value:select.value});};
   view.setGuide({text,actions,body:select,takeover:true});return;
  }else if(screen==='data'){
   text='**Your data**\n\nExport sources, world items, browsing history, Fox memory and conversations to a private local backup. Provider credential files, browser logins and executable skills are excluded. Restore checks the package first and keeps your previous library for recovery; reconnect accounts and allow context again afterwards.';
   if(hostCopy(info).backup)text=hostCopy(info).backup;
   if(hostFeatures(info).deferredBackupRestore&&info.backupPending){view.setGuide({text:'Your backup is ready to restore. Close and reopen Worldlet to finish. Your current library will be kept for recovery.',takeover:true,actions:[button('Cancel scheduled restore',async()=>{await call('dataBackup',{operation:'cancelRestore'});await show('data');})]});return;}
   actions.push(button('Transfer companion',()=>show('companion-transfer')));
   actions.push(button('Export backup',async()=>{const result=await call('dataBackup',{operation:'export'});if(result.ok)view.setGuide({text:'Backup saved on your device. Keep it private.',takeover:true,actions:embedded?[button('Back to data',()=>show('data'))]:[]});}));
   actions.push(button('Restore backup',async()=>{const result=await call('dataBackup',{operation:'choose'});if(result.cancelled)return;view.setGuide({text:'Restore the backup from '+result.createdAt+' ('+result.count+' files)? Your current library will be kept as a recovery copy. Account grants are not restored.'+(hostFeatures(info).deferredBackupRestore?' Restoration happens when you next open Worldlet.':''),takeover:true,actions:[button(hostFeatures(info).deferredBackupRestore?'Restore when I reopen':'Restore this backup',async()=>{await call('dataBackup',{operation:'restore',id:result.id});if(hostFeatures(info).deferredBackupRestore)await show('data');}),button('Cancel',async()=>{if(hostFeatures(info).deferredBackupRestore)await call('dataBackup',{operation:'cancel'});await show('data');})]});}));
  }else if(screen==='companion-transfer'){
   text='**Take your companion with you**\n\nExport identity, personality, memories and conversation history to use with another Agent. Accounts, credentials, world layout and running tasks are not included. Import replaces this companion after you review the file; the previous profile is kept for recovery.';
   if(hostCopy(info).companion)text=hostCopy(info).companion;
   actions.push(button('Export companion',async()=>{const result=await call('companionArchive',{operation:'export'});if(result.ok)view.setGuide({text:'Companion saved on your device. It contains private memories and conversations; keep it private.',actions:[button('Back to data',()=>show('data'))],takeover:true});}));
   actions.push(button('Import companion',async()=>{
    const result=await call('companionArchive',{operation:'choose'});if(result.cancelled)return;
    view.setGuide({text:'Replace this companion with '+result.name+'? The archive contains '+result.memories+' memories and '+result.messages+' messages. Your current companion is kept as a recovery copy. Connected accounts are unchanged.',takeover:true,actions:[
     button('Use this companion',async()=>{await call('companionArchive',{operation:'import',id:result.id});}),
     button('Cancel',async()=>{if(hostFeatures(info).cancellableTransferReview)await call('companionArchive',{operation:'cancel'});await show('companion-transfer');})]});
   }));
   actions.push(button('Back to data',()=>show('data')));
  }else if(screen==='login'){
   // What the system reports, not what was last asked for (#1229).
   const login=await call('loginItem');if(turn!==generation)return;
   text='**Open Worldlet at login**\n\n'+loginItemText(login.status,login.platform);
   if(login.status!=='unsupported'){
    const on=login.status==='enabled'||login.status==='requires-approval';
    actions.push(button(on?'Don\'t open at login':'Open at login',async()=>{await call('loginItem',{operation:'set',enabled:!on});await show('login');}));
   }
  }else if(screen==='world'){
   text=info.sampleEnabled?'**Ready for your own world?** Your practice world stays separate.':'**Explore a practice world?** Your own sources stay separate.';
   actions.push(button(info.sampleEnabled?'Go to my world':'Explore practice world',toggleSample));
  }else{close();view.openText();return;}
  // No Done: it said nothing that clicking anywhere else does not already say, and
  // it spent a line of a narrow bubble saying it.
  view.setGuide({text,actions,takeover:true});
 }
 return {show};
}
