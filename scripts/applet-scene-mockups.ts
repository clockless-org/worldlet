/** Capture authored HTML over each registered background, using only fictional samples. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import sharp from 'sharp';
import {buildCorePaperPreview} from './core-paper-preview.ts';
import {buildNotesPreview} from './notes-notebook-preview.ts';
const root=fileURLToPath(new URL('../',import.meta.url));
const requested=process.argv.find(arg=>arg.startsWith('--viewport='))?.slice('--viewport='.length);
if(requested&&!/^\d+x\d+$/.test(requested))throw Error('Viewport must be WIDTHxHEIGHT');
const viewport=requested?requested.split('x').map(Number):[1672,941];
assert.ok(viewport.every(n=>Number.isInteger(n)&&n>=400&&n<=4096),'Use a readable desktop viewport');
const target='resources/styles/builtin/references/registered-scenes/mockups';
const library=JSON.parse(await readFile(path.join(root,'ui/theme-packages/village/scene-library.json'),'utf8'));
const entries=library.entries.filter(e=>e.collection!=='branded');assert.equal(entries.length,40);
const sources=['ui/themes/scene-frame.ts','ui/applets/scene/applet-scene.ts','ui/applets/scene/scene-plane.ts','ui/applets/gmail/page-turn.ts','ui/applets/gmail/focus.css','ui/applets/scene/applet-scene.css','scripts/fixtures/applet-scene-preview/preview.js','scripts/fixtures/applet-scene-preview/samples.js','scripts/fixtures/applet-scene-preview/samples.css','scripts/fixtures/applet-scene-preview/index.html','ui/theme-packages/village/presentation.json','resources/styles/builtin/references/registered-scenes/mockup-materials/manifest.json','ui/applets/apple-notes/open.ts','ui/applets/apple-notes/open.css','scripts/fixtures/notes-notebook/main.ts','scripts/notes-notebook-preview.ts','scripts/core-paper-preview.ts','scripts/fixtures/core-paper-applets/main.ts','ui/applets/gmail/open.ts','ui/applets/gmail/focus.ts','ui/applets/gmail/open.css','ui/applets/apple-reminders/open.ts','ui/applets/apple-reminders/regions.ts','ui/applets/apple-reminders/view-state.ts','ui/applets/apple-reminders/open.css','ui/applets/google-calendar/open.css','ui/applets/google-calendar/grid.ts','ui/applets/home-open.ts'];
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
 assert.ok(Array.isArray(manifest.viewport)&&manifest.viewport.length===2&&manifest.viewport.every(n=>Number.isInteger(n)&&n>=400&&n<=4096),'Recorded capture viewport');
 assert.deepEqual(manifest.images.map(i=>i.id),entries.map(e=>e.id));
 for(const item of manifest.images){const bytes=await readFile(path.join(root,target,item.file));if(bytes.length){assert.equal(digest(bytes),item.sha256);const m=await sharp(bytes).metadata();assert.deepEqual([m.width,m.height],manifest.viewport);}}
 console.log('PASS 40 mockups match their source and output hashes');
}else{
 const url=process.env.SCENE_PREVIEW_URL||'http://127.0.0.1:8787/output/applet-scene-preview/';
 await mkdir(path.join(root,target),{recursive:true});await buildNotesPreview(root);await buildCorePaperPreview(root);
 const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:viewport[0],height:viewport[1]},deviceScaleFactor:1});
 const errors:string[]=[],overflows:string[]=[],images:unknown[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(String(r.status())+' '+r.url())});
 try{for(const item of entries){
  const notes=item.id==='apple-notes',paper=['gmail','google-calendar','apple-reminders'].includes(item.id);
  await page.goto(paper?new URL('/output/core-paper-applets/?applet='+item.id,url).href:notes?new URL('/output/notes-notebook/',url).href:url+'?capture=1&scene='+encodeURIComponent(item.id));
  if(paper)await page.locator(item.id==='gmail'?'.mail-desk-body .mail-message':item.id==='google-calendar'?'.home-calendar-day':'.reminders-task').first().waitFor();else if(notes)await page.locator('.notes-prose p').first().waitFor();else await page.waitForFunction(id=>(window as any).scenePreview?.id===id,item.id);
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));});
  await page.waitForFunction(()=>[...document.querySelectorAll('.applet-scene-foreground')].every(e=>(e as HTMLElement).dataset.ready==='true'));
  const overflow=await page.locator(paper?'.applet-scene-region[data-role=primary]':notes?'.notes-notebook':'.sample-scroll').evaluate(e=>({height:e.scrollHeight-e.clientHeight,width:e.scrollWidth-e.clientWidth}));
  if(overflow.height>2||overflow.width>2)overflows.push(item.id+': '+JSON.stringify(overflow));
  const bytes=await sharp(await page.locator('#viewport').screenshot()).webp({quality:92}).toBuffer();
  const file=item.id+'.webp';await writeFile(path.join(root,target,file),bytes);images.push({id:item.id,title:item.title,file,sha256:digest(bytes)});
 }
 assert.deepEqual(errors,[],'No failed images or browser errors');assert.deepEqual(overflows,[],'Sample content stays inside its registered surface');
 await writeFile(path.join(root,target,'manifest.json'),JSON.stringify({schemaVersion:1,viewport,content:'fictional-design-samples',sources:inputHashes,images},null,2)+'\n');
 console.log('PASS captured 40 scene mockups without overflow or browser errors');
 }finally{await browser.close();}
}
