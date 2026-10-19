import qrcode from 'qrcode-generator';

// The companion panel's Mobile page (agent/windows/README.md): pair the Worldlet iPhone or Android app by QR code, see the paired
// phone and whether it takes notifications, unpair. The host owns the pairing (`phonePair`) and reports changes as
// `worldlet:phone-status`. Below it, another Worldlet (a laptop) can use this computer's Agent for Fox (`phonePair` with
// `kind: 'agent'`, `worldlet:agent-pair-status`, agent/windows/README.md#another-computers-agent): its code is pasted there
// (a laptop rarely scans), so it shows as text to copy. Last, any web browser can open the same Center and Fox
// (agent/windows/README.md#web): a browser on this computer opens a link this app serves itself (`phonePair` with `kind:
// 'local'`, `worldlet:local-pair-status`), and another device's browser a link to copy (`kind: 'web'`,
// `worldlet:web-pair-status`). That link carries the full World's own pairing (`kind: 'world'`,
// `worldlet:world-pair-status`, agent/windows/README.md#the-world-on-another-device), which a computer's browser goes on to.
type Status={state:'none'|'waiting'|'paired',link?:string,phone?:{name:string,version:string}|null,seenAt?:number|null,push?:{platform:string}|null,error?:string};
export function pairingQR(link:string){
 const qr=qrcode(0,'M');qr.addData(link,'Byte');qr.make();
 return qr.createSvgTag({cellSize:4,margin:2,scalable:true});
}
const seen=(at?:number|null)=>{
 if(!at)return 'Not opened yet';
 const minutes=Math.round((Date.now()-at)/60000);
 return minutes<2?'Active now':minutes<60?`Last seen ${minutes} minutes ago`:'Last seen '+new Date(at).toLocaleString([],{weekday:'short',hour:'numeric',minute:'2-digit'});
};

export function createCompanionPhone({call}:{call:(action:string,body?:any)=>Promise<any>}){
 const el=(tag:string,cls='',text='')=>Object.assign(document.createElement(tag),{className:cls,textContent:text});
 const element=el('section','companion-info-section companion-phone-page');element.dataset.section='Mobile';
 let status:Status|null=null,agent:Status|null=null,web:Status|null=null,local:Status|null=null,world:Status|null=null,busy=false,error='',copied=false,agentCopied=false,webCopied=false;
 const button=(label:string,run:()=>Promise<unknown>|void,primary=false)=>{
  const b=el('button','companion-info-action'+(primary?' primary':''),label) as HTMLButtonElement;b.type='button';b.disabled=busy;
  b.onclick=async()=>{if(busy)return;busy=true;error='';render();try{await run();}catch(e){error=(e as Error).message||'Please try again.';}finally{busy=false;render();}};
  return b;
 };
 const pair=async(operation:'start'|'end'|'status')=>{status=await call('phonePair',{operation});copied=false;};
 const pairAgent=async(operation:'start'|'end'|'status')=>{agent=await call('phonePair',{operation,kind:'agent'});agentCopied=false;};
 const pairWeb=async(operation:'start'|'end'|'status'|'background')=>{web=await call('phonePair',{operation,kind:'web'});if(operation!=='background')webCopied=false;};
 const pairLocal=async(operation:'start'|'end'|'status'|'open'|'background')=>{local=await call('phonePair',{operation,kind:'local'});};
 const pairWorld=async(operation:'status'|'open'|'background')=>{world=await call('phonePair',{operation,kind:'world'});};
 function browsers(){
  const box=el('div','companion-phone-browser'),on=(p:Status|null)=>p?.state==='waiting'||p?.state==='paired';
  const opened=(p:Status|null)=>p?.state==='paired'?(p.phone?.name?`Opened in ${p.phone.name}`:'Opened in a browser')+' · '+seen(p.seenAt):'';
  box.append(el('h4','','In a browser'),el('p','','Open what needs you, what your Agent is doing and Fox in any web browser. Keep the link private: anyone who has it can see and approve here.'));
  if(!local||!web)return box;
  // This computer: Worldlet serves the page itself, so nothing goes over the internet (modules/phone local-relay.ts).
  box.append(el('p','companion-phone-place','On this computer'));
  if(local.state==='paired')box.append(el('p','',opened(local)));
  box.append(button('Open in browser',async()=>{if(!on(local))await pairLocal('start');await pairLocal('open');},true));
  // The full 3D World, the same page as this window, served beside it (host/world-web.ts).
  box.append(button('Open the World in browser',()=>call('phonePair',{kind:'local',operation:'world'})));
  // Another device: a link to copy (still through the relay; agent/windows/README.md#web).
  box.append(el('p','companion-phone-place','On another device'));
  if(web.state==='paired')box.append(el('p','',opened(web)));
  // The full World on another device: the same link goes on to it where the device can draw it; this opens it here.
  if(world?.state==='paired')box.append(el('p','companion-phone-world','The full World opened on another device · '+seen(world.seenAt)));
  box.append(button(webCopied?'Link copied':'Copy link',async()=>{if(!on(web))await pairWeb('start');if(web?.link){await navigator.clipboard.writeText(web.link);webCopied=true;}}),
   button('Open the World',async()=>{await pairWorld('open');}));
  const paired=local.state==='paired'||web.state==='paired'||world?.state==='paired';
  if(on(local)||on(web)||on(world)){
   box.append(button(paired?'Turn off':'Cancel',async()=>{if(on(local))await pairLocal('end');if(on(web)||on(world))await pairWeb('end');}));
   // Run in background: no window stays on screen, not even Fox, and the links keep working (modules/phone).
   if(paired)box.append(el('p','','Use Worldlet only from the browser: close every window and keep it running. Click Worldlet in the Dock or the notification area to bring the World back.'),
    button('Run in background',()=>local?.state==='paired'?pairLocal('background'):web?.state==='paired'?pairWeb('background'):pairWorld('background')));
  }
  return box;
 }
 function computers(){
  const box=el('div','companion-phone-computers');
  box.append(el('h4','','Another computer'),el('p','','Let Worldlet on your laptop use the Agent on this computer for Fox. Fox keeps the laptop’s own conversations and works in its World there. Keep this computer awake with Worldlet open.'));
  if(agent?.state==='waiting'&&agent.link){
   const link=agent.link,code=el('code','companion-phone-code',link);
   box.append(el('p','','On the other computer, choose “My Agent is on another computer” and paste this code.'),code,
    button(agentCopied?'Code copied':'Copy code',async()=>{await navigator.clipboard.writeText(link);agentCopied=true;}),button('Cancel',()=>pairAgent('end')));
  }else if(agent?.state==='paired')box.append(el('p','',(agent.phone?.name?`Paired with ${agent.phone.name}`:'Paired with your other computer')+' · '+seen(agent.seenAt)),button('Unpair',()=>pairAgent('end')));
  else if(agent)box.append(button('Pair another computer',()=>pairAgent('start')));
  return box;
 }
 function render(){
  const head=[el('h3','','Mobile'),el('p','companion-phone-intro','Take your Attention Center and Fox with you. Your computer does the work; your iPhone or Android phone shows what needs you and talks to Fox.')];
  const body=el('div','companion-phone-body');
  if(!status)body.append(el('p','companion-info-note','Checking pairing…'));
  else if(status.state==='waiting'&&status.link){
   const code=el('div','companion-phone-qr');code.innerHTML=pairingQR(status.link);code.setAttribute('role','img');code.setAttribute('aria-label','Pairing code for the Worldlet phone app');
   const steps=el('div','companion-phone-steps');
   const link=status.link;
   steps.append(el('h4','','Scan with your phone'),el('p','','Open the Worldlet app on your iPhone or Android phone and scan this code.'),el('p','companion-info-note','Waiting for your phone…'),
    button(copied?'Link copied':'Copy pairing link',async()=>{await navigator.clipboard.writeText(link);copied=true;}),button('Cancel',()=>pair('end')));
   body.append(code,steps);
  }else if(status.state==='paired'){
   const row=el('div','companion-phone-paired');
   row.append(el('h4','',status.phone?.name?`Paired with ${status.phone.name}`:'Paired with your phone'),el('p','',seen(status.seenAt)));
   // Absent until the relay says (an older relay never does).
   if(status.push!==undefined)row.append(el('p','companion-phone-push',status.push?'Notifications on':'Notifications off: allow them in the Worldlet app on your phone'));
   row.append(button('Unpair',()=>pair('end')));
   body.append(row);
  }else body.append(button('Pair phone',()=>pair('start'),true));
  body.append(computers(),browsers());
  body.append(el('p','companion-info-note','Pairing is end-to-end encrypted: Worldlet passes messages between your computer and phone but cannot read them.'));
  const notice=el('p','companion-info-note',error||status?.error||'');notice.setAttribute('role','status');notice.hidden=!(error||status?.error);
  element.replaceChildren(...head,body,notice);
 }
 window.addEventListener('worldlet:phone-status',e=>{status=(e as CustomEvent).detail;render();});
 window.addEventListener('worldlet:agent-pair-status',e=>{agent=(e as CustomEvent).detail;render();});
 window.addEventListener('worldlet:web-pair-status',e=>{web=(e as CustomEvent).detail;render();});
 window.addEventListener('worldlet:local-pair-status',e=>{local=(e as CustomEvent).detail;render();});
 window.addEventListener('worldlet:world-pair-status',e=>{world=(e as CustomEvent).detail;render();});
 render();
 return {element,
  /** The panel opened: read the current pairing. */
  async refresh(){try{await pair('status');await pairAgent('status');await pairWeb('status');await pairLocal('status');await pairWorld('status');}catch(e){error=(e as Error).message;}render();}};
}
