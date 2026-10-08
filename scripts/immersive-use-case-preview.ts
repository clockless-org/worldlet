import {readFile,writeFile,mkdir} from 'node:fs/promises';
import sharp from 'sharp';
import {withBrowser,fileAccess,worldUrl} from './browser-test.ts';
const keys=['oura','paypal','strava'],folder='output/immersive-v5';
await mkdir(folder+'/ui',{recursive:true});
const originals=new Map<string,Buffer>();
try{
 for(const key of keys){
  const record=JSON.parse(await readFile(folder+'/'+key+(key==='oura'?'':'-refined')+'.json','utf8'));
  const source=record.output_hint.match(/ as (\/[^\n]+\.png) by default/)[1];
  const file='dist/WorldletWeb/assets/focus-'+key+'.js';originals.set(file,await readFile(file));
  const data='data:image/webp;base64,'+(await sharp(source).webp({quality:90}).toBuffer()).toString('base64');
  await writeFile(file,'globalThis.__WORLDLET_FOCUS_IMAGES__??={};globalThis.__WORLDLET_FOCUS_IMAGES__['+JSON.stringify(key)+']='+JSON.stringify(data)+';');
 }
 await withBrowser(fileAccess,async browser=>{
  for(const key of keys){
   const page=await browser.newPage({viewport:{width:1600,height:1000},reducedMotion:'reduce'});
   await page.addInitScript(()=>{window.calls=[];window.webkit={messageHandlers:{worldlet:{async postMessage(b){calls.push(b);if(b.action==='snapshot')return {workspaceId:'use-case-preview',revision:0,sources:[],knowledge:[],worldItems:[],connections:[],onboarding:{completed:true},sampleEnabled:false};if(b.action==='modelStatus')return {available:true};if(['appContent','curatedSourceContent'].includes(b.action))return {pages:[]};return {ok:true};}}}};});
   await page.goto(worldUrl());await page.waitForFunction(()=>document.querySelector<any>('#notionWorld')?.sceneMetrics?.modules.length>0);
   await page.evaluate(k=>location.hash='object=app-'+k,key);await page.waitForFunction(k=>document.querySelector<any>('#notionWorld')?.sceneMetrics?.focusRoom?.key===k,key);
   for(const [width,height] of [[1600,1000],[820,900],[2560,1080]]){await page.setViewportSize({width,height});await page.waitForTimeout(350);await page.screenshot({path:folder+'/ui/'+key+'-'+width+'.png'});}
   await page.close();
  }
 });
 console.log('Three draft use-case scenes captured; source assets and manifest unchanged.');
}finally{for(const [file,data] of originals)await writeFile(file,data);}
