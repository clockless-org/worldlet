import villageTheme from '../../resources/themes/village/theme.json' with {type:'json'};
import cozyManifest from '../../resources/styles/builtin/manifest.json' with {type:'json'};
import cozyTokens from '../../resources/styles/builtin/tokens.json' with {type:'json'};
import villageWorld from '../../resources/worlds/village/manifest.json' with {type:'json'};
import {parseThemePack,type ThemePack} from './theme-pack.ts';
import {applyThemeSurfaces,prepareThemeFonts} from './theme-surfaces.ts';

// Trusted built-in registrations only; never execute code from a downloaded pack.
export type AppletArt={peek:string;open?:string;focus?:string;motion?:string};
export interface RegisteredTheme {
 pack:ThemePack;
 /** The Style Pack the theme draws with: tokens, HUD material, Applet and companion art. */
 style:{manifest:typeof cozyManifest;tokens:typeof cozyTokens};
 /** The world package (data only) for the theme's space; ui/world/world-pack.ts validates it. */
 world:unknown;
 /** Resolves once the theme can be shown: assets fetched and decoded. A rejection keeps the old theme. */
 prepare():Promise<void>;
 /** Lazy loading per room; a theme whose rooms ship with the first payload resolves at once. */
 loadRoom(roomId:string):Promise<void>;
}
function freeze<T>(value:T):Readonly<T>{
 if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}
 return value;
}
const ready=()=>Promise.resolve();
const registrations=[{raw:villageTheme,manifest:cozyManifest,world:villageWorld}];
export const THEMES:ReadonlyMap<string,RegisteredTheme>=new Map(registrations.map(({raw,manifest,world})=>{
 const pack=freeze(parseThemePack(raw));
 if(pack.style.id!==manifest.id||pack.space.world!==world.id)throw Error('Inconsistent theme registration');
 return [pack.id,Object.freeze({pack,style:Object.freeze({manifest:freeze(manifest) as typeof cozyManifest,tokens:freeze(cozyTokens)}),world,prepare:()=>prepareThemeAssets(pack.id),loadRoom:ready})];
}));
async function prepareThemeAssets(id:string){
 if(typeof document==='undefined')return;
 const g=globalThis as any;
 if(!g.__WORLDLET_THEME_ASSETS__?.[id]){
  const script=document.createElement('script');script.src='environment-'+id+'.js';
  try{await new Promise<void>((resolve,reject)=>{script.onload=()=>resolve();script.onerror=()=>reject(Error('Theme assets unavailable'));document.head.append(script);});}finally{script.remove();}
 }
 const payload=g.__WORLDLET_THEME_ASSETS__?.[id];if(!payload)throw Error('Theme assets missing');
 // Prepare every directly authored image, including transparent scenery planes and HUD.
 // Lazy Focus scripts and selected Attention illustrations keep their own loading contracts.
 const {world,environment:env}=payload,sources=new Set<string>();
 const add=(source:unknown)=>{if(typeof source==='string'&&source)sources.add(source);};
 const addMap=(map:Record<string,unknown>|undefined)=>Object.values(map||{}).forEach(add);
 [world.surroundings,world.night,world.hiresDay,world.hiresNight,env.companionPortrait,env.companionExpressions,env.companionSpriteRig?.image,env.surfaces?.startup].forEach(add);
 for(const map of [world.devices,world.open,world.mailParts,world.landmarks,world.landmarkNights,world.logos,world.motion,env.companionPainted,env.companionAnatomy,env.companionSpriteRig?.perches])addMap(map);
 for(const frames of Object.values<any>(world.motionFrames||{}))frames.forEach(add);
 for(const spec of [...(world.sceneryLayers||[]),...(world.studies||[]),...Object.values<any>(world.regions||{}),...Object.values<any>(world.focus||{}),...Object.values<any>(env.surfaces?.skin||{})])add(spec.image);
 for(const view of Object.values<any>(world.areaViews||{})){add(view.image);addMap(view.devices);}
 for(const src of sources){const image=new Image();image.src=src;try{await image.decode();}catch(error){throw Error('Theme artwork could not load. Try again.',{cause:error});}}
 await prepareThemeFonts(env.surfaces||null);
}
const observers=new Set<()=>void>();
export function onThemeApplied(run:()=>void){observers.add(run);return ()=>observers.delete(run);}
export function activateTheme(next:RegisteredTheme){
 const g=globalThis as any,payload=g.__WORLDLET_THEME_ASSETS__?.[next.pack.id];
 if(typeof document!=='undefined'&&!payload)throw Error('Theme has not been prepared');
 const previous=ACTIVE_THEME,oldWorld=g.__WORLDLET_25D_ASSETS__,oldEnvironment=g.__WORLDLET_ENV_ASSETS__;
 const project=()=>{if(typeof document!=='undefined')document.documentElement.dataset.worldTheme=ACTIVE_THEME.pack.id;applyThemeSurfaces();for(const run of observers)run();};
 try{if(payload){g.__WORLDLET_25D_ASSETS__=payload.world;g.__WORLDLET_ENV_ASSETS__=payload.environment;}ACTIVE_THEME=next;project();}
 catch(error){ACTIVE_THEME=previous;g.__WORLDLET_25D_ASSETS__=oldWorld;g.__WORLDLET_ENV_ASSETS__=oldEnvironment;for(const run of observers){try{run();}catch{}}if(typeof document!=='undefined'){document.documentElement.dataset.worldTheme=previous.pack.id;applyThemeSurfaces();}throw error;}
}
export const DEFAULT_THEME_ID='village';
export const THEME_PREFERENCE_KEY='worldlet-theme-v1';

const storage=()=>{try{return globalThis.localStorage??null;}catch{return null;}};
/** The saved theme, or the default when none is saved, it is unknown, or storage is unavailable. */
export function readThemePreference():string{
 try{const saved=storage()?.getItem(THEME_PREFERENCE_KEY);return saved&&THEMES.has(saved)?saved:DEFAULT_THEME_ID;}catch{return DEFAULT_THEME_ID;}
}
export function theme(themeId:string):RegisteredTheme{
 const entry=THEMES.get(themeId);if(!entry)throw Error('Unknown theme: '+themeId);
 return entry;
}
/** Live selection: observers update presentation projections, never product data. */
export let ACTIVE_THEME:RegisteredTheme=theme((globalThis as any).__WORLDLET_25D_ASSETS__?.theme?.id||readThemePreference());

// The theme the boot script chose (environment-assets.js) shows its surfaces from the first frame.
applyThemeSurfaces();

/** An Applet's art in a theme. One without its own art stands in the theme's generic room (`applets.fallback`). */
export function themeAppletArt(entry:RegisteredTheme,key:string):AppletArt&{fallback:boolean}{
 const applets=entry.style.manifest.applets as Record<string,AppletArt>;
 if(Object.hasOwn(applets,key))return {...applets[key],fallback:false};
 const generic=entry.pack.applets.fallback;
 if(!Object.hasOwn(applets,generic))throw Error('Theme '+entry.pack.id+' has no generic Applet room');
 return {...applets[generic],fallback:true};
}

let switching=false;
/** Switches theme. Only the presentation changes: what is open, web sessions and background tasks stay.
 * The target is prepared first; if preparing or applying fails, the current theme stays and nothing is saved. */
export async function switchTheme(themeId:string,{current=readThemePreference(),apply,registry=THEMES}:{current?:string;apply:(next:RegisteredTheme)=>void|Promise<void>;registry?:ReadonlyMap<string,RegisteredTheme>}):Promise<{ok:true;theme:string}|{ok:false;theme:string;error:string}>{
 const next=registry.get(themeId);
 if(!next)return {ok:false,theme:current,error:'Unknown theme'};
 if(themeId===current)return {ok:true,theme:current};
 if(switching)return {ok:false,theme:current,error:'A theme is already being prepared'};
 switching=true;
 try{await next.prepare();await apply(next);}
 catch(error){return {ok:false,theme:current,error:error instanceof Error?error.message:String(error)};}
 finally{switching=false;}
 try{storage()?.setItem(THEME_PREFERENCE_KEY,themeId);}catch{}
 globalThis.dispatchEvent?.(new CustomEvent('worldlet:theme',{detail:{from:current,to:themeId}}));
 return {ok:true,theme:themeId};
}
