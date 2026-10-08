import {app,type Settings} from 'electron';
import {LOGIN_ITEM_ARG,loginItemOn,loginItemStatus,type LoginItemStatus} from '../../../../../core/distribution/index.ts';
import {WorldletError} from '../../files.ts';
import type {Host} from '../../host/types.ts';

/** Windows matches the Run entry by path and arguments, so reading uses the same options as writing. */
export const loginItemOptions=()=>process.platform==='darwin'?{type:'mainAppService' as const}:{path:process.execPath,args:[LOGIN_ITEM_ARG]};
/** Per computer, so never part of a World backup: Fox asked once, whatever the answer was. */
const OFFERED='worldlet.loginItem.offered';
/** Open Worldlet at login (#1229). Only a packaged Mac or Windows build registers; a Dev build, Linux
 * and a Microsoft Store package (its Run entry would be virtualised away) report `unsupported` and
 * never touch the system's login items. The Mac registers the app itself through SMAppService. */
export function createLoginItem(host:Host){
 const listeners:(()=>void)[]=[];
 const supported=()=>host.profile.channel==='release'&&(process.platform==='darwin'||process.platform==='win32'&&!process.windowsStore);
 const settings=()=>{
  if(!supported())return null;
  try{return app.getLoginItemSettings(loginItemOptions());}catch(error){host.diagnostics.record(error,'loginItem');return null;}
 };
 // Read once and again when a person may have changed it (the setting, or System Settings while away),
 // not for every World snapshot.
 let current:LoginItemStatus|null=null;
 const status=()=>current??=loginItemStatus({channel:supported()?'release':'dev',platform:process.platform,settings:settings()});
 const snapshot=()=>({status:status(),offered:host.preferences.bool(OFFERED),platform:process.platform});
 const changed=()=>{for(const listener of listeners)try{listener();}catch{}};
 return {
  supported,status,snapshot,settings,
  on:()=>loginItemOn(status()),
  onChange(listener:()=>void){listeners.push(listener);},
  /** Re-read the system; tells listeners only when the status moved. */
  refresh(){const before=current;current=null;if(status()!==before)changed();return snapshot();},
  set(enabled:boolean){
   if(!supported())throw new WorldletError('Opening at login is available only in the installed Worldlet app.');
   const next={openAtLogin:enabled,...loginItemOptions()} as Settings;
   app.setLoginItemSettings(next);
   current=null;changed();
   return snapshot();
  },
  markOffered(){host.preferences.set(OFFERED,true);changed();return snapshot();}
 };
}
