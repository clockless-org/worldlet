import assert from 'node:assert/strict';
import sharp from 'sharp';
import {THEME_WORLD} from '../ui/world/world-layout.ts';
// Inspect, never warp, the generated pair. High-pass correlation ignores the
// broad day/night brightness change; lamps/windows are not registration points.
const width=1536,height=864;
const load=async(lighting:string)=>{
 const layer=THEME_WORLD.layers.find(l=>l.lighting===lighting);assert(layer);
 const file='resources/worlds/village/'+layer.src,info=await sharp(file).metadata();
 assert.equal(info.width,THEME_WORLD.canvas.width);assert.equal(info.height,THEME_WORLD.canvas.height);
 return sharp(file).resize(width,height).blur(1).greyscale().raw().toBuffer();
};
const [day,night]=await Promise.all([load('day'),load('night')]);
const regions=[[.39,.29,.10,.08],[.46,.395,.10,.055],[.635,.56,.11,.06],[.295,.53,.10,.075],[.38,.69,.18,.12]];
for(const [left,top,w,h] of regions){
 let best={score:-1,dx:0,dy:0};
 for(let dy=-8;dy<=8;dy++)for(let dx=-8;dx<=8;dx++){
  let dot=0,a2=0,b2=0;
  for(let y=Math.floor(top*height);y<(top+h)*height;y+=2)for(let x=Math.floor(left*width);x<(left+w)*width;x+=2){
   const i=y*width+x,j=(y+dy)*width+x+dx;
   for(const step of [1,width]){const a=day[i+step]-day[i-step],b=night[j+step]-night[j-step];dot+=a*b;a2+=a*a;b2+=b*b;}
  }
  const score=dot/Math.sqrt(a2*b2);if(score>best.score)best={score,dx,dy};
 }
 console.log({region:[left,top],...best});
 assert(best.score>.45,'Day/night landmark no longer corresponds');
 assert(Math.hypot(best.dx,best.dy)<=3,'Day/night landmark drift exceeds three logical pixels');
}
console.log('PASS native day/night landmark registration (tolerance 3 logical pixels).');
