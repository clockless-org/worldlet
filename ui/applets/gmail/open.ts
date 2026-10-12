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
/** The theme paints the desk; live HTML supplies the inbox and selected original. */
type MailDeskState={tab:string;query:string;selected:string};
const desks=new WeakMap<HTMLElement,MailDeskState>();
export function renderMailOpen(region:HTMLElement,items,value,onPick){
 const state=desks.get(region)||{tab:'attention',query:'',selected:''};desks.set(region,state);
 const actions=value?.mail,threads=mailMatters(items),important=threads.filter(item=>!!item.attention).slice(0,9);
 const el=(tag,cls,text='')=>Object.assign(document.createElement(tag),{className:cls,textContent:text});
 const button=(text,run,cls='mail-desk-button')=>{const b=el('button',cls,text) as HTMLButtonElement;b.type='button';b.onclick=run;return b;};
 region.classList.add('mail-desk-host');region.dataset.mailReading=String(!!value?.reading);region.setAttribute('aria-label','Mail');
 const desk=el('section','mail-desk'),index=el('aside','mail-desk-index'),letter=el('article','mail-desk-letter');
 const header=el('header','mail-desk-header');header.append(el('h2','scene-title','Mail'));
 const account=value?.sample?'Sample mail':value?.connected?(value.accountLabel||'Connected mailbox'):'Mail not connected';
 header.append(el('p','mail-account',account));
 const tabs=el('nav','mail-desk-tabs');tabs.setAttribute('aria-label','Mail folders');
 const search=el('input','mail-desk-search') as HTMLInputElement;search.type='search';search.placeholder='Search letters…';search.setAttribute('aria-label','Search letters');search.value=state.query;
 const list=el('div','mail-letters');list.setAttribute('aria-label','Letters');
 const footer=el('footer','mail-desk-footer');if(actions?.compose)footer.append(button('Compose with Fox',()=>actions.compose()));
 index.append(header,tabs,search,list,footer);desk.append(index,letter);region.replaceChildren(desk);let serial=0;
 function paint(){
  tabs.replaceChildren();for(const [key,label] of [['attention','Needs you'],['inbox','Inbox'],['starred','Starred'],['sent','Sent']]){const b=button(label,()=>{state.tab=key;paint();});b.setAttribute('aria-pressed',String(state.tab===key));tabs.append(b);}
  const pool=state.tab==='attention'?important:threads.filter(item=>{const labels=(item.members||[item]).flatMap(m=>m.record?.labelIds||[]);return state.tab==='starred'?labels.includes('STARRED'):state.tab==='sent'?labels.includes('SENT'):!labels.includes('SPAM')&&!labels.includes('TRASH')&&!labels.includes('SENT');});
  const filtered=pool.filter(item=>[item.title,item.record?.title,item.record?.from,item.summary].filter(Boolean).join(' ').toLowerCase().includes(state.query.toLowerCase()));
  if(!filtered.some(item=>item.id===state.selected))state.selected=filtered[0]?.id||'';
  list.replaceChildren();
  for(const item of filtered){
   const record=mailMetadata(item.record),title=item.record?.title||item.title;
   const b=button('',()=>{state.selected=item.id;if(!actions?.read){onPick(item);return;}desk.dataset.reading='true';paintRows();void read(item,true);},'mail-letter');
   b.dataset.itemId=item.id;b.dataset.curated=String(!!item.curated);b.dataset.stacked=String(item.messageCount>1);b.setAttribute('aria-label',title);b.title=title;
   const avatar=mailAvatar(record.from,record.avatar);avatar.classList.add('mail-letter-avatar');
   const copy=el('span','mail-letter-text');copy.append(el('strong','mail-letter-sender',mailIdentity(record.from).name),el('span','mail-letter-subject',mailTitle(title)),el('small','mail-letter-snippet',item.summary||item.context||''));
   const side=el('span','mail-letter-side');if(record.date){const time=mailTime(record.date);const node=el('time','mail-letter-time',new Date(time.iso||record.date).toLocaleDateString(undefined,{month:'short',day:'numeric'}));node.title=time.exact;side.append(node);}
   if(item.attention){const mark=el('i','applet-attention applet-item-attention');mark.dataset.state=item.attention.state;mark.innerHTML=attentionIcon(item.attention.state,false,item.attention.priority);mark.setAttribute('aria-hidden','true');side.append(mark);}
   b.append(avatar,copy,side);list.append(b);
  }
  if(!filtered.length){const text=state.query?'No matching letters.':value?.reading?'Reading mail…':!value?.connected?'Connect Mail with Fox to read your letters.':value?.loaded&&!value?.error?(state.tab==='attention'?'No letters need you right now.':'No letters in this view.'):'Waiting for saved mail.';list.append(el('p',value?.loaded&&!value?.error?'mail-empty':'mail-desk-status',text));}
  paintRows();void read(filtered.find(item=>item.id===state.selected));
 }
 function paintRows(){for(const row of list.querySelectorAll('.mail-letter'))row.setAttribute('aria-pressed',String(row.dataset.itemId===state.selected));}
 async function read(item,explicit=false){
  const request=++serial;letter.replaceChildren();
  if(!item){letter.append(el('p','mail-desk-status','Select a letter to read it here.'));return;}
  const back=button('All letters',()=>{desk.dataset.reading='false';},'mail-desk-back');letter.append(back);
  const body=el('div','mail-desk-body');body.setAttribute('aria-live','polite');body.append(el('p','mail-desk-status','Opening letter…'));letter.append(body);
  try{
   const original=actions?.read?await actions.read(item):{text:item.record?.text||item.summary||'',title:item.record?.title||item.title};
   if(request!==serial||!desk.isConnected)return;if(typeof original?.text!=='string')throw Error('This letter is unavailable.');
   body.replaceChildren();if(actions?.renderOriginal)body.append(actions.renderOriginal(original));else body.append(el('h3','',original.title||item.title),el('p','mail-desk-plain',original.text));
   const tools=el('footer','mail-desk-actions');if(actions?.reply)tools.append(button('Reply with Fox',()=>actions.reply(item)));tools.append(button('Original',()=>onPick(item)));letter.append(tools);
   actions?.selected?.(item,original,explicit);
  }catch(error){if(request!==serial||!desk.isConnected)return;body.replaceChildren(el('p','mail-desk-status',error.message||'Could not read this letter.'),button('Try again',()=>void read(item,explicit)));}
 }
 search.oninput=()=>{state.query=search.value;paint();};paint();return important;
}
