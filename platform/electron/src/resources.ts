import fs from 'node:fs';
import path from 'node:path';
import {app} from 'electron';
import type {Profile} from './profile.ts';
import driver from '../../browser/driver.json';
import imsg from '../distribution/imsg.json';
// Helpers the packager places in `process.resourcesPath` (scripts/package-electron.ts).
// Development builds resolve the same files from the checkout's caches instead.
export type BundledResource='uv'|'agentBrowser'|'stripe'|'googleClient'|'distribution'|'buildInfo'|'imsg';
/** `<platform>-<arm64|x64>`, the key prebuilt helpers are stored under. */
export const platformArch=()=>`${process.platform}-${process.arch==='arm64'?'arm64':'x64'}`;
const exe=(name:string)=>process.platform==='win32'?name+'.exe':name;
function driverAsset(){
 const key=process.platform==='win32'?'win32-x64':platformArch();
 return (driver as any).assets?.[key]?.name as string|undefined;
}
export function bundledResource(profile:Profile,name:BundledResource):string|null {
 const packaged=app.isPackaged?process.resourcesPath:null;
 const candidates:string[]=[];
 const repo=profile.resources;
 switch(name){
  // The uv executable for Worldlet's own tools Python: the packaged bootstrap's, else in development the checkout's
  // .local/bootstrap one (scripts/dev-electron.ts passes the primary checkout's as WORLDLET_UV and installs it when missing).
  case 'uv':
   if(packaged)candidates.push(path.join(packaged,'HermesBootstrap',exe('uv')));
   else{
    if(process.env.WORLDLET_UV)candidates.push(process.env.WORLDLET_UV);
    candidates.push(path.join(repo,'.local/electron/HermesBootstrap',exe('uv')),path.join(repo,'.local/bootstrap',process.platform==='win32'?'Scripts':'bin',exe('uv')));
   }
   break;
  case 'agentBrowser':
   if(process.env.WORLDLET_AGENT_BROWSER)candidates.push(process.env.WORLDLET_AGENT_BROWSER);
   if(packaged)candidates.push(path.join(packaged,exe('agent-browser')));
   {const asset=driverAsset();if(asset)candidates.push(path.join(repo,'.local/browser-driver',`${(driver as any).version}-${asset}`));}
   break;
  case 'stripe':
   if(packaged)candidates.push(path.join(packaged,exe('stripe')));
   candidates.push(path.join(repo,'node_modules',`@stripe/cli-${process.platform==='win32'?'windows':process.platform}-${process.arch}`,'bin',exe('stripe')));
   break;
  case 'googleClient':
   if(packaged)candidates.push(path.join(packaged,'GoogleOAuthClient.json'));
   if(process.env.WORLDLET_GOOGLE_CLIENT_FILE)candidates.push(process.env.WORLDLET_GOOGLE_CLIENT_FILE);
   candidates.push(path.join(repo,'.local/google-oauth-client.json'));
   break;
  case 'imsg':
   if(process.env.WORLDLET_IMSG)candidates.push(process.env.WORLDLET_IMSG);
   if(packaged)candidates.push(path.join(packaged,'imsg','imsg'));
   candidates.push(path.join(repo,'.local/imsg',imsg.version,'imsg'));
   break;
  case 'distribution':candidates.push(packaged?path.join(packaged,'distribution'):path.join(repo,'platform/electron/distribution'));break;
  case 'buildInfo':if(packaged)candidates.push(path.join(packaged,'build-info.json'));candidates.push(path.join(profile.webRoot,'build-info.json'));break;
 }
 return candidates.find(file=>fs.existsSync(file))??null;
}
