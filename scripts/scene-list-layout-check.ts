// Long two-line record lists must scroll naturally instead of compressing their rows into the footer.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {launchTestBrowser,pageErrors} from './browser-test.ts';
const bundle=await build({stdin:{contents:"export {mountAppletScene} from './ui/applets/scene/applet-scene.ts'; export {renderSceneList} from './ui/applets/scene/scene-list.ts';",resolveDir:process.cwd(),loader:'ts'},bundle:true,format:'iife',globalName:'Scene',write:false});
const browser=await launchTestBrowser();
try{
 const page=await browser.newPage({viewport:{width:1500,height:844},reducedMotion:'reduce'}),errors=pageErrors(page,{console:true});
 await page.setContent('<!doctype html><main id="host" style="position:fixed;inset:0"></main>');
 await page.addStyleTag({content:await readFile('ui/applets/scene/applet-scene.css','utf8')});
 await page.addScriptTag({content:bundle.outputFiles[0].text});
 await page.evaluate(()=>{
  const w=window as any;
  w.scene=w.Scene.mountAppletScene(document.getElementById('host'),'list-layout-check',{source:{registration:{imageSize:[1500,844],sha256:'0'.repeat(64),regions:[{id:'main',role:'primary',rect:[.08,.1,.36,.55],material:'paper'}],companion:[.65,.6,.25,.3]}}});
  w.Scene.renderSceneList(w.scene.primary.element,{title:'Reading list'},Array.from({length:20},(_,i)=>({id:'record-'+i,title:'Review the project plan '+(i+1),context:'A second line with useful source context'})),{connected:true,scope:'Local records'},item=>{w.selected=item.id;});
 });
 const geometry=await page.evaluate(()=>{
  const region=document.querySelector<HTMLElement>('.applet-scene-region')!,list=region.querySelector('.scene-list')!.getBoundingClientRect(),scope=region.querySelector('.scene-scope')!.getBoundingClientRect();
  return {scrolls:region.scrollHeight>region.clientHeight,scopeAfterList:scope.top>=list.bottom-1,rows:[...region.querySelectorAll('.scene-item')].map(row=>{
   const r=row.getBoundingClientRect(),t=row.querySelector('.scene-item-text')!.getBoundingClientRect();return {rowTop:r.top,rowBottom:r.bottom,textTop:t.top,textBottom:t.bottom};
  })};
 });
 assert.ok(geometry.scrolls,'long lists scroll in their scene region');
 assert.ok(geometry.scopeAfterList,'source scope remains after the full list');
 for(const [i,row] of geometry.rows.entries()){
  assert.ok(row.textTop>=row.rowTop&&row.textBottom<=row.rowBottom+1,`record ${i} text fits its button`);
  if(i)assert.ok(row.textTop>=geometry.rows[i-1].textBottom,`record ${i} does not overlap the previous text`);
 }
 await page.locator('[data-item-id=record-19]').scrollIntoViewIfNeeded();await page.locator('[data-item-id=record-19]').click();
 assert.equal(await page.evaluate(()=>(window as any).selected),'record-19','last record is clickable after scrolling');
 await page.locator('[data-item-id=record-0]').focus();await page.keyboard.press('Enter');
 assert.equal(await page.evaluate(()=>(window as any).selected),'record-0','keyboard navigation reaches the first record');
 const handoff=await page.evaluate(()=>{
  const w=window as any,host=document.getElementById('host')!;w.scene.destroy();
  const source=(material,rect)=>({registration:{imageSize:[1500,844],sha256:'0'.repeat(64),regions:[{id:'main',role:'primary',rect,material}],companion:[.75,.6,.2,.3]}});
  const old=w.Scene.mountAppletScene(host,'same-applet',{shell:host,source:source('paper',[.05,.1,.5,.65])});
  const next=w.Scene.mountAppletScene(host,'same-applet',{shell:host,source:source('screen',[.1,.1,.6,.7])});
  const before={font:host.style.getPropertyValue('--scene-body-font'),ink:host.style.getPropertyValue('--scene-ink'),width:host.style.getPropertyValue('--applet-scene-primary-width')};
  old.layout();old.destroy();const after={font:host.style.getPropertyValue('--scene-body-font'),ink:host.style.getPropertyValue('--scene-ink'),width:host.style.getPropertyValue('--applet-scene-primary-width')};
  const key=host.dataset.appletScene;next.destroy();return {before,after,key,cleared:!host.dataset.appletScene&&!host.style.getPropertyValue('--scene-body-font')};
 });
 assert.ok(handoff.before.font);assert.deepEqual(handoff.after,handoff.before,'retiring same-key scenes cannot erase or overwrite their replacement');assert.equal(handoff.key,'same-applet');assert.equal(handoff.cleared,true);
 assert.deepEqual(errors,[]);console.log('Scene lists: natural row height, source scope and scrolling pass at 1500 × 844.');
}finally{await browser.close();}
