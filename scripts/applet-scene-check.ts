// The shared Applet scene renderer (ui/applets/scene): the theme's painting and measured regions, laid out at one
// uniform scale, each region wearing the theme's material; the Applet only fills the region. Another scene changes
// where and how Mail is drawn without any change to Mail.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {parseThemePresentation} from '../ui/style/themes/build-theme-contract.ts';
import {launchTestBrowser} from './browser-test.ts';

const village=JSON.parse(await readFile('ui/style/theme-packages/village/presentation.json','utf8'));
assert.ok(parseThemePresentation(village).sceneMaterials?.paper,'Village gives its paper a material');
for(const [bad,why] of [[{paper:{ink:'red'}},'colour'],[{glass:{ink:'#000000'}},'material'],[{paper:{shadow:'#000000'}},'role'],[{paper:{bodyFont:'url(x)'}},'font']] as const)
 assert.throws(()=>parseThemePresentation({...village,sceneMaterials:bad}),/scene materials/,'rejects a bad '+why);

const bundle=await build({entryPoints:['scripts/fixtures/applet-scene-entry.ts'],bundle:true,format:'iife',globalName:'Scene',write:false});
const browser=await launchTestBrowser();
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'}),errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));
 // The fixture serves the package's own picture, as the preview does; the World resolves it through themeAppletScene.
 await page.route('http://scene.test/**',route=>{const path=new URL(route.request().url()).pathname;
  return path==='/'?route.fulfill({contentType:'text/html',body:'<!doctype html>'}):route.fulfill({path:'ui/style/theme-packages/village'+path});});
 await page.goto('http://scene.test/');
 await page.setContent('<main id="shell" style="position:fixed;inset:0"><section id="host" style="position:absolute;inset:0"></section></main>');
 await page.addStyleTag({content:await readFile('ui/applets/scene/applet-scene.css','utf8')+await readFile('ui/applets/gmail/focus.css','utf8')+await readFile('ui/applets/gmail/open.css','utf8')});
 await page.addScriptTag({content:bundle.outputFiles[0].text});
 const mount=(key:string,source:any)=>page.evaluate(([key,source])=>{const S=(window as any).Scene;(window as any).scene?.destroy();
  const scene=(window as any).scene=S.mountAppletScene(document.getElementById('host'),key,{source,shell:document.getElementById('shell')});
  S.renderMailOpen(scene.primary.element,[{id:'a',title:'Review the plan',attention:{state:'task',priority:'high'},record:{title:'Review the plan',from:'Alex <alex@example.com>',date:new Date().toISOString()}}],{connected:true,loaded:true},()=>{});
  return scene.metrics;},[key,source]);
 const expected=(registration:any,width:number,height:number)=>page.evaluate(([r,w,h])=>(window as any).Scene.fitThemeScene(r,w,h),[registration,width,height]);
 const measure=()=>page.evaluate(()=>{const box=(s:string)=>{const r=document.querySelector(s)?.getBoundingClientRect();return r&&{x:r.x,y:r.y,width:r.width,height:r.height};};
  const region=document.querySelector<HTMLElement>('.applet-scene-region[data-role=primary]')!,shell=document.getElementById('shell')!.style;
  return {plate:box('.applet-scene-plate'),region:box('.applet-scene-region[data-role=primary]'),ink:getComputedStyle(region).getPropertyValue('--scene-ink').trim(),
   font:getComputedStyle(region.querySelector('.scene-title')!).fontFamily,shellLeft:shell.getPropertyValue('--applet-scene-primary-left'),shellInk:shell.getPropertyValue('--scene-ink'),letters:region.querySelectorAll('.mail-letter').length};});
 const near=(a:any,b:any,label:string)=>assert.ok(['x','y','width','height'].every(k=>Math.abs(a[k]-b[k])<=1),label+': '+JSON.stringify({a,b}));

 const mail=village.appletScenes.gmail,source={background:mail.background,registration:mail.registration};
 for(const [width,height] of [[1440,900],[1000,900],[1920,1080]]){
  await page.setViewportSize({width,height});await mount('gmail',source);await page.waitForTimeout(50);
  const fit=await expected(mail.registration,width,height),got=await measure();
  near(got.plate,fit.image,'the painting keeps one uniform, uncropped scale at '+width);
  near(got.region,fit.regions[0],'the region is where the theme measured it at '+width);
  assert.equal(got.ink,village.sceneMaterials.paper.ink,'the region wears the paper material');
  assert.match(got.font,/Georgia/,'titles use the material\'s display font');
  assert.ok(Math.abs(parseFloat(got.shellLeft)-fit.regions[0].x)<=1,'the shell learns the region: '+got.shellLeft);
  assert.equal(got.shellInk,village.sceneMaterials.paper.ink,'the shell learns the material for its reader');
  assert.equal(got.letters,1);
 }
 await page.setViewportSize({width:1920,height:1080});
 // A layout while the host is part-way through an entrance zoom must not freeze that visual offset.
 await mount('gmail',source);
 const moving=await page.evaluate(()=>{
  const host=document.getElementById('host')!;host.style.left='24px';host.style.top='12px';
  const a=host.animate([{scale:'.6',transformOrigin:'1700px 950px'},{scale:'1',transformOrigin:'1700px 950px'}],{duration:1000,fill:'both'});
  a.pause();a.currentTime=400;(window as any).scene.layout();
  const shell=document.getElementById('shell')!,metrics=(window as any).scene.metrics;
  const actual={x:parseFloat(shell.style.getPropertyValue('--applet-scene-primary-left')),y:parseFloat(shell.style.getPropertyValue('--applet-scene-primary-top'))};
  a.cancel();host.style.left='0px';host.style.top='0px';
  return {actual,expected:{x:24+metrics.primary.x,y:12+metrics.primary.y}};
 });
 assert.ok(Math.abs(moving.actual.x-moving.expected.x)<=1&&Math.abs(moving.actual.y-moving.expected.y)<=1,'Layout during a zoom keeps shell content aligned: '+JSON.stringify(moving));
 // The same Mail on another painting: only the theme's data changed.
 const browserScene=village.appletScenes.browser;
 await mount('gmail',{background:browserScene.background,registration:browserScene.registration});
 const fit=await expected(browserScene.registration,1920,1080),got=await measure();
 near(got.region,fit.regions[0],'another scene moves Mail to its own region');
 assert.equal(got.ink,village.sceneMaterials.screen.ink,'and dresses it in that region\'s material');assert.equal(got.letters,1);
 // A framed web scene places the actual shell and Fox on the theme's registered coordinates.
 await page.addStyleTag({content:await readFile('ui/style/layout.css','utf8')+await readFile('ui/companion/companion-dialogue.css','utf8')});
 await page.evaluate(()=>{const shell=document.getElementById('shell')!;shell.id='notionWorld';shell.className='native-console fox-first-console';shell.dataset.depth='object';shell.dataset.panelScene='pokemon-showdown';shell.dataset.appletShelf='true';
  shell.insertAdjacentHTML('beforeend','<div class="notion-content" data-template="browser"><div class="browser-viewport"></div></div><div class="notion-hud"><div class="companion-dialogue">A reply beside the game</div></div>');});
 const framedScenes=[...Object.entries(village.appletScenes),...village.appletPresets.map(p=>[p.id,p])] as [string,any][];
 assert.equal(framedScenes.length,140,'All core, generic and branded frames are exercised');
 for(const [key,source] of framedScenes)for(const [width,height] of [[1672,941],[1440,900],[1000,900]]){
  await page.setViewportSize({width,height});
  await page.evaluate(([key,source])=>{const w=window as any;w.scene.destroy();document.getElementById('notionWorld')!.dataset.panelScene=key;w.scene=w.Scene.mountAppletScene(document.getElementById('host'),key,{source,shell:document.getElementById('notionWorld')});},[key,source]);
  await page.waitForFunction(()=>{const shell=document.getElementById('notionWorld')!,hud=shell.querySelector('.notion-hud')!.getBoundingClientRect(),scene=(window as any).scene.metrics;return Math.abs(hud.x+hud.width/2-(scene.companion.x+scene.companion.width/2))<2;});
  const bounds=await page.evaluate(()=>{const box=(s:string)=>{const r=document.querySelector(s)!.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};return {padding:getComputedStyle(document.querySelector('.notion-content')!).padding,viewportRadius:getComputedStyle(document.querySelector('.browser-viewport')!).borderRadius,panel:box('.notion-content'),hud:box('.notion-hud'),replyWidth:parseFloat(getComputedStyle(document.querySelector('.companion-dialogue')!).width),scene:(window as any).scene.metrics};});
  near(bounds.panel,bounds.scene.primary,key+': the live page reaches all four registered edges at '+width);
  assert.ok(bounds.panel.y>=0&&bounds.panel.y+bounds.panel.height<=height,key+': the complete frame stays inside the window');
  assert.equal(bounds.padding,'0px','The native page has no second inset');assert.equal(bounds.viewportRadius,'0px','The painted foreground owns the corners');
  assert.ok(bounds.panel.x+bounds.panel.width<bounds.hud.x,'Fox and the webpage do not overlap at '+width);
  assert.ok(Math.abs(bounds.hud.x+bounds.hud.width/2-(bounds.scene.companion.x+bounds.scene.companion.width/2))<2,'Fox is centered in the painted companion lane');
  assert.ok(bounds.replyWidth<=bounds.hud.width+1,'Replies fit Fox’s lane');
  if(width===1672&&['pokemon-showdown','x'].includes(key)){assert.ok(bounds.panel.width>width*(key==='x'?.68:.64),'The webpage uses about two thirds of the width');assert.ok(bounds.panel.height>height*.79,'The webpage uses about eighty percent of the height, after the shelf');}
 }
 await page.setViewportSize({width:500,height:800});await page.waitForTimeout(50);
 assert.equal(await page.locator('#notionWorld').getAttribute('data-applet-frame'),null,'Compact layout releases the companion lane');
 await page.setViewportSize({width:1672,height:941});await page.waitForTimeout(50);
 await page.evaluate(()=>{(window as any).scene.destroy();const shell=document.getElementById('notionWorld')!;delete shell.dataset.depth;delete shell.dataset.panelScene;delete shell.dataset.appletShelf;shell.className='';shell.querySelector('.notion-hud')!.remove();shell.querySelector('.notion-content')!.remove();shell.id='shell';});
 assert.equal(await page.locator('#shell').getAttribute('data-applet-frame'),null,'Destroy releases frame state');
 // No painting: one sheet of paper, no picture.
 const plain=await mount('unknown-applet',undefined);
 assert.equal(plain.painted,false);assert.equal(await page.locator('.applet-scene-plate').count(),0);assert.equal((await measure()).letters,1);
 await page.evaluate(()=>(window as any).scene.destroy());
 assert.equal(await page.evaluate(()=>document.getElementById('shell')!.style.cssText),'position: fixed; inset: 0px;','destroy leaves the shell as it was');
 // The HTML foreground uses only mask alpha, never the extractor's repaint, and cannot intercept controls.
 await page.evaluate(()=>{
  const make=(mask:boolean)=>{const c=document.createElement('canvas');c.width=100;c.height=100;const g=c.getContext('2d')!;g.fillStyle=mask?'#ff0000':'#2468ac';g.fillRect(0,0,100,100);if(mask)g.clearRect(10,10,80,80);return c.toDataURL();};
  const w=window as any,host=document.getElementById('host')!;host.innerHTML='<button id="edge-control" style="position:absolute;left:20px;top:30px">Press</button>';
  host.querySelector('button')!.addEventListener('click',e=>(e.target as HTMLElement).textContent='Pressed');
  w.frame=w.Scene.mountSceneFrame(host,make(false),{webFrame:{mask:make(true),source:[0,0,1,1],target:[0,0,1,1]}});
  w.frame.layout({x:20,y:30,width:400,height:300});
 });
 await page.locator('.applet-scene-foreground[data-ready=true]').waitFor();
 const pixels=await page.evaluate(()=>{const c=document.querySelector<HTMLCanvasElement>('.applet-scene-foreground')!,g=c.getContext('2d')!,d=devicePixelRatio;const at=(x:number,y:number)=>[...g.getImageData(x*d,y*d,1,1).data];return {rim:at(25,35),opening:at(200,150),outside:at(5,5)};});
 assert.deepEqual(pixels.rim,[36,104,172,255],'Foreground samples original background RGB');
 assert.equal(pixels.opening[3],0,'Opening leaves live HTML visible');assert.equal(pixels.outside[3],0,'Outside frame remains transparent');
 await page.locator('#edge-control').click();assert.equal(await page.locator('#edge-control').innerText(),'Pressed','Foreground passes clicks to edge controls');
 await page.evaluate(()=>(window as any).frame.layout({x:20,y:30,width:400,height:300},false));
 assert.equal(await page.locator('.applet-scene-foreground').isVisible(),false,'Compact scene can suppress its foreground');
 await page.evaluate(()=>(window as any).frame.destroy());assert.equal(await page.locator('.applet-scene-foreground').count(),0,'No foreground left after teardown');
 assert.deepEqual(errors,[]);
 console.log('PASS Applet scene: theme painting at one scale, measured regions, theme materials, plain fallback, Mail unchanged across scenes.');
}finally{await browser.close();}
