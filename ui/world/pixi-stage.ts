import {renderBuildTheme} from '../themes/index.ts';
import {renderHomeOpen,type HomeOpenState} from '../applets/index.ts';
import {animateFrameImage} from './frame-image.ts';
import {getApp,HOME_NATIVE,HOME_RECORDS,CODING_SESSIONS,ORIGINAL_READERS} from '../../core/applets/index.ts';
import {renderMailOpen,renderMeetingsOpen} from '../applets/index.ts';
import {weatherGlyph} from './environment/weather-forecast.ts';
import {attentionIcon} from '../attention/index.ts';
import {calendarDay} from './applet-content.ts';
// Painted Open installations with accessible, live text and hit targets.
export function createAppletStage(host,onPick){
 host.classList.add('ui-theme-world');
 const panel=document.createElement('section');panel.className='pixi-applet-stage ui-theme-applet';panel.hidden=true;panel.setAttribute('aria-label','Applet contents');host.append(panel);
 const mailDevice=document.createElement('img');mailDevice.className='mail-shared-device';mailDevice.dataset.applet='gmail';mailDevice.alt='';mailDevice.hidden=true;host.append(mailDevice);
 let motionEnabled=true;
 const mailSpec=getApp('gmail')?.motion,mailFrames=(globalThis as any).__WORLDLET_25D_ASSETS__?.motionFrames?.gmail;
 const stopMailMotion=mailSpec?.kind==='sprite-frames'&&mailFrames?animateFrameImage(mailDevice,mailSpec,mailFrames,()=>false,()=>!motionEnabled):()=>{};
 const focus=document.createElement('aside');focus.className='pixi-selected-item';focus.hidden=true;host.append(focus);
 const mailNav=document.createElement('nav');mailNav.className='mail-reader-switch';mailNav.setAttribute('aria-label','Browse emails');mailNav.hidden=true;host.append(mailNav);
 const mailAccount=document.createElement('button');mailAccount.type='button';mailAccount.className='mail-account-status';mailAccount.hidden=true;mailAccount.setAttribute('aria-label','Mailbox connection');mailAccount.setAttribute('aria-describedby','mail-account-tooltip');mailAccount.textContent='ⓘ';const mailAccountTip=document.createElement('span');mailAccountTip.id='mail-account-tooltip';mailAccountTip.className='mail-account-tooltip';mailAccountTip.setAttribute('role','tooltip');mailAccount.append(mailAccountTip);host.append(mailAccount);
 const homeState:HomeOpenState={mode:'week',offset:0};
 // Attention opens Calendar on the day of one of the person's events.
 let calendarShow:string|null=null;
 window.addEventListener('worldlet:calendar-show',(event:any)=>{const day=event.detail?.day;if(typeof day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(day)){calendarShow=day;signature='';}});
 const mailState={category:"attention",offset:0};
 const hidden=(element:HTMLElement,value:boolean)=>{if(element.hidden!==value)element.hidden=value;};
 const data=(element:HTMLElement,key:string,value:string)=>{if(element.dataset[key]!==value)element.dataset[key]=value;};
 let themeMount:{dispose():void}|false=false;
 let signature='',focusSignature='',shownItems=[],allItems=[],selected=null,page=0,owner='';
 function render(room,value,visible,focused=false,showDevice=false){
  if(owner!==room.moduleId){owner=room.moduleId;page=0;selected=null;homeState.mode='week';homeState.offset=0;homeState.editing=null;homeState.scroll=null;homeState.undo=null;mailState.category="attention";mailState.offset=0;}
  if(calendarShow&&room.key==='google-calendar'){const today=new Date(value?.now||Date.now());today.setHours(12,0,0,0);homeState.mode='day';homeState.offset=Math.round((+new Date(calendarShow+'T12:00:00')-+today)/86400000);homeState.editing=null;homeState.scroll=null;calendarShow=null;}
  allItems=(value?.items||[]).filter(i=>!['done','dismissed'].includes(i.status));
  hidden(mailNav,!(focused&&selected&&room.key==='gmail'));hidden(focus,!(focused&&selected)||room.key==='gmail');data(focus,'applet',room.key||'');
  const f=JSON.stringify([room.key,selected,allItems.map(i=>i.id)]);if(f!==focusSignature){focusSignature=f;focus.replaceChildren();mailNav.replaceChildren();if(selected){const label=document.createElement('small');label.textContent=selected.curated?'Fox summary':'Selected item';const title=document.createElement('strong');title.textContent=selected.title;const context=document.createElement('p');context.textContent=[selected.when,selected.context].filter(Boolean).join(' · ');focus.append(label,title,context);
   const at=allItems.findIndex(i=>i.id===selected.id),nav=document.createElement('nav');nav.className='pixi-focus-switch';nav.setAttribute('aria-label','Browse selected items');
   for(const [text,step] of [['Previous item',-1],['Next item',1]] as const){const b=document.createElement('button');b.type='button';b.textContent=step<0?'‹':'›';b.setAttribute('aria-label',text);b.disabled=at<0||at+step<0||at+step>=allItems.length;b.hidden=b.disabled;b.onclick=e=>{e.stopPropagation();const next=allItems[at+step];if(next){selected=next;onPick({action:'applet-item',id:next.id});}};if(room.key==='gmail'){b.textContent=step<0?'◀':'▶';b.setAttribute('aria-label',step<0?'Previous email':'Next email');mailNav.append(b);}else nav.append(b);}if(room.key!=='gmail')focus.append(nav);}}
  hidden(mailDevice,room.key!=='gmail'||!(visible||focused||showDevice));
  hidden(mailAccount,mailDevice.hidden);
  if(!mailAccount.hidden){const account=value?.sample?'Sample mail · No account connected':value?.connected?(value.accountLabel||'Connected mailbox'):'Mail not connected';const status=value?.reading?'Reading…':!value?.connected?'Connect with Fox':value?.loaded?'Mail loaded':'Waiting to read';const tip=account+' · '+status;if(mailAccountTip.textContent!==tip)mailAccountTip.textContent=tip;}

  if(!mailDevice.hidden&&!mailFrames){const asset=(globalThis as any).__WORLDLET_25D_ASSETS__?.devices?.gmail;const src=typeof asset==='string'?asset:asset?.src;if(src&&mailDevice.getAttribute('src')!==src)mailDevice.src=src;}
  hidden(panel,!visible);data(panel,'applet',room.key||'');data(panel,'animatedDevice',String(!!(globalThis as any).__WORLDLET_25D_ASSETS__?.motion?.[room.key]));if(!visible){if(themeMount){themeMount.dispose();themeMount=false;}delete panel.dataset.themeRendered;signature='';return;}
  const cards=['github',...CODING_SESSIONS,...ORIGINAL_READERS,'meetings','voice-memos','messages'].includes(room.key);
  const local=cards||HOME_NATIVE.includes(room.key),calendar=room.key==='google-calendar';
  const previousShown=shownItems;const items=allItems;
  let days=[];
  if(calendar){const today=new Date(value?.now||Date.now());today.setHours(12,0,0,0);days=Array.from({length:7},(_,i)=>{const d=new Date(today);d.setDate(d.getDate()+page*7+i);return d;});shownItems=items.filter(i=>{const day=calendarDay(i.start,i.allDay);return day?days.some(d=>calendarDay(d)===day):page===0;});}
  // Nothing in the panel pages (owner Order 2026-10-07): every item is shown, and the item area scrolls when they
  // do not fit. Only the calendar moves by week, which changes the dates rather than paging.
  else shownItems=items;
  const next=JSON.stringify([room.moduleId,items,value?.connected,value?.accountLabel,value?.loaded,value?.reading,value?.error,value?.weather,value?.scope,!!value?.loadMore,page,calendar?calendarDay(value?.now):null]);if(next===signature){if(themeMount){hidden(mailDevice,true);hidden(mailAccount,true);}shownItems=previousShown;return;}signature=next;if(themeMount){themeMount.dispose();themeMount=false;}delete panel.dataset.themeRendered;panel.replaceChildren();panel.dataset.installation=String(local);panel.dataset.work=String(cards);
  panel.classList.remove('home-open','meetings-open');
  themeMount=renderBuildTheme({host:panel,applet:{id:room.key,title:room.title},items,data:value||{},
   openItem:id=>{const item=items.find(i=>i.id===id);if(item){selected=item;onPick({action:'applet-item',id:item.id});}},
   invalidate:()=>{signature='';render(room,value,true);},
   renderDefault:target=>{target.classList.add('ui-theme-default','home-open');renderHomeOpen(target,room,items,value,homeState,item=>{selected=item;onPick({action:'applet-item',id:item.id});},()=>{signature='';render(room,value,true);});}});
  if(themeMount){panel.dataset.themeRendered='true';hidden(mailDevice,true);hidden(mailAccount,true);shownItems=items;return;}
  panel.replaceChildren();
  if(HOME_RECORDS.includes(room.key)){shownItems=renderHomeOpen(panel,room,items,value,homeState,item=>{selected=item;onPick({action:'applet-item',id:item.id});},()=>{signature='';render(room,value,true);});return;}
  if(room.key==='meetings'){shownItems=renderMeetingsOpen(panel,room,items,value,item=>{selected=item;onPick({action:'applet-item',id:item.id});});return;}
  if(room.key==='gmail'){shownItems=renderMailOpen(panel,items,value,mailState,item=>{selected=item;onPick({action:'applet-item',id:item.id});},()=>{signature='';render(room,value,true);},mailDevice);return;}
  const asset=(globalThis as any).__WORLDLET_25D_ASSETS__?.open?.[room.key];
  if(asset&&!CODING_SESSIONS.includes(room.key)){const art=document.createElement('img');art.className='pixi-open-art';art.src=asset;art.alt='';art.draggable=false;panel.append(art);}
  const contents=document.createElement('div');contents.className='pixi-open-contents';panel.append(contents);
  if(!local){const heading=document.createElement('h2');heading.textContent=room.title;contents.append(heading);}
  if(!shownItems.length){const empty=document.createElement('p');empty.className='pixi-open-empty';empty.textContent=value?.error||(value?.connected?(room.content?.empty||'Nothing needs your attention right now.'):room.connection?.kind==='local-cli'?'Reading '+room.title+'…':'Connect '+room.title+' with Fox.');contents.append(empty);}
  const dayNodes=new Map();
  if(calendar)for(const day of days){const column=document.createElement('div');column.className='pixi-calendar-day';const heading=document.createElement('time');heading.dateTime=calendarDay(day);heading.textContent=day.toLocaleDateString(undefined,{weekday:'short',day:'numeric'});column.append(heading);contents.append(column);dayNodes.set(calendarDay(day),column);}
  for(const [index,item] of shownItems.entries()){
   const button=document.createElement('button');button.type='button';button.className='pixi-stage-item';button.dataset.itemId=item.id;button.dataset.state=item.state||'unseen';if(item.executionState)button.dataset.execution=item.executionState;button.style.setProperty('--leaf',String(index));
   if(item.attention){const mark=document.createElement('i');mark.className='applet-attention applet-item-attention';mark.dataset.state=item.attention.state;mark.innerHTML=attentionIcon(item.attention.state,false,item.attention.priority);mark.setAttribute('aria-hidden','true');button.append(mark);button.dataset.attention='true';}
   const title=document.createElement('strong');title.textContent=item.title;button.append(title);
   if(room.key==='weather'){const glyph=document.createElement('div');glyph.className='weather-day-icon';glyph.innerHTML=weatherGlyph(item.weatherCode);button.append(glyph);}
   if(item.when||item.context){const context=document.createElement('span');context.textContent=[calendar&&item.start?(item.allDay?'All day':new Date(item.start).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})):item.when,item.context].filter(Boolean).join(' · ');button.append(context);}
   button.dataset.curated=String(!!item.curated);button.onclick=()=>{selected=item;onPick({action:'applet-item',id:item.id});};if(calendar){const day=calendarDay(item.start,item.allDay);if(dayNodes.has(day))dayNodes.get(day).append(button);else{button.classList.add('pixi-undated-item');button.setAttribute('aria-label','No date: '+item.title);contents.append(button);}}else contents.append(button);
  }
  // More items than the installation's places: the item area turns into one scrolling list of the same places.
  if(local&&!calendar)contents.dataset.scroll=String(shownItems.length>(cards||room.key==='apple-notes'?4:room.key==='apple-reminders'?3:6));
  if(value?.scope){const scope=document.createElement('p');scope.className='pixi-open-scope';scope.textContent=value.scope;panel.append(scope);}
  if(value?.loadMore){const more=document.createElement('button');more.className='pixi-work-more';more.textContent='Load more';more.onclick=value.loadMore;panel.append(more);}
  if(local&&(calendar||!items.length)){const footer=document.createElement('nav');footer.className='pixi-open-pagination';footer.setAttribute('aria-label','Browse '+room.title);
   const label=document.createElement('span');label.textContent=calendar?`${days[0].toLocaleDateString()} – ${days[6].toLocaleDateString()}`:(['gmail','google-calendar'].includes(room.key)?'No items':'On this Mac');
   const move=(text,delta)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=()=>{page+=delta;render(room,value,true);};return b;};
   if(calendar)footer.append(move('Previous',-1));footer.append(label);if(calendar)footer.append(move('Next',1));panel.append(footer);
  }
 }
 return {render,setMotion(value:boolean){motionEnabled=value;},setSelected(room,item){owner=room.moduleId;selected=item;},select(id){selected=allItems.find(i=>i.id===id)||null;return selected;},get metrics(){return panel.hidden?null:{items:shownItems.length,shown:true,preview:false,selected:selected?.id||null};},destroy(){if(themeMount){themeMount.dispose();themeMount=false;}stopMailMotion();(panel as any).mailLayoutObserver?.disconnect();panel.remove();mailDevice.remove();focus.remove();mailNav.remove();mailAccount.remove();}};
}
