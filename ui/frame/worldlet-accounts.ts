import {connectionLive,getApp} from '../../context/applets/index.ts';
import {CONNECTORS} from '../../context/connectors/index.ts';
import {SERVICE_TITLES} from '../../contracts/services.ts';
import {showServiceCollection} from './service-collection.ts';
import {showAgentConnections} from './agent-connections.ts';
import {agentEl as el} from './agent-change.ts';

// Disconnect exists for these (Calendar here is the one read from this computer).
const DISCONNECTABLE=['apple-notes','apple-reminders','google-calendar'];

/** Settings › Agents › Your Agent › Connections (it was a section of its own, Accounts, until the Agent page took it in): what Worldlet
 * reads that is not a service of Settings › Services (this computer's own apps), then the tools and chat accounts in
 * the person's Agent (agent-connections.ts). The services themselves, and their keys under Advanced, are in
 * Settings › Services (connectors-page.ts). */
export async function showWorldletAccounts(target:HTMLElement,call:(action:string,body?:any)=>Promise<any>,current:()=>boolean){
 const action=(label:string,run:()=>Promise<void>)=>{const b=el('button','companion-info-action',label) as HTMLButtonElement;b.type='button';b.onclick=async()=>{if(b.disabled)return;b.disabled=true;try{await run();}finally{if(b.isConnected)b.disabled=false;}};return b;};
 const own=el('div','companion-settings-worldlet-accounts'),said=el('p','companion-settings-status');said.setAttribute('role','status');
 own.dataset.accounts='worldlet';
 // The rows Settings › Services owns (connectorTiles) are not listed again here.
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
   el('p','companion-info-note','Services such as Google, Notion and GitHub are in Settings › Services.'),...live.length?[rows]:[]);
 }
 target.append(own,said);
 await draw();
 if(current())await showServiceCollection(target,call,current);
 // The Agent's own tools and chat accounts, with Add and Remove through its own commands.
 if(current())await showAgentConnections(target,call,current);
}
