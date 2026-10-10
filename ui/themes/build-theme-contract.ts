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
 /** Present only when the host can read more items for this Applet. */
 loadMore?():void;
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
/** The shared HUD pieces a theme may paint, each a nine-slice image laid over the shared element (ui/themes/theme-surfaces.css).
 * The companion (Fox, its bubble, panel and nameplate) and the loading and first-use pages are not a theme's to replace. */
export const THEME_HUD_PARTS=['attention','note','back','log','button','card','frame'] as const;
export type ThemeHudPart=typeof THEME_HUD_PARTS[number];
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
 hud?:ThemeHud;
 sound?:ThemeSound;
}
export interface ThemeAppletContext {
 host:HTMLElement; applet:{id:string;title:string}; scene:ThemeScene;
 items:readonly Readonly<ThemeItem>[];
 data:{now?:number;sample?:boolean;connected?:boolean;reading?:boolean;error?:string;
  /** What the items cover when it is not everything (for example "Last 30 days"). */
  scope?:string};
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
 icon?:string;
 /** The Applet's lamp as the host shows it. A theme with lamps in its art lights them; the host draws the lamp's label and action. */
 lamp?:ThemeLampState;
 connected?:boolean;
 /** Set for the person's own Applets (core/applets/MY-APPLETS.md): which kind it is. */
 mine?:string;
 /** A thing that is not an Applet (a trip, a parcel). It is shown only while it is open. */
 object?:boolean;
 /** The catalog Applet whose picture this one shares, when it is not its own `key`. */
 art?:string;
 /** When the person last used it or it arrived (ms since 1970). Themes that place Applets put recent ones first. */
 usedAt?:number;
 /** The host's Applet stage shows its contents while it is open. A theme can stop drawing its device behind them. */
 staged?:boolean;
 /** Coding Applets: the weekly allowance left. `remaining` is a percentage; neither is set while it is unknown. */
 allowance?:{remaining?:number;resetsAt?:number;unavailable?:boolean}}
export type ThemeLampState='off'|'ready'|'processing'|'error';
export interface ThemeWorldState {
 view:{id:string;level:'overview'|'area'|'applet'};
 applets:readonly ThemeWorldApplet[];
 areas:readonly {id:string;title:string;
  /** The look the person chose for the area, when the theme offers several. */
  look?:string}[];
 interaction:{placementArea:string|null;framedArea:string|null;inset:number;hoveredApplet:string|null;hoveredArea:string|null;
  /** First use: areas and Applets can't be opened or moved yet. */
  locked?:boolean;
  /** Something sits over the World (the tour, a dialog, an attention preview): no hover, no lamp actions. */
  covered?:boolean;
  /** The open Applet shows an item's detail beside it. */
  detailOpen?:boolean;
  /** The open Applet shows its website instead of its own contents. */
  website?:boolean};
 pins:Readonly<Record<string,readonly (string|null)[]>>;
 environment:ThemeRecord;
 motion:boolean;
 /** Nobody can see the World right now (Fox floats on the desktop, or the window is hidden). Stop drawing. */
 paused?:boolean;
 /** Applets that arrive next, before `applet.arrived` shows them: a theme that places Applets puts them where they will land. */
 arriving?:readonly string[];
}
/** A place the World marks for the host's shared overlays: the accessible button, the name, the lamp label and the
 * attention mark the host draws there. CSS pixels relative to the World's host element. */
export interface ThemeWorldMark {
 kind:'applet'|'area'|'area-add'|'slot';id:string;x:number;y:number;visible:boolean;
 /** Slot marks: the place's index in its area, as moveApplet takes it. */
 slot?:number;
 /** Applet marks: show the name beside the Applet. */
 label?:boolean;
 hovered?:boolean;
 /** Applet marks: where the lamp sits and where the attention mark hangs, relative to x and y. */
 lamp?:{x:number;y:number};
 attention?:{x:number;y:number};
}
export interface ThemeWorldContext {
 host:HTMLElement;scene:ThemeScene;state:ThemeWorldState;
 navigate(target:{kind:'applet'|'area';id:string}):void;
 menu(id:string,x:number,y:number):void;
 moveApplet(id:string,area:string,slot?:number):void;
 /** Published URL of a package-relative `assets/...` path. */
 asset(path:string):string;
 /** Report where the host draws its shared overlays. A theme that calls it draws no buttons, names or lamp labels of its own. */
 marks?(marks:Readonly<Record<string,ThemeWorldMark>>):void;
 /** Leave the open area or Applet, as the host's Back does. */
 back?():void;
 /** Open an area's own panel (its Applets and places), as its area mark does. */
 openArea?(id:string):void;
}
export interface ThemeWorldEvent {
 type:'mail.received'|'applet.arrived';ids:readonly string[];
 /** Arrivals: they fly in from the middle of the window, each starting as its icon. */
 from?:'center';
 icons?:Readonly<Record<string,string>>;
 /** Arrivals: they are already in place; only settle them (their shadows), don't fly them in. */
 settled?:boolean;
}
export interface ThemeWorldMount extends ThemeMount {
 update(state:ThemeWorldState):void;
 /** Whether the theme played it. An arrival may return a promise that settles when the Applets have landed. */
 event(event:ThemeWorldEvent):boolean|Promise<boolean>;
 /** CSS pixels relative to host. Used by the companion and host accessibility surfaces. */
 anchor(id:string):{x:number;y:number}|null;
 bounds(id:string):{x:number;y:number;width:number;height:number}|null;
 /** The World stays drawn behind an open Applet (blurred, its device in front). Otherwise the host hides it. */
 behindApplet?:boolean;
 /** What is on screen now, for the zoom between the World and an Applet. */
 picture?():HTMLCanvasElement|null;
 /** Renderer facts for the product's own checks. */
 metrics?():ThemeRecord;
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
 if(p.hud!==undefined){
  const h=p.hud;need(object(h),'hud');
  need((object(h.skin)&&Object.entries(h.skin).every(([part,piece])=>(THEME_HUD_PARTS as readonly string[]).includes(part)&&object(piece)&&picture(piece.image)&&Array.isArray(piece.slice)&&piece.slice.length===4&&piece.slice.every(n=>Number.isInteger(n)&&n>=0)&&Number.isFinite(piece.width)&&piece.width>0&&piece.width<=64)),'hud skin');
 }
 if(p.sound!==undefined)need(object(p.sound)&&object(p.sound.events)&&Object.entries(p.sound.events).every(([event,file])=>(THEME_SOUND_EVENTS as readonly string[]).includes(event)&&/\.(mp3|ogg|m4a|wav)$/.test(themeAssetPath(file))),'sound events');
 return p;
}
