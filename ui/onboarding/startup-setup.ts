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
// The name the big button gives an Agent without a name of its own: "Give Hermes a world".
const AGENT_SHORT:Record<string,string>={hermes:'Hermes',openclaw:'OpenClaw',pi:'pi',codex:'Codex','claude-code':'Claude Code'};
// The page picks one local Agent for the person, in this order (owner request 2026-10-06): Hermes, OpenClaw and pi
// first, then Codex, then Claude Code.
const AGENT_PRIORITY=['hermes','openclaw','pi','codex','claude-code'];
const node=(tag:string,text='',cls='')=>{const e=document.createElement(tag);e.textContent=text;e.className=cls;return e;};
/** First-use setup lives on the loading curtain, as one page (owner request 2026-10-09): the brand on top, the Agents
 * found here as cards, every other way in folded under More options, and one big "Give {agent} a world". Choosing
 * brings the Agent in on the same page: its card moves left while what comes along appears on the right, tile by tile,
 * and the button becomes "Enter your world". No model turn or source read gates entry. */
/** `move`: someone who used Fox's own Hermes chooses the Agent Fox runs on from now on (owner decisions 2026-10-09: no
 * built-in Hermes); the same page, and Enter your world returns to the World as it was. */
export function mountStartupSetup({state:initial,call,complete,move=false}:{state:any,call:any,complete:(next:any,icons?:Record<string,string>)=>Promise<void>,move?:boolean}){
 let state=initial,step=0,busy=false,disposed=false,error='',notice='',signingIn=false,entering=false;
 // Agents already on this computer (Claude Code, Codex, …): choosing one replaces Google sign-in.
 // Each Agent here reports whether it has a name, memory or history Fox can bring (never its text).
 let agents:{id:string,title:string,worldTools?:boolean,model?:boolean,memory?:{name:string|null,user:boolean,longTerm:boolean,model?:boolean,history?:{conversations:number,notes:number,skills:number,jobs:number}},version?:{current:string|null,minimum:string,outdated:boolean,update:boolean,howTo:string}}[]=[],detectingAgents=true,connectingAgent:string|null=null,updatingAgent:string|null=null;
 // The local Agent picked: the first found in AGENT_PRIORITY until the person picks another; the big button brings it.
 let picked:string|null=null;
 // More options (owner request 2026-10-09): the Agents not on this computer, Google and ChatGPT (coming soon), an Agent
 // on another computer and an API key, folded under the cards.
 let more=false;
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
 // Bringing the chosen Agent in: `shownTiles` paces the tiles on the right, one at a time; `chatter` turns the
 // waiting tile's line while the host is still copying.
 let bringing=false,porting=false,chatter=0,chatterTimer=0,shownTiles=0,revealTimer=0;
 // Where the chosen card was, so its card can travel from there to the left (owner request 2026-10-09).
 let flipFrom:DOMRect|null=null;
 // Elements kept across renders, so a tile that already arrived is not drawn arriving again.
 const kept=new Map<string,{sig:string,el:HTMLElement}>();
 const keep=(key:string,sig:string,build:()=>HTMLElement)=>{const old=kept.get(key);if(old&&old.sig===sig)return old.el;const el=build();el.dataset.key=key;kept.set(key,{sig,el});return el;};
 // 'connecting' until the host says it opened Google consent: a reused grant opens no browser.
 let googleStage:string='connecting',googleUrl:string|undefined;
 const onGoogleStage=(event:Event)=>{const detail=(event as CustomEvent).detail,stage=googleSignInStage(detail);if(disposed||!signingIn||!stage)return;googleStage=stage;googleUrl=googleConsentUrl(detail);render();};
 window.addEventListener(GOOGLE_SIGN_IN_EVENT,onGoogleStage);
 // An install script launched Worldlet with `--connect=<id>` (core/agent/PORTABILITY.md#local-harnesses-chosen-at-setup):
 // that Agent is picked and brought in as the big button would. Launched again while setup is open, the host says so
 // and setup looks again.
 const onConnectRequest=()=>{if(!disposed)void detectAgents();};
 window.addEventListener('worldlet:connect-agent',onConnectRequest);
 const languages=['en','zh','ja','es'];
 const systemLanguage=navigator.language.split('-')[0];
 const key=(move?'worldlet-agent-move:':'worldlet-startup-setup:')+state.workspaceId;
 let draft:any={step:0,language:languages.includes(systemLanguage)?systemLanguage:'en',applets:['app-gmail','app-google-calendar','app-browser'],touched:[],consent:true};
 try{const saved=JSON.parse(localStorage.getItem(key)||'null');if(saved&&Array.isArray(saved.applets))draft={...draft,...saved};}catch{}
 // Resume from account facts (or the chosen local Agent), not old draft indices.
 step=typeof draft.agent==='string'||draft.ownModel===true||typeof draft.remoteAgent==='string'||!move&&['gmail','google-calendar'].every(provider=>state.connections?.some(c=>c.provider===provider&&connectionLive(c)))?1:0;
 const selected=new Set<string>(draft.applets.filter(id=>WORLD_APPS.some(a=>a.id===id)));
 let detected=new Set<string>(),nativeIcons:Record<string,string>={},detecting=true;
 const t=(text:string)=>setupText(text,draft.language);
 const touched=new Set<string>(draft.touched||[]);
 const loader=document.getElementById('worldStartup');
 const panel=node('section','','startup-setup');panel.setAttribute('aria-label','Set up your world');
 // The brand signs the top of the page (owner request 2026-10-09); Fox waits for the World.
 const brand=loader.querySelector('.startup-brand');
 if(brand)brand.after(panel);else loader.append(panel);
 loader.classList.add('has-setup');loader.setAttribute('role','region');loader.setAttribute('aria-busy','false');
 // The World this Agent is about to get, painted softly behind the page.
 const painting=(globalThis as any).__WORLDLET_25D_ASSETS__?.surroundings;
 if(typeof painting==='string')loader.style.setProperty('--setup-world','url("'+painting.replace(/"/g,'%22')+'")');
 document.dispatchEvent(new Event('worldlet:setup-start'));
 window.dispatchEvent(new CustomEvent('worldlet:product-event',{detail:'onboarding_started'}));
 if(step===1)window.dispatchEvent(new CustomEvent('worldlet:product-event',{detail:'onboarding_apps_viewed'}));
 const persist=()=>localStorage.setItem(key,JSON.stringify({...draft,step,applets:[...selected],touched:[...touched]}));
 // Moving to an Agent is about the Agent alone: a Google connection the World already has does not stand in for one.
 const connected=()=>!move&&['gmail','google-calendar'].every(provider=>state.connections?.some(c=>c.provider===provider&&connectionLive(c)));
 // Google, a chosen local Agent, an API key or an Agent on another computer opens the second half of the page.
 const ready=()=>connected()||typeof draft.agent==='string'||draft.ownModel===true||typeof draft.remoteAgent==='string';
 const agentText=(text:string,agent:string)=>t(text).replace('{agent}',agent);
 // Setup's product events (core/diagnostics/ANALYTICS.md#bringing-an-agent): allowlisted dimensions, a duration bucket.
 const productEvent=(event:string,dimensions:Record<string,string>={},duration='')=>window.dispatchEvent(new CustomEvent('worldlet:product-event',{detail:{event,dimensions,duration}}));
 const failureCode=(error:any)=>{try{return String(diagnosticError({message:typeof error?.message==='string'?error.message:''}).code);}catch{return 'operationFailed';}};
 const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
 const importingAgent=()=>step===1&&typeof draft.agent==='string';
 // The Agent's own name where it has one (OpenClaw's Nova), else its product name.
 const agentName=(agent:{title:string,memory?:{name:string|null}})=>agent.memory?.name||agent.title;
 const giveName=(id:string|null)=>{const found=agents.find(a=>a.id===id);return found?.memory?.name||AGENT_SHORT[id||'']||found?.title||id||'';};
 /** The picked Agent when its version is older than Worldlet works with (core/agent/agent-versions.ts). */
 const outdated=(id:string|null)=>agents.find(a=>a.id===id&&a.version?.outdated===true)||null;
 async function updateAgent(agent:{id:string,title:string}){
  await call('agentHarness',{operation:'update',id:agent.id});
  updatingAgent=agent.id;notice=agentText('{agent} is updating in Terminal. When it is done, choose Check again.',giveName(agent.id));
 }
 async function chooseAgent(id:string|null){
  const agent=agents.find(a=>a.id===id);
  if(!agent)return;
  connectingAgent=agent.id;render();
  const started=performance.now();
  try{
   // The host proves the Agent answers before Fox uses it; a failure leaves the person on the first half.
   let chosen;
   try{chosen=await call('agentHarness',{operation:'select',id:agent.id,...move?{direct:true}:{}});}
   catch(e){productEvent('local_agent_select_failed',{local_agent:agent.id,error_code:failureCode(e)},timingBucket(performance.now()-started));throw e;}
   await call('foxPreferences',{cloudConsent:true});
   // Back then the same Agent again shows what already came over instead of reading it again (owner request
   // 2026-10-06); another Agent starts over.
   if(draft.broughtFrom!==agent.id||draft.brought?.failed){delete draft.brought;delete draft.integrations;delete draft.broughtFrom;shownTiles=0;}
   else shownTiles=99;
   flipFrom=panel.querySelector(`.setup-agent-card[data-agent="${CSS.escape(agent.id)}"]`)?.getBoundingClientRect()||null;
   notice='';draft.agent=agent.id;draft.agentName=agentName(agent);draft.connected=chosen?.connected===true;draft.consent=true;step=1;error='';persist();
   // fox_brain: the built-in Hermes Agent on a model Fox has, or the chosen Agent answering on its own sign-in.
   productEvent('local_agent_selected',{local_agent:agent.id,fox_brain:chosen?.model?'built_in':'agent'},timingBucket(performance.now()-started));
   window.dispatchEvent(new CustomEvent('worldlet:product-event',{detail:'onboarding_apps_viewed'}));
  }finally{connectingAgent=null;}
 }
 /** Copies the chosen Agent into Fox (`localAgent` `adopt`: name, memory, conversations, notes,
  * skills, routines), then ports the integrations it had (`agentIntegrations`). Bringing again
  * replaces what it brought last time, so a relaunch on this page simply runs it again. */
 async function bringIn(){
  const id=draft.agent;
  if(bringing||typeof id!=='string'||draft.brought)return;
  bringing=true;chatter=0;draft.broughtFrom=id;render();
  // While the host copies, the waiting tile's line turns every so often; Reduce Motion keeps the first one.
  if(!reduced())chatterTimer=window.setInterval(()=>{chatter++;if(!disposed&&!busy)render();},1100);
  const started=performance.now();
  try{
   const adopted=await call('localAgent',{operation:'adopt',id});
   // An Agent Fox talks through keeps its own history, so nothing is copied; the tiles count what it holds (detect).
   const own=agents.find(a=>a.id===id)?.memory?.history;
   const history=adopted?.history||(own?{conversations:own.conversations,notes:own.notes,skills:own.skills,routines:own.jobs}:{});
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
  }finally{bringing=false;}
  porting=true;persist();render();
  try{const result=await call('agentIntegrations',{operation:'port',id});draft.integrations=Array.isArray(result?.integrations)?result.integrations.filter(item=>typeof item?.title==='string'&&typeof item?.outcome==='string').slice(0,20):[];}
  catch{draft.integrations=[];}
  finally{
   porting=false;clearInterval(chatterTimer);persist();if(!disposed&&!busy)render();
   // Counts and outcomes only, once the whole bring (history and integrations) is over.
   if(!draft.brought.failed)productEvent('agent_bring_completed',agentBringDimensions(id,draft.brought,draft.integrations),timingBucket(performance.now()-started));
  }
 }
 // The apps the World starts with: those found on this computer first, then the starters chosen for the person.
 // Starter games arrive without being shown.
 const worldApps=()=>WORLD_APPS.filter(a=>selected.has(a.id)&&a.region!=='health'&&appletSupport(a.key,hostFeatures(state)).supported).sort((a,b)=>Number(detected.has(b.key))-Number(detected.has(a.key)));
 /** The tiles on the right, in the order they arrive (owner requests 2026-10-09): the avatar, its profile,
  * conversations, notes, skills and routines, the connections it had, then the apps. Every tile shows once the bring
  * is over, even when nothing came over (it then says None); the connections and apps wait until the integrations
  * were read, so arriving tiles only ever join the end. */
 function tiles():string[]{
  const list=['avatar'];
  if(importingAgent()){
   if(!draft.brought)return list;
   list.push('profile','conversations','notes','skills','routines');
   if(!porting)list.push('connections','apps');
   return list;
  }
  // Google brings Mail and Calendar; an API key or an Agent on another computer brings only the World.
  if(connected()&&typeof draft.remoteAgent!=='string'&&draft.ownModel!==true)list.push('connections');
  return detecting?list:[...list,'apps'];
 }
 const settled=()=>!importingAgent()||(!!draft.brought&&!bringing&&!porting&&shownTiles>=tiles().length);
 // One tile at a time; with Reduce Motion, all at once.
 function reveal(){
  clearTimeout(revealTimer);
  const total=tiles().length;
  if(shownTiles>=total||reduced())return;
  revealTimer=window.setTimeout(()=>{shownTiles++;if(!disposed&&!busy)render();},shownTiles===0?200:280);
 }
 /** The no-Agent card's line: what Worldlet does, the installer's step while it runs, then the ChatGPT sign-in inside
  * Hermes (with the code its device page asks for); Check again looks for an Agent installed meanwhile. */
 function hermesPanel(){
  const box=node('div','','setup-agent-needed');box.setAttribute('aria-live','polite');
  const says={
   idle:'No agent found on this computer. Worldlet installs Hermes Agent for you the official way, then you sign in to ChatGPT inside it.',
   installing:'Installing Hermes Agent…',
   installed:'Hermes Agent is installed. Sign in to ChatGPT in it. To use another model, run hermes model in Terminal, then check again.',
   'signing-in':'Continue in your browser.'
  }[hermesSetup];
  const line=node('p',hermesSetup==='installing'&&hermesStep?hermesStep:t(says),'setup-note');
  if(hermesSetup==='signing-in'&&hermesCode){const code=node('span',' '+t('Enter this code: '),'setup-hermes-code');code.append(node('strong',hermesCode));line.append(code);}
  box.append(line);
  const link=(label:string,fn:()=>void)=>{const b=node('button',t(label),'setup-link') as HTMLButtonElement;b.type='button';b.onclick=fn;box.append(b);return b;};
  if(hermesSetup==='signing-in')link('Cancel sign-in',()=>void call('agentHarness',{operation:'cancel-sign-in'}).catch(()=>{}));
  else if(hermesSetup!=='installing')link('Check again',()=>{void detectAgents();render();}).disabled=busy;
  return box;
 }
 function remotePanel(){
  const box=node('div','','setup-form-panel setup-agent-remote');
  box.append(node('p',t('On that computer, open Worldlet, then Fox’s panel › Mobile › Pair another computer, and paste its code here.'),'setup-note'));
  const code=document.createElement('input');code.className='setup-remote-code';code.value=remoteCode;code.placeholder='worldlet://agent?…';code.spellcheck=false;code.autocomplete='off';code.setAttribute('aria-label',t('Code from your other computer'));code.disabled=pairingRemote;
  code.oninput=()=>{remoteCode=code.value;const next=document.querySelector('.startup-setup .setup-next') as HTMLButtonElement|null;if(next)next.disabled=!remoteCode.trim()||pairingRemote;};
  box.append(code);
  if(error){const feedback=node('p',t(error),'setup-error setup-key-error');feedback.setAttribute('role','alert');box.append(feedback);}
  const back=node('button',t('Use an agent on this computer'),'setup-link') as HTMLButtonElement;back.type='button';back.disabled=pairingRemote;back.onclick=()=>{remoteForm=false;error='';render();};
  box.append(back);
  return box;
 }
 async function pairRemote(){
  pairingRemote=true;render();
  try{
   const result=await call('agentHarness',{operation:'pair',link:remoteCode.trim()});
   await call('foxPreferences',{cloudConsent:true});
   remoteForm=false;remoteCode='';draft.remoteAgent=String(result?.remote?.computer||'');draft.consent=true;delete draft.agent;notice='';step=1;shownTiles=0;persist();
   window.dispatchEvent(new CustomEvent('worldlet:product-event',{detail:'onboarding_apps_viewed'}));
  }finally{pairingRemote=false;}
 }
 /** Installs Hermes Agent the official way (to its default location; nothing when one is already here). */
 async function installHermes(){
  hermesSetup='installing';hermesStep='';render();
  try{await call('agentHarness',{operation:'install-hermes'});hermesSetup='installed';}
  catch(e){hermesSetup='idle';throw e;}
 }
 /** ChatGPT signed in inside Hermes Agent, then Hermes moves in like any Agent found here. */
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
   // Native store owns the task and streams findings while setup stays usable.
   await call('onboarding',{operation:'checkMail'});
  })().catch(()=>{sourcePreparation=null;});
  return sourcePreparation;
 }
 // Native connection receipts are authoritative even if the original bridge
 // reply was lost while switching out to the browser or refreshing the page.
 function advanceAfterGoogle(){
  if(step!==0||!connected())return false;
  draft.consent=true;selected.add('app-gmail');selected.add('app-google-calendar');
  step=1;error='';notice='';shownTiles=0;persist();void prepareGoogleSources();
  window.dispatchEvent(new CustomEvent('worldlet:product-event',{detail:'onboarding_apps_viewed'}));
  return true;
 }
 async function finish(){
  if(!ready())throw Error('Connect Google to enter your world.');
  if(move){
   const snapshot=await call('snapshot');
   localStorage.removeItem(key);disposed=true;clearTimeout(revealTimer);clearInterval(chatterTimer);window.removeEventListener(GOOGLE_SIGN_IN_EVENT,onGoogleStage);window.removeEventListener('worldlet:connect-agent',onConnectRequest);window.removeEventListener('worldlet:hermes-setup',onHermesSetup);
   loader.classList.add('setup-entering');
   document.dispatchEvent(new Event('worldlet:setup-complete'));
   await complete(snapshot);
   return;
  }
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
  // Every chosen app gathers: an icon shown in the Apps tile flies from its place, the rest come in from the middle.
  const shelf=panel.querySelector('.setup-tile-apps');
  const iconsToGather=WORLD_APPS.filter(a=>selected.has(a.id)).map(app=>{
   const shown=panel.querySelector<HTMLImageElement>('.setup-app[data-applet-id="'+CSS.escape(app.id)+'"] .setup-app-logo');
   const img=shown||image(appIcon(app),'setup-app-logo');img.dataset.appletId=app.id;return img;
  });
  const still=reduced();
  const tile=(shelf||panel).getBoundingClientRect();
  const flights=iconsToGather.map((img,i)=>{
   const r=img.getBoundingClientRect(),copy=img.cloneNode() as HTMLImageElement;gathering.append(copy);
   const visible=img.isConnected&&r.width>0&&r.top>=tile.top&&r.bottom<=tile.bottom;
   const x=visible?r.left+r.width/2:innerWidth/2,y=visible?r.top+r.height/2:innerHeight*.5;
   const columns=Math.min(6,iconsToGather.length),rows=Math.ceil(iconsToGather.length/columns),spacing=Math.min(140,(innerWidth-80)/columns,(innerHeight-140)/rows);
   const targetX=innerWidth*.5+((i%columns)-(columns-1)/2)*spacing,targetY=innerHeight*.45+(Math.floor(i/columns)-(rows-1)/2)*spacing;
   return copy.animate([{left:x+'px',top:y+'px',opacity:visible?1:0,transform:'translate(-50%,-50%) scale(1)'},{left:targetX+'px',top:targetY+'px',opacity:1,transform:'translate(-50%,-50%) scale(.85)'}],{duration:still?0:650,easing:'cubic-bezier(.22,.7,.2,1)',fill:'forwards'}).finished;
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
   const duration=still?0:650,delay=still?0:i*140;
   await Promise.all([
    logo.animate([{opacity:1,filter:'brightness(1)'},{opacity:.6,filter:'brightness(2)',offset:.35},{opacity:0,filter:'brightness(1)'}],{duration,delay,fill:'forwards'}).finished,
    device.animate([{opacity:0,transform:'translate(-50%,-50%) scale(.45)',filter:'brightness(2) drop-shadow(0 0 12px #ffe4a0)'},{opacity:1,transform:'translate(-50%,-50%) scale(1)',offset:.7},{opacity:1,transform:'translate(-50%,-50%) scale(1)',filter:'brightness(1) drop-shadow(0 3px 5px #35453025)'}],{duration,delay,fill:'forwards'}).finished
   ]);logo.remove();
  }));
  gathering.id='setupArrivingDevices';document.body.append(gathering);
  localStorage.removeItem(key);disposed=true;clearTimeout(revealTimer);clearInterval(chatterTimer);window.removeEventListener(GOOGLE_SIGN_IN_EVENT,onGoogleStage);window.removeEventListener('worldlet:connect-agent',onConnectRequest);window.removeEventListener('worldlet:hermes-setup',onHermesSetup);
  // Keep the final setup surface until the first world frame is ready.
  loader.classList.add('setup-entering');
  document.dispatchEvent(new Event('worldlet:setup-complete'));
  const icons=Object.fromEntries(WORLD_APPS.filter(a=>selected.has(a.id)).map(a=>[a.id,nativeIcons[a.key]||appLogoSource(a)||coreAppletSource(CORE_APPLET_KINDS[a.key]||'calendar')]));
  await complete(snapshot,icons);
  // Native scheduler owns ongoing Mail/Calendar checks. Do not wait for inference.
 }
 // An integration's mark: its Applet's icon when Worldlet has that app, else its brand logo, else none (its name shows).
 const logoOf=(provider:unknown)=>{if(typeof provider!=='string')return '';const app=WORLD_APPS.find(a=>a.key===provider);return app?appIcon(app):appLogoSource({key:provider})||'';};
 function appIcon(app){return nativeIcons[app.key]||(app.key==='x'?xAppIcon:appLogoSource(app))||coreAppletSource(CORE_APPLET_KINDS[app.key]||'calendar');}
 function image(src:string,cls=''){const img=document.createElement('img');img.src=src;img.alt='';img.className=cls;return img;}
 const count=(text:string,n:number)=>t(text).replace('{count}',String(n));
 // The waiting tile's line while the host still copies (owner request 2026-10-06: what is happening, in a few words).
 function bringLine(name:string){
  if(porting)return t('Checking its connections…');
  const lines=['Reading {agent}’s memory…','Packing up {agent}’s conversations…','Folding in {agent}’s notes…','Teaching Fox {agent}’s skills…'];
  return agentText(lines[chatter%lines.length],name);
 }
 /** Choose again (owner request 2026-10-09: on the chosen card, instead of a Back button): what came over is kept,
  * so coming back to the same Agent does not read it again. Google has nothing to choose again. */
 const canChooseAgain=()=>step===1&&!entering&&(importingAgent()?!bringing&&!porting:draft.ownModel===true||typeof draft.remoteAgent==='string');
 function chooseAgain(){
  if(!canChooseAgain()||busy)return;
  clearTimeout(revealTimer);
  if(importingAgent()){delete draft.agent;delete draft.agentName;}
  delete draft.ownModel;delete draft.remoteAgent;
  step=0;notice='';error='';persist();render();
 }
 /** The chosen Agent on the left: its mark, its own name, and where it comes from. */
 function passport(){
  const agentId=draft.agent as string,brought=draft.brought,found=agents.find(a=>a.id===agentId);
  let icon='',name='',from='',rows:[string,string][]=[];
  if(importingAgent()){
   const product=found?.title||LOCAL_HARNESSES.find(h=>h.id===agentId)?.title||agentId;
   icon=AGENT_ICONS[agentId]||'';name=brought?.name||draft.agentName||product;from=name!==product?product:'';
   // The Agent keeps its own model, so the card shows none (owner request 2026-10-09).
   if(found?.worldTools===false)rows.push(['World tools',t('Chat only')]);
  }else if(draft.ownModel===true){
   icon=AGENT_ICONS.hermes;name='Hermes Agent';from=t('Set up by Worldlet');
   if(draft.ownModelName)rows.push(['Model',[draft.ownModelName,draft.ownProvider].filter(Boolean).join(' · ')]);
  }else if(typeof draft.remoteAgent==='string'){
   icon='brand/worldlet-mark.svg';name=t('Your agent');from=draft.remoteAgent?agentText('On {agent}',draft.remoteAgent):t('On your other computer');
  }else{
   icon='brands/google.png';name='Google';from=t('Your Google account');
  }
  const again=canChooseAgain();
  return keep('passport',JSON.stringify([icon,name,from,rows,again,draft.language]),()=>{
   const card=node('section','','setup-passport');card.setAttribute('aria-label',name);
   const mark=node('div','','setup-passport-mark');mark.append(image(icon,'setup-passport-icon'));
   card.append(mark,node('h2',name,'setup-passport-name'));
   if(from)card.append(node('p',from,'setup-passport-from'));
   if(rows.length){const facts=node('dl','','setup-passport-facts');for(const [label,value] of rows){const row=node('div','','setup-agent-fact');row.append(node('dt',t(label)),node('dd',value));row.title=value;facts.append(row);}card.append(facts);}
   if(again){const link=node('button',t('Choose again'),'setup-link setup-choose-again') as HTMLButtonElement;link.type='button';link.onclick=chooseAgain;card.append(link);}
   return card;
  });
 }
 /** One tile on the right. */
 function tile(kind:string,fresh:boolean){
  const brought=draft.brought||{},summary=brought.summary||{};
  const build=(title:string,cls:string,fill:(el:HTMLElement)=>void)=>()=>{
   const el=node('article','','setup-tile setup-tile-'+kind+' '+cls);
   // Arrives once: a later render re-inserts the same tile, which would replay the entrance and make every tile flash.
   if(fresh&&!reduced()){el.classList.add('is-arriving');el.addEventListener('animationend',()=>el.classList.remove('is-arriving'),{once:true});}
   el.append(node('h3',t(title),'setup-tile-title'));fill(el);
   const done=node('span','','setup-tile-done');done.setAttribute('aria-hidden','true');el.append(done);
   return el;
  };
  // Nothing of that kind came over: the tile stays, muted, and says None.
  const none=(el:HTMLElement)=>{el.classList.add('is-empty');el.append(node('p',t('None'),'setup-tile-none'));};
  const big=(n:number,label:string)=>(el:HTMLElement)=>{if(!n)return none(el);el.append(node('strong',String(n),'setup-tile-count'),node('p',t(label),'setup-tile-note'));};
  if(kind==='avatar')return keep('tile:avatar',draft.language,build('Avatar','is-tall',el=>{el.append(node('p',t('Fox, by default'),'setup-tile-note'));const fox=image('assets/fox-startup.png','setup-tile-fox');el.append(fox);}));
  if(kind==='profile'){
   const sig=JSON.stringify([brought.name,summary.personality,summary.about,draft.language]);
   return keep('tile:profile',sig,build('Profile','is-wide',el=>{
    if(!brought.name&&!summary.personality&&!summary.about)return none(el);
    if(summary.personality)el.append(node('q',summary.personality,'setup-tile-quote'));
    else if(brought.name)el.append(node('p',brought.name,'setup-tile-lead'));
    if(summary.about)el.append(node('p',t('Knows: ')+summary.about,'setup-tile-note'));
   }));
  }
  if(kind==='conversations'){
   const titles=(brought.list||[]).slice(0,4).map(item=>item.title);
   return keep('tile:conversations',JSON.stringify([brought.conversations,titles,draft.language]),build('Conversations','is-big',el=>{
    if(!brought.conversations)return none(el);
    el.append(node('strong',String(brought.conversations),'setup-tile-count'));
    const list=node('ul','','setup-tile-titles');for(const title of titles)list.append(node('li',title));el.append(list);
   }));
  }
  if(kind==='notes')return keep('tile:notes',String(brought.notes)+draft.language,build('Notes','',big(brought.notes,'notes')));
  if(kind==='skills')return keep('tile:skills',String(brought.skills)+draft.language,build('Skills','',big(brought.skills,'skills it learned')));
  if(kind==='routines')return keep('tile:routines',String(brought.routines)+draft.language,build('Routines','',big(brought.routines,'run on their own')));
  if(kind==='connections'){
   const items:{title:string,logo:string,again:boolean}[]=importingAgent()
    ?(draft.integrations||[]).filter(item=>item.outcome!=='stays').map(item=>({title:item.title,logo:item.provider==='google'?'brands/google.png':logoOf(item.provider),again:item.outcome==='reconnect'}))
    :[{title:'Gmail',logo:logoOf('gmail'),again:false},{title:'Google Calendar',logo:logoOf('google-calendar'),again:false}];
   return keep('tile:connections',JSON.stringify([items,draft.language]),build('Connections','is-wide',el=>{
    if(!items.length)return none(el);
    const row=node('div','','setup-tile-logos');
    for(const item of items){const mark=item.logo?image(item.logo,'setup-tile-logo'):node('span',item.title,'setup-tile-chip');mark.title=item.title+(item.again?' · '+t('Sign in again after setup'):'');row.append(mark);}
    el.append(row);
    const again=items.filter(item=>item.again).length;
    el.append(node('p',again?count('{count} to sign in again after setup',again):items.map(item=>item.title).join(' · '),'setup-tile-note'));
   }));
  }
  // The apps: the ones found here, then the starters; their icons fly into the World on Enter your world.
  const apps=worldApps(),found=apps.filter(a=>detected.has(a.key)).length,limit=14;
  return keep('tile:apps',JSON.stringify([apps.map(a=>a.id),found,Object.keys(nativeIcons).length,draft.language]),build('Apps','is-wide setup-tile-apps',el=>{
   const row=node('div','','setup-tile-logos');
   for(const app of apps.slice(0,limit)){const item=node('span','','setup-app');item.dataset.appletId=app.id;item.title=t(app.title);item.append(image(appIcon(app),'setup-app-logo'));row.append(item);}
   el.append(row,node('p',[count('{count} apps',apps.length),found?count('{count} found on this computer',found):''].filter(Boolean).join(' · '),'setup-tile-note'));
  }));
 }
 /** The Agents found here as cards, picked one first-class (owner request 2026-10-09). */
 function agentCards(){
  const cards=node('div','','setup-agent-cards');cards.setAttribute('role','group');cards.setAttribute('aria-label',t('Your agents'));
  const rank=(id:string)=>AGENT_PRIORITY.indexOf(id);
  for(const found of [...agents].sort((x,y)=>rank(x.id)-rank(y.id))){
   const harness=LOCAL_HARNESSES.find(h=>h.id===found.id),title=found.title||harness?.title||found.id,connecting=connectingAgent===found.id,chosen=found.id===picked;
   const card=node('button','','setup-agent-card setup-agent-button') as HTMLButtonElement;card.type='button';card.dataset.agent=found.id;
   card.disabled=busy||signingIn||!!connectingAgent;card.setAttribute('aria-pressed',String(chosen));card.setAttribute('aria-label',title);
   card.onclick=()=>{picked=found.id;error='';render();};
   card.classList.toggle('setup-agent-default',chosen);card.classList.toggle('is-connecting',connecting);
   card.append(image(AGENT_ICONS[found.id]||'','setup-agent-icon'),node('strong',agentName(found),'setup-agent-name'));
   // Where it comes from when it has its own name, else what it runs on.
   const sub=found.memory?.name?title:found.id==='codex'?t(found.model===false?'Sign in to Codex first':'Your ChatGPT plan'):t(found.memory?'Its memory comes along':'On this computer');
   // Older than Worldlet works with (core/agent/agent-versions.ts): the card says which version it needs.
   const old=found.version?.outdated===true;card.classList.toggle('is-outdated',old);
   card.append(node('small',connecting?agentText('Connecting to {agent}…',title):old?t('Needs version {version} or newer').replace('{version}',found.version!.minimum):sub,'setup-agent-sub'));
   const history=found.memory?.history,chips=node('span','','setup-agent-chips');
   for(const [n,label] of [[history?.conversations,'{count} conversations'],[history?.notes,'{count} notes'],[history?.skills,'{count} skills'],[history?.jobs,'{count} routines']] as [number|undefined,string][])if(n)chips.append(node('span',count(label,n),'setup-agent-chip'));
   if(chips.childElementCount)card.append(chips);
   if(found.worldTools===false){card.append(node('span',t('Chat only'),'setup-signin-tag'));card.title=agentText('With {agent}, Fox can talk with you but can’t act in your world yet.',title);}
   cards.append(card);
  }
  return cards;
 }
 /** Everything else, folded (owner request 2026-10-09): the Agents not on this computer, Google and ChatGPT (both
  * coming soon), an Agent on another computer, and an API key for the Hermes Agent Worldlet sets up. */
 function moreOptions(){
  const wrap=node('div','','setup-more-wrap');wrap.classList.toggle('is-open',more);
  // Codex alone is no Agent for Fox (owner decision 2026-10-09), so it is not offered.
  const missing=LOCAL_HARNESSES.filter(h=>h.id!=='codex'&&!agents.some(a=>a.id===h.id)&&(agents.length>0||detectingAgents||h.id!=='hermes')).sort((x,y)=>AGENT_PRIORITY.indexOf(x.id)-AGENT_PRIORITY.indexOf(y.id));
  const toggle=node('button','','setup-more-toggle') as HTMLButtonElement;toggle.type='button';toggle.setAttribute('aria-expanded',String(more));toggle.setAttribute('aria-controls','setupMore');
  toggle.append(node('span','','setup-more-chevron'),node('span',t('More options'),'setup-more-label'));
  const peek=node('span','','setup-more-peek');peek.setAttribute('aria-hidden','true');
  for(const src of [...missing.map(h=>AGENT_ICONS[h.id]),'brands/google.png',appLogoSource({key:'chatgpt'})||''].filter(Boolean).slice(0,6))peek.append(image(src));
  toggle.append(peek);
  toggle.onclick=()=>{more=!more;render();};
  wrap.append(toggle);
  const grid=node('div','','setup-more');grid.id='setupMore';grid.hidden=!more;
  const option=(label:string,icon:string,cls:string,tag='',sub='')=>{
   const b=node('button','','setup-more-option '+cls) as HTMLButtonElement;b.type='button';b.disabled=true;
   if(icon)b.append(image(icon,'setup-signin-icon'));
   const text=node('span','','setup-more-text');text.append(node('strong',label));if(sub)text.append(node('small',sub));b.append(text);
   if(tag)b.append(node('span',t(tag),'setup-signin-tag'));
   grid.append(b);return b;
  };
  for(const harness of missing){
   const b=option(harness.title,AGENT_ICONS[harness.id],'setup-agent-button is-missing','',detectingAgents?'':t('Not on this computer'));
   b.dataset.agent=harness.id;b.setAttribute('aria-label',harness.title);if(!detectingAgents)b.title=agentText('{agent} isn’t installed on this computer.',harness.title);
  }
  // Cloud agents are coming soon (owner request 2026-10-05): Google, then ChatGPT. Google is greyed for everyone, since a
  // Google sign-in brings no model (only the development build's mock rehearses it).
  const go=option(signingIn?({connecting:'Connecting to Google…',browser:'Waiting for Google…'}[googleStage]||'Finishing setup…'):t('Continue with Google'),'brands/google.png','setup-google-button',signingIn?'':'Coming soon');go.classList.toggle('is-connecting',signingIn);
  option(t('Continue with ChatGPT'),appLogoSource({key:'chatgpt'})||'','setup-chatgpt-button','Coming soon');
  const remote=option(t('My Agent is on another computer'),'','setup-remote-toggle');remote.disabled=busy||pairingRemote||signingIn;remote.prepend(node('span','⇄','setup-more-glyph'));
  remote.onclick=()=>{remoteForm=true;error='';render();};
  wrap.append(grid);
  // Development builds only: rehearse onboarding with a fictional Google account.
  if(state.mockGoogleAvailable===true){
   const mock=button('Use mock Google (Dev)',()=>signIn(true));mock.className='setup-link setup-mock-google';mock.hidden=!more;
   if(signingIn){mock.disabled=true;mock.style.visibility='hidden';mock.setAttribute('aria-hidden','true');}
   wrap.append(mock);
  }
  const help=node('p','','setup-google-help');help.hidden=!signingIn;
  // Browser steps only while consent is actually open.
  if(signingIn&&googleStage==='browser'){help.append(document.createTextNode(t('Continue in your browser.')));help.append(document.createElement('br'));help.append(document.createTextNode(t('If prompted: ')));help.append(node('strong','Advanced → Go to Worldlet (unsafe)'));}
  else if(signingIn&&googleStage!=='connecting')help.textContent=t(googleStage==='preparing'?'Google authorized. Preparing Fox in the background…':'Checking Mail and Calendar access…');
  wrap.append(help);
  if(signingIn){
   const slot=node('div','','setup-cancel-slot');slot.setAttribute('aria-live','polite');
   // The browser never came up (owner meetings 2026-10-02/03): open the same consent page again, or copy it.
   if(googleStage==='browser'&&googleUrl){
    const fallback=googleConsentActions(googleUrl,call),link=(label:string,fn:(b:HTMLButtonElement)=>void)=>{const b=node('button',t(label),'setup-link setup-consent') as HTMLButtonElement;b.type='button';b.onclick=()=>fn(b);slot.append(b);};
    link('Open again',()=>void fallback.open().catch(()=>{}));
    link('Copy link',b=>void fallback.copy().then(()=>{b.textContent=t('Link copied');},()=>{}));
   }
   const cancel=node('button',t('Cancel sign-in'),'setup-link setup-cancel') as HTMLButtonElement;cancel.type='button';cancel.onclick=()=>void call('connectCancel').catch(()=>{});slot.append(cancel);
   wrap.append(slot);
  }
  return wrap;
 }
 async function signIn(mock=false){
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
 }
 function render(){
  if(disposed)return;
  const importing=step===1,arriving=importingAgent();
  // With Reduce Motion, every tile that is ready shows at once.
  if(importing&&reduced())shownTiles=Math.max(shownTiles,tiles().length);
  loader.dataset.setupStep=String(step);
  panel.classList.toggle('is-bringing',arriving&&!settled());
  panel.classList.toggle('is-importing',importing);
  const footer=node('footer','','setup-footer');
  const status=node('div','','setup-status-slot');status.setAttribute('aria-live','polite');
  let primary:HTMLButtonElement;
  const parts:HTMLElement[]=[];
  if(importing){
   const name=arriving?(draft.brought?.name||draft.agentName||draft.agent):'';
   const done=settled();
   parts.push(node('h1',arriving?agentText(done?'{agent} moved in':'{agent} is moving in',name):t('Your world is ready'),'setup-visually-hidden'));
   const stage=node('div','','setup-import');
   const card=passport();
   const list=tiles(),shown=Math.min(shownTiles,list.length);
   const bento=node('div','','setup-tiles');bento.setAttribute('aria-label',t('What comes along'));
   // Each tile has its own place, so the grid stays full while every tile shows, empty ones included.
   const has=(kind:string)=>list.includes(kind);
   const layout=has('profile')?(has('apps')?'agent':has('connections')?'agent-no-apps':'agent-only'):list.length>1?(has('connections')?'world':'world-apps'):'';
   if(layout)bento.dataset.layout=layout;
   for(let i=0;i<shown;i++)bento.append(tile(list[i],i===shown-1&&shownTiles<=list.length));
   // While the host still copies, one tile says what is happening.
   if(arriving&&(bringing||porting||!draft.brought)){
    const waiting=node('article','','setup-tile setup-tile-reading');
    const line=node('p',bringLine(name),'setup-tile-line');line.style.animationDelay=-(performance.now()%1400)+'ms';
    waiting.append(node('span','','setup-tile-spinner'),line);bento.append(waiting);
   }
   stage.append(card,bento);parts.push(stage);
   if(entering)primary=button('Entering your world…',async()=>{},true);
   else if(!done)primary=button(agentText('Moving {agent} in…',AGENT_SHORT[draft.agent]&&!draft.brought?.name?AGENT_SHORT[draft.agent]:name),async()=>{},true);
   else primary=button('Enter your world',async()=>{entering=true;render();try{await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));await finish();}finally{entering=false;}},true);
   primary.classList.add('setup-enter');primary.classList.toggle('is-loading',entering||!done);primary.setAttribute('aria-busy',String(entering||!done));if(!done||entering)primary.disabled=true;
   if(error||notice)status.append(node('p',t(error||notice),error?'setup-error':'setup-note'));
  }else{
   parts.push(node('h1',t('Give your agent a world'),'setup-visually-hidden'));
   const choose=node('div','','setup-choose');
   const formOpen=remoteForm,hermesBusy=hermesSetup!=='idle'&&!agents.length;
   const lede=node('p',detectingAgents?t('Looking for agents on this computer…'):remoteForm?t('Your agent on another computer'):agents.length?t('Found on this computer'):t('No agent on this computer yet'),'setup-lede');
   choose.append(lede);
   if(move&&!remoteForm)choose.append(node('p',t('Fox now runs on your own agent. What Fox has learned comes along.'),'setup-note setup-move-note'));
   if(remoteForm)choose.append(remotePanel());
   else if(agents.length)choose.append(agentCards());
   else if(!detectingAgents){
    // No Agent here (owner decisions 2026-10-07, 2026-10-09): the big button installs stock Hermes Agent, then ChatGPT
    // is signed in inside it, and Hermes moves in like any Agent found here.
    const cards=node('div','','setup-agent-cards');
    const card=node('div','','setup-agent-card setup-agent-default is-install');
    card.append(image(AGENT_ICONS.hermes,'setup-agent-icon'),node('strong','Hermes Agent','setup-agent-name'),node('small',t('Worldlet sets it up for you'),'setup-agent-sub'));
    cards.append(card);choose.append(cards,hermesPanel());
   }else choose.append(node('div','','setup-agent-cards is-loading'));
   // Installing and signing in keep the page to that one task.
   if(!formOpen&&!hermesBusy)choose.append(moreOptions());
   parts.push(choose);
   const going=connectingAgent?agents.find(a=>a.id===connectingAgent):null;
   if(remoteForm){primary=button(pairingRemote?'Connecting to your other computer…':'Connect',pairRemote,true);primary.classList.toggle('is-loading',pairingRemote);if(!remoteCode.trim()||pairingRemote||signingIn)primary.disabled=true;}
   else if(!agents.length&&!detectingAgents&&!connectingAgent){
    const working=hermesSetup==='installing'||hermesSetup==='signing-in';
    primary=button(hermesSetup==='installing'?'Installing Hermes Agent…':hermesSetup==='signing-in'?'Waiting for ChatGPT…':hermesSetup==='installed'?'Sign in with ChatGPT':agentText('Give {agent} a world','Hermes'),hermesSetup==='installed'?signInHermes:installHermes,true);
    primary.classList.toggle('is-loading',working);if(working||signingIn)primary.disabled=true;
   }
   else if(outdated(picked)&&!going){
    // A too-old Agent is updated with its own command in Terminal (Worldlet never updates it), then looked at again.
    const agent=outdated(picked)!;
    primary=updatingAgent===agent.id||!agent.version!.update?button('Check again',()=>detectAgents(true),true):button(agentText('Update {agent}',giveName(agent.id)),()=>updateAgent(agent),true);
    if(signingIn)primary.disabled=true;
   }
   else{
    primary=button(going?agentText('Connecting to {agent}…',going.title):agentText('Give {agent} a world',picked?giveName(picked):t('your agent')),()=>chooseAgent(picked),true);
    primary.classList.toggle('is-loading',!!going);if(!picked||!agents.some(a=>a.id===picked)||signingIn)primary.disabled=true;
   }
   if((error||notice)&&!formOpen){const feedback=node('p',t(error||notice),error?'setup-error':'setup-note');if(error)feedback.setAttribute('role','alert');status.append(feedback);}
  }
  primary.classList.add('setup-next');
  footer.append(status,primary);
  panel.replaceChildren(...parts,footer);
  // The chosen card travels to the left (owner request 2026-10-09).
  if(importing&&flipFrom){
   const card=panel.querySelector<HTMLElement>('.setup-passport'),to=card?.getBoundingClientRect();
   if(card&&to&&to.width&&!reduced()){const s=Math.min(1.4,Math.max(.5,flipFrom.width/to.width));card.animate([{transform:`translate(${flipFrom.left+flipFrom.width/2-(to.left+to.width/2)}px,${flipFrom.top+flipFrom.height/2-(to.top+to.height/2)}px) scale(${s})`,opacity:.6},{transform:'none',opacity:1}],{duration:650,easing:'cubic-bezier(.22,.7,.2,1)'});}
   flipFrom=null;
  }
  if(importing)reveal();
  if(arriving&&!draft.brought&&!bringing)queueMicrotask(()=>void bringIn());
 }
 // A relaunch on the second half shows what already came over.
 if(draft.brought)shownTiles=99;
 setInterfaceLanguage(draft.language);render();
 // Hosts without local Agent support answer with an error or nothing; More options stays the way in.
 function detectAgents(fresh=false){
  detectingAgents=true;
  return Promise.resolve().then(()=>call('agentHarness',{operation:'detect',...fresh?{fresh:true}:{}})).then(result=>{
   if(disposed)return;
   // Codex alone is no Agent for Fox (owner decision 2026-10-09).
   const found=Array.isArray(result?.agents)?result.agents.filter(a=>typeof a?.id==='string'&&typeof a?.title==='string'&&a.id!=='codex'):[];
   // A choice the host no longer has (removed, or reset) returns to the first half.
   if(typeof draft.agent==='string'&&result?.selected!==draft.agent){delete draft.agent;persist();if(step===1&&!ready()){step=0;}}
   // Moving off Fox's own Hermes: an Agent it only copied from (or Codex it paid with) is not yet Fox's Agent.
   else if(!move&&typeof result?.selected==='string'&&step===0&&found.some(a=>a.id===result.selected)){draft.agent=result.selected;draft.agentName=agentName(found.find(a=>a.id===result.selected));step=1;persist();}
   // A pairing with another computer that ended (unpaired there) returns to the first half too.
   if(typeof draft.remoteAgent==='string'&&!result?.remote){delete draft.remoteAgent;persist();if(step===1&&!ready())step=0;}
   agents=found;detectingAgents=false;
   if(fresh){updatingAgent=null;const still=outdated(picked);error=still?agentText('{agent} is still older than Worldlet needs.',giveName(still.id)):'';notice='';}
   picked=AGENT_PRIORITY.find(id=>found.some(a=>a.id===id))||found[0]?.id||null;
   // Only when the first half is what the person sees: how many supported Agents are here, and the one picked for them.
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
  if(plan.select){void run(()=>chooseAgent(plan.pick));return;}
  if(plan.missing)error=agentText('{agent} isn’t installed on this computer.',LOCAL_HARNESSES.find(h=>h.id===plan.pick)?.title||plan.pick);
  if(!busy)render();
 }
 void detectAgents();
 if(step===1)void prepareGoogleSources();
 const seed=()=>{seedAppletSelection(WORLD_APPS.filter(a=>appletSupport(a.key,hostFeatures(state)).supported),detected,selected,touched);persist();};
 if(hostFeatures(state).installedAppDetection){
  void call('installedApplets').then(result=>{
   if(disposed)return;detected=new Set(result.keys||[]);nativeIcons=result.icons||{};
   seed();detecting=false;if(!busy)render();
  }).catch(()=>{detecting=false;seed();if(!busy)render();});
 }else {detecting=false;seed();render();}
 return {update(next){state=next;if(disposed)return;if(advanceAfterGoogle()){render();return;}if(!busy&&step===1&&!ready()){step=0;render();}}};
}
