// Official Sparkle command-line tools (generate_appcast, sign_update) at a pinned release.
// The Electron app does not embed Sparkle; release hosts use these tools to sign the update
// feed that installed apps (Sparkle-based and Electron-based) already read.
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync,renameSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
export const SPARKLE={version:'2.10.0',archive:'Sparkle-2.10.0.tar.xz',sha256:'c2bf58aa8387266ac179357b1415d6f2635f044da8be41042af32425dae6da0c'};
// Releases run in a temporary worktree, so the verified archive is cached in the primary checkout
// (the Git common directory's parent) and reused by every release. A download is retried: 02 lost its
// connection to github.com for seconds at a time on 2026-10-01 (#1051).
export function cacheRoot(root:string){
 try{const common=execFileSync('git',['rev-parse','--path-format=absolute','--git-common-dir'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();if(path.basename(common)==='.git')return path.dirname(common);}catch{}
 return root;
}
async function download(url:string,attempts=3){
 for(let attempt=1;;attempt++){
  try{const response=await fetch(url,{signal:AbortSignal.timeout(180_000)});if(!response.ok)throw Error('Could not download Sparkle tools: '+response.status);return Buffer.from(await response.arrayBuffer());}
  catch(error){if(attempt>=attempts)throw error;console.error(`Sparkle tools download attempt ${attempt} failed (${(error as Error).message}); retrying in 15 s.`);await new Promise(resolve=>setTimeout(resolve,15_000));}
 }
}
export async function sparkleTools(root:string){
 const cache=path.join(cacheRoot(root),'.local/sparkle');
 const dir=path.join(cache,SPARKLE.version),bin=path.join(dir,'bin');
 if(existsSync(path.join(bin,'generate_appcast'))&&existsSync(path.join(bin,'sign_update')))return bin;
 mkdirSync(cache,{recursive:true});
 const cached=path.join(cache,SPARKLE.archive);
 let bytes=existsSync(cached)?readFileSync(cached):Buffer.alloc(0);
 const valid=(data:Buffer)=>createHash('sha256').update(data).digest('hex')===SPARKLE.sha256;
 if(!valid(bytes)){
  bytes=await download(`https://github.com/sparkle-project/Sparkle/releases/download/${SPARKLE.version}/${SPARKLE.archive}`);
  if(!valid(bytes))throw Error('Sparkle tools checksum mismatch.');
  writeFileSync(cached,bytes);
 }
 const staging=dir+'.partial';rmSync(staging,{recursive:true,force:true});mkdirSync(staging,{recursive:true});
 execFileSync('tar',['-xJf',cached,'-C',staging,'./bin']);
 rmSync(dir,{recursive:true,force:true});renameSync(staging,dir);
 return bin;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)process.stdout.write(await sparkleTools(fileURLToPath(new URL('../',import.meta.url)))+'\n');
