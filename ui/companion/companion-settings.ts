import {displayReleaseVersion} from '../../core/distribution/index.ts';
import {connectionLive,getApp} from '../../core/applets/index.ts';
import {BROWSER_HOME,createBrowserHome} from '../../core/browser/index.ts';
import {createFoxPreferences} from './fox-preferences.ts';
import {createPanelGuide} from './panel-guide.ts';
import {modelHealthView,type ModelFix} from './model-health.ts';
import {showApprovalRules} from './approval-rules.ts';
import {showAgentConnections} from './agent-connections.ts';

/** What the World view lends Settings: the sample world switch and which host features exist. */
export type CompanionSettingsHost={toggleSample?:()=>Promise<unknown>;sample:()=>boolean;localDataDeletion:()=>boolean};
type Item={id:string;label:string;hint:string;show:(detail:HTMLElement)=>void|Promise<void>};

const MODEL_EVENTS=['worldlet:model-changed','worldlet:model-refresh'];
// Disconnect exists for these; Google's three share one sign-in.
const DISCONNECTABLE=['gmail','google-calendar','notion','apple-notes','apple-reminders','todoist','google-drive'];

/** The Settings page works like a settings window: the list on the left, the chosen setting's
 * details on the right. Everything finishes here; nothing hands off to Fox's speech bubble. */
export function createCompanionSettings({call,host,history,close}:{call:(action:string,body?:any)=>Promise<any>;host:()=>CompanionSettingsHost|undefined;history:{records:HTMLElement;showRecords:()=>void};close:()=>void}){
 const el=(tag:string,cls='',text='')=>Object.assign(document.createElement(tag),{className:cls,textContent:text});
 const element=el('section','companion-info-section companion-settings');element.dataset.section='Settings';
 const list=el('nav','companion-settings-list'),detail=el('div','companion-settings-detail');
 list.setAttribute('aria-label','Settings');detail.setAttribute('aria-live','polite');
 // The list scrolls on short windows; the version line under it stays in view.
 const side=el('div','companion-settings-side');side.append(list);
 element.append(side,detail);
 const guide=createPanelGuide();
 const preferences=createFoxPreferences({call,view:guide.view,setup:()=>{},toggleSample:()=>host()?.toggleSample?.(),embedded:true});
 let selected='',ticket=0;
 const note=(text:string)=>el('p','companion-info-note',text);
 const status=()=>{const s=el('p','companion-settings-status');s.setAttribute('role','status');return s;};
 function action(label:string,run:(b:HTMLButtonElement)=>Promise<unknown>|void,{primary=false,id=''}={}){
  const b=el('button','companion-info-action'+(primary?' primary':''),label) as HTMLButtonElement;b.type='button';if(id)b.dataset.action=id;
  b.onclick=async()=>{if(b.disabled)return;b.disabled=true;try{await run(b);}finally{if(b.isConnected)b.disabled=false;}};
  return b;
 }
 // Saved passwords of the built-in browser (core/browser/saved-logins.ts, owner request 2026-10-07): each site and
 // account, never the password, with Delete. A host that keeps none (the practice world, no keychain) leaves it out.
 async function savedLogins(target:HTMLElement){
  const turn=ticket,command=(operation:string,args:any={})=>call('browserCommand',{operation,args,agent:false});
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
   box.replaceChildren(el('h5','companion-settings-subhead','Saved passwords'),
    note(listed.logins.length?'Kept on this computer, locked with your system keychain. Fox never sees them.':'After you sign in to a website in the Browser, Worldlet offers to save the password and fills it in next time.'),rows,said);
  }
  target.append(box);await draw();
 }
 // What the built-in browser recorded (core/browser/web-record.ts): how many sites, and deleting one
 // site's or all of them. Each delete asks again here, in the page; nothing is deleted until confirmed.
 // Hosts without recordings answer with an error and the section stays away.
 async function recordings(target:HTMLElement){
  const turn=ticket,command=(operation:string,args:any={})=>call('browserCommand',{operation,args,agent:false});
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
   box.replaceChildren(el('h5','companion-settings-subhead','Browsing recordings'),note('What you see and do in Worldlet’s browser is kept so Fox can find it later. Network data goes after 30 days; page text, typing and clicks stay until you delete them.'),summary);
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
  window.addEventListener('worldlet:app-update',changed);
  draw();
  target.append(about,rows,...state?.switchable?[note('Moving to a steadier channel installs its newest build at the next update, even when it is older than this one. Your world and accounts stay as they are.')]:[],
   action('Check for updates',async()=>{said.textContent='Checking…';try{state=await call('appUpdate',{operation:'check'});draw();}catch(e){said.textContent=(e as Error).message||'Could not check for updates.';}},{id:'check-updates'}),said);
 }
 // A Fox preference screen, drawn in the details instead of the bubble.
 const screen=(name:string)=>async(target:HTMLElement)=>{target.append(guide.element);await preferences.show(name);};
 // The model Fox thinks with (owner request 2026-10-05). Worldlet provides none: it is the person's Agent, answering
 // on its own sign-in with the provider chosen below.
 // This is the one place to connect it and to see and fix what is wrong with it (owner request 2026-10-06):
 // which path is in use, its model, the last reply's problem in plain words, and the fix for it.
 async function modelSetting(target:HTMLElement){
  const turn=ticket,said=status(),now=el('div','companion-settings-row companion-settings-model-now'),words=el('div'),fixes=el('div','companion-settings-actions'),agents=el('div','companion-settings-rows'),providers=el('div','companion-settings-rows');
  now.append(words);
  // Signing in happens in the Agent itself, from its provider list below (Worldlet sets nothing up under the Agent).
  const fixButton=(fix:ModelFix)=>fix==='connect'?action('Sign in to a provider',async()=>{
    if(!providers.childElementCount){said.textContent='Sign in to a provider in your Agent itself, then choose Check connection.';return;}
    providers.scrollIntoView({block:'nearest'});(providers.querySelector('button') as HTMLButtonElement|null)?.focus();
   },{primary:true,id:'fix-connect'})
   :fix==='update'?action('Show updates',()=>show('updates'),{primary:true,id:'fix-update'})
   :action('Restart Fox',async()=>{said.textContent='Restarting Fox…';try{await call('restartFox');window.location.reload();}catch(e){said.textContent='Could not restart: '+((e as Error).message||'reopen Worldlet and try again.');}},{primary:true,id:'fix-restart'});
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
    try{await call('agentHarness',{operation:'provider',id});window.dispatchEvent(new Event('worldlet:model-refresh'));said.textContent=id?`Fox now answers with ${name}.`:`Fox now answers with ${title}’s own setting.`;await drawProviders();}
    catch(e){said.textContent=(e as Error).message||'Could not change the provider.';}
   };
   providers.append(el('h5','companion-settings-subhead','Provider'));
   const own=el('div','companion-settings-row'),ownText=el('div');own.dataset.provider='own';
   ownText.append(el('strong','',`${title}’s own setting`+(chosen===null?' · In use':'')),el('span','',`Whatever ${title} is set to use.`));
   own.append(ownText,...chosen===null?[]:[action('Use',choose(null,title),{id:'provider-own'})]);providers.append(own);
   for(const p of list){
    const row=el('div','companion-settings-row'),text=el('div'),on=chosen===p.id,signedOut=p.signedIn===false;row.dataset.provider=p.id;
    text.append(el('strong','',p.name+(on?' · In use':'')),el('span','',signedOut?`Not signed in to it in ${title} yet.`:typeof p.account==='string'?p.account:''));
    const button=signedOut?p.signIn===true?action('Sign in',async()=>{
     said.textContent=`${title} opens in Terminal to sign in to ${p.name}. When it is done, choose Check connection.`;
     try{await call('agentHarness',{operation:'provider-sign-in',id:p.id});}catch(e){said.textContent=(e as Error).message||'Could not open the sign-in.';}
    },{id:'sign-in-'+p.id}):null:on?null:action('Use',choose(p.id,p.name),{id:'provider-'+p.id});
    row.append(text,...button?[button]:signedOut?[el('span','companion-settings-quiet',`Sign in to it in ${title}.`)]:[]);
    providers.append(row);
   }
  };
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
   if(list.length)agents.append(el('h5','companion-settings-subhead','On this computer'));
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
    const b=using?action('Stop using',async()=>{
     said.textContent='Fox goes back to its own model connection…';
     try{await call('agentHarness',{operation:'clear'});window.dispatchEvent(new Event('worldlet:model-refresh'));said.textContent='';await draw();}
     catch(e){said.textContent=(e as Error).message||'Could not switch.';}
    },{id:'stop-'+agent.id}):action('Use',async()=>{
     said.textContent='Switching to '+agent.title+'…';
     try{
      await call('agentHarness',{operation:'select',id:agent.id});
      if(agent.memory)await call('localAgent',{operation:'adopt',id:agent.id});
      await call('agentIntegrations',{operation:'port',id:agent.id}).catch(()=>null);
      window.dispatchEvent(new Event('worldlet:model-refresh'));said.textContent='';await draw();
     }catch(e){said.textContent=(e as Error).message||'Could not switch.';}
    },{id:'use-'+agent.id});
    row.append(text,...update?[update]:[],...recheck?[recheck]:[],...using||!old?[b]:[]);agents.append(row);
   }
   // The provider of the Agent in use comes right under the Agents here.
   agents.append(providers);
   // An Agent on another computer (core/phone/README.md#another-computers-agent): the code from Worldlet there pairs
   // this one with it, and Fox's conversation runs on it; this World stays here.
   agents.append(el('h5','companion-settings-subhead','On another computer'));
   const remote=found?.remote,row=el('div','companion-settings-row'),text=el('div');row.dataset.agent='remote';
   if(remote&&typeof remote.computer==='string'){
    const away=!remote.seenAt||Date.now()-remote.seenAt>120_000;
    text.append(el('strong','',`Agent on ${remote.computer} · In use`),el('span','',away?`${remote.computer} is away. Fox answers once it is awake with Worldlet open.`:'Fox’s conversation runs there. Your apps and Attention Center stay on this computer.'));
    row.append(text,action('Stop using',async()=>{
     said.textContent='Ending the pairing…';
     try{await call('agentHarness',{operation:'clear'});window.dispatchEvent(new Event('worldlet:model-refresh'));said.textContent='';await draw();}
     catch(e){said.textContent=(e as Error).message||'Could not switch.';}
    },{id:'stop-remote'}));
   }else{
    const code=document.createElement('input');code.className='companion-settings-input';code.placeholder='worldlet://agent?…';code.spellcheck=false;code.autocomplete='off';code.setAttribute('aria-label','Code from Worldlet on your other computer');
    text.append(el('strong','','My Agent is on another computer'),el('span','','On that computer, open Fox’s panel › Mobile › Pair another computer, then paste its code here.'),code);
    row.append(text,action('Pair',async()=>{
     said.textContent='Pairing with your other computer…';
     try{const result=await call('agentHarness',{operation:'pair',link:code.value.trim()});window.dispatchEvent(new Event('worldlet:model-refresh'));said.textContent=`Fox now uses your Agent on ${result?.remote?.computer||'your other computer'}.`;await draw();}
     catch(e){said.textContent=(e as Error).message||'Could not pair.';}
    },{id:'pair-remote'}));
   }
   agents.append(row);
   // An OpenClaw Gateway on another computer, reached directly with its address and token, nothing of Worldlet there
   // (core/phone/README.md#an-agent-gateway-on-another-computer). The token goes to the host's vault and never comes back.
   const gateway=found?.gateway&&typeof found.gateway.host==='string'?found.gateway:null,gRow=el('div','companion-settings-row'),gText=el('div');gRow.dataset.agent='gateway';
   const connect=async(request:Record<string,unknown>)=>{
    said.textContent='Connecting to your Gateway…';
    try{const result=await call('agentHarness',{operation:'gateway',...request});window.dispatchEvent(new Event('worldlet:model-refresh'));said.textContent=`Fox now uses OpenClaw at ${result?.gateway?.host||'your Gateway'}.`;await draw();}
    catch(e){said.textContent=(e as Error).message||'Could not connect.';}
   };
   const forget=action('Forget',async()=>{
    try{await call('agentHarness',{operation:'forget-gateway'});window.dispatchEvent(new Event('worldlet:model-refresh'));said.textContent='The Gateway and its token are forgotten.';await draw();}
    catch(e){said.textContent=(e as Error).message||'Could not forget it.';}
   },{id:'forget-gateway'});
   if(gateway?.active){
    gText.append(el('strong','',`OpenClaw at ${gateway.host} · In use`),el('span','','Fox talks to that Gateway directly; nothing of Worldlet runs there. Your apps and Attention Center stay on this computer.'));
    gRow.append(gText,action('Stop using',async()=>{
     said.textContent='Fox goes back to its own model connection…';
     try{await call('agentHarness',{operation:'clear'});window.dispatchEvent(new Event('worldlet:model-refresh'));said.textContent='';await draw();}
     catch(e){said.textContent=(e as Error).message||'Could not switch.';}
    },{id:'stop-gateway'}),forget);
   }else{
    const address=document.createElement('input');address.className='companion-settings-input';address.placeholder='https://gateway.example.com';address.spellcheck=false;address.autocomplete='off';address.value=gateway?.url??'';address.setAttribute('aria-label','Gateway address');
    const token=document.createElement('input');token.className='companion-settings-input';token.type='password';token.placeholder=gateway?'Saved token (type a new one to replace it)':'Gateway token';token.autocomplete='off';token.setAttribute('aria-label','Gateway token');
    gText.append(el('strong','','My OpenClaw Gateway is on another computer'),el('span','','Its address (HTTPS, or a Tailscale address) and its token, gateway.auth.token in its openclaw.json. Its /v1/responses endpoint must be on.'),address,token);
    gRow.append(gText,action(gateway?'Use':'Connect',()=>connect({url:address.value.trim(),token:token.value}),{id:'connect-gateway'}),...gateway?[forget]:[]);
   }
   agents.append(gRow);
  };
  // The connection steps open under the buttons; a new connection redraws what Fox runs on.
  const changed=()=>{if(turn!==ticket||!target.isConnected){for(const name of MODEL_EVENTS)window.removeEventListener(name,changed);return;}void draw();};
  for(const name of MODEL_EVENTS)window.addEventListener(name,changed);
  target.append(now,fixes,guide.element,agents,said);
  await draw();
 }
 const items:Item[]=[
  {id:'model',label:'Model',hint:'The AI Fox thinks with',show:modelSetting},
  // The standing rules Always left in each Agent here, with Revoke (approval-rules.ts).
  {id:'approvals',label:'Approvals',hint:'What your Agent may do without asking',show:target=>{const turn=ticket;return showApprovalRules(target,call,()=>turn===ticket&&target.isConnected);}},
  {id:'integrations',label:'Integrations',hint:'Connected accounts',show:async target=>{
   const turn=ticket,state=await call('snapshot').catch(()=>null);if(turn!==ticket)return;
   const live=(state?.connections||[]).filter(connectionLive),rows=el('div','companion-settings-rows'),said=status();
   if(!live.length)rows.append(note('No accounts are connected yet. Open an Applet in the world to connect it.'));
   for(const c of live){
    const app=getApp(c.provider),google=c.transport!=='native'&&['gmail','google-calendar','google-drive'].includes(c.provider);
    const row=el('div','companion-settings-row'),text=el('div');
    text.append(el('strong','',app?.title||c.provider),el('span','',c.label||'Connected'));row.append(text);
    row.append(action('Reconnect',async()=>{said.textContent='Opening sign-in…';try{await call('connect',{provider:c.provider});said.textContent='';}catch(e){said.textContent=(e as Error).message||'Could not reconnect.';}}));
    if(DISCONNECTABLE.includes(c.provider))row.append(action(google?'Disconnect Google':'Disconnect',async()=>{try{await call('disconnectSource',{provider:c.provider});await show('integrations');}catch(e){said.textContent=(e as Error).message||'Could not disconnect.';}}));
    rows.append(row);
   }
   target.append(rows,said);
   if(live.some(c=>c.transport!=='native'&&['gmail','google-calendar','google-drive'].includes(c.provider)))target.append(note('Disconnect Google signs out Mail, Calendar and Drive together. To use a different Google account, disconnect Google first. What was already saved is kept.'));
   // The Agent's own MCP servers and chat accounts, with Add and Remove through its own commands (agent-connections.ts).
   await showAgentConnections(target,call,()=>turn===ticket&&target.isConnected);
  }},
  // The Browser's home page (core/browser/browser-home.ts): where it starts after a while away and where Home goes.
  {id:'browser',label:'Browser',hint:'Home page',show:target=>{
   const home=createBrowserHome(host()?.sample()?null:(()=>{try{return globalThis.localStorage;}catch{return null;}})()),said=status();
   const input=el('input','companion-settings-input') as HTMLInputElement;input.type='url';input.value=home.get();input.setAttribute('aria-label','Home page');input.spellcheck=false;input.autocapitalize='off';
   const save=()=>{const page=home.set(input.value);if(!page){said.textContent='Type a website address, like google.com.';return;}input.value=page;said.textContent='The Browser starts here.';};
   input.addEventListener('keydown',event=>{if(event.key==='Enter')save();});
   target.append(note('Opening the Browser after '+BROWSER_HOME.idleMs/60_000+' minutes away starts on this page; within that time it is where you left it. Home in the Browser’s top bar goes here too.'),
    input,action('Save',save,{primary:true,id:'browser-home-save'}),action('Use Google',()=>{input.value=home.set('')||'';said.textContent='The Browser starts on Google.';},{id:'browser-home-reset'}),said);
   void savedLogins(target);
  }},
  {id:'tasks',label:'Background tasks',hint:'What Applets check on their own',show:screen('tasks')},
  {id:'data',label:'Data',hint:'Backup, restore and transfer',show:async target=>{
   await screen('data')(target);
   if(!host()?.localDataDeletion())return;
   const said=status();
   target.append(el('h5','companion-settings-subhead','Delete saved data'),note('Deletes every item and imported copy Worldlet saved on this computer. Connections, model setup and Fox’s memory are kept.'),
    action('Delete saved data',async()=>{said.textContent='';try{const result=await call('clearWorldContent');if(result?.cancelled)return;window.location.reload();}catch(e){said.textContent='Could not delete: '+((e as Error).message||'reopen Worldlet and try again.');}}),said);
  }},
  {id:'sample',label:'Sample world',hint:'A made-up world to look around',show:target=>{
   const on=!!host()?.sample(),said=status();
   const toggle=el('button','world-recovery-switch','Sample world') as HTMLButtonElement;toggle.type='button';toggle.setAttribute('role','switch');toggle.dataset.on=String(on);toggle.setAttribute('aria-checked',String(on));
   toggle.append(el('span','world-recovery-switch-state',on?'On':'Off'));
   toggle.onclick=async()=>{const toggleSample=host()?.toggleSample;if(!toggleSample)return;toggle.disabled=true;said.textContent='';try{await toggleSample();}catch(e){said.textContent=(e as Error).message||'Could not switch worlds.';toggle.disabled=false;}};
   target.append(note(on?'You are in the sample world. Turn it off to return to your own world.':'Look around a made-up world with sample mail, events and tasks. Your own world and accounts stay as they are.'),toggle,said);
  }},
  {id:'sounds',label:'Sounds',hint:'Music and world sounds',show:async target=>{
   const turn=ticket;let audio=await call('worldAudio',{operation:'status'}).catch(()=>({}));if(turn!==ticket)return;
   const playing=(key:string)=>['playing','loading','buffering'].includes(audio?.[key]?.state);
   const rows=el('div','companion-settings-rows');
   const draw=()=>{rows.replaceChildren();for(const [key,title,text] of [['music','Music','Quiet background music while you work.'],['ambience','World sounds','The atmosphere of the place you’re in.']] as const){
    const row=el('div','companion-settings-row'),words=el('div');words.append(el('strong','',title),el('span','',text));
    row.append(words,action(playing(key)?'Turn off':'Turn on',async()=>{audio=await call('worldAudio',{operation:key,enabled:!playing(key)});draw();}));rows.append(row);
   }};
   draw();target.append(rows);
  }},
  {id:'voice',label:'Voice',hint:'Talking, typing and spoken replies',show:screen('voice')},
  {id:'privacy',label:'Privacy',hint:'What Fox may read and share',show:async target=>{
   await screen('privacy')(target);
   if(!host()?.sample())await recordings(target);
  }},
  {id:'login',label:'Open at login',hint:'Start Worldlet with your computer',show:screen('login')},
  {id:'updates',label:'Updates',hint:'Which builds this copy follows',show:updates},
  {id:'troubleshoot',label:'Troubleshoot',hint:'Restart Fox, diagnostics',show:target=>{
   const said=status();
   target.append(
    el('h5','companion-settings-subhead','Restart Fox'),note('If Fox stops answering or seems stuck, restart it. Fox stops what it is doing and starts again; conversations, memory and connections are kept.'),
    action('Restart Fox',async()=>{said.textContent='Restarting Fox…';try{await call('restartFox');window.location.reload();}catch(e){said.textContent='Could not restart: '+((e as Error).message||'reopen Worldlet and try again.');}},{id:'restart'}),
    el('h5','companion-settings-subhead','Report a problem'),note('Save a diagnostics file to send to the Worldlet team, or open the Debug window to see what Worldlet has stored and connected.'),
    action('Save diagnostics',async()=>{try{await call('exportDiagnostics');}catch(e){said.textContent=(e as Error).message||'Could not save diagnostics.';}}),
    action('Open Debug',async()=>{try{close();await call('showDebug');}catch{said.textContent='Could not open Debug.';}}),
    said,el('h5','companion-settings-subhead','Activity records'),note('Every event Worldlet recorded on this computer, newest first.'),history.records);
   history.showRecords();
  }},
  {id:'reset',label:'Reset',hint:'Start over from setup',show:target=>{
   const said=status();
   target.append(note('Reset erases Fox’s memory, your saved items and account connections on this computer, keeps your model setup, and starts setup again. You will be asked to confirm first.'),
    action('Reset',async()=>{said.textContent='';try{const result=await call('resetFox');if(result?.cancelled)return;window.location.reload();}catch(e){said.textContent='Could not reset: '+((e as Error).message||'reopen Worldlet and try again.');}},{id:'reset'}),said);
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
 for(const item of items){
  const b=el('button','companion-settings-item') as HTMLButtonElement;b.type='button';b.dataset.setting=item.id;
  b.append(el('strong','',item.label),el('span','',item.hint));b.onclick=()=>void show(item.id);list.append(b);
 }
 async function show(id:string){
  const item=items.find(i=>i.id===id)??items[0];selected=item.id;const turn=++ticket;
  for(const b of list.querySelectorAll<HTMLElement>('button'))if(b.dataset.setting===selected)b.setAttribute('aria-current','true');else b.removeAttribute('aria-current');
  guide.view.setGuide(null);
  const body=el('div','companion-settings-body');detail.replaceChildren(el('h4','',item.label),body);
  try{await item.show(body);}catch(e){if(turn===ticket)body.append(note((e as Error).message||'This setting is unavailable right now.'));}
 }
 return {element,
  /** The page opened: show `setting`, else the setting last chosen, or the first. */
  open(setting?:string){void show(setting||selected||items[0].id);side.append(version);void showVersion();}};
}
