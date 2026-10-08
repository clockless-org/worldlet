// What a theme actually covers, surface by surface (owner request 2026-10-05: a Theme Pack should cover
// every part of the World). Village is the reference look, so every surface another theme does not draw
// itself shows Village's. Each pack records the borrowed surfaces in its coverage.json, and
// scripts/theme-pack-check.ts fails when the computed coverage and that record disagree: a gap is never
// silent, and closing one updates the record.
import type {ThemePack,ThemeSkinPart} from './theme-pack.ts';

export type CoverageState='own'|'partial'|'village';
export type SurfaceCoverage={state:CoverageState;detail:string};
/** Every surface of the World a person sees, in the order the coverage report lists them. */
export const THEME_SURFACES=[
 ['world','World plates and layers'],
 ['area-zoom','Zoomed area view'],
 ['applet-devices','Applet devices on the ground'],
 ['applet-rooms','Applet rooms behind an open Applet'],
 ['applet-surfaces','Cards, lists and frames inside an Applet'],
 ['mail-parts','Mail envelopes, bins and board'],
 ['attention-art','Attention group and scene art'],
 ['hud-material','HUD material: paper, frames, buttons'],
 ['hud-controls','HUD colors, borders and type'],
 ['fonts','Display and label fonts'],
 ['companion-bubble','The companion speech bubble'],
 ['companion-panel','Companion panel and Settings'],
 ['world-log','World log'],
 ['startup','Loading screen and first-use pages'],
 ['companion','Companion rig and portrait'],
 ['companion-perches','Where the companion perches'],
 ['ambient','Ambient motion'],
 ['event-cues','Animations for business events'],
 ['sound','Sound'],
 ['transitions','Entering an area or room'],
] as const;
export type ThemeSurface=typeof THEME_SURFACES[number][0];

/** Cues a theme renderer actually draws. Village's cues are the shared work motion (ui/world/work-motion.ts). */
export const DRAWN_CUES:Record<string,readonly string[]>={village:['device-reveal','lamp-breathe','done-mark','stop-at-step']};

type StyleManifest={world:Record<string,string>;applets:Record<string,{peek?:string;open?:string;focus?:string}>;mailParts:Record<string,string>;attention:Record<string,string>;hud:Record<string,string>};
type WorldManifest={canvas:{width:number;height:number};layers:Array<{kind:string;lighting:string}>;occlusion?:unknown[];landmarks?:unknown;areas?:Array<{closeView?:{src:string}}>};
export type CoverageInput={pack:ThemePack;style:StyleManifest;world:WorldManifest;reference:string;performanceStates:readonly string[];rigFrames?:number};

const own=(pack:ThemePack,path:unknown)=>typeof path==='string'&&(path.startsWith('resources/themes/'+pack.id+'/')||path.startsWith('resources/worlds/'+pack.space.world+'/'));
function share(pack:ThemePack,paths:unknown[],what:string):SurfaceCoverage{
 const mine=paths.filter(p=>own(pack,p)).length;
 return {state:!paths.length||!mine?'village':mine<paths.length?'partial':'own',detail:mine+' of '+paths.length+' '+what+' are the theme\'s own'};
}
/** Distinct art across Applets: a theme showing one image for most of them has not covered them. */
function variety(pack:ThemePack,style:StyleManifest,key:'peek'|'focus',what:string):SurfaceCoverage{
 const paths=Object.values(style.applets).map(a=>a[key]).filter((p):p is string=>!!p);
 const base=share(pack,paths,what);if(base.state==='village')return base;
 const counts=new Map<string,number>();for(const p of paths)counts.set(p,(counts.get(p)||0)+1);
 const top=Math.max(...counts.values());
 // More than a quarter of all Applets sharing one picture reads as repetition.
 return {state:base.state==='own'&&top*4<=paths.length?'own':'partial',detail:counts.size+' distinct for '+paths.length+' Applets; the most used one stands for '+top};
}
/** HUD pieces (surfaces.skin): own when every named piece is painted, partial when some are. */
function pieces(pack:ThemePack,parts:readonly ThemeSkinPart[],what:string):SurfaceCoverage{
 const painted=parts.filter(p=>pack.surfaces.skin[p]!=='shared').length;
 return {state:painted===parts.length?'own':painted?'partial':'village',detail:painted+' of '+parts.length+' '+what+' painted'};
}

/** Computes how much of the World a theme draws itself. The reference theme covers everything by definition. */
export function themeCoverage(input:CoverageInput):Record<ThemeSurface,SurfaceCoverage>{
 const {pack,style,world,reference,performanceStates}=input;
 if(pack.id===reference)return Object.fromEntries(THEME_SURFACES.map(([id])=>[id,{state:'own',detail:'Reference theme'}])) as Record<ThemeSurface,SurfaceCoverage>;
 const plates=share(pack,Object.values(style.world),'world plates');
 const layered=['environment','architecture','foreground'].every(kind=>['day','night'].every(lighting=>world.layers.some(l=>l.kind===kind&&l.lighting===lighting)))||!!(world.landmarks&&Object.keys(world.landmarks).length);
 const hud=pieces(pack,['attention','note','nameplate','back','button'],'HUD pieces (Attention, note, nameplate, Back, buttons)');
 const cues=Object.values(pack.motion.events).map(e=>e.cue),drawn=new Set(DRAWN_CUES[pack.id]||[]),drawnCount=new Set(cues.filter(c=>drawn.has(c))).size,cueCount=new Set(cues).size;
 const performances=input.rigFrames??(pack.companion.renderer==='sprite-rig'?0:performanceStates.length);
 const perches=Object.values(pack.companion.perches).filter(p=>p!=='stable').length;
 const sounds=Object.keys(pack.motion.sound.events).length,loops=Object.keys(pack.motion.sound.ambient).length,wanted=Object.keys(pack.motion.events).length+pack.motion.ambient.length;
 const fonts=(['display','label'] as const).filter(k=>pack.surfaces.fonts[k]!=='shared').length;
 const tr=pack.motion.transitions,moves=(tr.area!=='shared'?1:0)+(tr.room!=='shared'?1:0);
 const portrait=own(pack,pack.companion.portrait);
 const areaCount=world.areas?.length||0,closeViews=new Set((world.areas||[]).map(a=>a.closeView?.src).filter(Boolean)).size;
 const authoredAreas=areaCount>0&&closeViews===areaCount;
 return {
  world:plates.state==='village'?plates:{state:layered?'own':'partial',detail:world.layers.length+' layers at '+world.canvas.width+'×'+world.canvas.height+(layered?'':world.occlusion?.length?'; '+world.occlusion.length+' registered foreground silhouettes; full architectural separation remains partial':'; one flat plate per lighting')},
  'area-zoom':plates.state==='village'?plates:{state:authoredAreas||world.canvas.width>=3840?'own':'partial',detail:closeViews+' of '+areaCount+' distinct authored close views; fallback zooms a '+world.canvas.width+'-pixel-wide plate'},
  'applet-devices':variety(pack,style,'peek','device images'),
  'applet-rooms':variety(pack,style,'focus','room plates'),
  'applet-surfaces':pieces(pack,['card','frame'],'Applet pieces (cards, web frame)'),
  'mail-parts':share(pack,Object.values(style.mailParts),'Mail parts'),
  'attention-art':share(pack,Object.values(style.attention),'Attention pictures'),
  'hud-material':hud,
  'hud-controls':{state:hud.state==='own'&&Object.keys(pack.surfaces.tokens).length?'own':'partial',detail:Object.keys(pack.surfaces.tokens).length+' theme tokens; recolored by '+pack.hud.controls},
  fonts:{state:fonts===2?'own':fonts?'partial':'village',detail:fonts+' of 2 fonts (display, label) shipped'},
  'companion-bubble':pieces(pack,['bubble'],'bubble'),
  'companion-panel':pieces(pack,['panel'],'panel'),
  'world-log':pieces(pack,['log'],'world log strip'),
  startup:pack.surfaces.startup.portrait!=='companion'?{state:'own',detail:'Its own loading picture'}:{state:portrait?'partial':'village',detail:portrait?'Shows its companion portrait':'Shows Fox'},
  companion:{state:pack.companion.renderer==='sprite-rig'&&performances<performanceStates.length?'partial':'own',detail:pack.companion.id+': '+(pack.companion.renderer||'rive')+', '+performances+' poses'+' for '+performanceStates.length+' performances'},
  'companion-perches':{state:perches?'own':'village',detail:perches?perches+' perches of its own':'Stays where Fox stands'},
  ambient:{state:pack.motion.ambient.length>=4?'own':'partial',detail:pack.motion.ambient.length+' ambient loops'},
  'event-cues':{state:drawnCount===cueCount?'own':drawnCount?'partial':'village',detail:drawnCount+' of '+cueCount+' cues drawn; the rest show the shared work motion'},
  sound:{state:sounds+loops>=wanted&&wanted>0?'own':sounds+loops?'partial':'village',detail:sounds+' event sounds and '+loops+' ambient sounds for '+wanted+' cues and loops'},
  transitions:{state:moves===2?'own':moves?'partial':'village',detail:'Area: '+tr.area+', room: '+tr.room},
 };
}
/** The surfaces a theme still borrows, as recorded in its coverage.json. */
export function borrowedSurfaces(coverage:Record<ThemeSurface,SurfaceCoverage>):Record<string,CoverageState>{
 return Object.fromEntries(Object.entries(coverage).filter(([,c])=>c.state!=='own').map(([id,c])=>[id,c.state]));
}
