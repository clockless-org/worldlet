import assert from 'node:assert/strict';
import sharp from 'sharp';
import type {ThemeSceneRegistration} from '../ui/themes/build-theme-contract.ts';

/** Measure the transparent opening, not a prompt's approximate rectangle. The extraction's alpha is
 * intentionally antialiased: 240 is an opaque-enough rim, while faint residual alpha is still opening. */
export async function sceneFrameOpening(bytes:Buffer,registration:ThemeSceneRegistration){
 const frame=registration.webFrame;assert.ok(frame,'A framed scene needs a mask');
 const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const [width,height]=registration.imageSize,[sx,sy,sw,sh]=frame.source,[tx,ty,tw,th]=frame.target;
 const alpha=new Uint8Array(width*height);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const u=Math.floor((sx+((x+.5)/width-tx)/tw*sw)*info.width),v=Math.floor((sy+((y+.5)/height-ty)/th*sh)*info.height);
  alpha[y*width+x]=u<0||v<0||u>=info.width||v>=info.height?0:data[(v*info.width+u)*4+3];
 }
 const primary=registration.regions.find(r=>r.role==='primary')!;
 const [x,y,w,h]=primary.rect,seed=Math.floor((y+h/2)*height)*width+Math.floor((x+w/2)*width);
 assert.ok(alpha[seed]<16,'The middle of the content opening must be transparent');
 const seen=new Uint8Array(alpha.length),queue=new Int32Array(alpha.length);queue[0]=seed;seen[seed]=1;
 let count=1,left=width,top=height,right=0,bottom=0;
 for(let i=0;i<count;i++){
  const n=queue[i],px=n%width,py=Math.floor(n/width);
  left=Math.min(left,px);right=Math.max(right,px+1);top=Math.min(top,py);bottom=Math.max(bottom,py+1);
  for(const next of [px>0?n-1:-1,px<width-1?n+1:-1,py>0?n-width:-1,py<height-1?n+width:-1]){
   if(next>=0&&!seen[next]&&alpha[next]<240){seen[next]=1;queue[count++]=next;}
  }
 }
 assert.ok(left>0&&top>0&&right<width&&bottom<height,'The frame must enclose the content opening');
 return {left,top,right,bottom,pixels:count};
}

/** All four page edges extend under the physical rim. The 2px minimum survives image interpolation;
 * registration authors use 4px bleed, leaving another 2px for fractional layout and display scaling. */
export async function checkSceneFrameCoverage(bytes:Buffer,registration:ThemeSceneRegistration,label:string){
 if(!bytes.length)return; // Static CI media stand-ins; real media are checked locally and in UI CI.
 const opening=await sceneFrameOpening(bytes,registration),[width,height]=registration.imageSize;
 const [x,y,w,h]=registration.regions.find(r=>r.role==='primary')!.rect;
 const bleed=[opening.left-x*width,opening.top-y*height,(x+w)*width-opening.right,(y+h)*height-opening.bottom];
 assert.ok(bleed.every(n=>n>=1.99),label+': content must cover the entire opening with at least 2 source pixels under each rim: '+bleed);
 assert.ok(bleed.every(n=>n<=12.01),label+': excessive overlap can hide edge controls: '+bleed);
 assert.ok(opening.pixels/(w*width*h*height)>.85,label+': frame obscures too much of the working surface');
 return {opening,bleed};
}
