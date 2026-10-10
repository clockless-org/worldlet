import {Sprite,Texture} from 'pixi.js';
import {deviceFeature} from './device-feature.ts';
import {lampSurface,LAMP_SURFACE_EXTENT} from '../applet-lamp-surface.ts';
import type {DeviceFeature} from './village-pack.ts';

/** The lamp states and their look, as the host's own lamps (ui/world/applet-lamp.ts) show them; scripts/applet-lamp-check.ts
 * keeps them equal to the host's. */
export type LampState='off'|'ready'|'processing'|'error';
export const lampColors={off:0x171c19,ready:0xffffff,processing:0xffffff,error:0xff4141};
export const LAMP_BREATH_MS=2400;
export function lampOpacity(state:LampState,now:number,reduced=false){return state==='off'?0:state==='ready'?.85:state==='processing'&&!reduced?.65-.35*Math.cos(now/LAMP_BREATH_MS*Math.PI*2):1;}
const lampTextures=new Map<number,Texture>();
// Child coordinates are texture pixels, including the sprite anchor. The same
// transform follows foot alignment, camera zoom, foreground scale and motion.
/** The lamp painted on a device, where the host says it sits (world-renderer.ts WorldMark.lamp). */
export function attachAppletLamp(sprite:Sprite,art:DeviceFeature|undefined){
 if(!art)return null;
 const g=new Sprite(Texture.EMPTY);g.anchor.set(.5);g.eventMode='none';sprite.addChild(g);let state:LampState='off';
 const {x,y,rx:radiusX,ry:radiusY}=deviceFeature(sprite,art),rx=radiusX*.88,ry=radiusY*.88;
 g.position.set(x,y);g.alpha=0;
 return {update(next:LampState,now:number,reduced:boolean){if(next!==state){state=next;
  if(next!=='off'){const color=lampColors[next];let texture=lampTextures.get(color);if(!texture){texture=Texture.from(lampSurface(color).canvas);lampTextures.set(color,texture);}g.texture=texture;g.width=rx*2*LAMP_SURFACE_EXTENT;g.height=ry*2*LAMP_SURFACE_EXTENT;}
 }g.alpha=lampOpacity(next,now,reduced);},get metrics(){const p=sprite.toGlobal({x,y});let visible=g.alpha>0;for(let node:any=sprite;node;node=node.parent)visible=visible&&node.visible;return {state,x:p.x,y:p.y,alpha:g.alpha,visible};}};
}
