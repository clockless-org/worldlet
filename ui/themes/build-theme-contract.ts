/** The one Theme contract (Sim contract v2). Every theme package and the host compile against this file.
 * Worldlet bundles any number of packages; the person switches between them in one step (build-theme.ts). */
export const BUILD_THEME_CONTRACT_VERSION = 2;
export type ThemeRect = readonly [number,number,number,number];
export type ThemeRecord = Readonly<Record<string,unknown>>;
export interface ThemeItem {
 id:string; title:string; summary?:string; context?:string; start?:string; end?:string;
 local?:boolean; curated?:boolean; record?:ThemeRecord;
}
export interface ThemeActions {
 openItem(id:string):void;
 /** Present only when the host actually supports writes for this applet. */
 records?:{save(record:ThemeRecord):Promise<void>|void;remove(id:string):Promise<void>|void};
}
export interface ThemeScene {
 /** Shared art/HTML coordinate system; contain, never independently stretch the artwork. */
 size:readonly [number,number]; background:string;
 slots:Record<string,ThemeRect>;
 hud:{top:ThemeRect;companion:ThemeRect;speech:ThemeRect;attention:ThemeRect|'shared';today:ThemeRect|'shared';dialog:ThemeRect|'shared'};
}
/** Business events a theme may give a sound. Adding one is a product decision, not a theme's. */
export const THEME_SOUND_EVENTS=['applet.arrived','mail.received','task.working','task.succeeded','task.failed','task.cancelled'] as const;
export type ThemeSoundEvent=typeof THEME_SOUND_EVENTS[number];
/** The shared HUD pieces a theme may paint, each a nine-slice image laid over the shared element (ui/themes/theme-surfaces.css). */
export const THEME_HUD_PARTS=['attention','note','nameplate','back','bubble','panel','log','button','card','frame'] as const;
export type ThemeHudPart=typeof THEME_HUD_PARTS[number];
/** Where the companion stands: the World overview, an area, or beside an open Applet. */
export type ThemeCompanionPlace='overview'|'room'|'reading';
/**
 * The companion a theme draws in Fox's place. The host keeps Fox's behaviour (when it talks, listens, works or sleeps,
 * where it stands, what it says); a theme only names and paints it. A theme without one keeps Fox.
 */
export interface ThemeCompanion {
 /** Shown in the companion's reply and input labels. */
 name:string;
 /** Still picture for the loading screen, History and other small places. */
 portrait:string;
 /** A sprite sheet: one frame per pose, picked by the host's performance state. Without it the portrait stands still. */
 rig?:{image:string;frames:readonly ThemeRect[];feet?:readonly (readonly [number,number])[];scale?:number;
  /** Host performance state (idle, talking, thinking, working, sleeping, ...) → frame index. A missing state shows frame 0. */
  performances:Readonly<Record<string,number>>;
  perches?:Partial<Record<ThemeCompanionPlace,string>>};
}
/** The shared HUD's material. A piece left out keeps the shared look. */
export interface ThemeHud {
 /** Nine-slice images: slice insets (top, right, bottom, left) in image pixels, drawn at `width` CSS pixels. */
 skin:Partial<Record<ThemeHudPart,{image:string;slice:readonly [number,number,number,number];width:number}>>;
}
export interface ThemeSound {events:Partial<Record<ThemeSoundEvent,string>>}
export interface ThemePresentation {
 tokens:{bodyFont:string;displayFont:string;bodySize:number;titleSize:number;ink:string;paper:string;accent:string;focus:string;radius:number;controlHeight:number};
 fonts:readonly {file:string;license:string}[];
 world:ThemeScene;
 applets:Record<string,ThemeScene>;
 fallback:ThemeScene;
 companion?:ThemeCompanion;
 hud?:ThemeHud;
 sound?:ThemeSound;
}
export interface ThemeAppletContext {
 host:HTMLElement; applet:{id:string;title:string}; scene:ThemeScene;
 items:readonly Readonly<ThemeItem>[];
 data:{now?:number;sample?:boolean;connected?:boolean;reading?:boolean;error?:string};
 actions:ThemeActions;
 invalidate():void;
 /** Optional richer host reader; presentation owns its placement. */
 renderDefault(target:HTMLElement):void;
 /** Published URL of a package-relative `assets/...` path. Packages never hard-code where the host serves them. */
 asset(path:string):string;
}
export interface ThemeMount {dispose():void}
export interface ThemeWorldApplet {id:string;key:string;title:string;region:string;visible:boolean;status?:string;count?:number;
 /** The host's own picture of this Applet (its shared device art, or the icon a person's own Applet carries). Themes without their own art for an Applet show this rather than a placeholder. */
 icon?:string}
export interface ThemeWorldState {
 view:{id:string;level:'overview'|'area'|'applet'};
 applets:readonly ThemeWorldApplet[];
 areas:readonly {id:string;title:string}[];
 interaction:{placementArea:string|null;framedArea:string|null;inset:number;hoveredApplet:string|null;hoveredArea:string|null};
 pins:Readonly<Record<string,readonly (string|null)[]>>;
 environment:ThemeRecord;
 motion:boolean;
}
export interface ThemeWorldContext {
 host:HTMLElement;scene:ThemeScene;state:ThemeWorldState;
 navigate(target:{kind:'applet'|'area';id:string}):void;
 menu(id:string,x:number,y:number):void;
 moveApplet(id:string,area:string,slot?:number):void;
 /** Published URL of a package-relative `assets/...` path. */
 asset(path:string):string;
}
export interface ThemeWorldMount extends ThemeMount {
 update(state:ThemeWorldState):void;
 event(event:{type:'mail.received'|'applet.arrived';ids:readonly string[]}):boolean;
 /** CSS pixels relative to host. Used by the companion and host accessibility surfaces. */
 anchor(id:string):{x:number;y:number}|null;
 bounds(id:string):{x:number;y:number;width:number;height:number}|null;
}
export interface BuildTheme {
 contractVersion:2;id:string;
 renderWorld(context:ThemeWorldContext):ThemeWorldMount;
 /** Must handle every applet, including IDs added after the theme was authored. */
 renderApplet(context:ThemeAppletContext):ThemeMount;
}
export interface BuildThemeManifest {
 contractVersion:2;id:string;updatedAt?:string;title:string;
 entry:'entry.ts';stylesheet:'theme.css';assets:'assets';presentation:'presentation.json';
 applets:string[];
}
const need=(ok:unknown,message:string)=>{if(!ok)throw Error('Invalid build theme: '+message);};
const id=(v:unknown)=>typeof v==='string'&&/^[a-z][a-z0-9-]*$/.test(v);
const text=(v:unknown)=>typeof v==='string'&&v.trim().length>0;
export function themeAssetPath(v:unknown):string {
 need(typeof v==='string'&&/^assets\/[a-zA-Z0-9_./-]+$/.test(v)&&!v.split('/').some(x=>!x||x==='.'||x==='..'),'asset path');return v as string;
}
export function parseBuildThemeManifest(value:unknown):BuildThemeManifest {
 const t=value as BuildThemeManifest;
 need(t&&t.contractVersion===2&&id(t.id)&&text(t.title),'identity / contract v2');
 need(t.updatedAt===undefined||(typeof t.updatedAt==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(t.updatedAt)&&Number.isFinite(Date.parse(t.updatedAt))),'updatedAt UTC timestamp');
 need(t.entry==='entry.ts'&&t.stylesheet==='theme.css'&&t.assets==='assets'&&t.presentation==='presentation.json','package entry points');
 need(Array.isArray(t.applets)&&t.applets.every(id)&&new Set(t.applets).size===t.applets.length,'applet IDs');return t;
}
export function parseThemePresentation(value:unknown):ThemePresentation {
 const p=value as ThemePresentation;
 const rect=(r:unknown)=>Array.isArray(r)&&r.length===4&&r.every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1)&&r[2]>0&&r[3]>0&&r[0]+r[2]<=1.000001&&r[1]+r[3]<=1.000001;
 const scene=(s:ThemeScene)=>{need(s&&Array.isArray(s.size)&&s.size.length===2&&s.size.every(n=>Number.isFinite(n)&&n>0),'scene size');themeAssetPath(s.background);need(s.slots&&rect(s.slots.content),'content slot');for(const r of Object.values(s.slots))need(rect(r),'bounded slot');need(s.hud&&rect(s.hud.top)&&rect(s.hud.companion)&&rect(s.hud.speech),'HUD slots');for(const role of ['attention','today','dialog'])need(s.hud[role]==='shared'||rect(s.hud[role]),'HUD '+role);for(const role of ['top','companion','speech']){const a=s.slots.content,b=s.hud[role];need(Math.min(a[0]+a[2],b[0]+b[2])-Math.max(a[0],b[0])<.000001||Math.min(a[1]+a[3],b[1]+b[3])-Math.max(a[1],b[1])<.000001,'content overlaps '+role);}};
 need(p&&p.tokens&&p.applets&&p.fallback&&p.world,'presentation');
 const t=p.tokens;for(const k of ['bodyFont','displayFont','ink','paper','accent','focus'])need(text(t[k]),'token '+k);
 for(const k of ['bodySize','titleSize','radius','controlHeight'])need(Number.isFinite(t[k])&&t[k]>0,'token '+k);
 need(t.bodySize>=12&&t.controlHeight>=32,'readable type and controls');
 need(Array.isArray(p.fonts),'fonts');for(const f of p.fonts){themeAssetPath(f.file);themeAssetPath(f.license);}
 scene(p.world);scene(p.fallback);for(const [key,s] of Object.entries(p.applets)){need(id(key),'scene applet ID');scene(s);}
 const object=(v:unknown)=>!!v&&typeof v==='object'&&!Array.isArray(v),picture=(v:unknown)=>/\.(png|webp|svg)$/.test(themeAssetPath(v));
 if(p.companion!==undefined){
  const c=p.companion;need(object(c)&&text(c.name)&&c.name.length<=24&&picture(c.portrait),'companion name and portrait');
  if(c.rig!==undefined){
   const r=c.rig,frame=(f:unknown)=>Array.isArray(f)&&f.length===4&&f.every(n=>Number.isFinite(n)&&n>=0)&&f[2]>0&&f[3]>0;
   need(object(r)&&picture(r.image)&&Array.isArray(r.frames)&&r.frames.length>0&&r.frames.every(frame),'companion rig frames');
   need(object(r.performances)&&Object.values(r.performances).every(n=>Number.isInteger(n)&&n>=0&&n<r.frames.length),'companion rig performances');
   need(r.feet===undefined||(Array.isArray(r.feet)&&r.feet.every(f=>Array.isArray(f)&&f.length===2&&f.every(n=>Number.isFinite(n)&&n>=0&&n<=1))),'companion rig feet');
   need(r.scale===undefined||(Number.isFinite(r.scale)&&r.scale>0),'companion rig scale');
   need(r.perches===undefined||(object(r.perches)&&Object.entries(r.perches).every(([k,v])=>['overview','room','reading'].includes(k)&&picture(v))),'companion perches');
  }
 }
 if(p.hud!==undefined){
  const h=p.hud;need(object(h),'hud');
  need((object(h.skin)&&Object.entries(h.skin).every(([part,piece])=>(THEME_HUD_PARTS as readonly string[]).includes(part)&&object(piece)&&picture(piece.image)&&Array.isArray(piece.slice)&&piece.slice.length===4&&piece.slice.every(n=>Number.isInteger(n)&&n>=0)&&Number.isFinite(piece.width)&&piece.width>0&&piece.width<=64)),'hud skin');
 }
 if(p.sound!==undefined)need(object(p.sound)&&object(p.sound.events)&&Object.entries(p.sound.events).every(([event,file])=>(THEME_SOUND_EVENTS as readonly string[]).includes(event)&&/\.(mp3|ogg|m4a|wav)$/.test(themeAssetPath(file))),'sound events');
 return p;
}
