import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {importBuildTheme} from './build-theme-source.ts';
import type {ThemeAppletScene,ThemeSceneRegistration} from '../ui/themes/build-theme-contract.ts';

const SOURCE='resources/styles/builtin/references/registered-scenes',PACKAGE='ui/theme-packages/village';
type Source={frameSource?:string;webFrame?:ThemeSceneRegistration['webFrame'];webEdge?:ThemeSceneRegistration['webEdge'];id:string;title:string;source:string;iconSource?:string;regions:ThemeSceneRegistration['regions'];companion:ThemeSceneRegistration['companion'];prompt:string};
type Lock=Record<string,{source:string;sourceSha256:string;sha256:string;imageSize:[number,number];settings:string}>;
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const json=async(root:string,file:string)=>JSON.parse(await readFile(path.join(root,file),'utf8'));
const write=async(root:string,file:string,value:unknown)=>writeFile(path.join(root,file),JSON.stringify(value,null,2)+'\n');
function scene(item:Source,entry:Lock[string]):ThemeAppletScene{
 return {background:`assets/applet-scenes/${item.id}/background.webp`,registration:{imageSize:entry.imageSize,sha256:entry.sha256,regions:item.regions,companion:item.companion,...item.webEdge?{webEdge:item.webEdge}:{},...item.webFrame?{webFrame:item.webFrame}:{}}};
}
export async function encodeVillageRegisteredScenes(root:string){
 const catalog:{applets:Source[];brands?:Source[]}=await json(root,SOURCE+'/catalog.json');
 const applets=[...catalog.applets,...catalog.brands??[]],lock:Lock={},iconLock:Lock={},scenes:Record<string,ThemeAppletScene>={};
 const presentation=await json(root,PACKAGE+'/presentation.json');
 for(const item of applets){
  const source=SOURCE+'/'+item.source,input=await readFile(path.join(root,source)),result=await sharp(input).webp({quality:90}).toBuffer({resolveWithObject:true});
  const target=`assets/applet-scenes/${item.id}/background.webp`,output=path.join(root,PACKAGE,target);
  await mkdir(path.dirname(output),{recursive:true});await writeFile(output,result.data);
  lock[target]={source,sourceSha256:sha(input),sha256:sha(result.data),imageSize:[result.info.width,result.info.height],settings:'original-size-webp-q90'};
  scenes[item.id]=scene(item,lock[target]);
  if(item.frameSource&&item.webFrame){
   const source=SOURCE+'/'+item.frameSource,input=await readFile(path.join(root,source));
   await writeFile(path.join(root,PACKAGE,item.webFrame.mask),input);
  }
  if(item.iconSource){
   const source=SOURCE+'/'+item.iconSource,input=await readFile(path.join(root,source));
   const result=await sharp(input).resize(768,768,{fit:'contain',background:'#00000000'}).webp({lossless:true}).toBuffer({resolveWithObject:true});
   const target=`assets/applet-scenes/${item.id}/icon.webp`;
   await writeFile(path.join(root,PACKAGE,target),result.data);
   iconLock[target]={source,sourceSha256:sha(input),sha256:sha(result.data),imageSize:[768,768],settings:'contain-768-lossless-webp'};
   presentation.icons[item.id]=target;
  }
 }
 await write(root,PACKAGE+'/assets/applet-scenes/art.lock.json',lock);
 await write(root,PACKAGE+'/assets/applet-scenes/icons.lock.json',iconLock);
 presentation.appletScenes=scenes;
 await write(root,PACKAGE+'/presentation.json',presentation);
 const manifest=await json(root,PACKAGE+'/theme.json');manifest.updatedAt=new Date().toISOString().replace(/\.\d{3}Z$/,'Z');await write(root,PACKAGE+'/theme.json',manifest);
 await importBuildTheme(path.join(root,PACKAGE),root);await checkVillageRegisteredScenes(root);
}
export async function checkVillageRegisteredScenes(root:string){
 const catalog:{applets:Source[];brands?:Source[]}=await json(root,SOURCE+'/catalog.json');
 const applets=[...catalog.applets,...catalog.brands??[]],lock:Lock=await json(root,PACKAGE+'/assets/applet-scenes/art.lock.json'),presentation=await json(root,PACKAGE+'/presentation.json');
 const expected:Record<string,ThemeAppletScene>={};
 const iconLock:Lock=await json(root,PACKAGE+'/assets/applet-scenes/icons.lock.json');
 for(const item of applets){
  const target=`assets/applet-scenes/${item.id}/background.webp`,entry=lock[target];assert.ok(entry,'scene output is locked');
  expected[item.id]=scene(item,entry);assert.equal(entry.source,SOURCE+'/'+item.source);
  const input=await readFile(path.join(root,entry.source)),output=await readFile(path.join(root,PACKAGE,target));
  if(input.length)assert.equal(sha(input),entry.sourceSha256,'Scene source changed: '+item.id);
  if(output.length)assert.equal(sha(output),entry.sha256,'Scene output changed: '+item.id);
  if(item.frameSource&&item.webFrame){
   const input=await readFile(path.join(root,SOURCE,item.frameSource)),output=await readFile(path.join(root,PACKAGE,item.webFrame.mask));
   assert.equal(sha(input),sha(output),'Frame alpha source must match its bundled asset');
   if(output.length)assert.equal((await sharp(output).metadata()).hasAlpha,true,'Frame must preserve transparency');
  }
  assert.ok(presentation.icons[item.id],'Every scene has a matching icon');
  if(item.iconSource){
   const target=`assets/applet-scenes/${item.id}/icon.webp`,entry=iconLock[target];assert.ok(entry);
   assert.equal(presentation.icons[item.id],target);assert.equal(entry.source,SOURCE+'/'+item.iconSource);
   // Static CI uses empty media stand-ins, as it does for background files above.
   const source=await readFile(path.join(root,entry.source));if(source.length)assert.equal(sha(source),entry.sourceSha256);
   const bytes=await readFile(path.join(root,PACKAGE,target));
   if(bytes.length){
    assert.equal(sha(bytes),entry.sha256);
    const meta=await sharp(bytes).metadata();assert.equal(meta.hasAlpha,true,'Icon preserves transparency');
    assert.deepEqual([meta.width,meta.height],entry.imageSize);
   }
  }
 }
 assert.deepEqual(presentation.appletScenes,expected);assert.equal(Object.keys(lock).length,applets.length);
 assert.equal(Object.keys(iconLock).length,applets.filter(a=>a.iconSource).length);
 console.log(`PASS ${applets.length} App-bound scene registrations match their source images`);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=fileURLToPath(new URL('../',import.meta.url));
 if(process.argv.includes('--check'))await checkVillageRegisteredScenes(root);else await encodeVillageRegisteredScenes(root);
}
