import {CLASSIC_LOOK,normalizeCompanionLook,companionLookKey,type CompanionLook} from '../../core/companion/index.ts';

/** The look the companion wears on this page. The host sends it with the profile at
 * start and with every change (`worldlet:companion-appearance` carrying `look`); each
 * portrait follows it. */
let current:CompanionLook=CLASSIC_LOOK;
const listeners=new Set<(look:CompanionLook)=>void>();
export const companionLook=()=>current;
export function followCompanionLook(listener:(look:CompanionLook)=>void){listeners.add(listener);return ()=>{listeners.delete(listener);};}
export function showCompanionLook(value:unknown){
 const look=normalizeCompanionLook(value);
 if(companionLookKey(look)===companionLookKey(current))return;
 current=look;for(const listener of listeners)listener(look);
}
if(typeof window!=='undefined')window.addEventListener('worldlet:companion-appearance',event=>{const detail=(event as CustomEvent).detail;if(detail&&'look' in detail)showCompanionLook(detail.look);});
