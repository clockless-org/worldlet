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
/** Native Mail is an attention board, not a second full inbox. */
export function renderMailOpen(panel,items,value,_state,onPick,_redraw,sharedDevice=null){
 panel.mailLayoutObserver?.disconnect();
 const important=mailMatters(items).filter(item=>!!item.attention).slice(0,9);
 const el=(tag,cls,text='')=>Object.assign(document.createElement(tag),{className:cls,textContent:text});
 panel.dataset.mailCategory='attention';panel.dataset.mailReading=String(!!value?.reading);
 const parts=(globalThis as any).__WORLDLET_25D_ASSETS__?.mailParts;
 const painted=(src,cls)=>{const image=el('img',cls);image.src=src;image.alt='';image.draggable=false;return image;};
 const desk=el('div','mail-open-desk');desk.setAttribute('aria-label','Mail attention board');panel.append(desk);
 const board=el('section','mail-attention-board');board.setAttribute('aria-label','Needs Attention');desk.append(board);
 if(parts?.board)board.append(painted(parts.board,'mail-board-paint'));
 board.append(el('h2','space-sr','Needs Attention'));
 const grid=el('div','pixi-open-contents mail-open-envelopes');board.append(grid);
 for(const [index,item] of important.entries()){
  const b=el('button','pixi-stage-item');b.type='button';b.dataset.itemId=item.id;b.dataset.curated=String(!!item.curated);b.dataset.pinned='true';b.dataset.stacked=String(item.messageCount>1);b.style.setProperty('--leaf',String(index));
  const title=item.record?.title||item.title;b.title=title;b.setAttribute('aria-label',title);
  b.append(el('span','mail-envelope-front'),el('span','mail-letter-pin'),el('strong','',mailTitle(title,item.curated?item.title:'')));
  if(parts?.['pinned-envelope'])b.querySelector('.mail-envelope-front').append(painted(parts['pinned-envelope'],'mail-envelope-paint'));
  const record=mailMetadata(item.record),from=record.from;
  const stamp=mailAvatar(from,record.avatar);stamp.classList.add('mail-envelope-avatar');b.querySelector('.mail-envelope-front').append(stamp);
  b.append(el('span','mail-letter-sender',from?mailIdentity(from).name:'Sender unavailable'));
  const rawDate=record.date||record.receivedAt||record.sentAt||record.internalDate;
  if(rawDate){const formatted=mailTime(rawDate),time=el('time','mail-letter-time',formatted.label);time.title=formatted.exact;if(formatted.iso)time.dateTime=formatted.iso;b.append(time);}
  const mark=el('i','applet-attention applet-item-attention');mark.dataset.state=item.attention.state;mark.innerHTML=attentionIcon(item.attention.state,false,item.attention.priority);mark.setAttribute('aria-hidden','true');b.append(mark);
  b.onclick=()=>onPick(item);grid.append(b);
 }
 // Painted paper wear marks the empty slots without explanatory text.
 const assets=(globalThis as any).__WORLDLET_25D_ASSETS__,asset=assets?.devices?.gmail;
 if(asset&&!sharedDevice){const image=el('img','mail-open-device');image.dataset.applet='gmail';image.src=typeof asset==='string'?asset:asset.src;image.alt='';panel.append(image);}
 return important;
}
