import type {Sprite} from 'pixi.js';
import type {DeviceFeature} from './village-pack.ts';

/** Texture frame offsets retain the same feature when an Area trims transparent padding. */
export function deviceFeature(sprite:Sprite,feature:DeviceFeature){
 const {source,frame}=sprite.texture;
 return {x:feature.center[0]*source.width-frame.x-sprite.anchor.x*frame.width,
  y:feature.center[1]*source.height-frame.y-sprite.anchor.y*frame.height,
  rx:feature.radius[0]*source.width,ry:feature.radius[1]*source.height};
}
