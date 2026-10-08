// A coarse regression guard, not a replacement for composed visual review.
// Compare chromatic material bands to the pack's current baseline, never an unaccepted draft.
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {BUILTIN_STYLE} from '../ui/components/style.ts';
// Five percentage points is a coarse art-review budget, not an exact match.
// Normalize sampling size so higher-resolution outputs do not get more votes.
const reference=BUILTIN_STYLE.references.palette;
const candidate=process.argv[2]||'resources/styles/builtin/assets/world/world-day-lamps.png';
async function sample(file:string){
 const {data,info}=await sharp(file).resize({width:1536}).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const bands:{[key:string]:number[]}={grass:[],water:[],sky:[]};
 for(let y=0;y<info.height;y+=3)for(let x=0;x<info.width;x+=3){
  const k=(y*info.width+x)*3,r=data[k]/255,g=data[k+1]/255,b=data[k+2]/255,max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;if(!delta)continue;
  let hue=max===r?(g-b)/delta%6:max===g?(b-r)/delta+2:(r-g)/delta+4;hue=(hue*60+360)%360;const saturation=delta/max;
  if(y>info.height*.32&&y<info.height*.88&&hue>50&&hue<135&&max>.35&&saturation>.1)bands.grass.push(saturation);
  if(y>info.height*.48&&hue>185&&hue<230&&max>.35&&saturation>.1)bands.water.push(saturation);
  if(y<info.height*.16&&hue>185&&hue<230&&max>.5&&saturation>.1)bands.sky.push(saturation);
 }
 return Object.fromEntries(Object.entries(bands).map(([key,values])=>{assert.ok(values.length>100,`${file}: insufficient ${key} samples`);return [key,values.sort((a,b)=>a-b)[Math.floor(values.length/2)]];}));
}
const [target,current]=await Promise.all([sample(reference),sample(candidate)]);
for(const band of Object.keys(target)){
 console.log(`${band}: target ${target[band].toFixed(3)}, candidate ${current[band].toFixed(3)}`);
 assert.ok(current[band]<=target[band]+.05,`${band} became too saturated relative to the style baseline`);
}
console.log('PASS current-style palette guard (daytime scene only)');
