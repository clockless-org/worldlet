import type {HostCapabilities,HostFeatures} from '../../../contracts/platform.ts';
import type {BrowserBudget} from '../../../contracts/browser-surface.ts';
// Electron facts, per OS. A flag is true only when this host actually implements the
// capability; the UI follows these flags instead of OS names.
export function hostCapabilities(implemented:(feature:keyof HostFeatures)=>boolean,{scaledPages=false,budget}:{scaledPages?:boolean;budget?:BrowserBudget}={}):HostCapabilities {
 const mac=process.platform==='darwin';
 const features:HostFeatures={
  localDataDeletion:true,curatedSourceRead:true,
  nativeAppletLaunch:mac,nativeCalendar:mac,appleNotes:mac,appleReminders:mac,voiceMemos:mac,messages:mac,localMusic:mac||process.platform==='win32',
  folderManagement:true,backgroundSourceChecks:true,cancellableOrganization:false,deferredBackupRestore:false,cancellableTransferReview:false,
  browserBookmarks:true,installedAppDetection:mac,browserFoxOverlay:true,browserPictureInPicture:true,
  // Only the CEF website engine draws a page smaller than its own size (#1170, #1175).
  browserTaskPictureInPicture:scaledPages,
  leadingWindowControls:mac,googleSignInStages:true
 };
 for(const key of Object.keys(features) as (keyof HostFeatures)[])if(features[key])features[key]=implemented(key);
 return {version:1,features,...budget?{browserBudget:budget}:{}};
}
