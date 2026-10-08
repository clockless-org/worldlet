// Slot placement belongs to a theme: a castle's place indices mean nothing on a spaceship. Which
// group an Applet belongs to, its name and last use are the person's data and stay shared; only the
// pinned places (`pins`) are kept per theme. Village keeps them in `pins` as before, so layouts
// saved before themes existed read unchanged; another theme's pins wait in `themePins`.
export type ThemePins=Record<string,(string|null)[]>;
export type ThemePlacementLayout={pins:ThemePins;themePins?:Record<string,ThemePins>};
export const PINS_THEME='village';
const clean=(pins:unknown):ThemePins=>{
 const out:ThemePins={};if(!pins||typeof pins!=='object'||Array.isArray(pins))return out;
 for(const [region,list] of Object.entries(pins))if(Array.isArray(list))out[region]=list.map(x=>typeof x==='string'?x:null);
 return out;
};
/** After a layout is read: pins become the active theme's, and every other theme's are kept aside untouched. */
export function selectThemePins<T extends ThemePlacementLayout>(layout:T,saved:any,themeId:string):T{
 const kept:Record<string,ThemePins>={};
 if(saved?.themePins&&typeof saved.themePins==='object'&&!Array.isArray(saved.themePins))for(const [id,pins] of Object.entries(saved.themePins))if(id!==PINS_THEME)kept[id]=clean(pins);
 if(themeId!==PINS_THEME){kept[PINS_THEME]=layout.pins;layout.pins=kept[themeId]||{};delete kept[themeId];}
 layout.themePins=kept;
 return layout;
}
/** What to save: Village's pins under `pins`, other themes' under `themePins`, whichever theme is active. */
export function storedThemePins<T extends ThemePlacementLayout>(layout:T,themeId:string):T{
 const themePins={...layout.themePins};
 if(themeId===PINS_THEME)return {...layout,themePins};
 const village=themePins[PINS_THEME]||{};delete themePins[PINS_THEME];
 return {...layout,pins:village,themePins:{...themePins,[themeId]:layout.pins}};
}
/** On a theme switch: put away the old theme's pins and take out the new one's. */
export function switchThemePins<T extends ThemePlacementLayout>(layout:T,from:string,to:string):T{
 if(from===to)return layout;
 const kept={...layout.themePins,[from]:layout.pins};layout.pins=kept[to]||{};delete kept[to];
 layout.themePins=kept;return layout;
}
