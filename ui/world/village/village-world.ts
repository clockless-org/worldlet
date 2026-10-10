import type {ThemeWorldApplet,ThemeWorldContext,ThemeWorldMark,ThemeWorldMount,ThemeWorldState} from '../../themes/index.ts';
import {createModuleScene as createPixiWorld} from './pixi-world.ts';
import {regionId,type RegionLayout} from '../region-layout.ts';

export type VillageWorldMount=ThemeWorldMount&{scene:any};

const KINDS:Record<string,ThemeWorldMark['kind']>={app:'applet','region-more':'area','region-add':'area-add','region-slot':'slot'};
const LEVELS={overview:'overview',area:'building',applet:'object'} as const;
/** The Village's own record of an Applet, kept as the same object while the host's state changes (pixi-world.ts holds it). */
function roomOf(a:ThemeWorldApplet,room:any={}){
 const region=regionId(a.region||'home');
 return Object.assign(room,{id:a.id,moduleId:a.id,key:a.key,art:a.art,title:a.title,region,buildingId:'building-'+region,entity:a.object?'matter':'app',
  mine:a.mine,icon:a.icon,status:{state:a.status,count:a.count,connected:a.connected},allowance:a.allowance});
}
/** The animated Village World (pixi-world.ts) behind the Theme contract's World mount. It reads only the contract. */
export function renderVillageWorld(context:Omit<ThemeWorldContext,'scene'|'asset'>):VillageWorldMount {
 let state:ThemeWorldState=context.state;
 const byId=new Map<string,ThemeWorldApplet>(),records=new Map<string,any>(),rooms:any[]=[];
 const sync=()=>{
  byId.clear();for(const a of state.applets)byId.set(a.id,a);
  rooms.splice(0,rooms.length,...state.applets.map(a=>{const room=roomOf(a,records.get(a.id));records.set(a.id,room);return room;}));
 };
 sync();
 // The Pixi World's pins become the contract's marks; the host draws the buttons, names, lamps and attention marks.
 const marks=(points:Record<string,any>)=>{
  const out:Record<string,ThemeWorldMark>={};
  for(const [key,p] of Object.entries(points)){
   const kind=KINDS[p.kind];if(!kind)continue;
   out[key]={kind,id:p.id,x:p.x,y:p.y,visible:!!p.visible,...(p.slot!=null?{slot:p.slot}:{}),...(p.labelVisible?{label:true}:{}),...(p.hovered?{hovered:true}:{}),
    ...(kind==='applet'?{lamp:{x:p.lampX||0,y:p.lampY||0},attention:{x:p.attentionX||0,y:-(p.attentionOffset||0)}}:{})};
  }
  context.marks?.(out);
 };
 const layout=():RegionLayout=>({version:3,names:{},themes:{},assignments:{},usage:{},
  pins:structuredClone(state.pins) as RegionLayout['pins'],
  lastUsedAt:Object.fromEntries(state.applets.filter(a=>a.usedAt).map(a=>[a.id,a.usedAt!]))});
 const scene=createPixiWorld(context.host,rooms,marks,{
  interaction:()=>({...state.interaction,paused:state.paused}),
  lampState:room=>byId.get(room.moduleId)?.lamp,
  visible:room=>!!byId.get(room.moduleId)?.visible,
  staged:id=>!!byId.get(id)?.staged,
  layout,
  areas:state.areas.map(a=>({id:a.id,title:a.title,region:regionId(a.id),visualTheme:a.look})),
  look:id=>state.areas.find(a=>a.id===id)?.look,
  navigate:id=>context.navigate({kind:'applet',id}),
  back:()=>context.back?.(),
  openArea:id=>context.openArea?.(id),
  moveApplet:(id,area,slot)=>context.moveApplet(id,area,slot),
  menu:(id,x,y)=>context.menu(id,x,y)});
 const key=(s:ThemeWorldState)=>{const i=s.interaction;return {view:s.view.level+'|'+s.view.id,placement:i.placementArea,framed:i.framedArea+'|'+i.inset,hoveredApplet:i.hoveredApplet,hoveredArea:i.hoveredArea,motion:s.motion,paused:s.paused,
  environment:JSON.stringify(s.environment),places:JSON.stringify([s.pins,s.areas.map(a=>a.look),s.applets.map(a=>a.region)]),visible:s.applets.filter(a=>a.visible).map(a=>a.id).join(),arriving:(s.arriving||[]).join()};};
 let shown=key(state);
 return {scene,behindApplet:true,
  update(next){
   state=next;sync();scene.refreshContent();
   const i=next.interaction,now=key(next);
   if(now.visible!==shown.visible)scene.syncVisible();
   if(now.arriving!==shown.arriving&&next.arriving?.length)scene.prepareArrival(next.arriving);
   if(now.places!==shown.places)scene.refreshRegions();
   if(now.view!==shown.view)scene.focus(next.view.level==='overview'?'overview':next.view.id,LEVELS[next.view.level]);
   if(now.placement!==shown.placement)scene.setPlacementArea(i.placementArea);
   if(now.framed!==shown.framed)scene.frameArea(i.framedArea,i.inset);
   if(now.hoveredApplet!==shown.hoveredApplet)scene.setHoveredApplet(i.hoveredApplet);
   if(now.hoveredArea!==shown.hoveredArea)scene.setHoveredArea(i.hoveredArea);
   if(now.motion!==shown.motion)scene.toggleMotion();
   if(now.environment!==shown.environment)scene.setEnvironment(next.environment);
   if(now.paused!==shown.paused)scene.syncPaused();
   shown=now;
  },
  event(event){
   if(event.type==='mail.received')return scene.deliverMail();
   if(event.type==='applet.arrived')return scene.arrive(event.ids,event.from==='center',event.icons||{},!!event.settled).then(()=>true);
   return false;
  },
  anchor(id){const p=scene.devicePoint(id);return p?{x:p.x,y:p.y}:null;},
  bounds(id){return scene.metrics?.modules?.find(m=>m.id===id)?.peekBounds||null;},
  picture(){return scene.picture();},
  metrics(){return scene.metrics;},
  dispose(){scene.destroy();},
 };
}
