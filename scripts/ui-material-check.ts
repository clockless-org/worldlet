import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {pageErrors,fileUrl} from './browser-test.ts';
const browser=await chromium.launch({args:['--allow-file-access-from-files']});
await mkdir('output/ui-standard',{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:1100},reducedMotion:'reduce'});
 const errors=pageErrors(page);
 await page.goto(fileUrl('dist/WorldletWeb/ui-gallery.html'));
 await page.getByRole('heading',{name:'Worldlet · Built-in palette'}).waitFor();
 const glass=page.getByRole('button',{name:'Back to world',exact:true});
 assert.equal(await glass.evaluate(e=>getComputedStyle(e).backdropFilter),'blur(16px)');
 assert.equal(await glass.evaluate(e=>getComputedStyle(e).color),'rgb(255, 255, 255)');
 const primary=page.getByRole('button',{name:'primary',exact:true});
 assert.equal(await primary.evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(49, 95, 72, 0.93)');
 await page.screenshot({path:'output/ui-standard/day.png',fullPage:true});
 await page.getByRole('button',{name:'Toggle night'}).click();
 assert.equal(await page.locator('.ui-input').first().evaluate(e=>getComputedStyle(e).color),'rgb(244, 240, 229)');
 assert.equal(await page.locator('.ui-title').first().evaluate(e=>getComputedStyle(e).color),'rgb(244, 240, 229)');
 assert.equal(await page.locator('.ui-caption').first().evaluate(e=>getComputedStyle(e).color),'rgb(193, 206, 195)');
 await page.screenshot({path:'output/ui-standard/night.png',fullPage:true});
 await page.getByRole('button',{name:'Large text'}).click();
 for(const width of [375,812]){
  await page.setViewportSize({width,height:900});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow at '+width);
  await page.screenshot({path:`output/ui-standard/${width}.png`,fullPage:true});
 }
 assert.deepEqual(errors,[]);console.log('PASS UI materials: glass, primary, night inputs, responsive large text');
 await page.evaluate(()=>{
  const host=document.createElement('div');host.className='native-console';
  host.innerHTML='<div class="companion-dialogue"><div class="companion-suggestions"><button>View message</button></div></div>';
  document.body.append(host);
 });
 const action=page.getByRole('button',{name:'View message',exact:true});
 const style=await action.evaluate(e=>{const s=getComputedStyle(e);return {background:s.backgroundColor,shadow:s.boxShadow,decoration:s.textDecorationLine,wrap:s.whiteSpace,height:s.minHeight};});
 assert.equal(style.background,'rgba(0, 0, 0, 0)');assert.equal(style.shadow,'none');assert.equal(style.decoration,'underline');assert.equal(style.wrap,'nowrap');assert.equal(style.height,'44px');
}finally{await browser.close();}
