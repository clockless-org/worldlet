import {THEME_PACKAGES} from '../theme-packages/index.ts';
import {applyThemeSurfaces,type BuiltSurfaces} from './theme-surfaces.ts';
import {BUILD_THEME_CONTRACT_VERSION,parseBuildThemeManifest,parseThemePresentation,type BuildTheme,type BuildThemeManifest,type ThemeAppletContext,type ThemePresentation,type ThemeWorldContext,type ThemeScene} from './build-theme-contract.ts';
/** One bundled theme package, validated against the contract when the bundle loads. */
export interface ThemePackage {theme:BuildTheme;manifest:BuildThemeManifest;presentation:ThemePresentation}
/** A theme the person can pick: the built-in Village World, or a bundled package (`package` set). */
export interface InstalledTheme {id:string;title:string;package?:ThemePackage}
export const DEFAULT_BUILD_THEME_ID='village';
export const BUILD_THEME_PREFERENCE_KEY='worldlet-theme-v2';
export const BUILD_THEMES:ReadonlyMap<string,InstalledTheme>=new Map<string,InstalledTheme>([[DEFAULT_BUILD_THEME_ID,Object.freeze({id:DEFAULT_BUILD_THEME_ID,title:'Village'})],...THEME_PACKAGES.map(entry=>{
 const manifest=parseBuildThemeManifest(entry.manifest),presentation=parseThemePresentation(entry.presentation),theme=entry.theme as BuildTheme;
 if(theme.contractVersion!==BUILD_THEME_CONTRACT_VERSION||theme.id!==manifest.id)throw Error('Unsupported theme contract: '+manifest.id);
 if(manifest.id===DEFAULT_BUILD_THEME_ID)throw Error('A theme package cannot replace the built-in Village');
 return [manifest.id,Object.freeze({id:manifest.id,title:manifest.title,package:Object.freeze({theme,manifest,presentation})})] as const;
})]);
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
const COMPANION_ART=['companionRive','companionPainted','companionAnatomy','companionExpressions','companionSpriteRig','companionPortrait'];
let builtIn:any;
/**
 * The companion, HUD material and sounds a package declares (presentation.json `companion`, `hud`, `sound`) replace
 * Fox's art and the shared surfaces in the environment the companion and HUD already read. Anything a package leaves
 * out keeps the built-in one, and the built-in Village restores them all.
 */
function applyPresentation(next:InstalledTheme){
 const g=globalThis as any;builtIn??=g.__WORLDLET_ENV_ASSETS__;
 if(!builtIn)return;
 const p=next.package?.presentation;
 if(!p||!(p.companion||p.hud||p.sound)){g.__WORLDLET_ENV_ASSETS__=builtIn;applyThemeSurfaces();return;}
 const url=(path:string)=>themeAssetURL(next.id,path),env={...builtIn};
 const c=p.companion;
 if(c){
  for(const key of COMPANION_ART)delete env[key];
  env.companionPortrait=url(c.portrait);
  if(c.rig)env.companionSpriteRig={...c.rig,image:url(c.rig.image),perches:Object.fromEntries(Object.entries(c.rig.perches||{}).map(([place,image])=>[place,url(image)]))};
 }
 if(p.hud||p.sound||c){
  const shared:BuiltSurfaces=builtIn.surfaces||{tokens:{},fonts:{},skin:{},sounds:{events:{},ambient:{}},attention:[],transitions:{area:'shared',room:'shared',ms:0}};
  env.surfaces={...shared,
   skin:p.hud?Object.fromEntries(Object.entries(p.hud.skin).map(([part,piece])=>[part,{image:url(piece.image),slice:[...piece.slice],width:piece.width}])):shared.skin,
   sounds:p.sound?{events:Object.fromEntries(Object.entries(p.sound.events).map(([event,file])=>[event,url(file)])),ambient:{}}:shared.sounds,
   startup:c?url(c.portrait):shared.startup};
 }
 g.__WORLDLET_ENV_ASSETS__=env;applyThemeSurfaces();
}
/** The companion's name in the active theme, or null where the theme keeps the built-in companion. */
export function themeCompanionName():string|null{return active.package?.presentation.companion?.name??null;}
/** The built-in Village carries no theme stylesheet or scene variables; a package's are removed when it is left. */
function attach(next:InstalledTheme){
 applyPresentation(next);
 if(typeof document==='undefined')return;
 const link=next.package?stylesheet(next.id):null;if(link)link.media='all';
 for(const other of document.querySelectorAll<HTMLLinkElement>('link[data-theme-style]'))if(other!==link)other.remove();
 const root=document.documentElement;
 if(link){root.dataset.buildTheme=next.id;return;}
 delete root.dataset.buildTheme;
 for(const key of Object.keys(root.dataset))if(/^sim[A-Z]/.test(key))delete root.dataset[key];
 for(const name of [...root.style].filter(name=>name.startsWith('--sim-')))root.style.removeProperty(name);
}
attach(active);
/** The active package; the World and Applet renderers only call into a package theme. */
function pkg():ThemePackage{if(!active.package)throw Error('The built-in Village has no theme package');return active.package;}
const sceneOf=(applet:string)=>pkg().presentation.applets[applet]||pkg().presentation.fallback;
export function applyBuildThemeScene(scene:ThemeScene){
 const root=document.documentElement;root.dataset.buildTheme=active.id;
 for(const [key,value] of Object.entries(pkg().presentation.tokens))root.style.setProperty('--sim-'+key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),typeof value==='number'?value+'px':value);
 for(const [name,rect] of Object.entries(scene.hud)){root.dataset['sim'+name[0].toUpperCase()+name.slice(1)]=rect==='shared'?'shared':'placed';if(rect==='shared')continue;for(const [i,axis] of ['x','y','width','height'].entries())root.style.setProperty(`--sim-${name}-${axis}`,rect[i]*100+'%');}
}
export function renderBuildWorld(context:Omit<ThemeWorldContext,'scene'|'asset'>){
 const {theme,presentation}=pkg(),{id}=active;
 applyBuildThemeScene(presentation.world);
 return theme.renderWorld({...context,scene:presentation.world,asset:path=>themeAssetURL(id,path)});
}
export function renderBuildTheme(context:Omit<ThemeAppletContext,'scene'|'asset'>){
 const {theme}=pkg(),{id}=active,scene=sceneOf(context.applet.id);
 applyBuildThemeScene(scene);
 try{return theme.renderApplet({...context,scene,asset:path=>themeAssetURL(id,path)});}
 catch(error){console.error('Theme applet renderer failed',error);context.host.replaceChildren();const message=document.createElement('p');message.setAttribute('role','alert');message.textContent='This scene could not be displayed.';context.host.append(message);return {dispose(){message.remove();}};}
}
/** Fetch and decode what the first frame needs: the stylesheet, every scene painting and the bundled fonts. */
async function prepare(next:InstalledTheme){
 if(typeof document==='undefined'||!next.package)return;
 const link=stylesheet(next.id);
 if(!link.sheet)await new Promise<void>((resolve,reject)=>{link.addEventListener('load',()=>resolve(),{once:true});link.addEventListener('error',()=>reject(Error(next.title+' could not load. Try again.')),{once:true});});
 const {world,fallback,applets,fonts}=next.package.presentation;
 const {companion,hud}=next.package.presentation;
 const pictures=[...[world,fallback,...Object.values(applets)].map(scene=>scene.background),...(companion?[companion.portrait,...(companion.rig?[companion.rig.image,...Object.values(companion.rig.perches||{})]:[])]:[]),...Object.values(hud?.skin||{}).map(piece=>piece.image)];
 const images=[...new Set(pictures.map(path=>themeAssetURL(next.id,path)))];
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
 active=next;attach(next);
 try{storage()?.setItem(BUILD_THEME_PREFERENCE_KEY,id);}catch{}
 globalThis.dispatchEvent?.(new CustomEvent('worldlet:theme',{detail:{from,to:id}}));
 return {ok:true,theme:id};
}
