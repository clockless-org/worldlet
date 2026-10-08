import type {HostFeatures} from '../../contracts/platform.ts';
import type {BrowserBudget} from '../../contracts/browser-surface.ts';
import {readBrowserBudget} from '../../core/browser/index.ts';
// Compatibility for snapshots from older hosts. New hosts may explicitly
// advertise capabilities; UI depends on features rather than OS names.
// Picture in picture needs a host that knows browserPip, so older hosts never offer it.
export function hostFeatures(info:any):HostFeatures {
 const windows=info?.platform==='windows';
 const legacy:HostFeatures={localDataDeletion:!windows,curatedSourceRead:false,nativeAppletLaunch:!windows,nativeCalendar:!windows,appleNotes:!windows,appleReminders:!windows,voiceMemos:!windows,messages:false,localMusic:false,folderManagement:windows,backgroundSourceChecks:!windows,cancellableOrganization:windows,deferredBackupRestore:windows,cancellableTransferReview:windows,browserBookmarks:!windows,installedAppDetection:!windows,browserFoxOverlay:!windows,browserPictureInPicture:false,browserTaskPictureInPicture:false,leadingWindowControls:!windows,googleSignInStages:false};
 if(info?.hostCapabilities===undefined)return legacy;
 const value=info.hostCapabilities;
 if(value?.version!==1)throw Error('Unsupported Worldlet capability version. Update the app.');
 return Object.fromEntries(Object.keys(legacy).map(key=>[key,value.features?.[key]===true])) as unknown as HostFeatures;
}
/** The host's website page budget (#1176), or the earlier bound from a host that sends none. */
export const hostBrowserBudget=(info:any):BrowserBudget=>readBrowserBudget(info?.hostCapabilities?.browserBudget);
// A host that reports sign-in stages opens Google consent only when the saved grant cannot be
// reused, so the UI starts neutral and shows browser steps on `browser`. Older hosts never say
// it, so they keep the browser steps from the start.
export const googleSignInStart=(info:any):'connecting'|'browser'=>hostFeatures(info).googleSignInStages?'connecting':'browser';
export function hostCopy(info:any) {
 const windows=info?.platform==='windows';
 return {
 // Fox's first line on the desktop: how to go back or quit (Mac has the Dock menu, Windows the tray icon, Linux neither).
 desktopCompanionHint:'I’ll keep working here in the background. Right-click me'+(windows?' (or the tray icon)':info?.platform==='macos'?' (or the Dock icon)':'')+' to go **Back to World** or **Quit Completely**.',
 googleConnect:windows?'I’m opening your browser. Sign in with Google to read Gmail and Calendar here. This connection is read only.':'I’m opening your **browser**. **Sign in with Google** there so Mail can find what needs your attention.\n\nIf Google shows an unverified-app warning, choose **Advanced** → **Go to Worldlet**, then **Continue** to finish connecting.',
 voice:windows?'**Talk or type**\n\nHold Fox or Space to speak, then release to send. Esc cancels. Recognition runs locally; first use downloads a speech model. Allow desktop microphone access in Windows privacy settings. You can also type. Replies can be read aloud using installed Windows voices.':undefined,
 voices:windows?'Automatic voice follows the reply language using installed Windows voices, with the system default as a fallback.':'System voices are installed on this Mac; automatic voice follows the reply language.',
 backup:windows?'**Your data**\n\nExport your Windows world, local records, browsing history, Fox memory and conversations to a private local backup. Provider credential files, browser logins and executable skills are excluded. Restore checks the backup and applies it when you next open Worldlet, keeping your previous library for recovery. Reconnect accounts and allow context again afterwards. Windows and Mac backup formats are separate.':undefined,
 companion:windows?'**Take your companion with you**\n\nExport your personal-world companion identity, personality, visible conversations and current companion memories. Accounts, credentials, practice and setup conversations are excluded. Import replaces your personal companion after you review the file, keeps a recovery copy and starts a new personal conversation.':undefined
 };
}
