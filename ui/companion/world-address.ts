/** Your World's address, in Settings › Agents (core/agent/WORLD-ADDRESS.md, host `worldAddress`): the person picks a
 * name and their World opens at `https://<name>.worldlet.ai` on any device. Nothing is visible there unless they allow
 * a browser of their own (on a card in Attention) or share their board. Below the address: the browsers that can open
 * the World, what is shared and with whom, each with a way to end it. Plain words: no passkeys, tokens or rooms. */
import {agentButton as button,agentDay,agentEl as el} from './agent-change.ts';
type Status={name:string|null;address?:string;reachable:boolean;remote:boolean;error?:string;
 devices:{id:string;name:string;addedAt:string;usedAt?:string}[];
 visitors:{id:string;name:string;sees:string[];seenAt?:string}[];
 shares:{id:string;title:string;open:boolean;link?:string;people:number}[]};

export async function showWorldAddress(target:HTMLElement,call:(action:string,body?:any)=>Promise<any>,current:()=>boolean){
 const box=el('div','companion-settings-approvals companion-settings-world-address'),said=el('p','companion-settings-status');said.setAttribute('role','status');
 box.dataset.worldAddress='';target.append(box,said);
 let changing=false,copied='';
 const day=(iso?:string)=>iso?agentDay(Date.parse(iso)):'';
 async function act(body:Record<string,unknown>,done:string){
  said.textContent='';
  try{await call('worldAddress',body);await draw();said.textContent=done;}
  catch(e){said.textContent=(e as Error).message||'Could not do that. Try again.';}
 }
 async function copy(text:string,what:string){
  try{await navigator.clipboard.writeText(text);copied=text;await draw();said.textContent=what;}catch{said.textContent='Could not copy. Try again.';}
 }
 function picker(row:HTMLElement,status:Status){
  const name=document.createElement('input');name.className='companion-settings-input';name.placeholder='alex';name.maxLength=32;name.setAttribute('aria-label','Name for your World\'s address');
  name.autocomplete='off';name.spellcheck=false;
  const preview=el('span','companion-settings-quiet');
  const show=()=>{const v=name.value.trim().toLowerCase();preview.textContent=v?`Your address: https://${v}.worldlet.ai`:'3 to 32 letters or digits; hyphens between them are fine.';};
  name.oninput=show;show();
  row.append(name,preview,button(status.name?'Change address':'Choose','world-address-claim',async()=>{
   said.textContent='';
   try{
    const check=await call('worldAddress',{operation:'check',name:name.value});
    if(!check?.valid){said.textContent='Use 3 to 32 lowercase letters or digits, with single hyphens between them. Some names are kept for Worldlet itself.';return;}
    if(!check.available&&!check.yours){said.textContent=`${check.name}.worldlet.ai is taken. Try another name.`;return;}
    await call('worldAddress',{operation:'claim',name:name.value});changing=false;await draw();
    said.textContent=status.name?'Your World has a new address. Browsers you allowed before need to ask again there.':'Your World now has its own address. Open it on another device and ask to use that browser.';
   }catch(e){said.textContent=(e as Error).message||'Could not choose that name. Try again.';}
  },true));
  if(status.name)row.append(button('Cancel','world-address-cancel',async()=>{changing=false;await draw();}));
 }
 async function draw(){
  const status:Status|{error:string}=await call('worldAddress',{operation:'status'}).catch((e:Error)=>({error:e.message}));
  if(!current())return;
  box.replaceChildren();
  const row=el('div','companion-settings-row'),words=el('div');row.append(words);box.append(row);
  words.append(el('strong','','Your World\'s address'));
  if(!('devices' in status)){words.append(el('span','',status.error||'Not available here.'));return;}
  if(!status.name||changing){
   if(!status.name)words.append(el('span','','Give your World its own web address, like alex.worldlet.ai, and open it from any device. Nobody else sees anything there unless you allow them.'));
   const form=el('div','companion-settings-access-add');picker(form,status);box.append(form);
   return;
  }
  const address=el('code','companion-settings-remote-address',status.address||'');address.dataset.worldAddressLink='';words.append(address);
  words.append(el('span','companion-settings-quiet',status.error?status.error:status.reachable?'Open it on another device and choose "Ask to use this browser". A card here asks you to allow it.'
   :!status.remote?'Remote access is off, so this address says your World is offline. Turn it on above.':'This computer cannot reach the internet right now. Worldlet keeps trying.'));
  words.append(el('span','companion-settings-quiet','It works while this computer is on and Worldlet is running.'));
  const actions=el('div','companion-settings-actions');
  if(status.address)actions.append(button(copied===status.address?'Copied':'Copy address','world-address-copy',()=>copy(status.address!,'Address copied.'),true));
  actions.append(button('Change','world-address-change',async()=>{changing=true;await draw();}),
   button('Give up this address','world-address-release',()=>act({operation:'release'},'This World no longer has its own address. The name is free for anyone.')));
  row.append(actions);

  // The person's own browsers.
  const browsers=el('div','companion-settings-access-group');browsers.dataset.worldAddressBrowsers='';
  browsers.append(el('strong','','Your browsers'));
  if(!status.devices.length)browsers.append(el('span','companion-settings-quiet','None yet. Only browsers you allow can open your World here.'));
  for(const device of status.devices){
   const line=el('div','companion-settings-row');
   line.append(el('span','',`${device.name} · added ${day(device.addedAt)}${device.usedAt?` · last opened ${day(device.usedAt)}`:''}`),
    button('Sign out','world-address-sign-out',()=>act({operation:'remove',id:device.id},`${device.name} is signed out. Your World's link for other devices changed too, so copy it again where you use it.`)));
   browsers.append(line);
  }
  box.append(browsers);

  // What is shared, and with whom.
  const shared=el('div','companion-settings-access-group');shared.dataset.worldAddressShares='';
  shared.append(el('strong','','Shared'),el('span','companion-settings-quiet','Share your board, read only. People you allow ask with their name, and a card here asks you first.'));
  for(const share of status.shares){
   const line=el('div','companion-settings-row');
   line.append(el('span','',`${share.title} · ${share.open?'anyone with the link':share.people===1?'1 person you allowed':`${share.people} people you allowed`}`));
   if(share.link)line.append(button(copied===share.link?'Copied':'Copy link','world-address-share-copy',()=>copy(share.link!,share.open?'Link copied. Anyone who has it can see your board.':'Link copied. Send it to the people you want to see your board.')));
   line.append(button('Stop sharing','world-address-unshare',()=>act({operation:'unshare',id:share.id},`${share.title} is no longer shared.`)));
   shared.append(line);
  }
  const add=el('div','companion-settings-actions');
  add.append(button('Share board with people you allow','world-address-share-invite',()=>act({operation:'share',open:false},'Copy the link and send it. Each person asks to see it, and you allow them here.')),
   button('Share board with anyone who has the link','world-address-share-open',()=>act({operation:'share',open:true},'Anyone with the link can now see your board, read only. Stop sharing whenever you like.')));
  shared.append(add);
  box.append(shared);

  // People the person allowed, each like an Agent of their own: what they see, when they last looked, and Remove.
  if(status.visitors.length){
   const people=el('div','companion-settings-access-group');people.dataset.worldAddressPeople='';
   people.append(el('strong','','People'));
   for(const visitor of status.visitors){
    const line=el('div','companion-settings-row');
    line.append(el('span','',`${visitor.name} · sees ${visitor.sees.join(', ')||'nothing'}${visitor.seenAt?` · last looked ${day(visitor.seenAt)}`:''}`),
     button('Remove','world-address-remove',()=>act({operation:'remove',id:visitor.id},`${visitor.name} can no longer see anything here.`)));
    people.append(line);
   }
   box.append(people);
  }
 }
 await draw();
}
