// Window pixel facts for the release smoke (#987): is the app's content area painted at all?
// A window that never painted is nearly one color. On 2026-10-01 the Windows 1069 candidate showed a
// uniform dark-gray client area while its startup record said complete. Any painted UI, from
// onboarding to the World, has text, art or scenery. Only a near-single-color area counts as blank,
// so a sparse but painted screen still passes.
//   node scripts/window-pixels.mjs <capture.png> [--top px] [--bottom px] [--left px] [--right px]
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

export const blankRule=Object.freeze({dominantFraction:0.99,lumaStdev:3});

// Crop to the content area, sample at most 320 px wide, then count 4-bit-per-channel colors.
export async function pixelStats(file,{top=0,bottom=0,left=0,right=0}={}){
 const meta=await sharp(file).metadata(),width=meta.width-left-right,height=meta.height-top-bottom;
 if(!(width>0&&height>0))throw Error(`crop leaves no pixels in ${meta.width}x${meta.height}`);
 const {data,info}=await sharp(file).extract({left,top,width,height})
  .resize({width:Math.min(width,320),withoutEnlargement:true}).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const counts=new Map(),n=info.width*info.height;let sum=0,squares=0;
 for(let i=0;i<data.length;i+=3){
  const key=(data[i]>>4)<<8|(data[i+1]>>4)<<4|data[i+2]>>4;counts.set(key,(counts.get(key)||0)+1);
  const luma=0.2126*data[i]+0.7152*data[i+1]+0.0722*data[i+2];sum+=luma;squares+=luma*luma;
 }
 const mean=sum/n,round=(v,d)=>Math.round(v*10**d)/10**d;
 return {width:meta.width,height:meta.height,content:{left,top,width,height},
  dominantFraction:round(Math.max(...counts.values())/n,4),lumaStdev:round(Math.sqrt(Math.max(0,squares/n-mean*mean)),2),
  colors:[...counts.values()].filter(c=>c>=n*0.001).length};
}
export const isBlank=(stats,rule=blankRule)=>stats.dominantFraction>=rule.dominantFraction&&stats.lumaStdev<rule.lumaStdev;

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [file,...rest]=process.argv.slice(2);
 if(!file){console.error('Usage: node scripts/window-pixels.mjs <capture.png> [--top px] [--bottom px] [--left px] [--right px]');process.exit(2);}
 const crop={};for(let i=0;i<rest.length;i+=2)crop[rest[i].replace(/^--/,'')]=Number(rest[i+1]);
 const stats=await pixelStats(file,crop);
 console.log(JSON.stringify({...stats,blank:isBlank(stats)},null,1));
}
