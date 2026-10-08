import {drawAnatomySkin} from './fox-anatomy-skin.ts';
import type {RigPoint} from './fox-anatomy.ts';
import definition from '../../resources/styles/builtin/drafts/fox-states-v1/reading-rig.json' with {type:'json'};
import {readingPagePhase,readingPagePoint,readingPageHandTarget,solveReadingArm} from './fox-reading-page.ts';
import {readingBookFold,readingBookPlacement} from './fox-reading-book-fold.ts';
import {smooth} from './fox-skeleton.ts';

const {shoulders,grips,sourceShoulders,sourceGrips}=definition;
type ReadingAttachments={leftGrip?:(target:RigPoint)=>void;rightGrip?:(target:RigPoint,stage:'back'|'front'|'paw')=>void;offset?:RigPoint;closure?:number;placement?:number;release?:number;restingOnly?:boolean;rightHand?:RigPoint};
/** Similarity registration preserves fur proportions. Independent book and paw
 * attachments share the same moving grip targets; shoulders remain pinned. */
export function readingArmPoint(side:'L'|'R',[x,y]:RigPoint):RigPoint{
 const a=sourceShoulders[side],b=sourceGrips[side],p=shoulders[side],q=grips[side];
 const sx=b[0]-a[0],sy=b[1]-a[1],tx=q[0]-p[0],ty=q[1]-p[1],den=sx*sx+sy*sy;
 const c=(tx*sx+ty*sy)/den,s=(ty*sx-tx*sy)/den;
 return [p[0]+c*(x-a[0])-s*(y-a[1]),p[1]+s*(x-a[0])+c*(y-a[1])];
}
function readingBreathingPoint([x,y]:RigPoint,t:number,reduced:boolean,offset:RigPoint,placement:number):RigPoint{
 const phase=t/9000*Math.PI*2,r=reduced?0:Math.sin(phase)*.008*(1-placement),c=Math.cos(r),s=Math.sin(r),dy=reduced?0:.002*Math.sin(phase*2)*(1-placement);
 const [px,py]=definition.bookRegistration.pivot;
 return [px+c*(x-px)-s*(y-py)+offset[0],py+s*(x-px)+c*(y-py)+dy+offset[1]];
}
export function readingBookPoint(point:RigPoint,t:number,reduced=false,offset:RigPoint=[0,0],closure=0,placement=0):RigPoint{
 const folded=closure?readingBookFold(point,closure):point;
 return readingBreathingPoint(placement?readingBookPlacement(folded,placement):folded,t,reduced,offset,placement);
}
export function readingHandPoint(side:'L'|'R',t:number,pageTime=t,reduced=false,offset:RigPoint=[0,0],closure=0,placement=0,release=0):RigPoint{
 const hand=side==='L'?grips.L:readingPageHandTarget(pageTime,reduced);
 const raw:RigPoint=[hand[0],hand[1]+(side==='R'?definition.closing.rightGripDrop*closure:0)];
 if(!closure&&!placement&&!release)return readingBookPoint(raw,t,reduced,offset);
 const attached=readingBookPlacement(readingBookFold(raw,closure),placement),rest=definition.placement.relaxedHands[side];
 return readingBreathingPoint([attached[0]+(rest[0]-attached[0])*release,attached[1]+(rest[1]-attached[1])*release-definition.placement.releaseLift*Math.sin(Math.PI*release)],t,reduced,offset,placement);
}
export function readingExpression(t:number,reduced=false){
 if(reduced)return {gazeDown:1,closure:0};
 const phase=((t%9000)+9000)%9000,pulse=(start:number,rise:number,fall:number,end:number)=>smooth((phase-start)/rise)*(1-smooth((phase-fall)/(end-fall)));
 return {gazeDown:1-pulse(7200,400,8100,8600),closure:pulse(1300,70,1410,1550)+pulse(6800,70,6910,7050)};
}
export function readingArmVertex(side:'L'|'R',point:RigPoint,t:number,reduced=false,offset:RigPoint=[0,0]):RigPoint{
 const p=readingArmPoint(side,point),a=shoulders[side],b=grips[side],dx=b[0]-a[0],dy=b[1]-a[1];
 const weight=smooth(((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)),moved=readingBookPoint(p,t,reduced,offset);
 return [p[0]+weight*(moved[0]-p[0]),p[1]+weight*(moved[1]-p[1])];
}
export function readingTurnArmVertex(point:RigPoint,t:number,reduced=false,part:'upper'|'forearm'='forearm',pageTime=t,offset:RigPoint=[0,0],closure=0,placement=0,release=0):RigPoint{
 const d=definition.turnArm,a=d.sourceShoulder,b=d.sourceGrip,p=definition.shoulders.R,q=d.bindGrip;
 const sx=b[0]-a[0],sy=b[1]-a[1],tx=q[0]-p[0],ty=q[1]-p[1],den=sx*sx+sy*sy,c=(tx*sx+ty*sy)/den,s=(ty*sx-tx*sy)/den;
 const register=([x,y]:readonly number[]):RigPoint=>[p[0]+c*(x-a[0])-s*(y-a[1]),p[1]+s*(x-a[0])+c*(y-a[1])];
 const shoulder=p as [number,number],elbow=register(d.sourceElbow),grip=q as [number,number],vertex=register(point),target=readingHandPoint('R',t,pageTime,reduced,offset,closure,placement,release);
 const rotation=solveReadingArm(shoulder,elbow,grip,target,-1),weight=part==='forearm'?1:0;
 if(!rotation.reachable)throw Error('Reading right-arm target exceeds authored reach');
 const relative=Math.atan2(Math.sin(rotation.lower-rotation.upper),Math.cos(rotation.lower-rotation.upper));
 const r=relative*weight,dx=vertex[0]-elbow[0],dy=vertex[1]-elbow[1],x=elbow[0]-shoulder[0]+Math.cos(r)*dx-Math.sin(r)*dy,y=elbow[1]-shoulder[1]+Math.sin(r)*dx+Math.cos(r)*dy;
 return [shoulder[0]+Math.cos(rotation.upper)*x-Math.sin(rotation.upper)*y,shoulder[1]+Math.sin(rotation.upper)*x+Math.cos(rotation.upper)*y];
}
/** Distal fur overlaps the cover, without a hard source-axis amputation.
 * The complete identical forearm remains underneath; this only controls depth. */
export function readingPawOverlap([x,y]:RigPoint){
 const {sourceGrip:a,sourceElbow:b,pawOverlap:[start,end]}=definition.turnArm,dx=b[0]-a[0],dy=b[1]-a[1];
 const along=((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy);
 return 1-smooth((along-start)/(end-start));
}
export async function createReadingStudy(url:string,turnArmURL?:string){
 const image=await new Promise<HTMLImageElement>((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error('Reading parts unavailable'));i.src=url;});
 const w=image.width,h=image.height;
 const cut=(rect:readonly number[])=>{const [x,y,width,height]=rect.map((v,i)=>Math.round(v*(i%2?h:w))),c=document.createElement('canvas');c.width=width;c.height=height;c.getContext('2d')!.drawImage(image,x,y,width,height,0,0,width,height);return {canvas:c,x,y};};
 const book=cut(definition.crop.book),page=cut(definition.crop.page);
 // Each face has its own grid so triangles never bridge the rotating hinge.
 const hinge=definition.closing.sourceHingeX;
 const bookLeft=cut([0,0,hinge,definition.crop.book[3]]),bookRight=cut([hinge,0,definition.crop.book[2]-hinge,definition.crop.book[3]]);
 const arms={L:cut(definition.crop.L),R:cut(definition.crop.R)};
 let turnArt:HTMLCanvasElement|undefined,turnUpper:HTMLCanvasElement|undefined,turnFore:HTMLCanvasElement|undefined,turnPaw:HTMLCanvasElement|undefined;
 if(turnArmURL){
  const img=await new Promise<HTMLImageElement>((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error('Page turn arm unavailable'));i.src=turnArmURL;});
  turnArt=document.createElement('canvas');turnArt.width=w;turnArt.height=h;turnArt.getContext('2d')!.drawImage(img,0,0,w,h);
  const piece=(left:number,width:number,elbow=false)=>{const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d')!;ctx.beginPath();ctx.rect(left*w,0,width*w,h);if(elbow){const [x,y]=definition.turnArm.sourceElbow,r=definition.turnArm.elbowOverlap;ctx.moveTo((x+r)*w,y*h);ctx.ellipse(x*w,y*h,r*w,r*h,0,0,Math.PI*2);}ctx.clip();ctx.drawImage(turnArt!,0,0);return c;};
  turnUpper=piece(definition.turnArm.splitX,1-definition.turnArm.splitX);turnFore=piece(0,definition.turnArm.splitX,true);
  turnPaw=piece(0,definition.turnArm.splitX);const pc=turnPaw.getContext('2d')!,pixels=pc.getImageData(0,0,w,h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)pixels.data[(y*w+x)*4+3]*=readingPawOverlap([x/w,y/h]);
  pc.putImageData(pixels,0,0);
 }
 const segments={L:[] as typeof book[],R:[] as typeof book[]};
 for(const side of ['L','R'] as const)for(const proximal of [true,false]){
  const source=arms[side],c=document.createElement('canvas');c.width=source.canvas.width;c.height=source.canvas.height;
  const ctx=c.getContext('2d')!;ctx.drawImage(source.canvas,0,0);const data=ctx.getImageData(0,0,c.width,c.height);
  for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){
   const isProximal=(source.y+y)/h<definition.proximalSourceY;if(isProximal!==proximal)data.data[(y*c.width+x)*4+3]=0;
  }
  ctx.putImageData(data,0,0);segments[side].push({canvas:c,x:source.x,y:source.y});
 }
 return {
  draw(stage:'back'|'front',ctx:CanvasRenderingContext2D,size:RigPoint,t:number,reduced=false,turning=false,pageTime=t,drawSkin=drawAnatomySkin,attachments:ReadingAttachments={}){
   const {leftGrip,rightGrip,offset=[0,0],closure=0,placement=0,release=0,restingOnly=false,rightHand}=attachments;
   if(restingOnly&&(closure!==1||placement!==1||release!==1))throw Error('Independent book requires closed, supported and released rest');
   if(offset.some(v=>!Number.isFinite(v)))throw Error('Invalid reading book offset');
   if(offset.some(v=>v!==0)&&(!turning||!leftGrip))throw Error('Moving the book requires both complete rigid arms');
   if(!Number.isFinite(closure)||closure<0||closure>1)throw Error('Invalid book closure');
   if([placement,release].some(v=>!Number.isFinite(v)||v<0||v>1))throw Error('Invalid book placement/release');
   if(placement&&closure!==1||release&&placement!==1)throw Error('The book must close, settle, then release');
   const pagePhase=readingPagePhase(pageTime,reduced);
   if(rightHand&&(!rightGrip||!leftGrip||!turning||restingOnly||closure||placement||release||pagePhase.opacity>0||pagePhase.reach*(1-pagePhase.returning)>0||rightHand.some(v=>!Number.isFinite(v))))throw Error('Free right hand requires a settled open book supported by the left grip');
   const rightTarget=rightHand??readingHandPoint('R',t,pageTime,reduced,offset,closure,placement,release);
   if(closure&&(!turning||!leftGrip||pagePhase.opacity>0||pagePhase.reach*(1-pagePhase.returning)>0))throw Error('Closing requires recovered grips and a settled page');
   if(turning&&!turnArt)throw Error('Page-turn arm artwork is required');
   if(stage==='front'){
    // Turning page rises behind the cover, with no text or invented task output.
    const turn=turning?readingPagePhase(pageTime,reduced).opacity:0;
    if(turn>0){
     ctx.save();ctx.globalAlpha=turn;
     drawSkin(ctx,page,[w,h],size,p=>readingBookPoint(readingPagePoint(p,pageTime,reduced),t,reduced,offset),16,16);ctx.restore();
    }
    // The complete forearm sits above the turning leaf but behind the cover.
    // A source-space foreground cut rotates into a visible amputated edge.
    if(!restingOnly){
     if(turning&&turnFore&&!rightGrip)drawSkin(ctx,{canvas:turnFore,x:0,y:0},[w,h],size,p=>readingTurnArmVertex(p,t,reduced,'forearm',pageTime,offset,closure,placement,release),16,16);
     rightGrip?.(rightTarget,'front');
    }
    const {scale,offset:origin}=definition.bookRegistration;
    const bookVertex=([x,y]:RigPoint)=>readingBookPoint([origin[0]+x*scale,origin[1]+y*scale],t,reduced,offset,closure,placement);
    if(closure){drawSkin(ctx,bookRight,[w,h],size,bookVertex,16,16);drawSkin(ctx,bookLeft,[w,h],size,bookVertex,16,16);}
    else drawSkin(ctx,book,[w,h],size,bookVertex,16,16);
    if(!restingOnly&&turning&&turnPaw&&!rightGrip)drawSkin(ctx,{canvas:turnPaw,x:0,y:0},[w,h],size,p=>readingTurnArmVertex(p,t,reduced,'forearm',pageTime,offset,closure,placement,release),16,16);
   }
   if(restingOnly)return;
   for(const side of ['L','R'] as const){
    if(side==='L'&&leftGrip){leftGrip(readingHandPoint('L',t,pageTime,reduced,offset,closure,placement,release));continue;}
    if(side==='R'&&rightGrip){rightGrip(rightTarget,stage==='front'?'paw':'back');continue;}
    if(side==='R'&&turning&&turnArt){
     if(stage==='back')drawSkin(ctx,{canvas:turnUpper!,x:0,y:0},[w,h],size,p=>readingTurnArmVertex(p,t,reduced,'upper',pageTime,offset,closure,placement,release),16,16);
    }
    else drawSkin(ctx,segments[side][stage==='back'?0:1],[w,h],size,p=>readingArmVertex(side,p,t,reduced,offset));
   }
  },
  dispose(){for(const p of [book,bookLeft,bookRight,page,...Object.values(arms),...segments.L,...segments.R])p.canvas.width=p.canvas.height=1;for(const c of [turnArt,turnUpper,turnFore,turnPaw])if(c)c.width=c.height=1;}
 };
}
