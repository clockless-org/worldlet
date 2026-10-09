import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import sharp from 'sharp';
import {withBrowser,fileAccess,pageErrors,worldUrl,waitForWorld} from './browser-test.ts';
import {BUILTIN_STYLE} from '../ui/components/style.ts';
import {LANDMARK_KEYS} from '../ui/world/region-landmarks.ts';
import {APP_DEFINITIONS} from '../core/applets/catalog.ts';

assert.deepEqual(Object.keys(BUILTIN_STYLE.landmarks).sort(),[...LANDMARK_KEYS].sort());
for(const [key,pair] of Object.entries(BUILTIN_STYLE.landmarks)){
 const metadata=await sharp(pair.night).metadata(),stats=await sharp(pair.night).stats();
 assert(metadata.hasAlpha,key+' has genuine transparency');
 assert.equal(stats.channels[3].min,0);assert.equal(stats.channels[3].max,255);
 assert(metadata.width>=1000,key+' preserves the generated resolution');
}
await mkdir('output/landmark-night',{recursive:true});
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1440,height:940},reducedMotion:'reduce'}),errors=pageErrors(page);
 await page.addInitScript(ids=>{window.webkit={messageHandlers:{worldlet:{async postMessage(b){if(b.action==='snapshot')return {platform:'macos',workspaceId:'landmark-night-check',revision:0,sources:[],knowledge:[],worldItems:[],connections:[],onboarding:{completed:true,unlockedApplets:ids},sampleEnabled:false};if(b.action==='appContent')return {pages:[]};return {ok:true};}}}};},APP_DEFINITIONS.map(a=>a.id));
 await page.goto(worldUrl());
 await page.waitForFunction(()=>document.querySelector<any>('#notionWorld')?.sceneMetrics?.renderer==='pixi-webgl');
 await waitForWorld(page);
 const metrics=()=>page.evaluate(()=>document.querySelector<any>('#notionWorld').sceneMetrics);
 await page.evaluate(()=>window.worldletExecute('set_scene_lighting',{lighting:'day'}));
 await page.waitForFunction(()=>document.querySelector<any>('#notionWorld').sceneMetrics.landmarks.every(l=>l.nightAmount===0));
 const day=await metrics();assert.equal(day.landmarks.length,6);
 assert(day.landmarks.every(l=>l.hasNight&&l.nightAmount===0));
 await page.screenshot({path:'output/landmark-night/day.png'});
 await page.evaluate(()=>window.worldletExecute('set_scene_lighting',{lighting:'night'}));
 await page.waitForFunction(()=>{const m=document.querySelector<any>('#notionWorld').sceneMetrics;return m.environment.lampIntensity>0&&m.environment.lampIntensity<1;});
 const dusk=await metrics();assert(dusk.landmarks.every(l=>Math.abs(l.nightAmount-dusk.environment.lampIntensity)<.03));
 await page.waitForFunction(()=>document.querySelector<any>('#notionWorld').sceneMetrics.landmarks.every(l=>l.nightAmount===1));
 const night=await metrics();
 assert(night.landmarks.every(l=>l.dayTint===0xffffff&&l.nightTint===0xffffff),'night artwork is not tinted dark a second time');
 assert.deepEqual(night.landmarks.map(l=>[l.anchor,l.width,l.height]),day.landmarks.map(l=>[l.anchor,l.width,l.height]),'lighting never moves or resizes landmarks');
 await page.screenshot({path:'output/landmark-night/night.png'});
 await page.evaluate(()=>location.hash='building=building-home');
 await page.waitForFunction(()=>document.querySelector<any>('#notionWorld').sceneMetrics.camera.settled);
 await page.screenshot({path:'output/landmark-night/night-home.png'});
 await page.evaluate(()=>location.hash='');
 await page.waitForFunction(()=>document.querySelector<any>('#notionWorld').sceneMetrics.camera.settled);
 await page.evaluate(()=>window.worldletExecute('set_scene_lighting',{lighting:'day'}));
 await page.waitForFunction(()=>document.querySelector<any>('#notionWorld').sceneMetrics.landmarks.every(l=>l.nightAmount===0));
 assert.deepEqual(errors,[]);
 console.log('PASS six transparent night assets, registered positions, shared dusk blend, ungraded night, return to day');
});
