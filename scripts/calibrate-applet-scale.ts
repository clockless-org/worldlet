import fs from 'node:fs/promises';
import sharp from 'sharp';
import manifest from '../resources/styles/builtin/manifest.json' with {type:'json'};
// Alpha mass + central silhouette bounds: thin antennas and source padding must
// not determine scale. Inspect the resulting contact sheet before accepting it.
async function measure(key:string,entry:any){
 const source=sharp(entry.peek);
 const {data,info}=await source.ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const xs=Array(info.width).fill(0),ys=Array(info.height).fill(0);let area=0;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const a=data[(y*info.width+x)*4+3]/255;xs[x]+=a;ys[y]+=a;area+=a;}
 if(!area)throw Error('Empty sprite: '+key);
 const q=(values:number[],fraction:number)=>{let sum=0;return values.findIndex(v=>(sum+=v)>=area*fraction);};
 const bodyW=q(xs,.95)-q(xs,.05)+1,bodyH=q(ys,.95)-q(ys,.05)+1;
 return {mass:(Math.sqrt(area)+Math.sqrt(bodyW*bodyH))*.5/info.width,area:area/info.width**2,body:[bodyW/info.width,bodyH/info.width],source:'peek'};
}
const measurements:Record<string,any>={};for(const [key,value]of Object.entries(manifest.applets))measurements[key]=await measure(key,value);
// Tall, solid silhouettes read larger than their measured alpha mass. Keep
// these optical corrections here so asset recalibration preserves them.
// Minesweeper's broad square board keeps the previous sprite's horizontal envelope
// at the rightmost Games slot (900px compact view); keep this correction on recalibration.
const target=measurements.youtube.mass,adjustments:Record<string,number>={notion:.9,obsidian:.82,wechat:.94,'google-calendar':1,minesweeper:.89};
// A sparse tall icon (for example TikTok) must not grow taller simply to
// match the opaque area of a broad screen. Bound the dominant body dimension.
const bodyLimit=Math.max(...measurements.youtube.body)*1.07;
const scales=Object.fromEntries(Object.entries(measurements).map(([key,m])=>{
 // Preserve dormant Garden's accepted default size.
 if(key==='garden')return [key,1];
 const massScale=target/m.mass*(adjustments[key]??1);
 return [key,Math.floor(Math.max(.75,Math.min(1.2,massScale,bodyLimit/Math.max(...m.body)))*1000)/1000];
}));
await fs.writeFile('ui/world/applet-optical-scales.json',JSON.stringify(scales,null,2)+'\n');
// The Village's copy (ui/theme-packages/village/space) follows; scripts/village-space.ts checks it.
await fs.writeFile('ui/theme-packages/village/space/applet-optical-scales.json',JSON.stringify(scales,null,2)+'\n');
await fs.writeFile('resources/styles/builtin/drafts/remaining-bold/scale-audit.json',JSON.stringify({reference:'youtube',bodyLimit,adjustments,measurements,scales},null,2)+'\n');
console.log('Calibrated '+Object.keys(scales).length+' Applets, static sprites.');
