import {TOKEN_PROVIDERS} from '../../core/applets/index.ts';
import {connector,connectorTiles,connectorDisconnectQuestion,connectorFailure,type ConnectorTile} from '../../core/accounts/index.ts';
import {agentButton as button,agentEl as el} from './agent-change.ts';
import {showGithubApp,showHttpJson,showSearchConsole} from './worldlet-accounts.ts';

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
 let connections:any[]=[];
 // Search Console's box under Advanced shows its field again once its tile is disconnected.
 let searchConsole=async()=>{};
 async function read(){const state=await call('snapshot').catch(()=>null);if(Array.isArray(state?.connections))connections=state.connections;}
 function render(){
  grid.replaceChildren(...connectorTiles(connections,waiting).map(tile));
 }
 async function draw(){await read();if(current())render();}
 function tile(item:ConnectorTile){
  const box=el('div','companion-settings-connector');box.setAttribute('role','listitem');box.dataset.connector=item.id;box.dataset.state=item.state;
  const words=el('div','companion-settings-connector-words');
  words.append(el('strong','',item.name),el('span','',notes.get(item.id)??item.line));
  const actions=el('div','companion-settings-connector-actions');
  if(item.state==='waiting')actions.append(button('Cancel','cancel-sign-in',async()=>{await call('connectCancel').catch(()=>{});}));
  else if(item.state==='off'&&item.signIn)actions.append(button('Connect','connect',()=>signIn(item),true));
  else if(item.state==='needs-you')actions.append(button('Sign in again','sign-in-again',()=>signIn(item),true));
  else if(item.state==='connected'&&asking!==item.id)actions.append(button('Disconnect','disconnect',()=>{asking=item.id;notes.delete(item.id);render();}));
  box.append(words,actions);
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
 async function signIn(item:ConnectorTile){
  if(waiting)return;
  waiting=item.id;asking=null;notes.delete(item.id);said.textContent='';render();
  try{
   await call('connect',{provider:item.provider,...item.region?{region:item.region}:{}});
   said.textContent=`${item.name} is connected.`;
  }catch(e){notes.set(item.id,connectorFailure(item.name,(e as Error).message));}
  finally{waiting=null;}
  await draw();
 }
 page.append(grid,
  el('p','companion-info-note','Fox can look at a service once you connect it. Other Agents can look only if you let them, in Agent › Access. Before anything is changed, Worldlet asks you.'),
  said);
 target.append(page);
 await draw();
 if(!current())return;
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
