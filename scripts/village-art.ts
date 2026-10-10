import {createHash} from 'node:crypto';
import {copyFile,mkdir,readFile,rm,stat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {cachedEncode} from './build-cache.ts';
import {theme,themeAppletArt} from '../ui/themes/index.ts';
import {paintedBox} from './painted-box.ts';

/**
 * The Village's runtime art, encoded once and committed under resources/themes/village/art: World plates and
 * landmarks, every Applet's device (its icon), open pictures, motion, logos, Mail parts and Focus rooms. The
 * build reads these files as they are, and the Village theme package will carry the same tree. The painted
 * originals stay where they are as authoring sources; `art.lock.json` ties each output to its source bytes.
 *
 *   node scripts/village-art.ts           re-encode everything (after changing a source)
 *   node scripts/village-art.ts --check   every output exists and matches its source; no encoding
 */
export const VILLAGE_ART='resources/themes/village/art';
export interface VillageArtIndex {
 world:{day:string;night:string};
 landmarks:Record<string,{day:string;night:string}>;
 devices:Record<string,{src:string;box:number[]}>;
 motion:Record<string,{sheet:string;frames?:string[]}>;
 open:Record<string,string>;
 logos:Record<string,string>;
 mail:Record<string,string>;
 focus:Record<string,{image:string;framing?:'scene-fit';subjectLeft?:number;logo?:[number,number]}>;
}
type Lock=Record<string,{source:string;sourceSha256:string;settings:string;sha256:string}>;
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const ext=(file:string)=>path.extname(file).toLowerCase();

export async function encodeVillageArt(root:string){
 const out=path.join(root,VILLAGE_ART),entry=theme('village'),STYLE=entry.style.manifest,lock:Lock={};
 const {WORLD_APPS}=await import('../core/applets/catalog.ts');
 const {MOMENT_ART}=await import('../core/applets/moment.ts');
 await rm(out,{recursive:true,force:true});
 /** Writes one output from one source with the named settings and records it in the lock. */
 const emit=async(name:string,source:string,settings:string,encode:(file:string)=>Promise<Buffer>)=>{
  const file=path.join(root,source),bytes=settings==='copy'?await readFile(file):await cachedEncode(file,settings,()=>encode(file));
  await mkdir(path.dirname(path.join(out,name)),{recursive:true});await writeFile(path.join(out,name),bytes);
  lock[name]={source,sourceSha256:sha(await readFile(file)),settings,sha256:sha(bytes)};return bytes;
 };
 // Settings strings are the build cache keys the payload used before, so existing caches still hit.
 const lossless=(name:string,source:string)=>emit(name,source,'plate:webp-lossless-6',f=>sharp(f).webp({lossless:true,effort:6}).toBuffer());
 const copy=(name:string,source:string)=>emit(name,source,'copy',async()=>Buffer.alloc(0));
 const index:VillageArtIndex={world:{day:'world/day.webp',night:'world/night.webp'},landmarks:{},devices:{},motion:{},open:{},logos:{},mail:{},focus:{}};
 await lossless(index.world.day,STYLE.world.day);await lossless(index.world.night,STYLE.world.night);
 for(const [key,pair] of Object.entries(STYLE.landmarks as Record<string,{day:string;night:string}>)){
  index.landmarks[key]={day:`landmarks/${key}.webp`,night:`landmarks/${key}-night.webp`};
  await lossless(index.landmarks[key].day,pair.day);await lossless(index.landmarks[key].night,pair.night);
 }
 // Every catalog Applet's device, and the one every moment Applet stands on (core/widgets/README.md).
 for(const key of [...WORLD_APPS.map(a=>a.key),MOMENT_ART]){
  const src=`devices/${key}.webp`,device=await emit(src,themeAppletArt(entry,key).peek,'device:768:webp-92-100',f=>sharp(f).resize({width:768,withoutEnlargement:true}).webp({quality:92,alphaQuality:100}).toBuffer());
  index.devices[key]={src,box:await paintedBox(device)};
 }
 const composition=JSON.parse(await readFile(path.join(root,'resources/styles/builtin/references/immersive/composition.json'),'utf8'));
 for(const a of WORLD_APPS){
  const art=themeAppletArt(entry,a.key);
  if(art.motion){
   const sheet=`motion/${a.key}${ext(art.motion)}`;await copy(sheet,art.motion);index.motion[a.key]={sheet};
   const spec=a.motion;if(spec?.kind==='sprite-frames'){
    const meta=await sharp(path.join(root,art.motion)).metadata(),w=meta.width!/spec.columns,h=meta.height!/spec.rows;
    index.motion[a.key].frames=[];
    for(let i=0;i<spec.frames;i++){const name=`motion/${a.key}-${i}.webp`;index.motion[a.key].frames!.push(name);
     await emit(name,art.motion,`frame:${spec.columns}x${spec.rows}:${i}:webp-lossless`,f=>sharp(f).extract({left:i%spec.columns*w,top:Math.floor(i/spec.columns)*h,width:w,height:h}).webp({lossless:true}).toBuffer());}
   }
  }
  if(art.open)index.open[a.key]=art.open===art.peek?index.devices[a.key].src:(await copy(`open/${a.key}${ext(art.open)}`,art.open),`open/${a.key}${ext(art.open)}`);
  if(!art.focus)throw Error('Missing Village Focus art: '+a.key);
  const name=`focus/${a.key}.webp`;
  if(art.focus.endsWith('/immersive.webp')){
   const c=composition.items[a.key],bytes=await readFile(path.join(root,art.focus));
   if(!c||c.subjectLeft<=0||c.subjectLeft>=1||sha(bytes)!==c.encodedSha256)throw Error('Review immersive subject bounds after changing '+a.key);
   await copy(name,art.focus);index.focus[a.key]={image:name,framing:'scene-fit',subjectLeft:c.subjectLeft};
  }else{await lossless(name,art.focus);index.focus[a.key]={image:name,...(a.key==='youtube'?{logo:[.8,.378] as [number,number]}:{})};}
 }
 for(const [key,file] of Object.entries(STYLE.logos as Record<string,string>)){index.logos[key]=`logos/${key}${ext(file)}`;await copy(index.logos[key],file);}
 for(const [key,file] of Object.entries(STYLE.mailParts as Record<string,string>)){index.mail[key]=`mail/${key}${ext(file)}`;await copy(index.mail[key],file);}
 await writeFile(path.join(out,'art.json'),JSON.stringify(index,null,1)+'\n');
 await writeFile(path.join(out,'art.lock.json'),JSON.stringify(Object.fromEntries(Object.entries(lock).sort(([a],[b])=>a.localeCompare(b))),null,1)+'\n');
 return index;
}

/** The committed index, for the build. */
export async function readVillageArt(root:string):Promise<VillageArtIndex>{return JSON.parse(await readFile(path.join(root,VILLAGE_ART,'art.json'),'utf8'));}

/**
 * Every indexed output exists and is locked; where real media is present (PR CI checks out empty stand-ins), the
 * output's bytes and its source's bytes still match the lock, so a changed source cannot ship stale art.
 */
export async function checkVillageArt(root:string){
 const out=path.join(root,VILLAGE_ART),index=await readVillageArt(root),lock:Lock=JSON.parse(await readFile(path.join(out,'art.lock.json'),'utf8'));
 const named=new Set<string>();const walk=(v:unknown)=>{if(typeof v==='string'&&/\.(webp|png)$/.test(v))named.add(v);else if(v&&typeof v==='object')Object.values(v).forEach(walk);};walk(index);
 const problems:string[]=[];
 for(const name of named)if(!lock[name])problems.push('not locked: '+name);
 for(const [name,entry] of Object.entries(lock)){
  if(!named.has(name))problems.push('not indexed: '+name);
  const file=path.join(out,name),source=path.join(root,entry.source);
  try{if((await stat(file)).size&&sha(await readFile(file))!==entry.sha256)problems.push('changed by hand: '+name);}catch{problems.push('missing: '+name);continue;}
  try{if((await stat(source)).size&&sha(await readFile(source))!==entry.sourceSha256)problems.push(`source changed, run node scripts/village-art.ts: ${entry.source}`);}catch{problems.push('source missing: '+entry.source);}
 }
 if(problems.length)throw Error('Village art is out of date:\n'+problems.join('\n'));
 return named.size;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=fileURLToPath(new URL('../',import.meta.url));
 if(process.argv.includes('--check'))console.log(`PASS Village art: ${await checkVillageArt(root)} committed files match their sources`);
 else{await encodeVillageArt(root);console.log(`Encoded Village art into ${VILLAGE_ART} (${await checkVillageArt(root)} files)`);}
}
