import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {bundleScript} from './browser-test.ts';
const bundle=await bundleScript({entryPoints:['ui/onboarding/world-onboarding.ts'],globalName:'Setup'});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();await page.setContent('<main id="world"></main>');await page.addScriptTag({content:bundle});
 const result=await page.evaluate(async()=>{
  const w=window as any,root=document.querySelector('#world'),guides=[],calls=[];
  const state={onboarding:{completed:false,journeyStage:'mail-value',introStep:2},sources:[],connections:[],knowledge:[]};
  const controller=w.Setup.mountWorldOnboarding({root,state,view:{metrics:{buildings:[]},setGuide:g=>guides.push(g),openApplet(){}},call:async(action,args)=>{calls.push(action);return action==='snapshot'?state:{connected:false};}});
  controller.update({...state,onboarding:{...state.onboarding,journeyStage:'attention'}});
  return {guides,calls,locked:(root as HTMLElement).dataset.onboardingLocked};
 });
 assert.deepEqual(result.guides,[],'old checkpoints must not display the retired tutorial');assert.deepEqual(result.calls,[],'mounting must not start mail checks or OAuth');assert.notEqual(result.locked,'true');
 console.log('PASS retired Mail journey stays inactive for unfinished legacy profiles');
}finally{await browser.close();}
