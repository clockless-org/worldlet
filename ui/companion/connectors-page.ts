import {TOKEN_PROVIDERS} from '../../core/applets/index.ts';
import {SERVICE_SYNC_DEFAULTS,serviceSyncLine,connector,connectorTiles,connectorDisconnectQuestion,connectorFailure,connectorWhoMayUse,type ConnectorReaders,type ConnectorTile} from '../../core/accounts/index.ts';
import {SERVICE_PROVIDERS} from '../../contracts/services.ts';
import {agentButton as button,agentEl as el} from './agent-change.ts';
import {showGithubApp,showHttpJson,showSearchConsole} from './worldlet-accounts.ts';
import {chooseProjectsButton,listenForSignInCode,signInCodeBox} from './sign-in-code.ts';
import type {SignInCode} from '../../contracts/platform.ts';

type Call=(action:string,body?:any)=>Promise<any>;
/** The services that connect with a key, under Advanced › Connect with a key (Search Console and HTTP JSON have boxes
 * of their own there). */
const KEYED=['github','posthog','cloudflare'];

/** Settings › Connectors (core/applets/INTEGRATIONS.md#settings--connectors): one tile per service with Connect, Disconnect
 * and its state in plain words, decided in Core (connectorTiles). Connect opens the service's own sign-in in the browser
 * on this computer; nothing is typed and no server of ours is involved. Everything with a key, an address or a file is
 * under Advanced, folded away. The default path never shows CONNECTOR_TECHNICAL_WORDS (scripts/connectors-ui-check.ts). */
export async function showConnectors(target:HTMLElement,call:Call,current:()=>boolean){
 const page=el('div','companion-settings-connectors');page.dataset.connectors='page';
 const grid=el('div','companion-settings-connector-grid');grid.setAttribute('role','list');grid.setAttribute('aria-label','Services');
 const said=el('p','companion-settings-status');said.setAttribute('role','status');
 // The connector whose sign-in is open now; the one asking "Disconnect?"; what a tile last said after Connect failed.
 let waiting:string|null=null,asking:string|null=null;
 const notes=new Map<string,string>();
 // The code a sign-in gave to type on the service's own page (GitHub), while it waits.
 let code:SignInCode|null=null;
 let connections:any[]=[];
 // What a signed-in service lets the person choose (PostHog's projects), by connector.
 const picks=new Map<string,{choices:{id:string;name:string}[];chosen:string|null}>();
 // Who may read a connected Service (agentAccess serviceReaders), by connector; the one whose Choose Agents is open.
 const readers=new Map<string,ConnectorReaders>();
 let choosing:string|null=null;
 // Each connected Service's default sync (serviceSync list, `default`), by provider; the tiles whose details are open.
 const syncs=new Map<string,any>(),syncOpen=new Set<string>();
 // Search Console's box under Advanced follows its tile: connected, or its field again once disconnected.
 let searchConsole=async()=>{};
 async function read(){const state=await call('snapshot').catch(()=>null);if(Array.isArray(state?.connections))connections=state.connections;}
 function render(){
  grid.replaceChildren(...connectorTiles(connections,waiting).map(tile));
 }
 async function draw(){
  await read();
  // A connected service with a choice to make after signing in (Connector.pick) says what it can choose.
  picks.clear();
  for(const item of connectorTiles(connections))if(item.state==='connected'&&connector(item.id)?.pick){
   const answer=await call('serviceChoices',{provider:item.provider}).catch(()=>null);
   if(Array.isArray(answer?.choices)&&answer.choices.length>1)picks.set(item.id,answer);
  }
  readers.clear();
  for(const item of connectorTiles(connections))if(item.state==='connected'&&SERVICE_PROVIDERS.includes(item.provider)){
   const answer=await call('agentAccess',{operation:'serviceReaders',provider:item.provider}).catch(()=>null);
   if(answer&&Array.isArray(answer.others))readers.set(item.id,{main:answer.main??null,others:answer.others});
  }
  syncs.clear();
  if(connectorTiles(connections).some(item=>item.state==='connected'&&SERVICE_SYNC_DEFAULTS[item.provider])){
   const listed=await call('serviceSync',{operation:'list'}).catch(()=>null);
   for(const job of Array.isArray(listed?.jobs)?listed.jobs:[])if(job?.default===true)syncs.set(job.provider,job);
  }
  if(current())render();
 }
 function tile(item:ConnectorTile){
  const box=el('div','companion-settings-connector');box.setAttribute('role','listitem');box.dataset.connector=item.id;box.dataset.state=item.state;
  const words=el('div','companion-settings-connector-words');
  words.append(el('strong','',item.name),el('span','',notes.get(item.id)??item.line));
  const actions=el('div','companion-settings-connector-actions');
  if(item.state==='waiting')actions.append(button('Cancel','cancel-sign-in',async()=>{await call('connectCancel').catch(()=>{});}));
  else if(item.state==='off'&&item.signIn)actions.append(button('Connect','connect',()=>signIn(item),true));
  else if(item.state==='needs-you')actions.append(button('Sign in again','sign-in-again',()=>signIn(item),true));
  else if(item.state==='connected'&&asking!==item.id)actions.append(button('Disconnect','disconnect',()=>{asking=item.id;notes.delete(item.id);render();}));
  // GitHub shows only the projects the person chose on GitHub's own page.
  if(item.state==='connected'&&item.id==='github'&&asking!==item.id)actions.prepend(chooseProjectsButton(call,text=>{said.textContent=text;}));
  box.append(words);
  if(item.state==='waiting'&&code)box.append(signInCodeBox(call,code,item.name,text=>{said.textContent=text;}));
  const pick=item.state==='connected'?picks.get(item.id):undefined;
  if(pick&&asking!==item.id){
   const kind=connector(item.id)?.pick??'one';
   const row=el('div','companion-settings-connector-pick'),select=el('select','companion-settings-input') as HTMLSelectElement;
   select.setAttribute('aria-label',`Which ${item.name} ${kind}?`);
   for(const choice of pick.choices){const option=el('option','',choice.name) as HTMLOptionElement;option.value=choice.id;option.selected=choice.id===pick.chosen;select.append(option);}
   row.append(el('span','',`Which ${item.name} ${kind}?`),select,button('Use','use-choice',async()=>{
    if(select.value===pick.chosen)return;
    try{await call('connect',{provider:item.provider,settings:{[kind]:select.value}});said.textContent=`${item.name} now shows ${select.selectedOptions[0]?.textContent??'that '+kind}.`;}
    catch(e){notes.set(item.id,connectorFailure(item.name,(e as Error).message));}
    await draw();
   }));
   box.append(row);
  }
  const who=item.state==='connected'&&asking!==item.id?readers.get(item.id):undefined;
  if(who)box.append(whoMayUse(item,who));
  const sync=item.state==='connected'&&asking!==item.id?syncs.get(item.provider):undefined;
  if(sync)box.append(keptFresh(item,sync));
  // Its buttons last, at the foot of the tile.
  box.append(actions);
  if(item.state==='connected'&&asking===item.id){
   const ask=el('div','companion-settings-confirm');ask.setAttribute('role','group');ask.dataset.confirm=item.id;
   ask.append(el('span','',connectorDisconnectQuestion(item.name)),
    button('Disconnect','confirm-disconnect',async()=>{
     try{await call('disconnectSource',{provider:item.provider});asking=null;said.textContent=`${item.name} is disconnected.`;}
     catch(e){asking=null;notes.set(item.id,connectorFailure(item.name,(e as Error).message).replace(/^Could not connect/,'Could not disconnect'));}
     await draw();await searchConsole();
    },true),
    button('Keep','keep',()=>{asking=null;render();}));
   box.append(ask);
  }
  return box;
 }
 /** "Who may use it" (connectorWhoMayUse): the Agent Fox uses, on by default; changes always ask; the other Agents
  * behind Choose Agents. Each switch gives or takes back that Agent's read Grant for this Service at once. */
 function whoMayUse(item:ConnectorTile,who:ConnectorReaders){
  const view=connectorWhoMayUse(item.name,who),box=el('div','companion-settings-connector-who');box.dataset.who=item.id;
  const toggle=(agent:{id:string;text:string;on:boolean})=>{
   const label=el('label','companion-settings-connector-reader'),check=document.createElement('input');
   check.type='checkbox';check.checked=agent.on;check.dataset.reader=agent.id;
   check.onchange=async()=>{
    const on=check.checked;check.disabled=true;said.textContent='';
    try{await call('agentAccess',{operation:on?'grantService':'ungrantService',id:agent.id,provider:item.provider});}
    catch(e){said.textContent=connectorFailure(item.name,(e as Error).message).replace(/^Could not connect/,'Could not change who can look at');}
    await draw();
   };
   label.append(check,document.createTextNode(agent.text));
   return label;
  };
  if(view.main)box.append(toggle(view.main));
  if(view.fox)box.append(el('span','',view.fox));
  box.append(el('span','',view.changes));
  if(view.others){
   const line=el('div','companion-settings-connector-others');
   line.append(el('span','',view.others.text),button(choosing===item.id?'Done':view.others.choose,'choose-agents',()=>{choosing=choosing===item.id?null:item.id;render();}));
   box.append(line);
   if(choosing===item.id){
    const list=el('div','companion-settings-connector-agents');list.setAttribute('role','group');list.setAttribute('aria-label',`Agents that can look at your ${item.name}`);
    list.append(...view.others.agents.map(toggle));
    box.append(list);
   }
  }
  return box;
 }
 /** "Updated 5 minutes ago" (core serviceSyncLine), and under it the switch that keeps the Service up to date in the
  * World (`serviceSync` `configure`), on from the moment it connected. */
 function keptFresh(item:ConnectorTile,job:any){
  const box=el('details','companion-settings-connector-sync') as HTMLDetailsElement;box.dataset.sync=item.id;box.open=syncOpen.has(item.id);
  box.ontoggle=()=>{if(box.open)syncOpen.add(item.id);else syncOpen.delete(item.id);};
  const minutes=Number(job.check?.intervalMinutes)||60,every=minutes===60?'every hour':minutes%60===0?`every ${minutes/60} hours`:`every ${minutes} minutes`;
  const label=el('label','companion-settings-connector-reader'),check=document.createElement('input');
  check.type='checkbox';check.checked=job.check?.enabled===true;check.dataset.keepFresh=item.id;
  check.onchange=async()=>{
   const on=check.checked;check.disabled=true;said.textContent='';
   try{await call('serviceSync',{operation:'configure',id:job.id,enabled:on});said.textContent=on?`${item.name} is kept up to date in your World again.`:`${item.name} is no longer kept up to date. What was saved stays.`;}
   catch(e){said.textContent=connectorFailure(item.name,(e as Error).message).replace(/^Could not connect/,'Could not change updates for');}
   await draw();
  };
  label.append(check,document.createTextNode(`Keep ${item.name} up to date in your World, ${every}`));
  box.append(el('summary','',serviceSyncLine(job,Date.now()/1000)),label);
  return box;
 }
 async function signIn(item:ConnectorTile){
  if(waiting)return;
  waiting=item.id;asking=null;notes.delete(item.id);said.textContent='';code=null;render();
  const stop=listenForSignInCode(item.provider,shown=>{code=shown;if(waiting===item.id)render();});
  try{
   await call('connect',{provider:item.provider,...item.region?{region:item.region}:{}});
   said.textContent=`${item.name} is connected.`;
  }catch(e){notes.set(item.id,connectorFailure(item.name,(e as Error).message));}
  finally{waiting=null;code=null;stop();}
  await draw();await searchConsole();
 }
 page.append(grid,
  el('p','companion-info-note','Once you connect a service, Fox and the Agent it uses can look at it. Other Agents ask you the first time. Before anything is changed, Worldlet asks you.'),
  said);
 target.append(page);
 await draw();
 if(!current())return;
 // Using this World in Claude or ChatGPT is under Settings › Agents now (issue #674): they are Agents, not Services.
 // Advanced: keys, addresses and files, for people who have them (and teams that write as their own GitHub App).
 const advanced=el('details','companion-settings-elsewhere companion-settings-advanced') as HTMLDetailsElement;advanced.dataset.advanced='connectors';
 advanced.append(el('summary','','Advanced'),
  el('p','companion-info-note','Connect with a key you already have, your own address, or a Google service account. A key stays on this computer.'));
 target.append(advanced);
 const keys=el('div','companion-settings-rows');keys.dataset.accounts='keys';
 advanced.append(el('h5','companion-settings-subhead','Connect with a key'),keys);
 for(const provider of KEYED)keys.append(keyRow(provider,call,draw));
 await showGithubApp(advanced,call,current);
 if(current())searchConsole=await showSearchConsole(advanced,call,current,draw);
 if(current())await showHttpJson(advanced,call,current);
}

/** One service's key form (TOKEN_PROVIDERS): the key in a password field and the settings it also needs. The key goes
 * to the host's `connect` once and the field is cleared at once; the host checks it with one read before keeping it. */
function keyRow(provider:string,call:Call,changed:()=>Promise<void>){
 const rule=TOKEN_PROVIDERS[provider],name=connector(provider)?.name??provider,label=name+' '+(rule.label??'token');
 const row=el('div','companion-settings-row'),words=el('div'),said=el('span','companion-settings-quiet');said.setAttribute('role','status');row.dataset.key=provider;
 const input=(aria:string,placeholder:string,secret=false)=>{
  const field=el('input','companion-settings-input') as HTMLInputElement;field.setAttribute('aria-label',aria);field.placeholder=placeholder;
  field.autocomplete='off';field.spellcheck=false;if(secret)field.type='password';return field;
 };
 const key=input(label,'Paste your '+label,true);key.maxLength=255;
 const settings=(rule.fields??[]).map(field=>{const value=input(field.label,field.placeholder??field.label);value.value=field.value??'';value.maxLength=field.maxLength;if(field.numeric)value.inputMode='numeric';return {field,value};});
 words.append(el('strong','',name),el('span','',rule.hint),key,...settings.map(s=>s.value),said);
 row.append(words,button('Connect','connect-key',async()=>{
  const token=key.value.trim();key.value='';
  if(!token){said.textContent=rule.hint;return;}
  const body={provider,token,...settings.length?{settings:Object.fromEntries(settings.map(({field,value})=>[field.key,value.value.trim()]))}:{}};
  said.textContent='Checking…';
  try{await call('connect',body);said.textContent=`${name} is connected.`;await changed();}
  catch(e){said.textContent=(e as Error).message||`Could not connect ${name}.`;}
 }));
 return row;
}
