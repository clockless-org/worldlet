import {ACTIVE_THEME,activeBuildTheme,theme,themeAssetURL,themeData} from '../style/index.ts';

/** What the shell needs of the active theme pack's scene: whether entering an area zooms into it (the pack's own
 * `motion.transitions.area`) or opens its Area view. The World draws the rest itself (ui/world/village/village-scene.ts). */
export type ThemeScene={areaZoom:boolean};
export function themeScene(themeId:string):ThemeScene{return {areaZoom:theme(themeId).pack.motion.transitions.area==='zoom'};}
export const THEME_SCENE=themeScene(ACTIVE_THEME.pack.id);

/** The painted map an Area opens onto: the theme's `assets/art.json` `areas`, by the Area's id (`home`, `work`, ...),
 * day or night. Null when the theme paints none for that Area; a new map drops in by adding its file to the index. */
export function themeAreaMap(area:string,night:boolean):string|null{
 let art:{areas?:Record<string,{day:string;night?:string}>};
 try{art=themeData('assets/art.json');}catch{return null;}
 const pair=art?.areas?.[area],file=pair&&(night&&pair.night||pair.day);
 return file?themeAssetURL(activeBuildTheme().id,file):null;
}
