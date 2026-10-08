import type {ThemeEvent,ThemePack} from './theme-pack.ts';

// Business events are separate from the animations they trigger. Core reports what happened
// (a new mail arrived, a task ran, failed or was cancelled); the active theme decides what plays.
// A cue plays once per real event: reading old mail or re-entering a room never replays it, and
// a failed or cancelled task stops where it was instead of finishing, never showing success.
export type ThemeOccurrence={event:ThemeEvent;id:string};
export type ThemeCue={cue:string;event:ThemeEvent;id:string;play:'once'|'while-running';still:boolean;sound?:string};
const ENDINGS:readonly ThemeEvent[]=['task.succeeded','task.failed','task.cancelled'];

export function createThemeEvents(theme:ThemePack,{reducedMotion=()=>false,seen=new Set<string>()}:{reducedMotion?:()=>boolean;seen?:Set<string>}={}){
 const running=new Map<string,ThemeCue>();
 const key=(o:ThemeOccurrence)=>o.event+'\u0000'+o.id;
 return {
  /** The cue to play for an event that just happened, or null: already played, nothing to play, or a stale ending. */
  play(o:ThemeOccurrence):ThemeCue|null{
   if(seen.has(key(o)))return null;seen.add(key(o));
   // Any ending stops the work cue where it is; the theme's failure and cancel cues are never its success cue.
   const ending=ENDINGS.includes(o.event);
   if(ending)running.delete(o.id);
   const spec=theme.motion.events[o.event];if(!spec)return null;
   const reduced=reducedMotion();
   if(reduced&&spec.reduced==='none')return null;
   const cue:ThemeCue={cue:spec.cue,event:o.event,id:o.id,play:spec.play,still:reduced&&spec.reduced!=='appear',sound:theme.motion.sound.events[o.event]};
   if(spec.play==='while-running'&&!ending)running.set(o.id,cue);
   return cue;
  },
  /** Cues still running, e.g. to resume a hum after a redraw; re-entering never restarts one-shot cues. */
  running:()=>[...running.values()],
  /** Stops everything at once (window hidden, theme switched); nothing is replayed afterwards. */
  stopAll(){running.clear();}
 };
}
