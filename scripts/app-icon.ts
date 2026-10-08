// The Mac app icon (.icns) from the brand master, for packaged releases and the Dev app.
// Development builds carry the DEV plaque the native Dev icon had (orange, bottom right).
import {mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

const DEV_PLAQUE=`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect x="510" y="752" width="444" height="218" rx="70" fill="#e07d30"/><text x="732" y="861" font-family="-apple-system,Helvetica Neue,Arial,sans-serif" font-size="142" font-weight="900" fill="#fff" text-anchor="middle" dominant-baseline="central">DEV</text></svg>`;
export async function macIcon(root:string,output:string,{dev=false}:{dev?:boolean}={}){
 const svg=path.join(root,'resources/styles/builtin/assets/brand/worldlet-app-icon.svg');
 let master=await sharp(svg,{density:300}).resize(1024,1024).png().toBuffer();
 if(dev)master=await sharp(master).composite([{input:Buffer.from(DEV_PLAQUE)}]).png().toBuffer();
 const staging=mkdtempSync(path.join(os.tmpdir(),'worldlet-icon-')),set=path.join(staging,'Worldlet.iconset');
 try{
  mkdirSync(set);
  for(const size of [16,32,128,256,512])for(const scale of [1,2])await sharp(master).resize(size*scale,size*scale).png().toFile(path.join(set,`icon_${size}x${size}${scale===2?'@2x':''}.png`));
  mkdirSync(path.dirname(output),{recursive:true});
  execFileSync('iconutil',['-c','icns',set,'-o',output]);
  return output;
 }finally{rmSync(staging,{recursive:true,force:true});}
}
