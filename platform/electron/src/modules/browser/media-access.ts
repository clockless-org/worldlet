import {dialog,shell,systemPreferences,type BaseWindow} from 'electron';

/** Camera and microphone for a meeting page (BrowserDevice.permission). The page captures in the website
 * engine's processes, which macOS counts as Worldlet's own, so the app asks macOS here before the page
 * opens a device; otherwise a site was allowed but got no sound or picture. Windows only reports its
 * privacy switches; other systems have none. */
export type MediaDevice='microphone'|'camera';
export const mediaDevices=(media:number):MediaDevice[]=>[...media&1?['microphone' as const]:[],...media&2?['camera' as const]:[]];
export const mediaWords=(media:number)=>media&1&&media&2?'camera and microphone':media&2?'camera':'microphone';

/** The devices the OS does not let Worldlet use; macOS asks the person the first time. */
export async function blockedMediaDevices(devices:MediaDevice[],platform:string=process.platform):Promise<MediaDevice[]> {
 if(platform!=='darwin'&&platform!=='win32')return [];
 const blocked:MediaDevice[]=[];
 for(const device of devices){
  const status=systemPreferences.getMediaAccessStatus(device);
  const allowed=status==='granted'||(platform==='win32'?status!=='denied':status==='not-determined'&&await systemPreferences.askForMediaAccess(device));
  if(!allowed)blocked.push(device);
 }
 return blocked;
}

const SETTINGS:Record<string,Record<MediaDevice,string>>={
 darwin:{microphone:'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',camera:'x-apple.systempreferences:com.apple.preference.security?Privacy_Camera'},
 win32:{microphone:'ms-settings:privacy-microphone',camera:'ms-settings:privacy-webcam'}
};
/** Says where to turn the blocked devices on, with a button that opens that settings page. */
export async function explainBlockedMedia(window:BaseWindow|null,blocked:MediaDevice[],platform:string=process.platform){
 if(!blocked.length)return;
 const words=blocked.length>1?'camera and microphone':blocked[0];
 const panes=blocked.map(device=>device==='camera'?'Camera':'Microphone').join(' and ');
 const where=platform==='darwin'?`System Settings › Privacy & Security › ${panes}`:`Settings › Privacy & security › ${panes}`;
 const options={type:'info' as const,message:`Worldlet can’t use your ${words} yet`,detail:`Turn on Worldlet in ${where}, then try again in the call.`,buttons:['Open Settings','Not Now'],defaultId:0,cancelId:1,noLink:true};
 const result=await (window?dialog.showMessageBox(window,options):dialog.showMessageBox(options)).catch(()=>null);
 const pane=SETTINGS[platform]?.[blocked[0]];
 if(result?.response===0&&pane)await shell.openExternal(pane).catch(()=>{});
}
