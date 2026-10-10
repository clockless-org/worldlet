import {Container,Sprite} from 'pixi.js';
import {WORLD_EXTENT} from './village-camera.ts';
// Full-canvas day/night coordinates; never reuse the retired map's affine crop.
export async function createRegisteredPlate(baseTexture,highSource,image){
 const layer=new Container(),texture=highSource?await image(highSource):baseTexture;
 const sprite=new Sprite(texture||baseTexture);
 sprite.position.set(WORLD_EXTENT.x,WORLD_EXTENT.y);
 sprite.width=WORLD_EXTENT.width;sprite.height=WORLD_EXTENT.height;
 layer.addChild(sprite);return layer;
}
