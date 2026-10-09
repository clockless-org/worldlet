import type {ThemeWorldContext,ThemeWorldState} from '@worldlet/theme';
import map from './map.json' with {type:'json'};
import {frame,asset} from './frame.ts';
/** The package owns the map, area navigation and every Applet icon/ground anchor. */
export function renderWorld(context:ThemeWorldContext){
 const mounted=frame(context.host,context.scene),canvas=mounted.canvas;canvas.classList.add('village-map');
 const plate=document.createElement('img');plate.className='village-map-plate';plate.alt='';canvas.append(plate);
 const overflow=document.createElement('nav');overflow.className='village-map-overflow';overflow.setAttribute('aria-label','Other applets');canvas.append(overflow);
 const layer=document.createElement('div');layer.className='village-map-layer';canvas.append(layer);
 const anchors=new Map<string,HTMLElement>();const timers=new Set<ReturnType<typeof setTimeout>>();let signature='';
 const position=(el:HTMLElement,p:number[])=>{el.style.left=p[0]*100+'%';el.style.top=p[1]*100+'%';};
 function update(state:ThemeWorldState){
  const next=JSON.stringify(state);if(next===signature)return;signature=next;
  const focus=(document.activeElement as HTMLElement)?.dataset.simId;
  layer.replaceChildren();overflow.replaceChildren();anchors.clear();canvas.dataset.motion=String(state.motion);
  plate.src=asset(state.environment.night===true?'assets/world-night.png':context.scene.background);
  const areaId=(state.interaction.framedArea||(state.view.level==='area'?state.view.id:null))?.replace(/^building-/,'');
  const chosen=map.areas.find(a=>a.id===areaId);
  // Background and HTML share the same map camera in an area.
  const bounds=chosen?.bounds,zoom=bounds?Math.min(2.3,.7/Math.max(bounds[2],bounds[3])):1;
  const transform=bounds?`translate(${(0.5-(bounds[0]+bounds[2]/2)*zoom)*1500}px,${(.47-(bounds[1]+bounds[3]/2)*zoom)*844}px) scale(${zoom})`:'none';
  for(const el of [plate,layer]){el.style.transformOrigin='0 0';el.style.transform=transform;}
  for(const area of map.areas){
   const product=state.areas.find(a=>a.id==='building-'+area.id);if(!product)continue;
   const landmark=document.createElement('img');landmark.src=asset(area.landmark.asset);landmark.alt='';landmark.className='village-map-landmark';position(landmark,area.landmark.anchor);landmark.style.width=area.landmark.width*100+'%';layer.append(landmark);
   const label=document.createElement('button');label.className='village-map-area';label.textContent=product.title;label.dataset.simId=product.id;position(label,area.label);label.onclick=()=>context.navigate({kind:'area',id:product.id});layer.append(label);
   const apps=state.applets.filter(a=>a.visible&&a.region===area.id);
   const pins=state.pins[area.id]||[];apps.sort((a,b)=>{const ai=pins.indexOf(a.id),bi=pins.indexOf(b.id);return (ai<0?999:ai)-(bi<0?999:bi);});
   label.ondragover=e=>e.preventDefault();label.ondrop=e=>{e.preventDefault();const id=e.dataTransfer?.getData('application/worldlet-applet');if(id)context.moveApplet(id,area.id);};
   if(state.interaction.placementArea?.replace(/^building-/,'')===area.id)area.slots.forEach((point,index)=>{const slot=document.createElement('button');slot.className='village-map-slot';slot.setAttribute('aria-label','Place applet '+(index+1));position(slot,point);slot.ondragover=e=>e.preventDefault();slot.ondrop=e=>{e.preventDefault();const id=e.dataTransfer?.getData('application/worldlet-applet');if(id)context.moveApplet(id,area.id,index);};layer.append(slot);});
   apps.forEach((applet,index)=>{
    const pinned=pins.indexOf(applet.id),base=area.slots[(pinned<0?index:pinned)%area.slots.length];const row=Math.floor(index/area.slots.length);
    const point=[base[0],base[1]+row*.048];
    const b=document.createElement('button');b.className='village-map-applet';b.dataset.simId=applet.id;b.setAttribute('aria-label',applet.title+(applet.count?' · '+applet.count:''));b.title=applet.title;position(b,point);
    const icon=map.icons[applet.key];if(icon){const img=document.createElement('img');img.src=asset(icon);img.alt='';b.append(img);}else{const mark=document.createElement('span');mark.className='village-map-generic';mark.textContent=applet.title.slice(0,2);b.append(mark);}
    const caption=document.createElement('span');caption.className='village-map-caption';caption.textContent=applet.title;b.append(caption);
    b.draggable=true;b.ondragstart=e=>{e.dataTransfer?.setData('application/worldlet-applet',applet.id);};
    b.onclick=()=>context.navigate({kind:'applet',id:applet.id});b.oncontextmenu=e=>{e.preventDefault();context.menu(applet.id,e.clientX,e.clientY);};
    b.onkeydown=e=>{if(e.key==='ContextMenu'||e.shiftKey&&e.key==='F10'){e.preventDefault();const r=b.getBoundingClientRect();context.menu(applet.id,r.x,r.bottom);}};
    b.dataset.hovered=String(state.interaction.hoveredApplet===applet.id);layer.append(b);anchors.set(applet.id,b);
   });
  }
  const unplaced=state.applets.filter(a=>a.visible&&!map.areas.some(area=>area.id===a.region&&state.areas.some(p=>p.id==='building-'+area.id)));
  overflow.hidden=!unplaced.length;for(const applet of unplaced){const b=document.createElement('button');b.textContent=applet.title;b.dataset.simId=applet.id;b.onclick=()=>context.navigate({kind:'applet',id:applet.id});overflow.append(b);anchors.set(applet.id,b);}
  if(focus)canvas.querySelector<HTMLElement>(`[data-sim-id="${CSS.escape(focus)}"]`)?.focus({preventScroll:true});
 }
 update(context.state);
 return {bounds(id:string){const el=anchors.get(id);if(!el)return null;const r=el.getBoundingClientRect(),h=context.host.getBoundingClientRect();return r.width&&r.height?{x:r.x-h.x,y:r.y-h.y,width:r.width,height:r.height}:null;},update,event(event){let shown=false;for(const [id,el] of anchors){if(event.type==='mail.received'?!id.includes('gmail'):!event.ids.includes(id))continue;el.classList.add('village-arriving');const timer=setTimeout(()=>{el.classList.remove('village-arriving');timers.delete(timer);},1200);timers.add(timer);shown=true;}return shown;},anchor(id:string){const el=anchors.get(id);if(!el)return null;const r=el.getBoundingClientRect(),h=context.host.getBoundingClientRect();return {x:r.x+r.width/2-h.x,y:r.y+r.height/2-h.y};},dispose(){for(const timer of timers)clearTimeout(timer);mounted.dispose();}};
}
