import type {ThemeWorldContext,ThemeWorldState,ThemeWorldApplet} from '@worldlet/theme';
import map from './map.json' with {type:'json'};
import {frame} from './frame.ts';
import {placeApplets} from './placements.ts';
/** Map geometry, navigation, placement and overflow browsing are entirely theme-owned. */
export function renderWorld(context:ThemeWorldContext){
 const asset=context.asset;
 const mounted=frame(context.host,context.scene),canvas=mounted.canvas;canvas.classList.add('village-map');
 const plate=document.createElement('img');plate.className='village-map-plate';plate.alt='';canvas.append(plate);
 const layer=document.createElement('div');layer.className='village-map-layer';canvas.append(layer);
 const overflow=document.createElement('nav');overflow.className='village-map-overflow';overflow.setAttribute('aria-label','Other applets');canvas.append(overflow);
 const library=document.createElement('section');library.className='village-map-library';library.hidden=true;canvas.append(library);
 const anchors=new Map<string,HTMLElement>(),timers=new Set<ReturnType<typeof setTimeout>>();
 let signature='',night=false,query='',libraryArea='',motion=true;
 const position=(el:HTMLElement,p:number[])=>{el.style.left=p[0]*100+'%';el.style.top=p[1]*100+'%';};
 function appletButton(applet:ThemeWorldApplet,ground:boolean){
  const b=document.createElement('button');b.type='button';b.className=ground?'village-map-applet':'village-library-applet';b.dataset.simId=applet.id;b.dataset.appletKey=applet.key;b.setAttribute('aria-label',applet.title+(applet.count?' · '+applet.count:''));b.title=applet.title;
  const icon=map.icons[applet.key];if(icon){const img=document.createElement('img');img.src=asset(icon);img.alt='';b.append(img);}else{const mark=document.createElement('span');mark.className='village-map-generic';mark.textContent=applet.title.slice(0,2);b.append(mark);}
  const caption=document.createElement('span');caption.className=ground?'village-map-caption':'village-library-title';caption.textContent=applet.title;b.append(caption);
  if(applet.count){const count=document.createElement('small');count.className='village-map-count';count.textContent=String(applet.count);b.append(count);}
  b.draggable=true;b.ondragstart=e=>e.dataTransfer?.setData('application/worldlet-applet',applet.id);
  b.onclick=()=>context.navigate({kind:'applet',id:applet.id});
  b.oncontextmenu=e=>{e.preventDefault();context.menu(applet.id,e.clientX,e.clientY);};
  b.onkeydown=e=>{if(e.key==='ContextMenu'||e.shiftKey&&e.key==='F10'){e.preventDefault();const r=b.getBoundingClientRect();context.menu(applet.id,r.x,r.bottom);}};
  anchors.set(applet.id,b);return b;
 }
 function paintLibrary(title:string,items:ThemeWorldApplet[]){
  library.hidden=!items.length;if(!items.length)return;
  const heading=document.createElement('h2');heading.textContent=title;
  const intro=document.createElement('p');intro.textContent=items.length+' more applets · Open or drag into the village';
  const search=document.createElement('input');search.type='search';search.placeholder='Find an applet…';search.setAttribute('aria-label','Find an applet');search.value=query;
  const list=document.createElement('div');list.className='village-library-list';const status=document.createElement('p');status.setAttribute('role','status');
  const draw=()=>{for(const item of items)anchors.delete(item.id);list.replaceChildren();const matches=items.filter(a=>a.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()));for(const item of matches)list.append(appletButton(item,false));status.textContent=matches.length?'':'No matching applets';};
  search.oninput=()=>{query=search.value;draw();};library.append(heading,intro,search,list,status);draw();
 }
 function update(state:ThemeWorldState){
  night=state.environment.night===true;motion=state.motion;
  canvas.dataset.night=String(night);canvas.dataset.motion=String(motion);
  const src=asset(night?map.night:context.scene.background);if(plate.getAttribute('src')!==src)plate.src=src;
  for(const img of layer.querySelectorAll<HTMLImageElement>('[data-landmark]')){const art=map.areas.find(a=>a.id===img.dataset.landmark)!.landmark;img.src=asset(night?art.night:art.asset);}
  // Clock/weather ticks must not rebuild a focused control or interrupt a drag.
  const next=JSON.stringify([state.view,state.applets,state.areas,state.pins,state.interaction]);if(next===signature)return;signature=next;
  const focused=document.activeElement as HTMLInputElement,focus=focused?.dataset.simId,searchFocused=library.contains(focused)&&focused?.type==='search',selection=focused?.selectionStart;
  layer.replaceChildren();overflow.replaceChildren();library.replaceChildren();anchors.clear();
  const areaId=(state.interaction.framedArea||(state.view.level==='area'?state.view.id:null))?.replace(/^building-/,'');
  const chosen=map.areas.find(a=>a.id===areaId);
  const bounds=chosen?.bounds,zoom=bounds?Math.min(2.3,.7/Math.max(bounds[2],bounds[3])):1;
  const transform=bounds?`translate(${(.59-(bounds[0]+bounds[2]/2)*zoom)*context.scene.size[0]}px,${(.47-(bounds[1]+bounds[3]/2)*zoom)*context.scene.size[1]}px) scale(${zoom})`:'none';
  for(const el of [plate,layer]){el.style.transformOrigin='0 0';el.style.transform=transform;}
  if(libraryArea!==areaId){query='';libraryArea=areaId||'';}library.hidden=true;
  for(const area of map.areas){
   const product=state.areas.find(a=>a.id==='building-'+area.id);if(!product)continue;
   const landmark=document.createElement('img');landmark.src=asset(night?area.landmark.night:area.landmark.asset);landmark.dataset.landmark=area.id;landmark.alt='';landmark.className='village-map-landmark';position(landmark,area.landmark.anchor);landmark.style.width=area.landmark.width*100+'%';layer.append(landmark);
   const apps=state.applets.filter(a=>a.visible&&a.region===area.id),placement=placeApplets(apps,state.pins[area.id]||[],area.slots.length);
   const label=document.createElement('button');label.type='button';label.className='village-map-area';label.textContent=product.title+(placement.overflow.length?' · +'+placement.overflow.length:'');label.dataset.simId=product.id;position(label,area.label);label.onclick=()=>context.navigate({kind:'area',id:product.id});layer.append(label);
   label.ondragover=e=>e.preventDefault();label.ondrop=e=>{e.preventDefault();const id=e.dataTransfer?.getData('application/worldlet-applet');if(id)context.moveApplet(id,area.id);};
   if(state.interaction.placementArea?.replace(/^building-/,'')===area.id)area.slots.forEach((point,index)=>{const slot=document.createElement('button');slot.type='button';slot.className='village-map-slot';slot.setAttribute('aria-label','Place applet '+(index+1));position(slot,point);slot.ondragover=e=>e.preventDefault();slot.ondrop=e=>{e.preventDefault();const id=e.dataTransfer?.getData('application/worldlet-applet');if(id)context.moveApplet(id,area.id,index);};layer.append(slot);});
   placement.slots.forEach((applet,index)=>{if(!applet)return;const b=appletButton(applet,true);position(b,area.slots[index]);b.dataset.slot=String(index);b.dataset.hovered=String(state.interaction.hoveredApplet===applet.id);layer.append(b);});
   if(area.id===areaId)paintLibrary(product.title,placement.overflow);
  }
  const unplaced=state.applets.filter(a=>a.visible&&!map.areas.some(area=>area.id===a.region&&state.areas.some(p=>p.id==='building-'+area.id)));
  overflow.hidden=!unplaced.length;for(const applet of unplaced)overflow.append(appletButton(applet,false));
  if(searchFocused&&!library.hidden){const input=library.querySelector('input')!;input.focus({preventScroll:true});if(selection!==null)input.setSelectionRange(selection,selection);}
  else if(focus)canvas.querySelector<HTMLElement>(`[data-sim-id="${CSS.escape(focus)}"]`)?.focus({preventScroll:true});
 }
 update(context.state);
 const bounds=(id:string)=>{const el=anchors.get(id);if(!el)return null;const r=el.getBoundingClientRect(),h=context.host.getBoundingClientRect();return r.width&&r.height?{x:r.x-h.x,y:r.y-h.y,width:r.width,height:r.height}:null;};
 return {bounds,update,event(event){if(!motion||matchMedia('(prefers-reduced-motion: reduce)').matches)return false;let shown=false;for(const [id,el] of anchors){if(event.type==='mail.received'?el.dataset.appletKey!=='gmail':!event.ids.includes(id))continue;el.classList.add('village-arriving');const timer=setTimeout(()=>{el.classList.remove('village-arriving');timers.delete(timer);},1200);timers.add(timer);shown=true;}return shown;},anchor(id:string){const r=bounds(id);return r?{x:r.x+r.width/2,y:r.y+r.height/2}:null;},dispose(){for(const timer of timers)clearTimeout(timer);mounted.dispose();}};
}
