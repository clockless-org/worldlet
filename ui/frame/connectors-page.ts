import {SERVICE_SYNC_DEFAULTS,serviceSyncLine} from '../../context/connectors/index.ts';
import {connector,connectorTiles,connectorDisconnectQuestion,connectorFailure,type ConnectorTile} from '../../context/connectors/index.ts';
import {agentButton as button,agentEl as el} from './agent-change.ts';
import {appLogoSource} from '../applets/index.ts';
import {settingsIcon} from './settings-rows.ts';
import {chooseProjectsButton,listenForSignInCode,signInCodeBox} from './sign-in-code.ts';
import type {SignInCode} from '../../contracts/platform.ts';

type Call=(action:string,body?:any)=>Promise<any>;
/** Each service's logo on its tile: the brand pictures the World already has, else its first letter. */
const BRAND:Record<string,string>={google:'brands/google.png',github:'brands/github.png','search-console':'brands/google.png'};
const serviceIcon=(item:ConnectorTile)=>{const logo=BRAND[item.id]||appLogoSource({key:item.id});return settingsIcon(logo?{logo}:{letter:item.name});};

/** Settings › Services (context/applets/INTEGRATIONS.md#settings--services): one tile per service with Connect, Disconnect
 * and its state in plain words, decided in Core (connectorTiles). Connect opens the service's own sign-in in the browser
 * on this computer; nothing is typed and no server of ours is involved. Nothing is folded and nothing asks for a key, an
 * address or a file (owner request 2026-10-22: no Advanced in Settings); the host still keeps connections made that way.
 * The page never shows CONNECTOR_TECHNICAL_WORDS (scripts/connectors-ui-check.ts). */
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
 // Each connected Service's default sync (serviceSync list, `default`), by provider.
 const syncs=new Map<string,any>();
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
  syncs.clear();
  if(connectorTiles(connections).some(item=>item.state==='connected'&&SERVICE_SYNC_DEFAULTS[item.provider])){
   const listed=await call('serviceSync',{operation:'list'}).catch(()=>null);
   for(const job of Array.isArray(listed?.jobs)?listed.jobs:[])if(job?.default===true){
    // Kept up to date by itself (owner request 2026-10-22): one turned off before is turned on again.
    if(job.check?.enabled===false&&typeof job.id==='string'&&await call('serviceSync',{operation:'configure',id:job.id,enabled:true}).then(()=>true,()=>false))job.check={...job.check,enabled:true};
    syncs.set(job.provider,job);
   }
  }
  if(current())render();
 }
 function tile(item:ConnectorTile){
  const box=el('div','companion-settings-connector');box.setAttribute('role','listitem');box.dataset.connector=item.id;box.dataset.state=item.state;
  const words=el('div','companion-settings-connector-words');
  const head=el('div','companion-settings-connector-head');head.append(serviceIcon(item),el('strong','',item.name));
  words.append(head,el('span','',notes.get(item.id)??item.line));
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
  // When it was last read, in plain words (core serviceSyncLine); it is kept up to date by itself.
  const sync=item.state==='connected'&&asking!==item.id?syncs.get(item.provider):undefined;
  if(sync){const line=el('span','companion-settings-quiet',serviceSyncLine(sync,Date.now()/1000));line.dataset.sync=item.id;box.append(line);}
  // Its buttons last, at the foot of the tile.
  box.append(actions);
  if(item.state==='connected'&&asking===item.id){
   const ask=el('div','companion-settings-confirm');ask.setAttribute('role','group');ask.dataset.confirm=item.id;
   ask.append(el('span','',connectorDisconnectQuestion(item.name)),
    button('Disconnect','confirm-disconnect',async()=>{
     try{await call('disconnectSource',{provider:item.provider});asking=null;said.textContent=`${item.name} is disconnected.`;}
     catch(e){asking=null;notes.set(item.id,connectorFailure(item.name,(e as Error).message).replace(/^Could not connect/,'Could not disconnect'));}
     await draw();
    },true),
    button('Keep','keep',()=>{asking=null;render();}));
   box.append(ask);
  }
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
  await draw();
 }
 page.append(el('p','companion-info-note','Connect a service with one click. Fox and the Agent it uses can then look at it; other Agents ask you the first time, and anything that changes it asks you first.'),
  grid,said);
 target.append(page);
 await draw();
}

