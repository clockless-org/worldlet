import {APPLET_OVERVIEW_WIDTH,APPLET_OPTICAL_SCALE,WORLD_WIDTH,WORLD_HEIGHT,environmentAt} from '../world/index.ts';
import {seedAppletSelection,WORLD_APPS,appletSupport,connectionLive} from '../../core/applets/index.ts';
import {xAppIcon,appLogoSource,CORE_APPLET_KINDS,coreAppletSource} from '../applets/index.ts';
import {themeAppletIcon} from '../themes/index.ts';
import {setupText,setInterfaceLanguage} from './setup-language.ts';
import {hostFeatures,googleSignInStart} from '../../platform/bridge/features.ts';
import {GOOGLE_SIGN_IN_EVENT,googleSignInStage} from '../../contracts/platform.ts';
import {LOCAL_HARNESSES,connectRequestPlan} from '../../core/agent/index.ts';
import {agentBringDimensions,agentsDetectedDimensions,diagnosticError,timingBucket} from '../../core/diagnostics/index.ts';
import {googleConsentActions,googleConsentUrl} from './google-consent.ts';

// Local Agent marks: Claude Code and Codex reuse their Applet logos; the rest ship in resources/brands.
const AGENT_ICONS:Record<string,string>={'claude-code':appLogoSource({key:'claude-code'})||'','codex':appLogoSource({key:'codex'})||'',hermes:'brands/hermes.png',openclaw:'brands/openclaw.svg',pi:'brands/pi.svg'};
// The short name for an Agent without a name of its own: "Moving Hermes in…".
const AGENT_SHORT:Record<string,string>={hermes:'Hermes',openclaw:'OpenClaw',pi:'pi',codex:'Codex','claude-code':'Claude Code'};
// The page picks one local Agent for the person, in this order (owner request 2026-10-06): Hermes, OpenClaw and pi
// first, then Codex, then Claude Code.
const AGENT_PRIORITY=['hermes','openclaw','pi','codex','claude-code'];
const byPriority=(x:{id:string},y:{id:string})=>AGENT_PRIORITY.indexOf(x.id)-AGENT_PRIORITY.indexOf(y.id);
const node=(tag:string,text='',cls='')=>{const e=document.createElement(tag);e.textContent=text;e.className=cls;return e;};
/** First-use setup lives on the loading curtain, as one page (owner request 2026-10-09): the brand on top, the Agents
 * found here as cards, every other way in folded under More options, and one big "Build your world" (owner request 2026-10-10). Choosing
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
 // A render puts its elements in place without taking out the ones already there: an element taken out and put back
 // starts its animations over, which made arriving tiles, the spinners and the button flash on every render.
 const place=(parent:HTMLElement,children:Node[])=>{
  const wanted=new Set(children);for(const child of [...parent.childNodes])if(!wanted.has(child))child.remove();
  children.forEach((child,i)=>{if(parent.childNodes[i]!==child)parent.insertBefore(child,parent.childNodes[i]||null);});
 };
 // The parts of the second half that stay across renders: the stage, its tiles, the waiting tile and the footer.
 const stage=node('div','','setup-import'),bento=node('div','','setup-tiles');
 const waiting=node('article','','setup-tile setup-tile-reading'),waitingLine=node('p','','setup-tile-line');
 waiting.append(node('span','','setup-tile-spinner'),waitingLine);
 const footer=node('footer','','setup-footer'),status=node('div','','setup-status-slot');status.setAttribute('aria-live','polite');
 const primaryButton=node('button','','setup-primary') as HTMLButtonElement;primaryButton.type='button';
 // 'connecting' until the host says it opened Google consent: a reused grant opens no browser.
 let googleStage:string='connecting',googleUrl:string|undefined;
 const onGoogleStage=(event:Event)=>{const detail=(event as CustomEvent).detail,stage=googleSignInStage(detail);if(disposed||!signingIn||!stage)return;googleStage=stage;googleUrl=googleConsentUrl(detail);render();};
 window.addEventListener(GOOGLE_SIGN_IN_EVENT,onGoogleStage);
 // An install script launched Worldlet with `--connect=<id>` (core/agent/PORTABILITY.md#local-harnesses-chosen-at-setup):
 // that Agent is picked and brought in as the big button would. Launched again while setup is open, the host says so
 // and setup looks again.
 const onConnectRequest=()=>{if(!disposed)void detectAgents();};
 window.addEventListener('worldlet:connect-agent',onConnectRequest);
 // The short turn that proves the chosen Agent answers runs after setup moves on (`checkLater`): a half-minute cold start
 // for a large Hermes Agent no longer holds the button. If it fails while that Agent is still the one being set up, the
 // person is back on the first half with the reason, as when the check held the button.
 let checkStarted=0;
 const onAgentCheck=(event:Event)=>{
  const detail=(event as CustomEvent).detail;if(disposed||!detail||detail.ok!==false||detail.id!==draft.agent)return;
  productEvent('local_agent_select_failed',{local_agent:String(detail.id),error_code:failureCode({message:detail.message})},timingBucket(performance.now()-checkStarted));
  delete draft.agent;delete draft.agentName;draft.connected=false;step=0;notice='';
  error=String(detail.message||'').slice(0,300);
  persist();render();
 };
 window.addEventListener('worldlet:agent-check',onAgentCheck);
 const languages=['en','zh','ja','es'];
 const systemLanguage=navigator.language.split('-')[0];
 const key=(move?'worldlet-agent-move:':'worldlet-startup-setup:')+state.workspaceId;
 let draft:any={step:0,language:languages.includes(systemLanguage)?systemLanguage:'en',applets:['app-gmail','app-google-calendar','app-browser'],touched:[],consent:true};
 try{const saved=JSON.parse(localStorage.getItem(key)||'null');if(saved&&Array.isArray(saved.applets))draft={...draft,...saved};}catch{}
 // Moving to an Agent is about the Agent alone: a Google connection the World already has does not stand in for one.
 const connected=()=>!move&&['gmail','google-calendar'].every(provider=>state.connections?.some(c=>c.provider===provider&&connectionLive(c)));
 // Google, a chosen local Agent, an API key or an Agent on another computer opens the second half of the page.
 const ready=()=>connected()||typeof draft.agent==='string'||draft.ownModel===true||typeof draft.remoteAgent==='string';
 // Resume from account facts (or the chosen local Agent), not old draft indices.
 step=ready()?1:0;
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
   try{checkStarted=started;chosen=await call('agentHarness',{operation:'select',id:agent.id,checkLater:true,...move?{direct:true}:{}});}
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
   // What it brought, or for an Agent that keeps its own history (Hermes Agent) its newest conversations, with when.
   const items=Array.isArray(history.list)&&history.list.length?history.list:Array.isArray(adopted?.recent)?adopted.recent:[];
   const list=items.filter(item=>typeof item?.title==='string').slice(0,60).map(item=>({title:String(item.title).slice(0,160),messages:Number(item.messages)||0,...Number.isFinite(item.at)&&item.at>0?{at:Number(item.at)}:{}}));
   // What came along besides history: its name, and which of personality, about-you and long-term memory.
   const kinds=Array.isArray(adopted?.memories)?adopted.memories.map(m=>typeof m==='string'?m:m?.kind).filter(k=>typeof k==='string'):[];
   // A few words each for its personality, what it knows about the person and its model, read from its own files.
   const summary=adopted?.summary||{},said=(value:unknown)=>typeof value==='string'?value.trim().slice(0,80):'';
   draft.brought={conversations:Number(history.conversations)||list.length,older:Number(history.older)||0,notes:Number(history.notes)||0,skills:Number(history.skills)||0,routines:Number(history.routines)||0,list,model:adopted?.model?.ok===true,modelName:adopted?.model?.ok?String(adopted.model.model||''):'',name:typeof adopted?.name==='string'?adopted.name:null,kinds,memory:kinds.length>0||!!adopted?.name,summary:{personality:said(summary.personality),about:said(summary.about),model:said(summary.model)}};
   // Worldlet provides no model (owner decision 2026-10-05): when the Agent's model could not come over and
   // nothing else here answers (an OpenClaw on a sign-in, no Codex), say where to choose one.
   const model=await call('modelSource').catch(()=>null);
   draft.brought.model=['chatgpt','own','none'].includes(model?.source)?model.source:'';
   // An Agent Fox talks through directly keeps its own model; the one it brought only runs background work.
   if(adopted?.model?.ok&&!draft.connected)notice=agentText('Fox now runs on the model you brought from {agent}.',draft.agentName||id);
   else if(draft.brought.model==='none')notice=agentText('{agent} signs in with its own account, which Fox can’t use. After setup, choose a model in Settings, under Agent.',draft.agentName||id);
  }catch(e){
   productEvent('agent_bring_failed',{local_agent:id,error_code:failureCode(e)},timingBucket(performance.now()-started));
   draft.brought={conversations:0,notes:0,skills:0,routines:0,list:[],model:false,modelName:'',name:null,kinds:[],memory:false,failed:true,summary:{}};
   notice=agentText('Fox couldn’t bring {agent}’s memory. You can tell Fox about yourself instead.',draft.agentName||id);
  }finally{bringing=false;}
  porting=true;persist();render();
  try{const result=await call('agentIntegrations',{operation:'port',id});draft.integrations=Array.isArray(result?.integrations)?result.integrations.filter(item=>typeof item?.title==='string'&&typeof item?.outcome==='string').slice(0,20):[];}
  catch{draft.integrations=[];}
  finally{
   // The apps the Agent brought join the World's selection (owner decision 2026-10-10: the Applets in use).
   porting=false;clearInterval(chatterTimer);seed();if(!disposed&&!busy)render();
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
  box.append(node('p',t('On that computer, open Worldlet, then Settings › Phone › Pair another computer, and paste its code here.'),'setup-note'));
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
 // The big button is one element that changes its words, so its spinner keeps turning across renders.
 const button=(label,fn,primary=false)=>{const b=primary?primaryButton:node('button','','') as HTMLButtonElement;const text=t(label);if(b.textContent!==text)b.textContent=text;b.className=primary?'setup-primary':'';b.type='button';b.disabled=busy;b.onclick=()=>void run(fn);return b;};
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
 // Setup is over: its draft, timers and listeners go.
 function dispose(){
  localStorage.removeItem(key);disposed=true;clearTimeout(revealTimer);clearInterval(chatterTimer);window.removeEventListener(GOOGLE_SIGN_IN_EVENT,onGoogleStage);window.removeEventListener('worldlet:connect-agent',onConnectRequest);window.removeEventListener('worldlet:hermes-setup',onHermesSetup);window.removeEventListener('worldlet:agent-check',onAgentCheck);
 }
 async function finish(){
  if(!ready())throw Error('Connect Google to enter your world.');
  if(move){
   const snapshot=await call('snapshot');
   dispose();
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
  // Today's prep and Wrap up today are on from the start, with no row on setup (owner decision 2026-10-11); Settings ›
  // Agent pauses them.
  await call('foxPreferenceChange',{setting:'daily_routines',value:true}).catch(()=>{});
  const snapshot=await call('snapshot');
  const gathering=node('div','','setup-gathering');loader.append(gathering);
  // Enter your world (owner requests 2026-10-10, 2026-10-11): one continuous move. Everything else fades while, at the
  // same time, Fox walks down to its place at the bottom and takes in what came along (Profile, Conversations,
  // Skills), Daily notes go to the Journal, the apps and the connections float up like umbrellas and become the World's icons, and Routines go to the
  // dock beside Fox; then the icons and Fox go into the World.
  const still=reduced();
  const foxFrom=panel.querySelector('.setup-tile-fox')?.getBoundingClientRect();
  const fox=image('assets/fox-startup.png','setup-gathering-fox');fox.dataset.fox='true';
  const foxSize=Math.round(Math.min(170,innerHeight*.22)),foxX=innerWidth/2,foxY=innerHeight-foxSize*.62-Math.min(48,innerHeight*.05);
  Object.assign(fox.style,{left:foxX+'px',top:foxY+'px',width:foxSize+'px',height:foxSize+'px'});gathering.append(fox);
  const parcels=Array.from(panel.querySelectorAll<HTMLElement>('.setup-tile:not(.setup-tile-avatar):not(.setup-tile-apps):not(.setup-tile-connections):not(.is-empty)')).map(tile=>{
   const r=tile.getBoundingClientRect(),copy=tile.cloneNode(true) as HTMLElement;
   copy.classList.remove('is-arriving');copy.classList.add('setup-parcel');copy.removeAttribute('data-key');
   Object.assign(copy.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px'});gathering.append(copy);
   return copy;
  });
  const foxFlight=fox.animate([foxFrom?{left:foxFrom.left+foxFrom.width/2+'px',top:foxFrom.top+foxFrom.height/2+'px',width:foxFrom.width+'px',height:foxFrom.width+'px'}:{opacity:0},{left:foxX+'px',top:foxY+'px',width:foxSize+'px',height:foxSize+'px',opacity:1}],{duration:still?0:650,easing:'cubic-bezier(.22,.7,.2,1)'}).finished;
  // Every chosen app gathers on top: an icon shown in the Apps tile floats up from its place, the rest come in from the middle.
  const shelf=panel.querySelector('.setup-tile-apps');
  const chosenApps=WORLD_APPS.filter(a=>selected.has(a.id));
  const iconsToGather=chosenApps.map(app=>{
   const shown=panel.querySelector<HTMLImageElement>('.setup-app[data-applet-id="'+CSS.escape(app.id)+'"] .setup-app-logo');
   const img=shown||image(appIcon(app),'setup-app-logo');img.dataset.appletId=app.id;return img;
  });
  const tile=(shelf||panel).getBoundingClientRect();
  const columns=Math.min(8,Math.max(1,iconsToGather.length)),rows=Math.ceil(iconsToGather.length/columns),spacing=Math.min(120,(innerWidth-80)/columns,(innerHeight*.42)/rows);
  const slot=(i:number)=>{const row=Math.floor(i/columns),inRow=row<rows-1?columns:iconsToGather.length-columns*row;return {x:innerWidth*.5+((i%columns)-(inRow-1)/2)*spacing,y:innerHeight*.3+(row-(rows-1)/2)*spacing};};
  // Floating up under an umbrella: a slow rise that sways one way, then the other, and settles without a bounce.
  const float=(el:HTMLElement,x:number,y:number,to:{x:number,y:number},i:number,{visible=true,end={opacity:1,scale:.85}}={})=>{
   const dx=to.x-x,dy=to.y-y,sway=(i%2?1:-1)*Math.min(36,14+Math.abs(dy)*.08),at=(f:number,s:number,r:number,o=1)=>({left:x+dx*f+s+'px',top:y+dy*f+'px',opacity:o,transform:`translate(-50%,-50%) rotate(${r}deg) scale(${1-(1-end.scale)*f})`});
   return el.animate([{...at(0,0,0,visible?1:0)},{...at(.35,sway,sway>0?7:-7)},{...at(.72,-sway*.45,sway>0?-4:4)},{...at(1,0,0,end.opacity),offset:1}],{duration:still?0:1100,delay:still?0:120+i*55,easing:'cubic-bezier(.3,.6,.3,1)',fill:'forwards'}).finished;
  };
  const flights=iconsToGather.map((img,i)=>{
   const r=img.getBoundingClientRect(),copy=img.cloneNode() as HTMLImageElement;gathering.append(copy);
   const visible=img.isConnected&&r.width>0&&r.top>=tile.top&&r.bottom<=tile.bottom;
   return float(copy,visible?r.left+r.width/2:innerWidth/2,visible?r.top+r.height/2:innerHeight*.5,slot(i),i,{visible});
  });
  // The connections float up with them and become the icon of the app they open (Google: Mail), or fade on top.
  const connectionFlights=Array.from(panel.querySelectorAll<HTMLElement>('.setup-tile-connections .setup-tile-logos>*')).map((mark,i)=>{
   const r=mark.getBoundingClientRect(),copy=mark.cloneNode(true) as HTMLElement;copy.classList.add('setup-gathering-mark');gathering.append(copy);
   const provider=mark.dataset.provider==='google'?'gmail':mark.dataset.provider,index=chosenApps.findIndex(a=>a.key===provider);
   return float(copy,r.left+r.width/2,r.top+r.height/2,index>=0?slot(index):{x:innerWidth/2,y:innerHeight*.18},iconsToGather.length+i,{end:{opacity:0,scale:.7}}).then(()=>copy.remove());
  });
  // The World comes forward as it will open, by day or by night from the same clock the World reads before it knows a
  // place, so the painting and the World match when one hands over to the other.
  // A theme without its own night painting gets its day painting dimmed for the night.
  const assets=(globalThis as any).__WORLDLET_25D_ASSETS__,night=environmentAt().night,now=night&&assets?.night?assets.night:assets?.surroundings;
  if(now&&typeof now==='string')loader.style.setProperty('--setup-world-now','url("'+now.replace(/"/g,'%22')+'")');
  if(night&&!assets?.night)loader.dataset.setupNight='dimmed';
  loader.classList.add('is-gathering');
  // What came along drifts into Fox while it walks down; Fox swells and glows a little as it takes in each one. Routines
  // run on their own, so they go to the dock beside Fox instead, to Next on its right (owner layout 2026-10-11); before
  // the dock has read them, to where it stands.
  const corner=(document.querySelector('.task-panel:not([hidden]) .task-group[data-group=routines]')||document.querySelector('.task-panel:not([hidden])'))?.getBoundingClientRect();
  const cornerX=corner&&corner.width?corner.left+24:innerWidth/2+260,cornerY=corner&&corner.height?corner.top+24:innerHeight-40;
  // Daily notes are the Agent's past days, so they go to the Journal at the head of the left panel (owner decision
  // 2026-10-11), each day becoming that day's page there.
  const journal=document.querySelector('.world-today-open')?.getBoundingClientRect();
  const journalX=journal&&journal.width?journal.left+journal.width/2:Math.min(140,innerWidth*.12),journalY=journal&&journal.height?journal.top+journal.height/2:56;
  const intoFox=(parcel:HTMLElement)=>!parcel.classList.contains('setup-tile-routines')&&!parcel.classList.contains('setup-tile-notes');
  const absorbed=Promise.all(parcels.map(async (parcel,i)=>{
   const toCorner=parcel.classList.contains('setup-tile-routines'),toJournal=parcel.classList.contains('setup-tile-notes');
   const [x,y]=toCorner?[cornerX,cornerY]:toJournal?[journalX,journalY]:[foxX,foxY];
   const r=parcel.getBoundingClientRect(),dx=x-(r.left+r.width/2),dy=y-(r.top+r.height/2),delay=still?0:220+i*120;
   await parcel.animate([{transform:'none',opacity:1,filter:'none'},{transform:`translate(${dx*.55}px,${dy*.55}px) scale(.4)`,opacity:.95,filter:'brightness(1.08)',offset:.6},{transform:`translate(${dx}px,${dy}px) scale(.03)`,opacity:0,filter:'brightness(1.6) blur(2px)'}],{duration:still?0:720,delay,easing:'cubic-bezier(.55,0,.35,1)',fill:'forwards'}).finished;
   parcel.remove();
   if(!still&&intoFox(parcel))fox.animate([{transform:'translate(-50%,-50%) scale(1)',filter:'brightness(1)'},{transform:'translate(-50%,-50%) scale(1.07)',filter:'brightness(1.25) drop-shadow(0 0 16px #ffe4a0)'},{transform:'translate(-50%,-50%) scale(1)',filter:'brightness(1) drop-shadow(0 6px 10px #35453030)'}],{duration:360,easing:'ease-out'});
  })).then(()=>{
   // Fox has taken everything in: one soft ring of light, and it is ready to go.
   if(still||!parcels.some(intoFox))return;
   const ring=node('div','','setup-gathering-ring');Object.assign(ring.style,{left:foxX+'px',top:foxY+'px',width:foxSize+'px',height:foxSize+'px'});gathering.append(ring);
   return ring.animate([{transform:'translate(-50%,-50%) scale(.6)',opacity:.9},{transform:'translate(-50%,-50%) scale(1.6)',opacity:0}],{duration:520,easing:'ease-out',fill:'forwards'}).finished.then(()=>ring.remove());
  });
  await Promise.all([...flights,...connectionFlights,foxFlight,absorbed]);
  // Let the user see each familiar flat icon become its actual device before opening.
  await Promise.all(Array.from(gathering.querySelectorAll<HTMLImageElement>('img')).map(async (logo,i)=>{
   const app=WORLD_APPS.find(a=>a.id===logo.dataset.appletId);
   const src=app&&themeAppletIcon(app.key);
   if(!src)return;
   const device=image(src) as HTMLImageElement;device.dataset.appletId=logo.dataset.appletId;
   try{await device.decode();}catch{return;}
   const size=APPLET_OVERVIEW_WIDTH*(APPLET_OPTICAL_SCALE[app.key]??1)*Math.max(innerWidth/WORLD_WIDTH,innerHeight/WORLD_HEIGHT);
   const r=logo.getBoundingClientRect();Object.assign(device.style,{left:(r.left+r.width/2)+'px',top:(r.top+r.height/2)+'px',width:size+'px',height:size+'px',transform:'translate(-50%,-50%)',opacity:'0'});gathering.append(device);
   const duration=still?0:650,delay=still?0:i*70;
   await Promise.all([
    logo.animate([{opacity:1,filter:'brightness(1)'},{opacity:.6,filter:'brightness(2)',offset:.35},{opacity:0,filter:'brightness(1)'}],{duration,delay,fill:'forwards'}).finished,
    device.animate([{opacity:0,transform:'translate(-50%,-50%) scale(.45)',filter:'brightness(2) drop-shadow(0 0 12px #ffe4a0)'},{opacity:1,transform:'translate(-50%,-50%) scale(1)',offset:.7},{opacity:1,transform:'translate(-50%,-50%) scale(1)',filter:'brightness(1) drop-shadow(0 3px 5px #35453025)'}],{duration,delay,fill:'forwards'}).finished
   ]);logo.remove();
  }));
  gathering.id='setupArrivingDevices';document.body.append(gathering);
  dispose();
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
  const lines=['Reading {agent}’s memory…','Packing up {agent}’s conversations…','Folding in {agent}’s daily notes…','Teaching Fox {agent}’s skills…'];
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
 /** "3 hr. ago" in setup's language, for the Conversations tile. */
 function ago(at:number){
  const seconds=(at-Date.now())/1000,abs=Math.abs(seconds);
  const [unit,size]:[Intl.RelativeTimeFormatUnit,number]=abs<3600?['minute',60]:abs<86400?['hour',3600]:abs<30*86400?['day',86400]:abs<365*86400?['month',30*86400]:['year',365*86400];
  try{return new Intl.RelativeTimeFormat(draft.language,{numeric:'auto',style:'short'}).format(Math.round(seconds/size),unit);}catch{return '';}
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
   // The newest few, each with when it was last written to; the list keeps the rows that fit, so the tile never scrolls.
   const rows=(brought.list||[]).slice(0,8).map(item=>[item.title,item.at?ago(item.at):''] as [string,string]);
   return keep('tile:conversations',JSON.stringify([brought.conversations,rows,draft.language]),build('Conversations','is-big',el=>{
    if(!brought.conversations)return none(el);
    el.append(node('strong',String(brought.conversations),'setup-tile-count'));
    const list=node('ul','','setup-tile-titles');
    for(const [title,when] of rows){const row=node('li','');row.title=title;row.append(node('span',title,'setup-tile-titles-name'));if(when)row.append(node('span',when,'setup-tile-titles-when'));list.append(row);}
    el.append(list);
   }));
  }
  if(kind==='notes')return keep('tile:notes',String(brought.notes)+draft.language,build('Daily notes','',big(brought.notes,'daily notes')));
  if(kind==='skills')return keep('tile:skills',String(brought.skills)+draft.language,build('Skills','',big(brought.skills,'skills it learned')));
  if(kind==='routines')return keep('tile:routines',String(brought.routines)+draft.language,build('Routines','',big(brought.routines,'run on their own')));
  if(kind==='connections'){
   const items:{title:string,provider?:string,logo:string,again:boolean}[]=importingAgent()
    ?(draft.integrations||[]).filter(item=>item.outcome!=='stays').map(item=>({title:item.title,provider:typeof item.provider==='string'?item.provider:'',logo:item.provider==='google'?'brands/google.png':logoOf(item.provider),again:item.outcome==='reconnect'}))
    :[{title:'Gmail',provider:'gmail',logo:logoOf('gmail'),again:false},{title:'Google Calendar',provider:'google-calendar',logo:logoOf('google-calendar'),again:false}];
   return keep('tile:connections',JSON.stringify([items,draft.language]),build('Connections','is-wide',el=>{
    if(!items.length)return none(el);
    const row=node('div','','setup-tile-logos');
    for(const item of items){const mark=item.logo?image(item.logo,'setup-tile-logo'):node('span',item.title,'setup-tile-chip');if(item.provider)mark.dataset.provider=item.provider;mark.title=item.title+(item.again?' · '+t('Sign in again after setup'):'');row.append(mark);}
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
  for(const found of [...agents].sort(byPriority)){
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
   for(const [n,label] of [[history?.conversations,'{count} conversations'],[history?.notes,'{count} daily notes'],[history?.skills,'{count} skills'],[history?.jobs,'{count} routines']] as [number|undefined,string][])if(n)chips.append(node('span',count(label,n),'setup-agent-chip'));
   if(chips.childElementCount)card.append(chips);
   if(found.worldTools===false){card.append(node('span',t('Chat only'),'setup-signin-tag'));card.title=agentText('With {agent}, Fox can talk with you but can’t act in your world yet.',title);}
   cards.append(card);
  }
  return cards;
 }
 /** Everything else, folded (owner request 2026-10-09): the Agents not on this computer, an Agent on another computer,
  * and an API key for the Hermes Agent Worldlet sets up. The greyed Google and ChatGPT "Coming soon" rows are gone (owner
  * decision 2026-10-10: nothing the person cannot use sits on the first page). */
 function moreOptions(){
  const wrap=node('div','','setup-more-wrap');wrap.classList.toggle('is-open',more);
  // Codex alone is no Agent for Fox (owner decision 2026-10-09), so it is not offered.
  const missing=LOCAL_HARNESSES.filter(h=>h.id!=='codex'&&!agents.some(a=>a.id===h.id)&&(agents.length>0||detectingAgents||h.id!=='hermes')).sort(byPriority);
  const toggle=node('button','','setup-more-toggle') as HTMLButtonElement;toggle.type='button';toggle.setAttribute('aria-expanded',String(more));toggle.setAttribute('aria-controls','setupMore');
  toggle.append(node('span','','setup-more-chevron'),node('span',t('More options'),'setup-more-label'));
  const peek=node('span','','setup-more-peek');peek.setAttribute('aria-hidden','true');
  for(const src of missing.map(h=>AGENT_ICONS[h.id]).filter(Boolean).slice(0,6))peek.append(image(src));
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
  // Only the development build's mock Google signs in here; its row shows the sign-in's progress (#1615).
  if(state.mockGoogleAvailable===true||signingIn){const go=option(signingIn?({connecting:'Connecting to Google…',browser:'Waiting for Google…'}[googleStage]||'Finishing setup…'):t('Continue with Google'),'brands/google.png','setup-google-button');go.classList.toggle('is-connecting',signingIn);}
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
  let primary:HTMLButtonElement;
  let message:HTMLElement|null=null;
  const parts:HTMLElement[]=[];
  if(importing){
   const name=arriving?(draft.brought?.name||draft.agentName||draft.agent):'';
   const done=settled();
   parts.push(node('h1',arriving?agentText(done?'{agent} moved in':'{agent} is moving in',name):t('Your world is ready'),'setup-visually-hidden'));
   const card=passport();
   const list=tiles(),shown=Math.min(shownTiles,list.length);
   bento.setAttribute('aria-label',t('What comes along'));
   // Each tile has its own place, so the grid stays full while every tile shows, empty ones included.
   const has=(kind:string)=>list.includes(kind);
   // An Agent moving in has its whole grid from the start (every tile's place, the waiting tile on the bottom row
   // where the connections and apps arrive last), so the grid never changes shape while tiles arrive.
   const layout=arriving?'agent':has('profile')?(has('apps')?'agent':has('connections')?'agent-no-apps':'agent-only'):list.length>1?(has('connections')?'world':'world-apps'):'';
   if(layout)bento.dataset.layout=layout;else delete bento.dataset.layout;
   const shownTileElements:HTMLElement[]=[];
   for(let i=0;i<shown;i++)shownTileElements.push(tile(list[i],i===shown-1&&shownTiles<=list.length));
   // While the host still copies, one tile says what is happening.
   if(arriving&&(bringing||porting||!draft.brought)){
    const line=bringLine(name);if(waitingLine.textContent!==line)waitingLine.textContent=line;
    shownTileElements.push(waiting);
   }
   place(bento,shownTileElements);place(stage,[card,bento]);parts.push(stage);
   if(entering)primary=button('Entering your world…',async()=>{},true);
   else if(!done)primary=button(agentText('Moving {agent} in…',AGENT_SHORT[draft.agent]&&!draft.brought?.name?AGENT_SHORT[draft.agent]:name),async()=>{},true);
   else primary=button('Enter your world',async()=>{entering=true;render();try{await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));await finish();}finally{entering=false;}},true);
   primary.classList.add('setup-enter');primary.classList.toggle('is-loading',entering||!done);primary.setAttribute('aria-busy',String(entering||!done));if(!done||entering)primary.disabled=true;
   if(error||notice)message=node('p',t(error||notice),error?'setup-error':'setup-note');
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
    primary=button(hermesSetup==='installing'?'Installing Hermes Agent…':hermesSetup==='signing-in'?'Waiting for ChatGPT…':hermesSetup==='installed'?'Sign in with ChatGPT':'Build your world',hermesSetup==='installed'?signInHermes:installHermes,true);
    primary.classList.toggle('is-loading',working);if(working||signingIn)primary.disabled=true;
   }
   else if(outdated(picked)&&!going){
    // A too-old Agent is updated with its own command in Terminal (Worldlet never updates it), then looked at again.
    const agent=outdated(picked)!;
    primary=updatingAgent===agent.id||!agent.version!.update?button('Check again',()=>detectAgents(true),true):button(agentText('Update {agent}',giveName(agent.id)),()=>updateAgent(agent),true);
    if(signingIn)primary.disabled=true;
   }
   else{
    primary=button(going?'Building your world…':'Build your world',()=>chooseAgent(picked),true);
    primary.classList.toggle('is-loading',!!going);if(!picked||!agents.some(a=>a.id===picked)||signingIn)primary.disabled=true;
   }
   if((error||notice)&&!formOpen){message=node('p',t(error||notice),error?'setup-error':'setup-note');if(error)message.setAttribute('role','alert');}
  }
  primary.classList.add('setup-next');
  // The same words stay the same element, so a screen reader hears a message once.
  const said=message?message.className+'|'+message.textContent:'';
  if(status.dataset.said!==said){status.dataset.said=said;status.replaceChildren(...message?[message]:[]);}
  place(footer,[status,primary]);
  place(panel,[...parts,footer]);
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
 // Setup selects only the Applets in use (owner decision 2026-10-10): its draft (Mail, Calendar, Browser), the apps
 // found here and the apps the person's Agent brought (core/applets/regions.ts).
 const brought=()=>new Set<string>((draft.integrations||[]).map((item:any)=>item?.provider).filter((p:unknown):p is string=>typeof p==='string'));
 const seed=()=>{seedAppletSelection(WORLD_APPS.filter(a=>appletSupport(a.key,hostFeatures(state)).supported),detected,selected,touched,brought());persist();};
 if(hostFeatures(state).installedAppDetection){
  void call('installedApplets').then(result=>{
   if(disposed)return;detected=new Set(result.keys||[]);nativeIcons=result.icons||{};
   seed();detecting=false;if(!busy)render();
  }).catch(()=>{detecting=false;seed();if(!busy)render();});
 }else {detecting=false;seed();render();}
 return {update(next){state=next;if(disposed)return;if(advanceAfterGoogle()){render();return;}if(!busy&&step===1&&!ready()){step=0;render();}}};
}
