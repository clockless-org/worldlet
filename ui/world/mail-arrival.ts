import {ACTIVE_THEME,activeBuildTheme,createThemeEvents,playThemeSound} from '../style/index.ts';

/** One cue for a batch of new letters: the theme's `mail.received` event, its sound and, inside Mail, the room's delivery. Opening Mail never calls this. */
export function createMailArrival(room:()=>boolean=()=>false){
 const reduced=matchMedia('(prefers-reduced-motion: reduce)'),presentation=activeBuildTheme().package.presentation,legacy=ACTIVE_THEME.pack;
 const declared=!!(presentation.appletScenes?.gmail?.mailDelivery||presentation.sound?.events['mail.received']);
 const pack=declared?{...legacy,motion:{...legacy.motion,events:{...legacy.motion.events,'mail.received':{cue:'mail-delivery',play:'once' as const,reduced:'static' as const}}}}:legacy;
 const events=createThemeEvents(pack,{reducedMotion:()=>reduced.matches});
 const stop=()=>events.stopAll();
 const visibility=()=>{if(document.hidden)stop();};document.addEventListener('visibilitychange',visibility);reduced.addEventListener('change',stop);
 return {arrive(id:string){
  const cue=events.play({event:'mail.received',id});
  if(cue)playThemeSound('mail.received');
  if(!cue||cue.still||reduced.matches||document.hidden)return;
  room();
 },destroy(){stop();document.removeEventListener('visibilitychange',visibility);reduced.removeEventListener('change',stop);}};
}
