import type {ThemeWorldContext,ThemeWorldMark,ThemeWorldMount,ThemeWorldState} from '../themes/index.ts';
import {createModuleScene as createPixiWorld} from './pixi-world.ts';

/** What the built-in Village still takes from the host directly, outside the Theme contract. Each goes as the Village
 * becomes a theme package (resources/themes/CONTRACT.md): the product's Applet records, the shell's own place names
 * (`building`, `room`, …) and the Pixi World's remaining scene calls. */
export interface VillageHost {rooms:any[];pages:any;options:any;onPick(target:any):void;hasStage(id:string):boolean;levelZoom:any}
export type VillageWorldMount=ThemeWorldMount&{scene:any};

const KINDS:Record<string,ThemeWorldMark['kind']>={app:'applet','region-more':'area','region-add':'area-add','region-slot':'slot'};
/** The animated Village World (pixi-world.ts) behind the Theme contract's World mount. */
export function renderVillageWorld(context:Omit<ThemeWorldContext,'scene'|'asset'>,village:VillageHost):VillageWorldMount {
 let state:ThemeWorldState=context.state;
 const lamps=()=>new Map(state.applets.map(a=>[a.id,a.lamp]));let lampMap=lamps();
 // The Pixi World's pins become the contract's marks; the host draws the buttons, names, lamps and attention marks.
 const marks=(points:Record<string,any>)=>{
  const out:Record<string,ThemeWorldMark>={};
  for(const [key,p] of Object.entries(points)){
   const kind=KINDS[p.kind];if(!kind)continue;
   const id=kind==='applet'?village.rooms.find(r=>r.id===p.id)?.moduleId||p.id:p.id;
   out[key]={kind,id,x:p.x,y:p.y,visible:!!p.visible,...(p.slot!=null?{slot:p.slot}:{}),...(p.labelVisible?{label:true}:{}),...(p.hovered?{hovered:true}:{}),
    ...(kind==='applet'?{lamp:{x:p.lampX||0,y:p.lampY||0},attention:{x:p.attentionX||0,y:-(p.attentionOffset||0)}}:{})};
  }
  context.marks?.(out);
 };
 const scene=createPixiWorld(context.host,village.rooms,village.onPick,marks,village.pages,{...village.options,
  interaction:()=>({...state.interaction,paused:state.paused}),
  lampState:room=>lampMap.get(room.moduleId),
  hasStage:village.hasStage,levelZoom:village.levelZoom});
 let shown={placement:state.interaction.placementArea,framed:state.interaction.framedArea+'|'+state.interaction.inset,hoveredApplet:state.interaction.hoveredApplet,hoveredArea:state.interaction.hoveredArea,motion:state.motion,paused:state.paused,environment:JSON.stringify(state.environment),pins:JSON.stringify(state.pins)};
 return {scene,behindApplet:true,
  update(next){
   state=next;lampMap=lamps();
   const i=next.interaction,now={placement:i.placementArea,framed:i.framedArea+'|'+i.inset,hoveredApplet:i.hoveredApplet,hoveredArea:i.hoveredArea,motion:next.motion,paused:next.paused,environment:JSON.stringify(next.environment),pins:JSON.stringify(next.pins)};
   if(now.placement!==shown.placement)scene.setPlacementArea(i.placementArea);
   if(now.framed!==shown.framed)scene.frameArea(i.framedArea,i.inset);
   if(now.hoveredApplet!==shown.hoveredApplet)scene.setHoveredApplet(village.rooms.find(r=>r.moduleId===i.hoveredApplet)?.id??i.hoveredApplet);
   if(now.hoveredArea!==shown.hoveredArea)scene.setHoveredArea(i.hoveredArea);
   if(now.motion!==shown.motion)scene.toggleMotion();
   if(now.environment!==shown.environment)scene.setEnvironment(next.environment);
   if(now.pins!==shown.pins)scene.refreshRegions();
   if(now.paused!==shown.paused)scene.syncPaused();
   shown=now;
  },
  event(event){
   if(event.type==='mail.received')return scene.deliverMail();
   // Arrivals still reach the Pixi World through setUnlockedApplets (VillageHost).
   return false;
  },
  anchor(id){const p=scene.devicePoint(id);return p?{x:p.x,y:p.y}:null;},
  bounds(id){return scene.metrics?.modules?.find(m=>m.id===id)?.peekBounds||null;},
  picture(){return scene.picture();},
  metrics(){return scene.metrics;},
  dispose(){scene.destroy();},
 };
}
