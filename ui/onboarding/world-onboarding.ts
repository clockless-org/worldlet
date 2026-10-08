import {appletSupport,CURATED_READERS,HOME_NATIVE} from '../../core/applets/index.ts';
import {hostFeatures,hostCopy,googleSignInStart} from '../../platform/bridge/features.ts';
import {GOOGLE_SIGN_IN_EVENT,googleSignInStage} from '../../contracts/platform.ts';
import {googleConsentActions,googleConsentUrl} from './google-consent.ts';
import {connectionGuide} from '../applets/index.ts';
import {WORLD_APPS,getApp} from '../../core/applets/index.ts';
import {WORLD_PRESETS} from '../world/index.ts';
import {connectionLive} from '../../core/applets/index.ts';
const el=(tag: string,text?: string,cls?: string): any=>Object.assign(document.createElement(tag),{...(text==null?{}:{textContent:text}),className:cls||''});
const providerTitle=p=>getApp(p)?.title||{google:'Google','google-drive':'Google Drive',folder:'Local folder'}[p];
const suggestions={home:[...HOME_NATIVE],work:['github'],library:['notion'],money:[],health:[],travel:[],people:[]};

// Source authorization is owned by the native Agent adapter. Never build on a click or a timer.
export function mountWorldOnboarding({root,call,view,state:initial,toggleSample,showModel,applySnapshot}){
 let state=initial,screen='closed',region='home',moduleKey=null,saving=false,lastSource=null,guideText='';
 const panel=el('section',null,'world-onboarding');panel.setAttribute('aria-label','Set up your world');
 const notice=el('p','','onboarding-error');notice.setAttribute('role','alert');
 const sources=()=>state.sources.filter(s=>s.enabled);
 const connections=()=>state.connections.filter(connectionLive);
 const ready=id=>(state.onboarding?.establishedRegions||[]).includes(id)||view.metrics?.buildings.some(b=>b.id==='building-'+id&&!b.unbuilt);
 const preset=()=>WORLD_PRESETS.find(p=>p.id===region)||WORLD_PRESETS[0];
 const button=(label,fn,primary=false)=>{const b=el('button',label,primary?'onboarding-primary':'');b.type='button';b.onclick=()=>run(fn);return b;};
 async function run(fn){if(saving)return;saving=true;notice.textContent='';panel.setAttribute('aria-busy','true');root.querySelectorAll('.world-onboarding button,.companion-guide-actions button').forEach(b=>b.disabled=true);try{await fn();}catch(e){notice.textContent=e.message;if(screen==='start')render(true);}finally{saving=false;panel.removeAttribute('aria-busy');root.querySelectorAll('.world-onboarding button,.companion-guide-actions button').forEach(b=>b.disabled=false);}}
 function head(title,description){guideText='**'+title+'**\n\n'+description;panel.replaceChildren();}
 function checkSupport(provider){const support=appletSupport(provider,hostFeatures(state));if(support.supported)return true;view.revealGuide?.();view.setGuide({text:support.reason,takeover:true,actions:[]});return false;}
 function show(next,id=region,key=moduleKey){if(next==='closed')view.setGuide(null,{forget:true});if(['app','connection'].includes(next)&&!checkSupport(WORLD_APPS.find(a=>a.key===key)?.provider||key))return;const target=['app','connection'].includes(next)?WORLD_APPS.find(a=>a.key===key):null;if(next==='connection'&&target&&target.capability==='connect'&&target.connection?.flow!=='in-applet'&&!connectionLive(state.connections.find(c=>c.provider===target.provider))){screen='closed';render();void run(()=>connect(target.provider));return;}if(next==='app'&&target&&(target.connection?.flow==='in-applet'||['web','scene','launcher'].includes(target.fullView?.kind))){screen='closed';render();view.openApplet?.(target.id);return;}view.revealGuide?.();screen=next;moduleKey=key;region=WORLD_PRESETS.some(p=>p.id===id)?id:'home';notice.textContent='';render(true);}
 function markOnboarding(value){const next=String(value);if(root.dataset.onboarding===next)return;root.dataset.onboarding=next;root.dispatchEvent(new Event('worldlet:recommendations'));}
 async function explore(){if(!state.onboarding?.completed)await call('onboarding',{operation:'complete'});screen='closed';markOnboarding(false);render();view.showOverview();}
 async function connect(provider){
  if(!checkSupport(provider))return {connected:false};
  if(provider==='folder'&&hostFeatures(state).folderManagement){
   view.setGuide({text:'Choose a local folder. Worldlet will copy its supported text files; you can sync changes or disconnect later.',actions:[],takeover:true});
   try{const result=await call('connect',{provider,region});state=await call('snapshot');screen='sources';render(true);if(result.connected)notice.textContent='Folder connected. Saved originals stay available even if files are removed from the folder.';return result;}
   catch(error){screen='sources';render(true);throw error;}
  }
  const inApplet=WORLD_APPS.find(a=>a.provider===provider&&a.connection?.flow==='in-applet');
  if(inApplet){screen='closed';render();view.openApplet?.(inApplet.id);return;}
  const local=WORLD_APPS.find(a=>a.provider===provider)?.connection?.kind==='native'&&(provider!=='google-calendar'||hostFeatures(state).nativeCalendar);
  const googlePair=!local&&['google','gmail','google-calendar'].includes(provider);
  if(!googlePair)view.revealGuide?.();
  let cancelled=false,stopStages=()=>{};
  const cancel=button('Cancel',()=>{});cancel.onclick=()=>{cancelled=true;return call('connectCancel');};
  const connecting='**Connecting '+(googlePair?'Google':providerTitle(provider)||provider)+'…**';
  if(googlePair||provider==='google-drive'){
   if(googlePair){screen='closed';panel.hidden=true;}
   // Google consent opens only when the saved grant cannot be reused (Reconnect on a healthy
   // connection opens no browser), so the browser steps wait for the host's `browser` stage.
   // With the consent address, Open again and Copy link cover a browser that never came up. Like
   // Cancel they act directly: the pending connection holds `run`.
   const guide=(stage,url?:string)=>{
    const fallback=stage==='browser'&&url?googleConsentActions(url,call):null,actions=[cancel];
    if(fallback){
     const open=button('Open again',()=>{});open.onclick=()=>void fallback.open().catch(()=>{});
     const copy=button('Copy link',()=>{});copy.onclick=()=>void fallback.copy().then(()=>{copy.textContent='Link copied';},()=>{});
     actions.unshift(open,copy);
    }
    view.setGuide({source:'google-sign-in',text:stage!=='browser'?connecting:googlePair?hostCopy(state).googleConnect:connecting+' Finish the sign-in, then come back here.',actions,takeover:true});
   };
   // A guide said since (a reply, another screen) keeps Fox's bubble: a late stage never takes it back.
   const onStage=(event:Event)=>{const detail=(event as CustomEvent).detail,stage=googleSignInStage(detail);if(stage&&[undefined,'google-sign-in'].includes(view.guideSource))guide(stage,googleConsentUrl(detail));};
   window.addEventListener(GOOGLE_SIGN_IN_EVENT,onStage);stopStages=()=>window.removeEventListener(GOOGLE_SIGN_IN_EVENT,onStage);
   guide(googleSignInStart(state));
  }
  else view.setGuide({text:connecting+' '+(local?'Allow access when macOS asks.':'Finish the sign-in, then come back here.'),actions:local?[]:[cancel],takeover:true});
  try{const result=await call('connect',{provider,region}).finally(stopStages);state=await call('snapshot');if(result.connected){screen='closed';
    if(googlePair){view.revealGuide?.();view.setGuide({text:'**Gmail and Calendar are connected.**'+(!hostFeatures(state).backgroundSourceChecks?' Open Mail or Calendar to read their originals. With private context enabled, Fox can read them and save findings when you ask. Google background checks are not available with this setup yet. Disconnecting either app disconnects both.':''),actions:!hostFeatures(state).backgroundSourceChecks?[button('Open Mail',()=>{show('closed');view.openApplet?.('app-gmail');}),button('Open Calendar',()=>{show('closed');view.openApplet?.('app-google-calendar');}),button('Done',()=>show('closed'))]:[],takeover:true});return {connected:true};}
    if(provider==='google-drive'){view.setGuide({text:'**Google Drive is connected.** With private context enabled, ask Fox to list recent files. The Drive Applet reads recent files and Google Docs text. Other formats remain in Web. Disconnecting Google signs out Gmail, Calendar and Drive in this profile.',actions:[button('Done',()=>show('closed'))],takeover:true});return result;}
    const app=WORLD_APPS.find(a=>a.provider===provider),title=providerTitle(provider)||provider,consent=!!state.cloudConsent;
    if(CURATED_READERS.includes(provider)){view.setGuide({text:'**'+title+' is connected.** Open the Applet to read original content on demand. Background checks and automatic Attention items are not enabled for this connection.',actions:[button('Open '+title,()=>{show('closed');view.openApplet?.(app.id);}),button('Done',()=>show('closed'))],takeover:true});return result;}
    if(!hostFeatures(state).backgroundSourceChecks&&provider==='notion'){
     view.setGuide({text:'**Notion is connected.** Open its shelf to read recent pages and their originals. '+(consent?'Fox can read pages and save findings when you ask.':'Allow private context to let Fox read pages and save findings.')+' Background checks are not available with this setup.',actions:[button('Open Notion',()=>{show('closed');view.openApplet?.(app.id);}),button('Done',()=>show('closed'))],takeover:true});return result;
    }
    const open=app?.fullView?.kind==='native'?[button('Open '+app.title,()=>{show('closed');view.openApplet?.(app.id);})]:[];
    const account=state.connections.find(c=>c.provider===provider)?.label;
    view.setGuide({text:'**'+title+' is connected'+(account?' as '+account:'')+'.** '+(consent?'Fox reads it on demand and checks it in the background.':'Start lets Fox read it on demand and check it in the background. Nothing is copied.'),
     actions:consent?[...open,button('Done',()=>show('closed'))]:[button('Start',async()=>{await call('foxPreferences',{cloudConsent:true});state=await call('snapshot');view.setGuide({text:'**Reading '+title+' now.** Tasks, events and updates will appear on the left as I find them, and I\u2019ll check again every 30 minutes while Worldlet is open.',actions:[button('Done',()=>show('closed'))],takeover:true});}),...open,button('Not now',()=>show('closed'))],takeover:true});}else if(googlePair){throw new Error('Google connection was not completed.');}else show('start');}
  catch(error){view.revealGuide?.();view.setGuide({text:cancelled?'Connection cancelled. Close the old sign-in tab. Choose Try again to open a fresh sign-in page.':error.message,actions:googlePair?[button('Try again',()=>connect(provider))]:[button('Try again',()=>connect(provider)),button('More options',()=>show('sources')),button('Done',()=>show('closed'))],takeover:true});return {connected:false};}
 }
 function render(takeover=false){
  const closed=screen==='closed'||screen==='start';
  panel.hidden=closed;
  if(closed){panel.hidden=true;if(screen==='start')markOnboarding(false);return;}
  if((screen==='app'||screen==='connection')&&moduleKey==='google-drive'){
   const connected=connectionLive(state.connections.find(c=>c.provider==='google-drive'));
   head('Google Drive','Browse recent files and read Google Docs text in the Drive Applet. Other formats and editing remain in Web. Allow private context before asking Fox about account content.');
   panel.append(button(connected?'Reconnect Google Drive':'Connect Google Drive',()=>connect('google-drive'),true));
   if(connected)panel.append(button('Disconnect Google',async()=>{await call('disconnectSource',{provider:'google-drive'});state=await call('snapshot');render(true);}),el('p','Disconnect signs out Gmail, Calendar and Drive in this profile. Saved items are kept.','ui-caption'));
  }else if(screen==='app'||screen==='connection'){
   const app=WORLD_APPS.find(a=>a.key===moduleKey);if(!app){show('sources');return;}
   const connection=state.connections.find(c=>c.provider===app.provider);const connected=connectionLive(connection);
   // Opening an unconnected applet starts its connection right away; the status panel is only for connected accounts.
   if(screen==='app'&&app.capability==='connect'&&!connected){screen='closed';panel.hidden=true;void run(()=>connect(app.provider));return;}
   head(app.title,app.description+(connected?' Your account is connected.':app.capability==='planned'?' Account connection is not ready yet.':app.capability==='browser'?' Browse the original website. Account sync is not connected.':app.sessionProvider?' Use your existing local tool.':' Connect your account to bring your own information here.'));
   const guide=connectionGuide(app.key);
   if(!hostFeatures(state).backgroundSourceChecks&&['gmail','google-calendar'].includes(app.provider))panel.append(el('p','Google sign-in connects Gmail and Calendar with read-only access. Open either app to read originals. With private context enabled, Fox can read and save findings when asked. Google background checks are not available with this setup yet.','ui-caption'));
   else if(guide)panel.append(el('p',guide.scope,'ui-caption'),el('p',guide.next,'ui-caption'),el('p',guide.user,'ui-caption'));
   if(app.capability==='connect')panel.append(button(connected?'Reconnect '+app.title:'Connect '+app.title,()=>connect(app.provider),true));
   if(connected&&['gmail','google-calendar','notion','apple-notes','apple-reminders','todoist','google-drive'].includes(app.provider)){
    const google=connection?.transport!=='native'&&(app.provider.startsWith('google-')||app.provider==='gmail');
    panel.append(button(google?'Disconnect Google':'Disconnect '+app.title,async()=>{await call('disconnectSource',{provider:app.provider});state=await call('snapshot');render(true);}));
    panel.append(el('p',google?'Disconnect signs out Gmail, Calendar and Drive in this Worldlet profile. What was already saved is kept. To revoke access on every device, use your Google Account’s third-party connections.':'Disconnect removes this connection. What was already saved is kept.','ui-caption'));
   }
   // Offered whether or not the account is still connected: a user who disconnected
   // yesterday is exactly the one who comes back wanting the data gone too.
   if(hostFeatures(state).localDataDeletion&&['gmail','google-calendar','notion'].includes(app.provider)){
    panel.append(button('Delete '+app.title+' data',async()=>{const result=await call('deleteSourceData',{provider:app.provider});if(result&&result.cancelled)return;state=await call('snapshot');render(true);}));
    panel.append(el('p','This deletes the items Worldlet saved from '+app.title+', the copies it imported and what Fox derived from them, on this computer. An item that also rests on another source keeps that evidence. Nothing is deleted in '+app.title+', and the connection is left as it is.','ui-caption'));
   }

  }else if(screen==='presets'){
   head('Room to grow','Each region has a permanent place. Connect something meaningful to bring it to life.');
   const list=el('div',null,'onboarding-regions');
   for(const p of WORLD_PRESETS){const b=button('',()=>{if(ready(p.id)){region=p.id;return explore();}show('sources',p.id);});b.append(el('strong',p.title),el('small',ready(p.id)?'Ready · Explore':p.description));list.append(b);}
   panel.append(list);
  }else if(screen==='note'){
   head('Add something of your own','A plan, an idea, or something to remember. Your original stays on this computer.');
   const form=el('form'),title=el('input'),text=el('textarea');
   title.placeholder='Give it a title';title.maxLength=160;title.required=true;title.setAttribute('aria-label','Note title');text.placeholder='What is on your mind?';text.required=true;text.maxLength=24000;text.rows=4;text.setAttribute('aria-label','Note content');
   const submit=el('button','Save note','onboarding-primary');submit.type='submit';form.append(title,text,submit);
   form.onsubmit=e=>{e.preventDefault();void run(async()=>{if(!form.reportValidity())return;const result=await call('onboarding',{operation:'note',title:title.value.trim(),text:text.value,preset:region,...(moduleKey?{moduleKey}:{})});lastSource=result.sourceId;show('sources');});};
   panel.append(form,button('Back',()=>show('sources')));setTimeout(()=>title.focus(),0);
  }else if(screen==='sources'){
   const built=ready(region);
   // No headline and no paragraph: the region is on screen behind this panel,
   // already named and already described by what stands in it. What this panel is
   // for is the list underneath. head() also cleared the panel, so clear it here.
   guideText='';panel.replaceChildren();
   if(built)panel.append(button('Explore '+preset().title,explore,true));
   const list=el('div',null,'onboarding-sources');
   for(const provider of suggestions[region])list.append(button('Connect '+(providerTitle(provider)),()=>connect(provider),!built&&list.children.length===0));
   for(const app of WORLD_APPS.filter(a=>a.region===region&&!suggestions[region].includes(a.provider)))list.append(button(app.title,()=>show('app',region,app.key)));
   list.append(button('Google Drive',()=>show('connection',region,'google-drive')));
   panel.append(list);
   const existing=sources();
   if(!built&&(existing.length||connections().length)){
    const details=el('details'),summary=el('summary','Use an existing source');details.append(summary);
    for(const c of connections()){const refs=existing.filter(s=>s.connectionId===c.id).map(s=>s.id);details.append(button(c.label||providerTitle(c.provider)||'Connected account',async()=>{await call('onboarding',{operation:'region',region,connectionIds:[c.id],sourceIds:refs});render();}));}
    for(const s of existing.filter(s=>!s.connectionId||!connections().some(c=>c.id===s.connectionId)).slice(0,30))details.append(button(s.title,async()=>{await call('onboarding',{operation:'region',region,sourceIds:[s.id]});render();}));
    panel.append(details);
   }
   const local=el('details');local.append(el('summary','Add something of your own'),button('Import files…',()=>call('importFiles',{region})),button('Connect local folder…',()=>connect('folder')),button('Write a note',()=>show('note')));panel.append(local);
   if(hostFeatures(state).folderManagement)for(const folder of connections().filter(c=>c.provider==='folder')){
    const row=el('div',null,'onboarding-sources');row.append(el('span',folder.label||'Local folder'),
     button('Sync folder',async()=>{const result=await call('folderConnection',{operation:'sync',id:folder.id});state=await call('snapshot');render();notice.textContent=`Folder synced. ${result.imported} new or updated files; saved copies of removed files are kept.`;}),
     button('Disconnect folder',async()=>{await call('folderConnection',{operation:'disconnect',id:folder.id});state=await call('snapshot');render();notice.textContent='Folder disconnected. Saved originals are kept.';}));panel.append(row);
   }
   if(built&&sources().some(s=>!state.knowledge.some(k=>k.sourceId===s.id&&k.sourceRevision===s.revision)))panel.append(button('Organize with Fox',()=>show('organize')));
   if(lastSource&&built)panel.append(button('Open my first item',async()=>{if(!state.onboarding?.completed)await call('onboarding',{operation:'complete'});show('closed');view.openSource(lastSource);}));

  }else if(screen==='organize'){
   head('Help Fox understand your world','Fox can use your configured Agent to read selected source text, group related matters and find possible next steps. Your local copies are kept.');
   panel.append(el('p','This allows selected context to be sent to your connected model. Ask Fox to change the model or privacy permission at any time.'),button('Allow & organize',async()=>{
    const stop=el('button','Stop organizing');stop.type='button';stop.onclick=async()=>{stop.disabled=true;try{await call('agentCancel');}catch(e){notice.textContent=e.message;stop.disabled=false;}};
    if(hostFeatures(state).cancellableOrganization){panel.append(stop);notice.textContent='Fox is organizing your sources. Completed sources are saved as it works.';}
    try{await call('organizeSources',{consent:true});show('closed');}finally{stop.remove();}
   },true),button('Keep it local for now',()=>show('closed')));
  }
  panel.append(notice);view.setGuide({takeover,text:guideText,body:panel});
 }
 // Starting a conversation defers setup for this visit without marking it complete.
 root.addEventListener('worldlet:fox-input',()=>{screen='closed';panel.hidden=true;markOnboarding(false);});
 render();
 return {update(next){state=next;if(!saving&&!['note','organize','closed'].includes(screen))render();},show,connect:provider=>run(()=>connect(provider))};
}
