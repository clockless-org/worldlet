import {readFile,writeFile,copyFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {cachedEncode} from './build-cache.ts';
import {ACTIVE_THEME,theme,themeAppletArt,type RegisteredTheme} from '../ui/themes/index.ts';
import type {WorldPack} from '../ui/world/world-pack.ts';
import {buildCompanionPresentation} from './build-companion-presentation.ts';

// Lossless encoding keeps the authored pixels and full native resolution.
async function plate(file:string){return 'data:image/webp;base64,'+(await cachedEncode(file,'plate:webp-lossless-6',()=>sharp(file).webp({lossless:true,effort:6}).toBuffer())).toString('base64');}

// One answer to "which painted file is this device", shared by the native
// payload and the downscaled website payload so the two cannot drift.
export function deviceSource(root:string,key:string,entry:RegisteredTheme=ACTIVE_THEME){
 return path.join(root,themeAppletArt(entry,key).peek);
}
// The opaque box (alpha > 32) of an encoded device image, in its own pixels: [left, top, right, bottom]
// inclusive. The World aligns each device's foot with it; measuring it here spares every launch a
// full-image readback and scan per device.
export async function paintedBox(image:Buffer){
 const {data,info}=await sharp(image).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let left=info.width,top=info.height,right=-1,bottom=-1;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*info.channels+3]>32){if(x<left)left=x;if(x>right)right=x;if(y<top)top=y;bottom=y;}
 return [left,top,right,bottom,info.width,info.height];
}
const IMAGE_TYPES:Record<string,string>={'image/png':'png','image/webp':'webp','image/jpeg':'jpg','image/svg+xml':'svg','font/woff2':'woff2','font/woff':'woff','font/ttf':'ttf','font/otf':'otf','audio/mpeg':'mp3','audio/ogg':'ogg','audio/mp4':'m4a','audio/wav':'wav','video/webm':'webm'};
const FILE_TYPES:Record<string,string>=Object.fromEntries(Object.entries(IMAGE_TYPES).map(([type,ext])=>[ext,type]));
/** A theme's file as a data URI, which externalizeImages turns into a content-named file beside the payload. */
async function dataFile(file:string){const type=FILE_TYPES[path.extname(file).slice(1).toLowerCase()];if(!type)throw Error('Unsupported theme file: '+file);return 'data:'+type+';base64,'+(await readFile(file)).toString('base64');}
// A theme's surfaces in built form (ui/themes/theme-surfaces.ts BuiltSurfaces): its HUD pieces, fonts, loading
// picture and sounds as bundled files, and the Attention pictures it ships under attention/<theme>/.
async function buildSurfaces(root:string,output:string,entry:RegisteredTheme){
 const {pack}=entry,s=pack.surfaces,reference=theme('village').style.manifest.attention as Record<string,string>,own=entry.style.manifest.attention as Record<string,string>;
 const skin:Record<string,unknown>={},fonts:Record<string,unknown>={},events:Record<string,string>={},ambient:Record<string,string>={},attention:string[]=[];
 for(const [part,piece] of Object.entries(s.skin))if(piece!=='shared')skin[part]={image:await dataFile(path.join(root,piece.image)),slice:[...piece.slice],width:piece.width};
 for(const [role,font] of Object.entries(s.fonts))if(font!=='shared')fonts[role]={family:font.family,src:await dataFile(path.join(root,font.file))};
 for(const [event,file] of Object.entries(pack.motion.sound.events))if(file)events[event]=await dataFile(path.join(root,file));
 for(const [id,file] of Object.entries(pack.motion.sound.ambient))ambient[id]=await dataFile(path.join(root,file));
 if(pack.id!=='village')for(const [name,file] of Object.entries(own))if(file!==reference[name]){
  await mkdir(path.join(output,'attention',pack.id),{recursive:true});
  await sharp(path.join(root,file)).resize({width:768,withoutEnlargement:true}).webp({quality:82}).toFile(path.join(output,'attention',pack.id,name+'.webp'));attention.push(name);
 }
 return {tokens:{...s.tokens},fonts,skin,startup:s.startup.portrait==='companion'?undefined:await dataFile(path.join(root,s.startup.portrait)),sounds:{events,ambient},attention,transitions:{...pack.motion.transitions}};
}
// Every image the payload carries becomes its own content-named file under assets/world/, and the
// payload holds its relative URL. The payload used to inline them as data URIs: a 130 MB script the
// World parsed before it could start, whose strings then stayed in the page's heap for good. The
// World is same-origin with these files (worldlet://app, or file:// in the checks), so WebGL
// textures stay origin-clean. Identical images share one file. Returns the number of files.
export async function externalizeImages(payloads:object[],output:string){
 const dir=path.join(output,'assets/world'),written=new Set<string>();await mkdir(dir,{recursive:true});
 const visit=async(value:any):Promise<any>=>{
  if(typeof value==='string'){
   const match=/^data:([^;,]+);base64,/.exec(value),ext=match&&IMAGE_TYPES[match[1]];
   if(!ext)return value;
   const bytes=Buffer.from(value.slice(match[0].length),'base64'),name=createHash('sha256').update(bytes).digest('hex').slice(0,20)+'.'+ext;
   if(!written.has(name)){written.add(name);await writeFile(path.join(dir,name),bytes);}
   return 'assets/world/'+name;
  }
  if(Array.isArray(value)){for(let i=0;i<value.length;i++)value[i]=await visit(value[i]);return value;}
  if(value&&typeof value==='object'){for(const key of Object.keys(value))value[key]=await visit(value[key]);return value;}
  return value;
 };
 for(const payload of payloads)await visit(payload);
 return written.size;
}
// Everything a theme presents is packed from that theme's registration (ui/themes): its world plates and
// landmarks, Applet devices (or its generic room for an Applet without art), Focus rooms and companion.
export async function buildWorldAssets(root:string,output:string,channel='release',themeId=ACTIVE_THEME.pack.id){
const entry=theme(themeId),STYLE=entry.style.manifest,appletArt=(key:string)=>themeAppletArt(entry,key);
const plates=STYLE.world;
await mkdir(path.join(output,'assets'),{recursive:true});
await copyFile(path.join(root,'node_modules/pixi.js/LICENSE'),path.join(output,'PIXI-LICENSE.txt'));
// The native world uses generated 2.5D assets. Data URIs also work inside
// WKWebView's file origin without allowing remote asset requests.
const {WORLD_APPS}=await import('../core/applets/catalog.ts');
const {MOMENT_ART}=await import('../core/applets/moment.ts');
const spritePayload:any={theme:{id:entry.pack.id,version:entry.pack.version,title:entry.pack.title},landmarks:{},landmarkNights:{},surroundings:'',night:'',hiresDay:'',hiresNight:'',devices:{},deviceBoxes:{},motion:{},motionFrames:{},logos:{},focus:{},open:{},mailParts:{},regions:{},studies:[]};
spritePayload.ambience=structuredClone((entry.world as WorldPack).ambience||[]);
spritePayload.occlusion=structuredClone((entry.world as WorldPack).occlusion||[]);
if((entry.world as WorldPack).layers.some(l=>l.kind==='architecture'))spritePayload.sceneryLayers=await Promise.all((entry.world as WorldPack).layers.map(async layer=>({...layer,image:await plate(path.join(root,'resources/worlds',entry.pack.space.world,layer.src))})));
spritePayload.deviceEffects={};
spritePayload.areaViews={};
for(const area of (entry.world as WorldPack).areas){if(!area.closeView)continue;
 const spec=structuredClone(area.closeView),base=path.join(root,'resources/worlds',entry.pack.space.world),devices={},deviceBoxes={},deviceEffects={};
 for(const [key,file] of Object.entries(spec.devices||{})){const bytes=await readFile(path.join(base,file));devices[key]=await dataFile(path.join(base,file));deviceBoxes[key]=await paintedBox(bytes);deviceEffects[key]=structuredClone(entry.pack.applets.deviceEffects?.['resources/worlds/'+entry.pack.space.world+'/'+file]||{});}
 spritePayload.areaViews[area.legacyIds[0]||area.id]={...spec,image:await plate(path.join(base,spec.src)),devices,deviceBoxes,deviceEffects};
}
for(const key of Object.keys(STYLE.landmarks)){
 spritePayload.landmarks[key]=await plate(path.join(root,STYLE.landmarks[key].day));
 spritePayload.landmarkNights[key]=await plate(path.join(root,STYLE.landmarks[key].night));
}
// A registered pair: fixtures and their light pools are painted into the plates.
// Identical full-resolution references are encoded and decoded only once.
spritePayload.surroundings=spritePayload.sceneryLayers?.find(l=>l.kind==='environment'&&l.lighting==='day').image||await plate(path.join(root,plates.day));
spritePayload.night=spritePayload.sceneryLayers?.find(l=>l.kind==='environment'&&l.lighting==='night').image||await plate(path.join(root,plates.night));
if(!spritePayload.sceneryLayers&&plates.hiresDay!==plates.day)spritePayload.hiresDay=await plate(path.join(root,plates.hiresDay));
if(!spritePayload.sceneryLayers&&plates.hiresNight!==plates.night)spritePayload.hiresNight=await plate(path.join(root,plates.hiresNight));
// Every catalog Applet's device, and the one every moment Applet stands on (core/widgets/README.md).
const DEVICE_ART=[...WORLD_APPS.map(({key})=>({key})),{key:MOMENT_ART}];
for(const applet of DEVICE_ART){const source=deviceSource(root,applet.key,entry),device=await cachedEncode(source,'device:768:webp-92-100',()=>sharp(source).resize({width:768,withoutEnlargement:true}).webp({quality:92,alphaQuality:100}).toBuffer());spritePayload.devices[applet.key]='data:image/webp;base64,'+device.toString('base64');spritePayload.deviceBoxes[applet.key]=await paintedBox(device);spritePayload.deviceEffects[applet.key]=structuredClone(entry.pack.applets.deviceEffects?.[appletArt(applet.key).peek]||{});}
for(const {key} of WORLD_APPS){
 const art=appletArt(key);if(art.motion){const file=path.join(root,art.motion),spec=WORLD_APPS.find(a=>a.key===key)?.motion;spritePayload.motion[key]='data:image/png;base64,'+(await readFile(file)).toString('base64');if(spec?.kind==='sprite-frames'){const meta=await sharp(file).metadata(),w=meta.width/spec.columns,h=meta.height/spec.rows;spritePayload.motionFrames[key]=await Promise.all(Array.from({length:spec.frames},async(_,i)=>'data:image/webp;base64,'+(await cachedEncode(file,`frame:${spec.columns}x${spec.rows}:${i}:webp-lossless`,()=>sharp(file).extract({left:i%spec.columns*w,top:Math.floor(i/spec.columns)*h,width:w,height:h}).webp({lossless:true}).toBuffer())).toString('base64')));}}if(!art.open)continue;
 spritePayload.open[key]=art.open===art.peek?spritePayload.devices[key]:'data:image/png;base64,'+(await readFile(path.join(root,art.open))).toString('base64');
}
for(const [key,file] of Object.entries(STYLE.logos))spritePayload.logos[key]='data:image/png;base64,'+(await readFile(path.join(root,file))).toString('base64');
for(const [key,file] of Object.entries(STYLE.mailParts))spritePayload.mailParts[key]='data:image/png;base64,'+(await readFile(path.join(root,file))).toString('base64');
const immersiveComposition=JSON.parse(await readFile(path.join(root,'resources/styles/builtin/references/immersive/composition.json'),'utf8'));
for(const a of WORLD_APPS){
 const focus=appletArt(a.key).focus;if(!focus){if(entry.pack.id!=='village'&&a.focusPresentation==='world-device')continue;throw Error('Missing '+entry.pack.title+' Focus art: '+a.key);}
 if(entry.pack.id!=='village'){
  const layout=structuredClone(entry.pack.applets.focusLayouts?.[a.key]||entry.pack.applets.roomLayouts?.[focus]);
  if(layout?.delivery)layout.delivery.src=await dataFile(path.join(root,layout.delivery.src));
  spritePayload.focus[a.key]={image:await plate(path.join(root,focus)),...layout};continue;
 }
 if(focus.endsWith('/immersive.webp')){const c=immersiveComposition.items[a.key];if(!c||c.subjectLeft<=0||c.subjectLeft>=1||createHash('sha256').update(await readFile(path.join(root,focus))).digest('hex')!==c.encodedSha256)throw Error('Review immersive subject bounds after changing '+a.key);}
 const name='focus-'+a.key+'.js',image=focus.endsWith('/immersive.webp')?'data:image/webp;base64,'+(await readFile(path.join(root,focus))).toString('base64'):await plate(path.join(root,focus));
 // WKWebView file-origin PNG textures can fail WebGL's origin-clean check.
 // Load a single data-URI script on entry, preserving lazy decoding and CSP.
 await writeFile(path.join(output,'assets',name),'globalThis.__WORLDLET_FOCUS_IMAGES__??={};globalThis.__WORLDLET_FOCUS_IMAGES__['+JSON.stringify(a.key)+']='+JSON.stringify(image)+';');
 spritePayload.focus[a.key]={script:'assets/'+name,...(focus.endsWith('/immersive.webp')?{framing:'scene-fit',subjectLeft:immersiveComposition.items[a.key]?.subjectLeft??.70}:a.key==='youtube'?{logo:[.8,.378]}:{})};
}
const portrait='assets/'+entry.pack.id+'-portrait.png';await copyFile(path.join(root,entry.pack.companion.portrait),path.join(output,portrait));
const companionExpressions=entry.pack.companion.renderer==='sprite-rig'?undefined:'data:image/png;base64,'+(await readFile(path.join(root,STYLE.companion.expressions))).toString('base64');
const companionPresentation=await buildCompanionPresentation(root,channel,entry);
const envPayload={companionPortrait:portrait,companionExpressions,...companionPresentation,surfaces:await buildSurfaces(root,output,entry)};
const files=await externalizeImages([spritePayload,envPayload],output);
await writeFile(path.join(output,'environment-assets.js'),'globalThis.__WORLDLET_25D_ASSETS__='+JSON.stringify(spritePayload)+';globalThis.__WORLDLET_ENV_ASSETS__='+JSON.stringify(envPayload)+';');
const registration='globalThis.__WORLDLET_THEME_ASSETS__??={};globalThis.__WORLDLET_THEME_ASSETS__['+JSON.stringify(themeId)+']='+JSON.stringify({world:spritePayload,environment:envPayload})+';';
await writeFile(path.join(output,'environment-'+themeId+'.js'),registration);
return {files,registration};

}
