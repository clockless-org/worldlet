import {ColorMatrixFilter} from 'pixi.js';
import {STYLE_TOKENS} from '../components/index.ts';
// Scenery only. Keep native texture resolution and never grade Applets/HUD here.
export function createSceneryTone(){
 const tone=new ColorMatrixFilter({resolution:'inherit'});
 tone.saturate(STYLE_TOKENS.sceneryTone.saturation,true);
 tone.contrast(STYLE_TOKENS.sceneryTone.contrast,true);
 return tone;
}
