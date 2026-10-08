// Browser plugin not available; use the existing Playwright dependency.
// Flow: painted runtime preview -> action selection/scrubbing -> proportional
// head, stable reference toggle, visible animation and reduced-motion stillness.
import './fox-painted-preview.ts';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {FOX_ACTIONS} from '../ui/companion/fox-actions.ts';
import {pageErrors,fileUrl} from './browser-test.ts';
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1000,height:900}}),errors=pageErrors(page,{console:true});
 const url=fileUrl('output/companion/painted-idle.html');
 await page.goto(url);await page.waitForSelector('body[data-ready=true]');
 assert.equal(page.url(),url);assert.equal(await page.title(),'Fox · Painted idle study');
 assert(await page.getByRole('heading',{name:'Fox · Painted idle',exact:true}).isVisible());
 const action=page.getByRole('combobox',{name:'Action'}),canvas=page.locator('canvas');
 const snapshot=()=>canvas.evaluate(c=>(c as HTMLCanvasElement).toDataURL());
 const scrub=async(ms:number)=>page.evaluate(ms=>(globalThis as any).foxStudy.draw(ms),ms);
 const frames:{state:string;image:string}[]=[];
 for(const state of FOX_ACTIONS){
  await action.selectOption(state);assert.equal(await action.inputValue(),state);
  await scrub(2200);const a=await snapshot();await scrub(2600);assert.notEqual(await snapshot(),a,`Static live profile: ${state}`);
  frames.push({state,image:await snapshot()});
 }
 await action.selectOption('waving');await scrub(2600);
 await page.getByRole('checkbox',{name:'Original reference'}).check();assert.equal(await canvas.evaluate(c=>getComputedStyle(c).visibility),'hidden');
 await page.getByRole('checkbox',{name:'Original reference'}).uncheck();assert(await canvas.isVisible());
 // Build a temporary contact sheet from the actual WebGL renders, not artwork
 // assets or a different rig. Keep screenshots outside the repository.
 const sheet=await browser.newPage({viewport:{width:1200,height:1050}});
 await sheet.setContent('<body style="margin:0;background:#e8e7df;color:#36463d;font:16px system-ui"><main style="display:grid;grid-template-columns:repeat(5,240px)"></main></body>');
 await sheet.evaluate(frames=>{const main=document.querySelector('main')!;for(const frame of frames){const item=document.createElement('section');item.style.textAlign='center';const image=new Image();image.src=frame.image;image.width=image.height=240;const name=document.createElement('div');name.textContent=frame.state;item.append(image,name);main.append(item);}},frames);
 await sheet.locator('img').last().waitFor();await sheet.screenshot({path:'/tmp/fox-painted-head-states.png',fullPage:true});await sheet.close();
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:'/tmp/fox-painted-head-mobile.png',fullPage:true});
 await page.emulateMedia({reducedMotion:'reduce'});await action.selectOption('stretching');
 await page.getByRole('button',{name:'Play',exact:true}).click();await page.waitForTimeout(100);const still=await snapshot();await page.waitForTimeout(150);assert.equal(await snapshot(),still);
 assert.deepEqual(errors,[]);
 console.log('PASS painted runtime preview: identity/content, 13 moving profiles, action and reference controls, desktop/mobile, reduced motion and no console errors. Screenshots: /tmp/fox-painted-head-states.png /tmp/fox-painted-head-mobile.png');
}finally{await browser.close();}
