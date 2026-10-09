import type {ThemeWorldApplet,ThemeWorldContext,ThemeWorldMount,ThemeWorldState} from '@worldlet/theme';
import {frame,node} from './frame.ts';
const PER_PLOT=8;
/** Pinned places first, then the rest in the host's order; what does not fit opens with the area. */
function place(items:readonly ThemeWorldApplet[],pins:readonly (string|null)[],capacity:number){
 const slots:Array<ThemeWorldApplet|null>=Array.from({length:capacity},()=>null),left=new Map(items.map(i=>[i.id,i]));
 for(let i=0;i<capacity;i++){const item=left.get(pins[i]||'');if(item){slots[i]=item;left.delete(item.id);}}
 for(let i=0;i<capacity;i++)if(!slots[i]&&left.size){const item=left.values().next().value!;slots[i]=item;left.delete(item.id);}
 return {shown:slots.filter((x):x is ThemeWorldApplet=>!!x),more:[...left.values()]};
}
const mark=(title:string)=>(title.match(/[A-Za-z0-9]/g)||['·']).slice(0,2).join('').toUpperCase();
/** A site plan: every area is a drafted plot and every Applet a labelled fixture on it. */
export function renderWorld(context:ThemeWorldContext):ThemeWorldMount{
 const mounted=frame(context.host,context.scene),canvas=mounted.canvas;canvas.classList.add('blueprint-world');
 const plate=node('img','blueprint-plate');plate.alt='';plate.draggable=false;canvas.append(plate);
 const plan=node('div','blueprint-plan');mounted.place(plan,'content');
 const anchors=new Map<string,HTMLElement>(),timers=new Set<ReturnType<typeof setTimeout>>();
 let signature='',motion=true;
 function fixture(applet:ThemeWorldApplet,hovered:boolean){
  const b=node('button','blueprint-fixture');b.type='button';b.dataset.simId=applet.id;b.dataset.appletKey=applet.key;b.dataset.hovered=String(hovered);
  if(applet.status)b.dataset.status=applet.status;b.setAttribute('aria-label',applet.title+(applet.count?`, ${applet.count} new`:''));
  b.append(node('span','blueprint-mark',mark(applet.title)),node('span','blueprint-name',applet.title));
  if(applet.count)b.append(node('small','blueprint-count',String(applet.count)));
  b.draggable=true;b.ondragstart=e=>e.dataTransfer?.setData('application/worldlet-applet',applet.id);
  b.onclick=()=>context.navigate({kind:'applet',id:applet.id});
  b.oncontextmenu=e=>{e.preventDefault();context.menu(applet.id,e.clientX,e.clientY);};
  b.onkeydown=e=>{if(e.key==='ContextMenu'||e.shiftKey&&e.key==='F10'){e.preventDefault();const r=b.getBoundingClientRect();context.menu(applet.id,r.x,r.bottom);}};
  anchors.set(applet.id,b);return b;
 }
 function update(state:ThemeWorldState){
  motion=state.motion;const night=state.environment.night===true;
  canvas.dataset.night=String(night);canvas.dataset.motion=String(motion);
  const src=context.asset(night?'assets/world-night.svg':context.scene.background);if(plate.getAttribute('src')!==src)plate.src=src;
  // Clock and weather ticks must not rebuild a focused control or interrupt a drag.
  const next=JSON.stringify([state.view,state.applets,state.areas,state.pins,state.interaction]);if(next===signature)return;signature=next;
  const focus=(document.activeElement as HTMLElement|null)?.dataset?.simId;
  plan.replaceChildren();anchors.clear();
  const framed=state.interaction.framedArea||(state.view.level==='area'?state.view.id:null);
  const areas=framed?state.areas.filter(a=>a.id===framed):state.areas;
  plan.dataset.layout=framed?'area':'site';
  areas.forEach((area,index)=>{
   const region=area.id.replace(/^building-/,''),apps=state.applets.filter(a=>a.visible&&a.region===region);
   const {shown,more}=framed?{shown:apps,more:[]}:place(apps,state.pins[region]||[],PER_PLOT);
   const plot=node('section','blueprint-plot');plot.dataset.area=region;plot.dataset.placing=String(state.interaction.placementArea===area.id);plot.dataset.hovered=String(state.interaction.hoveredArea===area.id);
   const title=node('button','blueprint-plot-title');title.type='button';title.dataset.simId=area.id;
   title.append(node('span','blueprint-plot-no',String(index+1).padStart(2,'0')),node('span','',area.title));title.onclick=()=>context.navigate({kind:'area',id:area.id});
   const grid=node('div','blueprint-fixtures');for(const applet of shown)grid.append(fixture(applet,state.interaction.hoveredApplet===applet.id));
   if(!apps.length)grid.append(node('p','blueprint-empty','Nothing placed here yet'));
   if(more.length){const rest=node('button','blueprint-more','+'+more.length+' more');rest.type='button';rest.onclick=()=>context.navigate({kind:'area',id:area.id});grid.append(rest);}
   plot.ondragover=e=>e.preventDefault();plot.ondrop=e=>{e.preventDefault();const id=e.dataTransfer?.getData('application/worldlet-applet');if(id)context.moveApplet(id,region);};
   plot.append(title,grid);plan.append(plot);
  });
  const unplaced=state.applets.filter(a=>a.visible&&!state.areas.some(area=>area.id==='building-'+a.region));
  if(unplaced.length&&!framed){const plot=node('section','blueprint-plot blueprint-unplaced');plot.append(node('h2','blueprint-plot-title','Unassigned'));const grid=node('div','blueprint-fixtures');for(const applet of unplaced)grid.append(fixture(applet,false));plot.append(grid);plan.append(plot);}
  if(focus)canvas.querySelector<HTMLElement>(`[data-sim-id="${CSS.escape(focus)}"]`)?.focus({preventScroll:true});
 }
 update(context.state);
 const bounds=(id:string)=>{const el=anchors.get(id);if(!el)return null;const r=el.getBoundingClientRect(),h=context.host.getBoundingClientRect();return r.width&&r.height?{x:r.x-h.x,y:r.y-h.y,width:r.width,height:r.height}:null;};
 return {update,bounds,
  anchor(id){const r=bounds(id);return r?{x:r.x+r.width/2,y:r.y+r.height/2}:null;},
  event(event){
   if(!motion||matchMedia('(prefers-reduced-motion: reduce)').matches)return false;
   let shown=false;
   for(const [id,el] of anchors){if(event.type==='mail.received'?el.dataset.appletKey!=='gmail':!event.ids.includes(id))continue;el.classList.add('blueprint-arriving');const timer=setTimeout(()=>{el.classList.remove('blueprint-arriving');timers.delete(timer);},1200);timers.add(timer);shown=true;}
   return shown;
  },
  dispose(){for(const timer of timers)clearTimeout(timer);timers.clear();anchors.clear();mounted.dispose();}
 };
}
