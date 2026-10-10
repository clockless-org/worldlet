import {rotatePoint as rotate,type RigPoint} from './fox-anatomy.ts';
import {readingArmPoint} from './fox-reading-study.ts';
import {solveReadingArm} from './fox-reading-page.ts';
import {drawAnatomySkin} from './fox-anatomy-skin.ts';
import definition from '../../../resources/styles/builtin/drafts/fox-states-v1/reading-rig.json' with {type:'json'};
import parts from '../../../resources/styles/builtin/drafts/fox-states-v1/reading-grip-parts-v1.json' with {type:'json'};

/** Two rigid bones registered to the existing left holding-arm contacts.
 * Original-cut ownership remains a diagnostic, not the Dev painted surface. */
export const READING_LEFT_ELBOW:RigPoint=[.13,.83];
const sourceShoulder:RigPoint=[definition.sourceShoulders.L[0],definition.sourceShoulders.L[1]];
const sourceGrip:RigPoint=[definition.sourceGrips.L[0],definition.sourceGrips.L[1]];
export function readingLeftGripRig(target:RigPoint){
 if(target.some(v=>!Number.isFinite(v)))throw Error('Invalid reading grip target');
 const shoulder=readingArmPoint('L',sourceShoulder),elbow=readingArmPoint('L',READING_LEFT_ELBOW),grip=readingArmPoint('L',sourceGrip);
 const angles=solveReadingArm(shoulder,elbow,grip,target);
 if(!angles.reachable)throw Error('Reading grip target exceeds authored arm reach');
 const movedElbow=rotate(elbow,shoulder,angles.upper);
 return {
  shoulder,elbow:movedElbow,target,
  vertex(point:RigPoint,part:'upper'|'forearm'):RigPoint{
   const p=readingArmPoint('L',point);
   if(part==='upper')return rotate(p,shoulder,angles.upper);
   const q=rotate(p,elbow,angles.lower);return [q[0]+movedElbow[0]-elbow[0],q[1]+movedElbow[1]-elbow[1]];
  }
 };
}

/** Complete independently painted surfaces use one similarity per bone. */
export function readingLeftGripArt(target:RigPoint){return gripArt(readingLeftGripRig(target),target);}
// One similarity per bone, from its painted span onto the solved one.
function gripArt(rig:{shoulder:RigPoint;elbow:RigPoint},target:RigPoint){
 return {vertex(point:RigPoint,part:'upper'|'forearm'):RigPoint{
  const {start:a,end:b}=parts[part],p=part==='upper'?rig.shoulder:rig.elbow,q=part==='upper'?rig.elbow:target;
  const sx=b[0]-a[0],sy=b[1]-a[1],tx=q[0]-p[0],ty=q[1]-p[1],den=sx*sx+sy*sy,c=(tx*sx+ty*sy)/den,s=(ty*sx-tx*sy)/den;
  const x=point[0]-a[0],y=point[1]-a[1];return [p[0]+c*x-s*y,p[1]+s*x+c*y];
 }};
}

/** Retain the authored page-turn chain, whose longer forearm keeps its elbow
 * below the hand. Mirroring the shorter left forearm swings across the neck. */
export function readingRightGripRig(target:RigPoint){
 if(target.some(v=>!Number.isFinite(v)))throw Error('Invalid reading grip target');
 const d=definition.turnArm,a=d.sourceShoulder,b=d.sourceGrip,p=definition.shoulders.R,q=d.bindGrip;
 const sx=b[0]-a[0],sy=b[1]-a[1],tx=q[0]-p[0],ty=q[1]-p[1],den=sx*sx+sy*sy,c=(tx*sx+ty*sy)/den,s=(ty*sx-tx*sy)/den;
 const shoulder:RigPoint=[p[0],p[1]],dx=d.sourceElbow[0]-a[0],dy=d.sourceElbow[1]-a[1];
 const restElbow:RigPoint=[p[0]+c*dx-s*dy,p[1]+s*dx+c*dy];
 const rotation=solveReadingArm(shoulder,restElbow,[q[0],q[1]],target,-1);
 if(!rotation.reachable)throw Error('Reading right grip exceeds authored reach');
 const x=restElbow[0]-p[0],y=restElbow[1]-p[1],angle=rotation.upper;
 const elbow:RigPoint=[p[0]+Math.cos(angle)*x-Math.sin(angle)*y,p[1]+Math.sin(angle)*x+Math.cos(angle)*y];
 return {shoulder,elbow,target};
}

export function readingRightGripArt(target:RigPoint){return gripArt(readingRightGripRig(target),target);}

/** Complete painted surfaces shared by Dev and the opt-in comparison studio.
 * Originals stay untouched; source crops and pivots belong to the style pack. */
export async function createReadingLeftGripArt(sources:{upper:string;forearm:string}){
 const layers=await Promise.all((['upper','forearm'] as const).map(async part=>{
  const image=new Image();image.src=sources[part];await image.decode();
  const w=image.width,h=image.height;
  const [x,y,width,height]=parts[part].crop.map((v,i)=>Math.round(v*(i%2?h:w)));
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  canvas.getContext('2d')!.drawImage(image,x,y,width,height,0,0,width,height);
  return {part,canvas,x,y,size:[w,h] as RigPoint};
 }));
 // Keep the complete forearm behind the cover, then repeat only its distal
 // fur above it. The soft mask is depth ownership, not an amputated source.
 const fore=layers[1],pawCanvas=document.createElement('canvas');pawCanvas.width=fore.canvas.width;pawCanvas.height=fore.canvas.height;
 const pawContext=pawCanvas.getContext('2d')!;pawContext.drawImage(fore.canvas,0,0);
 const pixels=pawContext.getImageData(0,0,pawCanvas.width,pawCanvas.height),a=parts.forearm.start,b=parts.forearm.end,dx=b[0]-a[0],dy=b[1]-a[1],den=dx*dx+dy*dy;
 for(let y=0;y<pawCanvas.height;y++)for(let x=0;x<pawCanvas.width;x++){
  const along=(((x+fore.x)/fore.size[0]-a[0])*dx+((y+fore.y)/fore.size[1]-a[1])*dy)/den;
  const u=Math.max(0,Math.min(1,(along-parts.foregroundPaw.start)/(parts.foregroundPaw.end-parts.foregroundPaw.start)));
  pixels.data[(y*pawCanvas.width+x)*4+3]*=u*u*(3-2*u);
 }
 pawContext.putImageData(pixels,0,0);const paw={...fore,canvas:pawCanvas};
 return {
  draw(stage:'back'|'front'|'paw',ctx:CanvasRenderingContext2D,size:RigPoint,target:RigPoint,drawSkin=drawAnatomySkin,side:'L'|'R'='L'){
   const layer=stage==='paw'?paw:layers[stage==='back'?0:1],rig=side==='L'?readingLeftGripArt(target):readingRightGripArt(target);
   drawSkin(ctx,layer,layer.size,size,p=>rig.vertex(p,layer.part),24,24);
  },
  dispose(){for(const layer of [...layers,paw])layer.canvas.width=layer.canvas.height=1;}
 };
}

/** Source-space ownership; both pieces keep a small elbow overlap. No
 * interpolation stretches the fur or paw, even at the farthest valid reach. */
export function readingLeftGripPart(point:RigPoint,part:'upper'|'forearm'){
 const distance=(a:RigPoint,b:RigPoint)=>{const x=b[0]-a[0],y=b[1]-a[1],t=Math.max(0,Math.min(1,((point[0]-a[0])*x+(point[1]-a[1])*y)/(x*x+y*y)));return Math.hypot(point[0]-a[0]-t*x,point[1]-a[1]-t*y);};
 if(Math.hypot(point[0]-READING_LEFT_ELBOW[0],point[1]-READING_LEFT_ELBOW[1])<.055)return true;
 const upper=distance(sourceShoulder,READING_LEFT_ELBOW),lower=distance(READING_LEFT_ELBOW,sourceGrip);
 return part==='upper'?upper<=lower:lower<upper;
}
