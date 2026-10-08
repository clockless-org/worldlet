import {inPolygon} from './fox-anatomy.ts';
import type {RigPoint} from './fox-anatomy.ts';
import definition from '../../resources/styles/builtin/drafts/fox-states-v1/working-rig.json' with {type:'json'};
export const FOX_WORKING_RIG=definition;
export type WorkingPlacement={x:number;y:number;angle:number};
/** One rigid transform for the complete base, lid and contact targets. */
export function placeWorkingPoint(point:RigPoint,placement?:WorkingPlacement):RigPoint{
 if(!placement)return point;
 if(![placement.x,placement.y,placement.angle].every(Number.isFinite))throw Error('Invalid working placement');
 const pivot:RigPoint=[.69,.90],r=placement.angle*Math.PI/180,c=Math.cos(r),s=Math.sin(r),x=point[0]-pivot[0],y=point[1]-pivot[1];
 return [pivot[0]+c*x-s*y+placement.x,pivot[1]+s*x+c*y+placement.y];
}
export function workingDevicePoint([x,y]:RigPoint):RigPoint{
 const {scale,offset}=definition.registration;return [offset[0]+x*scale,offset[1]+y*scale];
}
/** Orthographic projection of a rigid lid rotating around its registered
 * hinge. The two projected axes represent orthogonal directions in 3D;
 * intermediate poses follow a circular arc, not a squashed flat sprite. */
export function workingLidPoint([x,y]:RigPoint,closure:number):RigPoint{
 if(!Number.isFinite(closure)||closure<0||closure>1)throw Error('Invalid working lid closure');
 if(closure===0)return workingDevicePoint([x,y]);
 const {left,right,openAxis,closedAxis}=definition.lidHinge;
 const ax=right[0]-left[0],ay=right[1]-left[1],det=ax*openAxis[1]-ay*openAxis[0];
 const dx=x-left[0],dy=y-left[1],u=(dx*openAxis[1]-dy*openAxis[0])/det,v=(ax*dy-ay*dx)/det;
 const angle=closure*Math.PI/2,c=Math.cos(angle),s=Math.sin(angle);
 return workingDevicePoint([left[0]+u*ax+v*(openAxis[0]*c+closedAxis[0]*s),left[1]+u*ay+v*(openAxis[1]*c+closedAxis[1]*s)]);
}
/** Split the complete painted prop into keyboard behind the paws and lid in
 * front. Pixels belong to exactly one layer; no fox pixels or code-drawn keys. */
export function registerWorkingDevice(image:HTMLImageElement,completeBase?:HTMLImageElement){
 const w=image.width,h=image.height,source=document.createElement('canvas');source.width=w;source.height=h;const ctx=source.getContext('2d')!;ctx.drawImage(image,0,0);
 const pixels=ctx.getImageData(0,0,w,h),owners=new Uint8Array(w*h),bounds=[{x:w,y:h,right:0,bottom:0},{x:w,y:h,right:0,bottom:0}];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(pixels.data[(y*w+x)*4+3]){
  const index=inPolygon((x+.5)/w,(y+.5)/h,definition.screenPolygon)?1:0;owners[y*w+x]=index;
  const b=bounds[index];b.x=Math.min(b.x,x);b.y=Math.min(b.y,y);b.right=Math.max(b.right,x+1);b.bottom=Math.max(b.bottom,y+1);
 }
 const layers=bounds.map((b,index)=>{const canvas=document.createElement('canvas');canvas.width=Math.max(1,b.right-b.x);canvas.height=Math.max(1,b.bottom-b.y);const c=canvas.getContext('2d')!,data=c.createImageData(canvas.width,canvas.height);
  for(let y=b.y;y<b.bottom;y++)for(let x=b.x;x<b.right;x++)if(owners[y*w+x]===index){const i=(y*w+x)*4;data.data.set(pixels.data.subarray(i,i+4),((y-b.y)*canvas.width+x-b.x)*4);}
  c.putImageData(data,0,0);return {canvas,x:b.x,y:b.y};
 });source.width=source.height=1;
 if(completeBase){
  if(completeBase.width!==w||completeBase.height!==h)throw Error('Working base must match the registered source canvas');
  const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d')!.drawImage(completeBase,0,0);
  layers[0].canvas.width=layers[0].canvas.height=1;layers[0]={canvas:c,x:0,y:0};
 }
 return {base:layers[0],screen:layers[1],size:[w,h] as RigPoint,dispose(){for(const layer of layers)layer.canvas.width=layer.canvas.height=1;}};
}
