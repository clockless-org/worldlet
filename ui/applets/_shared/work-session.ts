import type {AppletSceneRegion} from '../scene/applet-scene.ts';
import {renderWorkDetail} from './work-applets.ts';

const state=new WeakMap<HTMLElement,{selected:string;query:string}>();
/** Optional measured session index, read-only preview and explicit continuation. The host owns every control. */
export function renderWorkSession(region:HTMLElement,room,items,value,pick,regions:readonly AppletSceneRegion[]=[]){
 const index=regions.find(r=>r.id==='sessions'),actions=regions.find(r=>r.id==='session-actions'),banner=regions.find(r=>r.id==='session-heading');
 if(!index||!actions||region.closest('.applet-scene')?.getAttribute('data-compact')==='true'){delete region.dataset.sessionPreview;for(const slot of [region,index?.element,actions?.element,banner?.element])slot?.classList.remove('work-session-region');return null;}
 const saved=state.get(region)||{selected:'',query:''};state.set(region,saved);
 const el=(tag,text='',cls='')=>Object.assign(document.createElement(tag),{textContent:text,className:cls});
 const button=(text,run,cls='scene-button')=>{const b=el('button',text,cls) as HTMLButtonElement;b.type='button';b.onclick=run;return b;};
 for(const slot of [region,index.element,actions.element,...banner?[banner.element]:[]]){slot.replaceChildren();slot.classList.add('work-session-region');}
 region.dataset.sessionPreview='true';
 const heading=el('h2',room.title,'work-session-brand'),caption=el('p','Local sessions','scene-meta'),search=el('input') as HTMLInputElement,list=el('nav','','work-session-list');
 search.type='search';search.placeholder='Find a session';search.setAttribute('aria-label','Find '+room.title+' session');search.value=saved.query;list.setAttribute('aria-label',room.title+' sessions');
 const refresh=button('Refresh',()=>{value.refresh?.();if(selected)void load(selected);});
 if(banner){banner.element.append(heading,caption);index.element.append(el('h3','Sessions','work-session-index-title'),search,list,refresh);}else index.element.append(heading,caption,search,list,refresh);
 const head=el('header','','work-session-heading'),title=el('h2','','work-session-title'),status=el('span','','work-session-state'),body=el('div','','work-session-body'),scope=el('p','','scene-meta');head.append(title,status);region.append(head,el('p','Session record · Stored conversation and changes','scene-meta'),body);
 const open=button(value.sample?'Open sample record':'Continue work',()=>{if(selected)pick(selected);});open.dataset.kind='primary';actions.element.append(scope,open);
 let selected=null,serial=0;
 function draw(){
  list.replaceChildren();const query=saved.query.trim().toLowerCase(),shown=items.filter(i=>(i.title+' '+(i.context||'')).toLowerCase().includes(query));
  for(const item of shown){const b=button('',()=>void load(item),'work-session-row');b.dataset.itemId=item.id;b.setAttribute('aria-pressed',String(selected?.id===item.id));b.append(el('strong',item.title),el('small',[item.when,item.context].filter(Boolean).join(' · ')));list.append(b);}
  if(!shown.length)list.append(el('p',items.length?'No matching sessions.':value.error||'No saved sessions found.','scene-meta'));
  if(value.loadMore)list.append(button('Load more sessions',value.loadMore));
 }
 async function load(item){
  selected=item;saved.selected=item.id;draw();title.textContent=item.title;status.textContent=item.when||'Saved';status.dataset.state=item.when||'Saved';open.disabled=true;scope.textContent='';body.replaceChildren(el('p','Reading saved session…','scene-meta'));const request=++serial;
  try{const detail=await value.readSession(item);if(request!==serial||!body.isConnected)return;if(detail?.error)throw Error(detail.error);
   renderWorkDetail(body,room.key,detail,value.renderMarkdown,offset=>void loadPage(item,offset));scope.textContent=detail.scope||'Saved session';open.disabled=false;
  }catch(error){if(request!==serial||!body.isConnected)return;body.replaceChildren(el('p',String(error.message||error),'app-device-error'),button('Retry',()=>void load(item)));}
 }
 async function loadPage(item,offset){
  const request=++serial;try{const detail=await value.readSession(item,offset);if(request!==serial||!body.isConnected)return;renderWorkDetail(body,room.key,detail,value.renderMarkdown,next=>void loadPage(item,next));}catch(error){if(request===serial&&body.isConnected)body.append(el('p',String(error.message||error),'app-device-error'));}
 }
 search.oninput=()=>{saved.query=search.value;draw();};draw();
 if(items.length)void load(items.find(i=>i.id===saved.selected)||items[0]);else{title.textContent=room.title;open.disabled=true;body.append(el('p',value.error||'Choose a saved session when one is available.','scene-meta'));}
 return items;
}

export function selectWorkSession(region:HTMLElement,id:string){
 const saved=state.get(region);if(saved)saved.selected=id;
 const scene=region.closest('.applet-scene');for(const row of scene?.querySelectorAll<HTMLElement>('.work-session-row')||[])row.setAttribute('aria-pressed',String(row.dataset.itemId===id));
}
