// Companion looks: the tool form, and the Rive Fox wearing a look on its own rig
// (every character layer recolored, props untouched, back to the painting on Classic).
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {launchTestBrowser} from './browser-test.ts';
import {buildCompanionPresentation} from './build-companion-presentation.ts';
import {COMPANION_LOOK_PRESETS,normalizeCompanionLook,parseCompanionLook,recolorCompanionPixels} from '../core/companion/index.ts';

assert.deepEqual(parseCompanionLook('snow'),{preset:'snow',fur:'#eeeae4',scarf:'#a33a3a'});
assert.deepEqual(parseCompanionLook('classic'),{preset:'classic',fur:null,scarf:null});
assert.deepEqual(parseCompanionLook('midnight scarf=#A33A3A'),{preset:'custom',fur:'#3b4160',scarf:'#a33a3a'});
assert.deepEqual(parseCompanionLook('fur=default scarf=default'),{preset:'classic',fur:null,scarf:null});
assert.deepEqual(parseCompanionLook('fur=#eeeae4, scarf=#a33a3a'),{preset:'snow',fur:'#eeeae4',scarf:'#a33a3a'},'colors matching a preset name it');
for(const bad of ['','dragon','fur=red','eyes=#000000','snow midnight'])assert.throws(()=>parseCompanionLook(bad),bad);
assert.deepEqual(normalizeCompanionLook({preset:'frost'}),{preset:'frost',fur:'#8fb3d9',scarf:'#2f4f7f'});
assert.deepEqual(normalizeCompanionLook('junk'),{preset:'classic',fur:null,scarf:null});
// Fur and scarf move; cream, white and dark eye paint stay.
const px=(r:number,g:number,b:number)=>new Uint8ClampedArray([r,g,b,255]);
const fur=recolorCompanionPixels(px(226,121,58),parseCompanionLook('frost'));assert(fur[2]>fur[0],'orange fur turns blue');
const cream=recolorCompanionPixels(px(246,240,228),parseCompanionLook('midnight'));assert.deepEqual([...cream],[246,240,228,255],'cream stays');
const iris=recolorCompanionPixels(px(110,62,32),parseCompanionLook('frost'),{face:true});assert([110,62,32].every((v,i)=>Math.abs(iris[i]-v)<=3),'eyes keep their paint on the face');
const scarf=recolorCompanionPixels(px(104,112,70),parseCompanionLook('fur=default scarf=#a33a3a'));assert(scarf[0]>scarf[1]+40,'sage scarf turns red');

const dev=await buildCompanionPresentation(process.cwd(),'dev');
const dir=await mkdtemp(path.join(tmpdir(),'companion-look-'));
const browser=await launchTestBrowser({args:['--allow-file-access-from-files']});
try{
 const bundle=await build({stdin:{resolveDir:process.cwd(),contents:`import {loadRiveFox} from './ui/companion/animation/fox-rive.ts';import {parseCompanionLook} from './core/companion/index.ts';Object.assign(globalThis,{loadRiveFox,parseCompanionLook});`},bundle:true,format:'iife',write:false});
 await writeFile(path.join(dir,'test.js'),bundle.outputFiles[0].text);
 await writeFile(path.join(dir,'assets.js'),'globalThis.riv='+JSON.stringify(dev.companionRive)+';');
 const csp="default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'none'; worker-src blob:";
 await writeFile(path.join(dir,'index.html'),`<!doctype html><meta http-equiv="Content-Security-Policy" content="${csp}"><title>Looks</title><body style="margin:0;background:#e8e4d6"><section id="sheet" style="display:flex;gap:4px;padding:8px"></section><script src="assets.js"></script><script src="test.js"></script>`);
 const page=await browser.newPage({viewport:{width:1300,height:240}}),errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(pathToFileURL(path.join(dir,'index.html')).href);
 const result=await page.evaluate(async presets=>{
  const g=globalThis as any,canvas=document.createElement('canvas');canvas.width=canvas.height=640;
  const ctx=canvas.getContext('2d')!,fox=await g.loadRiveFox(g.riv,canvas,g.parseCompanionLook('midnight'));
  let now=0;const draw=async()=>{for(let i=0;i<3;i++){fox.draw(ctx,'idle',0,now,true);now+=33;await new Promise(r=>setTimeout(r,40));}};
  // Mean color of the opaque body pixels.
  const mean=()=>{const d=ctx.getImageData(0,0,640,640).data;let r=0,g=0,b=0,n=0;for(let i=0;i<d.length;i+=4)if(d[i+3]>200){r+=d[i];g+=d[i+1];b+=d[i+2];n++;}return [r/n,g/n,b/n,n];};
  const out:any={stats:fox.stats()};
  for(let i=0;i<60&&mean()[3]<40000;i++)await draw();
  out.midnight=mean();
  const sheet=document.querySelector('#sheet')!;
  for(const preset of presets){
   await fox.setLook(g.parseCompanionLook(preset));await draw();out[preset]=mean();
   const copy=document.createElement('canvas');copy.width=copy.height=640;copy.style.cssText='width:170px;height:170px';copy.getContext('2d')!.drawImage(canvas,0,0);copy.title=preset;sheet.append(copy);
  }
  out.after=fox.stats();fox.dispose();return out;
 },COMPANION_LOOK_PRESETS.map(p=>p.id).filter(id=>id!=='classic').concat('classic'));
 assert.deepEqual(errors,[],'no page errors under the app CSP');
 assert.equal(result.stats.layers,9,'all nine character layers can change; the three props keep their paint');
 const [r,g,b]=result.classic,[mr,mg,mb]=result.midnight;
 assert(r>b+40,`Classic is the orange painting (${result.classic.map(Math.round)})`);
 assert(mb>=mr&&r-mr>60,`Midnight darkens and cools the fur (${result.midnight.map(Math.round)})`);
 assert(result.snow[2]>b+40,'Snow lightens the fur');
 assert(result.frost[2]>result.frost[0],'Frost is blue');
 assert.equal(result.after.look,'-/-','back to the painting on Classic');
 const shot=path.join(tmpdir(),'companion-looks.png');await page.locator('#sheet').screenshot({path:shot});
 console.log('PASS companion looks: tool form, nine layers recolored on the Rive rig, Classic restores; sheet '+shot);
}finally{await browser.close();await rm(dir,{recursive:true,force:true});}
