import {THEME_PACKAGES} from '../theme-packages/index.ts';
import {applyThemeSurfaces,type BuiltSurfaces} from './theme-surfaces.ts';
import {BUILD_THEME_CONTRACT_VERSION,parseBuildThemeManifest,parseThemePresentation,type BuildThemeManifest,type ThemePresentation} from './build-theme-contract.ts';
/** One bundled theme package, validated against the contract when the bundle loads. A theme is static: its manifest,
 * its presentation, the assets they name and any other JSON it ships (`data`, by package path). */
export interface ThemePackage {manifest:BuildThemeManifest;presentation:ThemePresentation;data:Readonly<Record<string,unknown>>}
/** The bundled theme: one package. */
export interface InstalledTheme {id:string;title:string;package:ThemePackage}
export const DEFAULT_BUILD_THEME_ID='village';
/** Every bundled package: the Village only (owner decision 2026-10-10: one theme, no picker). */
export const BUILD_THEMES:ReadonlyMap<string,InstalledTheme>=new Map<string,InstalledTheme>(THEME_PACKAGES.map(entry=>{
 const manifest=parseBuildThemeManifest(entry.manifest),presentation=parseThemePresentation(entry.presentation),data=Object.freeze({...(entry as {data?:Record<string,unknown>}).data});
 if(manifest.contractVersion!==BUILD_THEME_CONTRACT_VERSION)throw Error('Unsupported theme contract: '+manifest.id);
 return [manifest.id,Object.freeze({id:manifest.id,title:manifest.title,package:Object.freeze({manifest,presentation,data})})] as const;
}).sort(([a],[b])=>Number(b===DEFAULT_BUILD_THEME_ID)-Number(a===DEFAULT_BUILD_THEME_ID)));
if(!BUILD_THEMES.has(DEFAULT_BUILD_THEME_ID))throw Error('The default theme package is missing: '+DEFAULT_BUILD_THEME_ID);
const active:InstalledTheme=BUILD_THEMES.get(DEFAULT_BUILD_THEME_ID)!;
export function activeBuildTheme():InstalledTheme{return active;}
/** A JSON file the active theme ships, by package path (`assets/art.json`). The host's World code reads its own data here. */
export function themeData<T=unknown>(path:string):T{
 if(!Object.hasOwn(active.package.data,path))throw Error('Theme '+active.id+' has no '+path);
 return active.package.data[path] as T;
}
/** Package assets are published per theme, so two themes never collide on a file name. */
export const themeAssetURL=(id:string,path:string)=>'theme-assets/'+id+'/'+path.replace(/^assets\//,'');
/**
 * The active theme's picture of an Applet: the package's own (presentation.json `icons`), else the shared device art
 * the host's Applet pages draw. Every host surface that pictures an Applet reads it here.
 */
export function themeAppletIcon(key:string):string|undefined{
 const own=active.package.presentation.icons?.[key];if(own)return themeAssetURL(active.id,own);
 const art=(globalThis as any).__WORLDLET_25D_ASSETS__?.devices?.[key],src=typeof art==='string'?art:art?.src;
 return typeof src==='string'&&src?src:undefined;
}
/** The active theme's Artifact look (presentation.json `artifact`) with every file as a published URL, or null when the
 * theme leaves Artifacts to the host's card. Package paths stay alongside, for a reader that loads the files itself. */
export function themeArtifact(){
 const a=active.package.presentation.artifact;if(!a)return null;
 const url=(path:string)=>themeAssetURL(active.id,path);
 return {theme:active.id,style:url(a.style),prompt:url(a.prompt),
  references:a.references.map(r=>({...r,url:url(r.image)})),
  materials:(a.materials??[]).map(m=>({...m,url:url(m.image)})),
  colors:{...a.colors}};
}
/**
 * The HUD material and sounds a package declares (presentation.json `hud`, `sound`) replace the shared ones in the
 * surfaces the HUD already reads. Anything a package leaves out keeps the shared one, and a package with neither (the
 * Village) keeps them all. The companion and the loading page stay the host's.
 */
function applyPresentation(theme:InstalledTheme){
 const g=globalThis as any,builtIn=g.__WORLDLET_ENV_ASSETS__,p=theme.package.presentation;
 if(!builtIn)return;
 if(!(p.hud||p.sound)){applyThemeSurfaces();return;}
 const url=(path:string)=>themeAssetURL(theme.id,path);
 const shared:BuiltSurfaces=builtIn.surfaces||{tokens:{},fonts:{},skin:{},sounds:{events:{},ambient:{}},attention:[],transitions:{area:'shared',room:'shared',ms:0}};
 g.__WORLDLET_ENV_ASSETS__={...builtIn,surfaces:{...shared,
  skin:p.hud?Object.fromEntries(Object.entries(p.hud.skin).map(([part,piece])=>[part,{image:url(piece.image),slice:[...piece.slice],width:piece.width}])):shared.skin,
  sounds:p.sound?{events:Object.fromEntries(Object.entries(p.sound.events).map(([event,file])=>[event,url(file)])),ambient:{}}:shared.sounds}};
 applyThemeSurfaces();
}
applyPresentation(active);
