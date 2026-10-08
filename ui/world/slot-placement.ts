import {WORLD_WIDTH,WORLD_HEIGHT} from './world-design.ts';
import {WORLD_LAYOUT} from './world-layout.ts';
import {APPLET_SPRITES} from './applet-sprites.ts';
import {lastUse,recentlyUsedFirst,regionId,type RegionLayout} from './region-layout.ts';
export type PlacementSlot={id:string;anchor:number[];maxSize?:number[]};
/** Fit the painted footprint, not transparent atlas padding, inside a reserved place. */
export function placementScale(slot:PlacementSlot|undefined,width:number,height:number){
 if(!slot?.maxSize||width<=0||height<=0)return 1;
 return Math.min(1,slot.maxSize[0]*WORLD_WIDTH/width,slot.maxSize[1]*WORLD_HEIGHT/height);
}
export const sameAnchor=(a:number[]|undefined,b:number[])=>!!a&&a.length===2&&a.every((v,i)=>Number.isFinite(v)&&Math.abs(v-b[i])<1e-6);
export const roomRegion=(room:any)=>regionId(room.region||room.buildingId||APPLET_SPRITES[room.key]?.region||'home');
export function slotsForApplet(key:string,region=APPLET_SPRITES[key]?.region):PlacementSlot[]{return WORLD_LAYOUT.regions[regionId(region)]?.placements||[];}
export function placementPages(rooms:any[],visible:(room:any)=>boolean,layout?:RegionLayout){
 const groups:Record<string,{rooms:any[];capacity:number;pages:number}>={};
 for(const room of rooms.filter(r=>r.entity==='app'&&r.key!=='weather'&&visible(r)).sort((a,b)=>Number(a.installByDefault===false)-Number(b.installByDefault===false))){
  const region=roomRegion(room),capacity=slotsForApplet(room.key,region).length;if(!capacity)continue;
  const group=groups[region]??={rooms:[],capacity,pages:1};group.rooms.push(room);group.pages=Math.ceil(group.rooms.length/capacity);
 }
 return groups;
}
/** Each area's places: an Applet pinned to a place keeps it, and the other places hold the area's most recently used
 * Applets, the most recent in the first free place (owner request 2026-10-04). Without a layout (the arrival preview)
 * the members keep their catalog order. */
export function resolvePlacements(rooms:any[],saved:Record<string,number[]>,visible:(room:any)=>boolean,pages:Record<string,number>={},layout?:RegionLayout){
 const result:Record<string,PlacementSlot>={};
 for(const [region,g] of Object.entries(placementPages(rooms,visible,layout))){
  const slots=WORLD_LAYOUT.regions[region].placements,used=new Set<string>(),taken=new Set<number>();
  // Weather belongs to the top-right HUD; release its old slot without moving other pins.
  if(layout?.pins[region])layout.pins[region]=layout.pins[region].map(id=>id==='app-weather'?null:id);
  const pins=layout?.pins[region]??[];
  for(const [index,id] of pins.entries()){if(id&&g.rooms.some(r=>r.moduleId===id)&&slots[index]&&!used.has(id)){result[id]=slots[index];used.add(id);taken.add(index);}}
  // A stable sort: Applets never used keep their catalog order after the used ones.
  const rest=g.rooms.filter(r=>!used.has(r.moduleId));if(layout)rest.sort((a,b)=>lastUse(b,layout)-lastUse(a,layout));
  const free=slots.map((_,index)=>index).filter(index=>!taken.has(index));
  for(const [i,room] of rest.slice(0,free.length).entries())result[room.moduleId]=slots[free[i]];
 }
 return result;
}
export function freePlacements(key:string,id:string,assigned:Record<string,PlacementSlot>){
 const used=new Set(Object.entries(assigned).filter(([other])=>other!==id).map(([,s])=>s.id));return slotsForApplet(key).filter(s=>!used.has(s.id));
}
export function nearestPlacement(slots:PlacementSlot[],point:number[],scale:number,radius=42){
 let best:PlacementSlot|null=null,distance=radius;for(const s of slots){const d=Math.hypot((point[0]-s.anchor[0])*WORLD_WIDTH,(point[1]-s.anchor[1])*WORLD_HEIGHT)*scale;if(d<=distance){best=s;distance=d;}}return best;
}
/** An area zoomed in for its panel keeps its Applets at their overview size (owner request 2026-10-08), so the room
 * the zoom makes shows more of the area's own Applets instead of five larger ones. The five places keep their anchors
 * and Applets; the area's other Applets, most recently used first, fill extra places laid out with the five's own
 * spacing divided by the zoom: rear row first, left to right, over the court (the ellipse in the area's bounds) down to
 * just above the area's name, packed around the five and clear of them. Those that do not fit stay in the panel. */
export function extraPlacements(region:string,zoom:number,rooms:any[],visible:(room:any)=>boolean,layout:RegionLayout|undefined,assigned:Record<string,PlacementSlot>):Record<string,PlacementSlot>{
 const area=WORLD_LAYOUT.regions[regionId(region)],result:Record<string,PlacementSlot>={};
 if(!area||!(zoom>1.05))return result;
 const own=(placementPages(rooms,visible,layout)[regionId(region)]?.rooms||[]).filter(r=>!assigned[r.moduleId]);
 // The panel's Recently used order, so the World continues the list where its five places end.
 if(layout)own.sort((a,b)=>recentlyUsedFirst(a,b,layout));
 if(!own.length)return result;
 const slots:PlacementSlot[]=area.placements,rows=[...new Set(slots.map(s=>s.anchor[1]))].sort((a,b)=>a-b);
 const rear=slots.filter(s=>s.anchor[1]===rows[0]).map(s=>s.anchor[0]).sort((a,b)=>a-b);
 const pitchX=(rear.length>1?Math.min(...rear.slice(1).map((x,i)=>x-rear[i])):.048)/zoom,pitchY=(rows.length>1?rows[1]-rows[0]:.04)/zoom;
 // The court is the ellipse inside the area's bounds; an extra place's Applet stands on it, its top inside the bounds.
 const [bx,by,bw,bh]=area.bounds,cx=bx+bw/2,cy=by+bh/2,centre=rear[Math.floor(rear.length/2)]??cx,bottom=area.label[1]-.012/zoom;
 const height=(slots[0]?.maxSize?.[1]??.067)/zoom,top=by+height*.8,places:PlacementSlot[]=[];
 const onCourt=(x:number,y:number)=>((x-cx)/(bw/2-pitchX/2))**2+((y-cy)/(bh/2))**2<=1;
 // Rows every zoomed row pitch from the rear row, and the five's own rows; along each, the first free spot from the
 // left that keeps a place's spacing from the five and from extra places already laid out.
 const taken=slots.map(s=>s.anchor),clear=(x:number,y:number)=>taken.every(([ax,ay])=>Math.abs(ax-x)>=pitchX*.9||Math.abs(ay-y)>=pitchY*.9);
 const lines=new Set(rows);for(let k=Math.floor((top-rows[0])/pitchY);rows[0]+k*pitchY<=bottom;k++)lines.add(+(rows[0]+k*pitchY).toFixed(5));
 for(const y of [...lines].filter(y=>y>=top&&y<=bottom).sort((a,b)=>a-b))
  for(let x=bx+pitchX/2;x<=bx+bw-pitchX/2;x+=pitchX/8)
   if(onCourt(x,y)&&clear(x,y)){taken.push([x,y]);places.push({id:`${regionId(region)}-extra-${places.length}`,anchor:[x,y],...slots[0]?.maxSize?{maxSize:slots[0].maxSize.map(v=>v/zoom)}:{}});}
 places.sort((a,b)=>a.anchor[1]-b.anchor[1]||a.anchor[0]-b.anchor[0]);
 for(const [i,room] of own.slice(0,places.length).entries())result[room.moduleId]=places[i];
 return result;
}
