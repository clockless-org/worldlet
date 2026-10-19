/** Remote access, folded at the foot of Settings › Agents (issue #674; agent/agents/REMOTE-MCP.md, host `remoteMcp`): while it is on,
 * Agents in the cloud (a ChatGPT, Claude or Cursor connector, a cloud Agent session) can reach this World at its
 * address, each only after the person allows it on a card in Attention, and then as an Agent of its own in the list above.
 * Turn off stops the address answering; New address ends every connection. The address is the one thing here the
 * person copies into a connector; nothing else about it (tokens, MCP) is shown. */
import {agentButton as button,agentEl as el} from './agent-change.ts';
type Status={enabled:boolean;connected:boolean;address?:string;connectors:{id:string;name:string;token?:true}[]};
/** Remote access was turned on or off, or has a new address: the other part of the page that shows it draws again. */
const CHANGED='worldlet:remote-access';
function follow(draw:()=>Promise<void>,current:()=>boolean){
 const changed=()=>{if(!current()){removeEventListener(CHANGED,changed);return;}void draw();};
 addEventListener(CHANGED,changed);
}
const changed=()=>dispatchEvent(new Event(CHANGED));

export async function showRemoteAccess(target:HTMLElement,call:(action:string,body?:any)=>Promise<any>,current:()=>boolean){
 const box=el('div','companion-settings-approvals companion-settings-remote'),said=el('p','companion-settings-status');said.setAttribute('role','status');
 box.dataset.remoteAccess='';target.append(box,said);
 let copied=false,tokensOpen=false,made:{token:string;name:string}|null=null;
 async function run(operation:'enable'|'disable'|'renew',done:string){
  said.textContent='';
  try{await call('remoteMcp',{operation});copied=false;changed();await draw();said.textContent=done;}
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
  words.append(el('span','',status.connected?'On. Add this address in Claude or ChatGPT (the steps are above), then choose Allow on the card in Attention.':'On, but this computer cannot reach the internet right now. It keeps trying.'));
  if(status.address){const address=el('code','companion-settings-remote-address',status.address);address.dataset.remoteAddress='';words.append(address);}
  words.append(el('span','companion-settings-quiet',status.connectors.length?`Connected: ${status.connectors.map(c=>c.name).join(', ')}. Each is listed above with what it may do.`:'Nothing is connected yet.'));
  words.append(el('span','companion-settings-quiet','It works while this computer is on and Worldlet is running.'));
  const actions=el('div','companion-settings-actions');
  if(status.address)actions.append(button(copied?'Address copied':'Copy address','remote-access-copy',async()=>{await navigator.clipboard.writeText(status.address!);copied=true;await draw();},true));
  actions.append(button('Turn off','remote-access-off',()=>run('disable','Remote access is off. Turn it on again to use the same address.')),
   button('New address','remote-access-renew',()=>run('renew','This World has a new address. Every connector must be added again.')));
  row.append(actions);
  // A token for an Agent that cannot open a browser (a script, a daemon): shown once, here, until the page is left.
  // Folded away: someone connecting Claude or ChatGPT never needs it.
  const more=el('details','companion-settings-elsewhere') as HTMLDetailsElement;more.dataset.remoteTokens='';more.open=made!==null||tokensOpen;
  more.ontoggle=()=>{tokensOpen=more.open;};
  more.append(el('summary','','For a script or another computer'));box.append(more);
  const tokens=el('div','companion-settings-row'),about=el('div');tokens.append(about);more.append(tokens);
  about.append(el('strong','','Token for a script or another computer'),
   el('span','companion-settings-quiet','For an Agent that cannot open a browser. It sends the token as a bearer to the address above, and becomes an Agent of its own in the list above. Anyone who has the token can act as that Agent, so keep it secret.'));
  if(made){
   const shown=el('code','companion-settings-remote-address',made.token);shown.dataset.remoteToken='';
   about.append(el('span','',`The token for ${made.name}. It is shown only now:`),shown);
   const token=made.token;
   tokens.append(button('Copy token','remote-token-copy',async()=>{await navigator.clipboard.writeText(token);said.textContent='Token copied.';},true));
  }else{
   const name=document.createElement('input');name.className='companion-settings-input';name.placeholder='Agent name, for example Build machine';name.maxLength=40;name.setAttribute('aria-label','Agent name');
   about.append(name);
   tokens.append(button('New token','remote-token-new',async()=>{
    said.textContent='';
    try{
     const result=await call('remoteMcp',{operation:'token',name:name.value});
     if(!result?.ok)throw Error(result?.error||'Could not make a token.');
     made={token:result.token,name:result.agent.name};await draw();
    }catch(e){said.textContent=(e as Error).message||'Could not make a token.';}
   }));
  }
 }
 follow(draw,current);
 await draw();
}

/** "Use your World in Claude or ChatGPT", on Settings › Agents under the list of Agents (issue #674; agent/agents/REMOTE-MCP.md#connect-a-connector): the
 * steps to add this World to Claude or ChatGPT in plain words, with Copy address. The address itself is not shown:
 * the person only pastes it. Hidden on a host without Remote access. */
export async function showUseInClaude(target:HTMLElement,call:(action:string,body?:any)=>Promise<any>,current:()=>boolean){
 const box=el('section','companion-settings-use-in-claude'),said=el('p','companion-settings-status');said.setAttribute('role','status');
 box.dataset.useInClaude='';
 let copied=false;
 async function draw(){
  const status:Status|null=await call('remoteMcp',{operation:'status'}).catch(()=>null);
  if(!current())return;
  box.replaceChildren();
  if(!status||typeof status.enabled!=='boolean'){box.hidden=true;return;}
  box.hidden=false;
  box.append(el('h5','companion-settings-subhead','Use your World in Claude or ChatGPT'),
   el('p','companion-info-note','Claude and ChatGPT can look at your World and help with it, on any computer or phone. Copy your World\'s address, then add it there:'));
  const steps=el('ol','companion-settings-steps');
  steps.append(el('li','','In Claude: Settings › Connectors › Add custom connector. Name it Worldlet and paste the address.'),
   el('li','','In ChatGPT: Settings › Apps & Connectors › Create. Name it Worldlet and paste the address. If there is no Create, turn on Developer mode under Advanced settings first.'),
   el('li','','A card then appears in your Attention Center with a four-digit code. Choose Allow if it matches the code Claude or ChatGPT shows.'));
  box.append(steps);
  const row=el('div','companion-settings-actions');
  if(!status.enabled){
   box.append(el('p','companion-info-note','This is turned off, so Claude and ChatGPT cannot reach your World.'));
   row.append(button('Turn on','use-in-claude-on',async()=>{said.textContent='';try{await call('remoteMcp',{operation:'enable'});changed();await draw();}catch{said.textContent='Could not turn it on. Try again.';}},true));
  }else{
   const names=status.connectors.filter(c=>!c.token).map(c=>c.name);
   box.append(el('p','companion-info-note',[
    names.length?`Connected: ${names.join(', ')}. Each is listed above, with what it may do.`:'',
    status.connected?'It works while this computer is on and Worldlet is running.':'This computer cannot reach the internet right now. Worldlet keeps trying.'].filter(Boolean).join(' ')));
   if(status.address)row.append(button(copied?'Address copied':'Copy address','use-in-claude-copy',async()=>{
    try{await navigator.clipboard.writeText(status.address!);copied=true;await draw();said.textContent='Copied. Now paste it in Claude or ChatGPT.';}
    catch{said.textContent='Could not copy. Try again.';}
   },true));
  }
  box.append(row);
 }
 target.append(box,said);
 follow(draw,current);
 await draw();
}
