import assert from 'node:assert/strict';
import {withBrowser,fileAccess,pageErrors,worldUrl,leaveApplet} from './browser-test.ts';
import {normalizeWeather} from '../ui/world/environment/world-environment.ts';
const now=Date.now(),times=Array.from({length:7},(_,i)=>Math.floor(now/1000)+i*86400);
const raw={timezone:'America/Los_Angeles',current:{time:Math.floor(now/1000),temperature_2m:18,weather_code:0,is_day:0},daily:{time:times,weather_code:[0,2,61,71,95,45,3],temperature_2m_max:[23,24,19,5,17,20,21],temperature_2m_min:[14,15,12,-1,11,12,13],precipitation_probability_max:[0,10,80,70,90,20,30],wind_speed_10m_max:[12,15,22,18,30,9,14],sunrise:[],sunset:[]}};
const weather=normalizeWeather(raw,now),place={name:'Test city',latitude:37,longitude:-122};
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1280,height:850},reducedMotion:'reduce'}),errors=pageErrors(page);
 await page.addInitScript(({weather,place})=>{
  localStorage.setItem('worldlet-environment-v1',JSON.stringify({weather,place}));window.calls=[];
  window.webkit={messageHandlers:{worldlet:{async postMessage(b){calls.push(b);if(b.action==='snapshot')return {workspaceId:'weather-test',revision:0,sources:[],knowledge:[],worldItems:[],connections:[],onboarding:{completed:true},cloudConsent:false,sampleEnabled:false,overlay:{version:1,created:{},edits:{},trash:{},receipts:{},undo:null}};if(b.action==='weatherLoad')return {weather,place};if(b.action==='modelStatus')return {available:true};return {ok:true};}}}};
 },{weather,place});
 await page.goto(worldUrl());
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld')?.sceneMetrics?.modules.length>0);
 assert.equal(await page.evaluate(()=>performance.getEntriesByType('resource').filter(e=>/assets\/focus-.*\.(?:png|js)/.test(e.name)).length),0,'Focus art loads only when opened');
 const closedBrowser=await page.evaluate(async()=>{const before=location.hash,result=await (window as any).worldletExecute('automate_browser',{operation:'snapshot'});return {before,after:location.hash,result};});
 assert.match(closedBrowser.result.error,/No browser panel is open/);
 assert.equal(closedBrowser.after,closedBrowser.before,'Snapshot must not silently navigate and invalidate its own conversation view');

 for(const key of ['youtube','x','tiktok','discord','browser','plaid','oura','strava','fitbit','google-maps','airbnb','tripit','doordash','notion','stripe','paypal','gmail'].filter(key=>!process.env.APPLET||key===process.env.APPLET)){
  await page.evaluate(k=>location.hash='object=app-'+k,key);
  if(['notion','stripe','paypal'].includes(key)){await page.locator('.applet-mode-web').waitFor();await page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.presentation.focusScenery);await page.locator('.applet-mode-web').click();}
  if(key==='gmail')await page.locator('.applet-mode-web').click();
  await page.locator('.browser-viewport').waitFor();
  await page.waitForFunction(key=>{const m=document.querySelector<HTMLElement>('#notionWorld').sceneMetrics;return m.presentation.focusScenery===true&&m.camera.settled;},key);
  if(key==='gmail')assert.equal(await page.locator('#notionWorld').getAttribute('data-page'),'app-gmail','Web stays in Mail with its own backdrop');
  await page.screenshot({path:'/tmp/browser-focus-'+key+'.png'});
  // A hybrid Applet's web view goes back to its own view from its first page; World beside Fox then leaves.
  if(['notion','stripe','paypal','gmail'].includes(key)){
   await page.locator('.browser-back').click();
   await page.locator('.browser-viewport').waitFor({state:'hidden'});
  }
  await leaveApplet(page);
  await page.waitForFunction(()=>!document.querySelector<HTMLElement>('#notionWorld').sceneMetrics.presentation.focusScenery);
 }
 assert.deepEqual(errors,[]);console.log('PASS browser Focus backdrop policy, lazy loading, native backgrounds and Back restores scene.');
});
