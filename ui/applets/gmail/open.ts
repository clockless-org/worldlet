import {mailMetadata} from './metadata.ts';
import {mailAvatar,mailTime,mailTitle,mailIdentity} from './presentation.ts';
import {attentionIcon} from '../../attention/index.ts';
/** Group only explicit thread identities, never similar subjects. */
export function mailMatters(items){
 const result=[],threads=new Map();
 for(const item of items){
  const thread=item.record?.threadId;
  if(thread&&threads.has(thread)){
   const existing=threads.get(thread);existing.members.push(item);existing.messageCount=Math.max(existing.messageCount||1,item.record?.messageCount||1,existing.members.length);
   if(item.attention&&!existing.attention){existing.attention=item.attention;existing.title=item.title;existing.record=item.record;existing.curated=item.curated;existing.id=item.id;}
  }else{const entry={...item,members:[item],messageCount:item.record?.messageCount||1};result.push(entry);if(thread)threads.set(thread,entry);}
 }
 return result;
}
export function mailCategory(item){
 if(item.attention)return 'attention';
 const labels=new Set((item.members||[item]).flatMap(i=>i.record?.labelIds||[]));
 return labels.has('SPAM')?'spam':labels.has('CATEGORY_PROMOTIONS')?'promotions':'other';
}
/** Mail's Open view: the letters that need the person, at most nine, and where the mailbox stands. It renders into the
 * scene region the shared renderer gives it (ui/applets/scene) with the shared scene controls, so the theme decides
 * the paper, ink, fonts and buttons and Mail decides only what is on the page. */
export function renderMailOpen(region:HTMLElement,items,value,onPick){
 const important=mailMatters(items).filter(item=>!!item.attention).slice(0,9);
 const el=(tag,cls,text='')=>Object.assign(document.createElement(tag),{className:cls,textContent:text});
 region.dataset.mailReading=String(!!value?.reading);region.setAttribute('aria-label','Mail');
 const head=el('header','scene-head mail-open-head');
 head.append(el('h2','scene-title','Needs your attention'));
 const account=value?.sample?'Sample mail':value?.connected?(value.accountLabel||'Connected mailbox'):'Mail not connected';
 const status=value?.reading?'Reading…':!value?.connected?'Connect with Fox':'';
 head.append(el('p','scene-meta mail-account',[account,status].filter(Boolean).join(' · ')));
 const list=el('div','scene-list mail-letters');
 for(const [index,item] of important.entries()){
  const record=mailMetadata(item.record),from=record.from,title=item.record?.title||item.title;
  const b=el('button','scene-item mail-letter');b.type='button';b.dataset.itemId=item.id;b.dataset.curated=String(!!item.curated);b.dataset.stacked=String(item.messageCount>1);b.style.setProperty('--leaf',String(index));
  b.title=title;b.setAttribute('aria-label',title);
  const stamp=mailAvatar(from,record.avatar);stamp.classList.add('mail-letter-avatar');
  const text=el('span','mail-letter-text');text.append(el('span','mail-letter-sender',from?mailIdentity(from).name:'Sender unavailable'),el('strong','mail-letter-subject',mailTitle(title,item.curated?item.title:'')));
  const side=el('span','mail-letter-side');
  const mark=el('i','applet-attention applet-item-attention');mark.dataset.state=item.attention.state;mark.innerHTML=attentionIcon(item.attention.state,false,item.attention.priority);mark.setAttribute('aria-hidden','true');side.append(mark);
  // mailMetadata already falls back through receivedAt, sentAt, internalDate and the Date header.
  if(record.date){const formatted=mailTime(record.date),time=el('time','mail-letter-time',formatted.label);time.title=formatted.exact;if(formatted.iso)time.dateTime=formatted.iso;side.append(time);}
  b.append(stamp,text,side);b.onclick=()=>onPick(item);list.append(b);
 }
 const children:HTMLElement[]=[head,list];
 // Only a finished read says nothing waits; an unconnected, failed or unfinished one stays quiet (the line above and Fox
 // say where the mailbox stands).
 if(!important.length&&value?.connected&&value?.loaded&&!value?.error)children.push(el('p','scene-empty mail-empty','No letters need you right now.'));
 region.replaceChildren(...children);
 return important;
}
