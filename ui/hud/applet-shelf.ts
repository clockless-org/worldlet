import {seedShelf,enterShelf,shelfRing,SHELF_SIZE,type ShelfState} from '../../core/applets/index.ts';
import {uiIcon} from '../components/index.ts';

// The Applet shelf (owner request 2026-10-09: "applet之间要可以丝滑切换，进入applet后，上方显示最近使用的applets，像一个
// 一个tab，开新tab是进入browser"): inside an Applet, the recently used Applets stand at the top of Fox's lane, centered over Fox (owner request
// 2026-10-13: top right, not above the Applet), each
// its World device, the open one's name in plain text below it, the others' on hover (owner request 2026-10-11: no bar, no name tags). The open Applet stands in the middle, largest and lit ("当前 applet 要在中间");
// the others grow smaller and fainter the further they stand from it, in one order around it (core/applets/shelf.ts), so
// picking one slides the shelf to bring it to the middle. A Thing on the shelf cannot be closed from it (owner request
// 2026-10-11: no close mark). "+N" at the lane's left end holds the ones used longest ago; + at its right end opens a new
// page in the Browser. The shelf stands beside the Applet's panel and never over a website's
// page, which the host draws over everything below it.

export type ShelfApplet={title:string;image:string};
// Device size and the step to the next one, by distance from the middle: close enough that five stand in Fox's lane.
const SIZE=[80,52,44,38],STEP=[0,70,56,46];
const size=(d:number)=>SIZE[Math.min(d,SIZE.length-1)],step=(d:number)=>STEP[Math.min(d,STEP.length-1)];
// How far from the middle an Applet stands `d` places out.
function offsetOf(d:number){let x=0;for(let k=1;k<=d;k++)x+=step(k);return x;}
// How far the farthest Applet of a ring of `n` reaches from the middle (the extra one of an even ring stands left).
function reach(n:number){const side=Math.floor(n/2);return offsetOf(side)+size(side)/2;}

export function mountAppletShelf({root,applet,recent,lastUsed,open,newPage}:{
 root:HTMLElement;
 applet:(id:string)=>ShelfApplet|null;
 recent:()=>string[];
 lastUsed:(id:string)=>number;
 open:(id:string)=>void;
 newPage:()=>void;
}){
 let state:ShelfState|null=null,current:string|null=null;
 const shelf=document.createElement('nav');shelf.className='applet-shelf';shelf.setAttribute('aria-label','Recent Things');shelf.hidden=true;
 const ring=document.createElement('div');ring.className='applet-shelf-ring';
 const more=document.createElement('button');more.type='button';more.className='applet-shelf-more';more.hidden=true;
 const extra=document.createElement('div');extra.className='applet-shelf-extra';extra.hidden=true;
 const add=document.createElement('button');add.type='button';add.className='applet-shelf-new';add.innerHTML=uiIcon('plus');
 add.title='New page in the Browser';add.setAttribute('aria-label','New page in the Browser');
 shelf.append(ring,extra,more,add);root.append(shelf);
 const tabs=new Map<string,HTMLElement>();

 function device(app:ShelfApplet){
  const image=document.createElement('img');image.alt='';image.draggable=false;
  if(app.image)image.src=app.image;else image.hidden=true;
  const mark=document.createElement('span');mark.className='applet-shelf-mark';mark.textContent=app.title.slice(0,1);mark.hidden=!!app.image;mark.setAttribute('aria-hidden','true');
  const name=document.createElement('span');name.className='applet-shelf-name';name.textContent=app.title;
  return [image,mark,name];
 }
 function tab(id:string,app:ShelfApplet){
  let item=tabs.get(id);if(item)return item;
  item=document.createElement('div');item.className='applet-shelf-tab';item.dataset.applet=id;
  const pick=document.createElement('button');pick.type='button';pick.className='applet-shelf-pick';pick.append(...device(app));
  pick.onclick=event=>{event.stopPropagation();closeExtra();if(id!==current)open(id);};
  item.append(pick);tabs.set(id,item);return item;
 }
 function closeExtra(){extra.hidden=true;more.setAttribute('aria-expanded','false');}
 more.onclick=event=>{event.stopPropagation();const showing=extra.hidden;extra.hidden=!showing;more.setAttribute('aria-expanded',String(showing));};
 add.onclick=event=>{event.stopPropagation();closeExtra();newPage();};
 root.addEventListener('pointerdown',event=>{if(!extra.hidden&&!shelf.contains(event.target as Node))closeExtra();});

 // As many as fit across Fox's lane, which the shelf spans.
 function capacity(){
  const half=shelf.clientWidth/2-8;
  for(let n=SHELF_SIZE;n>3;n--)if(reach(n)<=half)return n;
  return 3;
 }
 function render(){
  if(!state||!current)return;
  const {visible,overflow}=shelfRing(state,current,lastUsed,capacity());
  const shown=new Set<string>();
  for(const {id,offset} of visible){
   const app=applet(id);if(!app)continue;shown.add(id);
   const item=tab(id,app),d=Math.abs(offset);
   item.style.left='calc(50% + '+Math.sign(offset)*offsetOf(d)+'px)';item.style.setProperty('--shelf-size',size(d)+'px');item.dataset.distance=String(Math.min(d,3));
   item.toggleAttribute('data-current',id===current);
   const pick=item.querySelector<HTMLButtonElement>('.applet-shelf-pick')!;pick.setAttribute('aria-current',id===current?'page':'false');pick.title=id===current?app.title:'Open '+app.title;
   if(!item.isConnected)ring.append(item);
  }
  for(const [id,item] of tabs)if(!shown.has(id)){item.remove();tabs.delete(id);}
  const others=overflow.map(id=>[id,applet(id)] as const).filter(([,app])=>!!app) as [string,ShelfApplet][];
  more.hidden=!others.length;more.textContent='+'+others.length;more.title=others.length+' more';more.setAttribute('aria-label',others.length+' more Things');
  extra.replaceChildren(...others.map(([id,app])=>{const b=document.createElement('button');b.type='button';b.className='applet-shelf-pick';b.title='Open '+app.title;b.append(...device(app));b.onclick=event=>{event.stopPropagation();closeExtra();open(id);};return b;}));
  if(!others.length)closeExtra();
 }
 let wanted:string|null=null;
 window.addEventListener('resize',()=>{if(wanted)api.sync(wanted);});
 const api={
  /** The open Applet, or null away from Applets: the shelf shows above an Applet and rests elsewhere. */
  sync(id:string|null){
   // A narrow window stacks the Applet under its title; the shelf stands only beside Fox's column.
   wanted=id;const inside=!!id&&!!applet(id)&&root.clientWidth>800;
   if(!inside){if(!shelf.hidden){shelf.hidden=true;closeExtra();root.removeAttribute('data-applet-shelf');}current=null;return;}
   if(!state)state=seedShelf(recent().filter(x=>x!==id&&!!applet(x)),SHELF_SIZE-1);
   state={order:state.order.filter(x=>!!applet(x))};state=enterShelf(state,id!);current=id;
   shelf.hidden=false;root.setAttribute('data-applet-shelf','');render();
  },
  get metrics(){return {shown:!shelf.hidden,current,order:state?.order||[],ring:[...tabs.keys()]};}
 };
 return api;
}
