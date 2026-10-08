import spec from '../../resources/styles/builtin/drafts/fox-states-v1/paw-grasp-parts.json' with {type:'json'};
import {drawAnatomySkin} from './fox-anatomy-skin.ts';
import {createAnatomyGPUSkin} from './fox-anatomy-gpu-skin.ts';
import {anatomyArmVertex,type RigPoint,type RigMatrix} from './fox-anatomy.ts';
import type {AnatomicalTexture} from './fox-anatomy-art.ts';
import {smooth} from './fox-skeleton.ts';

export type GraspDigit='thumb'|'index'|'middle'|'outer';
export type GraspControls=Readonly<Record<GraspDigit,number>>;
const registration=spec.registration;
const roots:Record<string,RigPoint>=Object.fromEntries(Object.entries(registration.roots).map(([id,[x,y]])=>[id,[x,y] as RigPoint]));
const radians=(degrees:number)=>degrees*Math.PI/180;
const boundYOffset=-.01;
// Hide the attachment caps behind the palm, with the opposing thumb in front.
// Do not alpha-feather exposed finger edges: they are part of the silhouette.
const drawOrder=['outer','middle','index','palm','thumb'] as const;
/** Orthographic two-link finger curl. Bone lengths stay fixed in 3D; the
 * projection gets shorter as the digit curls toward the viewer. Keep both
 * surfaces front-facing until back-face/sidewall art has been authored. */
export function graspVertex(id:string,source:RigPoint,curl=0):readonly [number,number,number]{
 if(!Number.isFinite(curl)||curl<0||curl>1)throw Error('Invalid digit curl');
 const part=spec.parts.find(p=>p.id===id);if(!part)throw Error('Unknown grasp part');
 // Static bind proportions belong to the artwork pack. Short rounded digits
 // overlap the palm instead of dangling like human fingers. Animation still
 // preserves these authored segment lengths at every curl.
 const width=id==='palm'?registration.palmScale:id==='thumb'?registration.thumbScale:registration.fingerWidthScale;
 const length=id==='palm'?registration.palmScale:id==='thumb'?registration.thumbScale:registration.fingerLengthScale,root=roots[id];
 const x=(source[0]-part.root[0])*width,y=(source[1]-part.root[1])*length;
 if(id==='palm')return [root[0]+x,root[1]+y,0];
 if(id==='thumb'){
  const a=radians(-65+120*curl);
  return [root[0]+x*Math.cos(a)-y*Math.sin(a),root[1]+x*Math.sin(a)+y*Math.cos(a),.001];
 }
 const first=radians(35*curl),second=radians(60*curl),hinge=registration.fingerHinge;
 const proximal=Math.min(Math.max(0,y),hinge),distal=Math.max(0,y-hinge),behind=Math.min(0,y);
 const projected=behind+proximal*Math.cos(first)+distal*Math.cos(second);
 const depth=proximal*Math.sin(first)+distal*Math.sin(second);
 const spread=radians((id==='index'?-8:id==='outer'?8:0)*(1-curl));
 return [root[0]+x*Math.cos(spread)-projected*Math.sin(spread),root[1]+x*Math.sin(spread)+projected*Math.cos(spread),depth];
}

/** Isolated assembly review only. Does not replace the established wrist or
 * claim a grip on a prop: handle occlusion and forearm registration come next. */
export async function createGraspStudy(source:string,wrist?:{texture:AnatomicalTexture;size:RigPoint}){
 const image=new Image();image.src=source;await image.decode();
 if(image.naturalWidth!==spec.size[0]||image.naturalHeight!==spec.size[1])throw Error('Grasp atlas dimensions changed');
 const parts=spec.parts.map(part=>{
  const [x,y,w,h]=part.crop,canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  canvas.getContext('2d')!.drawImage(image,x,y,w,h,0,0,w,h);
  return {id:part.id,canvas,x,y};
 });let disposed=false;const gpu=createAnatomyGPUSkin();
 let collar:AnatomicalTexture|undefined,boundPalm:typeof parts[number]|undefined;
 if(wrist){
  const original=wrist.texture,c=document.createElement('canvas');c.width=original.canvas.width;c.height=original.canvas.height;
  const ctx=c.getContext('2d')!;ctx.drawImage(original.canvas,0,0);const pixels=ctx.getImageData(0,0,c.width,c.height);
  for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)pixels.data[(y*c.width+x)*4+3]*=1-smooth(((original.y+y+.5)/wrist.size[1]-.938)/.009);
  ctx.putImageData(pixels,0,0);collar={canvas:c,x:original.x,y:original.y};
  const palm=parts.find(p=>p.id==='palm')!,pc=document.createElement('canvas');pc.width=palm.canvas.width;pc.height=palm.canvas.height;
  const pctx=pc.getContext('2d')!;pctx.drawImage(palm.canvas,0,0);const pp=pctx.getImageData(0,0,pc.width,pc.height);
  for(let y=0;y<pc.height;y++)for(let x=0;x<pc.width;x++){
   const point=graspVertex('palm',[palm.x+x+.5,palm.y+y+.5]);pp.data[(y*pc.width+x)*4+3]*=smooth((point[1]+boundYOffset-.932)/.006);
  }
  pctx.putImageData(pp,0,0);boundPalm={...palm,canvas:pc};
 }
 return {
  draw(ctx:CanvasRenderingContext2D,controls:GraspControls){
   if(disposed)throw Error('Grasp study disposed');
   for(const value of Object.values(controls))if(!Number.isFinite(value)||value<0||value>1)throw Error('Invalid digit curl');
   ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height);
   const batch=gpu.beginFrame(ctx,ctx.canvas.width,ctx.canvas.height),drawSkin=batch?gpu.draw:drawAnatomySkin;
   try{
   for(const id of drawOrder){
    const part=parts.find(p=>p.id===id)!;
    drawSkin(ctx,part,[image.width,image.height],[ctx.canvas.width,ctx.canvas.height],uv=>{
     const p=graspVertex(id,[uv[0]*image.width,uv[1]*image.height],id==='palm'?0:controls[id as GraspDigit]);
     return [(p[0]-.625)/.13,(p[1]-.89)/.13];
    },id==='palm'?1:12,id==='palm'?1:48);
   }
   if(batch&&!gpu.endFrame())throw Error('Grasp preview GPU context lost');
   }catch(error){if(batch)gpu.abortFrame();throw error;}
  },
  drawBound(ctx:CanvasRenderingContext2D,controls:GraspControls,matrices:ReadonlyMap<string,RigMatrix>,drawSkin=drawAnatomySkin){
   if(disposed)throw Error('Grasp study disposed');
   if(!collar||!wrist||!boundPalm)throw Error('Original wrist registration is required');
   // Fit only the old fist's flaring collar into the narrower palm. The
   // proximal forearm stays untouched; retaining the knuckle-width rim here
   // makes the assembled hand look like it is wearing a rigid cuff.
   drawSkin(ctx,collar,wrist.size,[ctx.canvas.width,ctx.canvas.height],p=>{
    const fit=1-.35*smooth((p[1]-.910)/.028);
    return anatomyArmVertex('R',[.677+(p[0]-.677)*fit,p[1]],matrices);
   },16,64);
   for(const id of drawOrder){
    const part=id==='palm'?boundPalm:parts.find(p=>p.id===id)!;
    drawSkin(ctx,part,[image.width,image.height],[ctx.canvas.width,ctx.canvas.height],uv=>{
     const p=graspVertex(id,[uv[0]*image.width,uv[1]*image.height],id==='palm'?0:controls[id as GraspDigit]);
     return anatomyArmVertex('R',[p[0],p[1]+boundYOffset],matrices);
    },12,48);
   }
  },
  dispose(){if(disposed)return;disposed=true;gpu.dispose();for(const p of [...parts,...collar?[collar]:[],...boundPalm?[boundPalm]:[]])p.canvas.width=p.canvas.height=1;}
 };
}
