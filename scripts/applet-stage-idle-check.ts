import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {bundleScript} from './browser-test.ts';

const bundle=await bundleScript({entryPoints:['ui/world/pixi-stage.ts'],globalName:'stageFixture'});
const browser=await chromium.launch();
try{
 const page=await browser.newPage();await page.setContent('<main></main>');await page.addScriptTag({content:bundle});
 const result=await page.evaluate(()=>{
  const host=document.querySelector('main'),stage=(window as any).stageFixture.createAppletStage(host,()=>{});
  const room={key:'gmail',moduleId:'app-gmail',title:'Mail'},value={connected:true,loaded:true,items:[]};
  stage.render(room,value,true);
  const observer=new MutationObserver(()=>{});observer.observe(host,{subtree:true,attributes:true,childList:true,characterData:true});
  for(let i=0;i<120;i++)stage.render(room,value,true);
  const unchanged=observer.takeRecords().length;
  stage.render(room,{...value,reading:true},true);
  const reading=host.querySelector('.mail-account-tooltip').textContent;
  stage.render(room,value,false,false,false);
  const hidden=(host.querySelector('.mail-shared-device') as HTMLElement).hidden;
  observer.takeRecords();for(let i=0;i<120;i++)stage.render(room,value,false,false,false);
  const idle=observer.takeRecords().length;observer.disconnect();stage.destroy();return {unchanged,idle,reading,hidden};
 });
 assert.equal(result.unchanged,0);assert.equal(result.idle,0);assert.match(result.reading,/Reading/);assert.equal(result.hidden,true);
 console.log('PASS unchanged Applet frames produce no DOM mutations; status/visibility still update',result);
}finally{await browser.close();}
