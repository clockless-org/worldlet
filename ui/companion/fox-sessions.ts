/** Fox's sessions beside its conversation (owner request 2026-10-12, agent/tasks/fox-sessions.ts): a narrow column left
 * of the card while it shows in the World. The main session is a primary card of its own; under it, a second card
 * scrolls the person's other sessions, latest first, packed tight, each only its name (where it lives and when, on
 * hover: the owner asked for little detail).
 * A Thing's row opens its Applet; any other row switches Fox to that session right in the World. The row of the
 * session Fox is in is marked. */
import {foxSessionLine,type FoxSession} from '../../agent/tasks/index.ts';

export type FoxSessionColumn={element:HTMLElement;show(state:{visible:boolean;sessions:readonly FoxSession[];here:string;name:string}):void};

export function mountFoxSessions({pick}:{pick:(session:FoxSession|null)=>void}):FoxSessionColumn{
 const element=document.createElement('nav');element.className='fox-sessions';element.hidden=true;
 element.setAttribute('aria-label','Sessions');
 // Pressing a row must not reach the World under it, nor close the card it stands beside.
 element.addEventListener('pointerdown',e=>e.stopPropagation());
 let signature='';
 const row=(title:string,line:string,current:boolean,main:boolean,thing:boolean,onClick:()=>void)=>{
  const button=document.createElement('button');button.type='button';button.className='fox-session';
  button.dataset.main=String(main);button.dataset.thing=String(thing);button.setAttribute('aria-current',String(current));
  const name=document.createElement('strong');name.textContent=title;
  button.append(name);
  if(main){const sub=document.createElement('span');sub.textContent=line;button.append(sub);}
  button.title=[title,main?'':line,thing?'opens its Thing':''].filter(Boolean).join(' · ');
  button.onclick=e=>{e.stopPropagation();onClick();};
  return button;
 };
 return {element,show({visible,sessions,here,name}){
  element.hidden=!visible||!sessions.length;
  if(element.hidden)return;
  const now=Date.now()/1000;
  const next=JSON.stringify([here,name,sessions.map(s=>[s.id,s.title,s.where,s.last,s.thing])]);
  if(next===signature)return;signature=next;
  const others=document.createElement('div');others.className='fox-session-list';
  others.append(...sessions.map(s=>row(s.title,foxSessionLine(s,now),s.id===here,false,s.thing,()=>pick(s))));
  element.replaceChildren(row(name,'Main conversation',!here,true,false,()=>pick(null)),others);
 }};
}
