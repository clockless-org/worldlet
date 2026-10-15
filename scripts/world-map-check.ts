/** A static map uses the host's area buttons and real Attention rows; it cannot supply executable actions. */
import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {build} from 'esbuild';import {launchTestBrowser,pageErrors} from './browser-test.ts';
const script=await build({stdin:{contents:"export {renderWorldMap} from './ui/world/world-map.ts';export {mountMapAttention} from './ui/hud/map-attention.ts';",resolveDir:process.cwd(),loader:'ts'},bundle:true,format:'iife',globalName:'MapUI',write:false});
const browser=await launchTestBrowser();try{
 const page=await browser.newPage({viewport:{width:1500,height:844}}),errors=pageErrors(page,{console:true});
 await page.setContent('<!doctype html><title>Shared painted world</title><main id="notionWorld" data-world-renderer="map" style="position:fixed;inset:0;--world-map-paper:#19251e;--world-map-ink:#fff8df;--world-map-accent:#c4ad71;--world-map-bodyFont:Georgia"><div id="map" style="position:absolute;inset:0"></div><div id="pins"></div><nav class="world-task-tracker"><div class="world-task-list"></div></nav><div class="world-today"></div></main>');
 await page.addStyleTag({content:(await readFile('dist/WorldletWeb/worldlet-ui.css','utf8'))+'\n'+await readFile('ui/world/world-map.css','utf8')});await page.addScriptTag({content:script.outputFiles[0].text});
 await page.evaluate(async()=>{
  const w=window as any,root=document.getElementById('notionWorld')!;w.chosen=[];
  w.state={view:{id:'overview',level:'overview'},areas:[{id:'building-home',title:'Home'},{id:'building-work',title:'Work'}],applets:[],pins:{},motion:false,environment:{},interaction:{placementArea:null,framedArea:null,inset:0,hoveredApplet:null,hoveredArea:null}};
  w.mount=w.MapUI.renderWorldMap({host:document.getElementById('map'),state:w.state,asset:()=> 'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="844"><rect width="1500" height="844" fill="#263b30"/></svg>'),navigate(){},menu(){},moveApplet(){},marks(points){w.points=points;const pins=document.getElementById('pins')!;pins.replaceChildren();for(const p of Object.values(points) as any[]){const b=document.createElement('button');b.className='notion-pin';b.dataset.kind='region-more';b.style.cssText=`position:absolute;left:${p.x}px;top:${p.y}px;visibility:${p.visible?'visible':'hidden'}`;b.textContent=p.id;b.onclick=()=>w.chosen.push(p.id);pins.append(b);}}},{background:'assets/map.svg',imageSize:[1500,844],sha256:'0'.repeat(64),areas:{home:{anchor:[.3,.2],description:'Home place'},work:{anchor:[.7,.4]}}});
  await w.mount.ready;
  const tracker=root.querySelector<HTMLElement>('.world-task-tracker')!,list=root.querySelector('.world-task-list')!;for(const key of ['event','needsAction','unseen']){const group=document.createElement('section');group.className='world-task-group';group.dataset.group=key;const button=document.createElement('button');button.className='world-matter';button.textContent='Original '+key;button.onclick=()=>w.chosen.push(key);group.append(button);list.append(group);}
  w.rail=w.MapUI.mountMapAttention(root,tracker,root.querySelector('.world-today'),()=>{});
 });
 assert.equal(await page.title(),'Shared painted world');await page.getByRole('button',{name:'building-home',exact:true}).click();assert.deepEqual(await page.evaluate(()=>(window as any).chosen),['building-home']);
 assert.equal(await page.evaluate(()=>(window as any).points['building-work'].x),1050);
 await page.evaluate(()=>{const w=window as any;w.state.interaction.locked=true;w.mount.update(w.state);});assert.equal(await page.getByRole('button',{name:'building-home',exact:true}).isVisible(),false);
 await page.evaluate(()=>{const w=window as any;w.state.interaction.locked=false;w.mount.update(w.state);});
 const open=page.getByRole('button',{name:'Worth Doing',exact:true});await open.click();assert.equal(await page.getByRole('button',{name:'Original needsAction',exact:true}).isVisible(),true);assert.equal(await page.getByRole('button',{name:'Original event',exact:true}).isVisible(),false);
 await page.keyboard.press('Escape');assert.equal(await open.evaluate(e=>document.activeElement===e),true);assert.equal(await open.getAttribute('aria-expanded'),'false');
 await open.click();await page.getByRole('button',{name:'Original needsAction',exact:true}).click();assert.deepEqual(await page.evaluate(()=>(window as any).chosen),['building-home','needsAction']);assert.equal(await open.getAttribute('aria-expanded'),'false','original action closes the rail');
 await page.evaluate(()=>{const w=window as any;w.state.interaction.covered=true;w.mount.update(w.state);});assert.equal(await page.getByRole('button',{name:'building-work',exact:true}).isVisible(),false);
 await page.evaluate(()=>(window as any).mount.dispose());assert.equal(await page.locator('.world-map-canvas').count(),0);assert.equal(await page.locator('#pins button').count(),0);assert.deepEqual(errors,[]);
 console.log('PASS shared world map: decoded art, live host marks, lock/coverage, real Attention actions, Escape focus and disposal at 1500 × 844');
}finally{await browser.close();}
