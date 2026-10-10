import {smooth} from './fox-skeleton.ts';

/** Registered pupil translation study. Original iris, pupil and highlight move
 * together; eye whites are hidden-surface artwork, not a second expression to
 * crossfade. Everything outside the two fixed openings keeps original RGB. */
export function createEyeGazeStudy(base:ImageData,sclera:ImageData){
 const w=base.width,h=base.height;
 if(sclera.width!==w||sclera.height!==h)throw Error('Sclera registration dimensions differ');
 // Source-reference coordinates in the 1280px inspection view. The rectangles
 // bound the openings, not the iris; exclude the nearby white muzzle.
 const eyes=[{id:'L',box:[577,424,704,541],seed:[640,490],travel:[6,34]},
  {id:'R',box:[835,379,944,501],seed:[888,444],travel:[4,35]}].map(spec=>{
  const x=Math.floor(spec.box[0]*w/1280),y=Math.floor(spec.box[1]*h/1280),width=Math.ceil(spec.box[2]*w/1280)-x,height=Math.ceil(spec.box[3]*h/1280)-y,size=width*height;
  const aperture=new Float64Array(size),candidate=new Float64Array(size),mask=new Uint8Array(size);
  for(let j=0;j<height;j++)for(let i=0;i<width;i++){
   const p=(j*width+i),q=((y+j)*w+x+i)*4;
   candidate[p]=smooth(Math.min((sclera.data[q]-165)/40,(sclera.data[q+1]-145)/40,(sclera.data[q+2]-125)/40));
  }
  const flood=(seed:number,allowed:(p:number)=>boolean)=>{
   const visited=new Uint8Array(size),queue=[seed];visited[seed]=1;
   for(let n=0;n<queue.length;n++){const p=queue[n],cx=p%width,cy=Math.floor(p/width);
    for(const next of [cx>0?p-1:-1,cx+1<width?p+1:-1,cy>0?p-width:-1,cy+1<height?p+width:-1])if(next>=0&&!visited[next]&&allowed(next)){visited[next]=1;queue.push(next);}
   }return visited;
  };
  const seed=(Math.round(spec.seed[1]*h/1280)-y)*width+Math.round(spec.seed[0]*w/1280)-x;
  const opening=flood(seed,p=>candidate[p]>.001);
  for(let p=0;p<size;p++){
   aperture[p]=opening[p]?candidate[p]:0;
   const q=((y+Math.floor(p/width))*w+x+p%width)*4;
   const contrast=Math.max(sclera.data[q]-base.data[q],sclera.data[q+1]-base.data[q+1],sclera.data[q+2]-base.data[q+2]);
   mask[p]=aperture[p]>.7&&contrast>35?1:0;
  }
  // Fill the iris' enclosed bright highlight rather than leaving it behind.
  // The opening rectangles have background padding, so index 0 is exterior.
  const exterior=flood(0,p=>!mask[p]);
  for(let p=0;p<size;p++)if(!exterior[p])mask[p]=1;
  const residual=new Float64Array(size*3);let irisPixels=0;
  for(let p=0;p<size;p++){
   const px=p%width,py=Math.floor(p/width);let coverage=mask[p];
   // Carry the antialiased iris fringe as well as its dark core. A hard
   // contrast threshold alone leaves the old thin contour behind on white.
   if(!coverage&&aperture[p])for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){
    const nx=px+dx,ny=py+dy;if(nx>=0&&nx<width&&ny>=0&&ny<height&&mask[ny*width+nx])coverage=Math.max(coverage,smooth((3-Math.hypot(dx,dy))/2));
   }
   if(!coverage)continue;
   const q=((y+py)*w+x+px)*4;irisPixels++;
   for(let k=0;k<3;k++)residual[p*3+k]=(base.data[q+k]-sclera.data[q+k])*coverage;
  }
  if(irisPixels<500)throw Error('Sclera plate does not expose a registered iris '+spec.id);
  return {...spec,x,y,width,height,aperture,residual,irisPixels,dx:spec.travel[0]*w/1280,dy:spec.travel[1]*h/1280};
 });
 return {
  stats:()=>eyes.map(({id,irisPixels,dx,dy})=>({id,irisPixels,dx,dy})),
  draw(output:ImageData,gaze:number,origin?:{x:number;y:number},horizontal=0){
   if(!Number.isFinite(gaze)||gaze<0||gaze>1)throw Error('Invalid pupil gaze');
   if(!Number.isFinite(horizontal)||Math.abs(horizontal)>1)throw Error('Invalid horizontal pupil gaze');
   const ox=origin?.x??0,oy=origin?.y??0,ow=output.width,oh=output.height;
   if(!Number.isInteger(ox)||!Number.isInteger(oy)||ox<0||oy<0||ox+ow>w||oy+oh>h||(!origin&&(ow!==w||oh!==h)))throw Error('Pupil output registration dimensions differ');
   for(let y=0;y<oh;y++)output.data.set(base.data.subarray(((oy+y)*w+ox)*4,((oy+y)*w+ox+ow)*4),y*ow*4);
   if(gaze===0&&horizontal===0)return;
   for(const eye of eyes){
    const {x:ex,y:ey,width:ew,height:eh,residual,aperture,dx,dy}=eye;
    for(let y=Math.max(oy,ey);y<Math.min(oy+oh,ey+eh);y++)for(let x=Math.max(ox,ex);x<Math.min(ox+ow,ex+ew);x++){
     const p=(y-ey)*ew+x-ex,a=aperture[p];if(!a)continue;
     const sx=x-ex-dx*gaze-14*w/1280*horizontal,sy=y-ey-dy*gaze,lx=Math.floor(sx),ly=Math.floor(sy),fx=sx-lx,fy=sy-ly;
     const target=((y-oy)*ow+x-ox)*4,source=(y*w+x)*4;
     for(let k=0;k<3;k++){
      let moved=0;
      for(let j=0;j<2;j++)for(let i=0;i<2;i++){const tx=lx+i,ty=ly+j;if(tx>=0&&tx<ew&&ty>=0&&ty<eh)moved+=residual[(ty*ew+tx)*3+k]*(i?fx:1-fx)*(j?fy:1-fy);}
      // Subtract the neutral layer and add its translated copy through the
      // SAME aperture. At infinitesimal gaze this converges to original RGB.
      output.data[target+k]=Math.round(base.data[source+k]+a*(moved-residual[p*3+k]));
     }
    }
   }
  }
 };
}
