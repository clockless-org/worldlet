// The host's Theme Pack (ui/themes/theme-registry.ts): the Village look the host draws with, a broken pack is
// rejected, business events play each cue once and never success on failure, and slot pins are kept per theme.
// Themes a person picks are packages (resources/themes/CONTRACT.md; scripts/build-theme-source-check.ts).
import assert from 'node:assert/strict';
import {access} from 'node:fs/promises';
import {ACTIVE_THEME,DEFAULT_THEME_ID,companionPerformance,createThemeEvents,parseThemePack,selectThemePins,storedThemePins,switchThemePins,themeAppletArt,type ThemePlacementLayout} from '../ui/themes/index.ts';
import {BUILTIN_STYLE,STYLE_TOKENS} from '../ui/components/style.ts';
import {WORLD_LAYOUT,THEME_WORLD} from '../ui/world/world-layout.ts';
import {villageCamera} from '../ui/theme-packages/village/village-camera.ts';
import {ROOM_FOREGROUND,SCENERY_TONE} from '../ui/theme-packages/village/village-pack.ts';
import {FOX_STATES} from '../ui/companion/fox-state-catalog.ts';
import {WORLD_APPS} from '../core/applets/catalog.ts';
import {MOMENT_ART} from '../core/applets/moment.ts';
import village from '../resources/themes/village/theme.json' with {type:'json'};

const store=new Map<string,string>();
(globalThis as any).localStorage={getItem:(k:string)=>store.has(k)?store.get(k):null,setItem:(k:string,v:string)=>{store.set(k,String(v));},removeItem:(k:string)=>{store.delete(k);}};
const states=FOX_STATES.map(s=>s.id);

// The host draws with the Village pack.
assert.equal(DEFAULT_THEME_ID,'village');
assert.equal(ACTIVE_THEME.pack.id,'village');
const pack=parseThemePack(structuredClone(village),states);
assert.equal(BUILTIN_STYLE,ACTIVE_THEME.style.manifest);
assert.equal(STYLE_TOKENS,ACTIVE_THEME.style.tokens);
assert.deepEqual(WORLD_LAYOUT.theme,{id:'village',version:pack.version});
assert.equal(THEME_WORLD.id,pack.space.world);
assert.deepEqual(pack.style,{id:BUILTIN_STYLE.id,version:BUILTIN_STYLE.version});
// Each Village room presents one area of the World, and the rooms are the World's areas.
assert.deepEqual(pack.space.rooms.map(r=>r.group).sort(),Object.keys(WORLD_LAYOUT.regions).sort());
// The opened Applet stands where it always did.
assert.deepEqual(pack.layout.room.foreground,[.835,.52]);
const view=villageCamera(1000,800,1,[.5,.5]);assert.equal(view.foregroundX,835);assert.equal(view.foregroundY,416);
// Name, asset source and license are recorded.
assert(pack.record.name&&pack.record.assetSource&&pack.record.license);assert.equal(pack.record.origin,'original');
// The companion is the Rive Fox, every shared performance state maps to it, and a gap holds a still pose.
assert.equal(pack.companion.rig,BUILTIN_STYLE.companion.rive);
assert.equal(pack.companion.portrait,BUILTIN_STYLE.companion.portrait);
assert.deepEqual(Object.keys(pack.companion.performances).sort(),[...states].sort());
for(const state of states)assert.deepEqual(companionPerformance(pack,state),{state,still:false});
const sparse={...pack,companion:{...pack.companion,performances:{idle:'idle'}}};
assert.deepEqual(companionPerformance(sparse,'succeeded'),{state:'idle',still:true});
await Promise.all([pack.companion.rig,pack.companion.portrait,pack.hud.controls].map(f=>access(f)));
// Every catalog Applet has its own Village art; an Applet without any would stand in the generic room.
for(const app of WORLD_APPS){const art=themeAppletArt(ACTIVE_THEME,app.key);assert.equal(art.fallback,false,app.key);assert.equal(art.peek,BUILTIN_STYLE.applets[app.key].peek);}
assert.equal(pack.applets.fallback,MOMENT_ART);
assert.deepEqual(themeAppletArt(ACTIVE_THEME,'not-an-applet'),{...BUILTIN_STYLE.applets[MOMENT_ART],fallback:true});

// A broken pack fails before anything is shown.
const broken:Array<[string,(t:any)=>void]>=[
 ['unsafe device path',t=>t.applets.deviceEffects={'../prop.png':{lamp:{center:[.5,.5],radius:[.01,.01]}}}],
 ['device feature outside image',t=>t.applets.deviceEffects={'assets/prop.png':{lamp:{center:[.99,.5],radius:[.1,.1]}}}],
 ['device feature without extent',t=>t.applets.deviceEffects={'assets/prop.png':{lamp:{center:[.5,.5],radius:[0,.1]}}}],
 ['unknown instrument motion',t=>t.applets.deviceEffects={'assets/prop.png':{idle:{center:[.5,.5],radius:[.1,.1],kind:'bounce',color:'#ffeecc'}}}],
 ['delivery network URL',t=>t.applets.focusLayouts={gmail:{content:[0,0,.4,.4],delivery:{src:'https://example.com/delivery.webm',bounds:[.5,.3,.3,.3]}}}],
 ['delivery over reading surface',t=>t.applets.focusLayouts={gmail:{content:[0,0,.4,.4],delivery:{src:'assets/delivery.webm',bounds:[.3,.3,.3,.3]}}}],
 ['delivery unbounded duration',t=>t.applets.focusLayouts={gmail:{content:[0,0,.4,.4],delivery:{src:'assets/delivery.webm',bounds:[.5,.3,.3,.3],duration:Infinity}}}],
 ['delivery invalid contact',t=>t.applets.focusLayouts={gmail:{content:[0,0,.4,.4],delivery:{src:'assets/delivery.webm',bounds:[.5,.3,.3,.3],duration:12,shadow:{bounds:[.5,.5,.1,.02],contact:[9,4]}}}}],
 ['focus content outside plate',t=>t.applets.focusLayouts={gmail:{content:[.9,0,.5,.5]}}],
 ['focus content is not a rectangle',t=>t.applets.focusLayouts={gmail:{content:'shared-reader'}}],
 ['unsafe room path',t=>t.applets.roomLayouts={'../outside.png':{content:[0,0,.5,.5]}}],
 ['room ambience over content',t=>t.applets.roomLayouts={'assets/room.png':{content:[0,0,.5,.5],ambience:[{id:'dust',kind:'dust',bounds:[.4,.4,.2,.2],color:'#abcdef'}]}}],
 ['room ambience outside painting',t=>t.applets.focusLayouts={mail:{content:[0,0,.4,.4],ambience:[{id:'dust',kind:'dust',bounds:[.9,.5,.2,.2],color:'#abcdef'}]}}],
 ['room ambience unbounded count',t=>t.applets.focusLayouts={mail:{content:[0,0,.4,.4],ambience:[{id:'dust',kind:'dust',bounds:[.5,.5,.2,.2],color:'#abcdef',count:1000}]}}],
 ['duplicate room ambience',t=>{const m={id:'dust',kind:'dust',bounds:[.5,.5,.2,.2],color:'#abcdef'};t.applets.focusLayouts={mail:{content:[0,0,.4,.4],ambience:[m,m]}};}],
 ['unsafe perch',t=>t.companion.perches.overview='../outside.png'],
 ['no license',t=>delete t.record.license],
 ['no asset source',t=>t.record.assetSource=''],
 ['unknown origin',t=>t.record.origin='borrowed'],
 ['no overview scene',t=>t.space.scenes=[]],
 ['room connects nowhere',t=>t.space.rooms[0].connects=['castle']],
 ['two rooms for one group',t=>t.space.rooms[1].group=t.space.rooms[0].group],
 ['unsafe rig path',t=>t.companion.rig='../fox.riv'],
 ['URL asset',t=>t.companion.portrait='https://example.com/fox.png'],
 ['failure plays success',t=>t.motion.events['task.failed'].cue=t.motion.events['task.succeeded'].cue],
 ['cancel plays success',t=>t.motion.events['task.cancelled'].cue=t.motion.events['task.succeeded'].cue],
 ['unknown business event',t=>t.motion.events['mail.read']={cue:'letter',play:'once',reduced:'static'}],
 ['ambient loop without a stop rule',t=>t.motion.ambient[0].stop='sometimes'],
 ['companion state outside the shared vocabulary',t=>t.companion.performances.flying='flying'],
 ['fallback pose outside the shared vocabulary',t=>t.companion.fallbackPose='perched'],
 ['layout area off screen',t=>t.layout.room.foreground=[1.2,.5]],
 ['token carrying a URL',t=>t.surfaces.tokens['--theme-paper']='url(https://example.com/x.png)'],
 ['token outside the theme namespace',t=>t.surfaces.tokens['--ui-ink']='#000'],
 ['font without a license',t=>t.surfaces.fonts.display={family:'Cinzel',file:'resources/themes/village/cinzel.woff2',license:''}],
 ['HUD piece missing',t=>delete t.surfaces.skin.bubble],
 ['unknown HUD piece',t=>t.surfaces.skin.cursor='shared'],
 ['HUD piece that is not an image',t=>t.surfaces.skin.panel={image:'resources/themes/village/panel.css',slice:[1,1,1,1],width:8}],
 ['sound that is not audio',t=>t.motion.sound.events['task.succeeded']='resources/themes/village/done.png'],
 ['ambient sound for no loop',t=>t.motion.sound.ambient.fountain='resources/themes/village/fountain.mp3'],
 ['unknown room transition',t=>t.motion.transitions.room='spin'],
];
for(const [name,change] of broken){const t=structuredClone(village);change(t);assert.throws(()=>parseThemePack(t,states),/Invalid theme pack|Unsafe theme path|Invalid scene ambience/,name);}

// Business events, not re-entries, play cues: once each, a failure stops the work and never shows success.
const events=createThemeEvents(pack);
assert.equal(events.play({event:'task.working',id:'run-1'})?.cue,'lamp-breathe');
assert.equal(events.play({event:'task.working',id:'run-1'}),null,'re-entering does not restart the work cue');
assert.deepEqual(events.running().map(c=>c.id),['run-1']);
const failed=events.play({event:'task.failed',id:'run-1'});
assert.equal(failed?.cue,'stop-at-step');assert.notEqual(failed?.cue,pack.motion.events['task.succeeded'].cue);
assert.deepEqual(events.running(),[],'a failure stops the work cue');
assert.equal(events.play({event:'task.succeeded',id:'run-1'})?.cue,'done-mark','success plays once for its own event');
assert.equal(events.play({event:'task.succeeded',id:'run-1'}),null,'and never again on re-entry');
assert.equal(events.play({event:'task.working',id:'run-2'})?.cue,'lamp-breathe');
assert.equal(events.play({event:'task.cancelled',id:'run-2'})?.cue,'stop-at-step');assert.deepEqual(events.running(),[]);
assert.equal(events.play({event:'mail.received',id:'m-1'}),null,'Village has no cue for new mail');
const arrivals=createThemeEvents(pack,{seen:new Set()}),arrived=arrivals.play({event:'applet.arrived',id:'app-gmail'});
assert.equal(arrived?.cue,'device-reveal');assert.equal(arrivals.play({event:'applet.arrived',id:'app-gmail'}),null);
const calm=createThemeEvents(pack,{reducedMotion:()=>true});
assert.equal(calm.play({event:'task.working',id:'run-3'})?.still,true,'reduced motion holds the cue still');
assert.equal(calm.play({event:'applet.arrived',id:'app-x'})?.still,false,'an arrival simply appears');
calm.stopAll();assert.deepEqual(calm.running(),[]);

// Pins are kept per theme; data (assignments, names, last use) is shared.
const saved={pins:{home:['app-gmail',null]},assignments:{'app-gmail':'home'},themePins:{castle:{home:[null,'app-notion']}}};
const asVillage=selectThemePins<ThemePlacementLayout>({pins:structuredClone(saved.pins)},saved,'village');
assert.deepEqual(asVillage.pins,saved.pins,'Village reads the pins saved before themes');
assert.deepEqual(asVillage.themePins,{castle:{home:[null,'app-notion']}});
assert.deepEqual(storedThemePins(asVillage,'village'),{pins:saved.pins,themePins:{castle:{home:[null,'app-notion']}}});
const asCastle=selectThemePins<ThemePlacementLayout>({pins:structuredClone(saved.pins)},saved,'castle');
assert.deepEqual(asCastle.pins,{home:[null,'app-notion']},'another theme reads its own pins');
assert.deepEqual(storedThemePins(asCastle,'castle'),{pins:saved.pins,themePins:{castle:{home:[null,'app-notion']}}},'Village keeps its pins while another theme is shown');
const swapped=switchThemePins(structuredClone(asVillage),'village','castle');
assert.deepEqual(swapped.pins,{home:[null,'app-notion']});assert.deepEqual(swapped.themePins,{village:saved.pins});
assert.deepEqual(switchThemePins(swapped,'castle','village').pins,saved.pins);
const {readRegionLayout,storedRegionLayout}=await import('../ui/world/region-layout.ts');
store.set('regions',JSON.stringify({version:2,names:{home:'Cottage'},pins:{home:['app-gmail']},themePins:{castle:{home:['app-notion']}}}));
const layout=readRegionLayout('regions');
assert.deepEqual(layout.pins,{home:['app-gmail']});assert.equal(layout.names.home,'Cottage');
assert.deepEqual(JSON.parse(JSON.stringify(storedRegionLayout(layout))).themePins,{castle:{home:['app-notion']}},'saving keeps the other theme\'s pins');
assert.deepEqual(readRegionLayout('regions','castle').pins,{home:['app-notion']});
// The World keeps every theme's pins (onboarding.regionLayout), and recent use stays shared.
const {updateOnboarding}=await import('../core/onboarding/onboarding.ts');const {parseRegionLayout}=await import('../ui/world/region-layout.ts');
const inWorld=updateOnboarding({version:1,presets:['home'],completed:true},{operation:'regionLayout',layout:JSON.parse(JSON.stringify(storedRegionLayout({...layout,lastUsedAt:{'app-gmail':1000}})))}).regionLayout;
assert.deepEqual(parseRegionLayout(inWorld,'castle').pins,{home:['app-notion']});assert.deepEqual(parseRegionLayout(inWorld,'village').pins,{home:['app-gmail']});
assert.deepEqual(parseRegionLayout(inWorld,'castle').lastUsedAt,{'app-gmail':1000});

// A second pack, for the parts that read a pack other than the host's (sound projection).
const art=(name:string)=>'resources/themes/castle/'+name+'.webp';
const castleSound={events:{},ambient:{'water-glints':'resources/themes/castle/lake.wav','chimney-smoke':'resources/themes/castle/hearth.wav'},presentation:{overview:'water-glints',room:'chimney-smoke',areas:{home:'chimney-smoke'},applets:{gmail:'chimney-smoke'},labels:{'water-glints':{title:'Lake',icon:'wave'},'chimney-smoke':{title:'Hearth',icon:'flame'}}}};
const castlePack=parseThemePack({...structuredClone(village),id:'castle',space:{...structuredClone(village.space),world:'castle'},motion:{...structuredClone(village.motion),sound:castleSound},companion:{...structuredClone(village.companion),renderer:'sprite-rig',rig:'resources/themes/castle/rig.json',portrait:art('portrait').replace('.webp','.png')}},states);
// Surfaces reach the shared UI as --theme-* properties and data attributes; a shared surface sets nothing,
// and switching away clears the previous theme's.
{
 const {applyThemeSurfaces}=await import('../ui/themes/theme-surfaces.ts');
 const props=new Map<string,string>(),dataset:Record<string,string>={};
 (globalThis as any).document={documentElement:{dataset,style:{setProperty:(k:string,v:string)=>props.set(k,v),removeProperty:(k:string)=>props.delete(k)}},fonts:{add(){}}};
 applyThemeSurfaces({tokens:{'--theme-ink':'#2b1d0e'},fonts:{},skin:{bubble:{image:'assets/world/a b.png',slice:[40,30,40,30],width:20}},sounds:{events:{},ambient:{}},attention:[],transitions:{area:'zoom',room:'door',ms:400}});
 assert.equal(props.get('--theme-ink'),'#2b1d0e');assert.equal(props.get('--theme-skin-bubble'),'url("assets/world/a%20b.png")');
 assert.equal(props.get('--theme-skin-bubble-slice'),'40 30 40 30');assert.equal(props.get('--theme-skin-bubble-width'),'20px');
 assert.equal(dataset.themeSkin,'bubble');assert.equal(dataset.themeRoomTransition,'door');assert.equal(props.get('--theme-transition-ms'),'400ms');
 applyThemeSurfaces({tokens:{},fonts:{},skin:{},sounds:{events:{},ambient:{}},attention:[],transitions:{area:'shared',room:'shared',ms:0}});
 assert.equal(props.size,0,'the previous theme\'s surfaces are cleared');assert.equal(dataset.themeSkin,undefined);assert.equal(dataset.themeRoomTransition,undefined);
 delete (globalThis as any).document;
}
// Short event sounds obey the native channel volume and visibility; no renderer ambience competes with it.
{
 const {syncThemeSounds,playThemeSound,attentionPicture}=await import('../ui/themes/theme-surfaces.ts');
 const w=globalThis as any,played:string[]=[],paused:string[]=[];
 w.document={hidden:false,documentElement:{dataset:{worldSounds:'off',worldSoundVolume:'0.18'}}};
 w.Audio=class {src:string;loop=false;volume=0;constructor(src:string){this.src=src;}play(){played.push(this.src);return Promise.resolve();}pause(){paused.push(this.src);}removeAttribute(){}};
 w.__WORLDLET_ENV_ASSETS__={surfaces:{attention:['coming-up'],sounds:{events:{'task.succeeded':'feather.wav'},ambient:{lake:'lake.wav'}}}};
 assert.equal(attentionPicture('scene-tennis','castle','coming-up'),'attention/castle/coming-up.webp');
 assert.equal(attentionPicture('scene-tennis','village'),'attention/scene-tennis.webp');
 syncThemeSounds();playThemeSound('task.succeeded');assert.equal(played.length,0);
 w.document.documentElement.dataset.worldSounds='on';syncThemeSounds();syncThemeSounds();assert.deepEqual(played,[],'ambient playback belongs to the native channel');
 playThemeSound('task.succeeded');assert.deepEqual(played,['feather.wav']);
 w.document.hidden=true;syncThemeSounds();playThemeSound('task.succeeded');assert.deepEqual(paused,['feather.wav']);assert.equal(played.length,1);
 w.document.hidden=false;w.document.documentElement.dataset.worldSoundVolume='0';playThemeSound('task.succeeded');assert.equal(played.length,1,'zero volume suppresses event sounds');
 delete w.Audio;delete w.document;delete w.__WORLDLET_ENV_ASSETS__;
}
console.log('PASS Theme Pack: the host draws with the Village pack, broken packs rejected, cues once per event and never success on failure, pins per theme, surfaces projected');

// Theme sound projection and the platform-independent selection policy.
{
 const {themeAmbientTrack}=await import('../ui/themes/index.ts');
 const {createAmbientSelection}=await import('../core/tools/index.ts');
 const pack=castlePack;
 assert.equal(themeAmbientTrack(pack),'theme:castle:water-glints');
 assert.equal(themeAmbientTrack(pack,'building','building-home'),'theme:castle:chimney-smoke');
 assert.equal(themeAmbientTrack(pack,'building','building-money'),'theme:castle:chimney-smoke','an Area without its own loop plays the room loop');
 assert.equal(themeAmbientTrack(pack,'object','app-gmail'),'theme:castle:chimney-smoke');
 assert.equal(themeAmbientTrack(ACTIVE_THEME.pack),'village');
 const selection=createAmbientSelection();selection.present('theme:castle:water-glints',false);assert.deepEqual(selection.current,{track:'theme:castle:water-glints',suspended:true});
 selection.choose('rain');selection.present('theme:castle:chimney-smoke',false);assert.deepEqual(selection.current,{track:'rain',suspended:false},'explicit audio does not follow scenery or its visibility');
 for(const mutate of [p=>p.overview='missing',p=>p.areas.home='missing',p=>delete p.labels['water-glints'],p=>p.labels['water-glints'].icon='missing']){
  const bad=structuredClone(pack);mutate(bad.motion.sound.presentation);assert.throws(()=>parseThemePack(bad),/Invalid theme pack/);
 }
 console.log('PASS scene sound selection, manual-source ownership, visibility and sound manifest validation');
}
{
 // The Village World keeps its own copy of these settings (ui/theme-packages/village/village-pack.ts); they must match the pack.
 const village=ACTIVE_THEME;
 assert.deepEqual([...ROOM_FOREGROUND],[...village.pack.layout.room.foreground],'Village room foreground matches its pack');
 assert.deepEqual({...SCENERY_TONE},{...STYLE_TOKENS.sceneryTone},'Village scenery tone matches the style tokens');
 console.log('PASS the Village World\'s own settings match its pack and style tokens');
}
