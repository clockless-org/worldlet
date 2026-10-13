/** Fox's conversation laid out like a chat (owner Order 2026-10-12: "左边是 thread … 右边是一个对话列表", then "跟我们平时的那个
 * 对话框还是要统一的"): expanded in the World, the card gives way to the session's whole history over Fox. The sessions
 * stand on the left (fox-sessions.ts: the main one a primary card, the others scrolling under it); on the right each turn
 * is one of Fox's usual cards, oldest first: what the person said is its top line ("You · …"), Fox's answer under it.
 * A long answer folds to a few lines with Show more. */
import {mountFoxSessions} from './fox-sessions.ts';
import {showQuestion,type ThreadEntry} from './fox-thread.ts';
import type {FoxSession} from '../../core/tasks/index.ts';

/** One message pair of the window: an entry of the thread, or Fox's line that is not a turn (`user` empty). `working`
 * is the step Fox is on while the turn runs. */
export type FoxChatMessage=Pick<ThreadEntry,'id'|'user'|'userIcon'|'text'|'status'>&{working?:string};
export type FoxChatWindow={element:HTMLElement;show(state:{visible:boolean;sessions:readonly FoxSession[];here:string;name:string;title:string;detail:string;messages:readonly FoxChatMessage[]}):void};

// Lines an answer shows before it folds.
const LINES=6;

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
 // One turn, one card: the person's words its one top line, the answer (or the step Fox is on) under it.
 const card=(m:FoxChatMessage)=>{
  const item=document.createElement('article');item.className='fox-chat-card';item.dataset.status=m.status;
  if(m.user){const asked=document.createElement('p');asked.className='fox-chat-asked';showQuestion(asked,m);asked.title=m.user;item.append(asked);}
  const working=m.status==='working'&&m.working!==undefined;item.dataset.working=String(working);
  const body=document.createElement('div');body.className='fox-chat-body';body.style.setProperty('--lines',String(LINES));
  if(working)body.append(document.createTextNode(m.working!));else if(m.text)body.append(answer(m.text));
  body.hidden=!body.childNodes.length;item.append(body);
  const more=document.createElement('button');more.type='button';more.className='fox-chat-more';more.hidden=true;
  const shown=()=>{const open=opened.has(m.id);item.dataset.open=String(open);more.textContent=open?'Show less':'Show more';more.setAttribute('aria-expanded',String(open));};
  more.onclick=e=>{e.stopPropagation();if(!opened.delete(m.id))opened.add(m.id);shown();};
  shown();item.append(more);
  return item;
 };
 // Only an answer taller than its lines gets Show more; measured once it is in the page.
 const measure=()=>{for(const item of list.querySelectorAll<HTMLElement>('.fox-chat-card')){const body=item.querySelector<HTMLElement>('.fox-chat-body')!,more=item.lastElementChild as HTMLElement;more.hidden=item.dataset.open!=='true'&&(body.hidden||body.scrollHeight<=body.clientHeight+2);}};
 return {element,show({visible,sessions:all,here,name,title:heading,detail:line,messages}){
  element.hidden=!visible;
  if(!visible){signature='';return;}
  sessions.show({visible:true,sessions:all,here,name});
  title.textContent=heading;detail.textContent=line;detail.hidden=!line;
  const next=JSON.stringify([here,messages.map(m=>[m.id,m.status,m.user,m.text.length,m.working||''])]);
  if(next===signature)return;
  const moved=place!==here;place=here;signature=next;
  const rows=messages.filter(m=>m.user||m.text||m.status==='working').map(card);
  const keep=!moved&&!atEnd?list.scrollTop:-1;
  list.replaceChildren(...rows);
  measure();
  // The newest message is in view, unless the person scrolled up to read an earlier one.
  if(keep<0){list.scrollTop=list.scrollHeight;atEnd=true;}else list.scrollTop=keep;
  requestAnimationFrame(()=>{measure();if(atEnd)list.scrollTop=list.scrollHeight;});
 }};
}
