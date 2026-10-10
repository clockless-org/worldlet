import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {WORLD_APPS} from '../core/applets/catalog.ts';
import {withBrowser,fileAccess,pageErrors,worldUrl,leaveApplet} from './browser-test.ts';
const evidence='output/immersive-v5/acceptance';await mkdir(evidence,{recursive:true});
const manifest=JSON.parse(await readFile('resources/styles/builtin/manifest.json','utf8'));
const coverage=JSON.parse(await readFile('resources/styles/builtin/references/immersive/use-cases.json','utf8'));
const composition=JSON.parse(await readFile('resources/styles/builtin/references/immersive/composition.json','utf8')),selection=process.env.APPLETS?.split(',')|| (process.env.APPLET?[process.env.APPLET]:process.env.FINAL?null:['youtube','uber','pokemon-showdown','gmail','google-calendar','apple-notes','apple-reminders','meetings','snake','game-2048']);
const ready=new Set(coverage.items.filter(a=>a.integration==='complete').map(a=>a.key));
const keys=WORLD_APPS.filter(a=>ready.has(a.key)&&manifest.applets[a.key].focus?.endsWith('/immersive.webp')&&(!selection||selection.includes(a.key)));
// The RC checks representative web/native/game and wide-subject layouts; FINAL=1 records all 118.
assert.equal(ready.size,WORLD_APPS.length,'every registered Applet has an integrated background');
for(const app of WORLD_APPS)assert.ok(manifest.applets[app.key].focus?.endsWith('/immersive.webp')&&composition.items[app.key],'every Applet has measured immersive art');
if(process.env.FINAL&&!selection)assert.equal(keys.length,WORLD_APPS.length,'all Applets selected for full acceptance');
const report=selection?JSON.parse(await readFile(`${evidence}/report.json`,'utf8').catch(()=>'[]')).filter(r=>!keys.some(a=>a.key===r.key)):[];
await withBrowser(fileAccess,async browser=>{
 const page=await browser.newPage({viewport:{width:1600,height:1000},reducedMotion:'reduce'}),errors=pageErrors(page);
 await page.addInitScript(()=>{window.calls=[];window.webkit={messageHandlers:{worldlet:{async postMessage(b){calls.push(b);if(b.action==='snapshot')return {workspaceId:'immersive-check',revision:0,sources:[],knowledge:[],worldItems:[],connections:[],onboarding:{completed:true},sampleEnabled:false};if(b.action==='modelStatus')return {available:true};if(['appContent','curatedSourceContent'].includes(b.action))return {pages:[]};if(['codexSession','developmentSessions'].includes(b.action))return {providers:[]};return {ok:true};}}}};});
 await page.goto(worldUrl());await page.waitForFunction(()=>document.querySelector<any>('#notionWorld')?.sceneMetrics?.modules.length>0);
 assert.equal(await page.evaluate(()=>performance.getEntriesByType('resource').filter(e=>/assets\/focus-/.test(e.name)).length),0,'no backdrop loaded at startup');
 for(const app of keys){
  try{
   await page.setViewportSize({width:1600,height:1000});await page.evaluate(key=>location.hash='object=app-'+key,app.key);
   await page.waitForFunction(key=>document.querySelector<any>('#notionWorld')?.sceneMetrics?.focusRoom?.key===key,app.key,{timeout:15000});
   for(const [width,height] of [[1600,1000],[1024,768],[2560,1080],[820,900]]){
    await page.setViewportSize({width,height});await page.waitForTimeout(220);
    const state=await page.evaluate(()=>{const m=document.querySelector<any>('#notionWorld').sceneMetrics;return {active:m.active,focus:m.focusRoom,deviceVisible:m.presentation.deviceVisible,panel:document.querySelector('#notionContent')?.getBoundingClientRect().toJSON()};});
    assert.equal(state.focus.framing,'scene-fit');const g=state.focus.geometry;assert.equal(g.subjectLeft,composition.items[app.key].subjectLeft,'runtime uses the reviewed subject boundary');assert.equal(g.scaleX,g.scaleY,'whole-scene uniform scale');assert.ok(g.x<=.1&&g.y<=.1&&g.x+g.width>=width-.1&&g.y+g.height>=height-.1,'painting fills the window: no blurred margins');assert.ok(g.x+g.width*.97<=width+.1,'primary equipment (to 97%) stays inside the window');assert.ok(g.subjectX>=Math.min(g.subjectSafeX,Math.min(0,width-g.width*.97)+g.subjectLeft*g.width)-.1,'subject sits beyond the content seam, or as far right as the painting allows');assert.ok(state.focus.cached<=3,'decoded backdrop cache bounded');assert.equal(state.deviceVisible,false,'no duplicate Pixi device');
    assert.equal(await page.locator('.pixi-open-art:visible,.mail-shared-device:visible').count(),0,'no duplicate HTML device');
    const screenshot=`${evidence}/${app.key}-${width}.png`;await page.screenshot({path:screenshot});report.push({key:app.key,width,height,status:'rendered',sourceSha256:coverage.items.find(a=>a.key===app.key).sourceSha256,screenshot,state});
   }
   await page.setViewportSize({width:600,height:800});await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>document.querySelector<any>('#notionWorld').sceneMetrics.presentation.focusScenery),false,'compact layout omits decorative backdrop');
   // Website Applets leave by World beside Fox, their Back being the page's own (#1993).
   await leaveApplet(page);await page.waitForFunction(()=>!document.querySelector<any>('#notionWorld').sceneMetrics.presentation.focusScenery);
  }catch(error){report.push({key:app.key,status:'failed',error:String(error)});await page.evaluate(()=>location.hash='');}
 }
 assert.deepEqual(errors,[],'no page exceptions');
});
await writeFile(`${evidence}/report.json`,JSON.stringify(report,null,2));
console.log({applets:keys.length,rendered:report.filter(r=>r.status==='rendered').length,failed:report.filter(r=>r.status==='failed')});
assert.equal(report.filter(r=>r.status==='failed').length,0,'Applets whose focus scene failed: '+JSON.stringify(report.filter(r=>r.status==='failed')));
