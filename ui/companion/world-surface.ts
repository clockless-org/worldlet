import {callHost} from '../../platform/bridge/host.ts';
export const isDesktopCompanion=()=>document.documentElement.classList.contains('desktop-companion');
let restoring:Promise<void>|null=null;
/** Navigation waits for both the native window and its world presentation. */
export async function requireWorldSurface(call=callHost){
 if(!isDesktopCompanion())return;
 if(!restoring)restoring=(async()=>{await call('openWorld');if(isDesktopCompanion())throw Error('The world did not reopen. Please try again.');})().finally(()=>{restoring=null;});
 await restoring;
}
