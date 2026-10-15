import {EventEmitter} from 'node:events';
import os from 'node:os';
import path from 'node:path';
// `electron` for the Node host (platform/node): scripts/build-node-host.ts aliases the module to this file, so the
// Electron host modules the Node host installs run unchanged. It carries only what those modules reach. Process facts
// answer for a plain Node process; anything that needs a screen fails: window constructors throw, and dialogs, the
// clipboard, shell opens and notifications say they need the desktop app. Later pull requests pass paths and the
// version through the Host instead, and this file shrinks.
declare const __WORLDLET_NODE_VERSION__:string|undefined;
export const DESKTOP_ONLY='Needs the desktop app';
const desktopOnly=(..._args:unknown[]):never=>{throw new Error(DESKTOP_ONLY);};
const desktopOnlyAsync=async(..._args:unknown[]):Promise<never>=>desktopOnly();

let profileRoot='';
/** The library this run opens (platform/node main.ts), before any module asks `app.getPath`. */
export function useProfileRoot(root:string){profileRoot=root;}

class App extends EventEmitter {
 readonly isPackaged=true;
 private name='Worldlet';
 getVersion(){return typeof __WORLDLET_NODE_VERSION__==='string'?__WORLDLET_NODE_VERSION__:'0.0.0';}
 getName(){return this.name;}
 setName(name:string){this.name=name;}
 getAppPath(){return __dirname;}
 getLocale(){return (process.env.LC_ALL||process.env.LANG||'en-US').split('.')[0].replace('_','-')||'en-US';}
 /** The Electron host's places, under the library where it keeps them (main.ts sets userData there). */
 getPath(name:string){
  const root=profileRoot||desktopOnly();
  switch(name){
   case 'userData':return path.join(root,'Browser','Electron');
   case 'logs':return path.join(root,'logs');
   case 'crashDumps':return path.join(root,'logs','crashes');
   case 'home':return os.homedir();
   case 'temp':return os.tmpdir();
   case 'exe':return process.execPath;
   case 'downloads':case 'documents':case 'desktop':case 'music':case 'pictures':case 'videos':return path.join(os.homedir(),name[0].toUpperCase()+name.slice(1));
   default:throw new Error(`No ${name} folder on the Node host.`);
  }
 }
 whenReady(){return Promise.resolve();}
 isReady(){return true;}
 requestSingleInstanceLock(){return true;}
 focus(){}
 setActivationPolicy(){}
 setUserTasks(){return false;}
 getAppMetrics():{pid:number}[]{return [];}
 getLoginItemSettings(){return {openAtLogin:false,wasOpenedAtLogin:false};}
 setLoginItemSettings(){}
 relaunch(){}
 /** `quit` asks the host to stop (platform/node main.ts listens for it); `exit` ends the process now. */
 quit(){this.emit('quit-requested');}
 exit(code=0){process.exit(code);}
 getFileIcon=desktopOnlyAsync;
}
export const app=new App();

export const dialog={
 showMessageBox:desktopOnlyAsync,showOpenDialog:desktopOnlyAsync,showSaveDialog:desktopOnlyAsync,
 showMessageBoxSync:desktopOnly,showOpenDialogSync:desktopOnly,showSaveDialogSync:desktopOnly,showErrorBox:(title:string,content:string)=>{process.stderr.write(`${title}: ${content}\n`);},
};
export const shell={
 openExternal:desktopOnlyAsync,
 /** Electron answers an error string instead of throwing. */
 openPath:async(_path?:string)=>DESKTOP_ONLY,
 showItemInFolder:desktopOnly,
 trashItem:desktopOnlyAsync,
 beep(){},
};
export const clipboard={readText:()=>'',writeText:desktopOnly};
export const nativeImage={createThumbnailFromPath:desktopOnlyAsync,createFromPath:desktopOnly,createFromBuffer:desktopOnly,createFromDataURL:desktopOnly,createEmpty:desktopOnly};
/** No sleep or wake events without a desktop session; listeners stay quiet. */
class PowerMonitor extends EventEmitter {
 getSystemIdleTime(){return 0;}
 getSystemIdleState(){return 'unknown';}
 isOnBatteryPower(){return false;}
}
export const powerMonitor=new PowerMonitor();
/** Browser sessions belong to windows: none here. */
export const session={
 get defaultSession():never{return desktopOnly();},
 fromPartition:desktopOnly,
};
/** The vault on this host has its own storage (vault-storage.ts); Electron's keychain-backed one is never there. */
export const safeStorage={isEncryptionAvailable:()=>false,encryptString:desktopOnly,decryptString:desktopOnly,getSelectedStorageBackend:()=>'unknown'};

class NoWindow {
 static getAllWindows():never[]{return [];}
 static getFocusedWindow(){return null;}
 static fromWebContents(){return null;}
 constructor(..._args:unknown[]){desktopOnly();}
}
export class BaseWindow extends NoWindow {}
export class BrowserWindow extends NoWindow {}
export class WebContentsView {constructor(..._args:unknown[]){desktopOnly();}}
export class Notification {
 static isSupported(){return false;}
 constructor(..._args:unknown[]){desktopOnly();}
}
export class Tray {constructor(..._args:unknown[]){desktopOnly();}}
export const Menu={buildFromTemplate:desktopOnly,setApplicationMenu(){},getApplicationMenu:()=>null};
export const screen={getPrimaryDisplay:desktopOnly,getAllDisplays:():never[]=>[],getCursorScreenPoint:desktopOnly,getDisplayNearestPoint:desktopOnly,getDisplayMatching:desktopOnly};
export default {app,dialog,shell,clipboard,nativeImage,powerMonitor,session,safeStorage,BaseWindow,BrowserWindow,WebContentsView,Notification,Tray,Menu,screen};
