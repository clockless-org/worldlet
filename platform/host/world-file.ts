import fs from 'node:fs';
import path from 'node:path';
/** The file a World URL path names inside the interface build, after resolving links, or null when there is none or it
 * lies outside `realRoot` (already a real path). `pathname` is the URL path below the World's root: `/` is index.html.
 * Shared by the app's worldlet://app protocol (protocol.ts) and the World served to a browser on this computer
 * (modules/windows/local-relay.ts). */
export async function resolveWorldFile(realRoot:string,pathname:string):Promise<string|null> {
 let relative:string;
 try{relative=decodeURIComponent(pathname);}catch{return null;}
 if(relative==='/'||!relative)relative='/index.html';
 if(relative.includes('\0'))return null;
 let file:string;
 try{file=await fs.promises.realpath(path.join(realRoot,path.normalize(relative)));}catch{return null;}
 if(file!==realRoot&&!file.startsWith(realRoot+path.sep))return null;
 try{return (await fs.promises.stat(file)).isFile()?file:null;}catch{return null;}
}
