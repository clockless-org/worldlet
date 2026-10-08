import {APP_DEFINITIONS} from '../../core/applets/index.ts';
import {WORLD_WIDTH,WORLD_HEIGHT} from './world-design.ts';
import {BUILTIN_STYLE,BUILTIN_STYLE_REF} from '../components/index.ts';
import {ACTIVE_THEME,onThemeApplied} from '../themes/index.ts';
import {parseWorldPack} from './world-pack.ts';
// The active theme's space (ui/themes): its areas, slots, camera frame and HUD-safe areas.
export let THEME_WORLD=parseWorldPack(ACTIVE_THEME.world);
// One order for rendering, pin indices, drag targets and the resident shelf:
// rear row left-to-right, then front row left-to-right. Never mutate the pack.
const orderedSlots=(slots:typeof THEME_WORLD.areas[number]['slots'])=>[...slots].sort((a,b)=>a.anchor[1]-b.anchor[1]||a.anchor[0]-b.anchor[0]);
// Storage IDs stay stable; all geometry belongs to the portable world pack.
const defaults:Record<string,string[]>={};
for(const app of APP_DEFINITIONS)if(app.region)(defaults[app.region]??=[]).push(app.key);
function layout(){return {
 version:2,style:BUILTIN_STYLE_REF,theme:Object.freeze({id:ACTIVE_THEME.pack.id,version:ACTIVE_THEME.pack.version}),
 coordinateSpace:{width:WORLD_WIDTH,height:WORLD_HEIGHT,units:'normalized ground anchors',plateExtent:[0,0,WORLD_WIDTH,WORLD_HEIGHT]},
 plates:BUILTIN_STYLE.world,
 regions:Object.fromEntries(THEME_WORLD.areas.map(a=>[a.legacyIds[0]||a.id,{
  title:a.title,center:a.focus,label:a.label,bounds:a.bounds,placements:orderedSlots(a.slots),
  slots:Object.fromEntries((defaults[a.legacyIds[0]||a.id]||[]).map((key,i)=>{
   const s=orderedSlots(a.slots)[i%a.slots.length];if(!s)throw Error('Missing '+THEME_WORLD.title+' slot for '+key);
   return [key,{anchor:s.anchor,width:s.maxSize[0]*WORLD_WIDTH,surface:s.surface,slotId:s.id}];
  }))
 }])),
 worldSlots:{}
};}
export const WORLD_LAYOUT=layout();
onThemeApplied(()=>{THEME_WORLD=parseWorldPack(ACTIVE_THEME.world);Object.assign(WORLD_LAYOUT,layout());Object.defineProperty(WORLD_LAYOUT.regions,'people',{value:WORLD_LAYOUT.regions.travel,enumerable:false});});

// Legacy Explore links/catalog entries resolve to the riverside Explore court (pack id `tools`).
Object.defineProperty(WORLD_LAYOUT.regions,'people',{value:WORLD_LAYOUT.regions.travel,enumerable:false});
