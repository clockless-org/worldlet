import {connectionLive,getApp,TOKEN_PROVIDERS} from '../../core/applets/index.ts';
import {showServiceCollection} from './service-collection.ts';
import {showAgentConnections} from './agent-connections.ts';
import {agentEl as el} from './agent-change.ts';

// Disconnect exists for these; Google's three share one sign-in.
const DISCONNECTABLE=['gmail','google-calendar','notion','apple-notes','apple-reminders','todoist','google-drive','github','posthog','cloudflare'];
const GOOGLE=['gmail','google-calendar','google-drive'];

/** Settings › Agent › Connections (it was a section of its own, Accounts, until the Agent page took it
 * in): Worldlet's own signed-in accounts first, with Reconnect and Disconnect, then the tools and chat accounts in the
 * person's Agent (agent-connections.ts). */
export async function showWorldletAccounts(target:HTMLElement,call:(action:string,body?:any)=>Promise<any>,current:()=>boolean){
 const action=(label:string,run:()=>Promise<void>)=>{const b=el('button','companion-info-action',label) as HTMLButtonElement;b.type='button';b.onclick=async()=>{if(b.disabled)return;b.disabled=true;try{await run();}finally{if(b.isConnected)b.disabled=false;}};return b;};
 const own=el('div','companion-settings-worldlet-accounts'),said=el('p','companion-settings-status');said.setAttribute('role','status');
 own.dataset.accounts='worldlet';
 async function draw(){
  const state=await call('snapshot').catch(()=>null);if(!current())return;
  const live=(state?.connections||[]).filter(connectionLive),rows=el('div','companion-settings-rows');
  if(!live.length)rows.append(el('p','companion-info-note','No accounts are connected yet. Open a Thing in the world to connect it.'));
  for(const c of live){
   const app=getApp(c.provider),google=c.transport!=='native'&&GOOGLE.includes(c.provider);
   const row=el('div','companion-settings-row'),text=el('div');row.dataset.account=c.provider;
   text.append(el('strong','',app?.title||c.provider),el('span','',c.label||'Connected'));row.append(text);
   // A token source is reconnected by pasting a new token where it connects (its Thing's connection), not from here.
   if(!Object.hasOwn(TOKEN_PROVIDERS,c.provider))row.append(action('Reconnect',async()=>{said.textContent='Opening sign-in…';try{await call('connect',{provider:c.provider});said.textContent='';}catch(e){said.textContent=(e as Error).message||'Could not reconnect.';}}));
   if(DISCONNECTABLE.includes(c.provider))row.append(action(google?'Disconnect Google':'Disconnect',async()=>{try{await call('disconnectSource',{provider:c.provider});await draw();}catch(e){said.textContent=(e as Error).message||'Could not disconnect.';}}));
   rows.append(row);
  }
  own.replaceChildren(el('h5','companion-settings-subhead','In Worldlet'),rows,
   ...live.some((c:any)=>c.transport!=='native'&&GOOGLE.includes(c.provider))?[el('p','companion-info-note','Disconnect Google signs out Mail, Calendar and Drive together. To use a different Google account, disconnect Google first. What was already saved is kept.')]:[]);
 }
 target.append(own,said);
 await draw();
 if(current())await showGithubApp(target,call,current);
 if(current())await showServiceCollection(target,call,current);
 // The Agent's own tools and chat accounts, with Add and Remove through its own commands.
 if(current())await showAgentConnections(target,call,current);
}

/** GitHub writes (core/agent/GRANTS.md#github-drafts): the GitHub App that writes the GitHub drafts the person approves,
 * so writes show as that App. Its App ID, installation ID and private key go to the host once, are checked with GitHub
 * and kept only in the vault; the page never gets them back and clears the fields at once. */
export async function showGithubApp(target:HTMLElement,call:(action:string,body?:any)=>Promise<any>,current:()=>boolean){
 const box=el('div','companion-settings-github-app'),said=el('p','companion-settings-status');said.setAttribute('role','status');
 box.dataset.accounts='github-app';
 const button=(label:string,run:()=>Promise<void>)=>{const b=el('button','companion-info-action',label) as HTMLButtonElement;b.type='button';b.onclick=async()=>{if(b.disabled)return;b.disabled=true;try{await run();}finally{if(b.isConnected)b.disabled=false;}};return b;};
 const field=(label:string,multiline=false)=>{
  const input=document.createElement(multiline?'textarea':'input') as HTMLInputElement|HTMLTextAreaElement;
  input.className='companion-settings-input';input.setAttribute('aria-label',label);input.placeholder=label;input.autocomplete='off';input.spellcheck=false;
  if(input instanceof HTMLInputElement)input.inputMode='numeric';else input.rows=4;
  return input;
 };
 async function draw(){
  const status=await call('githubApp',{operation:'status'}).catch(()=>null);if(!current())return;
  const row=el('div','companion-settings-row'),text=el('div');
  if(status?.connected){
   text.append(el('strong','','GitHub writes'),el('span','','A GitHub App writes what you approve. It shows on GitHub as that App.'));
   row.append(text,button('Disconnect',async()=>{try{await call('githubApp',{operation:'disconnect'});said.textContent='';await draw();}catch(e){said.textContent=(e as Error).message||'Could not disconnect.';}}));
   box.replaceChildren(el('h5','companion-settings-subhead','GitHub writes'),row);
   return;
  }
  const app=field('App ID'),installation=field('Installation ID'),key=field('Private key',true);
  key.placeholder='Private key (the whole .pem file)';
  text.append(el('strong','','GitHub writes'),el('span','','Connect a GitHub App to write the GitHub changes your Agents draft, once you approve each one. Its key stays on this computer.'),app,installation,key);
  row.append(text,button('Connect',async()=>{
   const body={operation:'connect',appId:app.value.trim(),installationId:installation.value.trim(),privateKey:key.value};
   // The key leaves the page once: the field is cleared before GitHub answers.
   key.value='';said.textContent='Checking the GitHub App…';
   try{await call('githubApp',body);said.textContent='GitHub App connected.';await draw();}
   catch(e){said.textContent=(e as Error).message||'Could not connect the GitHub App.';}
  }));
  box.replaceChildren(el('h5','companion-settings-subhead','GitHub writes'),row);
 }
 target.append(box,said);
 await draw();
}
