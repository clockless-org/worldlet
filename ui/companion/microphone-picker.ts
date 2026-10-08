// The microphone menu under Fox's mic button (#1228): right-click or the context-menu key opens it.
// "Default microphone" plus the input devices; the current one is checked. The list refreshes when
// devices are plugged or unplugged while it is open. Where the host offers it, "Talk with Fox" heads the menu
// (ui/companion/fox-talk.ts): a spoken conversation that stays on until it is chosen again or Escape.
import {chooseMicrophone,microphoneText,resolveMicrophone,savedMicrophone,type Microphone} from './microphone.ts';

export function mountMicrophonePicker({anchor,list,talk=null}:{anchor:HTMLElement,list:()=>Promise<Microphone[]>,talk?:{readonly active:boolean,toggle:()=>void}|null}){
 const menu=document.createElement('div');menu.className='companion-mic-menu';menu.hidden=true;menu.setAttribute('role','menu');
 let open=false,serial=0;
 const items=()=>[...menu.querySelectorAll<HTMLButtonElement>('[role=menuitemradio],[role=menuitemcheckbox]')];
 function item(label:string,checked:boolean,choice:Microphone|null){
  const b=document.createElement('button');b.type='button';b.setAttribute('role','menuitemradio');b.setAttribute('aria-checked',String(checked));b.textContent=label;b.title=label;
  b.dataset.microphone=choice?.id||'';
  b.onclick=e=>{e.stopPropagation();chooseMicrophone(choice);close(true);};
  return b;
 }
 async function refresh(){
  const turn=++serial;let inputs:Microphone[]=[];
  try{const value=await list();if(Array.isArray(value))inputs=value;}catch{}
  if(turn!==serial||!open)return;
  const current=resolveMicrophone(savedMicrophone(),inputs),focused=(document.activeElement as HTMLElement)?.dataset?.microphone;
  menu.setAttribute('aria-label',microphoneText('Choose microphone'));
  const devices=[item(microphoneText('Default microphone'),!current,null),...inputs.map((d,i)=>item(d.label||`${microphoneText('Microphone')} ${i+1}`,current?.id===d.id,d))];
  if(talk){
   const t=document.createElement('button'),line=document.createElement('div');t.type='button';t.setAttribute('role','menuitemcheckbox');t.setAttribute('aria-checked',String(talk.active));t.textContent=t.title='Talk with Fox';t.dataset.microphone='talk';
   t.onclick=e=>{e.stopPropagation();close(true);talk.toggle();};line.setAttribute('role','separator');
   menu.replaceChildren(t,line,...devices);
  }else menu.replaceChildren(...devices);
  const again=items().find(b=>b.dataset.microphone===focused);
  if(again)again.focus();else if(!menu.contains(document.activeElement))(items().find(b=>b.getAttribute('aria-checked')==='true')||items()[0])?.focus();
 }
 function show(){
  if(open)return;open=true;menu.hidden=false;
  if(!menu.isConnected)(anchor.closest('#notionWorld')||document.body).append(menu);
  // Fixed to the viewport, centred on the mic; it opens upward when the mic sits low on screen.
  const a=anchor.getBoundingClientRect(),above=a.top>innerHeight/2;
  menu.style.left=`${Math.round(Math.min(innerWidth-8,Math.max(8,a.left+a.width/2)))}px`;
  menu.style.top=above?'':`${Math.round(a.bottom+6)}px`;menu.style.bottom=above?`${Math.round(innerHeight-a.top+6)}px`:'';
  void refresh();
 }
 function close(focus=false){if(!open)return;open=false;serial++;menu.hidden=true;menu.replaceChildren();if(focus)anchor.focus();}
 anchor.addEventListener('contextmenu',e=>{e.preventDefault();e.stopPropagation();if(open)close(true);else show();});
 menu.addEventListener('pointerdown',e=>e.stopPropagation());
 menu.addEventListener('keydown',e=>{
  const all=items(),i=all.indexOf(document.activeElement as HTMLButtonElement);
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);}
  else if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();all[(i+(e.key==='ArrowDown'?1:-1)+all.length)%all.length]?.focus();}
  else if(e.key==='Tab')close();
 });
 document.addEventListener('pointerdown',e=>{if(open&&!menu.contains(e.target as Node)&&e.target!==anchor)close();},true);
 window.addEventListener('blur',()=>close());
 navigator.mediaDevices?.addEventListener?.('devicechange',()=>{if(open)void refresh();});
 window.addEventListener('worldlet:speech',(e:any)=>{if(open&&e.detail?.phase==='devices')void refresh();});
 return {open:show,close,get isOpen(){return open;},element:menu};
}
