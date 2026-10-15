// Static theme font declarations must reach real browser text without preview-only FontFace injection.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {launchTestBrowser} from './browser-test.ts';
const presentation={tokens:{bodyFont:'Package Body, monospace',displayFont:"'Package Display', serif",bodySize:16,titleSize:24,ink:'#203b30',paper:'#fff8e8',accent:'#315f48',focus:'#386747',radius:4,controlHeight:36},fonts:[
 {file:'assets/fonts/title.woff2',license:'assets/LICENSE.txt',family:'Package Display'},
 {file:'assets/fonts/body.woff2',license:'assets/LICENSE.txt',family:'Package Body'},
 {file:'assets/fonts/ImplicitFace.woff2',license:'assets/LICENSE.txt'},
]};
const pkg={manifest:{contractVersion:3,id:'village',title:'Font fixture',assets:'assets',presentation:'presentation.json'},presentation,data:{}};
const bundle=await build({stdin:{contents:"export {activeBuildTheme,prepareBuildThemeFonts,themeSceneMaterial} from './ui/themes/build-theme.ts';",resolveDir:process.cwd(),loader:'ts'},bundle:true,format:'iife',globalName:'Theme',write:false,plugins:[{name:'font-fixture',setup(b){
 b.onLoad({filter:/ui\/theme-packages\/index\.ts$/},()=>({contents:'export const THEME_PACKAGES='+JSON.stringify([pkg]),loader:'ts'}));
}}]});
const font=await readFile('resources/common/fonts/InterVariable.woff2'),css=await readFile('ui/themes/theme-surfaces.css','utf8');
const browser=await launchTestBrowser();
try{
 for(const withEnvironment of [false,true]){
  const page=await browser.newPage({viewport:{width:1500,height:844}}),requests=new Map<string,number>(),errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('http://theme-fonts.test/**',async route=>{
   const pathname=new URL(route.request().url()).pathname;
   if(pathname==='/')return route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><title>Theme font check</title><h1 class="ui-title">The reading room</h1><p id="body">MMMMiiii</p>'});
   requests.set(pathname,(requests.get(pathname)||0)+1);
   return route.fulfill({contentType:'font/woff2',body:font});
  });
  await page.goto('http://theme-fonts.test/');await page.addStyleTag({content:css});
  if(withEnvironment)await page.evaluate(()=>{(window as any).__WORLDLET_ENV_ASSETS__={surfaces:{tokens:{},fonts:{},skin:{},sounds:{events:{},ambient:{}},attention:[],transitions:{area:'shared',room:'shared',ms:0}}};});
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  // Only observe the automatic runtime load before invoking the explicit preparation API.
  await page.waitForFunction(()=>['Package Display','Package Body','ImplicitFace'].every(family=>[...document.fonts].some(face=>face.family.replace(/^['"]|['"]$/g,'')===family&&face.status==='loaded'))).catch(async error=>{console.error({faces:await page.evaluate(()=>[...document.fonts].map(f=>({family:f.family,status:f.status}))),requests:[...requests],errors});throw error;});
  await page.evaluate(async()=>{const t=(window as any).Theme;await Promise.all([t.prepareBuildThemeFonts(),t.prepareBuildThemeFonts()]);document.getElementById('body')!.style.fontFamily=t.themeSceneMaterial('paper').bodyFont;});
  const result=await page.evaluate(()=>{
   const c=document.createElement('canvas'),ctx=c.getContext('2d')!;ctx.font='30px monospace';const fallback=ctx.measureText('MMMMiiii').width;ctx.font='30px "Package Body", monospace';
   return {faces:[...document.fonts].map(f=>({family:f.family,status:f.status})),loadedWidth:ctx.measureText('MMMMiiii').width,fallback,titleFont:getComputedStyle(document.querySelector('.ui-title')!).fontFamily,bodyFont:getComputedStyle(document.getElementById('body')!).fontFamily,roles:document.documentElement.dataset.themeFonts};
  });
  assert.equal(result.faces.length,3,'duplicate requests do not register duplicate faces');assert.ok(result.faces.every(face=>face.status==='loaded'));
  assert.ok(Math.abs(result.loadedWidth-result.fallback)>1,'text uses bundled font bytes rather than a named fallback');
  assert.match(result.bodyFont,/Package Body/);assert.equal(requests.size,3);assert.ok([...requests.values()].every(n=>n===1),'one request per file');
  if(withEnvironment){assert.match(result.titleFont,/Package Display/);assert.equal(result.roles,'display label','fonts-only packages style the shared HUD');}
  assert.deepEqual(errors,[]);
  // A font load failure must leave the previous fallback usable and must not poison later preparation.
  const retry=await page.evaluate(async()=>{
   const w=window as any,RealFontFace=w.FontFace,t=w.Theme,fixture={...t.activeBuildTheme(),package:{...t.activeBuildTheme().package,presentation:{...t.activeBuildTheme().package.presentation,fonts:[{file:'assets/fonts/retry.woff2',license:'assets/LICENSE.txt',family:'Retry Face'}]}}};
   w.FontFace=class extends RealFontFace {load(){return Promise.reject(new Error('Fixture font failure'));}};
   let rejected=false;try{await t.prepareBuildThemeFonts(fixture);}catch{rejected=true;}finally{w.FontFace=RealFontFace;}
   await t.prepareBuildThemeFonts(fixture);return {rejected,loaded:[...document.fonts].filter(f=>f.family.replace(/^['"]|['"]$/g,'')==='Retry Face'&&f.status==='loaded').length};
  });
  assert.equal(retry.rejected,true);assert.equal(retry.loaded,1,'failed faces can be retried');
  await page.close();
 }
 console.log('Theme fonts: automatic loading with/without World assets, aliases, inferred family, HUD roles, deduplication and retry pass at 1500 × 844.');
}finally{await browser.close();}
