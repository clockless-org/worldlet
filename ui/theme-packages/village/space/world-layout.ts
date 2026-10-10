import space from './space.json' with {type:'json'};
type Place={id:string;anchor:number[];maxSize?:number[];surface?:string};
type Area={title:string;center:number[];label:number[];bounds:number[];placements:Place[];slots:Record<string,{anchor:number[];width:number;surface?:string;slotId:string}>};
/** The Village's space as the host lays it out (scripts/village-space.ts writes space.json): its areas, slots and camera
 * (THEME_WORLD), and each area's places and default Applet sites (WORLD_LAYOUT). */
export const THEME_WORLD:any=space.world;
export const WORLD_LAYOUT:{regions:Record<string,Area>;worldSlots:Record<string,unknown>}&Record<string,any>=space.layout as any;
