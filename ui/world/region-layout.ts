import {WORLD_LAYOUT} from './world-layout.ts';
import {AREA_LAYOUT_VERSION,migrateAreaLayout} from '../../core/applets/index.ts';
import {activeBuildTheme,selectThemePins,storedThemePins} from '../themes/index.ts';

export {regionId,lastUse,recentlyUsedFirst,type RegionLayout} from './region-core.ts';
import {regionId,lastUse,type RegionLayout} from './region-core.ts';
export const REGION_THEMES={home:'Cottage',library:'Reading garden',money:'Fountain',health:'Shade garden',work:'Workshop',travel:'Riverside'};
export function emptyRegionLayout():RegionLayout{return {version:AREA_LAYOUT_VERSION,names:{},themes:{},assignments:{},pins:{},usage:{},lastUsedAt:{}};}
/** A saved layout, from the World (`onboarding.regionLayout`) or an older page's storage; anything unexpected is dropped.
 * Its pins become `themeId`'s; every other theme's stay in `themePins`. */
export function parseRegionLayout(saved:any,themeId=activeBuildTheme().id):RegionLayout{
 const result=emptyRegionLayout();if(!saved||typeof saved!=='object')return selectThemePins(result,{},themeId);
 saved=migrateAreaLayout(saved);
 const entries=(value:any)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.entries(value):[];
 for(const [id,name] of entries(saved.names))if(WORLD_LAYOUT.regions[id]&&typeof name==='string')result.names[regionId(id)]=name.trim().slice(0,40);
 for(const [id,theme] of entries(saved.themes))if(WORLD_LAYOUT.regions[id]&&Object.hasOwn(REGION_THEMES,String(theme)))result.themes[regionId(id)]=String(theme);
 for(const [id,region] of entries(saved.assignments))if(typeof region==='string'&&WORLD_LAYOUT.regions[region])result.assignments[id]=regionId(region);
 if(saved.version===AREA_LAYOUT_VERSION)for(const [id,pins] of entries(saved.pins))if(WORLD_LAYOUT.regions[id]&&Array.isArray(pins))result.pins[regionId(id)]=pins.slice(0,5).map(x=>typeof x==='string'?x:null);
 for(const [id,count] of entries(saved.usage))if(typeof count==='number'&&Number.isFinite(count)&&count>=0)result.usage[id]=count;
 for(const [id,time] of entries(saved.lastUsedAt))if(typeof time==='number'&&Number.isFinite(time)&&time>0)result.lastUsedAt[id]=time;
 return selectThemePins(result,saved.version===AREA_LAYOUT_VERSION?saved:{},themeId);
}
export function readRegionLayout(key:string,themeId=activeBuildTheme().id):RegionLayout{
 try{return parseRegionLayout(JSON.parse(localStorage.getItem(key)||'{}'),themeId);}catch{return parseRegionLayout({},themeId);}
}
/** What `readRegionLayout` reads back: the active theme's pins and every other theme's kept apart. */
export function storedRegionLayout(layout:RegionLayout,themeId=activeBuildTheme().id):RegionLayout{return storedThemePins(layout,themeId);}
export function applyRegionLayout(world:any,layout:RegionLayout){
 if(!world.buildings?.length)return;
 for(const room of world.spaces||[]){const id=regionId(layout.assignments[room.moduleId]||room.region||room.buildingId||'home');room.region=id;room.buildingId='building-'+id;}
 world.buildings=world.buildings.filter(b=>regionId(b.id)!=='travel'||b.id==='building-travel');
 for(const b of world.buildings){const id=regionId(b.id);b.region=id;b.title=layout.names[id]||WORLD_LAYOUT.regions[id]?.title||b.title;b.visualTheme=layout.themes[id]||id;b.rooms=world.spaces.filter(r=>r.buildingId===b.id).map(r=>r.id);}
 for(const a of world.areas||[])a.buildings=world.buildings.map(b=>b.id);
 world.navigationAliases={...world.navigationAliases,'building-people':'building-travel'};
}
/** Records that an Applet was opened: it moves to the front of its area's unpinned places. */
export function recordAppletUse(layout:RegionLayout,applet:string,at=Date.now()){layout.usage[applet]=(layout.usage[applet]||0)+1;layout.lastUsedAt[applet]=at;}
/** The area and place an Applet is pinned to, if any. */
export function pinnedPlace(layout:RegionLayout,applet:string):{region:string,index:number}|null{
 for(const [region,pins] of Object.entries(layout.pins)){const index=pins.indexOf(applet);if(index>=0)return {region,index};}
 return null;
}
/** Pins an Applet to one of its area's places (it keeps that place whatever is used), or unpins it with index null. */
export function pinRegionApplet(layout:RegionLayout,applet:string,region:string,index:number|null){
 const id=regionId(region);if(!WORLD_LAYOUT.regions[id])throw Error('Unknown region');
 for(const pins of Object.values(layout.pins))for(let i=0;i<pins.length;i++)if(pins[i]===applet)pins[i]=null;
 if(index===null)return;
 if(!Number.isInteger(index)||index<0||index>=WORLD_LAYOUT.regions[id].placements.length)throw Error('Unknown place');
 layout.assignments[applet]=id;
 const pins=layout.pins[id]??=Array(WORLD_LAYOUT.regions[id].placements.length).fill(null);pins[index]=applet;
}
/** Moves an Applet to an area; with a place it is pinned there. */
export function moveRegionApplet(layout:RegionLayout,applet:string,region:string,index?:number){
 const id=regionId(region);if(!WORLD_LAYOUT.regions[id])throw Error('Unknown region');
 pinRegionApplet(layout,applet,id,null);
 layout.assignments[applet]=id;
 if(index!==undefined&&index>=0&&index<5)pinRegionApplet(layout,applet,id,index);
}
