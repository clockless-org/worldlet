// A Mac copy opened straight from the disk image, or one macOS runs from a read-only translocated folder, cannot
// update itself: its folder is not writable, so every update stops at `update_failed` stage `folder` and the person
// stays on that build (two new Mac Beta 4384 installs, 2026-10-14). Before anything else opens, such a copy offers
// to move itself into Applications; Electron copies it there, removes this copy's quarantine and relaunches it.
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {app,dialog} from 'electron';
import {releaseLaunch} from '../../../agent/app/index.ts';
import type {Profile} from '../../host/profile.ts';

const plistBuild=(bundle:string)=>{
 try{return Number(execFileSync('/usr/bin/plutil',['-extract','CFBundleVersion','raw','-o','-',path.join(bundle,'Contents/Info.plist')],{encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:10_000}).trim())||0;}
 catch{return 0;}
};

/** True when this launch hands over to a copy in Applications: the caller quits. */
export async function offerApplicationsFolder(profile:Profile):Promise<boolean> {
 // Only a person's own launch of the released Mac app: checks, captures and probes pass `--` flags, and a login
 // launch opens quietly.
 if(process.platform!=='darwin'||!app.isPackaged||profile.channel!=='release'||!releaseLaunch(process.argv))return false;
 try{if(app.getLoginItemSettings({type:'mainAppService'}).wasOpenedAtLogin||app.isInApplicationsFolder())return false;}catch{return false;}
 const bundle=path.resolve(process.execPath,'../../..');
 // A copy anywhere writable (Downloads, Desktop) still updates itself: nothing to ask.
 try{fs.accessSync(path.dirname(bundle),fs.constants.W_OK);return false;}catch{}
 const {response}=await dialog.showMessageBox({type:'question',buttons:['Move to Applications','Not Now'],defaultId:0,cancelId:1,
  message:'Move Worldlet to your Applications folder?',
  detail:'Worldlet is running from the disk image, so it cannot keep itself up to date. Moving it puts it in Applications and opens it from there.'});
 if(response!==0)return false;
 // A copy already in Applications that is as new or newer (an Alpha, say) is kept and opened instead: moving this
 // older one over it would go back to an older app over newer data.
 const installed=['/Applications',path.join(app.getPath('home'),'Applications')].map(folder=>path.join(folder,path.basename(bundle))).find(existing=>fs.existsSync(existing));
 if(installed&&plistBuild(installed)>=plistBuild(bundle)){
  app.relaunch({execPath:path.join(installed,'Contents/MacOS',path.basename(process.execPath)),args:[]});
  return true;
 }
 try{
  // Electron replaces an older copy of the same name in Applications (its `exists` conflict) by default.
  return app.moveToApplicationsFolder();
 }catch(error){
  dialog.showErrorBox('Worldlet could not be moved',`${error instanceof Error?error.message:String(error)}\n\nDrag Worldlet from the disk image into Applications, then open it from there.`);
  return false;
 }
}
