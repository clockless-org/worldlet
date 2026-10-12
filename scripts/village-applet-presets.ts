import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {importBuildTheme} from './build-theme-source.ts';
import type {ThemeAppletPreset} from '../ui/themes/build-theme-contract.ts';

const SOURCE='resources/styles/builtin/presets/personal-scenes';
const PACKAGE='ui/theme-packages/village';
const SETTINGS={icon:'768px-webp-q92-alpha100',background:'original-size-webp-q90'} as const;
type Catalog={presets:{id:string;name:string;use:string;category:string;icon:string;background:string}[]};
type Lock=Record<string,{source:string;sourceSha256:string;sha256:string;settings:string}>;
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const json=async(root:string,file:string)=>JSON.parse(await readFile(path.join(root,file),'utf8'));
const write=async(root:string,file:string,value:unknown)=>writeFile(path.join(root,file),JSON.stringify(value,null,2)+'\n');
async function definitions(root:string):Promise<ThemeAppletPreset[]>{
 const catalog:Catalog=await json(root,SOURCE+'/catalog.json');
 return catalog.presets.map(p=>({id:p.id,title:p.name,description:p.use,category:p.category,
  icon:`assets/applet-presets/${p.id}/icon.webp`,background:`assets/applet-presets/${p.id}/background.webp`}));
}
/** Encode source PNGs into portable SIM assets, then refresh the validated package's source lock. */
export async function encodeVillageAppletPresets(root:string){
 const catalog:Catalog=await json(root,SOURCE+'/catalog.json'),presets=await definitions(root),lock:Lock={};
 for(const [i,preset] of catalog.presets.entries())for(const kind of ['icon','background'] as const){
  const source=SOURCE+'/'+preset[kind],bytes=await readFile(path.join(root,source));
  let image=sharp(bytes);if(kind==='icon')image=image.resize({width:768,withoutEnlargement:true});
  const encoded=await image.webp({quality:kind==='icon'?92:90,alphaQuality:100}).toBuffer(),target=presets[i][kind];
  await mkdir(path.dirname(path.join(root,PACKAGE,target)),{recursive:true});await writeFile(path.join(root,PACKAGE,target),encoded);
  lock[target]={source,sourceSha256:sha(bytes),sha256:sha(encoded),settings:SETTINGS[kind]};
 }
 await write(root,PACKAGE+'/assets/applet-presets/art.lock.json',lock);
 const presentation=await json(root,PACKAGE+'/presentation.json');presentation.appletPresets=presets;
 await write(root,PACKAGE+'/presentation.json',presentation);
 const manifest=await json(root,PACKAGE+'/theme.json');manifest.updatedAt=new Date().toISOString().replace(/\.\d{3}Z$/,'Z');
 await write(root,PACKAGE+'/theme.json',manifest);
 await importBuildTheme(path.join(root,PACKAGE),root);
 await checkVillageAppletPresets(root);
}
/** CI uses empty media stand-ins. Check declarations/existence there, and both source/output hashes with real media. */
export async function checkVillageAppletPresets(root:string){
 const expected=await definitions(root),presentation=await json(root,PACKAGE+'/presentation.json');
 assert.deepEqual(presentation.appletPresets,expected,'Village SIM presets must match the authored catalog');
 const catalog:Catalog=await json(root,SOURCE+'/catalog.json'),lock:Lock=await json(root,PACKAGE+'/assets/applet-presets/art.lock.json');
 assert.deepEqual(Object.keys(lock).sort(),expected.flatMap(p=>[p.icon,p.background]).sort(),'lock covers exactly the declared pictures');
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
