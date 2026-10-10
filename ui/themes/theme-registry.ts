import {THEME_PACKAGES} from '../theme-packages/index.ts';
import {parseThemePack,type ThemePack} from './theme-pack.ts';
import {applyThemeSurfaces} from './theme-surfaces.ts';

// The host's own look, read from the Village theme package (ui/theme-packages/village): its pack (pack.json), Style
// Pack (style.json, tokens.json: HUD material, Applet and companion art) and space (world.json).
type VillageData=typeof THEME_PACKAGES[number]['data'];
const village=THEME_PACKAGES.find(entry=>entry.manifest.id==='village');
if(!village)throw Error('The Village theme package is missing');
const {'pack.json':villageTheme,'style.json':cozyManifest,'tokens.json':cozyTokens,'world.json':villageWorld}=village.data as VillageData;
export type AppletArt={peek:string;open?:string;focus?:string;motion?:string};
export interface RegisteredTheme {
 pack:ThemePack;
 /** The Style Pack the host draws with: tokens, HUD material, Applet and companion art. */
 style:{manifest:typeof cozyManifest;tokens:typeof cozyTokens};
 /** The world package (data only) for the host's space; ui/world/world-pack.ts validates it. */
 world:unknown;
}
function freeze<T>(value:T):Readonly<T>{
 if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}
 return value;
}
const pack=freeze(parseThemePack(villageTheme));
if(pack.style.id!==cozyManifest.id||pack.space.world!==villageWorld.id)throw Error('Inconsistent theme registration');
export const DEFAULT_THEME_ID='village';
export const ACTIVE_THEME:RegisteredTheme=Object.freeze({pack,style:Object.freeze({manifest:freeze(cozyManifest) as typeof cozyManifest,tokens:freeze(cozyTokens)}),world:villageWorld});
export function theme(themeId:string):RegisteredTheme{
 if(themeId!==ACTIVE_THEME.pack.id)throw Error('Unknown theme: '+themeId);
 return ACTIVE_THEME;
}

// The host's surfaces show from the first frame.
applyThemeSurfaces();

/** An Applet's art in a theme. One without its own art stands in the theme's generic room (`applets.fallback`). */
export function themeAppletArt(entry:RegisteredTheme,key:string):AppletArt&{fallback:boolean}{
 const applets=entry.style.manifest.applets as Record<string,AppletArt>;
 if(Object.hasOwn(applets,key))return {...applets[key],fallback:false};
 const generic=entry.pack.applets.fallback;
 if(!Object.hasOwn(applets,generic))throw Error('Theme '+entry.pack.id+' has no generic Applet room');
 return {...applets[generic],fallback:true};
}
