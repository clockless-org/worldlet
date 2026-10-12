/** Fox's conversation laid out like a chat (owner Order 2026-10-12: "左边是 thread … 右边是一个对话列表", then "不要做成一个
 * panel 还是对话框 一个一个气泡的"): expanded in the World, the card gives way to floating speech bubbles over Fox, with
 * no box around them. The sessions stand on the left (fox-sessions.ts: the main one a primary card, the others scrolling
 * under it); the session's history rises on the right, one bubble per message, the person's on the right and Fox's on
 * the left, in one type size. A long message folds to a few lines with Show more. */
import {mountFoxSessions} from './fox-sessions.ts';
import {showQuestion,type ThreadEntry} from './fox-thread.ts';
import type {FoxSession} from '../../core/tasks/index.ts';

/** One message pair of the window: an entry of the thread, or Fox's line that is not a turn (`user` empty). `working`
 * is the step Fox is on while the turn runs. */
export type FoxChatMessage=Pick<ThreadEntry,'id'|'user'|'userIcon'|'text'|'status'>&{working?:string};
export type FoxChatWindow={element:HTMLElement;show(state:{visible:boolean;sessions:readonly FoxSession[];here:string;name:string;title:string;detail:string;messages:readonly FoxChatMessage[]}):void};

// Lines a message shows before it folds: the person's own words are known to them, so they fold sooner.
const USER_LINES=4,FOX_LINES=12;

export function mountFoxChatWindow({pick,close,answer}:{pick:(session:FoxSession|null)=>void;close:()=>void;answer:(text:string)=>Node}):FoxChatWindow{
 const element=document.createElement('div');element.className='fox-chat-window';element.hidden=true;
 element.setAttribute('role','dialog');element.setAttribute('aria-label','Conversation');
 element.addEventListener('pointerdown',e=>e.stopPropagation());
 const sessions=mountFoxSessions({pick});
 const main=document.createElement('section');main.className='fox-chat-main';
 const head=document.createElement('header');head.className='fox-chat-head';
 const title=document.createElement('strong'),detail=document.createElement('span');
 const fold=document.createElement('button');fold.type='button';fold.className='fox-chat-fold';
 fold.innerHTML='<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg><span>Fold</span>';
 fold.setAttribute('aria-label','Fold the conversation');fold.onclick=e=>{e.stopPropagation();close();};
 head.append(title,detail,fold);
 const list=document.createElement('div');list.className='fox-chat-messages';list.tabIndex=0;list.setAttribute('aria-label','Messages');
 main.append(head,list);element.append(sessions.element,main);
 const opened=new Set<string>();
 let signature='',atEnd=true,place='';
 list.addEventListener('scroll',()=>{atEnd=list.scrollHeight-list.clientHeight-list.scrollTop<4;},{passive:true});
 const bubble=(id:string,who:'user'|'fox',content:Node,lines:number,working=false)=>{
  const item=document.createElement('div');item.className='fox-chat-bubble';item.dataset.who=who;item.dataset.working=String(working);
  const body=document.createElement('div');body.className='fox-chat-body';body.style.setProperty('--lines',String(lines));body.append(content);
  item.append(body);
  const key=who+':'+id,more=document.createElement('button');more.type='button';more.className='fox-chat-more';more.hidden=true;
  const shown=()=>{const open=opened.has(key);item.dataset.open=String(open);more.textContent=open?'Show less':'Show more';more.setAttribute('aria-expanded',String(open));};
  more.onclick=e=>{e.stopPropagation();if(!opened.delete(key))opened.add(key);shown();};
  shown();item.append(more);
  return item;
 };
 // Only a message taller than its lines gets Show more; measured once it is in the page.
 const measure=()=>{for(const item of list.querySelectorAll<HTMLElement>('.fox-chat-bubble')){const body=item.firstElementChild as HTMLElement,more=item.lastElementChild as HTMLElement;if(item.dataset.open==='true'){more.hidden=false;continue;}more.hidden=body.scrollHeight<=body.clientHeight+2;}};
 return {element,show({visible,sessions:all,here,name,title:heading,detail:line,messages}){
  element.hidden=!visible;
  if(!visible){signature='';return;}
  sessions.show({visible:true,sessions:all,here,name});
  title.textContent=heading;detail.textContent=line;detail.hidden=!line;
  const next=JSON.stringify([here,messages.map(m=>[m.id,m.status,m.user,m.text.length,m.working||''])]);
  if(next===signature)return;
  const moved=place!==here;place=here;signature=next;
  const rows:HTMLElement[]=[];
  for(const m of messages){
   if(m.user){const asked=document.createElement('p');showQuestion(asked,m);rows.push(bubble(m.id,'user',asked,USER_LINES));}
   if(m.working!==undefined&&m.status==='working')rows.push(bubble(m.id,'fox',document.createTextNode(m.working),FOX_LINES,true));
   else if(m.text){const b=bubble(m.id,'fox',answer(m.text),FOX_LINES);if(m.status==='error')b.dataset.error='true';rows.push(b);}
  }
  const keep=!moved&&!atEnd?list.scrollTop:-1;
  list.replaceChildren(...rows);
  measure();
  // The newest message is in view, unless the person scrolled up to read an earlier one.
  if(keep<0){list.scrollTop=list.scrollHeight;atEnd=true;}else list.scrollTop=keep;
  requestAnimationFrame(()=>{measure();if(atEnd)list.scrollTop=list.scrollHeight;});
 }};
}
