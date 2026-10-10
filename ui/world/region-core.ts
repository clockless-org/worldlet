/** An area layout's pure parts. */
export const regionId=(id:string)=>id?.replace(/^building-/,'')==='people'?'travel':id?.replace(/^building-/,'');
/** Each area's five ground places hold its most recently used Applets, refilled as they are used (owner request
 * 2026-10-04); `pins` are only the places the person pinned an Applet to, which keep it there. Version 1 wrote
 * every filled place into `pins`, so its pins are not read: they were not the person's choice. Version 3 is the
 * regroup of 2026-10-08 (`migrateAreaLayout`): Create's Applets, name and pins moved to Work. */
export type RegionLayout={version:3;names:Record<string,string>;themes:Record<string,string>;assignments:Record<string,string>;pins:Record<string,(string|null)[]>;usage:Record<string,number>;lastUsedAt:Record<string,number>;
 /** Pinned places of the themes not shown now; `pins` is the active theme's (ui/themes/theme-placements.ts). */
 themePins?:Record<string,Record<string,(string|null)[]>>};
/** When an Applet was last opened; one that came into the World on its own (a moment or ongoing Applet) counts its arrival. */
export const lastUse=(room:any,layout?:RegionLayout)=>Math.max(layout?.lastUsedAt[room.moduleId]||0,Number(room.arrivedAt)||0);
export function recentlyUsedFirst(a:any,b:any,layout:RegionLayout){return lastUse(b,layout)-lastUse(a,layout)||a.title.localeCompare(b.title);}
