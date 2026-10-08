import {FOX_ANATOMY,anatomyArmVertex} from './fox-anatomy.ts';
import type {RigMatrix,RigPoint} from './fox-anatomy.ts';
import type {AnatomicalTexture} from './fox-anatomy-art.ts';
import {smoother as smooth} from './fox-skeleton.ts';
import sideSpec from '../../resources/styles/builtin/drafts/fox-states-v1/paw-side.json' with {type:'json'};

/** Use the registered painted open paw from the explaining-pose derivative. Only
 * this local sprite is registered; no generated head/body pixels are used.
 * Closed/open share UV bounds and the same wrist pixels. */
export function registerOpenPalm(image:HTMLImageElement,original:AnatomicalTexture,w:number,h:number,sideImage?:HTMLImageElement){
 const spec=FOX_ANATOMY.registeredArt.openPalmR,[left,right,bottom]=spec.textureBounds,x=Math.min(original.x,Math.floor(w*left)),y=original.y;
 const make=()=>{const canvas=document.createElement('canvas');canvas.width=Math.ceil(w*right)-x;canvas.height=Math.ceil(h*bottom)-y;return {canvas,x,y};};
 const closed=make(),openTexture=make(),edge=make();closed.canvas.getContext('2d')!.drawImage(original.canvas,original.x-x,original.y-y);
 const c=openTexture.canvas,ctx=c.getContext('2d')!;ctx.save();ctx.translate(-x,-y);ctx.scale(w,h);
 const [sx,sy]=spec.sourceWrist,[tx,ty]=spec.targetWrist;
 ctx.transform(0,spec.lengthScale,-spec.crossScale,0,tx+sy*spec.crossScale,ty-sx*spec.lengthScale);
 ctx.beginPath();ctx.rect(...spec.crop as [number,number,number,number]);ctx.clip();ctx.drawImage(image,0,0,1,1);ctx.restore();
 const raw=ctx.getImageData(0,0,c.width,c.height),base=closed.canvas.getContext('2d')!.getImageData(0,0,c.width,c.height),[start,end]=spec.blend;
 // Register the borrowed palm's proximal collar to the existing wrist before
 // mixing paint. An opacity blend alone leaves the source forearm sticking out
 // as a triangular cuff. Only this attachment band is fitted; fingers retain
 // their original pixels/geometry beyond the collar.
 const fitted=document.createElement('canvas');fitted.width=c.width;fitted.height=c.height;
 const fit=fitted.getContext('2d')!,[collarStart,collarEnd]=spec.collar;
 const span=(data:Uint8ClampedArray,row:number)=>{let lo=c.width,hi=-1;for(let col=0;col<c.width;col++)if(data[(row*c.width+col)*4+3]>90){lo=Math.min(lo,col);hi=col;}return [lo,hi] as const;};
 for(let row=0;row<c.height;row++){
  const weight=1-smooth(((closed.y+row+.5)/h-collarStart)/(collarEnd-collarStart));
  // Do not fit against the closed fist's widening knuckles. The shared
  // forearm/wrist is the attachment reference for both hand silhouettes.
  const wristRow=Math.max(0,Math.min(row,Math.floor(spec.collarWristY*h-closed.y)));
  const [lo,hi]=span(raw.data,row),[baseLo,baseHi]=span(base.data,wristRow);
  let scale=1,offset=0;
  if(weight&&hi>lo&&baseHi>baseLo){const targetLo=lo+(baseLo-lo)*weight,targetHi=hi+(baseHi-hi)*weight;scale=(targetHi-targetLo)/(hi-lo);offset=targetLo-lo*scale;}
  fit.drawImage(c,0,row,c.width,1,offset,row,c.width*scale,1);
 }
 const open=fit.getImageData(0,0,c.width,c.height);fitted.width=fitted.height=1;
 for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){
  const i=(y*c.width+x)*4,t=smooth(((closed.y+y+.5)/h-start)/(end-start)),a=base.data[i+3]/255,b=open.data[i+3]/255,alpha=a+(b-a)*t;
  for(let k=0;k<3;k++)open.data[i+k]=alpha?Math.round((base.data[i+k]*a*(1-t)+open.data[i+k]*b*t)/alpha):0;
  open.data[i+3]=Math.round(alpha*255);
 }
 ctx.putImageData(open,0,0);
 // The narrow side wall gives the paw thickness at edge-on, without fading
 // either palm. It reuses original dark paw fur, not newly drawn code shapes.
 const side=edge.canvas.getContext('2d')!,sidePixels=side.createImageData(c.width,c.height);
 for(let row=0;row<c.height;row++)if((y+row+.5)/h>=spec.sideStart){const offset=row*c.width*4;sidePixels.data.set(base.data.subarray(offset,offset+c.width*4),offset);}
 side.putImageData(sidePixels,0,0);
 // Optional painted edge study. Only the distal side changes; the old wrist
 // remains the attachment and the face textures remain pixel-identical.
 const paintedEdge=sideImage?make():undefined;
 if(paintedEdge&&sideImage){
  const cc=paintedEdge.canvas.getContext('2d')!,[sx,sy]=sideSpec.sourceWrist,[tx,ty]=sideSpec.targetWrist,[scaleX,scaleY]=sideSpec.scale;
  cc.drawImage(sideImage,(tx-sx*scaleX)*w-x,(ty-sy*scaleY)*h-y,scaleX*w,scaleY*h);
  const pixels=cc.getImageData(0,0,c.width,c.height),[a,b]=sideSpec.blend;
  for(let row=0;row<c.height;row++)for(let col=0;col<c.width;col++){
   const i=(row*c.width+col)*4,t=smooth(((y+row+.5)/h-a)/(b-a));
   const oldAlpha=sidePixels.data[i+3]/255,newAlpha=pixels.data[i+3]/255,alpha=oldAlpha*(1-t)+newAlpha*t;
   for(let k=0;k<3;k++)pixels.data[i+k]=alpha?Math.round((sidePixels.data[i+k]*oldAlpha*(1-t)+pixels.data[i+k]*newAlpha*t)/alpha):0;
   pixels.data[i+3]=Math.round(alpha*255);
  }
  cc.putImageData(pixels,0,0);
 }
 return {closed,open:openTexture,edge,paintedEdge,dispose(){for(const layer of [closed,openTexture,edge,...paintedEdge?[paintedEdge]:[]])layer.canvas.width=layer.canvas.height=1;}};
}

/** Wrist pronation as projected width, not an alpha dissolve. Swap the painted
 * face only while the distal palm is edge-on. The wrist stays connected and
 * is shared by both textures; shoulder/head transforms are untouched. */
export function turningPawVertex(point:RigPoint,matrices:ReadonlyMap<string,RigMatrix>,turn:number,surface:'face'|'edge'|'painted-edge'='face'):RigPoint{
 if(!Number.isFinite(turn)||turn<0||turn>1)throw Error('Invalid paw turn');
 const [x,y]=point,spec=FOX_ANATOMY.registeredArt.openPalmR,[pivot]=spec.targetWrist,[start,end]=spec.turnBlend;
 const influence=smooth((y-start)/(end-start)),width=surface==='face'?Math.abs(Math.cos(Math.PI*turn)):(surface==='painted-edge'?sideSpec.projectedThickness:spec.sideThickness)*Math.sin(Math.PI*turn);
 return anatomyArmVertex('R',[pivot+(x-pivot)*(1+(width-1)*influence),y],matrices);
}
