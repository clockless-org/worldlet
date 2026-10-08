import getty from './ready/getty-center.ts';
// Ready-made moment Applets (core/widgets/README.md#ready-made-applets): pages written and checked here, which Fox
// adds at once instead of writing one. Each is offered when the person's words name its place.
export interface ReadyApplet {key:string;title:string;blurb:string;color:string;html:string;
 /** What it is for, as Fox's guidance names it. */
 about:string}
export const READY_APPLETS:readonly ReadyApplet[]=Object.freeze([
 {key:'getty-center',title:'Getty Center 导览',blurb:'电车、四座展馆、中央花园和想看的作品',color:'#d4aa56',html:getty,about:'a day at the Getty Center in Los Angeles: the campus as a miniature map with numbered stops, Fox saying what is now, timed stops with Done and Undo, artworks to turn over when seen, tips'},
]);
export const readyApplet=(key:unknown)=>READY_APPLETS.find(applet=>applet.key===key)??null;
