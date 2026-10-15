/** The one Theme contract (v3). A theme is static: pictures, sounds and JSON, no code and no stylesheet. The host
 * draws the World and every Applet page itself and reads from the theme only what is declared here.
 * Worldlet bundles one theme, the Village (ui/theme-packages/village). */
export const BUILD_THEME_CONTRACT_VERSION = 3;
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
/** The colour roles an Artifact uses: paper, ink and brass, and one accent per tone (what a card is about). */
export const THEME_ARTIFACT_COLORS=['paper','ink','brass','moss','teal','honey','sage','clay','plum'] as const;
export type ThemeArtifactColor=typeof THEME_ARTIFACT_COLORS[number];
/** How the theme's Artifacts look (core/artifacts/README.md#theme-driven-artifacts), as static files: the host's
 * generator reads the rules and prompt, sees the reference pictures and may place the materials in a page it writes;
 * the host's own card fills its template with the same colours. Nothing here runs. */
export interface ThemeArtifact {
 /** Design rules for a generated Artifact (Markdown). */
 style:string;
 /** The prompt the generator receives with the content, the room and the capabilities (Markdown). */
 prompt:string;
 /** Pictures of finished Artifacts, the visual standard; the first is the primary one. */
 references:readonly {image:string;role:string}[];
 /** Pictures a generated Artifact may place, by id. */
 materials?:readonly {id:string;image:string;usage:string}[];
 /** `#rrggbb` per colour role; a role left out keeps the host's. */
 colors?:Partial<Record<ThemeArtifactColor,string>>;
}
/** Geometry measured on the final background, in normalized image coordinates (x, y, width, height).
 * These are facts about painted surfaces, not viewport CSS or authority over host controls. */
export interface ThemeSceneRegistration {
 /** Alpha from an extracted frame, registered to the original painting. Normalized source and target bounds. */
 webFrame?:{mask:string;source:readonly [number,number,number,number];target:readonly [number,number,number,number]};
 /** Optional paper overlap along top/right/bottom/left, clockwise source-pixel samples, at most 3 px deep. */
 webEdge?:{top:readonly number[];right:readonly number[];bottom:readonly number[];left:readonly number[]};
 imageSize:readonly [number,number];
 /** Hash of the encoded picture. Re-measure after changing it. */
 sha256:string;
 regions:readonly {id:string;role:'primary'|'secondary';rect:readonly [number,number,number,number];material:'paper'|'board'|'screen';quad?:readonly [readonly [number,number],readonly [number,number],readonly [number,number],readonly [number,number]]}[];
 /** Quiet painted space the host can reserve for its companion. */
 companion:readonly [number,number,number,number];
}
/** The materials a scene region can be painted as; the host renders an Applet's records and controls on each one. */
export const THEME_SCENE_MATERIALS=['paper','board','screen'] as const;
export type ThemeSceneMaterialName=typeof THEME_SCENE_MATERIALS[number];
/** How live HTML looks on one painted material: `#rrggbb` or `#rrggbbaa` colours and optional font stacks. The painting
 * itself is the surface, so `fill` is only for a material that needs a wash under the text. A role left out keeps the
 * host's, which it takes from the tokens. */
export interface ThemeSceneMaterial {
 ink?:string;muted?:string;line?:string;accent?:string;
 /** Text on an accent-coloured button. */
 accentInk?:string;
 /** An ordinary button's face and text. */
 control?:string;controlInk?:string;
 fill?:string;
 bodyFont?:string;displayFont?:string;
}
/** A measured crop of a static material image, in normalized source coordinates. */
export interface ThemeSceneSprite {image:string;source:readonly [number,number,number,number]}
/** A background tied to one Applet key. Its live records and controls are supplied by the host. */
export interface ThemeAppletScene {
 background:string;registration:ThemeSceneRegistration;
 /** Crops of painted game materials. The host owns cells, values, input and motion. */
 sprites?:Partial<Record<'empty-cell'|'tile'|'food',ThemeSceneSprite>>;
}
/** A reusable picture pair for a custom Applet, not a provider registration or a page layout. */
export interface ThemeAppletPreset {
 id:string;title:string;description:string;category:string;
 /** Package-local pictures; the icon may be transparent. The background contains no live data. */
 icon:string;background:string;
 registration?:ThemeSceneRegistration;
}
/** A measured overview with live, host-owned area entrances. Keys are stable host area IDs. */
export interface ThemeWorldMap {
 background:string;imageSize:readonly [number,number];sha256:string;
 areas:Readonly<Record<string,{anchor:readonly [number,number];title?:string;description?:string;map?:string}>>;
}
/** WMO forecast condition codes for optional static illustrations. */
export const THEME_WEATHER_CODES=[0,1,2,3,45,48,51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99] as const;
/** The theme's type and colours. */
export interface ThemeTokens {bodyFont:string;displayFont:string;bodySize:number;titleSize:number;ink:string;paper:string;accent:string;focus:string;radius:number;controlHeight:number}
export interface ThemePresentation {
 tokens:ThemeTokens;
 /** Optional painted overview and area backgrounds. No executable renderer is supplied by the theme. */
 worldMap?:ThemeWorldMap;
 /** Optional condition illustrations by WMO code; omitted codes keep the shared weather artwork. */
 weatherIcons?:Readonly<Record<string,string>>;
 /** Bundled faces. Family defaults to the filename without its extension; use it in the token/material font stacks. */
 fonts:readonly {file:string;license:string;family?:string}[];
 hud?:ThemeHud;
 sound?:ThemeSound;
 /** The theme's own picture of each Applet, by Applet key. The host shows it wherever it pictures that Applet (the World, lists, history, onboarding); an Applet left out keeps the host's picture. */
 icons?:Readonly<Record<string,string>>;
 /** How the theme's Artifacts look. Left out, Artifacts keep the host's card. */
 artifact?:ThemeArtifact;
 /** Optional art choices for custom Applets. Omitted means no presets. The host owns selection and rendering. */
 appletPresets?:readonly ThemeAppletPreset[];
 /** Backgrounds bound to specific Applet keys; independent of reusable presets. */
 appletScenes?:Readonly<Record<string,ThemeAppletScene>>;
 /** How Applet content looks on each region material (ui/applets/scene). Left out, a material keeps the host's look. */
 sceneMaterials?:Partial<Record<ThemeSceneMaterialName,ThemeSceneMaterial>>;
}
/** theme.json. Every other file in the package is a picture, a sound, a font, a licence text or JSON. */
export interface BuildThemeManifest {
 contractVersion:3;id:string;updatedAt?:string;title:string;
 assets:'assets';presentation:'presentation.json';
}
const need=(ok:unknown,message:string)=>{if(!ok)throw Error('Invalid build theme: '+message);};
const id=(v:unknown)=>typeof v==='string'&&/^[a-z][a-z0-9-]*$/.test(v);
const text=(v:unknown)=>typeof v==='string'&&v.trim().length>0;
export function themeAssetPath(v:unknown):string {
 need(typeof v==='string'&&/^assets\/[a-zA-Z0-9_./-]+$/.test(v)&&!v.split('/').some(x=>!x||x==='.'||x==='..'),'asset path');return v as string;
}
export function parseBuildThemeManifest(value:unknown):BuildThemeManifest {
 const t=value as BuildThemeManifest;
 need(t&&t.contractVersion===3&&id(t.id)&&text(t.title),'identity / contract v3');
 need(t.updatedAt===undefined||(typeof t.updatedAt==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(t.updatedAt)&&Number.isFinite(Date.parse(t.updatedAt))),'updatedAt UTC timestamp');
 need(t.assets==='assets'&&t.presentation==='presentation.json','package files');
 need(Object.keys(t).every(key=>['contractVersion','id','title','updatedAt','assets','presentation'].includes(key)),'manifest fields (a theme is static: no code, stylesheet or Applet scenes)');return t;
}
export function parseThemePresentation(value:unknown):ThemePresentation {
 const p=value as ThemePresentation;
 need(p&&p.tokens,'presentation');
 need(Object.keys(p).every(key=>['tokens','fonts','worldMap','weatherIcons','hud','sound','icons','artifact','appletPresets','appletScenes','sceneMaterials'].includes(key)),'presentation fields (the host lays out the World and Applet pages)');
 const t=p.tokens;for(const k of ['bodyFont','displayFont','ink','paper','accent','focus'])need(text(t[k]),'token '+k);
 for(const k of ['bodySize','titleSize','radius','controlHeight'])need(Number.isFinite(t[k])&&t[k]>0,'token '+k);
 need(t.bodySize>=12&&t.controlHeight>=32,'readable type and controls');
 need(Array.isArray(p.fonts),'fonts');for(const f of p.fonts){themeAssetPath(f.file);themeAssetPath(f.license);need(f.family===undefined||(text(f.family)&&/^[a-zA-Z0-9 _.-]+$/.test(f.family)),'font family');}
 const object=(v:unknown)=>!!v&&typeof v==='object'&&!Array.isArray(v),picture=(v:unknown)=>/\.(png|webp|svg)$/.test(themeAssetPath(v));
 if(p.worldMap!==undefined){
  const w=p.worldMap,point=(v:unknown)=>Array.isArray(v)&&v.length===2&&v.every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1);
  need(object(w)&&Object.keys(w).every(k=>['background','imageSize','sha256','areas'].includes(k))&&picture(w.background),'world map fields');
  need(Array.isArray(w.imageSize)&&w.imageSize.length===2&&w.imageSize.every(n=>Number.isInteger(n)&&n>0),'world map dimensions');
  need(typeof w.sha256==='string'&&/^[a-f0-9]{64}$/.test(w.sha256),'world map image hash');
  need(object(w.areas)&&Object.keys(w.areas).length>0&&Object.entries(w.areas).every(([key,a])=>id(key)&&object(a)&&Object.keys(a).every(k=>['anchor','title','description','map'].includes(k))&&point(a.anchor)&&(a.title===undefined||text(a.title))&&(a.description===undefined||text(a.description))&&(a.map===undefined||picture(a.map))),'world map areas');
 }
 if(p.weatherIcons!==undefined)need(object(p.weatherIcons)&&Object.entries(p.weatherIcons).every(([code,file])=>THEME_WEATHER_CODES.some(value=>String(value)===code)&&picture(file)),'weather icons');
 if(p.hud!==undefined){
  const h=p.hud;need(object(h),'hud');
  need((object(h.skin)&&Object.entries(h.skin).every(([part,piece])=>(THEME_HUD_PARTS as readonly string[]).includes(part)&&object(piece)&&picture(piece.image)&&Array.isArray(piece.slice)&&piece.slice.length===4&&piece.slice.every(n=>Number.isInteger(n)&&n>=0)&&Number.isFinite(piece.width)&&piece.width>0&&piece.width<=64)),'hud skin');
 }
 if(p.sound!==undefined)need(object(p.sound)&&object(p.sound.events)&&Object.entries(p.sound.events).every(([event,file])=>(THEME_SOUND_EVENTS as readonly string[]).includes(event)&&/\.(mp3|ogg|m4a|wav)$/.test(themeAssetPath(file))),'sound events');
 if(p.icons!==undefined)need(object(p.icons)&&Object.entries(p.icons).every(([key,file])=>id(key)&&picture(file)),'applet icons');
 const rect=(v:unknown)=>Array.isArray(v)&&v.length===4&&v.every(Number.isFinite)&&v[0]>=0&&v[1]>=0&&v[2]>0&&v[3]>0&&v[0]+v[2]<=1&&v[1]+v[3]<=1;
 const registration=(r:ThemeSceneRegistration)=>{
  need(object(r)&&Object.keys(r).every(k=>['imageSize','sha256','regions','companion','webEdge','webFrame'].includes(k)),'scene registration fields');
  need(Array.isArray(r.imageSize)&&r.imageSize.length===2&&r.imageSize.every(n=>Number.isInteger(n)&&n>0),'scene image size');
  need(typeof r.sha256==='string'&&/^[a-f0-9]{64}$/.test(r.sha256),'scene image hash');
  need(Array.isArray(r.regions)&&r.regions.length>0&&r.regions.every(region=>object(region)&&Object.keys(region).every(k=>['id','role','rect','material','quad'].includes(k))&&id(region.id)&&['primary','secondary'].includes(region.role)&&rect(region.rect)&&['paper','board','screen'].includes(region.material)),'scene content regions');
  for(const region of r.regions)if(region.quad!==undefined){
   const q=region.quad;need(Array.isArray(q)&&q.length===4&&q.every(p=>Array.isArray(p)&&p.length===2&&p.every(n=>Number.isFinite(n)&&n>=0&&n<=1)),'scene region quadrilateral');
   // Clockwise TL, TR, BR, BL in screen coordinates, strictly convex and large enough to read.
   need(q.every((p,i)=>{const b=q[(i+1)%4],c=q[(i+2)%4];return (b[0]-p[0])*(c[1]-b[1])-(b[1]-p[1])*(c[0]-b[0])>.02;}),'scene region quadrilateral winding');
   need(!r.webFrame&&!r.webEdge,'HTML projection cannot transform a native browser surface');
  }
  need(new Set(r.regions.map(region=>region.id)).size===r.regions.length&&r.regions.filter(region=>region.role==='primary').length===1,'scene region ids and primary surface');
  need(rect(r.companion),'scene companion clearance');
  if(r.webFrame!==undefined)need(object(r.webFrame)&&Object.keys(r.webFrame).length===3&&picture(r.webFrame.mask)&&/\.(png|webp)$/.test(r.webFrame.mask)&&rect(r.webFrame.source)&&rect(r.webFrame.target),'scene web frame');
  if(r.webEdge!==undefined){
   need(object(r.webEdge)&&Object.keys(r.webEdge).length===4&&['top','right','bottom','left'].every(side=>{const samples=(r.webEdge as any)[side];return Array.isArray(samples)&&samples.length>=2&&samples.length<=64&&samples.every(n=>Number.isFinite(n)&&n>=0&&n<=3);}), 'scene web edge');
  }
  const regions=[...r.regions.map(region=>region.rect),r.companion];
  for(let i=0;i<regions.length;i++)for(let j=i+1;j<regions.length;j++){
   const [x,y,w,h]=regions[i],[cx,cy,cw,ch]=regions[j];
   need(x+w<=cx||cx+cw<=x||y+h<=cy||cy+ch<=y,'scene regions overlap');
  }
 };
 if(p.appletScenes!==undefined){
  need(object(p.appletScenes),'applet scenes');
  for(const [key,scene] of Object.entries(p.appletScenes)){
   need(id(key)&&object(scene)&&Object.keys(scene).every(k=>['background','registration','sprites'].includes(k))&&picture(scene.background),'applet scene');
   registration(scene.registration);
   if(scene.sprites!==undefined)need(object(scene.sprites)&&Object.entries(scene.sprites).every(([role,sprite])=>['empty-cell','tile','food'].includes(role)&&object(sprite)&&Object.keys(sprite).every(k=>['image','source'].includes(k))&&picture(sprite.image)&&rect(sprite.source)),'scene sprites');
  }
 }
 if(p.sceneMaterials!==undefined){
  const color=(v:unknown)=>typeof v==='string'&&/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(v),font=(v:unknown)=>text(v)&&/^[a-zA-Z0-9 ,'"-]+$/.test(v as string);
  need(object(p.sceneMaterials)&&Object.entries(p.sceneMaterials).every(([name,m])=>(THEME_SCENE_MATERIALS as readonly string[]).includes(name)&&object(m)&&
   Object.entries(m as object).every(([k,v])=>['ink','muted','line','accent','accentInk','control','controlInk','fill'].includes(k)?color(v):['bodyFont','displayFont'].includes(k)&&font(v))),'scene materials');
 }
 if(p.appletPresets!==undefined){
  const presets=p.appletPresets;
  need(Array.isArray(presets)&&presets.every(a=>object(a)&&Object.keys(a).every(k=>['id','title','description','category','icon','background','registration'].includes(k))&&id(a.id)&&text(a.title)&&text(a.description)&&text(a.category)&&picture(a.icon)&&picture(a.background)),'applet presets');
  need(new Set(presets.map(a=>a.id)).size===presets.length,'unique applet preset ids');
  for(const preset of presets)if(preset.registration!==undefined)registration(preset.registration);
 }
 if(p.artifact!==undefined){
  const a=p.artifact,markdown=(v:unknown)=>/\.md$/.test(themeAssetPath(v)),list=(v:unknown,max:number)=>Array.isArray(v)&&v.length<=max;
  need(object(a)&&Object.keys(a).every(key=>['style','prompt','references','materials','colors'].includes(key)),'artifact fields');
  need(markdown(a.style)&&markdown(a.prompt),'artifact style and prompt (Markdown)');
  need(list(a.references,6)&&a.references.length>0&&a.references.every(r=>object(r)&&picture(r.image)&&text(r.role)),'artifact references (1 to 6 pictures)');
  need(a.materials===undefined||(list(a.materials,12)&&a.materials.every(m=>object(m)&&id(m.id)&&picture(m.image)&&text(m.usage))&&new Set(a.materials.map(m=>m.id)).size===a.materials.length),'artifact materials (up to 12, unique ids)');
  need(a.colors===undefined||(object(a.colors)&&Object.entries(a.colors).every(([role,hex])=>(THEME_ARTIFACT_COLORS as readonly string[]).includes(role)&&typeof hex==='string'&&/^#[0-9a-f]{6}$/i.test(hex))),'artifact colors');
 }
 return p;
}
