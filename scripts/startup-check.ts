import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {build} from 'esbuild';

// Production startup HTML/CSS/bundle, with the world bundle held at the boot boundary.
const root=path.resolve('dist/WorldletWeb');
// The welcome celebration alone, served same-origin for the zero-size window pass below.
const celebration=(await build({stdin:{contents:"import {celebrateWorld} from './ui/shell/world-celebration.ts';Object.assign(window,{celebrateWorld});",resolveDir:path.resolve('.'),loader:'ts'},bundle:true,format:'iife',write:false})).outputFiles[0].text;
const server=createServer(async(req,res)=>{
 const name=new URL(req.url,'http://localhost').pathname;
 if(name==='/worldlet.js'){res.setHeader('Content-Type','text/javascript');res.end('');return;}
 if(name==='/celebration.js'){res.setHeader('Content-Type','text/javascript');res.end(celebration);return;}
 try{
  const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
  if(!file.startsWith(root+path.sep))throw Error('Outside fixture');
  res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png'} as Record<string,string>)[path.extname(file)]||'application/octet-stream');
  res.end(await readFile(file));
 }catch{res.writeHead(404);res.end();}
});
await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}/`;
const browser=await chromium.launch();
try{
 for(const viewport of [{width:1440,height:900},{width:360,height:640}]){
  const page=await browser.newPage({viewport,reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto(url);assert.equal(await page.title(),'Worldlet');assert.equal(page.url(),url);
  await page.locator('.startup-fox').evaluate((img:HTMLImageElement)=>img.decode());
  assert.equal(await page.locator('#worldStartupText').count(),0);
  assert.equal(await page.locator('.startup-brand').innerText(),'Worldlet');
  assert.equal(await page.locator('.startup-brand').getAttribute('aria-label'),'Worldlet');
  assert.equal(await page.locator('.startup-brand img').getAttribute('alt'),'');
  assert.equal(await page.locator('.startup-fox').evaluate(el=>getComputedStyle(el).animationName),'none');
  await page.locator('.startup-walk').waitFor();
  assert.equal(await page.locator('.startup-brand').isVisible(),true);
  await page.locator('.startup-brand img').evaluate((img:HTMLImageElement)=>img.decode());
  const brand=await page.locator('.startup-brand').boundingBox();
  assert.ok(Math.abs(brand.x+brand.width/2-viewport.width/2)<2,'Logo stays horizontally centered');
  assert.ok(brand.y>viewport.height*.7&&brand.y+brand.height<=viewport.height-24,'Logo sits in the lower center with a safe bottom margin');
  assert.equal(await page.locator('.startup-status').isVisible(),false);
  const scene=await page.locator('.startup-scene').boundingBox();
  assert.ok(Math.abs(scene.y+scene.height/2-viewport.height/2)<2);
  assert.equal(await page.locator('#worldStartupRetry').isVisible(),false);
  await page.screenshot({path:`/tmp/worldlet-startup-${viewport.width}.png`});
  await page.evaluate(()=>document.dispatchEvent(new CustomEvent('worldlet:startup-phase',{detail:'scene'})));
  assert.equal(await page.locator('#worldStartup').getAttribute('data-phase'),'scene');
  assert.equal(await page.locator('#worldStartupPhase').innerText(),'Bringing your world to life');
  await page.evaluate(()=>document.dispatchEvent(new Event('worldlet:world-error')));
  assert.equal(await page.locator('#worldStartupRetry').isVisible(),true);
  assert.equal(await page.locator('#worldStartup').getAttribute('aria-busy'),'false');
  await Promise.all([page.waitForEvent('load'),page.getByRole('button',{name:'Try again'}).click()]);
  assert.equal(await page.locator('#worldStartup').getAttribute('data-phase'),'boot');
  await page.clock.install();await page.reload();await page.clock.fastForward(16000);
  assert.match(await page.locator('#worldStartupPhase').innerText(),/taking a little longer/);
  await page.evaluate(()=>document.dispatchEvent(new Event('worldlet:world-ready')));
  await page.clock.runFor(400);
  assert.equal(await page.locator('#worldStartup').count(),0);
  assert.deepEqual(errors,[]);await page.close();
 }
 for(const reducedMotion of ['no-preference','reduce'] as const){
  const page=await browser.newPage({viewport:{width:1280,height:850},reducedMotion});await page.goto(url);await page.clock.install();
  await page.evaluate(()=>{document.documentElement.dataset.firstVisit='true';(window as any).reveals=0;document.addEventListener('worldlet:world-revealed',()=>{(window as any).reveals++;});document.dispatchEvent(new Event('worldlet:world-ready'));});
  await page.clock.runFor(100);
  if(reducedMotion==='no-preference'){
   assert.equal(await page.locator('#worldStartup').evaluate(el=>el.classList.contains('is-opening')),true);
   assert.equal(await page.locator('#worldStartup .startup-mist').count(),1);
   await page.clock.runFor(900);
   assert.ok(await page.locator('.startup-mist').evaluate((el:HTMLCanvasElement)=>{const a=el.getContext('2d').getImageData(0,0,el.width,el.height).data;let low=false,high=false;for(let i=3;i<a.length;i+=4){low ||= a[i]<100;high ||= a[i]>220;}return low&&high;}),'Mist reveals uneven soft patches instead of a uniform fade');
   await page.screenshot({path:'/tmp/worldlet-opening-dissolve.png'});
  }
  await page.clock.runFor(2500);
  assert.equal(await page.locator('#worldStartup').count(),0);assert.equal(await page.evaluate(()=>(window as any).reveals),1);
  await page.close();
 }
 const occluded=await browser.newPage({reducedMotion:'reduce'});
 await occluded.addInitScript(()=>{window.requestAnimationFrame=()=>1;});
 await occluded.goto(url);await occluded.evaluate(()=>{(window as any).reveals=0;document.addEventListener('worldlet:world-revealed',()=>{(window as any).reveals++;});document.dispatchEvent(new Event('worldlet:world-ready'));});
 await occluded.locator('#worldStartup').waitFor({state:'detached',timeout:3000});
 assert.equal(await occluded.evaluate(()=>(window as any).reveals),1,'suspended animation frames cannot block onboarding');await occluded.close();
 // A window at zero size while the world opens and welcomes (a relaunch after force-quit, 2026-10-03): the mist and
 // the "Welcome" finale size their canvases from it, and a zero-height read-back threw an uncaught IndexSizeError.
 const hidden=await browser.newPage({viewport:{width:0,height:0},reducedMotion:'no-preference'}),hiddenErrors=[];
 hidden.on('pageerror',error=>hiddenErrors.push(error.message));
 await hidden.goto(url);await hidden.clock.install();
 await hidden.evaluate(()=>{document.documentElement.dataset.firstVisit='true';document.dispatchEvent(new Event('worldlet:world-ready'));});
 await hidden.clock.runFor(100);assert.equal(await hidden.locator('#worldStartup .startup-mist').count(),1);
 await hidden.addScriptTag({url:'celebration.js'});await hidden.evaluate(()=>(window as any).celebrateWorld(document.body));
 for(const [size,ms] of [[{width:1,height:1},1500],[{width:0,height:0},2000],[{width:800,height:600},4500]] as const){await hidden.setViewportSize(size);await hidden.clock.runFor(ms);}
 assert.equal(await hidden.locator('#worldStartup').count(),0,'A zero-size window still reveals the world');
 assert.equal(await hidden.locator('.world-celebration').count(),0,'The welcome ends');
 assert.deepEqual(hiddenErrors,[]);await hidden.close();
 console.log('PASS startup: centered Fox, lower-center logo, no slogan, responsive/reduced motion, phases, slow load, failure, retry and reveal.');
}finally{await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
