import {setupText} from './setup-language.ts';
import {hostCopy} from '../../platform/bridge/features.ts';

/** The first time after setup that closing or minimizing the World leaves Fox on the desktop, Fox says
 * once why it stayed and how to go back or quit (demo feedback 2026-10-03: a person force-quit instead).
 * One line in Fox's usual reply place, fading on its own; never during setup or the tour. The flag is
 * this installation's page storage, like Fox's position. */
const KEY='worldlet.companion.desktop-hint',SOURCE='desktop-companion-hint',FADE=15000;
/** The host's wording (`hostCopy`: Dock, tray or neither) in the interface language. */
export const desktopCompanionHintText=(state:unknown,language:string)=>setupText(hostCopy(state).desktopCompanionHint,language.split('-')[0]);
export function mountDesktopCompanionHint({root,view,state:initial}){
 let state=initial,timer=0;
 const shown=()=>{try{return localStorage.getItem(KEY)==='1';}catch{return true;}};
 const clear=()=>{clearTimeout(timer);if(view.guideSource===SOURCE)view.setGuide(null);};
 const changed=(event:Event)=>{
  if(!(event as CustomEvent).detail){clear();return;}
  if(shown()||state?.onboarding?.completed!==true||root?.dataset.onboardingLocked==='true'||root?.dataset.onboarding==='true')return;
  // Wait for the Companion's own context change; a line Fox is already saying keeps its place, and the hint waits for the next close.
  setTimeout(()=>{
   if(!document.documentElement.classList.contains('desktop-companion')||view.busy||view.guideSource||shown())return;
   try{localStorage.setItem(KEY,'1');}catch{return;}
   let language='';try{language=document.documentElement.lang||localStorage.getItem('worldlet-interface-language')||'';}catch{}
   view.setGuide({source:SOURCE,takeover:false,text:desktopCompanionHintText(state,language),actions:[]});view.revealGuide?.();
   timer=window.setTimeout(clear,FADE);
  },300);
 };
 window.addEventListener('worldlet:desktop-companion',changed);
 return {update(next){state=next;},destroy(){clear();window.removeEventListener('worldlet:desktop-companion',changed);}};
}
