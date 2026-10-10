import {ACTIVE_THEME,onThemeApplied,theme} from '../themes/index.ts';
import {villageLightingState} from './village/village-lighting-state.ts';
import {createVillageLighting} from './village/village-lighting.ts';
import {createVillageAmbience,VILLAGE_WATER_PATH} from './village/village-ambience.ts';
import {villageCamera,approachVillageCamera,OVERVIEW_CENTER} from './village/village-camera.ts';
import {VILLAGE_SITES} from './village/village-sites.ts';

// The renderer half of a theme: camera, light, ambient motion and the sites devices stand on. The
// theme's data (ui/themes) says what exists; these trusted adapters draw it. One per registered theme.
const SCENES={
 village:{
  camera:villageCamera,approachCamera:approachVillageCamera,overviewCenter:OVERVIEW_CENTER,sites:VILLAGE_SITES,
  lightingState:villageLightingState,createLighting:createVillageLighting,createAmbience:createVillageAmbience,
  /** Where work glints run while Applets work (work-motion.ts): Village's river. */
  workPath:VILLAGE_WATER_PATH
 }
};
export type ThemeScene=typeof SCENES[keyof typeof SCENES]&{areaZoom:boolean};
/** A theme's renderer adapters; whether entering an area zooms into it is the pack's own choice (`motion.transitions.area`). */
export function themeScene(themeId:string):ThemeScene{
 if(!Object.hasOwn(SCENES,themeId))throw Error('No scene for theme: '+themeId);
 return {...SCENES[themeId as keyof typeof SCENES],areaZoom:theme(themeId).pack.motion.transitions.area==='zoom'};
}
export let THEME_SCENE=themeScene(ACTIVE_THEME.pack.id);

onThemeApplied(()=>{THEME_SCENE=themeScene(ACTIVE_THEME.pack.id);});
