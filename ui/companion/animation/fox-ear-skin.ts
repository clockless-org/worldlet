import {FOX_ANATOMY,transform} from './fox-anatomy.ts';
import type {RigPoint,RigMatrix} from './fox-anatomy.ts';

/** Cartilage bends above a pinned root; the face never participates. */
export function earRootWeight(side:'L'|'R',point:RigPoint){
 const spec=FOX_ANATOMY.registeredArt.earSkin[side];let nearest=Infinity,signed=0;
 for(let i=1;i<spec.root.length;i++){
  const a=spec.root[i-1],b=spec.root[i],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
  const u=Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/(length*length)));
  const distance=Math.hypot(point[0]-a[0]-u*dx,point[1]-a[1]-u*dy);
  if(distance<nearest){nearest=distance;signed=distance*Math.sign((dx*(point[1]-a[1])-dy*(point[0]-a[0]))*spec.tipSide);}
 }
 const t=Math.max(0,Math.min(1,signed/spec.blendDistance));return t*t*t*(10+t*(-15+6*t));
}
export function earVertex(side:'L'|'R',point:RigPoint,matrices:Map<string,RigMatrix>):RigPoint{
 return deformEar(side,point,matrices,earRootWeight(side,point));
}
function deformEar(side:'L'|'R',point:RigPoint,matrices:ReadonlyMap<string,RigMatrix>,weight:number):RigPoint{
 const base=transform(matrices.get('head')!,point),tip=transform(matrices.get('ear'+side)!,point);
 return [base[0]+(tip[0]-base[0])*weight,base[1]+(tip[1]-base[1])*weight];
}

/** Bind-space weights do not change with pose or display size. Keep a bounded
 * cache per inspector, using exact coordinates (no rounding or mesh reduction).
 * Diagnostic grids may exceed the cap; clearing only costs recomputation. */
export function createEarVertexSampler(side:'L'|'R',capacity=4096){
 if(!Number.isInteger(capacity)||capacity<1||capacity>65536)throw Error('Invalid ear weight cache capacity');
 const columns=new Map<number,Map<number,number>>();let count=0;
 return (point:RigPoint,matrices:ReadonlyMap<string,RigMatrix>):RigPoint=>{
  let column=columns.get(point[0]),weight=column?.get(point[1]);
  if(weight===undefined){
   weight=earRootWeight(side,point);
   if(count>=capacity){columns.clear();count=0;column=undefined;}
   if(!column){column=new Map();columns.set(point[0],column);}
   column.set(point[1],weight);count++;
  }
  return deformEar(side,point,matrices,weight);
 };
}
