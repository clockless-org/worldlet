import {ColorMatrixFilter} from 'pixi.js';
import {SCENERY_TONE} from './village-pack.ts';
// Scenery only. Keep native texture resolution and never grade Applets/HUD here.
export function createSceneryTone(){
 const tone=new ColorMatrixFilter({resolution:'inherit'});
 tone.saturate(SCENERY_TONE.saturation,true);
 tone.contrast(SCENERY_TONE.contrast,true);
 return tone;
}
