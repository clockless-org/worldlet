import {themeAppletIcon} from '../../themes/index.ts';
import {uiIcon} from '../../components/index.ts';
import {turnMailPage} from './page-turn.ts';
import type {AppletSceneRegion} from '../scene/applet-scene.ts';
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
export function renderMailOpen(region:HTMLElement,items,value,onPick,regions:readonly AppletSceneRegion[]=[]){
 const slots=Object.fromEntries(regions.map(r=>[r.id,r.element])),distributed=['navigation','letters','heading','actions','status'].every(id=>slots[id])&&region.closest<HTMLElement>('.applet-scene')?.dataset.compact!=='true';
 const active=document.activeElement as HTMLInputElement|null,wasHere=!!active&&!!region.closest('.applet-scene')?.contains(active),focusId=wasHere?active?.dataset.itemId:null,focusLabel=wasHere?active?.getAttribute('aria-label'):null,focusFolder=wasHere?active?.dataset.folder:null,caret=wasHere&&active instanceof HTMLInputElement?[active.selectionStart,active.selectionEnd]:null;
 const state=desks.get(region)||{tab:distributed?'inbox':'attention',query:'',selected:''};desks.set(region,state);
 const actions=value?.mail,threads=mailMatters(items),important=threads.filter(item=>!!item.attention).slice(0,9);
 // Only originals read by this rendered desk can fill absent envelope metadata. Summaries cannot.
 const readMetadata=new Map<string,ReturnType<typeof mailMetadata>>(),metadata=item=>readMetadata.get(item.id)||mailMetadata(item.record);
 const el=(tag,cls,text='')=>Object.assign(document.createElement(tag),{className:cls,textContent:text});
 const button=(text,run,cls='mail-desk-button')=>{const b=el('button',cls,text) as HTMLButtonElement;b.type='button';b.onclick=run;return b;};
 region.classList.add('mail-desk-host');region.dataset.mailReading=String(!!value?.reading);region.setAttribute('aria-label','Mail');
 const desk=el('section','mail-desk'),index=el('aside','mail-desk-index'),letter=el('article','mail-desk-letter');
 const header=el('header','mail-desk-header');header.append(el('h2','scene-title','Mail'));
 const account=value?.sample?'Sample mail':value?.connected?(value.accountLabel||'Connected mailbox'):'Mail not connected';
 const accountLine=el('p','mail-account',account);header.append(accountLine);
 const tabs=el('nav','mail-desk-tabs');tabs.setAttribute('aria-label','Mail folders');
 const search=el('input','mail-desk-search') as HTMLInputElement;search.type='search';search.placeholder='Search letters…';search.setAttribute('aria-label','Search letters');search.value=state.query;
 const list=el('div','mail-letters');list.setAttribute('aria-label','Letters');
 const footer=el('footer','mail-desk-footer');if(actions?.compose)footer.append(button('Compose with Fox',()=>actions.compose()));
 index.append(header,tabs,search,list,footer);desk.append(index,letter);region.replaceChildren(desk);let serial=0;
 for(const r of regions){r.element.classList.toggle('mail-region',distributed);r.element.style.setProperty('--mail-body-font',region.style.getPropertyValue('--scene-body-font'));if(r.role==='secondary')r.element.replaceChildren();}
 if(distributed){
  desk.classList.add('mail-desk-distributed');desk.replaceChildren(letter);header.querySelector('h2')!.textContent=value?.sample?'Mail · Demo':'Mail';
  const image=themeAppletIcon('gmail');if(image){const icon=document.createElement('img');icon.src=image;icon.alt='';icon.className='mail-heading-icon';header.querySelector('h2')!.prepend(icon);}
  slots.heading.append(header,search,footer);slots.navigation.append(tabs);slots.letters.append(list);slots.status.append(accountLine);
 }
 function paint(){
  const focusedFolder=(document.activeElement as HTMLElement)?.dataset.folder;
  tabs.replaceChildren();for(const [key,label] of (distributed?[['inbox','Inbox'],['drafts','Drafts'],['sent','Sent'],['attention','Needs you'],['starred','Starred']]:[['attention','Needs you'],['inbox','Inbox'],['starred','Starred'],['sent','Sent']])){const b=button(label,()=>{state.tab=key;paint();});if(distributed){const icon=el('span','mail-folder-icon');icon.innerHTML=uiIcon(({inbox:'mail',drafts:'file',sent:'forward',attention:'alert',starred:'spark'})[key]);b.prepend(icon);}
   b.dataset.folder=key;b.setAttribute('aria-pressed',String(state.tab===key));tabs.append(b);}
  if(focusedFolder)(tabs as HTMLElement).querySelector<HTMLButtonElement>('[data-folder="'+focusedFolder+'"]')?.focus({preventScroll:true});
  const pool=state.tab==='attention'?important:threads.filter(item=>{const labels=(item.members||[item]).flatMap(m=>m.record?.labelIds||[]);return state.tab==='drafts'?labels.includes('DRAFT'):state.tab==='starred'?labels.includes('STARRED'):state.tab==='sent'?labels.includes('SENT'):!labels.includes('SPAM')&&!labels.includes('TRASH')&&!labels.includes('SENT')&&!labels.includes('DRAFT');});
  const filtered=pool.filter(item=>[item.title,item.record?.title,metadata(item).from,item.summary].filter(Boolean).join(' ').toLowerCase().includes(state.query.toLowerCase()));
  if(!filtered.some(item=>item.id===state.selected))state.selected=filtered[0]?.id||'';
  list.replaceChildren();
  for(const item of filtered){
   const record=metadata(item),title=item.record?.title||item.title;
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
  const previous=explicit&&distributed?letter.querySelector('.mail-desk-body>.mail-focus')?.cloneNode(true) as HTMLElement|null:null;
  const request=++serial;letter.replaceChildren();if(distributed)slots.actions.replaceChildren();
  if(!item){letter.append(el('p','mail-desk-status','Select a letter to read it here.'));return;}
  const back=button('All letters',()=>{desk.dataset.reading='false';},'mail-desk-back');letter.append(back);
  const body=el('div','mail-desk-body');body.setAttribute('aria-live','polite');body.append(el('p','mail-desk-status','Opening letter…'));letter.append(body);
  try{
   const original=actions?.read?await actions.read(item):{text:item.record?.text||item.summary||'',title:item.record?.title||item.title};
   if(request!==serial||!desk.isConnected)return;if(typeof original?.text!=='string')throw Error('This letter is unavailable.');
   const listed=metadata(item),source=actions?.read?mailMetadata(original.messages?.[0]||original):listed;
   const resolved={...listed,from:listed.from||source.from};readMetadata.set(item.id,resolved);
   const row=[...(list as HTMLElement).querySelectorAll<HTMLElement>('.mail-letter')].find(e=>e.dataset.itemId===item.id);
   if(row&&resolved.from!==listed.from){
    row.querySelector('.mail-letter-sender')!.textContent=mailIdentity(resolved.from).name;
    const avatar=mailAvatar(resolved.from,resolved.avatar);avatar.classList.add('mail-letter-avatar');row.querySelector('.mail-letter-avatar')?.replaceWith(avatar);
   }
   body.replaceChildren();if(actions?.renderOriginal)body.append(actions.renderOriginal(original));else body.append(el('h3','',original.title||item.title),el('p','mail-desk-plain',original.text));
   turnMailPage(body,previous);
   const tools=el('footer','mail-desk-actions');if(actions?.reply){const reply=button('Reply with Fox',()=>actions.reply(item));if(distributed){const icon=el('span','mail-folder-icon');icon.innerHTML=uiIcon('reply');reply.prepend(icon);}tools.append(reply);}tools.append(button('Original',()=>onPick(item)));(distributed?slots.actions:letter).append(tools);
   actions?.selected?.(item,original,explicit);
  }catch(error){if(request!==serial||!desk.isConnected)return;body.replaceChildren(el('p','mail-desk-status',error.message||'Could not read this letter.'),button('Try again',()=>void read(item,explicit)));}
 }
 search.oninput=()=>{state.query=search.value;paint();};paint();
 if(wasHere){const next=focusId?[...(list as HTMLElement).querySelectorAll<HTMLButtonElement>('[data-item-id]')].find(b=>b.dataset.itemId===focusId):focusLabel==='Search letters'?search:focusFolder?(tabs as HTMLElement).querySelector<HTMLButtonElement>('[data-folder="'+focusFolder+'"]'):null;next?.focus({preventScroll:true});if(next===search&&caret&&caret[0]!==null&&caret[1]!==null)search.setSelectionRange(caret[0],caret[1]);}
 return important;
}
