import villageTheme from '../../resources/themes/village/theme.json' with {type:'json'};
import cozyManifest from '../../resources/styles/builtin/manifest.json' with {type:'json'};
import cozyTokens from '../../resources/styles/builtin/tokens.json' with {type:'json'};
import villageWorld from '../../resources/worlds/village/manifest.json' with {type:'json'};
import {parseThemePack,type ThemePack} from './theme-pack.ts';
import {applyThemeSurfaces} from './theme-surfaces.ts';

// The host's own look: the Village Style Pack (tokens, HUD material, Applet and companion art) and the Village
// space. It is not a theme a person picks; themes are packages (ui/themes/build-theme.ts, resources/themes/CONTRACT.md).
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
