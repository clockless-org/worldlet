import {readFile,writeFile,copyFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {cachedEncode} from './build-cache.ts';
import {ACTIVE_THEME,theme,themeAppletArt,type RegisteredTheme} from '../ui/themes/index.ts';
import type {WorldPack} from '../ui/world/world-pack.ts';
import {buildCompanionPresentation} from './build-companion-presentation.ts';
import {readVillageArt} from './village-art.ts';

// Lossless encoding keeps the authored pixels and full native resolution.
async function plate(file:string){return 'data:image/webp;base64,'+(await cachedEncode(file,'plate:webp-lossless-6',()=>sharp(file).webp({lossless:true,effort:6}).toBuffer())).toString('base64');}

// One answer to "which painted file is this device", shared by the native
// payload and the downscaled website payload so the two cannot drift.
export function deviceSource(root:string,key:string,entry:RegisteredTheme=ACTIVE_THEME){
 return path.join(root,themeAppletArt(entry,key).peek);
}
import {paintedBox} from './painted-box.ts';
export {paintedBox};
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
// The Village payload: its committed art (ui/theme-packages/village/assets), its world package and the companion.
export async function buildWorldAssets(root:string,output:string,channel='release'){
const entry=ACTIVE_THEME;
await mkdir(path.join(output,'assets'),{recursive:true});
await copyFile(path.join(root,'node_modules/pixi.js/LICENSE'),path.join(output,'PIXI-LICENSE.txt'));
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
// The host's own Applet pages, the loading page and host surfaces draw the Village package's art where the package
// publishes it (theme-assets/village/, ui/theme-packages/village/assets/art.json); the Village World reads it itself.
const art=await readVillageArt(root),file=(name:string)=>'theme-assets/village/'+name;
spritePayload.surroundings=file(art.world.day);
for(const [key,device] of Object.entries(art.devices)){spritePayload.devices[key]=file(device.src);spritePayload.deviceBoxes[key]=[...device.box];spritePayload.deviceEffects[key]={};}
for(const [key,motion] of Object.entries(art.motion)){spritePayload.motion[key]=file(motion.sheet);if(motion.frames)spritePayload.motionFrames[key]=motion.frames.map(file);}
for(const [key,name] of Object.entries(art.open))spritePayload.open[key]=file(name);
for(const [key,name] of Object.entries(art.mail))spritePayload.mailParts[key]=file(name);
const portrait='assets/'+entry.pack.id+'-portrait.png';await copyFile(path.join(root,entry.pack.companion.portrait),path.join(output,portrait));
const companionExpressions=entry.pack.companion.renderer==='sprite-rig'?undefined:'data:image/png;base64,'+(await readFile(path.join(root,entry.style.manifest.companion.expressions))).toString('base64');
const companionPresentation=await buildCompanionPresentation(root,channel,entry);
const envPayload={companionPortrait:portrait,companionExpressions,...companionPresentation,surfaces:await buildSurfaces(root,output,entry)};
const files=await externalizeImages([spritePayload,envPayload],output);
// The page's first script: the payload, and the loading page's Fox still before the World bundle runs.
await writeFile(path.join(output,'environment-assets.js'),'globalThis.__WORLDLET_25D_ASSETS__='+JSON.stringify(spritePayload)+';globalThis.__WORLDLET_ENV_ASSETS__='+JSON.stringify(envPayload)+';'+
 `{const p=globalThis.__WORLDLET_ENV_ASSETS__;document.documentElement.dataset.worldTheme=${JSON.stringify(entry.pack.id)};const still=p.surfaces?.startup||(!p.companionRive&&p.companionPortrait),img=document.querySelector('.startup-fox');if(still&&img)img.src=still;}`);
return {files};

}
