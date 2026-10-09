// Takes the README's screenshots from the sample world: fictional records, no model and no account.
// npm run build:native-ui first; writes docs/assets/readme/*.jpg.
import {withBrowser,fileAccess,worldUrl} from './browser-test.ts';
import dataset from '../ui/world/sample-persona.json' with {type:'json'};
import {WORLD_APPS} from '../core/applets/catalog.ts';
const out=(name:string)=>`docs/assets/readme/${name}.jpg`;
const only=process.argv.slice(2);
// CHROMIUM_PATH points at an installed Chromium when Playwright's own download is missing.
await withBrowser({...fileAccess,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})},async browser=>{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 await page.addInitScript(({datasetId})=>{
  window.calls=[];window.sampleUI={'dataset-version':datasetId};
  window.fixture=()=>({workspaceId:'sample-world',revision:0,activityRevision:0,sources:[],knowledge:[],worldChecks:[],cloudConsent:false,onboarding:{completed:true},connections:[],worldItems:[],
   sampleEnabled:true,sampleUI:{...window.sampleUI},textScale:0,overlay:{version:1,created:{},edits:{},trash:{},receipts:{},undo:null},layout:null,appUpdate:{visible:false}});
  window.webkit={messageHandlers:{worldlet:{async postMessage(b){calls.push(b);if(b.action==='snapshot')return window.fixture();if(b.action==='saveSampleUI'){window.sampleUI=b.state;return {ok:true};}if(b.action==='modelStatus')return {available:false,cloudAllowed:false};if(b.action==='foxPreferences')return {model:{name:'',ready:false,provider:'custom'},cloudConsent:false};if(b.action==='appContent')return {pages:[]};if(b.action==='weatherLoad')return null;return {ok:true};}}}};
 },{datasetId:dataset.id});
 const total=WORLD_APPS.length+dataset.matters.length;
 await page.goto(worldUrl());
 await page.waitForFunction(n=>document.querySelector<HTMLElement>('#notionWorld')?.sceneMetrics?.modules.length===n,total);
 const settled=()=>page.waitForFunction(()=>document.querySelector<HTMLElement>('#notionWorld')?.sceneMetrics?.camera?.settled);
 const shot=async(name:string,go:()=>Promise<void>,clip?:{x:number,y:number,width:number,height:number})=>{
  if(only.length&&!only.includes(name))return;
  await go();await page.waitForTimeout(2500);
  await page.screenshot({path:out(name),type:'jpeg',quality:82,clip});console.log('wrote '+out(name));
 };
 await shot('world',async()=>{await settled();});
 // The Attention Center on the World's left edge.
 await shot('attention',async()=>{await settled();},{x:0,y:0,width:520,height:820});
 await shot('applet-notes',async()=>{await page.evaluate(()=>location.hash='object=app-apple-notes');await page.locator('.pixi-applet-stage[data-applet="apple-notes"] :is(.pixi-stage-item,.home-leaf)').first().waitFor({timeout:30000});});
 await shot('plan',async()=>{
  await page.evaluate(()=>location.hash='object=app-google-calendar');
  await page.locator(':is(.world-actions,.applet-bar-side)').getByRole('button',{name:'Plan tennis',exact:true}).click();
  await page.getByRole('button',{name:'Confirm outing',exact:true}).waitFor();
 });
});
