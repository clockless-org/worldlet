import {attentionIcon} from '../../attention/index.ts';
/** The plain Open view of an Applet on its theme scene: a title and its items as one list on the scene's primary region,
 * drawn with the shared scene controls (applet-scene.css). Applets without their own Open view use it; `glyph` gives
 * each item its own small picture (Weather's sky) in place of the attention mark. */
export function renderSceneList(region:HTMLElement,room,items,value,pick:(item)=>void,glyph?:(item)=>string){
 const head=document.createElement('header'),title=document.createElement('h2'),list=document.createElement('div');
 head.className='scene-head';title.className='scene-title';title.textContent=room.title;head.append(title);list.className='scene-list';
 region.replaceChildren(head,list);
 for(const item of items){
  const button=document.createElement('button');button.type='button';button.className='scene-item';button.dataset.itemId=item.id;
  const mark=document.createElement('i');mark.setAttribute('aria-hidden','true');
  if(glyph){mark.className='scene-item-glyph';mark.innerHTML=glyph(item);}
  else if(item.attention){mark.className='applet-attention scene-item-attention';mark.dataset.state=item.attention.state;mark.innerHTML=attentionIcon(item.attention.state,false,item.attention.priority);button.dataset.attention='true';}
  const text=document.createElement('span'),name=document.createElement('strong');text.className='scene-item-text';name.textContent=item.title;text.append(name);
  const context=[item.when,item.context].filter(Boolean).join(' · ');if(context){const small=document.createElement('small');small.className='scene-meta';small.textContent=context;text.append(small);}
  button.append(mark,text);button.onclick=()=>pick(item);list.append(button);
 }
 if(!items.length){const empty=document.createElement('p');empty.className='scene-empty';empty.textContent=value?.error||(value?.connected?(room.content?.empty||'Nothing needs your attention right now.'):room.connection?.kind==='local-cli'?'Reading '+room.title+'…':'Connect '+room.title+' with Fox.');region.append(empty);}
 return items;
}
