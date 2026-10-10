import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {workingStowStudy,WORKING_STOW_CONTACTS,WORKING_STOW_DURATION} from '../ui/companion/animation/fox-working-stow-study.ts';
import {anatomyMatrices,anatomyArmVertex,transform} from '../ui/companion/animation/fox-anatomy.ts';
import {placeWorkingPoint} from '../ui/companion/animation/fox-working-device.ts';
import {seatedBodyVertex} from '../ui/companion/animation/fox-seated-support.ts';

let maxContact=0,maxStep=0,minArea=Infinity,maxArea=0,previous;
for(let t=0;t<=WORKING_STOW_DURATION;t+=10){
 const f=workingStowStudy(t),m=anatomyMatrices(f.pose);
 assert.equal(f.workstation,1);assert.equal(f.workingLidClosure,1);
 const head=m.get('head');assert(Math.abs(head[0]*head[3]-head[1]*head[2]-1)<1e-12);
 for(const [side,p] of [['L',[.45,.92]],['R',[.747,.92]]]){const a=transform(m.get('foot'+side),p);assert(Math.hypot(a[0]-p[0],a[1]-p[1])<1e-12,'Sole slides');}
 for(let y=.69;y<.9;y+=.02)for(let x=.42;x<.79;x+=.06){
  const h=1e-5,a=seatedBodyVertex([x,y],m),b=seatedBodyVertex([x+h,y],m),c=seatedBodyVertex([x,y+h],m);
  const area=((b[0]-a[0])*(c[1]-a[1])-(c[0]-a[0])*(b[1]-a[1]))/(h*h);minArea=Math.min(minArea,area);maxArea=Math.max(maxArea,area);
 }
 for(const side of ['L','R']){
  const a=anatomyArmVertex(side,WORKING_STOW_CONTACTS[side].paw,m),b=placeWorkingPoint(WORKING_STOW_CONTACTS[side].device,f.workingPlacement);
  if(f.contact)maxContact=Math.max(maxContact,Math.hypot(a[0]-b[0],a[1]-b[1]));
  assert.equal(f.pose['upperArm'+side].x,undefined);assert.equal(f.pose['upperArm'+side].y,undefined);
 }
 if(previous)for(const id of Object.keys(f.pose))maxStep=Math.max(maxStep,Math.abs((f.pose[id].angle??0)-(previous.pose[id]?.angle??0)));
 previous=f;
}
assert(maxContact<1e-7,'Painted paw loses rigid device contact');
assert(maxStep<3,'Joint branch discontinuity');
assert(minArea>.65&&maxArea<1.65,'Torso skin folds or overstretches: '+minArea+'/'+maxArea);
for(const t of [1000,1250,2100,3500,4250,4500,5400]){
 const h=.05,[a,b,c]=[t-h,t,t+h].map(v=>workingStowStudy(v));
 for(const id of Object.keys(b.pose))for(const key of ['angle','x','y']){
  const values=[a,b,c].map(f=>f.pose[id]?.[key]??0);
  assert(Math.abs((values[2]-values[1])/h-(values[1]-values[0])/h)<1e-4,'Velocity seam: '+t+'/'+id+'/'+key);
 }
}
const placement={x:-.16,y:-.035,angle:-5},p=[.3,.8],q=[.8,.9],a=placeWorkingPoint(p,placement),b=placeWorkingPoint(q,placement);
assert(Math.abs(Math.hypot(a[0]-b[0],a[1]-b[1])-Math.hypot(p[0]-q[0],p[1]-q[1]))<1e-12,'Rigid device distorts');
assert.throws(()=>placeWorkingPoint(p,{x:0,y:NaN,angle:0}));
assert.deepEqual(workingStowStudy(0,true),workingStowStudy(5400));
for(const t of [-1,NaN,Infinity])assert.throws(()=>workingStowStudy(t));
const handling=process.argv.includes('--handling'),root=process.cwd(),draft='resources/styles/builtin/drafts/fox-states-v1/';
const assets=await Promise.all(['resources/styles/builtin/assets/companion/rig/fallback.png',draft+'body-underpaint.png',draft+'complete-forelimbs.png',draft+'ear-root-underpaint.png',draft+'neck-underpaint.png',draft+'working-device.png',draft+'working-base-complete-v1.png'].map(async p=>'data:image/png;base64,'+(await readFile(p)).toString('base64')));
const bundle=await build({stdin:{resolveDir:root,contents:`import {createAnatomyInspector} from './ui/companion/animation/fox-anatomy-inspector.ts';import {workingStowStudy} from './ui/companion/animation/fox-working-stow-study.ts';import {workingStowReview} from './ui/companion/animation/fox-working-stow-player.ts';import {registerWorkingDevice,workingLidPoint,placeWorkingPoint} from './ui/companion/animation/fox-working-device.ts';import {drawAnatomySkin} from './ui/companion/animation/fox-anatomy-skin.ts';globalThis.api={createAnatomyInspector,registerWorkingDevice,workingLidPoint,placeWorkingPoint,drawAnatomySkin,sample:${handling?'workingStowReview':'workingStowStudy'}};`},bundle:true,write:false,format:'iife'});
if(handling)assert(!bundle.outputFiles[0].text.includes('function grip('),'Iterative IK leaked into the playback bundle');
// Browser plugin not available; existing Playwright renders the isolated study.
const browser=await chromium.launch();try{
 const page=await browser.newPage({viewport:{width:1120,height:850}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.setContent('<title>Fox stow study</title><style>body{background:#eae5d6;color:#294b41;font:16px system-ui}main{display:grid;grid-template-columns:repeat(4,260px)}canvas{width:250px;height:250px}</style><h1>Closed laptop → lift → park · isolated draft</h1><input aria-label="Time" type="range" min="0" max="5400" value="0"><main></main>');
 if(handling){await page.locator('input').evaluate(el=>el.max='24000');await page.locator('h1').evaluate(el=>el.textContent='Carry → brake → hold → retrieve · precomputed path');}
 await page.addScriptTag({content:bundle.outputFiles[0].text});
 const result=await page.evaluate(async ({a,handling})=>{
  const canvas=document.createElement('canvas');canvas.width=canvas.height=640;
  const rig=await api.createAnatomyInspector(canvas,a[0],undefined,a[1],a[2],undefined,undefined,a[3],a[4],undefined,{device:a[5],base:a[6]});
  const device=new Image();device.src=a[5];await device.decode();const registered=api.registerWorkingDevice(device);
  const lid=document.createElement('canvas');lid.width=lid.height=640;const lc=lid.getContext('2d');
  let maxRGB=0,maxLidError=0,lidPixels=0;
  for(const t of handling?[0,1500,3200,3550,4700,5800,6500,7600,9150,14000,19000,24000]:[0,500,1000,1250,1800,2100,2700,3500,3900,4250,4800,5400]){
   const f=api.sample(t);rig.draw(f.pose,{...f,workingCarry:true,authored:true});const ref=canvas.getContext('2d').getImageData(0,0,640,640).data;
   rig.draw(f.pose,{...f,workingCarry:true,authored:true,gpuFrame:true});const actual=canvas.getContext('2d').getImageData(0,0,640,640).data;
   lc.clearRect(0,0,640,640);api.drawAnatomySkin(lc,registered.screen,registered.size,[640,640],p=>api.placeWorkingPoint(api.workingLidPoint(p,1),f.workingPlacement),1,1);
   const pixels=lc.getImageData(0,0,640,640).data;
   for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]>=240){lidPixels++;for(let k=0;k<3;k++)maxLidError=Math.max(maxLidError,Math.abs(pixels[i+k]-ref[i+k])-(255-pixels[i+3])-2);}
   let sum=0,n=0;for(let i=0;i<actual.length;i+=4)if(actual[i+3]>240&&ref[i+3]>240)for(let k=0;k<3;k++){sum+=Math.abs(actual[i+k]-ref[i+k]);n++;}maxRGB=Math.max(maxRGB,sum/n);
   const section=document.createElement('section'),copy=document.createElement('canvas');copy.width=copy.height=640;copy.getContext('2d').drawImage(canvas,0,0);section.append(t+' ms · '+f.phase,copy);document.querySelector('main').append(section);
  }
  const preview=document.createElement('canvas');preview.width=preview.height=640;document.body.prepend(preview);
  document.querySelector('input').oninput=e=>{const f=api.sample(+e.target.value);rig.draw(f.pose,{...f,authored:true,gpuFrame:true});const c=preview.getContext('2d');c.clearRect(0,0,640,640);c.drawImage(canvas,0,0);preview.dataset.phase=f.phase;};
  registered.dispose();return {maxRGB,maxLidError,lidPixels};
 },{a:assets,handling});
 for(const [t,phase] of handling?[[3550,'holding-device'],[19000,'returning-device'],[24000,'front-device']]:[[2700,'carrying-device'],[5400,'parked-device'],[1000,'gripping-device']]){await page.locator('input').fill(String(t));await page.locator('input').dispatchEvent('input');assert.equal(await page.locator('body > canvas').getAttribute('data-phase'),phase);}
 await page.screenshot({path:handling?'/tmp/fox-working-stow-handling.png':'/tmp/fox-working-stow.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.locator('main').evaluate(el=>el.style.gridTemplateColumns='260px');
 await page.screenshot({path:handling?'/tmp/fox-working-stow-handling-narrow.png':'/tmp/fox-working-stow-narrow.png',fullPage:true});
 assert.equal(await page.title(),'Fox stow study');assert.equal(await page.locator('main canvas').count(),12);
 assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));assert.deepEqual(errors,[]);assert(result.maxRGB<3);
 assert(result.lidPixels>10000);assert.equal(result.maxLidError,0,'Carrying exposes the rectangular distal arm cut above the lid');
 console.log({samples:541,maxContact,maxStep,minArea,maxArea,result,errors});
}finally{await browser.close();}
