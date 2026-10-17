/** Remote access, at the top of Settings › Agent › Access (core/agent/REMOTE-MCP.md, host `remoteMcp`): while it is on,
 * Agents in the cloud (a ChatGPT, Claude or Cursor connector, a cloud Agent session) can reach this World at its
 * address, each only after the person allows it on a card in Attention, and then as an Agent of its own listed below.
 * Turn off stops the address answering; New address ends every connection. The address is the one thing here the
 * person copies into a connector; nothing else about it (tokens, MCP) is shown. */
import {agentButton as button,agentEl as el} from './agent-change.ts';
type Status={enabled:boolean;connected:boolean;address?:string;connectors:{id:string;name:string}[]};

export async function showRemoteAccess(target:HTMLElement,call:(action:string,body?:any)=>Promise<any>,current:()=>boolean){
 const box=el('div','companion-settings-approvals companion-settings-remote'),said=el('p','companion-settings-status');said.setAttribute('role','status');
 box.dataset.remoteAccess='';target.append(box,said);
 let copied=false;
 async function run(operation:'enable'|'disable'|'renew',done:string){
  said.textContent='';
  try{await call('remoteMcp',{operation});copied=false;await draw();said.textContent=done;}
  catch(e){said.textContent='Could not change that: '+((e as Error).message||'try again.');}
 }
 async function draw(){
  const status:Status|{error:string}=await call('remoteMcp',{operation:'status'}).catch((e:Error)=>({error:e.message}));
  if(!current())return;
  box.replaceChildren();
  const row=el('div','companion-settings-row'),words=el('div');row.append(words);box.append(row);
  words.append(el('strong','','Remote access'));
  if('error' in status){words.append(el('span','',status.error));return;}
  if(!status.enabled){
   words.append(el('span','','Let Agents in the cloud reach this World: a ChatGPT, Claude or Cursor connector, or an Agent session running elsewhere. Each one asks you first, on a card in Attention.'));
   row.append(button('Turn on','remote-access-on',()=>run('enable','Remote access is on. Copy the address into your connector.'),true));
   return;
  }
  words.append(el('span','',status.connected?'On. Add this address as a connector, then choose Allow on the card in Attention.':'On, but this computer cannot reach the internet right now. It keeps trying.'));
  if(status.address){const address=el('code','companion-settings-remote-address',status.address);address.dataset.remoteAddress='';words.append(address);}
  words.append(el('span','companion-settings-quiet',status.connectors.length?`Connected: ${status.connectors.map(c=>c.name).join(', ')}. Each is listed below with what it may do.`:'Nothing is connected yet.'));
  words.append(el('span','companion-settings-quiet','It works while this computer is on and Worldlet is running.'));
  const actions=el('div','companion-settings-actions');
  if(status.address)actions.append(button(copied?'Address copied':'Copy address','remote-access-copy',async()=>{await navigator.clipboard.writeText(status.address!);copied=true;await draw();},true));
  actions.append(button('Turn off','remote-access-off',()=>run('disable','Remote access is off. Turn it on again to use the same address.')),
   button('New address','remote-access-renew',()=>run('renew','This World has a new address. Every connector must be added again.')));
  row.append(actions);
 }
 await draw();
}
