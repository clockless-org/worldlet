import type {Rectangle} from 'pixi.js';

/** Pixi transforms filterArea from container-local coordinates into screen space. */
export function viewportFilterArea(area:Rectangle,view:{x:number;y:number;scale:number},width:number,height:number){
 area.x=-view.x/view.scale;area.y=-view.y/view.scale;
 area.width=width/view.scale;area.height=height/view.scale;
 return area;
}
