// Export the shared brand master as Windows-compatible 32-bit DIB icon frames.
import sharp from 'sharp';
import {writeFile} from 'node:fs/promises';
import {brandAssets} from '../ui/components/primitives/brand.ts';
const sizes=[16,20,24,32,40,48,64,128,256];
const frames:Buffer[]=[];
for(const size of sizes){
 const pixels=await sharp(Buffer.from(brandAssets()['worldlet-app-icon.svg'])).resize(size,size).ensureAlpha().raw().toBuffer();
 const stride=Math.ceil(size/32)*4,frame=Buffer.alloc(40+size*size*4+stride*size);
 frame.writeUInt32LE(40,0);frame.writeInt32LE(size,4);frame.writeInt32LE(size*2,8);
 frame.writeUInt16LE(1,12);frame.writeUInt16LE(32,14);frame.writeUInt32LE(size*size*4,20);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const source=(y*size+x)*4,target=40+((size-1-y)*size+x)*4;
  frame[target]=pixels[source+2];frame[target+1]=pixels[source+1];frame[target+2]=pixels[source];frame[target+3]=pixels[source+3];
  if(!pixels[source+3])frame[40+size*size*4+(size-1-y)*stride+(x>>3)]|=128>>(x%8);
 }
 frames.push(frame);
}
const header=Buffer.alloc(6+16*sizes.length);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);
let offset=header.length;
for(let i=0;i<sizes.length;i++){
 const entry=6+i*16;header[entry]=header[entry+1]=sizes[i]%256;
 header.writeUInt16LE(1,entry+4);header.writeUInt16LE(32,entry+6);
 header.writeUInt32LE(frames[i].length,entry+8);header.writeUInt32LE(offset,entry+12);offset+=frames[i].length;
}
await writeFile(new URL('../resources/styles/builtin/assets/brand/worldlet.ico',import.meta.url),Buffer.concat([header,...frames]));
console.log('Built Windows icon from the shared brand master (16–256px).');
