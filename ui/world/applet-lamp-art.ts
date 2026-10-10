import registry from '../../resources/styles/builtin/applet-lamps.json' with {type:'json'};
import {Sprite,Texture} from 'pixi.js';
import {ACTIVE_THEME,themeAppletArt,type ThemeDeviceFeature} from '../themes/index.ts';
import {deviceFeature} from './village/device-feature.ts';
import {lampSurface,LAMP_SURFACE_EXTENT} from './applet-lamp-surface.ts';
const lampTextures=new Map<number,Texture>();
import {lampColors,lampOpacity,type LampState} from './applet-lamp.ts';
export {lampColors,lampOpacity,type LampState} from './applet-lamp.ts';
export function lampAnchor(key:string):ThemeDeviceFeature|undefined{
 return ACTIVE_THEME.pack.id==='village'?registry.applets[key] as ThemeDeviceFeature|undefined:ACTIVE_THEME.pack.applets.deviceEffects?.[themeAppletArt(ACTIVE_THEME,key).peek]?.lamp;
}
// Child coordinates are texture pixels, including the sprite anchor. The same
// transform follows foot alignment, camera zoom, foreground scale and motion.
export function attachAppletLamp(sprite:Sprite,key:string,art=lampAnchor(key)){
 if(!art)return null;
 const g=new Sprite(Texture.EMPTY);g.anchor.set(.5);g.eventMode='none';sprite.addChild(g);let state:LampState='off';
 const {x,y,rx:radiusX,ry:radiusY}=deviceFeature(sprite,art),rx=radiusX*.88,ry=radiusY*.88;
 g.position.set(x,y);g.alpha=0;
 return {update(next:LampState,now:number,reduced:boolean){if(next!==state){state=next;
  if(next!=='off'){const color=lampColors[next];let texture=lampTextures.get(color);if(!texture){texture=Texture.from(lampSurface(color).canvas);lampTextures.set(color,texture);}g.texture=texture;g.width=rx*2*LAMP_SURFACE_EXTENT;g.height=ry*2*LAMP_SURFACE_EXTENT;}
 }g.alpha=lampOpacity(next,now,reduced);},get metrics(){const p=sprite.toGlobal({x,y});let visible=g.alpha>0;for(let node:any=sprite;node;node=node.parent)visible=visible&&node.visible;return {state,x:p.x,y:p.y,alpha:g.alpha,visible};}};
}
