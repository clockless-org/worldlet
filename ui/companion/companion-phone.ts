import qrcode from 'qrcode-generator';

// The companion panel's Mobile page (core/phone/README.md): pair the Worldlet iPhone or Android app by QR code, see the paired
// phone and whether it takes notifications, unpair. The host owns the pairing (`phonePair`) and reports changes as
// `worldlet:phone-status`. Below it, another Worldlet (a laptop) can use this computer's Agent for Fox (`phonePair` with
// `kind: 'agent'`, `worldlet:agent-pair-status`, core/phone/README.md#another-computers-agent): its code is pasted there
// (a laptop rarely scans), so it shows as text to copy.
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
 let status:Status|null=null,agent:Status|null=null,busy=false,error='',copied=false,agentCopied=false;
 const button=(label:string,run:()=>Promise<unknown>|void,primary=false)=>{
  const b=el('button','companion-info-action'+(primary?' primary':''),label) as HTMLButtonElement;b.type='button';b.disabled=busy;
  b.onclick=async()=>{if(busy)return;busy=true;error='';render();try{await run();}catch(e){error=(e as Error).message||'Please try again.';}finally{busy=false;render();}};
  return b;
 };
 const pair=async(operation:'start'|'end'|'status')=>{status=await call('phonePair',{operation});copied=false;};
 const pairAgent=async(operation:'start'|'end'|'status')=>{agent=await call('phonePair',{operation,kind:'agent'});agentCopied=false;};
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
  body.append(computers());
  body.append(el('p','companion-info-note','Pairing is end-to-end encrypted: Worldlet passes messages between your computer and phone but cannot read them.'));
  const notice=el('p','companion-info-note',error||status?.error||'');notice.setAttribute('role','status');notice.hidden=!(error||status?.error);
  element.replaceChildren(...head,body,notice);
 }
 window.addEventListener('worldlet:phone-status',e=>{status=(e as CustomEvent).detail;render();});
 window.addEventListener('worldlet:agent-pair-status',e=>{agent=(e as CustomEvent).detail;render();});
 render();
 return {element,
  /** The panel opened: read the current pairing. */
  async refresh(){try{await pair('status');await pairAgent('status');}catch(e){error=(e as Error).message;}render();}};
}
