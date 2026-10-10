import {LANDMARK_KEYS} from '../ui/world/village/region-landmarks.ts';
import path from 'node:path';
import sharp from 'sharp';
import {deviceSource,paintedBox} from './build-world-assets.ts';
import {WORLD_LAYOUT} from '../ui/world/world-layout.ts';
import {BUILTIN_STYLE} from '../ui/components/style.ts';

// The website shows one still, overview-level world. It never enters Focus,
// never draws Fox and never zooms past the region camera, so it does not need
// the native payload's focus scenery, companion frames or full-resolution
// plates — that bundle is 45MB, which no landing page can open on first paint.
// Re-encoding the same sources at the sizes the page actually renders keeps the
// identical payload shape and brings it near a megabyte.
const PLATE_WIDTH=WORLD_LAYOUT.coordinateSpace.width;
// A device draws at ~64 world units, up to ~2.25x region zoom on a 2x display.
const DEVICE_WIDTH=320;

const dataUri=(buffer:Buffer)=>'data:image/webp;base64,'+buffer.toString('base64');

export async function webWorldAssetsSource(root:string){
 const {WORLD_APPS}=await import('../core/applets/catalog.ts');
 const {MOMENT_ART}=await import('../core/applets/moment.ts');
 const plate=async(file:string,quality:number)=>dataUri(await sharp(path.join(root,file)).resize({width:PLATE_WIDTH,withoutEnlargement:true}).webp({quality,effort:6}).toBuffer());
 // The night plate stays in: village lighting refuses to start without it, and
 // keeping it means ui/world/ needs no website-only branch.
 const payload={landmarks:{},landmarkNights:{},surroundings:await plate(WORLD_LAYOUT.plates.day,80),night:await plate(WORLD_LAYOUT.plates.night,72),devices:{},deviceBoxes:{},logos:{},focus:{},open:{},regions:{},studies:[]};
 for(const key of LANDMARK_KEYS)for(const [target,phase] of [['landmarks','day'],['landmarkNights','night']])payload[target][key]=dataUri(await sharp(path.join(root,BUILTIN_STYLE.landmarks[key][phase])).resize({width:384,withoutEnlargement:true}).webp({quality:90,alphaQuality:100}).toBuffer());
 // Every catalog Applet's device, and the one every moment Applet stands on (core/widgets/README.md).
 const DEVICE_ART=[...WORLD_APPS.map(({key})=>({key})),{key:MOMENT_ART}];
 for(const applet of DEVICE_ART){const device=await sharp(deviceSource(root,applet.key)).resize({width:DEVICE_WIDTH,withoutEnlargement:true}).webp({quality:84,alphaQuality:92,effort:6}).toBuffer();payload.devices[applet.key]=dataUri(device);payload.deviceBoxes[applet.key]=await paintedBox(device);}
 return 'globalThis.__WORLDLET_25D_ASSETS__='+JSON.stringify(payload)+';';
}
