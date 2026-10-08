import {FOX_ANATOMY,anatomyOwner} from './fox-anatomy.ts';

export type AnatomicalTexture={canvas:HTMLCanvasElement;x:number;y:number};
/** Only the proximal attachment blends into the authored torso. Distal fur and
 * paws keep their original alpha. This does not deform or scale any anatomy. */
export function shoulderOpacity(side:'L'|'R',y:number){
 const [start,end]=FOX_ANATOMY.registeredArt.arms[side].shoulderBlend,t=Math.max(0,Math.min(1,(y-start)/(end-start)));
 return t*t*t*(10+t*(-15+6*t));
}
const canvas=(w:number,h:number)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
function crop(data:ImageData,keep:(x:number,y:number)=>boolean):AnatomicalTexture{
 let x0=data.width,y0=data.height,x1=0,y1=0;
 for(let y=0;y<data.height;y++)for(let x=0;x<data.width;x++)if(data.data[(y*data.width+x)*4+3]&&keep(x,y)){x0=Math.min(x0,x);x1=Math.max(x1,x+1);y0=Math.min(y0,y);y1=Math.max(y1,y+1);}
 const c=canvas(Math.max(1,x1-x0),Math.max(1,y1-y0)),ctx=c.getContext('2d')!,out=ctx.createImageData(c.width,c.height);
 for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(keep(x,y)){const i=(y*data.width+x)*4;out.data.set(data.data.subarray(i,i+4),((y-y0)*c.width+x-x0)*4);}
 ctx.putImageData(out,0,0);return {canvas:c,x:x0,y:y0};
}
/** Register complete painted limb contours and a coherent foreleg-free torso.
 * This is runtime atlas extraction, not procedural fur/face replacement. */
export function registerAnatomyArt(body:HTMLImageElement,limbs:HTMLImageElement,w:number,h:number){
 const source=canvas(w,h),ctx=source.getContext('2d')!;ctx.drawImage(body,0,0,w,h);const pixels=ctx.getImageData(0,0,w,h);
 const bodyIds=['pelvis','chest','thighL','footL','thighR','footR'],owners=new Int8Array(w*h).fill(-1),tailPixels=new Uint8Array(w*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  if(!pixels.data[(y*w+x)*4+3])continue;
  let id=FOX_ANATOMY.parts[anatomyOwner((x+.5)/w,(y+.5)/h)].id;
  if(id==='tail')tailPixels[y*w+x]=1;
  if(/^(upperArm|forearm|paw)[LR]$/.test(id))id='chest';
  owners[y*w+x]=bodyIds.indexOf(id);
 }
 const bodyLayers=new Map(bodyIds.map((id,i)=>[id,crop(pixels,(x,y)=>owners[y*w+x]===i)]));
 // These five adjacent depth layers share one support field. Assemble before
 // meshing so antialiasing a separate thigh/foot cut cannot expose a seam.
 let supportMask=Uint8Array.from(owners,owner=>owner>0?1:0);
 // Two source pixels of existing painted fur bridge antialiasing at the
 // separately rendered tail cut. This is atlas edge overlap, not enlarged
 // anatomy or invented hidden fur. Both sides use the same support mapping.
 for(let pass=0;pass<2;pass++){
  const next=supportMask.slice();
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
   const i=y*w+x;if(tailPixels[i]&&!supportMask[i]&&(supportMask[i-1]||supportMask[i+1]||supportMask[i-w]||supportMask[i+w]))next[i]=1;
  }
  supportMask=next;
 }
 const supportBody=crop(pixels,(x,y)=>Boolean(supportMask[y*w+x]));
 const arms=new Map<'L'|'R',AnatomicalTexture>(),distal=new Map<'L'|'R',AnatomicalTexture>(),proximal=new Map<'L'|'R',AnatomicalTexture>();
 for(const side of ['L','R'] as const){
  const spec=FOX_ANATOMY.registeredArt.arms[side];ctx.clearRect(0,0,w,h);ctx.save();ctx.scale(w,h);
  ctx.transform(...spec.matrix as [number,number,number,number,number,number]);ctx.beginPath();ctx.rect(...spec.crop as [number,number,number,number]);ctx.clip();ctx.drawImage(limbs,0,0,1,1);ctx.restore();
  const data=ctx.getImageData(0,0,w,h);
  for(let y=0;y<h;y++){const weight=shoulderOpacity(side,(y+.5)/h);if(weight===1)continue;for(let x=0;x<w;x++)data.data[(y*w+x)*4+3]*=weight;}
  arms.set(side,crop(data,()=>true));
  proximal.set(side,crop(data,(_x,y)=>y<h*.835));distal.set(side,crop(data,(_x,y)=>y>=h*.835));
 }
 source.width=source.height=1;
 return {bodyLayers,supportBody,arms,proximal,distal,dispose(){supportBody.canvas.width=supportBody.canvas.height=1;for(const map of [bodyLayers,arms,proximal,distal]){for(const t of map.values())t.canvas.width=t.canvas.height=1;map.clear();}}};
}
