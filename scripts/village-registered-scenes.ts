import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {importBuildTheme} from './build-theme-source.ts';
import type {ThemeAppletScene,ThemeSceneRegistration} from '../ui/themes/build-theme-contract.ts';

const SOURCE='resources/styles/builtin/references/registered-scenes',PACKAGE='ui/theme-packages/village';
type Source={id:string;title:string;source:string;regions:ThemeSceneRegistration['regions'];companion:ThemeSceneRegistration['companion'];prompt:string};
type Lock=Record<string,{source:string;sourceSha256:string;sha256:string;imageSize:[number,number];settings:string}>;
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const json=async(root:string,file:string)=>JSON.parse(await readFile(path.join(root,file),'utf8'));
const write=async(root:string,file:string,value:unknown)=>writeFile(path.join(root,file),JSON.stringify(value,null,2)+'\n');
function scene(item:Source,entry:Lock[string]):ThemeAppletScene{
 return {background:`assets/applet-scenes/${item.id}/background.webp`,registration:{imageSize:entry.imageSize,sha256:entry.sha256,regions:item.regions,companion:item.companion}};
}
export async function encodeVillageRegisteredScenes(root:string){
 const {applets}:{applets:Source[]}=await json(root,SOURCE+'/catalog.json'),lock:Lock={},scenes:Record<string,ThemeAppletScene>={};
 for(const item of applets){
  const source=SOURCE+'/'+item.source,input=await readFile(path.join(root,source)),result=await sharp(input).webp({quality:90}).toBuffer({resolveWithObject:true});
  const target=`assets/applet-scenes/${item.id}/background.webp`,output=path.join(root,PACKAGE,target);
  await mkdir(path.dirname(output),{recursive:true});await writeFile(output,result.data);
  lock[target]={source,sourceSha256:sha(input),sha256:sha(result.data),imageSize:[result.info.width,result.info.height],settings:'original-size-webp-q90'};
  scenes[item.id]=scene(item,lock[target]);
 }
 await write(root,PACKAGE+'/assets/applet-scenes/art.lock.json',lock);
 const presentation=await json(root,PACKAGE+'/presentation.json');presentation.appletScenes=scenes;
 await write(root,PACKAGE+'/presentation.json',presentation);
 const manifest=await json(root,PACKAGE+'/theme.json');manifest.updatedAt=new Date().toISOString().replace(/\.\d{3}Z$/,'Z');await write(root,PACKAGE+'/theme.json',manifest);
 await importBuildTheme(path.join(root,PACKAGE),root);await checkVillageRegisteredScenes(root);
}
export async function checkVillageRegisteredScenes(root:string){
 const {applets}:{applets:Source[]}=await json(root,SOURCE+'/catalog.json'),lock:Lock=await json(root,PACKAGE+'/assets/applet-scenes/art.lock.json'),presentation=await json(root,PACKAGE+'/presentation.json');
 const expected:Record<string,ThemeAppletScene>={};
 for(const item of applets){
  const target=`assets/applet-scenes/${item.id}/background.webp`,entry=lock[target];assert.ok(entry,'scene output is locked');
  expected[item.id]=scene(item,entry);assert.equal(entry.source,SOURCE+'/'+item.source);
  const input=await readFile(path.join(root,entry.source)),output=await readFile(path.join(root,PACKAGE,target));
  if(input.length)assert.equal(sha(input),entry.sourceSha256,'Scene source changed: '+item.id);
  if(output.length)assert.equal(sha(output),entry.sha256,'Scene output changed: '+item.id);
 }
 assert.deepEqual(presentation.appletScenes,expected);assert.equal(Object.keys(lock).length,applets.length);
 console.log(`PASS ${applets.length} App-bound scene registrations match their source images`);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=fileURLToPath(new URL('../',import.meta.url));
 if(process.argv.includes('--check'))await checkVillageRegisteredScenes(root);else await encodeVillageRegisteredScenes(root);
}
