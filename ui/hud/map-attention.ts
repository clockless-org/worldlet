import {node} from '../components/index.ts';
/** Keep a painted world's entrances clear while retaining the host's real Attention rows. */
export function mountMapAttention(root:HTMLElement,tracker:HTMLElement,today:HTMLElement,open:()=>void){
 const rail=node('nav','map-attention-rail');rail.setAttribute('aria-label','Attention categories');root.append(rail);
 today.classList.add('map-today');root.append(today);
 const choose=(key:string,restore=false)=>{
  if(key)root.dataset.mapAttention=key;else delete root.dataset.mapAttention;
  for(const b of rail.querySelectorAll<HTMLButtonElement>('button'))b.setAttribute('aria-expanded',String(b.dataset.category===key));
  if(key){open();tracker.querySelector<HTMLElement>('.world-task-group[data-group="'+key+'"] button')?.focus({preventScroll:true});}
  else if(restore)rail.querySelector<HTMLButtonElement>('[data-category="'+previous+'"]')?.focus({preventScroll:true});
  previous=key||previous;
 };
 let previous='event';
 for(const [key,label] of [['event','Coming Up'],['needsAction','Worth Doing'],['unseen','Worth Knowing']]){
  const b=node('button','',label);b.type='button';b.dataset.category=key;b.setAttribute('aria-expanded','false');b.setAttribute('aria-controls','mapAttentionContents');b.onclick=()=>choose(root.dataset.mapAttention===key?'':key);rail.append(b);
 }
 tracker.id='mapAttentionContents';
 tracker.addEventListener('click',event=>{if((event.target as Element).closest('.world-matter,.world-widget'))choose('');});
 root.addEventListener('pointerdown',event=>{if(root.dataset.mapAttention&&!tracker.contains(event.target as Node)&&!rail.contains(event.target as Node))choose('');});
 window.addEventListener('keydown',event=>{if(root.isConnected&&event.key==='Escape'&&root.dataset.mapAttention){event.preventDefault();event.stopPropagation();choose('',true);}},true);
 return {close:()=>choose('')};
}
