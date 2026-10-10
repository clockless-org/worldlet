import space from './space.json' with {type:'json'};
/** Where each catalog Applet stands by default, as the host's ui/world/applet-sprites.ts places it. */
export const APPLET_SPRITES:Record<string,{region:string|null;anchor:number[];width:number}>=space.sprites as any;
