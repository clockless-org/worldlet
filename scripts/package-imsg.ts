/** The pinned, signed and notarized imsg release (github.com/openclaw/imsg, MIT) that the Mac host's Messages
 * Applet reads and sends iMessages through. Only the archive whose SHA-256 matches
 * platform/electron/distribution/imsg.json is ever unpacked; the IMCore bridge helper it also ships is left out
 * (it needs System Integrity Protection off), so sends go through the Messages app's own AppleScript. */
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {cpSync,existsSync,mkdirSync,readFileSync,renameSync,rmSync,writeFileSync,copyFileSync,chmodSync} from 'node:fs';
import path from 'node:path';
import {workspace} from './dev-workspace.ts';
type Pin={version:string;source:string;sha256:string;files:string[]};
export const imsgPin=(root:string):Pin=>JSON.parse(readFileSync(path.join(root,'platform/electron/distribution/imsg.json'),'utf8'));
const digest=(data:Buffer)=>createHash('sha256').update(data).digest('hex');
/** Verified, unpacked imsg in `.local/imsg/<version>` (the development host's lookup path,
 * platform/electron/src/resources.ts). Reuses the primary checkout's archive before downloading. */
export async function cachedImsg(root:string):Promise<string>{
 const pin=imsgPin(root);
 const cache=path.join(root,'.local','imsg'),folder=path.join(cache,pin.version),archive=path.join(cache,pin.version+'-imsg-macos.zip');
 mkdirSync(cache,{recursive:true});
 const stamp=path.join(folder,'.sha256');
 if(existsSync(stamp)&&readFileSync(stamp,'utf8')===pin.sha256&&pin.files.every(file=>existsSync(path.join(folder,file))))return folder;
 let bytes=existsSync(archive)?readFileSync(archive):Buffer.alloc(0);
 if(digest(bytes)!==pin.sha256){
  let primary='';try{primary=workspace(root).primary;}catch{}
  const shared=primary&&path.join(primary,'.local','imsg',pin.version+'-imsg-macos.zip');
  bytes=shared&&existsSync(shared)?readFileSync(shared):Buffer.alloc(0);
 }
 if(digest(bytes)!==pin.sha256){
  const response=await fetch(pin.source,{signal:AbortSignal.timeout(120_000)});
  if(!response.ok)throw Error('Could not download the pinned imsg release: '+response.status);
  bytes=Buffer.from(await response.arrayBuffer());
  if(digest(bytes)!==pin.sha256)throw Error('imsg checksum mismatch; nothing was unpacked.');
 }
 writeFileSync(archive,bytes);
 const partial=folder+'.partial';rmSync(partial,{recursive:true,force:true});mkdirSync(partial,{recursive:true});
 // ditto keeps the archive's code signature intact on a Mac; elsewhere unzip is enough for checks.
 const unpack=process.platform==='darwin'?spawnSync('ditto',['-x','-k',archive,partial],{stdio:'inherit'}):spawnSync('unzip',['-q','-o',archive,'-d',partial],{stdio:'inherit'});
 if(unpack.status!==0)throw Error('Could not unpack imsg.');
 for(const file of pin.files)if(!existsSync(path.join(partial,file)))throw Error('The imsg archive has no '+file+'.');
 chmodSync(path.join(partial,'imsg'),0o755);
 writeFileSync(path.join(partial,'.sha256'),pin.sha256);
 rmSync(folder,{recursive:true,force:true});renameSync(partial,folder);
 return folder;
}
/** Copies imsg, the resource bundles it loads from beside itself and its license into `<output>/imsg`. */
export async function packageImsg(root:string,output:string){
 const folder=await cachedImsg(root),target=path.join(output,'imsg');
 mkdirSync(target,{recursive:true});
 for(const file of imsgPin(root).files)cpSync(path.join(folder,file),path.join(target,file),{recursive:true});
 chmodSync(path.join(target,'imsg'),0o755);
 copyFileSync(path.join(root,'platform/electron/distribution/imsg-LICENSE.txt'),path.join(target,'LICENSE.txt'));
}
