import {createPaintedIdle,paintedPose,paintedVertex} from './fox-painted-idle.ts';
import type {PaintedPose} from './fox-painted-idle.ts';
import {smooth} from './fox-skeleton.ts';
/** Anatomical isolation: the arm texture cannot move a single head vertex. */
export function greetingBodyVertex(u:number,v:number,p:PaintedPose):[number,number]{
 if(v<=.60)return [u,v];
 const moved=paintedVertex(u,v,{...p,look:0,nod:0,lean:0,pawL:0,pawR:0,earL:0,earR:0}),body=smooth((v-.60)/.12);
 return [u+(moved[0]-u)*body,v+(moved[1]-v)*body];
}
export function greetingArmAngle(ms:number,reduced=false){
 if(reduced)return 0;
 const t=Math.max(0,ms/1000),envelope=smooth(t/.3)*(1-smooth((t-1.8)/.7));
 return envelope*Math.sin(t*7.5)*.11;
}
export async function createGreetingStudy(canvas:HTMLCanvasElement,sources:{body:string;arm:string;half:string;closed:string}){
 const surface=document.createElement('canvas');surface.width=surface.height=640;
 const body=await createPaintedIdle(surface,[sources.body,sources.half,sources.closed],greetingBodyVertex);
 const arm=await new Promise<HTMLImageElement>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=sources.arm;});
 const ctx=canvas.getContext('2d')!;
 return {draw(ms:number,reduced=false,override?:Partial<PaintedPose>){
  const pose={...paintedPose(ms,reduced),...override};body.draw(ms,reduced,pose);
  ctx.clearRect(0,0,canvas.width,canvas.height);ctx.save();ctx.scale(canvas.width,canvas.height);
  // Generated extraction needed landmark registration. Shoulder sits beneath
  // torso; draw behind the body so a rotating root never covers chest or face.
  ctx.save();ctx.translate(.765,.735);ctx.rotate(greetingArmAngle(ms,reduced));ctx.translate(-.765,-.735);
  ctx.drawImage(arm,.32,.28,.65,.65);ctx.restore();ctx.drawImage(surface,0,0,1,1);ctx.restore();return pose;
 },dispose(){body.dispose();surface.width=surface.height=1;}};
}
