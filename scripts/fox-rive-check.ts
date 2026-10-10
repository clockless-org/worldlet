// The Rive Fox: file, state table, packaging in every channel, and real rendering in the
// portrait under the app's own Content Security Policy.
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {buildCompanionPresentation} from './build-companion-presentation.ts';
import {BUILTIN_STYLE} from '../ui/components/style.ts';
import {FOX_STATES,FOX_STATE_ALIASES} from '../ui/companion/animation/fox-state-catalog.ts';
import {riveFoxState} from '../ui/companion/animation/fox-rive.ts';
import states from '../resources/styles/builtin/assets/companion/rive/states.json' with {type:'json'};

const riv=await readFile(BUILTIN_STYLE.companion.rive);
assert.equal(riv.subarray(0,4).toString('latin1'),'RIVE','fox.riv is a Rive runtime file');
assert.deepEqual(Object.keys(states).sort(),FOX_STATES.map(s=>s.id).sort(),'the Rive file performs exactly the 32 catalog states');
assert.deepEqual(Object.values(states).sort((a,b)=>a-b),FOX_STATES.map((_,i)=>i),'state numbers are 0..31');
for(const [alias,target] of Object.entries(FOX_STATE_ALIASES))if(target in states)assert.equal(riveFoxState(alias),target,'alias '+alias);
assert.equal(riveFoxState('unknown'),undefined);
// The page mounts the release presentation: Rive with only the painted fallback.
const release=await buildCompanionPresentation(process.cwd(),'release');
for(const channel of ['dev','release','preview',''])assert((await buildCompanionPresentation(process.cwd(),channel)).companionRive?.startsWith('data:application/octet-stream;base64,'),`${channel||'default'} carries the Rive Fox inline (the page fetches nothing)`);
const buildSource=await readFile('scripts/build-native-ui.ts','utf8');
assert(!buildSource.includes('fox-rive-release'),'every bundle carries the Rive runtime');
assert.match(buildSource,/script-src 'self' 'wasm-unsafe-eval';/,'every channel lets the Rive runtime compile');
assert.match(buildSource,/img-src 'self' data: blob: /,'every channel lets Rive decode its textures');

const dir=await mkdtemp(path.join(tmpdir(),'fox-rive-'));
const browser=await chromium.launch({args:['--allow-file-access-from-files']});
try{
 const bundle=await build({stdin:{resolveDir:process.cwd(),contents:`import {loadRiveFox} from './ui/companion/animation/fox-rive.ts';import {mountCompanionPortrait} from './ui/companion/companion-portrait.ts';Object.assign(globalThis,{loadRiveFox,mountCompanionPortrait});`},bundle:true,format:'iife',write:false,define:{__WORLDLET_CHANNEL__:'"release"'}});
 await writeFile(path.join(dir,'test.js'),bundle.outputFiles[0].text);
 await writeFile(path.join(dir,'assets.js'),'globalThis.__WORLDLET_ENV_ASSETS__='+JSON.stringify({companionPortrait:release.companionPainted.original,...release})+';');
 // The app page's policy (scripts/build-native-ui.ts), minus the unrelated hosts.
 const csp="default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'none'; worker-src blob:";
 await writeFile(path.join(dir,'index.html'),`<!doctype html><meta http-equiv="Content-Security-Policy" content="${csp}"><title>Rive Fox</title><style>body{background:#e8e4d6}.companion-model{width:160px;height:160px}</style><div id="fox" class="companion-avatar" data-state="idle"></div><section id="sheet" style="display:grid;grid-template-columns:repeat(8,120px);gap:6px"></section><script src="assets.js"></script><script src="test.js"></script>`);
 const page=await browser.newPage({viewport:{width:1100,height:900}}),errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(pathToFileURL(path.join(dir,'index.html')).href);
 const result=await page.evaluate(async names=>{
  const g=globalThis as any,canvas=document.createElement('canvas');canvas.width=canvas.height=640;
  const ctx=canvas.getContext('2d')!,fox=await g.loadRiveFox(g.__WORLDLET_ENV_ASSETS__.companionRive,canvas);
  const coverage=()=>{const d=ctx.getImageData(0,0,640,640).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>128)n++;return n/(640*640);};
  const signature=()=>{const d=ctx.getImageData(0,0,640,640).data,out:number[]=[];for(let y=8;y<640;y+=16)for(let x=8;x<640;x+=16)out.push(d[(y*640+x)*4+3]);return out;};
  const diff=(a:number[],b:number[])=>a.reduce((s,v,i)=>s+(Math.abs(v-b[i])>64?1:0),0);
  let now=0;const play=(state:string,ms:number,reduced=false)=>{for(let t=0;t<=ms;t+=33){fox.draw(ctx,state,t,now,reduced);now+=33;}};
  // Images decode asynchronously: wait for the painted layers to arrive.
  for(let i=0;i<100&&coverage()<.2;i++){play('idle',33);await new Promise(r=>setTimeout(r,30));}
  const out:any={idle:coverage(),changes:{}};play('idle',600);const idle=signature();
  const sheet=document.querySelector('#sheet')!;
  for(const name of names){
   play(name,1400);out.changes[name]=diff(idle,signature());
   const copy=document.createElement('canvas');copy.width=copy.height=640;copy.style.cssText='width:120px;height:120px';copy.getContext('2d')!.drawImage(canvas,0,0);copy.title=name;sheet.append(copy);
  }
  // Reduced motion holds a settled pose.
  play('thinking',100,true);const a=signature();play('thinking',2000,true);out.reducedStill=diff(a,signature());
  fox.dispose();
  // The real portrait picks the Rive Fox in a release build.
  const host=document.querySelector('#fox') as HTMLElement;g.mountCompanionPortrait(host);
  for(let i=0;i<100&&!host.querySelector('canvas')?.dataset.animationFrame?.startsWith('rive-v1:');i++)await new Promise(r=>setTimeout(r,50));
  out.portrait=host.querySelector('canvas')?.dataset.animationFrame;
  host.dataset.state='working';host.dataset.activity='reading';await new Promise(r=>setTimeout(r,400));
  out.portraitReading=host.querySelector('canvas')?.dataset.animationFrame;
  return out;
 },Object.keys(states));
 assert.deepEqual(errors,[],'no page errors under the app CSP');
 assert(result.idle>.2,`the painted Fox draws (${result.idle.toFixed(3)} of the canvas)`);
 for(const name of ['greeting','reading','searching','working','sleeping','notifying'])assert(result.changes[name]>20,`${name} visibly differs from idle (${result.changes[name]})`);
 assert.equal(result.reducedStill,0,'reduced motion holds the settled pose');
 assert.equal(result.portrait,'rive-v1:idle','the release portrait draws the Rive Fox');
 assert.equal(result.portraitReading,'rive-v1:reading','foreground activity selects its performance');
 await page.locator('#sheet').screenshot({path:path.join(tmpdir(),'fox-rive-states.png')});
 console.log(`PASS Rive Fox: 32 states, every channel, the release portrait renders it under the app CSP; contact sheet ${path.join(tmpdir(),'fox-rive-states.png')}`);
}finally{await browser.close();await rm(dir,{recursive:true,force:true});}
