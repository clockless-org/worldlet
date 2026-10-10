import definition from '../../../resources/styles/builtin/drafts/fox-states-v1/anatomy.json' with {type:'json'};
import {createEyeGazeStudy} from './fox-eye-gaze-study.ts';
import {smooth} from './fox-skeleton.ts';

/** Clip closure is expressive intent, not a texture crossfade weight. Give
 * small squints visible lid travel, tapering smoothly into a complete blink. */
export function eyelidTravel(closure:number){
 if(!Number.isFinite(closure)||closure<0||closure>1)throw Error('Invalid closure');
 return closure*(2-closure);
}
/** Dev eye renderer / inspector study. Registered eye-local RGB, fixed eye openings,
 * original alpha. Never consume the generated whole-character silhouette. */
export function createEyelidOcclusionStudy(base:ImageData,fur:ImageData,closed:ImageData,sclera?:ImageData){
 const {width:w,height:h}=base;
 if([fur,closed].some(i=>i.width!==w||i.height!==h))throw Error('Eye source registration dimensions differ');
 const pupils=sclera?createEyeGazeStudy(base,sclera):undefined;
 // Precompute a soft ink mask; thresholding the resampled color per frame
 // produces sudden dark pixels as the line moves between texture rows.
 const ink=new Float64Array(w*h);
 for(let i=0;i<ink.length;i++){const p=i*4;ink[i]=smooth(Math.min((150-closed.data[p])/40,(110-closed.data[p+1])/30,(95-closed.data[p+2])/25));}
 const eyes=definition.parts.filter(p=>p.id==='eyeL'||p.id==='eyeR').map(p=>{
  const [cx,cy,rx,ry]=p.ellipse!;
  const lash=new Float64Array(w).fill(-1),openTop=new Float64Array(w).fill(-1);
  for(let x=Math.floor((cx-rx)*w);x<(cx+rx)*w;x++){
   const ys=[];for(let y=Math.floor((cy-.015)*h);y<(cy+.045)*h;y++){
    const i=(y*w+x)*4;if(closed.data[i]<110&&closed.data[i+1]<85&&closed.data[i+2]<70)ys.push(y);
   }
   if(ys.length)lash[x]=(ys[0]+ys[ys.length-1])/2;
   // Exclude the eyebrow tip from the lid's registered source band.
   for(let y=Math.floor((cy-.049)*h);y<(cy+.055)*h;y++){const i=(y*w+x)*4;if(base.data[i]<110&&base.data[i+1]<85&&base.data[i+2]<70){openTop[x]=y;break;}}
  }
  const columns=Array.from(lash,(_,x)=>x).filter(x=>lash[x]>=0);
  const left=columns[0]??0,right=columns.at(-1)??w-1;
  const x0=Math.floor((cx-rx)*w),x1=Math.ceil((cx+rx)*w),y0=Math.floor((cy-ry)*h),y1=Math.ceil((cy+ry)*h),width=x1-x0;
  // Fixed opening geometry belongs to the registered artwork, not the frame.
  // Keep Float64 precision so caching does not alter antialiased output pixels.
  const shut=new Float64Array(width),top=new Float64Array(width),bottom=new Float64Array(width),cornerAperture=new Float64Array(width),edge=new Float64Array(width*(y1-y0));
  for(let x=x0;x<x1;x++){
   const j=x-x0,nx=(x+.5)/w,u=(nx-cx)/(rx*.79),arc=Math.sqrt(Math.max(0,1-u*u));
   const rest=cy+.024+(cx>.6?-.015*u:.004*u);
   // Threshold registration is integer-row data. Remove its tiny stair steps
   // only inside the opening; never interpolate across an eye corner/gap.
   // The 0.75px cap preserves the painted shape instead of fitting a new arc.
   let opening=openTop[x];
   if(opening>=0&&x>1&&x+2<w&&[-2,-1,1,2].every(dx=>openTop[x+dx]>=0)){
    const average=(openTop[x-2]+4*openTop[x-1]+6*opening+4*openTop[x+1]+openTop[x+2])/16;
    opening+=Math.max(-.75,Math.min(.75,average-opening));
   }
   shut[j]=lash[x]>=0?lash[x]/h:rest;top[j]=opening>=0?opening/h:shut[j];bottom[j]=cy+.067*arc;
   cornerAperture[j]=smooth((x-left+.5)/(w*.006))*smooth((right-x+.5)/(w*.006));
   for(let y=y0;y<y1;y++){
    const ny=(y+.5)/h,d=Math.hypot((nx-cx)/rx,(ny-cy)/ry);
    edge[(y-y0)*width+j]=1-smooth((d-.78)/.22);
   }
  }
  return {lash,openTop,x0,x1,y0,y1,width,shut,top,bottom,cornerAperture,edge};
 });
 // A registered crop lets the anatomy renderer update one independent eye
 // without copying or rerasterizing a full-character buffer every frame.
 return (output:ImageData,closure:number,origin?:{x:number;y:number},gaze=0,horizontal=0)=>{
  const travel=eyelidTravel(closure);
  if(!Number.isFinite(gaze)||gaze<0||gaze>1)throw Error('Invalid gaze');
  if(!Number.isFinite(horizontal)||Math.abs(horizontal)>1)throw Error('Invalid horizontal gaze');
  if((gaze||horizontal)&&!pupils)throw Error('Independent pupil sclera is required');
  const ox=origin?.x??0,oy=origin?.y??0,ow=output.width,oh=output.height;
  if(!Number.isInteger(ox)||!Number.isInteger(oy)||ox<0||oy<0||ox+ow>w||oy+oh>h||(!origin&&(ow!==w||oh!==h)))throw Error('Eye output registration dimensions differ');
  // Pupil drawing initializes the same crop itself; avoid copying it twice.
  if(!pupils||(closure===0&&gaze===0&&horizontal===0))for(let y=0;y<oh;y++)output.data.set(base.data.subarray(((oy+y)*w+ox)*4,((oy+y)*w+ox+ow)*4),y*ow*4);
  if(closure===0&&gaze===0&&horizontal===0)return;
  // Keep gaze beneath the independent lids, never swap the entire renderer
  // at gaze > 0. The original pupil moves as one layer over sclera artwork.
  // Fade only the final almost-shut sliver to the common closed expression.
  const visibleGaze=gaze*(1-smooth((travel-.85)/.15));
  if(pupils)pupils.draw(output,visibleGaze,origin,horizontal*(1-smooth((travel-.85)/.15)));
  const cornerClosure=smooth((travel-.55)/.2),closureCoverage=smooth(travel/.06),cornerVisibility=smooth((travel-.55)/.3);
  for(const eye of eyes)for(let x=Math.max(ox,eye.x0);x<Math.min(ox+ow,eye.x1);x++){
   const {lash,openTop}=eye,j=x-eye.x0;
   const shut=eye.shut[j],upper=eye.top[j]*(1-travel)+shut*travel,openLower=eye.bottom[j]*(1-travel)+shut*travel;
   // The open iris extends beyond the painted closed lid's ends. Close those
   // corner apertures first, otherwise a detached original iris sliver survives
   // beside the new lid even when the middle is almost completely shut.
   // Do this only in late closure; early narrowing visibly squares off squints.
   const lower=upper+Math.max(0,openLower-upper)*(1-cornerClosure*(1-eye.cornerAperture[j]));
   // All pixels in this column share one lid boundary; calculate it once.
   for(let y=Math.max(oy,eye.y0);y<Math.min(oy+oh,eye.y1);y++){
   const ny=(y+.5)/h,edge=eye.edge[(y-eye.y0)*eye.width+j];if(!edge)continue;
   const cover=smooth(Math.max(upper-ny,ny-lower)*h+1)*edge*closureCoverage,i=(y*w+x)*4;
   // Reuse only the dark painted lid edge, sampled along its own narrow band.
   const sourceY=Math.max(0,Math.min(h-1,y-upper*h+(lash[x]>=0?lash[x]:shut*h))),lo=Math.floor(sourceY),hi=Math.min(h-1,lo+1),fraction=sourceY-lo;
   const ia=lo*w+x,ib=hi*w+x,wa=ink[ia]*(1-fraction),wb=ink[ib]*fraction;
   const corner=openTop[x]>=0?1:cornerVisibility,band=1-smooth((Math.abs(ny-upper)-.006)/.003),weight=lash[x]>=0?corner*band:0;
   const targetIndex=((y-oy)*ow+x-ox)*4;
   for(let k=0;k<3;k++){
    const color=fur.data[i+k],target=color+weight*((closed.data[ia*4+k]-color)*wa+(closed.data[ib*4+k]-color)*wb);
    const open=output.data[targetIndex+k];
    output.data[targetIndex+k]=Math.round(open+(target-open)*cover);
   }
   output.data[targetIndex+3]=base.data[i+3];
   }
  }
 };
}
