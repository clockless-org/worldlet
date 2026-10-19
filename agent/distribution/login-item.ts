import {onboardingUnfinished} from '../onboarding/index.ts';
/** Open Worldlet at login (#1229): the setting's truthful status, when Fox offers it once, and whether
 * this launch came from the login item. Pure, so every host and the fixture check share one mapping. */
export type LoginItemStatus='enabled'|'disabled'|'requires-approval'|'unsupported';
/** The fields Electron's app.getLoginItemSettings() reports that matter here. */
export interface LoginItemSettingsFacts {openAtLogin?:boolean;status?:string;executableWillLaunchAtLogin?:boolean}
/** Windows marks a launch from the Run entry with this argument; the Mac reports wasOpenedAtLogin. */
export const LOGIN_ITEM_ARG='--opened-at-login';
/** A launch of the installed app as people start it, not a command-line check: no `--` switch but the login item's.
 * Windows starts the app at login with LOGIN_ITEM_ARG; that run reports and updates like any other. */
export function releaseLaunch(argv:readonly string[]){return !argv.slice(1).some(arg=>arg.startsWith('--')&&arg!==LOGIN_ITEM_ARG);}

/** Only packaged Mac and Windows builds register; a Dev build never does. On macOS 13+ SMAppService
 * reports `status`; a person may still have to allow the item in System Settings → General → Login
 * Items. On Windows a Run entry turned off in Task Manager or Settings → Apps → Startup still reads
 * openAtLogin but will not launch: that also needs the person, so it reads as requires-approval. */
export function loginItemStatus({channel,platform,settings}:{channel:string,platform:string,settings:LoginItemSettingsFacts|null}):LoginItemStatus {
 if(channel!=='release'||!['darwin','win32'].includes(platform)||!settings)return 'unsupported';
 if(platform==='darwin'&&settings.status){
  if(settings.status==='enabled')return 'enabled';
  if(settings.status==='requires-approval')return 'requires-approval';
  return 'disabled';
 }
 if(!settings.openAtLogin)return 'disabled';
 return platform==='win32'&&settings.executableWillLaunchAtLogin===false?'requires-approval':'enabled';
}

/** Whether Open at Login is on in the sense a person meant: registered, even if still awaiting approval. */
export const loginItemOn=(status:LoginItemStatus)=>status==='enabled'||status==='requires-approval';

/** Fox offers once, after onboarding: setup is complete and the tour and first task are behind the
 * person. Never while it is already on, unsupported, or after either answer was given. */
export function loginItemOfferDue({status,offered,onboarding}:{status:LoginItemStatus|undefined,offered:boolean|undefined,onboarding:{completed?:boolean,journeyStage?:string}|undefined}){
 if(status!=='disabled'||offered)return false;
 return !onboardingUnfinished(onboarding);
}

/** A launch by the login item starts quietly. The Mac only knows through wasOpenedAtLogin. */
export function openedAtLogin({platform,argv,wasOpenedAtLogin}:{platform:string,argv:string[],wasOpenedAtLogin?:boolean}){
 if(platform==='darwin')return wasOpenedAtLogin===true;
 if(platform==='win32')return argv.includes(LOGIN_ITEM_ARG);
 return false;
}

/** The setting's words for each status; the person's next step names where their system keeps it. */
export function loginItemText(status:LoginItemStatus|undefined,platform?:string){
 const settings=platform==='win32'?'Settings → Apps → Startup':'System Settings → General → Login Items';
 if(status==='enabled')return 'Worldlet opens quietly in the background when you log in.';
 if(status==='requires-approval')return `Worldlet is set to open at login, but it needs your approval: allow Worldlet in ${settings}.`;
 if(status==='disabled')return 'Worldlet does not open when you log in.';
 return 'Opening at login is available only in the installed Worldlet app.';
}
