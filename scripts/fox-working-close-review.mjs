import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {anatomyMatrices,anatomyArmVertex} from '../ui/companion/fox-anatomy.ts';
import {workingCloseStudy,WORKING_CLOSE_CONTACT} from '../ui/companion/fox-working-close-study.ts';
import {workingLidPoint} from '../ui/companion/fox-working-device.ts';
// Browser plugin not available. Reproduce the isolated contact study, not live QA.
let previousClosure=0,contactSamples=0;
for(let i=0;i<=528;i++){
 const t=i*4400/528,f=workingCloseStudy(t),m=anatomyMatrices(f.pose),head=m.get('head');
 assert(f.workingLidClosure>=previousClosure&&f.workingLidClosure<=1,'Lid reverses or overshoots');previousClosure=f.workingLidClosure;
 assert(Math.abs(head[0]*head[3]-head[1]*head[2]-1)<1e-12,'Head stretches');
 if(f.contact){const a=anatomyArmVertex('R',WORKING_CLOSE_CONTACT.paw,m),b=workingLidPoint(WORKING_CLOSE_CONTACT.lid,f.workingLidClosure);assert(Math.hypot(a[0]-b[0],a[1]-b[1])<1e-12,'Paw slides from lid');contactSamples++;}
 assert(Math.hypot(f.pose.upperArmR.x??0,f.pose.upperArmR.y??0)<.06,'Shoulder correction detaches the arm');
}
for(const boundary of [1000,2800,3500]){
 const h=.01,poses=[boundary-h,boundary,boundary+h].map(t=>workingCloseStudy(t).pose);
 for(const id of Object.keys(poses[1]))for(const key of ['angle','x','y','closure']){
  const [a,b,c]=poses.map(p=>p[id]?.[key]??0);assert(Math.abs((c-b)/h-(b-a)/h)<1e-6,'Velocity seam at '+boundary+' '+id);
 }
}
for(const joint of Object.values(workingCloseStudy(4400).pose))for(const value of Object.values(joint))assert(Math.abs(value)<1e-12,'Hands do not settle');
assert.deepEqual(workingCloseStudy(0,true),workingCloseStudy(4400,true));
for(const t of [-1,NaN,Infinity])assert.throws(()=>workingCloseStudy(t));
const root=process.cwd();
const handling=process.argv.includes('--handling'),endTime=handling?24000:4400;
const require=createRequire(root+'/package.json'),{build}=require('esbuild'),{chromium}=require('playwright');
const img=async path=>'data:image/png;base64,'+(await readFile(root+'/'+path)).toString('base64');
const draft='resources/styles/builtin/drafts/fox-states-v1/';
const args=await Promise.all(['resources/styles/builtin/assets/companion/rig/fallback.png',draft+'body-underpaint.png',draft+'complete-forelimbs.png',draft+'ear-root-underpaint.png',draft+'neck-underpaint.png',draft+'working-device.png',draft+'working-base-complete-v1.png'].map(img));
const bundle=await build({stdin:{resolveDir:root,contents:`import {createAnatomyInspector} from './ui/companion/fox-anatomy-inspector.ts';import {workingCloseStudy} from './ui/companion/fox-working-close-study.ts';import {workingHandlingReview} from './ui/companion/fox-working-handling.ts';import {registerWorkingDevice,workingLidPoint} from './ui/companion/fox-working-device.ts';import {drawAnatomySkin} from './ui/companion/fox-anatomy-skin.ts';globalThis.api={createAnatomyInspector,sample:${handling?'workingHandlingReview':'workingCloseStudy'},registerWorkingDevice,workingLidPoint,drawAnatomySkin};`},bundle:true,write:false,format:'iife'});
const browser=await chromium.launch();try{
 const page=await browser.newPage({viewport:{width:1120,height:850}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.setContent('<title>Fox closing contact review</title><style>body{background:#eae5d6;font:16px system-ui;color:#294b41}main{display:grid;grid-template-columns:repeat(4,260px)}canvas{width:250px;height:250px}</style><h1>Working → close lid → release · draft</h1><input aria-label="Time" type="range" min="0" max="4400" value="0"><main></main>');
 await page.locator('input').evaluate((el,end)=>el.max=String(end),endTime);
 if(handling)await page.locator('h1').evaluate(el=>el.textContent='Close → hold → reopen → interrupt · draft');
 await page.addScriptTag({content:bundle.outputFiles[0].text});
 const result=await page.evaluate(async ({a,handling})=>{
  const c=document.createElement('canvas');c.width=c.height=640;
  const rig=await api.createAnatomyInspector(c,a[0],undefined,a[1],a[2],undefined,undefined,a[3],a[4],undefined,{device:a[5],base:a[6]});
  const device=new Image();device.src=a[5];await device.decode();const registered=api.registerWorkingDevice(device);
  const lid=document.createElement('canvas');lid.width=lid.height=640;const lidContext=lid.getContext('2d');
  let maxError=0,maxLidError=0,lidPixels=0;
  for(const t of handling?[0,2000,2600,2950,4400,6000,8000,9350,10900,14500,18000,23000]:[0,350,700,1000,1400,1800,2200,2600,2800,3200,3700,4400]){
   const f=api.sample(t);rig.draw(f.pose,{...f,authored:true});const reference=c.getContext('2d').getImageData(0,0,640,640).data;
   rig.draw(f.pose,{...f,authored:true,gpuFrame:true});const actual=c.getContext('2d').getImageData(0,0,640,640).data;
   let sum=0,n=0;for(let i=0;i<actual.length;i+=4)if(actual[i+3]>240&&reference[i+3]>240)for(let k=0;k<3;k++){sum+=Math.abs(actual[i+k]-reference[i+k]);n++;}maxError=Math.max(maxError,sum/n);
   lidContext.clearRect(0,0,640,640);api.drawAnatomySkin(lidContext,registered.screen,registered.size,[640,640],p=>api.workingLidPoint(p,f.workingLidClosure),1,1);
   const lidPixelsData=lidContext.getImageData(0,0,640,640).data;
   // Opaque lid pixels must win over the far-side arm. This directly catches
   // the old rectangular distal-atlas patch; body/GPU parity alone did not.
   for(let i=0;i<lidPixelsData.length;i+=4)if(lidPixelsData[i+3]>=240){lidPixels++;for(let k=0;k<3;k++)maxLidError=Math.max(maxLidError,Math.abs(lidPixelsData[i+k]-reference[i+k])-(255-lidPixelsData[i+3])-2);}
   const section=document.createElement('section'),copy=document.createElement('canvas');copy.width=copy.height=640;copy.getContext('2d').drawImage(c,0,0);section.append(t+' ms '+(f.phase??''),copy);document.querySelector('main').append(section);
  }
  const preview=document.createElement('canvas');preview.width=preview.height=640;document.body.prepend(preview);
  document.querySelector('input').oninput=e=>{const f=api.sample(+e.target.value);rig.draw(f.pose,{...f,authored:true,gpuFrame:true});preview.getContext('2d').clearRect(0,0,640,640);preview.getContext('2d').drawImage(c,0,0);preview.dataset.time=e.target.value;preview.dataset.phase=f.phase??'';};
  registered.dispose();
  return {maxError,maxLidError,lidPixels};
 },{a:args,handling});
 await page.locator('input').fill('2200');await page.locator('input').dispatchEvent('input');
 if(await page.locator('body > canvas').getAttribute('data-time')!=='2200')throw Error('Scrub failed');
 if(handling){await page.locator('input').fill('4400');await page.locator('input').dispatchEvent('input');assert.equal(await page.locator('body > canvas').getAttribute('data-phase'),'holding-device');await page.locator('input').fill('23000');await page.locator('input').dispatchEvent('input');assert.equal(await page.locator('body > canvas').getAttribute('data-phase'),'ready-to-work');}
 await page.screenshot({path:handling?'/tmp/fox-working-handling.png':'/tmp/fox-close-contact.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.locator('main').evaluate(el=>el.style.gridTemplateColumns='260px');
 await page.screenshot({path:handling?'/tmp/fox-working-handling-narrow.png':'/tmp/fox-close-contact-narrow.png',fullPage:true});
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 assert.equal(await page.title(),'Fox closing contact review');assert.equal(await page.locator('main canvas').count(),12);assert(!overflow);
 assert(result.lidPixels>10000);assert.equal(result.maxLidError,0,'Forearm overpaints opaque lid');
 console.log({contactSamples,result,errors,title:await page.title(),overflow});
 if(errors.length||result.maxError>3)throw Error('Rendering regression');
}finally{await browser.close();}
