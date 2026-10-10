import {APPLET_SPRITES} from '../ui/world/applet-sprites.ts';
import {WORLD_APPS} from '../core/applets/catalog.ts';
import assert from 'node:assert/strict';
import {villageCamera,approachVillageCamera,WORLD_EXTENT,WORLD_OVERVIEW,OVERVIEW_CENTER} from '../ui/world/village/village-camera.ts';
import {VILLAGE_SITES} from '../ui/world/village/village-sites.ts';
// The design reference is independent from texture resolution and Retina scale.
assert.equal(WORLD_EXTENT.width,1920);assert.equal(WORLD_EXTENT.height,1080);
const exact=villageCamera(1920,1080,1,OVERVIEW_CENTER);
for(const factor of [.5,.75,1,4/3,2]){
 const resized=villageCamera(1920*factor,1080*factor,1,OVERVIEW_CENTER);
 for(const site of Object.values(VILLAGE_SITES)){
  const project=(view,w,h)=>[(view.x+site.center[0]*WORLD_EXTENT.width*view.scale)/w,(view.y+site.center[1]*WORLD_EXTENT.height*view.scale)/h];
  const a=project(exact,1920,1080),b=project(resized,1920*factor,1080*factor);
  assert(a.every((v,i)=>Math.abs(v-b[i])<1e-9),'Window resizing preserves normalized screen placement');
 }
}
for(const anchor of [[.2,.2],[.8,.8]]){
 const moved=villageCamera(1920,1080,1,anchor);
 assert.notEqual(moved.x,exact.x,'overview margins permit horizontal camera travel');
 assert.notEqual(moved.y,exact.y,'overview margins permit vertical camera travel');
}
for(const [w,h] of [[1143,768],[1440,900],[900,650],[1920,1080],[800,900]]){
 const overview=villageCamera(w,h,1,[.5,.5]);
 const oldScale=Math.max(w/(WORLD_EXTENT.width*WORLD_OVERVIEW[2]),h/(WORLD_EXTENT.height*WORLD_OVERVIEW[3]));
 assert.equal(overview.scale,oldScale,'overview covers the authored inner frame');
 assert.equal(overview.x,Math.max(w-WORLD_EXTENT.width*oldScale,Math.min(0,w/2-WORLD_EXTENT.width/2*oldScale)),'overview remains centered');
 for(const site of [{center:[.5,.5]},...Object.values(VILLAGE_SITES)]){
  const camera=villageCamera(w,h,site.center[0]===.5?1:2.25,site.center);
  assert.ok(camera.x+WORLD_EXTENT.x*camera.scale<=.01&&camera.x+(WORLD_EXTENT.x+WORLD_EXTENT.width)*camera.scale>=w-.01,'extended terrain covers horizontal viewport edges');
  assert.ok(camera.y+WORLD_EXTENT.y*camera.scale<=.01&&camera.y+(WORLD_EXTENT.y+WORLD_EXTENT.height)*camera.scale>=h-.01,'extended terrain covers vertical viewport edges');
  if(site.center[0]!==.5){
   assert.ok(Math.abs(camera.x+site.center[0]*WORLD_EXTENT.width*camera.scale-w/2)<.01,'Region centers horizontally, including edge Regions');
   assert.ok(Math.abs(camera.y+site.center[1]*WORLD_EXTENT.height*camera.scale-h/2)<.01,'Region centers vertically');
  }
 }
}
console.log('PASS full-bleed world and Region camera: independent of HUD, no exposed edges');
assert.deepEqual(Object.keys(APPLET_SPRITES).sort(),WORLD_APPS.map(a=>a.key).sort(),'each installed Applet has an explicit sprite slot');
for(const entry of Object.values(APPLET_SPRITES)){assert.ok(entry.width>0);assert.ok(entry.anchor.every(n=>n>0&&n<1));}

for(const [w,h] of [[1440,960],[1920,1080],[800,900]])for(const site of Object.values(VILLAGE_SITES)){
 const target=villageCamera(w,h,1,[.5,.5]);
 let current=villageCamera(w,h,2.25,site.center);
 for(let frame=0;frame<100;frame++){
  const next=approachVillageCamera(current,target,.16);
  for(const axis of ['x','y','scale'] as const){
   assert.ok(Math.abs(next[axis]-target[axis])<=Math.abs(current[axis]-target[axis])+1e-8,'Region exit moves monotonically to overview without a rebound');
  }
  assert.ok(next.x+WORLD_EXTENT.x*next.scale<=.01&&next.x+(WORLD_EXTENT.x+WORLD_EXTENT.width)*next.scale>=w-.01);
  assert.ok(next.y+WORLD_EXTENT.y*next.scale<=.01&&next.y+(WORLD_EXTENT.y+WORLD_EXTENT.height)*next.scale>=h-.01);
  current=next;
 }
}
console.log('PASS all Region exit paths: no reversal or exposed terrain edges');

// Retired render-target textures must not crash a window resize.
const {guardFilterResolution}=await import('../ui/world/village/pixi-filter-resolution.ts');
const filter={_filterStackIndex:2,_filterStack:[{}, {skip:false,inputTexture:{source:null}}],_findFilterResolution(root){return this._filterStack[1].inputTexture.source._resolution;}};
guardFilterResolution(filter);
assert.equal(filter._findFilterResolution(2),2,'retired source inherits renderer resolution');
filter._filterStack[1].inputTexture.source={_resolution:1};
assert.equal(filter._findFilterResolution(2),1,'live textures retain Pixi resolution behavior');
