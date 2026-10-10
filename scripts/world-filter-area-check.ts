import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {bundleScript} from './browser-test.ts';

const bundle=await bundleScript({stdin:{contents:`
 import {Application,Container,Graphics,Rectangle,ColorMatrixFilter,BlurFilter} from 'pixi.js';
 import {viewportFilterArea} from './ui/world/village/viewport-filter-area.ts';
 import {guardFilterResolution} from './ui/world/village/pixi-filter-resolution.ts';
 export async function check(){
  let cases=0,oldClips=0;
  for(const resolution of [1,2]){
   const app=new Application();await app.init({preference:'webgl',width:800,height:600,resolution,background:0xff0000});
   guardFilterResolution(app.renderer.filter);
   const world=new Container();world.addChild(new Graphics().rect(-10000,-10000,20000,20000).fill(0x00ff00));app.stage.addChild(world);
   const tone=new ColorMatrixFilter({resolution:'inherit'}),blur=new BlurFilter({strength:3,quality:3,resolution:.5}),area=new Rectangle();
   for(const [width,height] of [[800,600],[1200,720],[640,800],[800,600]])for(const scale of [.65,1,1.8])for(const blurred of [false,true]){
    app.renderer.resize(width,height);const view={x:-137.5,y:-83.25,scale};world.position.set(view.x,view.y);world.scale.set(scale);world.filters=blurred?[tone,blur]:[tone];
    const sample=()=>{app.render();const {pixels,width:w,height:h}=app.renderer.extract.pixels({target:app.stage,frame:new Rectangle(0,0,width,height),resolution});
     return [[2,2],[w-3,2],[2,h-3],[w-3,h-3],[w-3,Math.floor(h/2)],[Math.floor(w/2),h-3]].map(([x,y])=>pixels[(y*w+x)*4+1]);};
    area.x=area.y=0;area.width=width;area.height=height;world.filterArea=area;
    if(sample().some(g=>g<240))oldClips++;
    world.filterArea=viewportFilterArea(area,view,width,height);
    if(sample().some(g=>g<240))throw Error('Clipped '+JSON.stringify({width,height,scale,blurred,resolution}));
    cases++;
   }
   app.destroy(true,{children:true});tone.destroy();blur.destroy();
  }return {cases,oldClips};
 }`,resolveDir:process.cwd(),loader:'ts'},globalName:'filterCheck'});
const browser=await chromium.launch();
try{
 const page=await browser.newPage();await page.addScriptTag({content:bundle});
 const result=await page.evaluate(()=>(window as any).filterCheck.check());
 assert.equal(result.cases,48);assert.ok(result.oldClips>0,'Original clipping must reproduce');
 console.log('PASS viewport filter coverage, resize, zoom, Retina and blur',result);
}finally{await browser.close();}
