import {Container,Graphics,Sprite,type Texture} from 'pixi.js';
import {WORLD_WIDTH,WORLD_HEIGHT} from './world-design.ts';
import type {WorldOcclusion,WorldPoint} from './world-pack.ts';

/** Registered architecture keeps the original plate's pixels above objects behind it.
 * No new raster, duplicate decode, shader or approximation of the painted material. */
export function createSceneOcclusion(world:Container,specs:WorldOcclusion[],day:Texture,night:Texture){
 const layers=specs.map(spec=>{
  const group=new Container(),mask=new Graphics(),sun=new Sprite(day),moon=new Sprite(night);
  group.label='occlusion:'+spec.id;group.zIndex=100+spec.depth*WORLD_HEIGHT;group.eventMode='none';
  for(const sprite of [sun,moon]){sprite.width=WORLD_WIDTH;sprite.height=WORLD_HEIGHT;sprite.eventMode='none';}
  group.addChild(sun,moon,mask);group.mask=mask;world.addChild(group);
  return {spec,group,mask,moon,points:spec.day};
 });
 let light=-1;
 const update=(amount:number)=>{
  if(amount===light)return;light=amount;
  for(const field of layers){
   field.points=field.spec.day.map((p,i)=>[p[0]+(field.spec.night[i][0]-p[0])*amount,p[1]+(field.spec.night[i][1]-p[1])*amount] as WorldPoint);
   field.mask.clear().poly(field.points.flatMap(([x,y])=>[x*WORLD_WIDTH,y*WORLD_HEIGHT])).fill(0xffffff);
   field.moon.alpha=amount;
  }
 };
 update(0);
 return {update,
  /** Do not let an invisible piece of a device intercept a click on its foreground wall. */
  occludes(x:number,y:number,depth:number){
   x/=WORLD_WIDTH;y/=WORLD_HEIGHT;
   return layers.some(({points,group})=>{
    if(depth>=group.zIndex)return false;
    let inside=false;
    for(let i=0,j=points.length-1;i<points.length;j=i++){
     const a=points[i],b=points[j];
     if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
    }
    return inside;
   });
  },
  get metrics(){return {lighting:light,layers:layers.map(({spec,points})=>({id:spec.id,depth:spec.depth,points}))};},
  destroy(){for(const {group} of layers)group.destroy({children:true});}
 };
}
