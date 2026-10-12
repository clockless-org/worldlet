/** Capture authored HTML over each registered background, using only fictional samples. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import sharp from 'sharp';
const root=fileURLToPath(new URL('../',import.meta.url));
const target='resources/styles/builtin/references/registered-scenes/mockups';
const library=JSON.parse(await readFile(path.join(root,'ui/theme-packages/village/scene-library.json'),'utf8'));
const entries=library.entries.filter(e=>e.collection!=='branded');assert.equal(entries.length,40);
const sources=['scripts/fixtures/applet-scene-preview/preview.js','scripts/fixtures/applet-scene-preview/samples.js','scripts/fixtures/applet-scene-preview/samples.css','scripts/fixtures/applet-scene-preview/index.html','ui/theme-packages/village/presentation.json','resources/styles/builtin/references/registered-scenes/mockup-materials/manifest.json'];
const digest=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const inputHashes=Object.fromEntries(await Promise.all(sources.map(async file=>[file,digest(await readFile(path.join(root,file)))])));
const materialDirectory='resources/styles/builtin/references/registered-scenes/mockup-materials';
const materials=JSON.parse(await readFile(path.join(root,materialDirectory,'manifest.json'),'utf8'));
for(const asset of materials.assets){
 for(const [file,hash] of [[asset.source,asset.sourceSha256],[asset.file,asset.sha256]]){
  const bytes=await readFile(path.join(root,materialDirectory,file));
  // Static CI intentionally replaces binary media with empty files.
  if(bytes.length){assert.equal(digest(bytes),hash,'Material differs from its provenance manifest: '+file);if(asset.transparent)assert.equal((await sharp(bytes).metadata()).hasAlpha,true);}
 }
}
if(process.argv.includes('--check')){
 const manifest=JSON.parse(await readFile(path.join(root,target,'manifest.json'),'utf8'));
 assert.deepEqual(manifest.sources,inputHashes,'Rebuild mockups after changing their source');
 assert.deepEqual(manifest.images.map(i=>i.id),entries.map(e=>e.id));
 for(const item of manifest.images){const bytes=await readFile(path.join(root,target,item.file));if(bytes.length){assert.equal(digest(bytes),item.sha256);const m=await sharp(bytes).metadata();assert.deepEqual([m.width,m.height],[1672,941]);}}
 console.log('PASS 40 mockups match their source and output hashes');
}else{
 const url=process.env.SCENE_PREVIEW_URL||'http://127.0.0.1:8787/output/applet-scene-preview/';
 await mkdir(path.join(root,target),{recursive:true});
 const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1672,height:941},deviceScaleFactor:1});
 const errors:string[]=[],overflows:string[]=[],images:unknown[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(String(r.status())+' '+r.url())});
 try{for(const item of entries){
  await page.goto(url+'?capture=1&scene='+encodeURIComponent(item.id));
  await page.waitForFunction(id=>(window as any).scenePreview?.id===id,item.id);
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));});
  const overflow=await page.locator('.sample-scroll').evaluate(e=>({height:e.scrollHeight-e.clientHeight,width:e.scrollWidth-e.clientWidth}));
  if(overflow.height>2||overflow.width>2)overflows.push(item.id+': '+JSON.stringify(overflow));
  const bytes=await sharp(await page.locator('#viewport').screenshot()).webp({quality:92}).toBuffer();
  const file=item.id+'.webp';await writeFile(path.join(root,target,file),bytes);images.push({id:item.id,title:item.title,file,sha256:digest(bytes)});
 }
 assert.deepEqual(errors,[],'No failed images or browser errors');assert.deepEqual(overflows,[],'Sample content stays inside its registered surface');
 await writeFile(path.join(root,target,'manifest.json'),JSON.stringify({schemaVersion:1,viewport:[1672,941],content:'fictional-design-samples',sources:inputHashes,images},null,2)+'\n');
 console.log('PASS captured 40 scene mockups without overflow or browser errors');
 }finally{await browser.close();}
}
