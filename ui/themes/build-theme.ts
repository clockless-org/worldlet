import {THEME_PACKAGES} from '../theme-packages/index.ts';
import {BUILD_THEME_CONTRACT_VERSION,parseBuildThemeManifest,parseThemePresentation,type BuildTheme,type BuildThemeManifest,type ThemeAppletContext,type ThemePresentation,type ThemeWorldContext,type ThemeScene} from './build-theme-contract.ts';
/** One bundled theme package, validated against the contract when the bundle loads. */
export interface InstalledTheme {id:string;title:string;theme:BuildTheme;manifest:BuildThemeManifest;presentation:ThemePresentation}
export const DEFAULT_BUILD_THEME_ID='village';
export const BUILD_THEME_PREFERENCE_KEY='worldlet-theme-v2';
export const BUILD_THEMES:ReadonlyMap<string,InstalledTheme>=new Map(THEME_PACKAGES.map(entry=>{
 const manifest=parseBuildThemeManifest(entry.manifest),presentation=parseThemePresentation(entry.presentation),theme=entry.theme as BuildTheme;
 if(theme.contractVersion!==BUILD_THEME_CONTRACT_VERSION||theme.id!==manifest.id)throw Error('Unsupported theme contract: '+manifest.id);
 return [manifest.id,Object.freeze({id:manifest.id,title:manifest.title,theme,manifest,presentation})];
}));
if(!BUILD_THEMES.has(DEFAULT_BUILD_THEME_ID))throw Error('The default theme is not bundled');
const storage=()=>{try{return globalThis.localStorage??null;}catch{return null;}};
/** The saved theme, or the default when none is saved, it is no longer bundled, or storage is unavailable. */
export function readBuildThemePreference():string{
 try{const saved=storage()?.getItem(BUILD_THEME_PREFERENCE_KEY);return saved&&BUILD_THEMES.has(saved)?saved:DEFAULT_BUILD_THEME_ID;}catch{return DEFAULT_BUILD_THEME_ID;}
}
let active:InstalledTheme=BUILD_THEMES.get(readBuildThemePreference())!;
export function activeBuildTheme():InstalledTheme{return active;}
/** Package assets are published per theme, so two themes never collide on a file name. */
export const themeAssetURL=(id:string,path:string)=>'theme-assets/'+id+'/'+path.replace(/^assets\//,'');
/** Each package's stylesheet is its own file (theme-<id>.css); only the active one is attached. */
function stylesheet(id:string):HTMLLinkElement{
 let link=document.querySelector<HTMLLinkElement>(`link[data-theme-style="${id}"]`);
 if(!link){link=document.createElement('link');link.rel='stylesheet';link.href='theme-'+id+'.css';link.dataset.themeStyle=id;link.media='not all';document.head.append(link);}
 return link;
}
function attach(id:string){
 if(typeof document==='undefined')return;
 const link=stylesheet(id);link.media='all';
 for(const other of document.querySelectorAll<HTMLLinkElement>('link[data-theme-style]'))if(other!==link)other.remove();
 document.documentElement.dataset.buildTheme=id;
}
attach(active.id);
const sceneOf=(applet:string)=>active.presentation.applets[applet]||active.presentation.fallback;
export function applyBuildThemeScene(scene:ThemeScene){
 const root=document.documentElement;root.dataset.buildTheme=active.id;
 for(const [key,value] of Object.entries(active.presentation.tokens))root.style.setProperty('--sim-'+key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),typeof value==='number'?value+'px':value);
 for(const [name,rect] of Object.entries(scene.hud)){root.dataset['sim'+name[0].toUpperCase()+name.slice(1)]=rect==='shared'?'shared':'placed';if(rect==='shared')continue;for(const [i,axis] of ['x','y','width','height'].entries())root.style.setProperty(`--sim-${name}-${axis}`,rect[i]*100+'%');}
}
export function renderBuildWorld(context:Omit<ThemeWorldContext,'scene'|'asset'>){
 const {theme,id,presentation}=active;
 applyBuildThemeScene(presentation.world);
 return theme.renderWorld({...context,scene:presentation.world,asset:path=>themeAssetURL(id,path)});
}
export function renderBuildTheme(context:Omit<ThemeAppletContext,'scene'|'asset'>){
 const {theme,id}=active,scene=sceneOf(context.applet.id);
 applyBuildThemeScene(scene);
 try{return theme.renderApplet({...context,scene,asset:path=>themeAssetURL(id,path)});}
 catch(error){console.error('Theme applet renderer failed',error);context.host.replaceChildren();const message=document.createElement('p');message.setAttribute('role','alert');message.textContent='This scene could not be displayed.';context.host.append(message);return {dispose(){message.remove();}};}
}
/** Fetch and decode what the first frame needs: the stylesheet, every scene painting and the bundled fonts. */
async function prepare(next:InstalledTheme){
 if(typeof document==='undefined')return;
 const link=stylesheet(next.id);
 if(!link.sheet)await new Promise<void>((resolve,reject)=>{link.addEventListener('load',()=>resolve(),{once:true});link.addEventListener('error',()=>reject(Error(next.title+' could not load. Try again.')),{once:true});});
 const {world,fallback,applets,fonts}=next.presentation;
 const images=[...new Set([world,fallback,...Object.values(applets)].map(scene=>themeAssetURL(next.id,scene.background)))];
 await Promise.all(images.map(async src=>{const image=new Image();image.src=src;try{await image.decode();}catch(error){throw Error(next.title+' artwork could not load. Try again.',{cause:error});}}));
 await Promise.all(fonts.map(font=>fetch(themeAssetURL(next.id,font.file)).catch(()=>null)));
}
let switching=false;
/**
 * Switches to another bundled theme in one step. Only presentation changes: what is open, records,
 * web sessions and background tasks stay. The target is prepared first; if that fails the current
 * theme stays and nothing is saved. `worldlet:theme` tells the World to remount with the new theme.
 */
export async function switchBuildTheme(id:string):Promise<{ok:true;theme:string}|{ok:false;theme:string;error:string}>{
 const from=active.id,next=BUILD_THEMES.get(id);
 if(!next)return {ok:false,theme:from,error:'Unknown theme'};
 if(id===from)return {ok:true,theme:from};
 if(switching)return {ok:false,theme:from,error:'A theme is already being prepared'};
 switching=true;
 try{await prepare(next);}
 catch(error){if(typeof document!=='undefined')document.querySelector(`link[data-theme-style="${id}"]`)?.remove();return {ok:false,theme:from,error:error instanceof Error?error.message:String(error)};}
 finally{switching=false;}
 active=next;attach(id);
 try{storage()?.setItem(BUILD_THEME_PREFERENCE_KEY,id);}catch{}
 globalThis.dispatchEvent?.(new CustomEvent('worldlet:theme',{detail:{from,to:id}}));
 return {ok:true,theme:id};
}
