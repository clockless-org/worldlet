import {connectionLive,getApp} from '../../core/applets/index.ts';
import {showAgentConnections} from './agent-connections.ts';
import {agentEl as el} from './agent-change.ts';

// Disconnect exists for these; Google's three share one sign-in.
const DISCONNECTABLE=['gmail','google-calendar','notion','apple-notes','apple-reminders','todoist','google-drive'];
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
   row.append(action('Reconnect',async()=>{said.textContent='Opening sign-in…';try{await call('connect',{provider:c.provider});said.textContent='';}catch(e){said.textContent=(e as Error).message||'Could not reconnect.';}}));
   if(DISCONNECTABLE.includes(c.provider))row.append(action(google?'Disconnect Google':'Disconnect',async()=>{try{await call('disconnectSource',{provider:c.provider});await draw();}catch(e){said.textContent=(e as Error).message||'Could not disconnect.';}}));
   rows.append(row);
  }
  own.replaceChildren(el('h5','companion-settings-subhead','In Worldlet'),rows,
   ...live.some((c:any)=>c.transport!=='native'&&GOOGLE.includes(c.provider))?[el('p','companion-info-note','Disconnect Google signs out Mail, Calendar and Drive together. To use a different Google account, disconnect Google first. What was already saved is kept.')]:[]);
 }
 target.append(own,said);
 await draw();
 // The Agent's own tools and chat accounts, with Add and Remove through its own commands.
 if(current())await showAgentConnections(target,call,current);
}
