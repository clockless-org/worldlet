import {APPLET_OVERVIEW_WIDTH,APPLET_OPTICAL_SCALE,WORLD_WIDTH,WORLD_HEIGHT} from '../world/index.ts';
import {seedAppletSelection} from '../../core/applets/index.ts';
import {xAppIcon} from '../applets/index.ts';
import {setupText,setInterfaceLanguage} from './setup-language.ts';
import {WORLD_APPS} from '../../core/applets/index.ts';
import {appletSupport} from '../../core/applets/index.ts';
import {connectionLive} from '../../core/applets/index.ts';
import {appLogoSource} from '../applets/index.ts';
import {CORE_APPLET_KINDS,coreAppletSource} from '../applets/index.ts';
import {hostFeatures,googleSignInStart} from '../../platform/bridge/features.ts';
import {GOOGLE_SIGN_IN_EVENT,googleSignInStage} from '../../contracts/platform.ts';
import {LOCAL_HARNESSES,connectRequestPlan} from '../../core/agent/index.ts';
import {agentBringDimensions,agentsDetectedDimensions,diagnosticError,timingBucket} from '../../core/diagnostics/index.ts';
import {googleConsentActions,googleConsentUrl} from './google-consent.ts';

// Local Agent marks: Claude Code and Codex reuse their Applet logos; the rest ship in resources/brands.
const AGENT_ICONS:Record<string,string>={'claude-code':appLogoSource({key:'claude-code'})||'','codex':appLogoSource({key:'codex'})||'',hermes:'brands/hermes.png',openclaw:'brands/openclaw.svg',pi:'brands/pi.svg'};
// Page 1 picks one local Agent for the person, in this order (owner request 2026-10-06): Hermes, OpenClaw and pi
// first, then Codex, then Claude Code.
const AGENT_PRIORITY=['hermes','openclaw','pi','codex','claude-code'];
const node=(tag:string,text='',cls='')=>{const e=document.createElement(tag);e.textContent=text;e.className=cls;return e;};
/** First-use setup lives on the loading curtain. No model turn or source read gates entry. */
export function mountStartupSetup({state:initial,call,complete}){
 let state=initial,step=0,busy=false,disposed=false,error='',notice='',detecting=true,signingIn=false,entering=false;
 // Agents already on this computer (Claude Code, Codex, …): choosing one replaces Google sign-in.
 // Every supported Agent is listed; only the ones the host found here can be chosen.
 // Each Agent here reports whether it has a name, memory or history Fox can bring (never its text).
 let agents:{id:string,title:string,worldTools?:boolean,memory?:{name:string|null,user:boolean,longTerm:boolean,model?:boolean,history?:{conversations:number,notes:number,skills:number,jobs:number}}}[]=[],detectingAgents=true,connectingAgent:string|null=null;
 // The local Agent picked on page 1: the first found in AGENT_PRIORITY until the person picks another;
 // the page's one Continue brings it.
 let picked:string|null=null;
 // "My Agent is on another computer" (core/phone/README.md#another-computers-agent): the code Worldlet there shows,
 // pasted here, pairs this Worldlet with it and Fox's conversation runs on its Agent.
 let remoteForm=false,remoteCode='',pairingRemote=false;
 // No Agent here (Codex alone included): Worldlet installs stock Hermes Agent the official way (`install-hermes`), then
 // the person signs in to ChatGPT inside it with Hermes' own sign-in (`sign-in-hermes`), owner decisions 2026-10-09.
 // `hermesStep` is the installer's step being run; `hermesCode` the code Hermes' device page asks for, when it does.
 let hermesSetup:'idle'|'installing'|'installed'|'signing-in'='idle',hermesStep='',hermesCode:string|null=null;
 const onHermesSetup=(event:Event)=>{
  const detail=(event as CustomEvent).detail;if(disposed||!detail)return;
  if(detail.stage==='install'&&hermesSetup==='installing'&&Number.isInteger(detail.step)&&Number.isInteger(detail.steps)&&typeof detail.title==='string')hermesStep=t('Step {step} of {steps}: {title}').replace('{step}',String(detail.step)).replace('{steps}',String(detail.steps)).replace('{title}',detail.title.slice(0,80));
  else if(detail.stage==='sign-in'&&hermesSetup==='signing-in')hermesCode=typeof detail.code==='string'&&/^[A-Z0-9-]{4,20}$/.test(detail.code)?detail.code:null;
  else return;
  render();
 };
 window.addEventListener('worldlet:hermes-setup',onHermesSetup);
 // The second page brings the chosen Agent in while the person watches (owner request 2026-10-04):
 // its card reads its name, personality, memory and model, while one line flashes what is happening
 // (owner request 2026-10-06: no list). `facts` and `shown` pace that reveal; `chatter` turns the
 // line while the host is still copying.
 let bringing=false,facts=0,fresh=-1,shown=0,revealTimer=0,porting=false,chatter=0,chatterTimer=0;
 let scanned:string[]=[];
 // 'connecting' until the host says it opened Google consent: a reused grant opens no browser.
 let googleStage:string='connecting',googleUrl:string|undefined;
 const onGoogleStage=(event:Event)=>{const detail=(event as CustomEvent).detail,stage=googleSignInStage(detail);if(disposed||!signingIn||!stage)return;googleStage=stage;googleUrl=googleConsentUrl(detail);render();};
 window.addEventListener(GOOGLE_SIGN_IN_EVENT,onGoogleStage);
 // An install script launched Worldlet with `--connect=<id>` (core/agent/PORTABILITY.md#local-harnesses-chosen-at-setup):
 // on the first page that Agent is picked and connected as Continue would, and once it has come over the
 // bring page goes on by itself. Launched again while setup is open, the host says so and setup looks again.
 let autoContinue=false;
 const onConnectRequest=()=>{if(!disposed)void detectAgents();};
 window.addEventListener('worldlet:connect-agent',onConnectRequest);
 const languages=['en','zh','ja','es'];
 const systemLanguage=navigator.language.split('-')[0];
 const key='worldlet-startup-setup:'+state.workspaceId;
 let draft:any={step:0,language:languages.includes(systemLanguage)?systemLanguage:'en',applets:['app-gmail','app-google-calendar','app-browser'],touched:[],consent:true};
 try{const saved=JSON.parse(localStorage.getItem(key)||'null');if(saved&&Array.isArray(saved.applets))draft={...draft,...saved};}catch{}
 // Resume from account facts (or the chosen local Agent), not old three-step draft indices.
 step=typeof draft.agent==='string'||draft.ownModel===true||typeof draft.remoteAgent==='string'||['gmail','google-calendar'].every(provider=>state.connections?.some(c=>c.provider===provider&&connectionLive(c)))?1:0;
 const selected=new Set<string>(draft.applets.filter(id=>WORLD_APPS.some(a=>a.id===id)));
 let detected=new Set<string>(),nativeIcons:Record<string,string>={};
 const t=(text:string)=>setupText(text,draft.language);
 const touched=new Set<string>(draft.touched||[]);
 const loader=document.getElementById('worldStartup');
 const panel=node('section','','startup-setup');panel.setAttribute('aria-label','Set up your world');
 loader.insertBefore(panel,loader.querySelector('.startup-brand'));loader.classList.add('has-setup');loader.setAttribute('role','region');loader.setAttribute('aria-busy','false');
 // The brand signs the page alone, with no version beside it (owner feedback 2026-10-03).
 document.dispatchEvent(new Event('worldlet:setup-start'));
 window.dispatchEvent(new CustomEvent('worldlet:product-event',{detail:'onboarding_started'}));
 if(step===1)window.dispatchEvent(new CustomEvent('worldlet:product-event',{detail:'onboarding_apps_viewed'}));
 const persist=()=>localStorage.setItem(key,JSON.stringify({...draft,step,applets:[...selected],touched:[...touched]}));
 const connected=()=>['gmail','google-calendar'].every(provider=>state.connections?.some(c=>c.provider===provider&&connectionLive(c)));
 // Google or a chosen local Agent opens the apps page.
 const ready=()=>connected()||typeof draft.agent==='string'||draft.ownModel===true||typeof draft.remoteAgent==='string';
 const agentText=(text:string,agent:string)=>t(text).replace('{agent}',agent);
 // Three pages, shown as three bars on top (owner request 2026-10-05): your agent, bringing it in, your
 // apps. A chosen Agent passes through the second page; Google goes straight to the apps.
 // Setup's product events (core/diagnostics/ANALYTICS.md#bringing-an-agent): allowlisted dimensions, a duration bucket.
 const productEvent=(event:string,dimensions:Record<string,string>={},duration='')=>window.dispatchEvent(new CustomEvent('worldlet:product-event',{detail:{event,dimensions,duration}}));
 const failureCode=(error:any)=>{try{return String(diagnosticError({message:typeof error?.message==='string'?error.message:''}).code);}catch{return 'operationFailed';}};
 const bringingPage=()=>step===1&&typeof draft.agent==='string'&&draft.apps!==true;
 async function chooseAgent(id:string|null){
  const agent=agents.find(a=>a.id===id);
  if(!agent)return;
  connectingAgent=agent.id;render();
  const started=performance.now();
  try{
   // The host proves the Agent answers before Fox uses it; a failure leaves Google sign-in here.
   let chosen;
   try{chosen=await call('agentHarness',{operation:'select',id:agent.id});}
   catch(e){productEvent('local_agent_select_failed',{local_agent:agent.id,error_code:failureCode(e)},timingBucket(performance.now()-started));throw e;}
   await call('foxPreferences',{cloudConsent:true});
   // Back then Continue with the same Agent shows what already came over instead of reading it again
   // (owner request 2026-10-06); another Agent starts over.
   if(draft.broughtFrom!==agent.id||draft.brought?.failed){delete draft.brought;delete draft.integrations;delete draft.broughtFrom;}
   else{facts=FACTS;shown=scanTotal();scanned=[];}
   notice='';draft.agent=agent.id;draft.agentName=agentName(agent);draft.connected=chosen?.connected===true;delete draft.apps;draft.consent=true;step=1;error='';persist();
   // fox_brain: the built-in Hermes Agent on a model Fox has, or the chosen Agent answering on its own sign-in.
   productEvent('local_agent_selected',{local_agent:agent.id,fox_brain:chosen?.model?'built_in':'agent'},timingBucket(performance.now()-started));
   window.dispatchEvent(new CustomEvent('worldlet:product-event',{detail:'onboarding_apps_viewed'}));
  }finally{connectingAgent=null;}
 }
 // The Agent's own name where it has one (OpenClaw's Nova), else its product name.
 const agentName=(agent:{title:string,memory?:{name:string|null}})=>agent.memory?.name||agent.title;
 /** Copies the chosen Agent into Fox (`localAgent` `adopt`: name, memory, conversations, notes,
  * skills, routines), then ports the integrations it had (`agentIntegrations`). Bringing again
  * replaces what it brought last time, so a relaunch on this page simply runs it again. */
 async function bringIn(){
  const id=draft.agent;
  if(bringing||typeof id!=='string'||draft.brought)return;
  bringing=true;facts=0;shown=0;chatter=0;scanned=[];draft.broughtFrom=id;render();
  // While the host copies, the line turns every so often; Reduce Motion keeps the first one.
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches)chatterTimer=window.setInterval(()=>{chatter++;if(!disposed&&!busy)render();},1100);
  const started=performance.now();
  try{
   const adopted=await call('localAgent',{operation:'adopt',id});
   const history=adopted?.history||{};
   const list=Array.isArray(history.list)?history.list.filter(item=>typeof item?.title==='string').slice(0,60).map(item=>({title:String(item.title).slice(0,160),messages:Number(item.messages)||0})):[];
   // What came along besides history: its name, and which of personality, about-you and long-term memory.
   const kinds=Array.isArray(adopted?.memories)?adopted.memories.map(m=>typeof m==='string'?m:m?.kind).filter(k=>typeof k==='string'):[];
   // A few words each for its personality, what it knows about the person and its model, read from its own files.
   const summary=adopted?.summary||{},said=(value:unknown)=>typeof value==='string'?value.trim().slice(0,80):'';
   draft.brought={conversations:Number(history.conversations)||list.length,older:Number(history.older)||0,notes:Number(history.notes)||0,skills:Number(history.skills)||0,routines:Number(history.routines)||0,list,model:adopted?.model?.ok===true,modelName:adopted?.model?.ok?String(adopted.model.model||''):'',name:typeof adopted?.name==='string'?adopted.name:null,kinds,memory:kinds.length>0||!!adopted?.name,summary:{personality:said(summary.personality),about:said(summary.about),model:said(summary.model)}};
   // Worldlet provides no model (owner decision 2026-10-05): when the Agent's model could not come over and
   // nothing else here answers (an OpenClaw on a sign-in, no Codex), say where to choose one.
   const energy=await call('foxEnergy').catch(()=>null);
   draft.brought.energy=['chatgpt','own','none'].includes(energy?.source)?energy.source:'';
   // An Agent Fox talks through directly keeps its own model; the one it brought only runs background work.
   if(adopted?.model?.ok&&!draft.connected)notice=agentText('Fox now runs on the model you brought from {agent}.',draft.agentName||id);
   else if(draft.brought.energy==='none')notice=agentText('{agent} signs in with its own account, which Fox can’t use. After setup, choose a model in Settings, under Model.',draft.agentName||id);
  }catch(e){
   productEvent('agent_bring_failed',{local_agent:id,error_code:failureCode(e)},timingBucket(performance.now()-started));
   draft.brought={conversations:0,notes:0,skills:0,routines:0,list:[],model:false,modelName:'',name:null,kinds:[],memory:false,failed:true,summary:{}};
   notice=agentText('Fox couldn’t bring {agent}’s memory. You can tell Fox about yourself instead.',draft.agentName||id);
  }finally{bringing=false;clearInterval(chatterTimer);}
  // Porting starts before the reveal, so the scan reads on to the connections before it says the Agent moved in.
  porting=true;persist();reveal();render();
  try{const result=await call('agentIntegrations',{operation:'port',id});draft.integrations=Array.isArray(result?.integrations)?result.integrations.filter(item=>typeof item?.title==='string'&&typeof item?.outcome==='string').slice(0,20):[];}
  catch{draft.integrations=[];}
  finally{
   porting=false;persist();if(!disposed&&!busy)render();
   // Counts and outcomes only, once the whole bring (history and integrations) is over.
   if(!draft.brought.failed)productEvent('agent_bring_completed',agentBringDimensions(id,draft.brought,draft.integrations),timingBucket(performance.now()-started));
  }
 }
 // The Agent's facts appear one by one, then its conversations; with reduced motion, all at once.
 const FACTS=4,SCAN=24;
 // The titles scroll past like a scan (owner request 2026-10-06), the first SCAN of them at a steady pace.
 const scanTotal=()=>Math.min(SCAN,draft.brought?.list?.length||0);
 const revealed=()=>facts>=FACTS&&shown>=scanTotal();
 function reveal(){
  clearTimeout(revealTimer);
  const total=scanTotal();
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){facts=FACTS;shown=total;if(!disposed&&!busy)render();return;}
  const tick=()=>{
   // Only the fact read just now fades in; every render rebuilds the page.
   if(facts<FACTS){fresh=facts;facts++;}else{fresh=-1;shown=Math.min(total,shown+1);}
   if(!disposed&&!busy)render();
   if(!revealed()&&!disposed)revealTimer=window.setTimeout(tick,facts<FACTS?420:Math.max(110,Math.min(220,2800/Math.max(1,total))));
  };
  revealTimer=window.setTimeout(tick,300);
 }
 /** The no-Agent block: Worldlet installs Hermes Agent (the page's one button), then ChatGPT is signed in inside it;
  * Check again looks for an Agent installed meanwhile. */
 function noAgent(){
  const box=node('div','','setup-agent-needed');box.setAttribute('aria-live','polite');
  const says={
   idle:'No agent found on this computer. Worldlet installs Hermes Agent for you the official way, then you sign in to ChatGPT inside it.',
   installing:'Installing Hermes Agent…',
   installed:'Hermes Agent is installed. Sign in to ChatGPT in it. To use another model, run hermes model in Terminal, then check again.',
   'signing-in':'Continue in your browser.'
  }[hermesSetup];
  // One line, so the page still fits: the installer's step while it runs, the code Hermes' device page asks for after
  // the browser line.
  const line=node('p',hermesSetup==='installing'&&hermesStep?hermesStep:t(says),'setup-note');
  if(hermesSetup==='signing-in'&&hermesCode){const code=node('span',' '+t('Enter this code: '),'setup-hermes-code');code.append(node('strong',hermesCode));line.append(code);}
  box.append(line);
  const links=node('div','','setup-agent-fallback');
  const link=(label:string,fn:()=>void)=>{const b=node('button',t(label),'setup-link') as HTMLButtonElement;b.type='button';b.onclick=fn;links.append(b);return b;};
  if(hermesSetup==='signing-in')link('Cancel sign-in',()=>void call('agentHarness',{operation:'cancel-sign-in'}).catch(()=>{}));
  else if(hermesSetup!=='installing')link('Check again',()=>void detectAgents()).disabled=busy;
  box.append(links);
  // Past its first line the block takes the cloud agents' room (both coming soon), whose feedback line goes with it.
  if(hermesSetup!=='idle'&&error){const feedback=node('p',t(error),'setup-error setup-key-error');feedback.setAttribute('role','alert');box.append(feedback);}
  return box;
 }
 /** The link to an Agent on another computer, beside the local Agents' heading (the page never scrolls), and its code
  * box, which takes the Agent tiles' and the cloud agents' room while it is open. */
 function remoteToggle(){
  const toggle=node('button',t(remoteForm?'Use an agent on this computer':'My Agent is on another computer'),'setup-link setup-remote-toggle') as HTMLButtonElement;toggle.type='button';toggle.disabled=busy||pairingRemote;
  toggle.onclick=()=>{remoteForm=!remoteForm;error='';render();};
  return toggle;
 }
 function remoteAgent(){
  const box=node('div','','setup-agent-remote');
  box.append(node('p',t('On that computer, open Worldlet, then Fox’s panel › Mobile › Pair another computer, and paste its code here.'),'setup-note'));
  const code=document.createElement('input');code.className='setup-remote-code';code.value=remoteCode;code.placeholder='worldlet://agent?…';code.spellcheck=false;code.autocomplete='off';code.setAttribute('aria-label',t('Code from your other computer'));code.disabled=pairingRemote;
  code.oninput=()=>{remoteCode=code.value;const next=document.querySelector('.startup-setup .setup-next') as HTMLButtonElement|null;if(next)next.disabled=!remoteCode.trim()||pairingRemote;};
  box.append(code);
  // The cloud agents' feedback line is hidden with them, so a refused code says why here.
  if(error){const feedback=node('p',t(error),'setup-error setup-key-error');feedback.setAttribute('role','alert');box.append(feedback);}
  return box;
 }
 async function pairRemote(){
  pairingRemote=true;render();
  try{
   const result=await call('agentHarness',{operation:'pair',link:remoteCode.trim()});
   await call('foxPreferences',{cloudConsent:true});
   remoteForm=false;remoteCode='';draft.remoteAgent=String(result?.remote?.computer||'');draft.consent=true;delete draft.agent;notice='';step=1;persist();
   window.dispatchEvent(new CustomEvent('worldlet:product-event',{detail:'onboarding_apps_viewed'}));
  }finally{pairingRemote=false;}
 }
 /** Installs Hermes Agent the official way (to its default location; nothing when one is already here). */
 async function installHermes(){
  hermesSetup='installing';hermesStep='';render();
  try{await call('agentHarness',{operation:'install-hermes'});hermesSetup='installed';}
  catch(e){hermesSetup='idle';throw e;}
 }
 /** ChatGPT signed in inside Hermes Agent, then Hermes is brought like any Agent found here. */
 async function signInHermes(){
  hermesSetup='signing-in';hermesCode=null;render();
  try{await call('agentHarness',{operation:'sign-in-hermes'});}
  catch(e){hermesSetup='installed';throw e;}
  hermesSetup='idle';
  await detectAgents();
  picked='hermes';
  await chooseAgent('hermes');
 }
 const button=(label,fn,primary=false)=>{const b=node('button',t(label),primary?'setup-primary':'') as HTMLButtonElement;b.type='button';b.disabled=busy;b.onclick=()=>void run(fn);return b;};
 async function run(fn){if(busy)return;busy=true;error='';render();try{await fn();}catch(e){error=/cancel/i.test(e.message||'')?'Your request was cancelled.':e.message||'That didn’t finish. Please try again.';}finally{busy=false;if(!disposed)render();}}
 let sourcePreparation:Promise<void>|null=null;
 function prepareGoogleSources(){
  if(sourcePreparation)return sourcePreparation;
  if(!connected()||!draft.consent||!hostFeatures(state).backgroundSourceChecks)return Promise.resolve();
  sourcePreparation=(async()=>{
   await call('foxPreferences',{cloudConsent:true});
   // Native store owns the task and streams findings while this gallery stays usable.
   await call('onboarding',{operation:'checkMail'});
  })().catch(()=>{sourcePreparation=null;});
  return sourcePreparation;
 }
 // Native connection receipts are authoritative even if the original bridge
 // reply was lost while switching out to the browser or refreshing the page.
 function advanceAfterGoogle(){
  if(step!==0||!connected())return false;
  draft.consent=true;selected.add('app-gmail');selected.add('app-google-calendar');
  step=1;error='';notice='';persist();void prepareGoogleSources();
  window.dispatchEvent(new CustomEvent('worldlet:product-event',{detail:'onboarding_apps_viewed'}));
  return true;
 }
 async function finish(){
  if(!ready())throw Error('Connect Google to enter your world.');
  // Preserve existing personality when setting an explicit response language.
  if(draft.language!=='auto'){
   const info=await call('foxPreferences');
   const language={en:'English',zh:'Chinese',ja:'Japanese',es:'Spanish'}[draft.language];
   // A retried finish must not append the same rule again.
   const rule='Reply in '+language+' unless I ask for another language.',style=info.companionStyle||'';
   if(language&&!style.includes(rule))await call('foxPreferenceChange',{setting:'companion_style',value:style+'\n'+rule});
  }
  const hasGoogle=connected();
  if(hasGoogle){selected.add('app-gmail');selected.add('app-google-calendar');}
  await prepareGoogleSources();
  await call('onboarding',{operation:'setup',applets:[...selected]});
  const snapshot=await call('snapshot');
  const gathering=node('div','','setup-gathering');loader.append(gathering);
  // Every chosen app gathers: a shown tile flies from its place, the starters not shown come in from the middle.
  const iconsToGather=WORLD_APPS.filter(a=>selected.has(a.id)).map(app=>{
   const shown=panel.querySelector<HTMLImageElement>('.setup-app[data-applet-id="'+CSS.escape(app.id)+'"] .setup-app-logo');
   const img=shown||image(appIcon(app),'setup-app-logo');img.dataset.appletId=app.id;return img;
  });
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Bringing an Agent in shows no gallery; its apps arrive without flying from tiles.
  const gallery=(panel.querySelector('.setup-gallery')||panel).getBoundingClientRect();
  const flights=iconsToGather.map((img,i)=>{
   const r=img.getBoundingClientRect(),copy=img.cloneNode() as HTMLImageElement;gathering.append(copy);
   const visible=img.isConnected&&r.top>=gallery.top&&r.bottom<=gallery.bottom;
   const x=visible?r.left+r.width/2:innerWidth/2,y=visible?r.top+r.height/2:innerHeight*.5;
   const columns=Math.min(6,iconsToGather.length),rows=Math.ceil(iconsToGather.length/columns),spacing=Math.min(140,(innerWidth-80)/columns,(innerHeight-140)/rows);
   const targetX=innerWidth*.5+((i%columns)-(columns-1)/2)*spacing,targetY=innerHeight*.45+(Math.floor(i/columns)-(rows-1)/2)*spacing;
   return copy.animate([{left:x+'px',top:y+'px',opacity:visible?1:0,transform:'translate(-50%,-50%) scale(1)'},{left:targetX+'px',top:targetY+'px',opacity:1,transform:'translate(-50%,-50%) scale(.85)'}],{duration:reduced?0:650,easing:'cubic-bezier(.22,.7,.2,1)',fill:'forwards'}).finished;
  });
  loader.classList.add('is-gathering');await Promise.all(flights);
  // Let the user see each familiar flat icon become its actual device before opening.
  const payload=(globalThis as any).__WORLDLET_25D_ASSETS__;
  await Promise.all(Array.from(gathering.querySelectorAll<HTMLImageElement>('img')).map(async (logo,i)=>{
   const app=WORLD_APPS.find(a=>a.id===logo.dataset.appletId);
   const src=payload?.devices?.[app?.key];
   if(!src)return;
   const device=image(src) as HTMLImageElement;device.dataset.appletId=logo.dataset.appletId;
   try{await device.decode();}catch{return;}
   const size=APPLET_OVERVIEW_WIDTH*(APPLET_OPTICAL_SCALE[app.key]??1)*Math.max(innerWidth/WORLD_WIDTH,innerHeight/WORLD_HEIGHT);
   const r=logo.getBoundingClientRect();Object.assign(device.style,{left:(r.left+r.width/2)+'px',top:(r.top+r.height/2)+'px',width:size+'px',height:size+'px',transform:'translate(-50%,-50%)',opacity:'0'});gathering.append(device);
   const duration=reduced?0:650,delay=reduced?0:i*140;
   await Promise.all([
    logo.animate([{opacity:1,filter:'brightness(1)'},{opacity:.6,filter:'brightness(2)',offset:.35},{opacity:0,filter:'brightness(1)'}],{duration,delay,fill:'forwards'}).finished,
    device.animate([{opacity:0,transform:'translate(-50%,-50%) scale(.45)',filter:'brightness(2) drop-shadow(0 0 12px #ffe4a0)'},{opacity:1,transform:'translate(-50%,-50%) scale(1)',offset:.7},{opacity:1,transform:'translate(-50%,-50%) scale(1)',filter:'brightness(1) drop-shadow(0 3px 5px #35453025)'}],{duration,delay,fill:'forwards'}).finished
   ]);logo.remove();
  }));
  gathering.id='setupArrivingDevices';document.body.append(gathering);
  localStorage.removeItem(key);disposed=true;clearTimeout(revealTimer);clearInterval(chatterTimer);window.removeEventListener(GOOGLE_SIGN_IN_EVENT,onGoogleStage);window.removeEventListener('worldlet:connect-agent',onConnectRequest);window.removeEventListener('worldlet:hermes-setup',onHermesSetup);window.removeEventListener('resize',refit);
  // Keep the final setup surface until the first world frame is ready.
  loader.classList.add('setup-entering');
  document.dispatchEvent(new Event('worldlet:setup-complete'));
  const icons=Object.fromEntries(WORLD_APPS.filter(a=>selected.has(a.id)).map(a=>[a.id,nativeIcons[a.key]||appLogoSource(a)||coreAppletSource(CORE_APPLET_KINDS[a.key]||'calendar')]));
  await complete(snapshot,icons);
  // Native scheduler owns ongoing Mail/Calendar checks. Do not wait for inference.

 }
 const supportedApps=()=>WORLD_APPS.filter(a=>appletSupport(a.key,hostFeatures(state)).supported);
 function appTile(app){
  const label=node('label','','setup-app'),check=document.createElement('input');check.type='checkbox';check.checked=selected.has(app.id);check.disabled=busy;
  const name=t(app.title),say=()=>check.setAttribute('aria-label',(check.checked?t('Remove {app}'):t('Add {app}')).replace('{app}',name));say();
  check.onchange=()=>{touched.add(app.id);if(check.checked)selected.add(app.id);else selected.delete(app.id);say();persist();};
  const src=appIcon(app);
  // What the app is for, as its tooltip (demo feedback 2026-10-03).
  const purpose=app.purpose?t(app.purpose):'';if(purpose)label.dataset.purpose=purpose;
  label.dataset.appletId=app.id;label.title=purpose?name+' — '+purpose:name;
  const tile=node('span','','setup-icon-tile');tile.classList.toggle('is-native',!!nativeIcons[app.key]||app.key==='x');tile.append(image(src,'setup-app-logo'),node('span','','setup-app-badge'));
  label.append(check,tile,node('strong',name));return label;
 }
 function appIcon(app){return nativeIcons[app.key]||(app.key==='x'?xAppIcon:appLogoSource(app))||coreAppletSource(CORE_APPLET_KINDS[app.key]||'calendar');}
 function image(src:string,cls=''){const img=document.createElement('img');img.src=src;img.alt='';img.className=cls;return img;}
 // The line page 2 flashes while it brings the Agent in (owner request 2026-10-06), in place of a list.
 function bringLine(name:string){
  const brought=draft.brought,list:{title:string,messages:number}[]=brought?.list||[];
  if(!brought){
   const lines=['Reading {agent}’s memory…','Packing up {agent}’s conversations…','Folding in {agent}’s notes…','Teaching Fox {agent}’s skills…'];
   return agentText(lines[chatter%lines.length],name);
  }
  if(brought.failed)return '';
  if(facts<FACTS)return agentText('Reading {agent}’s memory…',name);
  if(shown<scanTotal())return '“'+list[shown].title+'”';
  if(porting)return t('Checking its connections…');
  return agentText('{agent} moved in.',name);
 }
 
 const DENSITY=['is-dense','is-denser','is-densest'];
 function fitApps(content:HTMLElement){
  const gallery=content.querySelector<HTMLElement>('.setup-gallery');if(!gallery)return;
  const fits=()=>content.scrollHeight<=content.clientHeight+1;
  gallery.classList.remove(...DENSITY);
  for(const level of DENSITY){if(fits())return;gallery.classList.add(level);}
 }
 const refit=()=>{const content=panel.querySelector<HTMLElement>('.setup-content');if(!disposed&&content)fitApps(content);};
 window.addEventListener('resize',refit);
 function render(){
  if(disposed)return;panel.replaceChildren();loader.dataset.setupStep=String(step);
  // Bringing the chosen Agent in (owner request 2026-10-04) comes before choosing apps; Google skips it.
  const arriving=bringingPage();
  panel.classList.toggle('is-bringing',arriving);
  // Three bars on top say where setup is (owner request 2026-10-05): done, current, still to come; only
  // the bars, no words under them (owner request 2026-10-06).
  loader.querySelector('.setup-steps')?.remove();
  const page=step===0?0:arriving?1:2,steps=node('ol','','setup-steps');
  steps.setAttribute('aria-label',t('Step {step} of 3').replace('{step}',String(page+1)));
  for(let i=0;i<3;i++){const item=node('li','','setup-step '+(i<page?'is-done':i===page?'is-current':'is-next'));if(i===page)item.setAttribute('aria-current','step');item.append(node('span','','setup-step-bar'));steps.append(item);}
  loader.prepend(steps);
  // Every page has the same frame (owner request 2026-10-06): a heading and one line under it at the
  // same place, the page's own part below, and one big button of one size at the bottom with a small Back.
  const agentId=draft.agent as string,found=agents.find(a=>a.id===agentId);
  const product=found?.title||LOCAL_HARNESSES.find(h=>h.id===agentId)?.title||agentId;
  const shownApps=supportedApps().filter(a=>detected.has(a.key));
  // Page 2 names the Agent by its own name (owner request 2026-10-06: "Bring your Elon") and says only that
  // everything comes along.
  const settled=!!draft.brought&&revealed()&&!porting;
  panel.append(node('h1',step===0?t('Give your agent a World'):arriving?agentText('Bring your {agent}',draft.brought?.name||draft.agentName||agentId):t('Bring your apps into your World')));
  panel.append(node('p',step===0?t('Bring the agent you have'):arriving?t(settled?'Everything came over':'Bringing everything over'):detecting?t('Finding apps on this Mac…'):t('Click one to leave it out.'),'setup-lede'));
  const content=node('div','','setup-content');panel.append(content);
  const nav=node('footer','','setup-footer');
  const status=node('div','','setup-status-slot');status.setAttribute('aria-live','polite');
  let primary:HTMLButtonElement,back:(()=>void)|null=null;
  if(arriving){
   const brought=draft.brought;
   // The Agent's card reads it while the person watches: its name, personality, what it knows about
   // them and its model each resolve in turn; until then they read as being read.
   const card=node('section','','setup-agent-card');card.classList.toggle('is-reading',!brought||!revealed());
   // Every render rebuilds the card; a negative delay keeps the sweep and shimmer running on one clock.
   const phase=(period:number)=>-(performance.now()%period)+'ms';
   const scan=node('span','','setup-agent-scan');scan.style.animationDelay=phase(1600);
   const portrait=node('div','','setup-agent-portrait');portrait.append(image(AGENT_ICONS[agentId]||'','setup-bring-icon'),scan);
   const kinds:string[]=brought?.kinds||[],known=(kind:string)=>kinds.includes(kind);
   const sheet=node('dl','','setup-agent-facts');
   // Each fact says in a few words what came over (owner request 2026-10-06), read from the Agent's own files.
   const summary=brought?.summary||{};
   const values:[string,string][]=[
    ['Name',brought?.name||draft.agentName||product],
    ['Personality',summary.personality||(known('soul')?t('Its own'):t('Fox’s own'))],
    ['About you',summary.about||(known('user')||known('longTerm')?t('What it knew'):t('Nothing yet'))],
    ['Model',brought?.model?(brought.modelName||summary.model||t('Its own')):summary.model&&(agentId==='codex'||brought?.energy==='chatgpt')?summary.model+' · '+t('Your ChatGPT plan'):agentId==='codex'||brought?.energy==='chatgpt'?t('Your ChatGPT plan'):brought?.energy==='none'?t('Choose one in Settings'):summary.model||t('Its own sign-in')]
   ];
   values.forEach(([label,value],i)=>{
    const row=node('div','','setup-agent-fact');row.append(node('dt',t(label)));
    const ready=!!brought&&i<facts;row.classList.toggle('is-read',ready);row.classList.toggle('is-fresh',ready&&i===fresh);
    const dd=ready?node('dd',value):node('dd',t('reading…'),'setup-fact-reading');if(ready)dd.title=value;if(!ready)dd.style.animationDelay=phase(1200);
    row.append(dd);sheet.append(row);
   });
   const about=node('div','','setup-agent-about');about.append(sheet);
   card.append(portrait,about);content.append(card);
   // What is happening scrolls upward like a scan (owner request 2026-10-06: no flashing), then says it moved in.
   const line=bringLine(draft.brought?.name||draft.agentName||agentId),done=settled;
   const moved=!!line&&line!==scanned[scanned.length-1];
   if(moved)scanned=[...scanned,line].slice(-4);
   const ticker=node('div','','setup-bring-ticker');ticker.classList.toggle('is-done',done);ticker.classList.toggle('is-empty',!line);
   const roll=node('div','','setup-bring-roll');roll.setAttribute('aria-hidden','true');if(moved&&scanned.length>1)roll.classList.add('is-rolling');
   scanned.forEach((text,i)=>roll.append(node('span',text,'setup-bring-line'+(i===scanned.length-1?' is-now':''))));
   // Screen readers hear the current line only.
   const spoken=node('span',line,'setup-visually-hidden');spoken.setAttribute('aria-live','polite');
   ticker.append(roll,spoken);content.append(ticker);
   primary=button('Continue',async()=>{clearTimeout(revealTimer);draft.apps=true;persist();},true);if(!brought||!revealed())primary.disabled=true;
   // Back keeps what came over, so coming back to the same Agent does not read it again.
   if(settled&&autoContinue){autoContinue=false;queueMicrotask(()=>{if(!disposed&&bringingPage())void run(async()=>{clearTimeout(revealTimer);draft.apps=true;persist();});});}
   if(!bringing)back=()=>{autoContinue=false;clearTimeout(revealTimer);delete draft.agent;delete draft.agentName;delete draft.apps;step=0;notice='';error='';persist();render();};
  }else if(step===1){
   // Two sections (owner request 2026-10-06): the apps found on this computer, then the popular starters
   // chosen for the person (the starter games arrive without being shown). One left out stays shown,
   // unchecked, after a relaunch so it can come back.
   const gallery=node('div','','setup-gallery');gallery.setAttribute('role','region');gallery.setAttribute('aria-label',t('Choose your apps'));
   const popular=detecting?[]:supportedApps().filter(a=>!detected.has(a.key)&&(selected.has(a.id)||touched.has(a.id))&&a.region!=='health');
   for(const [title,list,cls] of [['Apps on your computer',shownApps,'is-found'],['Apps that are popular',popular,'is-popular']] as [string,typeof shownApps,string][]){
    if(!list.length)continue;
    const section=node('section','','setup-app-section '+cls);section.append(node('h2',t(title),'setup-group-title'));
    const apps=node('div','','setup-apps');for(const app of list)apps.append(appTile(app));
    section.append(apps);gallery.append(section);
   }
   content.append(gallery);
   primary=button(entering?'Entering your World…':'Enter my World',async()=>{entering=true;render();try{await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));await finish();}finally{entering=false;}},true);
   primary.classList.add('setup-enter');primary.classList.toggle('is-loading',entering);primary.setAttribute('aria-busy',String(entering));
   // Back to the Agent brought in; Google has nothing to go back to.
   if(typeof draft.agent==='string')back=()=>{draft.apps=false;persist();render();};
   else if(draft.ownModel===true)back=()=>{delete draft.ownModel;step=0;persist();render();};
   else if(typeof draft.remoteAgent==='string')back=()=>{delete draft.remoteAgent;step=0;persist();render();};
  }else{
   const signIn=async(mock=false)=>{
    signingIn=true;googleStage=mock?'preparing':googleSignInStart(state);googleUrl=undefined;notice='';render();
    try{
     let failure:unknown;
     try{await call('connect',{provider:'google',region:'home',...mock?{mock:true}:{}});}catch(e){failure=e;}
     // A post-authorization reply can fail after both grants were saved.
     // Never ask for consent again when the host already confirms the grants.
     try{state=await call('snapshot');}catch(e){if(!connected())throw failure||e;}
     if(!connected())throw failure||Error('Sign-in wasn’t completed. Please try again.');
     advanceAfterGoogle();
    }finally{signingIn=false;}
   };
   // Two kinds of way in (owner request 2026-10-04): bring your local agent, the default, or bring your
   // cloud agent (Google and ChatGPT, coming soon). Each local Agent shows its own name; ones not on
   // this computer stay listed, greyed, so people know they are supported.
   const list=node('div','','setup-signin');list.setAttribute('role','group');list.setAttribute('aria-label',t('Ways to continue'));
   // Installing Hermes Agent and signing in take the cloud agents' room, so the page still fits without scrolling.
   if(hermesSetup!=='idle'&&!agents.length&&!detectingAgents&&!remoteForm)list.classList.add('is-hermes-setup');
   const group=(title:string,cls:string)=>{const g=node('section','','setup-signin-group '+cls);g.append(node('h2',t(title),'setup-signin-heading'));list.append(g);return g;};
   const option=(into:HTMLElement,label:string,icon:string,tag='')=>{
    const b=button(label,async()=>{});b.classList.add('setup-signin-option');b.prepend(image(icon,'setup-signin-icon'));b.disabled=true;
    if(tag)b.append(node('span',t(tag),'setup-signin-tag'));
    into.append(b);return b;
   };
   const local=group(remoteForm?'Your agent on another computer':'Bring your local agent','is-existing');{const heading=local.firstElementChild!,head=node('div','','setup-signin-head');heading.replaceWith(head);head.append(heading,remoteToggle());}
   if(remoteForm)list.classList.add('is-remote-form');
   // One square tile per supported Agent (owner request 2026-10-05): clicking one picks it, and the
   // picked one is forest; found ones first, in AGENT_PRIORITY order.
   const tiles=node('div','','setup-agent-grid');local.append(tiles);
   const rank=(id:string)=>(agents.some(a=>a.id===id)?0:10)+AGENT_PRIORITY.indexOf(id);
   // Codex alone is no Agent for Fox (owner decision 2026-10-09 11:51 PDT), so it has no tile.
   for(const harness of LOCAL_HARNESSES.filter(item=>item.id!=='codex').sort((x,y)=>rank(x.id)-rank(y.id))){
    const found=agents.find(a=>a.id===harness.id),title=found?.title||harness.title,connecting=connectingAgent===harness.id,chosen=harness.id===picked&&!!found;
    // Its own name first, then where it comes from and what comes along (two facts fit a tile).
    const history=found?.memory?.history,parts:string[]=[];
    if(found?.memory?.name)parts.push(title);
    if(history?.conversations)parts.push(t('{count} conversations').replace('{count}',String(history.conversations)));
    if(history?.notes)parts.push(t('{count} notes').replace('{count}',String(history.notes)));
    if(found&&!parts.length)parts.push(t(found.memory?'Its memory comes along':'On this computer'));
    const row=node('button','','setup-signin-option setup-agent-button setup-agent-tile') as HTMLButtonElement;row.type='button';row.dataset.agent=harness.id;
    row.disabled=busy||!found||signingIn||!!connectingAgent;row.setAttribute('aria-pressed',String(chosen));
    row.onclick=()=>{picked=harness.id;error='';render();};
    const text=node('span','','setup-agent-text');text.append(node('strong',found?agentName(found):title),node('small',connecting?agentText('Connecting to {agent}…',title):found?parts.slice(0,2).join(' · '):detectingAgents?'':t('Not on this computer')));
    row.append(image(AGENT_ICONS[harness.id],'setup-signin-icon'),text);
    if(found?.worldTools===false&&!connecting)row.append(node('span',t('Chat only'),'setup-signin-tag'));
    row.setAttribute('aria-label',title);
    if(!found&&!detectingAgents)row.title=agentText('{agent} isn’t installed on this computer.',title);
    else if(found?.worldTools===false)row.title=agentText('With {agent}, Fox can talk with you but can’t act in your world yet.',title);
    row.classList.toggle('setup-agent-default',chosen);row.classList.toggle('is-connecting',connecting);row.classList.toggle('is-missing',!found&&!detectingAgents);
    tiles.append(row);
   }
   // Worldlet provides no model of its own (owner request 2026-10-05): Fox runs only on an Agent on this computer,
   // so with none found, the page says what to install.
   // With none found there is no dead end (owner decisions 2026-10-07, 2026-10-09): Worldlet installs Hermes Agent.
   if(remoteForm)local.append(remoteAgent());
   else if(!detectingAgents&&!agents.length)local.append(noAgent());
   // Cloud agents are coming soon (owner request 2026-10-05): Google, then ChatGPT; Muse is gone. Google is greyed
   // for everyone, since a Google sign-in brings no model (only the development build's mock rehearses it).
   const cloud=group('Bring your cloud agent','is-new'),cloudRow=node('div','','setup-cloud-row');cloud.append(cloudRow);
   const go=option(cloudRow,signingIn?({connecting:'Connecting to Google…',browser:'Waiting for Google…'}[googleStage]||'Finishing setup…'):'Continue with Google','brands/google.png',signingIn?'':'Coming soon');go.classList.add('setup-google-button');go.classList.toggle('is-connecting',signingIn);
   option(cloudRow,'Continue with ChatGPT',appLogoSource({key:'chatgpt'})||'','Coming soon').classList.add('setup-chatgpt-button');
   // Development builds only: rehearse onboarding with a fictional Google account.
   // It keeps its room while signing in, so nothing on the page moves (owner feedback 2026-10-02).
   if(state.mockGoogleAvailable===true){const mock=button('Use mock Google (Dev)',()=>signIn(true));mock.className='setup-link setup-mock-google';if(signingIn){mock.disabled=true;mock.style.visibility='hidden';mock.setAttribute('aria-hidden','true');}cloud.append(mock);}
   const help=node('p','','setup-google-help');
   // Browser steps only while consent is actually open; the fixed-height line stays empty while connecting.
   if(signingIn&&googleStage==='browser'){help.append(document.createTextNode(t('Continue in your browser.')));help.append(document.createElement('br'));help.append(document.createTextNode(t('If prompted: ')));help.append(node('strong','Advanced → Go to Worldlet (unsafe)'));}
   else if(signingIn&&googleStage!=='connecting')help.textContent=t(googleStage==='preparing'?'Google authorized. Preparing Fox in the background…':'Checking Mail and Calendar access…');
   cloud.append(help);
   // Cancel, the browser fallbacks and feedback share one fixed slot, so nothing moves.
   const slot=node('div','','setup-cancel-slot');slot.setAttribute('aria-live','polite');
   if(signingIn){
    // The browser never came up (owner meetings 2026-10-02/03): open the same consent page again, or copy it.
    if(googleStage==='browser'&&googleUrl){
     const fallback=googleConsentActions(googleUrl,call),link=(label:string,fn:(b:HTMLButtonElement)=>void)=>{const b=node('button',t(label),'setup-link setup-consent') as HTMLButtonElement;b.type='button';b.onclick=()=>fn(b);slot.append(b);};
     link('Open again',()=>void fallback.open().catch(()=>{}));
     link('Copy link',b=>void fallback.copy().then(()=>{b.textContent=t('Link copied');},()=>{}));
    }
    const cancel=node('button',t('Cancel sign-in'),'setup-link setup-cancel') as HTMLButtonElement;cancel.type='button';cancel.onclick=()=>void call('connectCancel').catch(()=>{});slot.append(cancel);
   }else if((error||notice)&&!remoteForm){const feedback=node('p',t(error||notice),'setup-note');if(error)feedback.setAttribute('role','alert');slot.append(feedback);}
   cloud.append(slot);
   content.append(list);
   // The one Continue brings the picked Agent (owner request 2026-10-06).
   const going=connectingAgent?agents.find(a=>a.id===connectingAgent):null;
   // With no Agent here, installing Hermes Agent and then signing in to ChatGPT in it is the page's one button.
   if(remoteForm){primary=button(pairingRemote?'Connecting to your other computer…':'Connect',pairRemote,true);primary.classList.toggle('is-loading',pairingRemote);if(!remoteCode.trim()||pairingRemote||signingIn)primary.disabled=true;}
   else if(!detectingAgents&&!agents.length&&!connectingAgent){
    const working=hermesSetup==='installing'||hermesSetup==='signing-in';
    primary=button(hermesSetup==='installing'?'Installing Hermes Agent…':hermesSetup==='signing-in'?'Waiting for ChatGPT…':hermesSetup==='installed'?'Sign in with ChatGPT':'Install Hermes Agent',hermesSetup==='installed'?signInHermes:installHermes,true);
    primary.classList.toggle('is-loading',working);if(working||signingIn)primary.disabled=true;
   }
   else{
    primary=button(going?agentText('Connecting to {agent}…',going.title):'Continue',()=>chooseAgent(picked),true);
    primary.classList.toggle('is-loading',!!going);if(!picked||!agents.some(a=>a.id===picked)||signingIn)primary.disabled=true;
   }
  }
  primary.classList.add('setup-next');
  if(step===1&&(error||notice))status.append(node('p',t(error||notice),error?'setup-error':'setup-note'));
  // Back keeps its room on every page, so the big button never moves.
  const backButton=node('button',t('Back'),'setup-link setup-back') as HTMLButtonElement;backButton.type='button';
  if(back){backButton.disabled=busy;backButton.onclick=back;}else{backButton.style.visibility='hidden';backButton.setAttribute('aria-hidden','true');backButton.tabIndex=-1;}
  nav.append(status,primary,backButton);
  panel.append(nav);
  // No page scrolls (owner request 2026-10-06): the apps page tightens its tiles step by step until they fit.
  if(content.querySelector('.setup-gallery'))fitApps(content);
  if(arriving&&!draft.brought&&!bringing)queueMicrotask(()=>void bringIn());
 }
 // A relaunch on the second page shows what already came over.
 shown=scanTotal();if(draft.brought)facts=FACTS;
 setInterfaceLanguage(draft.language);render();
 // Hosts without local Agent support answer with an error or nothing; Google stays the only way in.
 function detectAgents(){
 detectingAgents=true;
 return Promise.resolve().then(()=>call('agentHarness',{operation:'detect'})).then(result=>{
  if(disposed)return;
  const found=Array.isArray(result?.agents)?result.agents.filter(a=>typeof a?.id==='string'&&typeof a?.title==='string'&&a.id!=='codex'):[];
  // A choice the host no longer has (removed, or reset) returns to the first page.
  if(typeof draft.agent==='string'&&result?.selected!==draft.agent){delete draft.agent;delete draft.apps;persist();if(step===1&&!connected()){step=0;}}
  else if(typeof result?.selected==='string'&&step===0&&found.some(a=>a.id===result.selected)){draft.agent=result.selected;draft.agentName=agentName(found.find(a=>a.id===result.selected));step=1;persist();}
  // A pairing with another computer that ended (unpaired there) returns to the first page too.
  if(typeof draft.remoteAgent==='string'&&!result?.remote){delete draft.remoteAgent;persist();if(step===1&&!ready())step=0;}
  agents=found;detectingAgents=false;
  picked=AGENT_PRIORITY.find(id=>found.some(a=>a.id===id))||found[0]?.id||null;
  // Only when the first page is what the person sees: how many supported Agents are here, and the one picked for them.
  if(step===0)productEvent('local_agents_detected',agentsDetectedDimensions(found,picked));
  if(!busy)render();
  return connectRequested();
 }).catch(()=>{detectingAgents=false;if(!disposed&&!busy)render();});
 }
 /** The Agent a `--connect=<id>` launch named, handed over once by the host; Core decides what setup does with it. */
 async function connectRequested(){
  const asked=await call('agentHarness',{operation:'requested'}).catch(()=>null);
  if(disposed)return;
  const plan=connectRequestPlan(asked?.id,{firstPage:step===0,found:agents,busy:busy||signingIn||!!connectingAgent||pairingRemote||hermesSetup==='installing'||hermesSetup==='signing-in'});
  if(!plan.pick)return;
  picked=plan.pick;remoteForm=false;
  if(plan.select){autoContinue=true;void run(async()=>{try{await chooseAgent(plan.pick);}catch(e){autoContinue=false;throw e;}});return;}
  if(plan.missing)error=agentText('{agent} isn’t installed on this computer.',LOCAL_HARNESSES.find(h=>h.id===plan.pick)?.title||plan.pick);
  if(!busy)render();
 }
 void detectAgents();
 if(step===1)void prepareGoogleSources();
 const seed=()=>{seedAppletSelection(WORLD_APPS.filter(a=>appletSupport(a.key,hostFeatures(state)).supported),detected,selected,touched);persist();};
 if(hostFeatures(state).installedAppDetection){
  void call('installedApplets').then(result=>{
   if(disposed)return;detected=new Set(result.keys||[]);nativeIcons=result.icons||{};
   seed();detecting=false;if(step===1&&!busy)render();
  }).catch(()=>{detecting=false;seed();if(step===1&&!busy)render();});

 }else {detecting=false;seed();render();}
 return {update(next){state=next;if(disposed)return;if(advanceAfterGoogle()){render();return;}if(!busy&&step===1&&!ready()){step=0;render();}}};
}
