import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {pixelStats,isBlank,blankRule} from './window-pixels.mjs';

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'window-pixels-'));
const png=async(name,width,height,background,overlays=[])=>{
 const file=path.join(dir,name);
 await sharp({create:{width,height,channels:3,background}}).composite(overlays).png().toFile(file);return file;
};
const block=(width,height,color,left,top)=>({input:{create:{width,height,channels:3,background:color}},left,top});
try{
 // The Windows 1069 failure: a light title bar over a uniform dark-gray client area.
 const gray={r:32,g:32,b:32},light={r:243,g:243,b:243};
 const window=await png('1069-like.png',800,600,gray,[block(800,40,light,0,0)]);
 assert(!isBlank(await pixelStats(window)),'the title bar alone makes the whole window look painted');
 const client=await pixelStats(window,{top:40});
 assert(isBlank(client),'the client area of a never-painted window is blank');
 assert.equal(client.colors,1);assert.deepEqual(client.content,{left:0,top:40,width:800,height:560});
 // Sensor-level noise does not make a blank window painted.
 const noise=Buffer.alloc(320*240*3);for(let i=0;i<noise.length;i++)noise[i]=32+(i*7919%3);
 const noisy=path.join(dir,'noisy.png');await sharp(noise,{raw:{width:320,height:240,channels:3}}).png().toFile(noisy);
 assert(isBlank(await pixelStats(noisy)),'tiny noise on one color is still blank');
 // A dark, sparse but painted screen (one small light element) passes: blank needs both one color and flat light.
 const sparse=await pixelStats(await png('sparse.png',400,300,gray,[block(40,20,{r:255,g:255,b:255},180,140)]));
 assert(sparse.dominantFraction>=blankRule.dominantFraction&&sparse.lumaStdev>=blankRule.lumaStdev&&!isBlank(sparse));
 // Varied UI is far from blank.
 const overlays=Array.from({length:24},(_,i)=>block(60,40,{r:(i*53)%256,g:(i*97)%256,b:(i*29)%256},(i%6)*120+10,Math.floor(i/6)*100+20));
 const ui=await pixelStats(await png('ui.png',760,420,{r:20,g:90,b:140},overlays));
 assert(!isBlank(ui)&&ui.dominantFraction<0.8&&ui.colors>10);
 await assert.rejects(pixelStats(window,{top:600}),/crop leaves no pixels/);
 console.log('PASS window pixel facts: a never-painted client area is blank; title bars, noise and sparse painted screens are judged correctly');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
