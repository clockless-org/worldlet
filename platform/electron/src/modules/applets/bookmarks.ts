import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
// Explicit, local bookmark discovery (Mac BrowserBookmarks). Never reads history, cookies or credentials.
const MAX_FILE=8*1024*1024;
const SERVICE_PATHS=['/document','/spreadsheets','/presentation','/maps','/software/jira'];
function chromiumRoots(home:string):[string,string][] {
 if(process.platform==='darwin'){const base=path.join(home,'Library/Application Support');return [['Chrome',path.join(base,'Google/Chrome')],['Edge',path.join(base,'Microsoft Edge')],['Brave',path.join(base,'BraveSoftware/Brave-Browser')],['Chromium',path.join(base,'Chromium')]];}
 if(process.platform==='win32'){const base=process.env.LOCALAPPDATA||path.join(home,'AppData/Local');return [['Chrome',path.join(base,'Google/Chrome/User Data')],['Edge',path.join(base,'Microsoft/Edge/User Data')],['Brave',path.join(base,'BraveSoftware/Brave-Browser/User Data')],['Chromium',path.join(base,'Chromium/User Data')]];}
 const base=process.env.XDG_CONFIG_HOME||path.join(home,'.config');
 return [['Chrome',path.join(base,'google-chrome')],['Edge',path.join(base,'microsoft-edge')],['Brave',path.join(base,'BraveSoftware/Brave-Browser')],['Chromium',path.join(base,'chromium')]];
}
/** Safari's binary property list as JSON through the system converter; no parser of our own. */
function plistJSON(file:string){
 return new Promise<unknown>((resolve,reject)=>{
  execFile('/usr/bin/plutil',['-convert','json','-o','-','--',file],{maxBuffer:MAX_FILE*4,timeout:15000,env:{PATH:'/usr/bin:/bin'}},(error,stdout)=>{
   if(error)return reject(error);
   try{resolve(JSON.parse(stdout));}catch(problem){reject(problem);}
  });
 });
}
export async function discoverBookmarks(home=os.homedir()){
 const urls=new Set<string>(),readers=new Set<string>(),unavailable=new Set<string>();
 const add=(raw:unknown)=>{
  if(typeof raw!=='string')return;
  let url:URL;try{url=new URL(raw);}catch{return;}
  if(!['https:','http:'].includes(url.protocol)||!url.hostname||url.username||url.password)return;
  // Retain only known shared-host service prefixes, never document IDs or query strings.
  const prefix=SERVICE_PATHS.find(value=>url.pathname===value||url.pathname.startsWith(value+'/'))??'/';
  urls.add('https://'+url.hostname+prefix);
 };
 const walk=(value:unknown,depth=0)=>{
  if(depth>=32||urls.size>=10000)return;
  if(Array.isArray(value)){for(const child of value)walk(child,depth+1);return;}
  if(!value||typeof value!=='object')return;
  const object=value as Record<string,unknown>;
  const url=object.url??object.URLString;if(typeof url==='string')add(url);
  for(const key of ['children','Children','roots','bookmark_bar','other','synced'])if(key in object)walk(object[key],depth+1);
 };
 const read=async(file:string,browser:string,plist=false)=>{
  try{
   const size=fs.statSync(file).size;
   if(size>MAX_FILE){unavailable.add(browser);return;}
   walk(plist?await plistJSON(file):JSON.parse(fs.readFileSync(file,'utf8')));readers.add(browser);
  }catch(error){if(error?.code!=='ENOENT')unavailable.add(browser);}
 };
 for(const [browser,root] of chromiumRoots(home)){
  let profiles:string[]=[];try{profiles=fs.readdirSync(root);}catch{}
  for(const profile of profiles)if(profile==='Default'||profile.startsWith('Profile '))await read(path.join(root,profile,'Bookmarks'),browser);
 }
 if(process.platform==='darwin')await read(path.join(home,'Library/Safari/Bookmarks.plist'),'Safari',true);
 return {urls:[...urls].sort(),browsers:[...readers].sort(),unavailable:[...unavailable].sort()};
}
