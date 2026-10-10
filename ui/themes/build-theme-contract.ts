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
/** The theme's type and colours. */
export interface ThemeTokens {bodyFont:string;displayFont:string;bodySize:number;titleSize:number;ink:string;paper:string;accent:string;focus:string;radius:number;controlHeight:number}
export interface ThemePresentation {
 tokens:ThemeTokens;
 fonts:readonly {file:string;license:string}[];
 hud?:ThemeHud;
 sound?:ThemeSound;
 /** The theme's own picture of each Applet, by Applet key. The host shows it wherever it pictures that Applet (the World, lists, history, onboarding); an Applet left out keeps the host's picture. */
 icons?:Readonly<Record<string,string>>;
 /** How the theme's Artifacts look. Left out, Artifacts keep the host's card. */
 artifact?:ThemeArtifact;
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
 need(Object.keys(p).every(key=>['tokens','fonts','hud','sound','icons','artifact'].includes(key)),'presentation fields (the host lays out the World and Applet pages)');
 const t=p.tokens;for(const k of ['bodyFont','displayFont','ink','paper','accent','focus'])need(text(t[k]),'token '+k);
 for(const k of ['bodySize','titleSize','radius','controlHeight'])need(Number.isFinite(t[k])&&t[k]>0,'token '+k);
 need(t.bodySize>=12&&t.controlHeight>=32,'readable type and controls');
 need(Array.isArray(p.fonts),'fonts');for(const f of p.fonts){themeAssetPath(f.file);themeAssetPath(f.license);}
 const object=(v:unknown)=>!!v&&typeof v==='object'&&!Array.isArray(v),picture=(v:unknown)=>/\.(png|webp|svg)$/.test(themeAssetPath(v));
 if(p.hud!==undefined){
  const h=p.hud;need(object(h),'hud');
  need((object(h.skin)&&Object.entries(h.skin).every(([part,piece])=>(THEME_HUD_PARTS as readonly string[]).includes(part)&&object(piece)&&picture(piece.image)&&Array.isArray(piece.slice)&&piece.slice.length===4&&piece.slice.every(n=>Number.isInteger(n)&&n>=0)&&Number.isFinite(piece.width)&&piece.width>0&&piece.width<=64)),'hud skin');
 }
 if(p.sound!==undefined)need(object(p.sound)&&object(p.sound.events)&&Object.entries(p.sound.events).every(([event,file])=>(THEME_SOUND_EVENTS as readonly string[]).includes(event)&&/\.(mp3|ogg|m4a|wav)$/.test(themeAssetPath(file))),'sound events');
 if(p.icons!==undefined)need(object(p.icons)&&Object.entries(p.icons).every(([key,file])=>id(key)&&picture(file)),'applet icons');
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
