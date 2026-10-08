// Image encodes are most of a native UI build (lossless 4K plates, 114 device sprites) and depend only
// on the source bytes and the encode settings, so their results are kept by content hash under
// node_modules/.cache/worldlet-images (PR CI restores it between runs). Delete it to force a re-encode.
import {createHash} from 'node:crypto';
import {mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import path from 'node:path';
const dir=path.resolve('node_modules/.cache/worldlet-images');
export async function cachedEncode(file:string,settings:string,encode:()=>Promise<Buffer>):Promise<Buffer>{
 const key=createHash('sha256').update(settings).update('\0').update(await readFile(file)).digest('hex'),target=path.join(dir,key);
 try{return await readFile(target);}catch{}
 const out=await encode();
 try{await mkdir(dir,{recursive:true});const temp=target+'.'+process.pid;await writeFile(temp,out);await rename(temp,target);}catch{}
 return out;
}
