import {villageLightingState} from './village-lighting-state.ts';
import {createVillageLighting} from './village-lighting.ts';
import {createVillageAmbience,VILLAGE_WATER_PATH} from './village-ambience.ts';
import {villageCamera,approachVillageCamera,OVERVIEW_CENTER} from './village-camera.ts';
import {VILLAGE_SITES} from './village-sites.ts';

/** The Village World's camera, light, ambient motion and the sites devices stand on. Entering an area opens its panel;
 * the World does not zoom into it. */
export const VILLAGE_SCENE={
 camera:villageCamera,approachCamera:approachVillageCamera,overviewCenter:OVERVIEW_CENTER,sites:VILLAGE_SITES,
 lightingState:villageLightingState,createLighting:createVillageLighting,createAmbience:createVillageAmbience,
 /** Where work glints run while Applets work (work-motion.ts): Village's river. */
 workPath:VILLAGE_WATER_PATH,
 areaZoom:false
};
