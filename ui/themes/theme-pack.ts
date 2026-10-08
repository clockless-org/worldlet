import {validateSceneMotion,type SceneMotion} from './scene-motion.ts';
// The Theme Pack contract: one data-only description of how a theme presents the shared product
// (owner request 2026-10-05). A theme decides where things are and how they look and move; it never
// owns data. Mail keeps its ID, accounts, messages and background tasks whatever room shows it, and
// the same business event drives a different animation in each theme. Never execute theme code.
export type ThemeRect=[number,number,number,number];
/** One transparent, silent mail performance registered to the room painting, in normalized coordinates. */
export type ThemeMailDelivery={src:string;bounds:ThemeRect;duration:number;shadow:{bounds:ThemeRect;contact:[number,number]};foreground:ThemeRect[]};
export type ThemeFocusLayout={content:ThemeRect;ambience?:SceneMotion[];delivery?:ThemeMailDelivery};
export type ThemeAmbientPresentation={overview:string;room:string;areas:Record<string,string>;applets:Record<string,string>;labels:Record<string,{title:string;icon:'breeze'|'wave'|'tree'|'flame'}>};
export type ThemePoint=[number,number];
/** Features in the original device image, before any alpha crop or display scaling. */
export type ThemeDeviceFeature={center:ThemePoint;radius:ThemePoint};
export type ThemeDeviceEffects={lamp?:ThemeDeviceFeature;idle?:ThemeDeviceFeature&{kind:'orbit'|'bubbles'|'writing'|'glow'|'glint';color:string}};
/** A layout area is a normalized rectangle, or a name for an area the shared UI already owns. */
export type ThemeArea=ThemeRect|'world-pack'|'shared'|'shared-reader';
export type ThemeEventCue={cue:string;play:'once'|'while-running';reduced:'static'|'appear'|'none'};
/** Business events a theme may animate. Adding one is a product decision, not a theme's. */
export const THEME_EVENTS=['applet.arrived','mail.received','task.working','task.succeeded','task.failed','task.cancelled'] as const;
export type ThemeEvent=typeof THEME_EVENTS[number];
/** The HUD pieces a theme may paint, each a nine-slice image laid over the shared element (ui/themes/theme-surfaces.css). */
export const THEME_SKIN_PARTS=['attention','note','nameplate','back','bubble','panel','log','button','card','frame'] as const;
export type ThemeSkinPart=typeof THEME_SKIN_PARTS[number];
/** A nine-slice image: the slice insets (top, right, bottom, left) in image pixels and the border width it draws at in CSS pixels. */
export type ThemeSkin={image:string;slice:[number,number,number,number];width:number};
/** A font file the theme ships, with its license (OFL or similar; never a font whose terms are unknown). */
export type ThemeFont={family:string;file:string;license:string};
/** 'shared' keeps the shared UI's own look for that surface (Village's). */
export type Shared='shared';
export interface ThemePack {
 schemaVersion:1;
 id:string;
 title:string;
 version:string;
 /** Name, where the art came from and under what terms: an IP collaboration and an original theme read differently. */
 record:{name:string;origin:'original'|'licensed'|'fan';assetSource:string;license:string;notes?:string};
 /** The Style Pack that holds this theme's tokens, HUD material and Applet/companion art. */
 style:{id:string;version:string};
 /** 1. Space: scenes, rooms with their entrances and connections, hit areas and placement slots. */
 space:{
  world:string;
  scenes:Array<{id:string;kind:'overview'|'room';areas:'world'|string[]}>;
  /** A room presents one product group (home, work, ...); the group, not the room, owns the Applets. */
  rooms:Array<{id:string;group:string;entrance:'landmark'|'door'|'stairs'|'hatch';connects:string[]}>;
  hitAreas:'area-bounds';
  slots:'world-pack';
 };
 /** 2. Layout: content areas and the companion's safe area in the overview, a room and reading. */
 layout:{
  overview:{frame:ThemeArea;hudSafe:ThemeArea;companionSafe:ThemeArea};
  room:{foreground:ThemePoint;companionSafe:ThemeArea};
  reading:{content:ThemeArea;companionSafe:ThemeArea};
 };
 /** 3. HUD: colors, type, material, borders, icons and short transitions, from the style or the theme. */
 hud:{tokens:'style';assets:'style';controls:string};
 /** 4. Applets: each Applet's Peek/Open/Focus art; one without its own falls back to the theme's generic room. */
 applets:{presentation:'style';fallback:string;focusFallback:'world-device'|string;focusLayouts?:Record<string,ThemeFocusLayout>;roomLayouts?:Record<string,ThemeFocusLayout>;deviceEffects?:Record<string,ThemeDeviceEffects>};
 /** 5. Motion and sound: ambient loops with stop rules, the cue each business event plays and the sound files for both. */
 motion:{
  ambient:Array<{id:string;when:'always'|'day'|'night'|'weather';stop:'reduced-motion'|'never'}>;
  events:Partial<Record<ThemeEvent,ThemeEventCue>>;
  sound:{events:Partial<Record<ThemeEvent,string>>;ambient:Record<string,string>;presentation?:ThemeAmbientPresentation};
  /** How the World moves into a zoomed area and into an Applet's room. */
  transitions:{area:'zoom'|Shared;room:'fade'|'door'|Shared;ms:number};
 };
 /** 7. Surfaces: the rest of the shared UI: CSS tokens, fonts, painted HUD pieces and the loading screen. Every surface a
  * person sees has a field here; 'shared' leaves it to the shared UI. */
 surfaces:{
  /** CSS custom properties (`--theme-*`) the shared UI reads: colors, radii, shadows. */
  tokens:Record<string,string>;
  fonts:{display:ThemeFont|Shared;label:ThemeFont|Shared};
  skin:Record<ThemeSkinPart,ThemeSkin|Shared>;
  /** The loading screen's picture: the companion portrait, or a file of its own. */
  startup:{portrait:'companion'|string};
 };
 /** 6. Companion: its own rig, mapped onto the shared performance states, with a still pose for gaps. */
 companion:{
  renderer?:'rive'|'sprite-rig';id:string;rig:string;portrait:string;fallbackPose:string;performances:Record<string,string>;perches:Record<'overview'|'room'|'reading','stable'|string>};
}

const id=(v:unknown):v is string=>typeof v==='string'&&/^[a-z][a-z0-9-]*$/.test(v);
const text=(v:unknown):v is string=>typeof v==='string'&&v.trim().length>0;
const unit=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1;
const point=(v:unknown):v is ThemePoint=>Array.isArray(v)&&v.length===2&&v.every(unit);
const rect=(v:unknown):v is ThemeRect=>Array.isArray(v)&&v.length===4&&v.every(unit)&&v[2]>0&&v[3]>0&&v[0]+v[2]<=1&&v[1]+v[3]<=1;
const area=(v:unknown)=>rect(v)||v==='world-pack'||v==='shared'||v==='shared-reader';
/** Repository-relative and inside it: a theme names files, never URLs or parent paths. */
export function themePath(value:unknown):string {
 if(typeof value!=='string'||!value||value.startsWith('/')||value.includes('\\')||value.split('/').some(p=>!p||p==='.'||p==='..')||/[:?#\x00-\x1f]/.test(value))throw Error('Unsafe theme path');
 return value;
}
/** Validates a theme description against the contract; anything unexpected fails before it is shown. */
export function parseThemePack(value:unknown,performanceStates:readonly string[]=[]):ThemePack {
 const t=value as ThemePack;
 const need=(ok:unknown,message:string)=>{if(!ok)throw Error('Invalid theme pack: '+message);};
 need(t&&t.schemaVersion===1,'schema version');
 need(id(t.id),'id');need(text(t.title),'title');need(/^\d+\.\d+\.\d+$/.test(t.version),'version');
 need(t.record&&text(t.record.name)&&['original','licensed','fan'].includes(t.record.origin)&&text(t.record.assetSource)&&text(t.record.license),'record: name, origin, asset source and license');
 need(t.style&&id(t.style.id)&&/^\d+\.\d+\.\d+$/.test(t.style.version),'style');
 const s=t.space;
 need(s&&id(s.world)&&Array.isArray(s.scenes)&&s.scenes.some(x=>x.kind==='overview'),'space: an overview scene');
 need(Array.isArray(s.rooms)&&s.rooms.length>0,'space: rooms');
 const rooms=new Set<string>(),groups=new Set<string>();
 for(const r of s.rooms){need(id(r.id)&&!rooms.has(r.id),'unique room: '+r.id);rooms.add(r.id);need(id(r.group)&&!groups.has(r.group),'one room per group: '+r.group);groups.add(r.group);need(['landmark','door','stairs','hatch'].includes(r.entrance),'room entrance: '+r.id);}
 for(const r of s.rooms)need(Array.isArray(r.connects)&&r.connects.every(c=>rooms.has(c)&&c!==r.id),'room connections: '+r.id);
 need(s.hitAreas==='area-bounds'&&s.slots==='world-pack','space: hit areas and slots');
 const l=t.layout;
 need(l&&area(l.overview?.frame)&&area(l.overview.hudSafe)&&area(l.overview.companionSafe),'layout: overview');
 need(point(l.room?.foreground)&&area(l.room.companionSafe),'layout: room');
 need(area(l.reading?.content)&&area(l.reading.companionSafe),'layout: reading');
 need(t.hud&&t.hud.tokens==='style'&&t.hud.assets==='style','hud');themePath(t.hud.controls);
 need(t.applets&&t.applets.presentation==='style'&&text(t.applets.fallback)&&text(t.applets.focusFallback),'applets: presentation and generic fallback');
 if(t.applets.deviceEffects!==undefined){
  need(t.applets.deviceEffects&&typeof t.applets.deviceEffects==='object'&&!Array.isArray(t.applets.deviceEffects),'applets: device effects');
  for(const [asset,effects] of Object.entries(t.applets.deviceEffects)){
   themePath(asset);need(/\.(png|webp)$/.test(asset)&&effects&&!!(effects.lamp||effects.idle),'applets: device effect asset');
   for(const feature of [effects.lamp,effects.idle])if(feature){
    need(point(feature.center)&&point(feature.radius)&&feature.radius.every(n=>n>0),'applets: device feature');
    need(feature.center.every((n,i)=>n-feature.radius[i]>=0&&n+feature.radius[i]<=1),'applets: bounded device feature');
   }
   if(effects.idle)need(['orbit','bubbles','writing','glow','glint'].includes(effects.idle.kind)&&/^#[0-9a-fA-F]{6}$/.test(effects.idle.color),'applets: device idle effect');
  }
 }
 for(const [name,layouts] of Object.entries({focusLayouts:t.applets.focusLayouts,roomLayouts:t.applets.roomLayouts}))if(layouts!==undefined){
  need(layouts&&typeof layouts==='object'&&!Array.isArray(layouts),'applets: focus layouts');
  for(const [key,v] of Object.entries(layouts)){
   if(name==='roomLayouts')themePath(key);
   need(v&&rect(v.content),'applets: focus content');
   if(v.delivery){
    const d=v.delivery,[cx,cy,cw,ch]=v.content;
    need(/\.webm$/.test(themePath(d.src))&&rect(d.bounds),'applets: delivery video and bounds');
    const [x,y,w,h]=d.bounds;need(x+w<=cx||x>=cx+cw||y+h<=cy||y>=cy+ch,'applets: delivery clears live content');
    need(Number.isFinite(d.duration)&&d.duration>0&&d.duration<=20,'applets: delivery duration');
    need(d.shadow&&rect(d.shadow.bounds)&&Array.isArray(d.shadow.contact)&&d.shadow.contact.length===2&&d.shadow.contact.every(Number.isFinite)&&d.shadow.contact[0]>=0&&d.shadow.contact[1]>d.shadow.contact[0]&&d.shadow.contact[1]<=d.duration,'applets: delivery contact');
    need(Array.isArray(d.foreground)&&d.foreground.length<=8&&d.foreground.every(rect),'applets: delivery foreground');
   }
   if(v.ambience!==undefined)for(const m of validateSceneMotion(v.ambience)){
    const [x,y,w,h]=m.bounds,[cx,cy,cw,ch]=v.content;
    need(x+w<=cx||x>=cx+cw||y+h<=cy||y>=cy+ch,'applets: ambience clears live content');
   }
  }
 }
 const m=t.motion;
 need(m&&Array.isArray(m.ambient)&&m.ambient.every(a=>id(a.id)&&['always','day','night','weather'].includes(a.when)&&['reduced-motion','never'].includes(a.stop)),'motion: ambient loops and stop rules');
 need(m.events&&typeof m.events==='object'&&Object.keys(m.events).every(e=>(THEME_EVENTS as readonly string[]).includes(e)),'motion: known business events');
 for(const cue of Object.values(m.events))need(id(cue.cue)&&['once','while-running'].includes(cue.play)&&['static','appear','none'].includes(cue.reduced),'motion: event cue');
 // A failure or cancel must never play a success cue.
 const success=m.events['task.succeeded']?.cue;
 for(const e of ['task.failed','task.cancelled'] as const)need(!success||m.events[e]?.cue!==success,'motion: '+e+' plays the success cue');
 need(m.sound&&typeof m.sound.events==='object'&&Object.keys(m.sound.events).every(e=>(THEME_EVENTS as readonly string[]).includes(e)),'sound: known business events');
 need(m.sound.ambient&&typeof m.sound.ambient==='object'&&Object.keys(m.sound.ambient).every(k=>m.ambient.some(a=>a.id===k)),'sound: ambient sounds name ambient loops');
 for(const file of [...Object.values(m.sound.events),...Object.values(m.sound.ambient)])need(/\.(mp3|ogg|m4a|wav)$/.test(themePath(file)),'sound: audio files');
 if(m.sound.presentation){
  const p=m.sound.presentation,loop=(v:unknown)=>typeof v==='string'&&Object.hasOwn(m.sound.ambient,v);
  need(loop(p.overview)&&loop(p.room),'sound: default scene loops');
  for(const map of [p.areas,p.applets])need(map&&typeof map==='object'&&!Array.isArray(map)&&Object.entries(map).every(([key,value])=>id(key)&&loop(value)),'sound: scene loop assignments');
  need(p.labels&&Object.keys(m.sound.ambient).every(key=>text(p.labels[key]?.title)&&p.labels[key].title.length<=60&&['breeze','wave','tree','flame'].includes(p.labels[key].icon)),'sound: loop names and icons');
 }
 const tr=m.transitions;
 need(tr&&['zoom','shared'].includes(tr.area)&&['fade','door','shared'].includes(tr.room)&&Number.isInteger(tr.ms)&&tr.ms>=0&&tr.ms<=1200,'motion: transitions');
 const f=t.surfaces;
 need(f&&f.tokens&&typeof f.tokens==='object','surfaces: tokens');
 // Tokens are plain values: no URLs, rules or declarations can ride in on one.
 for(const [k,v] of Object.entries(f.tokens))need(/^--theme-[a-z0-9-]+$/.test(k)&&typeof v==='string'&&/^[#a-zA-Z0-9 .,%()+\-\/]+$/.test(v)&&!/url|expression/i.test(v),'surfaces: token '+k);
 need(f.fonts&&['display','label'].every(k=>Object.hasOwn(f.fonts,k)),'surfaces: fonts');
 for(const font of Object.values(f.fonts))if(font!=='shared')need(font&&/^[A-Za-z0-9 ]+$/.test(font.family)&&/\.(woff2|woff|ttf|otf)$/.test(themePath(font.file))&&text(font.license),'surfaces: font file, family and license');
 need(f.skin&&THEME_SKIN_PARTS.every(k=>Object.hasOwn(f.skin,k))&&Object.keys(f.skin).every(k=>(THEME_SKIN_PARTS as readonly string[]).includes(k)),'surfaces: every HUD piece');
 for(const piece of Object.values(f.skin))if(piece!=='shared')need(piece&&/\.(png|webp)$/.test(themePath(piece.image))&&Array.isArray(piece.slice)&&piece.slice.length===4&&piece.slice.every(n=>Number.isInteger(n)&&n>=0)&&typeof piece.width==='number'&&piece.width>0&&piece.width<=64,'surfaces: HUD piece');
 need(f.startup&&(f.startup.portrait==='companion'||/\.(png|webp)$/.test(themePath(f.startup.portrait))),'surfaces: loading screen');
 const c=t.companion;
 need(c&&id(c.id)&&text(c.fallbackPose)&&c.performances&&typeof c.performances==='object','companion');themePath(c.rig);themePath(c.portrait);
 need(c.renderer===undefined||['rive','sprite-rig'].includes(c.renderer),'companion renderer');
 need(Object.values(c.performances).every(text),'companion performances');
 // A state the rig lacks holds the fallback pose; a name outside the shared vocabulary is a typo.
 need(Object.keys(c.performances).every(state=>!performanceStates.length||performanceStates.includes(state)),'companion maps only shared states');
 need(!performanceStates.length||performanceStates.includes(c.fallbackPose),'companion fallback pose is a shared state');
 need(c.perches&&['overview','room','reading'].every(k=>text(c.perches[k])),'companion perches');
 for(const perch of Object.values(c.perches))if(perch!=='stable')need(/\.(png|webp)$/.test(themePath(perch)),'companion perch image');
 return t;
}
/** The rig state a theme's companion plays for a shared performance state; a gap holds the still fallback pose. */
export function companionPerformance(theme:ThemePack,state:string):{state:string;still:boolean}{
 const mapped=Object.hasOwn(theme.companion.performances,state)?theme.companion.performances[state]:null;
 return mapped?{state:mapped,still:false}:{state:theme.companion.fallbackPose,still:true};
}
