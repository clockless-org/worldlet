import {ACTIVE_THEME,onThemeApplied,theme} from '../themes/index.ts';

/** What the shell needs of the active theme pack's scene: whether entering an area zooms into it (the pack's own
 * `motion.transitions.area`) or opens its panel. The World draws the rest itself (ui/theme-packages/village/village-scene.ts). */
export type ThemeScene={areaZoom:boolean};
export function themeScene(themeId:string):ThemeScene{return {areaZoom:theme(themeId).pack.motion.transitions.area==='zoom'};}
export let THEME_SCENE=themeScene(ACTIVE_THEME.pack.id);

onThemeApplied(()=>{THEME_SCENE=themeScene(ACTIVE_THEME.pack.id);});
