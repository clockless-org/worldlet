import {villageLamps,villagePayload} from './village-payload.ts';
/** How the Village draws an Applet's device: its picture, its painted box (left, top, right, bottom, width, height in
 * image pixels) and where its lamp sits (centre and radius as fractions of the picture). */
export interface VillageDevice {src:string;box?:readonly number[];lamp?:{center:readonly [number,number];radius:readonly [number,number]}}
/** The Village's own device art for an Applet key (assets/art.json and lamps.json). An Applet it has no art for stands
 * as the generic notebook. */
export function villageDevice(key:string):VillageDevice|undefined{
 const payload=villagePayload(),own=payload.devices[key]?key:'apple-notes',src=payload.devices[own];if(typeof src!=='string')return undefined;
 const box=payload.deviceBoxes[own],lamp=villageLamps[own];
 return {src,...(box?{box}:{}),...(lamp?{lamp:{center:lamp.center,radius:lamp.radius}}:{})};
}
