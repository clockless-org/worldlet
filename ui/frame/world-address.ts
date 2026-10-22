/** Your World's address, the one place in Settings › Agents for reaching the World from elsewhere (agent/gate/WORLD-ADDRESS.md,
 * hosts `worldAddress` and `remoteMcp`). Owner requests 2026-10-22: one card, no Advanced, and one address with nothing
 * to choose. It shows the address (`<room>.worldlet.ai`) and Copy for Claude or ChatGPT (its `/mcp`). Browsers, people and shares the person allowed are listed under it only when
 * there are some, each with a way to end it. Remote access underneath has no controls of its own here: it is on by
 * default, and the card offers Turn on only when it is off. Plain words: no passkeys, tokens or rooms. */
import {agentButton as button,agentDay,agentEl as el} from './agent-change.ts';
import {settingsIcon} from './settings-rows.ts';
type Status={name:string|null;address?:string;mcp?:string;reachable:boolean;remote:boolean;error?:string;
 devices:{id:string;name:string;addedAt:string;usedAt?:string}[];
 visitors:{id:string;name:string;sees:string[];seenAt?:string}[];
 shares:{id:string;title:string;open:boolean;link?:string;people:number}[]};

export async function showWorldAddress(target:HTMLElement,call:(action:string,body?:any)=>Promise<any>,current:()=>boolean){
 const box=el('div','companion-settings-approvals companion-settings-world-address'),said=el('p','companion-settings-status');said.setAttribute('role','status');
 box.dataset.worldAddress='';
 target.append(el('h5','companion-settings-subhead','Use your World anywhere'),box,said);
 let copied='',timer:ReturnType<typeof setTimeout>|null=null;
 const day=(iso?:string)=>iso?agentDay(Date.parse(iso)):'';
 async function act(body:Record<string,unknown>,done:string){
  said.textContent='';
  try{await call('worldAddress',body);await draw();said.textContent=done;}
  catch(e){said.textContent=(e as Error).message||'Could not do that. Try again.';}
 }
 async function copy(text:string,what:string){
  try{await navigator.clipboard.writeText(text);copied=text;await draw();said.textContent=what;}catch{said.textContent='Could not copy. Try again.';}
 }
 async function draw(){
  const status:Status|{error:string}=await call('worldAddress',{operation:'status'}).catch((e:Error)=>({error:e.message}));
  if(!current())return;
  box.replaceChildren();
  const row=el('div','companion-settings-row has-icon'),words=el('div');row.append(settingsIcon({icon:'link'}),words);box.append(row);
  words.append(el('strong','','Your World\'s address'));
  if(!('devices' in status)){words.append(el('span','',status.error||'Not available here.'));return;}
  // The host connects in the background: look again every few seconds until the address answers.
  if(timer)clearTimeout(timer);
  timer=status.remote&&!status.reachable?setTimeout(()=>{timer=null;if(current())void draw();},5000):null;
  if(!status.remote){
   words.append(el('span','','Open your World on any device, and use it in Claude or ChatGPT. It is turned off now.'));
   row.append(button('Turn on','world-address-on',async()=>{
    said.textContent='';
    try{await call('remoteMcp',{operation:'enable'});await draw();}catch{said.textContent='Could not turn it on. Try again.';}
   },true));
   return;
  }
  if(!status.name){
   words.append(el('span','','Your World is getting its address. This takes a moment.'));
   return;
  }
  const host=(status.address||'').replace(/^https:\/\//,'');
  const address=el('code','companion-settings-remote-address',host);address.dataset.worldAddressLink='';words.append(address);
  words.append(el('span','companion-settings-quiet',status.reachable?'Open it on any device, or paste it in Claude or ChatGPT as a connector. A card here asks you to allow each one.'
   :'This computer cannot reach the internet right now. Worldlet keeps trying.'));
  const actions=el('div','companion-settings-actions');
  if(status.mcp)actions.append(button(copied===status.mcp?'Copied':'Copy for Claude or ChatGPT','world-address-copy',()=>copy(status.mcp!,'Copied. Paste it in Claude or ChatGPT as a connector.'),true));
  row.append(actions);

  // Who can open the World here: listed only when there is someone, each with a way to end it.
  const lines:HTMLElement[]=[];
  for(const device of status.devices){
   const line=el('div','companion-settings-row');
   line.append(el('span','',`${device.name} · your browser${device.usedAt?` · last opened ${day(device.usedAt)}`:` · added ${day(device.addedAt)}`}`),
    button('Sign out','world-address-sign-out',()=>act({operation:'remove',id:device.id},`${device.name} is signed out.`)));
   lines.push(line);
  }
  for(const visitor of status.visitors){
   const line=el('div','companion-settings-row');
   line.append(el('span','',`${visitor.name} · sees ${visitor.sees.join(', ')||'nothing'}${visitor.seenAt?` · last looked ${day(visitor.seenAt)}`:''}`),
    button('Remove','world-address-remove',()=>act({operation:'remove',id:visitor.id},`${visitor.name} can no longer see anything here.`)));
   lines.push(line);
  }
  for(const share of status.shares){
   const line=el('div','companion-settings-row');
   line.append(el('span','',`${share.title} · shared with ${share.open?'anyone with the link':share.people===1?'1 person':`${share.people} people`}`),
    button('Stop sharing','world-address-unshare',()=>act({operation:'unshare',id:share.id},`${share.title} is no longer shared.`)));
   lines.push(line);
  }
  if(lines.length){
   const who=el('div','companion-settings-access-group');who.dataset.worldAddressWho='';
   who.append(el('strong','','Can open it'),...lines);box.append(who);
  }
 }
 await draw();
}
