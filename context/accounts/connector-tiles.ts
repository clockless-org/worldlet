// Settings › Connectors (ui/companion/connectors-page.ts): one tile per service, its state and its words, decided here
// from the World's connection rows so every host shows the same thing. Plain words only on this path
// (CONNECTOR_TECHNICAL_WORDS); keys and addresses live under Advanced.
import {CONNECTORS,plainConnectorText,type Connector} from './connectors.ts';

/** `off`: not connected (Connect). `waiting`: sign-in open in the browser (Cancel). `connected` (Disconnect).
 * `needs-you`: the service signed the person out (Sign in again). */
export type ConnectorTileState='off'|'waiting'|'connected'|'needs-you';
export interface ConnectorTile {
 id:string;
 name:string;
 state:ConnectorTileState;
 /** The one line under the name. */
 line:string;
 /** The source provider Connect, Sign in again and Disconnect name to the host. */
 provider:string;
 /** The World region its Thing lives in, so a connection made here lands where its Thing is. */
 region?:string;
 /** Connect and Sign in again open the service's own sign-in here. False for a service that connects with a key: it
  * is connected under Advanced. */
 signIn:boolean;
}
/** A connection row as the World snapshot carries it (`label` is the account it names) or as the host stores it (`target`). */
interface ConnectionRow {provider?:unknown;connected?:unknown;failed?:unknown;status?:unknown;transport?:unknown;label?:unknown;target?:unknown;syncStatus?:unknown;syncError?:unknown;[key:string]:unknown}

// What a read says when the service no longer accepts the sign-in (each McpGate's disconnectedMessage, an expired
// or refused grant).
const SIGNED_OUT=/disconnected|reconnect|sign(?:ed)?[ -]?(?:in|out)|authori[sz]|expired|revoked|not accepted|did not accept/i;
const EMAIL=/^[^\s@]{1,64}@[^\s@]{1,190}$/;

/** The rows of `connections` this connector owns. Google's sign-in owns Mail, Calendar and Drive, but not Calendar
 * read from this computer (`native`). */
function owned(item:Connector,connections:readonly ConnectionRow[]){
 return connections.filter(row=>typeof row.provider==='string'&&(item.providers.includes(row.provider)||(item.id==='google'&&row.provider==='google'))&&!(item.mechanism==='google'&&row.transport==='native'));
}
/** Connected: the World snapshot says so (`connected`, context/applets connectionFacts), or a stored row's status does. */
function live(row:ConnectionRow){
 if(typeof row.connected==='boolean')return row.connected;
 return ['connected','syncing','reading','attention','sync_error'].includes(String(row.status??row.syncStatus??''));
}
function failed(row:ConnectionRow){
 return row.failed===true||['sync_error','error','expired','revoked'].includes(String(row.status??row.syncStatus??''));
}
function signedOut(row:ConnectionRow){
 return failed(row)&&(['expired','revoked'].includes(String(row.syncStatus))||SIGNED_OUT.test(String(row.syncError??'')));
}

/** The tiles Settings › Connectors shows, in the registry's order: every `always` connector, and the others once
 * they are connected. `waiting`: the connector whose sign-in is open now. */
export function connectorTiles(connections:readonly ConnectionRow[]=[],waiting?:string|null):ConnectorTile[] {
 const tiles:ConnectorTile[]=[];
 for(const item of CONNECTORS){
  if(item.shown==='advanced')continue;
  const rows=owned(item,connections).filter(live);
  const signIn=item.mechanism==='mcp-oauth'||item.mechanism==='google'||item.mechanism==='github-device';
  if(!rows.length&&item.shown!=='always'&&waiting!==item.id)continue;
  const provider=rows[0]&&typeof rows[0].provider==='string'?rows[0].provider:item.providers[0];
  const base={id:item.id,name:item.name,provider,signIn,...item.region?{region:item.region}:{}};
  if(waiting===item.id){tiles.push({...base,state:'waiting',line:item.mechanism==='github-device'?`Paste the code on ${item.name}'s page and choose Authorize, then come back here.`:`Finish signing in on ${item.name}, then come back here.`});continue;}
  if(!rows.length){tiles.push({...base,state:'off',line:item.purpose});continue;}
  if(signIn&&rows.some(signedOut)){tiles.push({...base,state:'needs-you',line:`${item.name} signed you out. Sign in again to keep seeing it here.`});continue;}
  const target=rows.map(row=>{const text=row.label??row.target;return typeof text==='string'?text.trim():'';}).find(text=>EMAIL.test(text));
  tiles.push({...base,state:'connected',line:target&&plainConnectorText(target)?`Connected as ${target}`:'Connected'});
 }
 return tiles;
}

/** What Disconnect asks, once. */
export function connectorDisconnectQuestion(name:string):string {
 return `Worldlet will stop seeing your ${name}. What it already saved stays.`;
}
/** What the tile says when Connect did not finish: the host's own words when they are plain, else a plain line. */
export function connectorFailure(name:string,message:unknown):string {
 const text=typeof message==='string'?message.trim():'';
 if(/cancel/i.test(text))return 'Sign-in was cancelled. Nothing changed.';
 if(/timed out/i.test(text))return `Signing in to ${name} took too long. Try again.`;
 if(text&&text.length<=200&&plainConnectorText(text))return text;
 return `Could not connect ${name}. Try again.`;
}

/** An Agent as "Who may use it" shows it: its name and whether it may read this service now. */
export interface ConnectorReader {id:string;name:string;granted:boolean}
/** The Agents that may read a connected service (`agentAccess` `serviceReaders`): the Agent Fox uses (`main`, read on by
 * default when the service is connected) and every other Agent that has reached the World. */
export interface ConnectorReaders {main:ConnectorReader|null;others:ConnectorReader[]}
/** "Who may use it", the sentences under a connected service's tile (agent/agent/GRANTS.md#settings--connectors). `main`:
 * the switch for the Agent Fox uses; `fox` when there is none (Fox's own turns read it when the person asks). `changes`
 * cannot be turned off: every change is a draft the person approves. `others` leads to Choose Agents, each a switch; an
 * Agent not chosen asks the person on an Attention card the first time it needs the service (agent/agent/service-requests.ts). */
export function connectorWhoMayUse(name:string,readers:ConnectorReaders):{main:{id:string;text:string;on:boolean}|null;fox:string|null;changes:string;others:{text:string;choose:string;agents:{id:string;text:string;on:boolean}[]}|null} {
 const main=readers.main?{id:readers.main.id,text:`Fox and ${readers.main.name} can look at your ${name}.`,on:readers.main.granted}:null;
 const others=readers.others.filter(agent=>agent.id!==readers.main?.id);
 const chosen=others.filter(agent=>agent.granted).map(agent=>agent.name);
 return {main,fox:main?null:`Fox can look at your ${name} when you ask.`,changes:'Before anything is changed, Worldlet asks you.',
  others:others.length?{text:chosen.length?`${listed(chosen)} can look too. Other Agents ask you the first time.`:'Other Agents ask you the first time.',choose:'Choose Agents',
   agents:others.map(agent=>({id:agent.id,text:`${agent.name} can look at your ${name}`,on:agent.granted}))}:null};
}
const listed=(names:string[])=>names.length<3?names.join(' and '):`${names.slice(0,-1).join(', ')} and ${names.at(-1)}`;
