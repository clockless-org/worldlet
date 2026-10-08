/** Pinned upstream agent-browser driver for one platform; the Electron host attaches it to a page over CDP. */
import {createHash} from 'node:crypto';
import {chmod,mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {workspace} from './dev-workspace.ts';
/** The host's driver target name in driver.json, or null for an unpinned platform. */
export function agentBrowserTarget(platform=process.platform,arch=process.arch){
 return platform==='win32'?'win32-x64':`${platform}-${arch==='arm64'?'arm64':'x64'}`;
}
/** Verified, executable driver in `.local/browser-driver` (the development host's lookup path,
 * platform/electron/src/resources.ts). Reuses the primary checkout's copy before downloading. */
export async function cachedAgentBrowser(root:string,target=agentBrowserTarget()){
 const spec=JSON.parse(await readFile(path.join(root,'platform/browser/driver.json'),'utf8'));
 const {version}=spec,asset=spec.assets[target];
 if(!asset)throw Error('No pinned agent-browser for '+target);
 const {name,sha256:digest}=asset;
 const cache=path.join(root,'.local','browser-driver');await mkdir(cache,{recursive:true});
 const cached=path.join(cache,version+'-'+name);
 const valid=(data:Buffer)=>createHash('sha256').update(data).digest('hex')===digest;
 let bytes=await readFile(cached).catch(()=>Buffer.alloc(0));
 if(valid(bytes)){await chmod(cached,0o755);return {file:cached,bytes};}
 let primary='';try{primary=workspace(root).primary;}catch{}
 if(primary)bytes=await readFile(path.join(primary,'.local','browser-driver',version+'-'+name)).catch(()=>Buffer.alloc(0));
 if(!valid(bytes)){
  const response=await fetch(`https://github.com/vercel-labs/agent-browser/releases/download/v${version}/${name}`,{signal:AbortSignal.timeout(120_000)});
  if(!response.ok)throw Error('Could not download the pinned browser driver: '+response.status);
  bytes=Buffer.from(await response.arrayBuffer());
  if(!valid(bytes))throw Error('Browser driver checksum mismatch.');
 }
 // The transport spawns it directly (platform/browser/agent_browser.py), so it must be executable.
 await writeFile(cached,bytes,{mode:0o755});await chmod(cached,0o755);
 return {file:cached,bytes};
}
export async function packageAgentBrowser(root:string,output:string,target='win32-x64'){
 const {bytes}=await cachedAgentBrowser(root,target);
 await mkdir(output,{recursive:true});await writeFile(path.join(output,target.startsWith('win32')?'agent-browser.exe':'agent-browser'),bytes,{mode:0o755});
 await copyFile(path.join(root,'platform/browser/agent-browser-LICENSE.txt'),path.join(output,'agent-browser-LICENSE.txt'));
}
