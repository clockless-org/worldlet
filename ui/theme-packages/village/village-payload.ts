import art from './assets/art.json' with {type:'json'};
import lamps from './lamps.json' with {type:'json'};
/** The Village's art as its World code reads it: every picture at the URL the host publishes it under (the Theme
 * contract's `asset`). `assets/art.json` indexes the files (scripts/village-art.ts writes them). */
export interface VillagePayload {
 surroundings:string;night:string;hiresDay:string;hiresNight:string;
 landmarks:Record<string,string>;landmarkNights:Record<string,string>;
 devices:Record<string,string>;deviceBoxes:Record<string,number[]>;logos:Record<string,string>;
 focus:Record<string,{image:string;framing?:string;subjectLeft?:number;logo?:number[]}>;
 areaViews:Record<string,never>;regions:Record<string,never>;studies:never[];
}
let current:VillagePayload|null=null;
export function publishVillageArt(asset:(path:string)=>string):VillagePayload{
 const url=(file:string)=>asset('assets/'+file),each=<T,R>(map:Record<string,T>,f:(v:T)=>R)=>Object.fromEntries(Object.entries(map).map(([k,v])=>[k,f(v)]));
 current={surroundings:url(art.world.day),night:url(art.world.night),hiresDay:'',hiresNight:'',
  landmarks:each(art.landmarks,l=>url(l.day)),landmarkNights:each(art.landmarks,l=>url(l.night)),
  devices:each(art.devices,d=>url(d.src)),deviceBoxes:each(art.devices,d=>[...d.box]),logos:each(art.logos as Record<string,string>,url),
  focus:each(art.focus as VillageArtFocus,f=>({...f,image:url(f.image)})),areaViews:{},regions:{},studies:[]};
 return current;
}
type VillageArtFocus=Record<string,{image:string;framing?:string;subjectLeft?:number;logo?:number[]}>;
/** The art published for the World now showing. */
export function villagePayload():VillagePayload{if(!current)throw Error('Village art is not published');return current;}
/** Where each device's lamp sits (applet-lamps.json, the host's copy; scripts/applet-lamp-check.ts keeps them equal). */
export const villageLamps=lamps.applets as unknown as Record<string,{center:[number,number];radius:[number,number]}>;
