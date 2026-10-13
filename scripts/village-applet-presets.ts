import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {checkSceneFrameCoverage} from './scene-frame-coverage.ts';
import {importBuildTheme} from './build-theme-source.ts';
import type {ThemeAppletPreset,ThemeSceneRegistration} from '../ui/themes/build-theme-contract.ts';

const SOURCE='resources/styles/builtin/presets/personal-scenes';
const PACKAGE='ui/theme-packages/village';
const SETTINGS={icon:'768px-webp-q92-alpha100',background:'original-size-webp-q90',frame:'original-alpha'} as const;
type Catalog={presets:{id:string;name:string;use:string;category:string;icon:string;background:string;frameSource?:string;composition?:Omit<ThemeSceneRegistration,'sha256'>}[]};
type Lock=Record<string,{source:string;sourceSha256:string;sha256:string;settings:string}>;
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const json=async(root:string,file:string)=>JSON.parse(await readFile(path.join(root,file),'utf8'));
const write=async(root:string,file:string,value:unknown)=>writeFile(path.join(root,file),JSON.stringify(value,null,2)+'\n');
async function definitions(root:string,lock:Lock):Promise<ThemeAppletPreset[]>{
 const catalog:Catalog=await json(root,SOURCE+'/catalog.json');
 return catalog.presets.map(p=>({id:p.id,title:p.name,description:p.use,category:p.category,
  icon:`assets/applet-presets/${p.id}/icon.webp`,background:`assets/applet-presets/${p.id}/background.webp`,...(p.composition?{registration:{...p.composition,sha256:lock[`assets/applet-presets/${p.id}/background.webp`].sha256}}:{})}));
}
/** Encode source PNGs into portable SIM assets, then refresh the validated package's source lock. */
export async function encodeVillageAppletPresets(root:string){
 const catalog:Catalog=await json(root,SOURCE+'/catalog.json'),lock:Lock={};
 const sourceLock=await json(root,SOURCE+'/assets.lock.json');
 for(const preset of catalog.presets)for(const file of [preset.icon,preset.background,...preset.frameSource?[preset.frameSource]:[]]){
  const bytes=await readFile(path.join(root,SOURCE,file)),meta=await sharp(bytes).metadata(),hash=sha(bytes);
  sourceLock.assets[file]={...sourceLock.assets[file]?.sha256===hash?sourceLock.assets[file]:{},sha256:hash,bytes:bytes.length,width:meta.width,height:meta.height,hasAlpha:meta.hasAlpha};
 }
 await write(root,SOURCE+'/assets.lock.json',sourceLock);
 for(const [i,preset] of catalog.presets.entries())for(const kind of ['icon','background'] as const){
  const source=SOURCE+'/'+preset[kind],bytes=await readFile(path.join(root,source));
  let image=sharp(bytes);if(kind==='icon')image=image.resize({width:768,withoutEnlargement:true});
  const encoded=await image.webp({quality:kind==='icon'?92:90,alphaQuality:100}).toBuffer(),target=`assets/applet-presets/${preset.id}/${kind}.webp`;
  await mkdir(path.dirname(path.join(root,PACKAGE,target)),{recursive:true});await writeFile(path.join(root,PACKAGE,target),encoded);
  lock[target]={source,sourceSha256:sha(bytes),sha256:sha(encoded),settings:SETTINGS[kind]};
 }
 for(const preset of catalog.presets){
  const frame=preset.composition?.webFrame;
  if(!frame)continue;
  assert.ok(preset.frameSource,'Registered frames need an authored alpha source');
  const source=SOURCE+'/'+preset.frameSource,bytes=await readFile(path.join(root,source));
  await writeFile(path.join(root,PACKAGE,frame.mask),bytes);
  lock[frame.mask]={source,sourceSha256:sha(bytes),sha256:sha(bytes),settings:SETTINGS.frame};
 }
 await write(root,PACKAGE+'/assets/applet-presets/art.lock.json',lock);
 const presentation=await json(root,PACKAGE+'/presentation.json');presentation.appletPresets=await definitions(root,lock);
 await write(root,PACKAGE+'/presentation.json',presentation);
 const manifest=await json(root,PACKAGE+'/theme.json');manifest.updatedAt=new Date().toISOString().replace(/\.\d{3}Z$/,'Z');
 await write(root,PACKAGE+'/theme.json',manifest);
 await importBuildTheme(path.join(root,PACKAGE),root);
 await checkVillageAppletPresets(root);
}
/** CI uses empty media stand-ins. Check declarations/existence there, and both source/output hashes with real media. */
export async function checkVillageAppletPresets(root:string){
 const lock:Lock=await json(root,PACKAGE+'/assets/applet-presets/art.lock.json'),expected=await definitions(root,lock),presentation=await json(root,PACKAGE+'/presentation.json');
 assert.deepEqual(presentation.appletPresets,expected,'Village SIM presets must match the authored catalog');
 const catalog:Catalog=await json(root,SOURCE+'/catalog.json');
 assert.deepEqual(Object.keys(lock).sort(),expected.flatMap(p=>[p.icon,p.background,...p.registration?.webFrame?[p.registration.webFrame.mask]:[]]).sort(),'lock covers exactly the declared pictures');
 for(const preset of catalog.presets){
  const frame=preset.composition?.webFrame;
  if(!frame)continue;
  assert.ok(preset.frameSource,'Registered frames need an authored alpha source');
  const entry=lock[frame.mask],source=SOURCE+'/'+preset.frameSource;
  assert.equal(entry.source,source);assert.equal(entry.settings,SETTINGS.frame);
  const input=await readFile(path.join(root,source)),output=await readFile(path.join(root,PACKAGE,frame.mask));
  if(input.length)assert.equal(sha(input),entry.sourceSha256,'Frame source changed: '+preset.id);
  await checkSceneFrameCoverage(output,expected.find(p=>p.id===preset.id)!.registration!,preset.id);
  if(output.length){assert.equal(sha(output),entry.sha256,'Frame output changed: '+preset.id);assert.equal((await sharp(output).metadata()).hasAlpha,true);}
 }
 for(const [i,preset] of expected.entries())for(const kind of ['icon','background'] as const){
  const entry=lock[preset[kind]],source=SOURCE+'/'+catalog.presets[i][kind];
  assert.equal(entry.source,source);assert.equal(entry.settings,SETTINGS[kind]);
  const input=await readFile(path.join(root,source)),output=await readFile(path.join(root,PACKAGE,preset[kind]));
  if(input.length)assert.equal(sha(input),entry.sourceSha256,'Source changed; run node scripts/village-applet-presets.ts');
  if(output.length)assert.equal(sha(output),entry.sha256,'Preset changed; run node scripts/village-applet-presets.ts');
 }
 console.log(`PASS Village SIM: ${expected.length} Applet presets, ${Object.keys(lock).length} pictures match their sources`);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=fileURLToPath(new URL('../',import.meta.url));
 if(process.argv.includes('--check'))await checkVillageAppletPresets(root);else await encodeVillageAppletPresets(root);
}
