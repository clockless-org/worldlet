import {anatomyArmVertex} from './fox-anatomy.ts';
import type {RigPoint,RigMatrix} from './fox-anatomy.ts';
import definition from '../../resources/styles/builtin/drafts/fox-states-v1/search-rig.json' with {type:'json'};
export const SEARCH_PROP={...definition,grip:definition.grip as unknown as RigPoint,paw:definition.paw as unknown as RigPoint};
/** Preserve the dock painting's aspect ratio; the groove meets the parked
 * handle tip. Its registration belongs to the draft style resource pack. */
export function searchDockVertex(point:RigPoint,size:RigPoint):RigPoint{
 const d=SEARCH_PROP.dock;
 return [d.worldAnchor[0]+(point[0]-d.sourceAnchor[0])*d.width,d.worldAnchor[1]+(point[1]-d.sourceAnchor[1])*d.width*size[1]/size[0]];
}
/** Rigid prop frame derived from the actual skinned paw tangent, not a raw
 * wrist matrix which would drift away from the continuous arm skin. */
export function searchPropVertex(point:RigPoint,matrices:ReadonlyMap<string,RigMatrix>):RigPoint{
 const {grip,paw,scale}=SEARCH_PROP,a=anatomyArmVertex('R',paw,matrices),b=anatomyArmVertex('R',[paw[0],paw[1]+.001],matrices);
 const angle=Math.atan2(b[1]-a[1],b[0]-a[0]),c=Math.cos(angle),s=Math.sin(angle),x=(point[0]-grip[0])*scale,y=(point[1]-grip[1])*scale;
 return [a[0]+c*x-s*y,a[1]+s*x+c*y];
}
export function registerSearchProp(image:HTMLImageElement){
 const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;canvas.getContext('2d')!.drawImage(image,0,0);
 return {texture:{canvas,x:0,y:0},size:[image.width,image.height] as RigPoint,dispose(){canvas.width=canvas.height=1;}};
}
