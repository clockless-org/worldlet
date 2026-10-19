import {connectionLive,getApp,TOKEN_PROVIDERS} from '../../context/applets/index.ts';
import {CONNECTORS} from '../../context/connectors/index.ts';
import {SERVICE_TITLES} from '../../contracts/services.ts';
import {showServiceCollection} from './service-collection.ts';
import {showAgentConnections} from './agent-connections.ts';
import {agentEl as el} from './agent-change.ts';

// Disconnect exists for these (Calendar here is the one read from this computer).
const DISCONNECTABLE=['apple-notes','apple-reminders','google-calendar'];

/** Settings › Agents › Your Agent › Connections (it was a section of its own, Accounts, until the Agent page took it in): what Worldlet
 * reads that is not a service of Settings › Connectors (this computer's own apps), then the tools and chat accounts in
 * the person's Agent (agent-connections.ts). The services themselves, and their keys under Advanced, are in
 * Settings › Connectors (connectors-page.ts). */
export async function showWorldletAccounts(target:HTMLElement,call:(action:string,body?:any)=>Promise<any>,current:()=>boolean){
 const action=(label:string,run:()=>Promise<void>)=>{const b=el('button','companion-info-action',label) as HTMLButtonElement;b.type='button';b.onclick=async()=>{if(b.disabled)return;b.disabled=true;try{await run();}finally{if(b.isConnected)b.disabled=false;}};return b;};
 const own=el('div','companion-settings-worldlet-accounts'),said=el('p','companion-settings-status');said.setAttribute('role','status');
 own.dataset.accounts='worldlet';
 // The rows Settings › Connectors owns (connectorTiles) are not listed again here.
 const services=new Set(['google',...CONNECTORS.flatMap(item=>item.providers)]);
 async function draw(){
  const state=await call('snapshot').catch(()=>null);if(!current())return;
  const live=(state?.connections||[]).filter((c:any)=>connectionLive(c)&&!(services.has(c.provider)&&c.transport!=='native')),rows=el('div','companion-settings-rows');
  for(const c of live){
   const app=getApp(c.provider);
   const row=el('div','companion-settings-row'),text=el('div');row.dataset.account=c.provider;
   text.append(el('strong','',app?.title||SERVICE_TITLES[c.provider]||c.provider),el('span','',c.label||'Connected'));row.append(text);
   if(DISCONNECTABLE.includes(c.provider))row.append(action('Disconnect',async()=>{try{await call('disconnectSource',{provider:c.provider});await draw();}catch(e){said.textContent=(e as Error).message||'Could not disconnect.';}}));
   rows.append(row);
  }
  own.replaceChildren(el('h5','companion-settings-subhead','In Worldlet'),
   el('p','companion-info-note','Services such as Google, Notion and GitHub are in Settings › Connectors.'),...live.length?[rows]:[]);
 }
 target.append(own,said);
 await draw();
 if(current())await showServiceCollection(target,call,current);
 // The Agent's own tools and chat accounts, with Add and Remove through its own commands.
 if(current())await showAgentConnections(target,call,current);
}

/** Your own GitHub App (agent/gate/GRANTS.md#github-drafts), under Settings › Connectors › Advanced: GitHub drafts the
 * person approves are written through their GitHub sign-in by default; connecting their own App writes them as that App
 * instead (and allows standing writes). Its App ID, installation ID and private key go to the host once, are checked with GitHub
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
   text.append(el('strong','','Your own GitHub App'),el('span','','Your GitHub App writes what you approve. It shows on GitHub as that App.'));
   row.append(text,button('Disconnect',async()=>{try{await call('githubApp',{operation:'disconnect'});said.textContent='';await draw();}catch(e){said.textContent=(e as Error).message||'Could not disconnect.';}}));
   box.replaceChildren(el('h5','companion-settings-subhead','Your own GitHub App'),row);
   return;
  }
  const app=field('App ID'),installation=field('Installation ID'),key=field('Private key',true);
  key.placeholder='Private key (the whole .pem file)';
  text.append(el('strong','','Your own GitHub App'),el('span','','Changes you approve are written as you, through your GitHub sign-in. To write them as your own GitHub App instead, connect it here. Its key stays on this computer.'),app,installation,key);
  row.append(text,button('Connect',async()=>{
   const body={operation:'connect',appId:app.value.trim(),installationId:installation.value.trim(),privateKey:key.value};
   // The key leaves the page once: the field is cleared before GitHub answers.
   key.value='';said.textContent='Checking the GitHub App…';
   try{await call('githubApp',body);said.textContent='GitHub App connected.';await draw();}
   catch(e){said.textContent=(e as Error).message||'Could not connect the GitHub App.';}
  }));
  box.replaceChildren(el('h5','companion-settings-subhead','Your own GitHub App'),row);
 }
 target.append(box,said);
 await draw();
}

/** HTTP JSON (context/applets/INTEGRATIONS.md#http-json-service): JSON endpoints an Agent may read with "Can read HTTP JSON",
 * each a name, an HTTPS base address and an optional token. Connect goes through `connect` (provider `http`), which
 * checks the endpoint with one read before keeping it; the token leaves the page once, its field cleared at once, and
 * never comes back (`httpJson` `list` says only whether an endpoint has one). Remove forgets one endpoint; the last
 * one is disconnected instead. */
export async function showHttpJson(target:HTMLElement,call:(action:string,body?:any)=>Promise<any>,current:()=>boolean){
 const box=el('div','companion-settings-http-json'),said=el('p','companion-settings-status');said.setAttribute('role','status');
 box.dataset.accounts='http';
 const button=(label:string,run:()=>Promise<void>)=>{const b=el('button','companion-info-action',label) as HTMLButtonElement;b.type='button';b.onclick=async()=>{if(b.disabled)return;b.disabled=true;try{await run();}finally{if(b.isConnected)b.disabled=false;}};return b;};
 const field=(label:string,placeholder:string,secret=false)=>{
  const input=document.createElement('input');input.className='companion-settings-input';input.setAttribute('aria-label',label);input.placeholder=placeholder;
  input.autocomplete='off';input.spellcheck=false;if(secret)input.type='password';
  return input;
 };
 async function draw(){
  const listed=await call('httpJson',{operation:'list'}).catch(()=>null);if(!current())return;
  const endpoints:{name:string;url:string;token:boolean}[]=Array.isArray(listed?.endpoints)?listed.endpoints:[];
  const rows=el('div','companion-settings-rows');
  for(const endpoint of endpoints){
   const row=el('div','companion-settings-row'),text=el('div');row.dataset.endpoint=endpoint.name;
   text.append(el('strong','',endpoint.name),el('span','',endpoint.url+(endpoint.token?' · with a token':'')));
   row.append(text,button(endpoints.length>1?'Remove':'Disconnect',async()=>{
    try{
     if(endpoints.length>1)await call('httpJson',{operation:'remove',name:endpoint.name});else await call('disconnectSource',{provider:'http'});
     said.textContent=`${endpoint.name} was removed.`;await draw();
    }catch(e){said.textContent=(e as Error).message||'Could not remove it.';}
   }));
   rows.append(row);
  }
  const name=field('Endpoint name','Name, such as status'),url=field('Base address','https://api.example.com/v1/'),token=field('Token (optional)','Token (optional)',true);
  const add=el('div','companion-settings-row'),words=el('div');
  words.append(el('strong','',endpoints.length?'Add an endpoint':'JSON endpoints'),
   el('span','','Let Agents you allow read JSON from an address on the internet, with GET only. A token stays on this computer and goes only to that address.'),name,url,token);
  add.append(words,button('Connect',async()=>{
   const body={provider:'http',token:token.value.trim(),settings:{name:name.value.trim(),url:url.value.trim()}};
   // The token leaves the page once: the field is cleared before the endpoint answers.
   token.value='';said.textContent='Checking the endpoint…';
   try{await call('connect',body);said.textContent=`${body.settings.name} is connected.`;await draw();}
   catch(e){said.textContent=(e as Error).message||'Could not connect the endpoint.';}
  }));
  rows.append(add);
  box.replaceChildren(el('h5','companion-settings-subhead','HTTP JSON'),rows);
 }
 target.append(box,said);
 await draw();
}

/** Google Search Console (context/applets/INTEGRATIONS.md#search-console-service), which has no Thing of its own: its tile
 * signs in with Google; here, under Advanced, a Google service account's JSON key instead, pasted once. The host checks it with Google and keeps it only in the vault; the field is
 * cleared before Google answers and the page never gets the key back. Disconnect is in the list above. Returns its
 * redraw. */
export async function showSearchConsole(target:HTMLElement,call:(action:string,body?:any)=>Promise<any>,current:()=>boolean,changed:()=>Promise<void>):Promise<()=>Promise<void>>{
 const box=el('div','companion-settings-search-console'),said=el('p','companion-settings-status');said.setAttribute('role','status');
 box.dataset.accounts='search-console';
 async function draw(){
  const state=await call('snapshot').catch(()=>null);if(!current())return;
  const connected=(state?.connections||[]).some((c:any)=>c.provider==='search-console'&&connectionLive(c));
  const row=el('div','companion-settings-row'),text=el('div');
  if(connected){
   text.append(el('strong','','Search Console'),el('span','','Connected. Fox, and the Agents you allow, read your sites\' Google Search clicks and impressions only when asked.'));
   row.append(text);box.replaceChildren(el('h5','companion-settings-subhead','Search Console'),row);return;
  }
  const key=document.createElement('textarea');
  key.className='companion-settings-input';key.rows=4;key.autocomplete='off';key.spellcheck=false;key.maxLength=8000;
  key.setAttribute('aria-label','Service account key');key.placeholder='Service account key (the whole .json file)';
  text.append(el('strong','','Search Console with a service account'),el('span','',TOKEN_PROVIDERS['search-console'].hint+' It stays on this computer and is only read from, never changed. Without one, use Connect on the Search Console tile above.'),key);
  const connect=el('button','companion-info-action','Connect') as HTMLButtonElement;connect.type='button';
  connect.onclick=async()=>{
   if(connect.disabled)return;
   const token=key.value.trim();if(!token){said.textContent=TOKEN_PROVIDERS['search-console'].hint;return;}
   // The key leaves the page once: the field is cleared before Google answers.
   key.value='';connect.disabled=true;said.textContent='Checking the key with Google…';
   try{await call('connect',{provider:'search-console',token,region:'work'});said.textContent='Search Console connected.';await changed();await draw();}
   catch(e){said.textContent=(e as Error).message||'Could not connect Search Console.';}
   finally{if(connect.isConnected)connect.disabled=false;}
  };
  row.append(text,connect);
  box.replaceChildren(el('h5','companion-settings-subhead','Search Console'),row);
 }
 target.append(box,said);
 await draw();
 return draw;
}
