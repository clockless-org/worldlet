import {defaultBrowserText,displayReleaseVersion} from '../../core/distribution/index.ts';
import {BROWSER_HOME,createBrowserHome} from '../../core/browser/index.ts';
import {createFoxPreferences} from './fox-preferences.ts';
import {createPanelGuide} from './panel-guide.ts';
import {modelHealthView,type ModelFix} from './model-health.ts';
import {showAgentPermissions} from './agent-permissions.ts';
import {showAgentAccess,type OwnAgent} from './agent-access.ts';
import {showRemoteAccess,showUseInClaude} from './remote-access.ts';
import {showWorldContext} from './world-context-page.ts';
import {showAgentRoutines} from './agent-routines.ts';
import {showAgentSkills} from './agent-skills.ts';
import {showAgentMemory} from './agent-memory.ts';
import {showWorldletAccounts} from './worldlet-accounts.ts';
import {showConnectors} from './connectors-page.ts';
import {agentEl as el} from './agent-change.ts';

/** What the World view lends Settings: the sample world switch and which host features exist. */
export type CompanionSettingsHost={toggleSample?:()=>Promise<unknown>;sample:()=>boolean;localDataDeletion:()=>boolean};
/** The companion pages that are sections of their own in the one list: Fox's profile and Phone. */
export type CompanionSettingsPages={fox:HTMLElement;phone:HTMLElement;/** What Fox itself knows, shown first in Context › Memory. */knows:HTMLElement};
/** `minor`: below the three areas, smaller. `show` gets the part to open, if one was named. */
type Item={id:string;label:string;hint:string;page?:boolean;minor?:boolean;show:(detail:HTMLElement,part:string)=>void|Promise<void>};

const MODEL_EVENTS=['worldlet:model-changed','worldlet:model-refresh'];
// Settings is three areas, Connectors, Agents and Context, with Fox, Phone, General and Help below them (issue #674).
// Entry points that name a section or part Settings no longer has open the area that took it in, at its part: `model`
// (what Fox runs on) and the standing rules (`approvals`, `permissions`) are parts of your own Agent's page under Agents;
// `access` (the board's empty state opens it) is the list of Agents; `memory` is in Context; Accounts became Connectors.
const MOVED:Record<string,{section:string;part:string}>={integrations:{section:'connectors',part:''},accounts:{section:'connectors',part:''},
 model:{section:'agents',part:'model'},approvals:{section:'agents',part:'permissions'},permissions:{section:'agents',part:'permissions'},
 access:{section:'agents',part:'access'},memory:{section:'context',part:'memory'}};
/** The parts of your own Agent's page (Agents › Your Agent); any other part of Agents is on its list. */
const OWN_PARTS=['model','skills','routines','permissions','accounts'];

/** The whole companion panel is one settings window (owner request 2026-10-10): one list of sections on the left, the
 * chosen section's details on the right, no tabs. Everything finishes here; nothing hands off to Fox's speech bubble. */
export function createCompanionSettings({call,host,pages,records,onShow,close,openFeedback,replayTutorial}:{call:(action:string,body?:any)=>Promise<any>;host:()=>CompanionSettingsHost|undefined;pages:CompanionSettingsPages;records:{records:HTMLElement;showRecords:()=>void};onShow:(id:string)=>void;close:()=>void;
 /** Help's Feedback: the feedback panel over the World. */
 openFeedback:()=>void;
 /** Help's Show the tutorial: Settings closes and the World's tour plays again. */
 replayTutorial:()=>void}){
 const element=el('section','companion-info-section companion-settings');element.dataset.section='Settings';
 const list=el('nav','companion-settings-list'),detail=el('div','companion-settings-detail');
 list.setAttribute('aria-label','Settings');detail.setAttribute('aria-live','polite');
 // The list scrolls on short windows; the version line under it stays in view.
 const side=el('div','companion-settings-side');side.append(list);
 element.append(side,detail);
 const guide=createPanelGuide();
  let selected='',ticket=0;
 // Run when the page on show is left, so its window listeners go with it.
 const leaving:(()=>void)[]=[];
 const note=(text:string)=>el('p','companion-info-note',text);
 const subhead=(text:string)=>el('h5','companion-settings-subhead',text);
 const modelRefresh=()=>window.dispatchEvent(new Event('worldlet:model-refresh'));
 const status=()=>{const s=el('p','companion-settings-status');s.setAttribute('role','status');return s;};
 function action(label:string,run:(b:HTMLButtonElement)=>Promise<unknown>|void,{primary=false,id=''}={}){
  const b=el('button','companion-info-action'+(primary?' primary':''),label) as HTMLButtonElement;b.type='button';if(id)b.dataset.action=id;
  b.onclick=async()=>{if(b.disabled)return;b.disabled=true;try{await run(b);}finally{if(b.isConnected)b.disabled=false;}};
  return b;
 }
 const browserCommand=(operation:string,args:any={})=>call('browserCommand',{operation,args,agent:false});
 // Saved passwords of the built-in browser (core/browser/saved-logins.ts, owner request 2026-10-07): each site and
 // account, never the password, with Delete. A host that keeps none (the practice world, no keychain) leaves it out.
 async function savedLogins(target:HTMLElement){
  const turn=ticket,command=browserCommand;
  const box=el('div','companion-settings-logins'),said=status();
  async function draw(){
   const listed=await command('logins').catch(()=>null);if(turn!==ticket)return;
   if(!listed?.available||!Array.isArray(listed.logins)){box.remove();return;}
   const rows=el('div','companion-settings-rows');
   for(const login of listed.logins as {site:string;username:string}[]){
    const row=el('div','companion-settings-row'),words=el('div');row.dataset.site=login.site;
    words.append(el('strong','',login.site),el('span','',login.username||'No username'));
    row.append(words,action('Delete',async()=>{said.textContent='';try{await command('loginDelete',{site:login.site,username:login.username});await draw();said.textContent='Deleted the password for '+login.site+'.';}catch(e){said.textContent='Could not delete: '+((e as Error).message||'try again.');}},{id:'delete-login'}));
    rows.append(row);
   }
   box.replaceChildren(subhead('Saved passwords'),
    note(listed.logins.length?'Kept on this computer, locked with your system keychain. Fox never sees them.':'After you sign in to a website in the Browser, Worldlet offers to save the password and fills it in next time.'),rows,said);
  }
  target.append(box);await draw();
 }
 // What the built-in browser recorded (core/browser/web-record.ts): how many sites, and deleting one
 // site's or all of them. Each delete asks again here, in the page; nothing is deleted until confirmed.
 // Hosts without recordings answer with an error and the section stays away.
 async function recordings(target:HTMLElement){
  const turn=ticket,command=browserCommand;
  const box=el('div','companion-settings-recordings'),said=status();
  let sites:{site:string;visits:number}[]=[];
  const confirmRow=(question:string,label:string,run:()=>Promise<void>)=>{
   const row=el('div','companion-settings-confirm');row.setAttribute('role','group');row.setAttribute('aria-label',question);
   row.append(el('span','',question),action(label,async()=>{said.textContent='';try{await run();}catch(e){said.textContent='Could not delete: '+((e as Error).message||'try again.');}},{primary:true,id:'confirm-delete-recordings'}),action('Keep',()=>void draw()));
   return row;
  };
  const deleted=async(args:any,where:string)=>{const result=await command('deleteRecordings',args);await draw();said.textContent=result?.deleted?'Deleted '+result.deleted+' '+(result.deleted===1?'visit':'visits')+where+'.':'Nothing was left to delete.';};
  async function draw(stage:''|'site'|'all'=''){
   const listed=await command('recordings').catch(()=>null);if(turn!==ticket)return;
   if(!listed||!Array.isArray(listed.sites)){box.remove();return;}
   sites=listed.sites;const visits=sites.reduce((sum,s)=>sum+s.visits,0);
   const summary=el('div','companion-settings-row'),words=el('div');
   words.append(el('strong','',sites.length?sites.length+' '+(sites.length===1?'site':'sites'):'Nothing recorded'),el('span','',sites.length?visits+' '+(visits===1?'visit':'visits'):'Pages you visit in Worldlet’s browser show up here.'));
   summary.append(words);
   if(sites.length&&!stage)summary.append(action('Delete for a site…',()=>void draw('site'),{id:'delete-site-recordings'}),action('Delete all',()=>void draw('all'),{id:'delete-all-recordings'}));
   box.replaceChildren(subhead('Browsing recordings'),note('What you see and do in Worldlet’s browser is kept so Fox can find it later. Network data goes after 30 days; page text, typing and clicks stay until you delete them.'),summary);
   if(stage==='site'&&sites.length){
    const choose=el('select','companion-settings-select') as HTMLSelectElement;choose.setAttribute('aria-label','Site');
    for(const s of sites)choose.append(Object.assign(document.createElement('option'),{value:s.site,textContent:s.site+' · '+s.visits+' '+(s.visits===1?'visit':'visits')}));
    const ask=el('div');
    const question=()=>ask.replaceChildren(confirmRow('Delete everything recorded on '+choose.value+'? This can’t be undone.','Delete',()=>deleted({site:choose.value},' from '+choose.value)));
    choose.onchange=question;question();
    box.append(choose,ask);
   }
   if(stage==='all'&&sites.length)box.append(confirmRow('Delete everything recorded on '+(sites.length===1?sites[0].site:'all '+sites.length+' sites')+'? This can’t be undone.','Delete all',()=>deleted({all:true},'')));
  }
  target.append(box,said);
  await draw();
 }
 // The update channel (core/distribution/update-channel.ts): Dev, Alpha, Beta and Production, the release stages.
 // Only the owner's installed copy shows the switcher (`switchable`); the Dev app and everyone else see the channel
 // they follow and nothing to change. Only the channels this copy can follow can be chosen; the host says why not.
 async function updates(target:HTMLElement){
  const turn=ticket,rows=el('div','companion-settings-rows'),said=status(),about=note('');
  let state=await call('appUpdate',{operation:'status'});if(turn!==ticket)return;
  const draw=()=>{
   const installed=state?.installed?.build?['Worldlet',displayReleaseVersion(state.installed.version||'',state.installed.build),'· Build '+state.installed.build].filter(Boolean).join(' '):'';
   about.textContent=[installed,state?.channelNote||''].filter(Boolean).join('. ');
   said.textContent=['checking','downloading','preparing','current','available','ready','error','installing'].includes(state?.state)?(state.detail||state.label||''):'';
   rows.replaceChildren();
   if(!state?.switchable){
    const c=(state?.channels||[]).find((o:any)=>o.id===state?.channel);
    if(c){const row=el('div','companion-settings-row'),words=el('div');row.dataset.channel=c.id;
     words.append(el('strong','',`${c.name} · ${c.stage}`),el('span','',c.summary));row.append(words);rows.append(row);}
    return;
   }
   for(const c of state?.channels||[]){
    const row=el('div','companion-settings-row'),words=el('div'),on=c.id===state.channel;row.dataset.channel=c.id;
    words.append(el('strong','',`${c.name} · ${c.stage}`),el('span','',c.available||on?c.summary:`${c.summary} ${c.reason||''}`.trim()));
    const b=action(on?'Following':'Follow',async()=>{
     said.textContent='';
     try{state=await call('appUpdate',{operation:'channel',channel:c.id});draw();void showVersion();}
     catch(e){said.textContent=(e as Error).message||'Could not change the update channel.';}
    },{id:'channel-'+c.id});
    b.disabled=on||!c.available;if(on)b.setAttribute('aria-pressed','true');
    row.append(words,b);rows.append(row);
   }
  };
  const changed=(event:Event)=>{if(turn!==ticket||!target.isConnected){window.removeEventListener('worldlet:app-update',changed);return;}state={...state,...(event as CustomEvent).detail};draw();};
  window.addEventListener('worldlet:app-update',changed);leaving.push(()=>window.removeEventListener('worldlet:app-update',changed));
  draw();
  target.append(about,rows,...state?.switchable?[note('Moving to a steadier channel installs its newest build at the next update, even when it is older than this one. Your world and accounts stay as they are.')]:[],
   action('Check for updates',async()=>{said.textContent='Checking…';try{state=await call('appUpdate',{operation:'check'});draw();}catch(e){said.textContent=(e as Error).message||'Could not check for updates.';}},{id:'check-updates'}),said);
 }
 const restartFox=async(said:HTMLElement)=>{said.textContent='Restarting Fox…';try{await call('restartFox');window.location.reload();}catch(e){said.textContent='Could not restart: '+((e as Error).message||'reopen Worldlet and try again.');}};
 // A Fox preference screen, drawn in the details instead of the bubble.
 // Each screen has a guide of its own, so one section can show two of them.
 const screen=(name:string)=>async(target:HTMLElement)=>{
  const own=createPanelGuide();target.append(own.element);
  await createFoxPreferences({call,view:own.view,setup:()=>{},toggleSample:()=>host()?.toggleSample?.(),embedded:true}).show(name);
 };
 // The model Fox thinks with (owner request 2026-10-05). Worldlet provides none: it is the person's Agent, answering
 // on its own sign-in with the provider chosen below.
 // This is the one place to connect it and to see and fix what is wrong with it (owner request 2026-10-06):
 // which path is in use, its model, the last reply's problem in plain words, and the fix for it.
 async function ownAgentPage(target:HTMLElement){
  let showElsewhere=false;
  const turn=ticket,said=status(),now=el('div','companion-settings-row companion-settings-model-now'),words=el('div'),fixes=el('div','companion-settings-actions'),agents=el('div','companion-settings-rows'),providers=el('div','companion-settings-rows');
  now.append(words);
  // Signing in happens in the Agent itself, from its provider list below (Worldlet sets nothing up under the Agent).
  const fixButton=(fix:ModelFix)=>fix==='connect'?action('Sign in to a provider',async()=>{
    if(!providers.childElementCount){said.textContent='Sign in to a provider in your Agent itself, then choose Check connection.';return;}
    providers.scrollIntoView({block:'nearest'});(providers.querySelector('button') as HTMLButtonElement|null)?.focus();
   },{primary:true,id:'fix-connect'})
   :action('Restart Fox',()=>restartFox(said),{primary:true,id:'fix-restart'});
  // The provider the Agent in use answers with (core/agent/model-providers.ts, owner decisions 2026-10-10): only a
  // provider is chosen, never a model; each maps to small, balanced and large models and Fox's turns use the balanced
  // one. Every provider the Agent supports is listed, signed in or not; signing in happens in the Agent itself.
  const drawProviders=async()=>{
   const found=await call('agentHarness',{operation:'providers'}).catch(()=>null);
   if(turn!==ticket)return;
   providers.replaceChildren();
   const list=Array.isArray(found?.providers)?found.providers.filter((p:any)=>typeof p?.id==='string'&&typeof p?.name==='string'):[];
   if(typeof found?.agent!=='string'||!list.length)return;
   const title=typeof found.title==='string'?found.title:'your Agent',chosen=typeof found.chosen==='string'?found.chosen:null;
   const choose=(id:string|null,name:string)=>async()=>{
    said.textContent='';
    try{await call('agentHarness',{operation:'provider',id});modelRefresh();said.textContent=id?`Fox now answers with ${name}.`:`Fox now answers with ${title}’s own setting.`;await drawProviders();}
    catch(e){said.textContent=(e as Error).message||'Could not change the provider.';}
   };
   providers.append(subhead('Provider'));
   const own=el('div','companion-settings-row'),ownText=el('div');own.dataset.provider='own';
   ownText.append(el('strong','',`${title}’s own setting`+(chosen===null?' · In use':'')),el('span','',`Whatever ${title} is set to use.`));
   own.append(ownText,...chosen===null?[]:[action('Use',choose(null,title),{id:'provider-own'})]);providers.append(own);
   for(const p of list){
    const row=el('div','companion-settings-row'),text=el('div'),on=chosen===p.id,signedOut=p.signedIn===false;row.dataset.provider=p.id;
    text.append(el('strong','',p.name+(on?' · In use':'')),el('span','',signedOut?`Not signed in to it in ${title} yet.`:typeof p.account==='string'?p.account:''));
    const button=signedOut?p.signIn===true?action('Sign in',async()=>{
     // Claude Code signs in in the browser with Worldlet running it (`background`); the others open in Terminal.
     said.textContent=found.agent==='claude-code'?`Approve the sign-in to ${p.name} in your browser.`:`${title} opens in Terminal to sign in to ${p.name}. When it is done, choose Check connection.`;
     try{const result=await call('agentHarness',{operation:'provider-sign-in',id:p.id});if(result?.background){said.textContent=`${title} is signed in to ${p.name}.`;modelRefresh();await drawProviders();}}
     catch(e){said.textContent=(e as Error).message||'Could not open the sign-in.';}
    },{id:'sign-in-'+p.id}):null:on?null:action('Use',choose(p.id,p.name),{id:'provider-'+p.id});
    row.append(text,...button?[button]:signedOut?[el('span','companion-settings-quiet',`Sign in to it in ${title}.`)]:[]);
    providers.append(row);
   }
  };
  // Stop using the Agent, the paired computer or the Gateway in use: Fox goes back to its own model connection.
  const stopUsing=(working:string,id:string)=>action('Stop using',async()=>{
   said.textContent=working;
   try{await call('agentHarness',{operation:'clear'});modelRefresh();said.textContent='';await draw();}
   catch(e){said.textContent=(e as Error).message||'Could not switch.';}
  },{id});
  const draw=async()=>{
   void drawProviders();
   const [health,found]=await Promise.all([call('modelHealth').catch(()=>null),call('agentHarness',{operation:'detect'}).catch(()=>null)]);
   if(turn!==ticket)return;
   const list=Array.isArray(found?.agents)?found.agents.filter((a:any)=>typeof a?.id==='string'&&typeof a?.title==='string'):[];
   const inUse=typeof found?.selected==='string'?found.selected:null;
   const view=modelHealthView(health,list.find((a:any)=>a.id===inUse)?.title??null);
   now.dataset.state=view.state==='ok'?'ready':view.state;now.dataset.path=view.path;
   words.replaceChildren(el('strong','',view.title),el('span','',view.detail),...view.problem?[el('span','companion-settings-model-problem',view.problem)]:[]);
   fixes.replaceChildren(...view.fixes.map(fixButton),
    action('Check connection',async()=>{said.textContent='Checking…';await draw();said.textContent='Checked just now.';},{id:'check-model'}));
   agents.replaceChildren();
   if(list.length)agents.append(subhead('On this computer'));
   for(const agent of list){
    const using=inUse===agent.id,row=el('div','companion-settings-row'),text=el('div');row.dataset.agent=agent.id;
    text.append(el('strong','',agent.title+(using?' · In use':'')),el('span','',agent.id==='codex'?(agent.model===false?'Sign in to Codex on this computer first.':'Your ChatGPT plan through Codex.'):agent.memory?.model?'Runs on its own API key.':'Answers for Fox on its own sign-in.'),
     // What the Agent can do beyond World tools, which Fox offers in conversation (its own tools, under its own approvals).
     ...using&&typeof agent.canAlso==='string'&&agent.canAlso?[el('span','companion-settings-quiet',agent.canAlso)]:[]);
    // Older than Worldlet works with (core/agent/agent-versions.ts): its own update command opens in Terminal instead of
    // Use; Worldlet never updates it by itself. Check again reads its version afresh.
    const version=agent.version&&typeof agent.version==='object'?agent.version:null,old=version?.outdated===true;
    if(old)text.append(el('span','companion-settings-model-problem',`Version ${version.current} is too old. Worldlet needs ${version.minimum} or newer.`),...version.update?[]:[el('span','companion-settings-quiet',String(version.howTo||''))]);
    const update=old&&version.update?action('Update',async()=>{
     said.textContent=`${agent.title} opens in Terminal to update. When it is done, choose Check again.`;
     try{await call('agentHarness',{operation:'update',id:agent.id});}catch(e){said.textContent=(e as Error).message||'Could not open the update.';}
    },{primary:true,id:'update-'+agent.id}):null;
    const recheck=old?action('Check again',async()=>{said.textContent='Checking…';await call('agentHarness',{operation:'detect',fresh:true}).catch(()=>null);said.textContent='';await draw();},{id:'recheck-'+agent.id}):null;
    const b=using?stopUsing('Fox goes back to its own model connection…','stop-'+agent.id):action('Use',async()=>{
     said.textContent='Switching to '+agent.title+'…';
     try{
      await call('agentHarness',{operation:'select',id:agent.id});
      if(agent.memory)await call('localAgent',{operation:'adopt',id:agent.id});
      await call('agentIntegrations',{operation:'port',id:agent.id}).catch(()=>null);
      modelRefresh();said.textContent='';await draw();
     }catch(e){said.textContent=(e as Error).message||'Could not switch.';}
    },{id:'use-'+agent.id});
    row.append(text,...update?[update]:[],...recheck?[recheck]:[],...using||!old?[b]:[]);agents.append(row);
   }
   // A Hermes Agent whose command does not start (a half-finished install) is not offered to Use; Install again runs the
   // official installer, which repairs it, then chooses it (Windows Beta 4384, 2026-10-13: it stayed chosen, and every
   // background turn failed on it).
   if(found?.brokenHermes===true){
    if(!list.length)agents.append(subhead('On this computer'));
    const row=el('div','companion-settings-row'),text=el('div');row.dataset.agent='hermes';
    text.append(el('strong','','Hermes Agent'+(inUse==='hermes'?' · In use':'')),el('span','companion-settings-model-problem','It is on this computer but does not start. Install again sets it up the official way.'));
    row.append(text,action('Install again',async()=>{
     said.textContent='Installing Hermes Agent again. This takes a few minutes…';
     try{await call('agentHarness',{operation:'install-hermes'});await call('agentHarness',{operation:'select',id:'hermes'});modelRefresh();said.textContent='';await draw();}
     catch(e){said.textContent=(e as Error).message||'Could not install Hermes Agent.';}
    },{primary:true,id:'reinstall-hermes'}));
    agents.append(row);
   }
   // The provider of the Agent in use comes right under the Agents here.
   agents.append(providers);
   // An Agent on another computer and an OpenClaw Gateway are for few people: folded away unless one is in use.
   const elsewhere=el('details','companion-settings-elsewhere') as HTMLDetailsElement;elsewhere.append(el('summary','','Other ways to connect'));
   elsewhere.ontoggle=()=>{showElsewhere=elsewhere.open;};
   // An Agent on another computer (core/phone/README.md#another-computers-agent): the code from Worldlet there pairs
   // this one with it, and Fox's conversation runs on it; this World stays here.
   const remote=found?.remote,row=el('div','companion-settings-row'),text=el('div');row.dataset.agent='remote';
   if(remote&&typeof remote.computer==='string'){
    const away=!remote.seenAt||Date.now()-remote.seenAt>120_000;
    text.append(el('strong','',`Agent on ${remote.computer} · In use`),el('span','',away?`${remote.computer} is away. Fox answers once it is awake with Worldlet open.`:'Fox’s conversation runs there. Your apps and Attention Center stay on this computer.'));
    row.append(text,stopUsing('Ending the pairing…','stop-remote'));
   }else{
    const code=document.createElement('input');code.className='companion-settings-input';code.placeholder='worldlet://agent?…';code.spellcheck=false;code.autocomplete='off';code.setAttribute('aria-label','Code from Worldlet on your other computer');
    text.append(el('strong','','My Agent is on another computer'),el('span','','On that computer, open Settings › Phone › Pair another computer, then paste its code here.'),code);
    row.append(text,action('Pair',async()=>{
     said.textContent='Pairing with your other computer…';
     try{const result=await call('agentHarness',{operation:'pair',link:code.value.trim()});modelRefresh();said.textContent=`Fox now uses your Agent on ${result?.remote?.computer||'your other computer'}.`;await draw();}
     catch(e){said.textContent=(e as Error).message||'Could not pair.';}
    },{id:'pair-remote'}));
   }
   elsewhere.append(row);
   // An OpenClaw Gateway on another computer, reached directly with its address and token, nothing of Worldlet there
   // (core/phone/README.md#an-agent-gateway-on-another-computer). The token goes to the host's vault and never comes back.
   const gateway=found?.gateway&&typeof found.gateway.host==='string'?found.gateway:null,gRow=el('div','companion-settings-row'),gText=el('div');gRow.dataset.agent='gateway';
   const connect=async(request:Record<string,unknown>)=>{
    said.textContent='Connecting to your Gateway…';
    try{const result=await call('agentHarness',{operation:'gateway',...request});modelRefresh();said.textContent=`Fox now uses OpenClaw at ${result?.gateway?.host||'your Gateway'}.`;await draw();}
    catch(e){said.textContent=(e as Error).message||'Could not connect.';}
   };
   const forget=action('Forget',async()=>{
    try{await call('agentHarness',{operation:'forget-gateway'});modelRefresh();said.textContent='The Gateway and its token are forgotten.';await draw();}
    catch(e){said.textContent=(e as Error).message||'Could not forget it.';}
   },{id:'forget-gateway'});
   if(gateway?.active){
    gText.append(el('strong','',`OpenClaw at ${gateway.host} · In use`),el('span','','Fox talks to that Gateway directly; nothing of Worldlet runs there. Your apps and Attention Center stay on this computer.'));
    gRow.append(gText,stopUsing('Fox goes back to its own model connection…','stop-gateway'),forget);
   }else{
    const address=document.createElement('input');address.className='companion-settings-input';address.placeholder='https://gateway.example.com';address.spellcheck=false;address.autocomplete='off';address.value=gateway?.url??'';address.setAttribute('aria-label','Gateway address');
    const token=document.createElement('input');token.className='companion-settings-input';token.type='password';token.placeholder=gateway?'Saved token (type a new one to replace it)':'Gateway token';token.autocomplete='off';token.setAttribute('aria-label','Gateway token');
    gText.append(el('strong','','My OpenClaw Gateway is on another computer'),el('span','','Its address and its access token, both from that OpenClaw.'),address,token);
    gRow.append(gText,action(gateway?'Use':'Connect',()=>connect({url:address.value.trim(),token:token.value}),{id:'connect-gateway'}),...gateway?[forget]:[]);
   }
   elsewhere.append(gRow);elsewhere.open=showElsewhere||!!(remote&&typeof remote.computer==='string')||!!gateway?.active;
   agents.append(elsewhere);
  };
  // The connection steps open under the buttons; a new connection redraws what Fox runs on.
  const changed=()=>{if(turn!==ticket||!target.isConnected){for(const name of MODEL_EVENTS)window.removeEventListener(name,changed);return;}void draw();};
  for(const name of MODEL_EVENTS)window.addEventListener(name,changed);
  // Your Agent's page is five named parts in this order, each with one plain line (owner decision 2026-10-11, issue #674):
  // Model (what Fox runs on), then what lives in the Agent and Worldlet only shows and changes its way: Skills, Routines
  // (the same jobs as the Task panel's Routines), Permissions (its standing rules) and, last, Connections (Worldlet's own,
  // then the Agent's tools and chat accounts). What it remembers is in Context; what each Agent may do is on Agents' list.
  const live=()=>turn===ticket&&target.isConnected;
  const model=part('model','Model','The Agent Fox thinks with, on its own sign-in, and the provider it answers with.');
  const skills=part('skills','Skills','Steps your Agent follows for tasks it knows how to do. They live in your Agent; Worldlet changes them only with its own commands.');
  const routines=part('routines','Scheduled','What your Agent does on its own schedule, the same Scheduled tasks as in the Task panel. Worldlet changes them only with its own commands.');
  const permissions=part('permissions','Permissions','What your Agent may do without asking you first, from each time you chose Always on an approval card.');
  const accounts=part('accounts','Connections','What Worldlet reads on this computer, then the tools and chat accounts set up in your Agent.');
  // A request for Fox (set up or change a routine, forget something) goes to its conversation with the panel closed.
  const ask=(text:string)=>{close();window.dispatchEvent(new CustomEvent('worldlet:fox-ask',{detail:{text}}));};
  model.append(now,fixes,guide.element,agents,said);
  // Back to every Agent, then the page: its name is what the header says once it is known.
  const back=action('‹ All Agents',()=>void show('agents'),{id:'agents-back'}),title=el('h5','companion-settings-own-title','Your Agent');
  const header=el('div','companion-settings-own-head');header.dataset.view='own-agent';header.append(back,title);
  void ownAgent().then(own=>{if(live())title.textContent=own.title;});
  target.append(header,model,skills,routines,permissions,accounts);
  await Promise.all([draw(),showAgentSkills(skills,call,live),showAgentRoutines(routines,call,live,{ask}),showAgentPermissions(permissions,call,live),showWorldletAccounts(accounts,call,live)]);
 }
 const part=(id:string,heading:string,line:string)=>{const box=el('section','companion-settings-part');box.dataset.part=id;box.append(el('h5','companion-settings-parthead',heading),el('p','companion-info-note companion-settings-partnote',line));return box;};
 // The Agent Fox works through, as Agents' list names it (agent-access.ts OwnAgent): the one chosen on this computer,
 // the paired computer's or Gateway's, else Fox's own Hermes Agent; with how it is doing, in plain words.
 async function ownAgent():Promise<Omit<OwnAgent,'open'>>{
  const [health,found]=await Promise.all([call('modelHealth').catch(()=>null),call('agentHarness',{operation:'detect'}).catch(()=>null)]);
  const list=Array.isArray(found?.agents)?found.agents:[],selected=typeof found?.selected==='string'?found.selected:null;
  const chosen=list.find((a:any)=>a?.id===selected),view=modelHealthView(health,typeof chosen?.title==='string'?chosen.title:null);
  const away=health?.location?.kind==='remote'&&typeof health.location.computer==='string'?health.location.computer:null;
  const title=typeof chosen?.title==='string'?chosen.title:away?`Your Agent on ${away}`:health?.agent==='hermes'?'Hermes Agent':'Your Agent';
  return {harness:selected??(away?null:typeof health?.agent==='string'?health.agent:null),title,
   line:view.state==='ok'?'Fox works through it. It may do what you ask Fox, and asks you before it changes anything.':view.title+'.'};
 }
 // Agents (issue #674): every Agent that reaches this World in one list, your own Agent first with Open for its page;
 // then using the World in Claude or ChatGPT, and Remote access (its address, Turn off and tokens) folded below.
 async function agentsSetting(target:HTMLElement,at:string){
  if(OWN_PARTS.includes(at))return ownAgentPage(target);
  const turn=ticket,live=()=>turn===ticket&&target.isConnected;
  const list=part('access','Connected to your World','Your own Agent and every other Agent that reaches your World: what each may do, what it did lately, and Revoke.');
  const remote=el('details','companion-settings-elsewhere companion-settings-remote-access') as HTMLDetailsElement;remote.dataset.part='remote';
  remote.append(el('summary','','Remote access'));
  const claude=el('div');claude.dataset.part='use-in-claude';
  target.append(list,claude,remote);
  const own=await ownAgent();if(!live())return;
  await Promise.all([showAgentAccess(list,call,live,{own:{...own,open:()=>void show('agents','model')}}),showUseInClaude(claude,call,live),showRemoteAccess(remote,call,live)]);
 }
 // One list, in the order a person looks for things (owner request 2026-10-10: no tabs, nothing technical): the three
 // areas first (issue #674), connectors on one side, Agents on the other, and everything the World keeps in one place;
 // then, smaller, Fox, Phone, General and Help.
 const items:Item[]=[
  // The services Worldlet connects itself, one tile each, with keys folded under Advanced (connectors-page.ts).
  {id:'connectors',label:'Connectors',hint:'The services your World reads',show:async target=>{const turn=ticket;await showConnectors(target,call,()=>turn===ticket&&target.isConnected);}},
  {id:'agents',label:'Agents',hint:'Who uses your World, and what each may do',show:agentsSetting},
  // Everything the World keeps (world-context-page.ts), with what each Agent and Fox remember.
  {id:'context',label:'Context',hint:'Everything your World keeps',show:async target=>{const turn=ticket,live=()=>turn===ticket&&target.isConnected;
   const memory=part('memory','Memory','What Fox and your Agent remember about you and your work. Your Agent’s memory lives in your Agent; Worldlet only shows it.');
   memory.append(pages.knows);
   await showWorldContext(target,call,live,{memory,localDeletion:()=>!!host()?.localDataDeletion(),sample:()=>!!host()?.sample(),
    openJournal:()=>{close();window.dispatchEvent(new CustomEvent('worldlet:journal-open',{detail:{}}));}});
   await showAgentMemory(memory,call,live,{ask:text=>{close();window.dispatchEvent(new CustomEvent('worldlet:fox-ask',{detail:{text}}));}});
  }},
  {id:'fox',label:'Fox',hint:'Name, look and personality',page:true,minor:true,show:target=>{target.append(pages.fox);}},
  {id:'phone',label:'Phone',hint:'Attention and Fox on your phone',page:true,minor:true,show:target=>{target.append(pages.phone);}},
  {id:'general',label:'General',hint:'Updates, start at login, default browser, usage counts',minor:true,show:async target=>{
   target.append(subhead('Updates'));await updates(target);
   // The one privacy choice left after the Privacy section went (owner request 2026-10-10): the website's privacy page
   // promises that usage counts can be turned off, and off stops all reporting.
   {
    const turn=ticket,said=status(),row=el('div','companion-settings-row'),words=el('div');row.dataset.setting='usage-analytics';
    const draw=async()=>{
     const info=await call('foxPreferences').catch(()=>null);if(turn!==ticket)return;
     const on=info?.usageAnalyticsEnabled===true;
     words.replaceChildren(el('strong','',on?'Sharing basic usage counts':'Not sharing usage counts'),el('span','',on?'Setup, connection and feature counts, never what you write, read or browse. Turning it off stops all reporting.':'Nothing about how you use Worldlet leaves this computer.'));
     row.replaceChildren(words,action(on?'Stop sharing':'Share',async()=>{said.textContent='';try{await call('foxPreferenceChange',{setting:'usage_analytics',value:!on});await draw();}catch(e){said.textContent=(e as Error).message||'Could not change it.';}},{id:'usage-analytics'}));
    };
    target.append(subhead('Usage counts'),row,said);await draw();
   }
   target.append(subhead('Open at login'));await screen('login')(target);
   // Off until turned on (owner request 2026-10-12): links from other apps then open in their own Thing or the Browser.
   {
    const turn=ticket,said=status(),row=el('div','companion-settings-row'),words=el('div');row.dataset.setting='default-browser';
    const draw=async()=>{
     const info=await call('defaultBrowser').catch(()=>null);if(turn!==ticket||!info)return;
     const on=info.status==='on';
     words.replaceChildren(el('strong','',on?'Worldlet is your default browser':'Worldlet is not your default browser'),el('span','',defaultBrowserText(info.status,info.platform)));
     row.replaceChildren(words);
     if(info.status!=='unsupported')row.append(action(on?'Stop using':'Use Worldlet',async()=>{said.textContent='';try{await call('defaultBrowser',{operation:'set',enabled:!on});await draw();}catch(e){said.textContent=(e as Error).message||'Could not change it.';}},{id:'default-browser'}));
    };
    // The Mac's confirmation or a choice in Windows Settings lands later; the host says when the status moved.
    const moved=()=>{if(!row.isConnected){window.removeEventListener('worldlet:default-browser',moved);return;}void draw();};
    window.addEventListener('worldlet:default-browser',moved);
    target.append(subhead('Default browser'),row,said);await draw();
   }
   // The Browser's own settings, folded away (owner request 2026-10-11: Settings has too much).
   const general=target;
   {
    const browser=el('details','companion-settings-elsewhere') as HTMLDetailsElement;browser.dataset.setting='browser';
    browser.append(el('summary','','Browser'));target.append(browser);target=browser;
    target.append(subhead('Browser home page'));
    const home=createBrowserHome(host()?.sample()?null:(()=>{try{return globalThis.localStorage;}catch{return null;}})()),said=status();
    const input=el('input','companion-settings-input') as HTMLInputElement;input.type='url';input.value=home.get();input.setAttribute('aria-label','Home page');input.spellcheck=false;input.autocapitalize='off';
    const save=()=>{const page=home.set(input.value);if(!page){said.textContent='Type a website address, like google.com.';return;}input.value=page;said.textContent='The Browser starts here.';};
    input.addEventListener('keydown',event=>{if(event.key==='Enter')save();});
    target.append(note('Opening the Browser after '+BROWSER_HOME.idleMs/60_000+' minutes away starts on this page; within that time it is where you left it. Home in the Browser’s top bar goes here too.'),
     input,action('Save',save,{primary:true,id:'browser-home-save'}),action('Use Google',()=>{input.value=home.set('')||'';said.textContent='The Browser starts on Google.';},{id:'browser-home-reset'}),said);
    void savedLogins(target);
    // What the built-in browser recorded, with Delete, sits with the Browser now the Privacy section is gone.
    if(!host()?.sample())await recordings(target);
   }
   target=general;
   // Only inside the sample world, as the way back to one's own (owner request 2026-10-10: no sample switch otherwise).
   if(host()?.sample()){
    target.append(subhead('Sample world'));
    const on=!!host()?.sample(),said=status();
    const toggle=el('button','world-recovery-switch','Sample world') as HTMLButtonElement;toggle.type='button';toggle.setAttribute('role','switch');toggle.dataset.on=String(on);toggle.setAttribute('aria-checked',String(on));
    toggle.append(el('span','world-recovery-switch-state',on?'On':'Off'));
    toggle.onclick=async()=>{const toggleSample=host()?.toggleSample;if(!toggleSample)return;toggle.disabled=true;said.textContent='';try{await toggleSample();}catch(e){said.textContent=(e as Error).message||'Could not switch worlds.';toggle.disabled=false;}};
    target.append(note(on?'You are in the sample world. Turn it off to return to your own world.':'Look around a made-up world with sample mail, events and tasks. Your own world and accounts stay as they are.'),toggle,said);
   }
  }},
  {id:'help',label:'Help',hint:'Feedback, restart, reset',minor:true,show:target=>{
   const said=status();
   // The Debug window and every recorded event are for the Worldlet team: folded away (owner request 2026-10-10).
   const team=el('details','companion-settings-elsewhere') as HTMLDetailsElement;
   team.append(el('summary','','For the Worldlet team'),
    action('Open Debug',async()=>{try{close();await call('showDebug');}catch{said.textContent='Could not open Debug.';}}),
    subhead('Activity records'),note('Every event Worldlet recorded on this computer, newest first.'),records.records);
   team.ontoggle=()=>{if(team.open)records.showRecords();};
   // Feedback and the tutorial live here, not in the World's corners (owner request 2026-10-11),
   // one part each (owner request 2026-10-11: Settings has too much): feedback with its diagnostics file, the tutorial,
   // restarting Fox; the team's tools stay folded at the end.
   target.append(
    subhead('Feedback'),note('Tell the Worldlet team what works and what doesn’t. Type it, or hold Fox to say it. For a problem, save diagnostics too and send the file with it.'),
    action('Send feedback',()=>openFeedback(),{primary:true,id:'feedback'}),
    action('Save diagnostics',async()=>{try{await call('exportDiagnostics');}catch(e){said.textContent=(e as Error).message||'Could not save diagnostics.';}},{id:'diagnostics'}));
   // The practice world has no tour.
   if(!host()?.sample())target.append(subhead('Tutorial'),action('Show the tutorial',()=>replayTutorial(),{id:'tutorial'}));
   target.append(
    subhead('Restart Fox'),note('If Fox stops answering or seems stuck. Conversations, memory and connections are kept.'),
    action('Restart Fox',()=>restartFox(said),{id:'restart'}),
    subhead('Reset'),note('Reset erases Fox’s memory, your saved items and account connections on this computer, keeps your model setup, and starts setup again. You will be asked to confirm first.'),
    action('Reset',async()=>{said.textContent='';try{const result=await call('resetFox');if(result?.cancelled)return;window.location.reload();}catch(e){said.textContent='Could not reset: '+((e as Error).message||'reopen Worldlet and try again.');}},{id:'reset'}),said,team);
  }},
 ];
 // The version at a glance under the list (owner request 2026-10-04): 2026.MMDD.BUILD and the update channel.
 const version=el('div','companion-settings-version');version.setAttribute('aria-label','Version');
 async function showVersion(){
  const state=await call('appUpdate',{operation:'status'}).catch(()=>null);
  const installed=state?.installed,channel=(state?.channels||[]).find((c:any)=>c.id===state?.channel);
  version.textContent=installed?.version?['Worldlet '+displayReleaseVersion(installed.version,installed.build||undefined),channel?.name].filter(Boolean).join(' · '):'';
 }
 // Only while the line shows: an update event must not become an extra request in the background; open() reads it again.
 window.addEventListener('worldlet:app-update',()=>{if(version.offsetParent)void showVersion();});
 // The three areas, then a line, then the rest in smaller type.
 for(const item of items){
  if(item.minor&&!list.querySelector('.companion-settings-minor'))list.append(el('div','companion-settings-minor'));
  const b=el('button','companion-settings-item'+(item.minor?' is-minor':'')) as HTMLButtonElement;b.type='button';b.dataset.setting=item.id;
  b.append(el('strong','',item.label),el('span','',item.hint));b.onclick=()=>void show(item.id);list.append(b);
 }
 /** Shows section `id` (or the area an old name moved to) at `at`, one of its parts. */
 async function show(id:string,at=''){
  const moved=MOVED[id],part=at||moved?.part||'';
  const item=items.find(i=>i.id===(moved?.section??id))??items[0];selected=item.id;const turn=++ticket;
  for(const leave of leaving.splice(0))leave();
  for(const b of list.querySelectorAll<HTMLElement>('button'))if(b.dataset.setting===selected)b.setAttribute('aria-current','true');else b.removeAttribute('aria-current');
  guide.view.setGuide(null);onShow(item.id);
  // A companion page brings its own heading.
  const body=el('div','companion-settings-body');detail.replaceChildren(...item.page?[]:[el('h4','',item.label)],body);detail.classList.toggle('is-page',!!item.page);
  try{await item.show(body,part);}catch(e){if(turn===ticket)body.append(note((e as Error).message||'This setting is unavailable right now.'));}
  if(part&&turn===ticket)body.querySelector<HTMLElement>(`[data-part="${part}"]`)?.scrollIntoView({block:'start'});
 }
 return {element,
  /** The panel opened: show `setting`, else the section last chosen, or the first. */
  open(setting?:string){void show(setting||selected||items[0].id);side.append(version);void showVersion();},
  get selected(){return selected;},
  /** A companion page changed: show it again if it is the one open. */
  refresh(id:string){if(selected===id)void show(id);}};
}
