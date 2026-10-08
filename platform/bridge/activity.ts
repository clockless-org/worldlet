import {installActivityCollector} from './activity-collector.js';
import {callHost} from './host.ts';
/** Trusted World only. Never install the native bridge in an external page. */
export function recordWorldActivity(kind:string,data:Record<string,unknown>={}) {
 void callHost('worldActivity',{kind,data}).catch(()=>{});
}
let stopObserver:(()=>void)|undefined;
export function observeWorldActivity(root:HTMLElement,enabled:()=>boolean) {
 stopObserver?.();
 const record=(kind:string,data:Record<string,unknown>={})=>{if(enabled())recordWorldActivity(kind,data);};
 record('ui.open',{target:'world'});
 const collector=installActivityCollector({root,enabled,url:'https://worldlet.local/world',sink:page=>record('ui.observation',page)});
 stopObserver=()=>{collector.stop();record('ui.close',{target:'world'});};
 return stopObserver;
}
