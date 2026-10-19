import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {ensureDirectory,INSTALLATION_FOLDERS,WorldletError} from '../../files.ts';

/** Host files that are not World data: Electron's preferences file, Chromium's live profile (its
 * site data is cleared through the sessions instead of under its feet), and the installation's own folders
 * (`INSTALLATION_FOLDERS`: Fox's Hermes runtime, local speech, the local tools' Python, the model credential). The runtime can be
 * mid-install while Reset runs, and its open files would make the move fail with EPERM, so Reset never
 * finished (#1568). Since 2026-10-04 the Mac keeps them in the library too. */
export const HOST_RETAINED=['preferences.json','Browser',...INSTALLATION_FOLDERS];

/** Every entry not retained is first moved into one staging folder; a failed move puts
 * everything back, so a failed cleanup never loses model credentials. */
export function removeExceptRetained(root:string,retained:Set<string>){
 const stageName='.reset-'+crypto.randomUUID().replaceAll('-','');
 const stage=path.join(root,stageName);
 const moved:[string,string][]=[];
 const clean=(directory:string,prefix:string)=>{
  if(!fs.existsSync(directory))return;
  for(const name of fs.readdirSync(directory)){
   const relative=prefix+name;
   if(relative===stageName)continue;
   const child=path.join(directory,name);
   const link=fs.lstatSync(child).isSymbolicLink();
   if(retained.has(relative)&&!link)continue;
   if(!link&&[...retained].some(kept=>kept.startsWith(relative+'/'))){clean(child,relative+'/');continue;}
   const target=path.join(stage,relative);
   ensureDirectory(path.dirname(target));
   fs.renameSync(child,target);moved.push([child,target]);
  }
 };
 try{clean(root,'');}
 catch(error){
  for(const [live,staged] of moved.reverse()){try{fs.renameSync(staged,live);}catch{}}
  fs.rmSync(stage,{recursive:true,force:true});
  throw new WorldletError('Reset could not finish; your library was left as it was. '+(error instanceof Error?error.message:''));
 }
 fs.rmSync(stage,{recursive:true,force:true});
}
