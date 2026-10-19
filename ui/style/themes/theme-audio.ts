import type {ThemePack} from './theme-pack.ts';
/** Presentation only: user-selected audio and playback state belong to the shared player. */
export function themeAmbientTrack(pack:ThemePack,level='overview',current=''){
 const p=pack.motion.sound.presentation;if(!p)return 'village';
 const loop=level==='overview'?p.overview:level==='building'?p.areas[current.replace(/^building-/,'')]||p.room:level==='object'?p.applets[current.replace(/^app-/,'')]||p.room:p.room;
 return 'theme:'+pack.id+':'+loop;
}
