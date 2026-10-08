// Applies a theme's surfaces (theme-pack.ts `surfaces`, `motion.sound`, `motion.transitions`) to the shared UI:
// CSS tokens and painted HUD pieces as --theme-* properties with data attributes on <html> that
// theme-surfaces.css keys on, fonts through the FontFace API, the room transition and the theme's sounds.
// A surface left 'shared' sets nothing, so the shared look stays. Data only: no theme code runs.
import type {ThemeEvent,ThemeSkinPart} from './theme-pack.ts';

/** The built form of a theme's surfaces (scripts/build-world-assets.ts): file paths replaced by bundled URLs. */
export type BuiltSurfaces={
 tokens:Record<string,string>;
 fonts:Partial<Record<'display'|'label',{family:string;src:string}>>;
 skin:Partial<Record<ThemeSkinPart,{image:string;slice:number[];width:number}>>;
 startup?:string;
 sounds:{events:Partial<Record<ThemeEvent,string>>;ambient:Record<string,string>};
 attention:string[];
 transitions:{area:string;room:string;ms:number};
};
const FALLBACK={display:"Georgia,'Times New Roman',serif",label:"Georgia,serif"};
let applied:string[]=[];
const loadedFonts=new Map<string,Promise<FontFace>>();
const environment=():{surfaces?:BuiltSurfaces}|undefined=>(globalThis as any).__WORLDLET_ENV_ASSETS__;

/** The active theme's built surfaces, or none for a theme (or a build) without them. */
export function themeSurfaces():BuiltSurfaces|null{return environment()?.surfaces||null;}

/** Resolve the authored lettering before a live switch; failed files can be retried. */
export async function prepareThemeFonts(surfaces:BuiltSurfaces|null){
 if(typeof document==='undefined'||typeof FontFace==='undefined')return;
 await Promise.all(Object.values(surfaces?.fonts||{}).map(font=>{
  const key=font.family+'\u0000'+font.src;
  let pending=loadedFonts.get(key);
  if(!pending){
   const face=new FontFace(font.family,'url("'+encodeURI(font.src)+'")');
   pending=face.load().then(loaded=>{document.fonts.add(loaded);return loaded;}).catch(error=>{loadedFonts.delete(key);throw Error('Theme lettering could not load. Try again.',{cause:error});});
   loadedFonts.set(key,pending);
  }
  return pending;
 }));
}

/** Sets the active theme's surfaces on the document, clearing the previous theme's first. */
export function applyThemeSurfaces(surfaces:BuiltSurfaces|null=themeSurfaces()){
 if(typeof document==='undefined')return;
 const root=document.documentElement,style=root.style;
 for(const name of applied)style.removeProperty(name);applied=[];
 const set=(name:string,value:string)=>{style.setProperty(name,value);applied.push(name);};
 for(const key of ['themeSkin','themeFonts','themeRoomTransition'])delete root.dataset[key];
 stopThemeSounds();
 if(!surfaces)return;
 for(const [name,value] of Object.entries(surfaces.tokens||{}))set(name,value);
 const pieces=Object.entries(surfaces.skin||{});
 for(const [part,piece] of pieces){
  set('--theme-skin-'+part,'url("'+encodeURI(piece.image)+'")');
  set('--theme-skin-'+part+'-slice',piece.slice.join(' '));
  set('--theme-skin-'+part+'-width',piece.width+'px');
 }
 if(pieces.length)root.dataset.themeSkin=pieces.map(([part])=>part).join(' ');
 const fonts=Object.entries(surfaces.fonts||{}) as Array<['display'|'label',{family:string;src:string}]>;
 for(const [role,font] of fonts){
  set('--theme-font-'+role,"'"+font.family+"',"+FALLBACK[role]);
 }
 // Initial startup can paint its fallback while loading; a live switch awaited this already.
 void prepareThemeFonts(surfaces).catch(()=>{});
 if(fonts.length)root.dataset.themeFonts=fonts.map(([role])=>role).join(' ');
 if(surfaces.transitions?.room&&surfaces.transitions.room!=='shared'){root.dataset.themeRoomTransition=surfaces.transitions.room;set('--theme-transition-ms',surfaces.transitions.ms+'ms');}
 syncThemeSounds();
}

/** The picture the loading screen shows next launch: the theme's own, else its companion portrait. */
export function themeStartupPicture():string|null{
 const env=environment() as any;return env?.surfaces?.startup||env?.companionPortrait||null;
}
/** The companion's still portrait for small places (world log, History, Profile): the theme's companion, else Fox. */
export function companionStill():string{
 const env=environment() as any;return env&&!env.companionRive&&env.companionPortrait||'assets/fox-startup.png';
}
/** Attention picture URL: the theme's own when it ships one for that name, else the shared one. */
export function attentionPicture(name:string,themeId:string,fallback?:string):string{
 const own=themeSurfaces()?.attention||[];
 const selected=own.includes(name)?name:fallback&&own.includes(fallback)?fallback:null;
 return selected?'attention/'+themeId+'/'+selected+'.webp':'attention/'+name+'.webp';
}

// Short event sounds follow the native ambience channel's volume, mute and voice ducking.
const soundsOn=()=>typeof document!=='undefined'&&document.documentElement.dataset.worldSounds==='on';
let eventSounds=new Set<HTMLAudioElement>();
function stopThemeSounds(){for(const a of eventSounds){a.pause();a.removeAttribute('src');}eventSounds.clear();}
const soundVolume=()=>Math.max(0,Math.min(1,Number(document.documentElement.dataset.worldSoundVolume||0)));
export function playThemeSound(event:ThemeEvent){
 const src=themeSurfaces()?.sounds?.events?.[event];if(!src||!soundsOn()||document.hidden||!soundVolume()||typeof Audio==='undefined')return;
 const audio=new Audio(src);audio.volume=soundVolume();eventSounds.add(audio);
 const forget=()=>{eventSounds.delete(audio);};audio.onended=forget;audio.onerror=forget;
 void audio.play().catch(forget);
}
/** Long ambience is played only by the native World audio channel. */
export function syncThemeSounds(){
 if(!soundsOn()||document.hidden||!soundVolume()){stopThemeSounds();return;}
 for(const audio of eventSounds)audio.volume=soundVolume();
}
if(typeof document!=='undefined'&&typeof document.addEventListener==='function')document.addEventListener('visibilitychange',syncThemeSounds);
